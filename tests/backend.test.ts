import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import express from 'express';
import { createExpressApi } from '../backend/api';
import { createApi, createSqliteStore } from '../backend/sqlite';

test('studio API persists private data and validates event and client workflows', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'mersal-api-'));
  const database = join(folder, 'studio.sqlite');
  async function start() {
    const api = createApi(database);
    const server = api.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    return {
      url: 'http://127.0.0.1:' + address.port + '/api/v1',
      stop: async () => {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        api.close();
      },
    };
  }
  let server = await start();
  async function request(method: string, path: string, expected: number, data?: unknown, token?: string) {
    const response = await fetch(server.url + path, {
      method,
      headers: {
        ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const body = await response.text();
    assert.equal(response.status, expected, body);
    return response.headers.get('content-type')?.includes('application/json') ? JSON.parse(body) : body;
  }
  try {
    const owner = { username: 'studio.owner', password: 'sample-test-password', profile: { name: 'Test Owner', studioName: 'Test Studio', phone: '+91 98765 43210' } };
    await request('GET', '/health', 200);
    await request('GET', '/events', 401);
    const { token } = await request('POST', '/auth/register', 201, owner);
    await request('POST', '/auth/register', 409, owner);
    await request('POST', '/auth/login', 401, { ...owner, password: 'invalid-test-password' });
    const { token: otherToken } = await request('POST', '/auth/register', 201, { ...owner, username: 'other.studio' });
    await request('PATCH', '/profile', 200, { name: 'New Owner' }, token);
    assert.equal((await request('GET', '/profile', 200, undefined, token)).phone, owner.profile.phone);

    const galleryClient = await request('POST', '/clients', 201, { name: 'Gallery Client' }, token);
    const galleryInput = { clientId: galleryClient.id, driveLink: 'https://drive.google.com/drive/folders/example' };
    await request('POST', '/photo-galleries', 422, { ...galleryInput, driveLink: 'https://drive.google.com.example.org/folder' }, token);
    await request('POST', '/photo-galleries', 422, galleryInput, otherToken);
    const gallery = await request('POST', '/photo-galleries', 201, galleryInput, token);
    assert.equal(gallery.driveLink, galleryInput.driveLink);
    await request('DELETE', '/clients/' + galleryClient.id, 409, undefined, token);

    await request('POST', '/event-types', 201, { name: 'Studio Launch' }, token);
    await request('POST', '/event-types', 409, { name: 'studio launch' }, token);
    await request('PATCH', '/settings', 200, { theme: 'forest' }, token);
    const payload = { title: 'Test shoot', date: '2030-01-01T10:00:00Z', location: 'Studio', type: 'Studio Launch', attendees: 12, crew: ['Photographer'], totalAmount: 500, advance: 100, contact: { name: 'Client One', phone: '+91 98765 43210' } };
    await request('POST', '/events', 422, { ...payload, advance: 600 }, token);
    assert.equal((await request('GET', '/clients', 200, undefined, token)).length, 1);
    const event = await request('POST', '/events', 201, payload, token);
    const sameClient = await request('POST', '/events', 201, { ...payload, contact: { phone: '+919876543210' } }, token);
    assert.equal(sameClient.clientId, event.clientId);
    assert.equal((await request('GET', '/clients', 200, undefined, token)).length, 2);
    await request('DELETE', '/clients/' + event.clientId, 409, undefined, token);
    await request('GET', '/events/' + event.id, 404, undefined, otherToken);
    assert.deepEqual(await request('GET', '/clients', 200, undefined, otherToken), []);

    await request('POST', '/events/' + event.id + '/payments', 422, { amount: 401 }, token);
    await request('POST', '/events/' + event.id + '/payments', 201, { amount: 400 }, token);
    await request('PATCH', '/events/' + event.id + '/status', 200, { status: 'Completed' }, token);
    const edited = await request('PATCH', '/events/' + event.id, 200, { title: 'Updated title' }, token);
    assert.equal(edited.status, 'Completed');
    assert.equal(edited.attendees, 12);
    assert.deepEqual(edited.crew, ['Photographer']);
    assert.equal(edited.payments.length, 2);
    assert.match(await request('GET', '/events/' + event.id + '/record', 200, undefined, token), /Updated title/);

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI3cAAAAASUVORK5CYII=', 'base64');
    const photo = await fetch(server.url + '/settings/home-photo', {
      method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'image/png' }, body: new Uint8Array(png),
    });
    assert.equal(photo.status, 204);
    const downloaded = await fetch(server.url + '/settings/home-photo', { headers: { Authorization: 'Bearer ' + token } });
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), png);
    await request('GET', '/settings/home-photo', 404, undefined, otherToken);
    await request('DELETE', '/settings/home-photo', 204, undefined, token);

    await server.stop();
    server = await start();
    assert.equal((await request('GET', '/studio', 200, undefined, token)).data.photoGalleries[0].id, gallery.id);
    assert.equal((await request('GET', '/settings', 200, undefined, token)).theme, 'forest');
    assert.equal((await request('GET', '/events/' + event.id, 200, undefined, token)).title, 'Updated title');
    await request('DELETE', '/events/' + event.id, 204, undefined, token);
    const relinked = await request('PATCH', '/events/' + sameClient.id, 200,
      { contact: { name: 'New contact', phone: '+91 98765 43211' } }, token);
    assert.notEqual(relinked.clientId, event.clientId);
    assert.equal((await request('GET', '/clients/' + relinked.clientId, 200, undefined, token)).client.name, 'New contact');
    await request('PATCH', '/events/' + sameClient.id, 200, { clientId: null }, token);
    await request('DELETE', '/clients/' + event.clientId, 204, undefined, token);
    const login = await request('POST', '/auth/login', 200, owner);
    await request('POST', '/auth/logout', 204, undefined, login.token);
    await request('GET', '/studio', 401, undefined, login.token);
  } finally {
    await server.stop();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('shared studio requires a join code and uses the same events for separate sessions', async () => {
  const { store, close } = createSqliteStore(':memory:');
  let sharedId: string | null = null;
  let attempts = 0;
  const pins = new Map<string, { id: string; pin: string }>();
  const joinCode = 'test-studio-invite-code';
  const app = createExpressApi({
    ...store,
    async register(account, session) {
      assert.ok('pin' in account);
      const { pin, ...details } = account;
      const created = await store.register({ ...details, salt: '', passwordHash: '' }, session);
      if (created) pins.set(details.username, { id: details.id, pin });
      return created;
    },
    findCredentials(username) { return pins.get(username) ?? null; },
    claimPinAttempt() { return ++attempts <= 5; },
    clearPinAttempts() { attempts = 0; },
    async findSession(hash, now) {
      const id = await store.findSession(hash, now);
      if (!id) return null;
      sharedId ??= id;
      return sharedId;
    },
  }, express(), { joinCode, pinMode: true });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port + '/api/v1';
    const post = (path: string, json: unknown, token?: string) => fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(json),
    });
    const account = { username: 'shared.owner', pin: '0314', profile: { name: 'Owner', studioName: 'Shared Studio' } };
    assert.equal((await post('/auth/register', account)).status, 403);
    const owner = await post('/auth/register', { ...account, joinCode });
    assert.equal(owner.status, 201);
    assert.equal((await post('/events', {
      title: 'Shared shoot', date: '2030-01-01T10:00:00Z', location: 'Studio', type: 'Portraits', totalAmount: 100,
    }, (await owner.json()).token)).status, 201);
    const member = await post('/auth/register', { ...account, username: 'shared.member', joinCode });
    assert.equal(member.status, 201);
    const events = await fetch(base + '/events', { headers: { Authorization: 'Bearer ' + (await member.json()).token } });
    assert.equal(events.status, 200);
    assert.deepEqual((await events.json()).map((event: { title: string }) => event.title), ['Shared shoot']);
    assert.equal((await post('/auth/login', { username: account.username, pin: '9999' })).status, 401);
    assert.equal((await post('/auth/login', { username: account.username, pin: account.pin })).status, 200);
    assert.equal(attempts, 0);
    for (let i = 0; i < 5; i++) {
      assert.equal((await post('/auth/login', { username: account.username, pin: '9999' })).status, 401);
    }
    assert.equal((await post('/auth/login', { username: account.username, pin: account.pin })).status, 429);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    close();
  }
});

