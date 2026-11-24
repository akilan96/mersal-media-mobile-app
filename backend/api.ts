import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import express, { type ErrorRequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { defaultEventTypes, maxGalleryLinksPerCreate, themeNames, type AccountRole, type StudioData } from '../src/domain/types';
import { addPhotoGallery, assertStudioData, isClientPhone, isGoogleDriveLink, phoneDigits, putEvent, removeClient } from '../src/domain/validation';
import { balanceAmount, eventSummary, upcomingEvents } from '../src/domain/helpers';
import { StoreError, type StudioStore } from './store';
import type { createDriveReader } from './drive';

class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
  });
}
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const stamp = () => new Date().toISOString();
const statuses = z.enum(['Scheduled', 'Editing', 'Completed', 'Cancelled']);
const name = z.string().trim().min(1).max(100);
const username = z.string().trim().regex(/^[a-zA-Z0-9_.-]{3,40}$/).transform(value => value.toLowerCase());
const password = z.string().min(12).max(128);
const pin = z.string().regex(/^\d{4}$/, 'Enter exactly four digits.');
const managedAccount = z.object({ username, name, pin, role: z.enum(['admin', 'client']) });
const phone = z.string().trim().max(25).refine(value => value === '' || isClientPhone(value));
const email = z.union([z.literal(''), z.email().max(150)]).default('');
const profileFields = z.object({ name, studioName: name, phone: phone.default(''), email });
const clientInput = z.object({ name, phone: phone.default(''), email, notes: z.string().trim().max(2000).default('') });
const clientContact = z.object({ name: z.string().trim().max(100).default(''), phone: phone.refine(Boolean) });
const eventFields = z.object({
  title: z.string().trim().min(1).max(180), date: z.iso.datetime({ offset: true }),
  location: z.string().trim().min(1).max(250), attendees: z.number().int().min(0).max(99_999_999).default(0),
  type: z.string().trim().min(1).max(60), status: statuses.default('Scheduled'), clientId: z.uuid().optional(),
  crew: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  equipment: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  totalAmount: z.number().min(0).max(1e10), notes: z.string().trim().max(3000).default(''),
});
const onlyProvided = <T extends object>(parsed: T, body: object): Partial<T> =>
  Object.fromEntries(Object.entries(parsed).filter(([key]) => Object.hasOwn(body, key))) as Partial<T>;
const credentials = z.object({ username, password });
const createAccount = credentials.extend({ profile: profileFields, joinCode: z.string().max(256).optional() });
const receipt = z.object({ amount: z.number().positive(), note: z.string().trim().min(1).max(200).default('Payment received') });
const theme = z.union([z.enum(themeNames), z.literal('pancake')]);

export function createExpressApi(store: StudioStore, app = express(), sharedSignup?: {
  joinCode?: string; pinMode?: boolean; ownerUsername?: string; drive?: ReturnType<typeof createDriveReader>;
}) {
  const ownerUsername = sharedSignup?.ownerUsername?.trim().toLowerCase();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '64kb' }));
  const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Try again later.' } });
  const api = express.Router();
  app.use('/api/v1', api);
  api.get('/health', async (_req, res) => { await store.ping(); res.json({ status: 'ok' }); });
  api.get('/auth/config', (_req, res) => res.json({ pinMode: Boolean(sharedSignup?.pinMode) }));

  function authInput(body: unknown) {
    if (!sharedSignup?.pinMode) return credentials.parse(body);
    return z.object({ username, pin }).parse(body);
  }

  function issueSession(studioId: string) {
    const token = randomBytes(32).toString('base64url');
    const expires = Date.now() + 7 * 24 * 60 * 60_000;
    return {
      response: { token, expiresAt: new Date(expires).toISOString() },
      record: { hash: tokenHash(token), studioId, expires },
    };
  }

  api.post('/auth/register', authLimit, async (req, res) => {
    if (ownerUsername) throw new ApiError(403, 'Ask the studio owner to create your account.');
    const auth = authInput(req.body);
    const input = { ...createAccount.pick({ profile: true, joinCode: true }).parse(req.body), ...auth };
    if (sharedSignup) {
      const secret = sharedSignup.joinCode;
      if (!secret || secret.length < 20) throw new ApiError(403, 'Contact your studio to request an account.');
      if (!input.joinCode || !timingSafeEqual(Buffer.from(tokenHash(input.joinCode)), Buffer.from(tokenHash(secret)))) {
        throw new ApiError(403, 'Enter the studio join code.');
      }
    }
    const id = randomUUID();
    let credential;
    if ('pin' in auth) credential = { pin: auth.pin };
    else {
      const salt = randomBytes(16).toString('hex');
      credential = { salt, passwordHash: (await scryptAsync(auth.password, salt)).toString('hex') };
    }
    const profile = { ...input.profile, username: input.username };
    const data: StudioData = { version: 1, profile, events: [], clients: [] };
    const session = issueSession(id);
    const created = await store.register({ id, username: input.username, ...credential, data }, session.record);
    if (!created) throw new ApiError(409, 'Username is already in use.');
    res.status(201).json({ ...session.response, profile });
  });

  api.post('/auth/login', authLimit, async (req, res) => {
    const input = authInput(req.body);
    if (sharedSignup?.pinMode && !await store.claimPinAttempt?.(input.username)) {
      throw new ApiError(429, 'Too many PIN attempts. Try again in 15 minutes.');
    }
    const row = await store.findCredentials(input.username);
    if ('pin' in input) {
      const saved = row && 'pin' in row && /^\d{4}$/.test(row.pin) ? row.pin : null;
      if (!timingSafeEqual(Buffer.from(input.pin), Buffer.from(saved ?? '0000')) || saved === null || !row) {
        throw new ApiError(401, 'Username or PIN is incorrect.');
      }
    } else {
      const saved = row && 'passwordHash' in row ? row : null;
      const supplied = await scryptAsync(input.password, saved?.salt ?? 'mersal-auth-fallback');
      const expected = saved ? Buffer.from(saved.passwordHash, 'hex') : Buffer.alloc(64);
      if (!timingSafeEqual(supplied, expected) || !saved) throw new ApiError(401, 'Username or password is incorrect.');
    }
    if (!row) throw new ApiError(401, 'Sign-in failed.');
    if (sharedSignup?.pinMode) await store.clearPinAttempts?.(input.username);
    const session = issueSession(row.id);
    await store.createSession(session.record);
    res.json(session.response);
  });

  api.use(async (req, res, next) => {
    const token = req.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/i)?.[1];
    if (!token) throw new ApiError(401, 'Sign in to continue.');
    const hash = tokenHash(token);
    if (ownerUsername) {
      const account = await store.findAccountSession?.(hash, Date.now());
      if (!account) throw new ApiError(401, 'Session expired or invalid.');
      const role: AccountRole = account.username === ownerUsername ? 'owner' : account.role;
      res.locals.account = { username: account.username, name: account.name, role };
      res.locals.clientId = account.clientId;
      res.locals.studioId = 'shared';
      const galleryRead = /^\/client\/galleries(?:\/[^/]+\/(?:summary|photos(?:\/[^/]+\/thumbnail)?))?$/.test(req.path);
      const favouriteWrite = req.method === 'PUT' && /^\/client\/galleries\/[^/]+\/photos\/[^/]+\/favourite$/.test(req.path);
      if (role === 'client' && !favouriteWrite && !(req.method === 'GET' && (galleryRead || ['/auth/me', '/client/payment-summary', '/client/photo-summary'].includes(req.path)))
        && !(req.method === 'POST' && req.path === '/auth/logout')) {
        throw new ApiError(403, 'This account can only access the client area.');
      }
    } else {
      const studioId = await store.findSession(hash, Date.now());
      if (!studioId) throw new ApiError(401, 'Session expired or invalid.');
      res.locals.studioId = studioId;
      res.locals.account = { role: 'admin' };
    }
    res.locals.sessionHash = hash;
    next();
  });

  async function load(res: Response) {
    const row = await store.load(res.locals.studioId);
    if (!row) throw new ApiError(401, 'Studio account is unavailable.');
    assertStudioData(row.data);
    return row;
  }

  async function update<T>(res: Response, change: (data: StudioData) => { data: StudioData; result: T }): Promise<T> {
    const current = await load(res);
    const next = change(current.data);
    try { assertStudioData(next.data); }
    catch (cause) { throw new ApiError(422, cause instanceof Error ? cause.message : 'Invalid studio record.'); }
    if (!(await store.save(res.locals.studioId, current.revision, next.data, current.data))) {
      throw new ApiError(409, 'The studio changed. Reload and try again.');
    }
    return next.result;
  }

  function eventById(data: StudioData, id: string) {
    const event = data.events.find(item => item.id === id);
    if (!event) throw new ApiError(404, 'Event not found.');
    return event;
  }

  function saveEvent(data: StudioData, event: Parameters<typeof putEvent>[1], id: string, createdAt: string) {
    try { return putEvent(data, event, id, createdAt); }
    catch (cause) { throw new ApiError(422, cause instanceof Error ? cause.message : 'Invalid event.'); }
  }

  api.post('/auth/logout', async (_req, res) => {
    await store.revokeSession(res.locals.sessionHash);
    res.sendStatus(204);
  });
  api.get('/auth/me', (_req, res) => res.json(res.locals.account));
  async function clientGalleries(res: Response) {
    if (res.locals.account.role !== 'client') throw new ApiError(403, 'This endpoint is for client accounts.');
    const clientId = res.locals.clientId;
    if (!clientId) return [];
    const { data } = await load(res);
    return (data.photoGalleries ?? []).filter(gallery => gallery.clientId === clientId);
  }

  async function clientGallery(res: Response, id: string) {
    const gallery = (await clientGalleries(res)).find(item => item.id === id);
    if (!gallery) throw new ApiError(404, 'Gallery not found.');
    return gallery;
  }

  api.get('/client/galleries', async (_req, res) => {
    const galleries = (await clientGalleries(res)).map(({ id, driveLink, createdAt }) => ({ id, driveLink, createdAt }));
    res.json({ galleries, previewsEnabled: Boolean(sharedSignup?.drive) });
  });
  api.get('/client/galleries/:id/summary', async (req, res) => {
    const gallery = await clientGallery(res, req.params.id);
    const drive = sharedSignup?.drive;
    if (!drive) throw new ApiError(503, 'In-app Drive previews are not configured.');
    const total = await drive.count(gallery.driveLink, req.query.favourites === 'true');
    res.json({ total });
  });
  api.get('/client/photo-summary', async (_req, res) => {
    const galleries = await clientGalleries(res);
    const drive = sharedSignup?.drive;
    if (galleries.length && !drive) throw new ApiError(503, 'In-app Drive previews are not configured.');
    const photos = new Set<string>();
    const selected = new Set<string>();
    for (const { driveLink } of galleries) {
      const summary = await drive!.summary(driveLink);
      for (const id of summary.photos) photos.add(id);
      for (const id of summary.selected) { photos.add(id); selected.add(id); }
    }
    res.json({ total: photos.size, selected: selected.size });
  });
  api.get('/client/galleries/:id/photos', async (req, res) => {
    const gallery = await clientGallery(res, req.params.id);
    const pageToken = z.string().max(4096).optional().parse(req.query.pageToken);
    const drive = sharedSignup?.drive;
    if (!drive) throw new ApiError(503, 'In-app Drive previews are not configured.');
    res.json(await drive.list(gallery.driveLink, pageToken, req.query.favourites === 'true'));
  });
  api.put('/client/galleries/:id/photos/:fileId/favourite', async (req, res) => {
    const gallery = await clientGallery(res, req.params.id);
    const { selected } = z.object({ selected: z.boolean() }).parse(req.body);
    const drive = sharedSignup?.drive;
    if (!drive) throw new ApiError(503, 'In-app Drive previews are not configured.');
    await drive.setFavourite(gallery.driveLink, req.params.fileId, selected);
    res.sendStatus(204);
  });
  api.get('/client/galleries/:id/photos/:fileId/thumbnail', async (req, res) => {
    const gallery = await clientGallery(res, req.params.id);
    const drive = sharedSignup?.drive;
    if (!drive) throw new ApiError(503, 'In-app Drive previews are not configured.');
    const nameHint = typeof req.query.name === 'string' && req.query.name.length <= 512 ? req.query.name : undefined;
    const photo = await drive.thumbnail(gallery.driveLink, req.params.fileId, req.query.size === 'large', nameHint);
    res.set('X-Content-Type-Options', 'nosniff').type(photo.contentType).send(photo.bytes);
  });
  api.get('/client/payment-summary', async (_req, res) => {
    if (res.locals.account.role !== 'client') throw new ApiError(403, 'This endpoint is for client accounts.');
    const clientId = res.locals.clientId;
    if (!clientId) { res.json(null); return; }
    const { data } = await load(res);
    if (!data.clients.some(client => client.id === clientId)) { res.json(null); return; }
    let total = 0;
    let pending = 0;
    for (const event of data.events) {
      if (event.clientId !== clientId || event.status === 'Cancelled') continue;
      total += Math.round(event.totalAmount * 100);
      pending += Math.round(balanceAmount(event) * 100);
    }
    res.json({ total: total / 100, pending: pending / 100 });
  });
  api.use('/accounts', (_req, res, next) => {
    if (res.locals.account.role !== 'owner') throw new ApiError(403, 'Only the studio owner can manage accounts.');
    next();
  });
  api.get('/accounts', async (_req, res) => {
    if (!store.listManagedAccounts) throw new ApiError(503, 'Account management is unavailable.');
    res.json((await store.listManagedAccounts()).filter(account => account.username !== ownerUsername));
  });
  api.post('/accounts', async (req, res) => {
    if (!store.createManagedAccount) throw new ApiError(503, 'Account management is unavailable.');
    const { username, name, pin, role } = managedAccount.parse(req.body);
    if (!username) throw new ApiError(422, 'Enter a username.');
    if (username === ownerUsername || !await store.createManagedAccount(randomUUID(), { username, name, pin, role })) {
      throw new ApiError(409, 'Username is already in use.');
    }
    res.status(201).json({ username, name, role });
  });
  api.patch('/accounts/:username', async (req, res) => {
    if (!store.updateManagedAccount) throw new ApiError(503, 'Account management is unavailable.');
    const current = username.parse(req.params.username);
    const { username: nextUsername, name, role, pin } = managedAccount.partial({ pin: true }).parse(req.body);
    if (current === ownerUsername) throw new ApiError(403, 'The studio owner account is protected.');
    if (!nextUsername) throw new ApiError(422, 'Enter a username.');
    if (nextUsername === ownerUsername) throw new ApiError(409, 'Username is already in use.');
    const account = await store.updateManagedAccount(current, { username: nextUsername, name, role, pin });
    if (!account) throw new ApiError(404, 'Account not found.');
    res.json(account);
  });
  api.delete('/accounts/:username', async (req, res) => {
    if (!store.deleteManagedAccount) throw new ApiError(503, 'Account management is unavailable.');
    const current = username.parse(req.params.username);
    if (current === ownerUsername) throw new ApiError(403, 'The studio owner account is protected.');
    if (!await store.deleteManagedAccount(current)) throw new ApiError(404, 'Account not found.');
    res.sendStatus(204);
  });
  api.patch('/accounts/:username/client', async (req, res) => {
    if (!store.linkClientAccount) throw new ApiError(503, 'Account management is unavailable.');
    const accountUsername = username.parse(req.params.username);
    const { clientId } = z.object({ clientId: z.uuid() }).parse(req.body);
    const { data } = await load(res);
    if (!data.clients.some(client => client.id === clientId)) throw new ApiError(422, 'Choose an existing client.');
    if (accountUsername === ownerUsername || !await store.linkClientAccount(accountUsername, clientId)) {
      throw new ApiError(404, 'Client account not found.');
    }
    res.json({ clientId });
  });
  api.get('/studio', async (_req, res) => {
    const { data, revision } = await load(res);
    res.json({ data, revision });
  });
  api.get('/profile', async (_req, res) => { res.json((await load(res)).data.profile); });
  api.patch('/profile', async (req, res) => {
    const input = onlyProvided(profileFields.partial().parse(req.body), req.body);
    res.json(await update(res, data => {
      const profile = { ...data.profile!, ...input };
      return { data: { ...data, profile }, result: profile };
    }));
  });

  api.get('/dashboard', async (_req, res) => {
    const events = (await load(res)).data.events.filter(event => !event.inactive);
    const upcoming = upcomingEvents(events);
    res.json({
      total: events.filter(event => event.status !== 'Cancelled').length, upcoming: upcoming.length,
      completed: events.filter(event => event.status === 'Completed').length,
      editing: events.filter(event => event.status === 'Editing').length, upcomingEvents: upcoming.slice(0, 3),
    });
  });

  api.get('/clients', async (_req, res) => { res.json((await load(res)).data.clients); });
  api.get('/clients/:id', async (req, res) => {
    const { data } = await load(res);
    const client = data.clients.find(item => item.id === req.params.id);
    if (!client) throw new ApiError(404, 'Client not found.');
    res.json({ client, events: data.events.filter(event => event.clientId === client.id) });
  });
  api.post('/clients', async (req, res) => {
    const client = { ...clientInput.parse(req.body), id: randomUUID(), createdAt: stamp() };
    res.status(201).json(await update(res, data => ({ data: { ...data, clients: [...data.clients, client] }, result: client })));
  });
  api.patch('/clients/:id', async (req, res) => {
    const input = onlyProvided(clientInput.partial().parse(req.body), req.body);
    res.json(await update(res, data => {
      const prior = data.clients.find(client => client.id === req.params.id);
      if (!prior) throw new ApiError(404, 'Client not found.');
      const client = { ...prior, ...input };
      return { data: { ...data, clients: data.clients.map(item => item.id === client.id ? client : item) }, result: client };
    }));
  });
  api.delete('/clients/:id', async (req, res) => {
    await update(res, data => {
      if (!data.clients.some(client => client.id === req.params.id)) throw new ApiError(404, 'Client not found.');
      if (data.events.some(event => event.clientId === req.params.id)) throw new ApiError(409, 'Unlink this client from events before deleting.');
      if (data.photoGalleries?.some(gallery => gallery.clientId === req.params.id)) throw new ApiError(409, 'This client is linked to a photo gallery.');
      return { data: removeClient(data, req.params.id), result: null };
    });
    res.sendStatus(204);
  });
  api.patch('/clients/:id/inactive', async (req, res) => {
    await update(res, data => {
      if (!data.clients.some(client => client.id === req.params.id)) throw new ApiError(404, 'Client not found.');
      return { data: { ...data, clients: data.clients.map(client => client.id === req.params.id ? { ...client, inactive: true } : client) }, result: null };
    });
    res.sendStatus(204);
  });
  api.patch('/clients/:id/active', async (req, res) => {
    await update(res, data => {
      if (!data.clients.some(client => client.id === req.params.id)) throw new ApiError(404, 'Client not found.');
      return { data: { ...data, clients: data.clients.map(client => client.id === req.params.id ? { ...client, inactive: false } : client) }, result: null };
    });
    res.sendStatus(204);
  });
  const galleryLink = z.string().trim().max(2048).refine(isGoogleDriveLink, 'Enter a valid Google Drive link.');
  const galleryInput = z.object({ clientId: z.uuid(), driveLink: galleryLink });
  api.post('/photo-galleries/batch', async (req, res) => {
    const { clientId, driveLinks } = z.object({
      clientId: z.uuid(),
      driveLinks: z.array(galleryLink).min(1).max(maxGalleryLinksPerCreate)
        .refine(links => new Set(links).size === links.length, 'Each Drive link must be different.'),
    }).parse(req.body);
    const createdAt = stamp();
    const galleries = driveLinks.map(driveLink => ({ id: randomUUID(), clientId, driveLink, createdAt }));
    res.status(201).json(await update(res, data => {
      if (!data.clients.some(client => client.id === clientId)) throw new ApiError(422, 'Choose an existing client.');
      return { data: galleries.reduce(addPhotoGallery, data), result: galleries };
    }));
  });
  api.post('/photo-galleries', async (req, res) => {
    const input = galleryInput.parse(req.body);
    const gallery = { ...input, id: randomUUID(), createdAt: stamp() };
    res.status(201).json(await update(res, data => {
      if (!data.clients.some(client => client.id === input.clientId)) throw new ApiError(422, 'Choose an existing client.');
      return { data: addPhotoGallery(data, gallery), result: gallery };
    }));
  });
  api.patch('/photo-galleries/:id', async (req, res) => {
    const input = galleryInput.parse(req.body);
    res.json(await update(res, data => {
      const prior = data.photoGalleries?.find(gallery => gallery.id === req.params.id);
      if (!prior) throw new ApiError(404, 'Gallery not found.');
      if (!data.clients.some(client => client.id === input.clientId)) throw new ApiError(422, 'Choose an existing client.');
      const gallery = { ...prior, ...input };
      return { data: addPhotoGallery(data, gallery), result: gallery };
    }));
  });
  api.delete('/photo-galleries/:id', async (req, res) => {
    await update(res, data => {
      const galleries = data.photoGalleries ?? [];
      if (!galleries.some(gallery => gallery.id === req.params.id)) throw new ApiError(404, 'Gallery not found.');
      return { data: { ...data, photoGalleries: galleries.filter(gallery => gallery.id !== req.params.id) }, result: null };
    });
    res.sendStatus(204);
  });

  api.get('/events', async (_req, res) => { res.json((await load(res)).data.events); });
  api.get('/events/:id', async (req, res) => { res.json(eventById((await load(res)).data, req.params.id)); });
  function resolveContact(data: StudioData, clientId: string | undefined, contact: z.infer<typeof clientContact> | undefined, createdAt: string) {
    if (!contact) return { snapshot: data, clientId };
    const matches = data.clients.filter(client => phoneDigits(client.phone) === phoneDigits(contact.phone));
    if (matches.length > 1) throw new ApiError(409, 'Multiple clients use this number. Choose a client ID.');
    if (matches.length === 1) return { snapshot: data, clientId: matches[0].id };
    const client = { ...clientInput.parse(contact), id: randomUUID(), createdAt };
    return { snapshot: { ...data, clients: [...data.clients, client] }, clientId: client.id };
  }
  api.post('/events', async (req, res) => {
    const { contact, advance, ...input } = eventFields.extend({ contact: clientContact.optional(), advance: z.number().nonnegative().default(0) }).parse(req.body);
    if (contact && input.clientId) throw new ApiError(422, 'Provide either a contact or a client ID.');
    const id = randomUUID();
    const createdAt = stamp();
    const result = await update(res, data => {
      const { snapshot, clientId } = resolveContact(data, input.clientId, contact, createdAt);
      const payments = advance > 0 ? [{ id: randomUUID(), amount: advance, note: 'Advance received', date: createdAt }] : [];
      const next = saveEvent(snapshot, { ...input, clientId, payments }, id, createdAt);
      return { data: next, result: eventById(next, id) };
    });
    res.status(201).json(result);
  });
  api.patch('/events/:id', async (req, res) => {
    const { clientId, contact, ...changes } = onlyProvided(eventFields.partial().extend({ clientId: z.uuid().nullable().optional(), contact: clientContact.optional() }).parse(req.body), req.body);
    res.json(await update(res, data => {
      const event = eventById(data, req.params.id);
      const linkedClient = clientId === undefined ? event.clientId : clientId ?? undefined;
      if (contact && clientId) throw new ApiError(422, 'Provide either a contact or a client ID.');
      const link = resolveContact(data, linkedClient, contact, stamp());
      const next = saveEvent(link.snapshot, { ...event, ...changes, clientId: link.clientId }, event.id, event.createdAt);
      return { data: next, result: eventById(next, event.id) };
    }));
  });
  api.patch('/events/:id/status', async (req, res) => {
    const { status } = z.object({ status: statuses }).parse(req.body);
    res.json(await update(res, data => {
      const event = eventById(data, req.params.id);
      const next = saveEvent(data, { ...event, status }, event.id, event.createdAt);
      return { data: next, result: eventById(next, event.id) };
    }));
  });
  api.post('/events/:id/payments', async (req, res) => {
    const payment = { ...receipt.parse(req.body), id: randomUUID(), date: stamp() };
    const event = await update(res, data => {
      const event = eventById(data, req.params.id);
      const next = saveEvent(data, { ...event, payments: [...event.payments, payment] }, event.id, event.createdAt);
      return { data: next, result: eventById(next, event.id) };
    });
    res.status(201).json(event);
  });
  api.get('/events/:id/record', async (req, res) => {
    const { data } = await load(res);
    const event = eventById(data, req.params.id);
    res.type('text/plain').send(eventSummary(event, data.clients.find(client => client.id === event.clientId)));
  });
  api.delete('/events/:id', async (req, res) => {
    await update(res, data => {
      const { id } = eventById(data, req.params.id);
      return { data: { ...data, events: data.events.filter(event => event.id !== id) }, result: null };
    });
    res.sendStatus(204);
  });
  api.patch('/events/:id/inactive', async (req, res) => {
    await update(res, data => {
      const event = eventById(data, req.params.id);
      return { data: { ...data, events: data.events.map(item => item.id === event.id ? { ...item, inactive: true } : item) }, result: null };
    });
    res.sendStatus(204);
  });

  api.get('/settings', async (_req, res) => {
    const { data } = await load(res);
    res.json({ theme: data.theme ?? 'light', hasHomePhoto: await store.hasPhoto(res.locals.studioId), eventTypes: [...defaultEventTypes, ...(data.customEventTypes ?? [])] });
  });
  api.patch('/settings', async (req, res) => {
    const input = z.object({ theme }).parse(req.body);
    res.json(await update(res, data => ({ data: { ...data, ...input }, result: input })));
  });
  const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
  api.get('/settings/home-photo', async (_req, res) => {
    const photo = await store.getPhoto(res.locals.studioId);
    if (!photo) throw new ApiError(404, 'No Home photo is saved.');
    res.set('X-Content-Type-Options', 'nosniff').type(photo.contentType).send(Buffer.from(photo.bytes));
  });
  api.put('/settings/home-photo', express.raw({ type: photoTypes, limit: '4mb' }), async (req, res) => {
    const contentType = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
    const bytes: unknown = req.body;
    if (!contentType || !photoTypes.includes(contentType) || !Buffer.isBuffer(bytes) || !bytes.length) {
      throw new ApiError(415, 'Send a JPEG, PNG, or WebP image as the request body.');
    }
    const matchesType = contentType === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : contentType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!matchesType) throw new ApiError(422, 'Image does not match its content type.');
    await store.savePhoto(res.locals.studioId, { contentType, bytes });
    res.sendStatus(204);
  });
  api.delete('/settings/home-photo', async (_req, res) => {
    await store.deletePhoto(res.locals.studioId);
    res.sendStatus(204);
  });

  api.get('/event-types', async (_req, res) => { res.json([...defaultEventTypes, ...((await load(res)).data.customEventTypes ?? [])]); });
  api.post('/event-types', async (req, res) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    const result = await update(res, data => {
      const custom = data.customEventTypes ?? [];
      if ([...defaultEventTypes, ...custom].some(value => value.toLowerCase() === name.toLowerCase())) throw new ApiError(409, 'That event type already exists.');
      return { data: { ...data, customEventTypes: [...custom, name] }, result: { name } };
    });
    res.status(201).json(result);
  });

  app.use((_req, res) => { res.status(404).json({ error: 'Endpoint not found.' }); });
  const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ApiError || error instanceof StoreError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof z.ZodError) {
      res.status(422).json({ error: 'Check the submitted fields.', fields: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) });
      return;
    }
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      res.status(error.status).json({ error: error.status === 413 ? 'Request body is too large.' : 'Invalid JSON body.' });
      return;
    }
    console.error('API request failed:', error instanceof Error ? error.name : 'unknown error');
    res.status(500).json({ error: 'Unable to complete the request.' });
  };
  app.use(errorHandler);
  return app;
}