test('owner creates admin and client accounts while clients cannot access studio records', async () => {
  const { store, close } = createSqliteStore(':memory:');
  const ownerData = { version: 1 as const, profile: { username: 'aki', name: 'Aki', studioName: 'Mersal Media', phone: '', email: '' }, events: [], clients: [] };
  const accounts = new Map<string, { id: string; name: string; pin: string; role: 'admin' | 'client' }>();
  const sessions = new Map<string, { id: string; expires: number }>();
  accounts.set('aki', { id: 'aki-id', name: 'Aki', pin: '1234', role: 'client' });
  const app = createExpressApi({
    ...store,
    claimPinAttempt: () => true,
    findCredentials(username) {
      const account = accounts.get(username);
      return account ? { id: account.id, pin: account.pin } : null;
    },
    createSession({ hash, studioId, expires }) { sessions.set(hash, { id: studioId, expires }); },
    findAccountSession(hash, now) {
      const session = sessions.get(hash);
      if (!session || session.expires <= now) return null;
      for (const [username, account] of accounts) {
        if (session.id === account.id) return { username, role: account.role };
      }
      return null;
    },
    revokeSession(hash) { sessions.delete(hash); },
    load: () => ({ data: ownerData, revision: 0 }),
    createManagedAccount(id, { username, ...account }) {
      if (accounts.has(username)) return false;
      accounts.set(username, { id, ...account });
      return true;
    },
    listManagedAccounts() {
      return Array.from(accounts, ([username, account]) => ({ username, name: account.name, role: account.role }));
    },
  }, express(), { pinMode: true, ownerUsername: 'aki' });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port + '/api/v1';
    const request = (path: string, method: string, token?: string, body?: unknown) => fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const login = async (username: string, pin: string) => {
      const response = await request('/auth/login', 'POST', undefined, { username, pin });
      assert.equal(response.status, 200);
      return (await response.json()).token as string;
    };
    assert.equal((await request('/accounts', 'GET')).status, 401);
    assert.equal((await request('/auth/register', 'POST', undefined, { username: 'aki', pin: '1234' })).status, 403);
    const owner = await login('aki', '1234');
    assert.equal((await (await request('/auth/me', 'GET', owner)).json()).role, 'owner');

    for (const role of ['admin', 'client'] as const) {
      const account = { username: role + '.new', name: role, pin: '0314', role };
      const created = await request('/accounts', 'POST', owner, account);
      assert.equal(created.status, 201);
      assert.deepEqual(await created.json(), { username: account.username, name: role, role });
      assert.equal((await request('/accounts', 'POST', owner, account)).status, 409);
      const token = await login(account.username, account.pin);
      assert.equal((await (await request('/auth/me', 'GET', token)).json()).role, role);
      assert.equal((await request('/accounts', 'POST', token, account)).status, 403);
      assert.equal((await request('/accounts', 'GET', token)).status, 403);
      assert.equal((await request('/events', 'GET', token)).status, role === 'client' ? 403 : 200);
      if (role === 'client') {
        for (const path of ['/studio', '/clients', '/settings', '/settings/home-photo', '/dashboard', '/profile']) {
          assert.equal((await request(path, 'GET', token)).status, 403, path);
        }
        assert.equal((await request('/events/example/payments', 'POST', token, { amount: 100 })).status, 403);
        assert.equal((await request('/photo-galleries', 'POST', token, {})).status, 403);
        assert.equal((await request('/auth/logout', 'POST', token)).status, 204);
        assert.equal((await request('/auth/me', 'GET', token)).status, 401);
      }
    }
    const list = await request('/accounts', 'GET', owner);
    assert.equal(list.status, 200);
    const entries = await list.json();
    assert.equal(entries.length, 2);
    assert.ok(entries.every((entry: object) => !Object.hasOwn(entry, 'pin')));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    close();
  }
});
