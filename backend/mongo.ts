import { isDeepStrictEqual } from 'node:util';
import mongoose from 'mongoose';
import type { Client, ManagedAccount, Payment, StudioData, StudioEvent } from '../src/domain/types';

import { createMongoModels } from './mongoModels';
import { StoreError, type SessionRecord, type StudioStore } from './store';

const sharedId = 'shared';
type Workspace = Omit<StudioData, 'version' | 'events' | 'clients' | 'homePhoto'> & {
  _id: string;
  revision: number;
};
type User = { _id: string; username: string; pin: string; name?: string; role?: ManagedAccount['role']; clientId?: string; createdAt?: string; attempts?: number; attemptUntil?: number; profile?: StudioData['profile'] };
type EventRecord = Omit<StudioEvent, 'id' | 'payments'> & { _id: string };
type ClientRecord = Omit<Client, 'id'> & { _id: string };
type PaymentRecord = Payment & { _id: string; eventId: string };


function sessionDocument(session: SessionRecord) {
  return { _id: session.hash, studioId: session.studioId, expiresAt: new Date(session.expires) };
}

function collections(db: mongoose.mongo.Db) {
  return {
    auth: db.collection<User>('auth'),
    workspace: db.collection<Workspace>('studio_workspace'),
    events: db.collection<EventRecord>('events'),
    clients: db.collection<ClientRecord>('clients'),
    payments: db.collection<PaymentRecord>('payments'),
  };
}

export function splitStudioData(data: StudioData) {
  return {
    settings: { profile: data.profile, ...(data.theme === undefined ? {} : { theme: data.theme }),
      ...(data.customEventTypes === undefined ? {} : { customEventTypes: data.customEventTypes }),
      ...(data.photoGalleries === undefined ? {} : { photoGalleries: data.photoGalleries }) },
    events: data.events.map(({ id, payments: _payments, ...event }) => ({ _id: id, ...event })),
    clients: data.clients.map(({ id, ...client }) => ({ _id: id, ...client })),
    payments: data.events.flatMap(event => event.payments.map(payment => ({ ...payment, _id: event.id + ':' + payment.id, eventId: event.id }))),
  };
}

export function joinStudioData(row: Workspace & {
  events: EventRecord[]; clients: ClientRecord[]; payments: PaymentRecord[];
}): StudioData {
  const byEvent = new Map<string, Payment[]>();
  for (const { _id, eventId, ...payment } of row.payments) {
    const payments = byEvent.get(eventId) ?? [];
    payments.push(payment);
    byEvent.set(eventId, payments);
  }
  return {
    version: 1, profile: row.profile, theme: row.theme, customEventTypes: row.customEventTypes,
    photoGalleries: row.photoGalleries,
    clients: row.clients.map(({ _id, ...client }) => ({ id: _id, ...client })),
    events: row.events.map(({ _id, ...event }) => ({ id: _id, ...event, payments: byEvent.get(_id) ?? [] })),
  };
}

async function writeChanged<T extends { _id: string }>(
  collection: mongoose.mongo.Collection<T>, previous: T[], next: T[], session: mongoose.mongo.ClientSession,
) {
  const originals = new Map(previous.map(record => [record._id, record]));
  const nextIds = new Set(next.map(record => record._id));
  const operations: mongoose.mongo.AnyBulkWriteOperation<T>[] = [];
  for (const record of next) {
    if (!isDeepStrictEqual(record, originals.get(record._id))) {
      operations.push({ replaceOne: {
        filter: { _id: record._id } as mongoose.mongo.Filter<T>,
        replacement: record, upsert: true,
      } });
    }
  }
  for (const record of previous) {
    if (!nextIds.has(record._id)) operations.push({ deleteOne: { filter: { _id: record._id } as mongoose.mongo.Filter<T> } });
  }
  if (operations.length) await collection.bulkWrite(operations, { session });
}

async function prepareWorkspace(connection: mongoose.Connection) {
  const db = collections(connection.db!);
  if (await db.workspace.findOne({ _id: sharedId }, { projection: { _id: 1 } })) return;

  try {
    await connection.transaction(async session => {
      if (await db.workspace.findOne({ _id: sharedId }, { session, projection: { _id: 1 } })) return;
      const probe = { session, projection: { _id: 1 } };
      if (await db.auth.findOne({}, probe) || await db.clients.findOne({}, probe)
        || await db.events.findOne({}, probe) || await db.payments.findOne({}, probe)) {
        throw new StoreError(503, 'Shared collections contain data without a workspace marker.');
      }
      await db.workspace.insertOne({ _id: sharedId, revision: 0, profile: null }, { session });

    });
  } catch (error) {
    const duplicate = error instanceof mongoose.mongo.MongoServerError && error.code === 11000;
    if (!duplicate || !await db.workspace.findOne({ _id: sharedId }, { projection: { _id: 1 } })) throw error;
  }
}

export function createMongoStore(uri: string | undefined, dbName = 'mersal_media'): StudioStore {
  async function connect() {
    if (!uri) throw new StoreError(503, 'Studio database is unavailable.');
    const connection = mongoose.createConnection(uri, {
      dbName, maxPoolSize: 5, minPoolSize: 0, maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 5000, bufferCommands: false, ignoreUndefined: true,
    });
    try {
      await connection.asPromise();
      const { Studio: _legacy, ...models } = createMongoModels(connection);
      await Promise.all(Object.values(models).map(model => model.init()));
      await prepareWorkspace(connection);
      return { connection, ...models, ...collections(connection.db!) };
    } catch (error) {
      await connection.destroy().catch(() => undefined);
      if (error instanceof StoreError) throw error;
      throw new StoreError(503, 'Studio database is unavailable.');
    }
  }

  let pending: ReturnType<typeof connect> | undefined;
  function database() {
    pending ??= connect().catch(error => {
      pending = undefined;
      throw error;
    });
    return pending;
  }

  return {
    async ping() {
      const { connection } = await database();
      await connection.db!.command({ ping: 1 });
    },
    async register(account, session) {
      if (!('pin' in account)) throw new Error('Atlas accounts require PINs.');
      const { connection, auth, workspace, Session } = await database();
      try {
        await connection.transaction(async transaction => {
          await auth.insertOne({
            _id: account.id, username: account.username, pin: account.pin, profile: account.data.profile,
          }, { session: transaction });
          await workspace.updateOne({ _id: sharedId, profile: null }, {
            $set: { profile: account.data.profile }, $inc: { revision: 1 },
          }, { session: transaction });
          await Session.create([sessionDocument(session)], { session: transaction });
        });
        return true;
      } catch (error) {
        if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000 && error.keyPattern?.username) return false;
        throw error;
      }
    },
    async findCredentials(username) {
      const { auth } = await database();
      const row = await auth.findOne({ username }, { projection: { pin: 1 } });
      return row ? { id: row._id, pin: row.pin } : null;
    },
    async claimPinAttempt(username) {
      const { auth } = await database();
      const now = Date.now();
      const expires = now + 15 * 60_000;
      const row = await auth.findOneAndUpdate({ username }, [{
        $set: {
          attempts: { $cond: [{ $gt: ['$attemptUntil', now] }, { $min: [{ $add: ['$attempts', 1] }, 6] }, 1] },
          attemptUntil: { $cond: [{ $gt: ['$attemptUntil', now] }, '$attemptUntil', expires] },
        },
      }], { returnDocument: 'before', projection: { attempts: 1, attemptUntil: 1 } });
      return !row || !(row.attemptUntil && row.attemptUntil > now && (row.attempts ?? 0) >= 5);
    },
    async clearPinAttempts(username) {
      const { auth } = await database();
      await auth.updateOne({ username }, { $unset: { attempts: '', attemptUntil: '' } });
    },
    async createSession(session) {
      const { Session } = await database();
      await Session.create(sessionDocument(session));
    },
    async findSession(hash, now) {
      const { Session, auth } = await database();
      const row = await Session.findOne({ _id: hash, expiresAt: { $gt: new Date(now) } })
        .select('studioId -_id').lean().exec();
      if (!row || !await auth.findOne({ _id: row.studioId }, { projection: { _id: 1 } })) return null;
      return sharedId;
    },
    async findAccountSession(hash, now) {
      const { Session, auth } = await database();
      const session = await Session.findOne({ _id: hash, expiresAt: { $gt: new Date(now) } })
        .select('studioId -_id').lean().exec();
      if (!session) return null;
      const user = await auth.findOne({ _id: session.studioId }, { projection: { username: 1, name: 1, role: 1, clientId: 1 } });
      return user ? { username: user.username, name: user.name, clientId: user.clientId, role: user.role === 'admin' ? 'admin' : 'client' } : null;
    },
    async listManagedAccounts() {
      const { auth } = await database();
      const accounts = await auth.find({}, { projection: { username: 1, name: 1, role: 1, clientId: 1, createdAt: 1, 'profile.name': 1 } })
        .sort({ username: 1 }).toArray();
      return accounts.map(account => ({
        username: account.username, name: account.name ?? account.profile?.name ?? account.username,
        role: account.role === 'admin' ? 'admin' : 'client', clientId: account.clientId, createdAt: account.createdAt,
      }));
    },
    async createManagedAccount(id, account) {
      const { auth } = await database();
      try {
        await auth.insertOne({ _id: id, ...account });
        return true;
      } catch (error) {
        if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000 && error.keyPattern?.username) return false;
        throw error;
      }
    },
    async linkClientAccount(username, clientId) {
      const { auth } = await database();
      const result = await auth.updateOne({ username, role: { $ne: 'admin' } }, { $set: { clientId } });
      return result.matchedCount === 1;
    },
    async updateManagedAccount(username, input) {
      const { connection, auth, Session } = await database();
      try {
        return await connection.transaction(async session => {
          const prior = await auth.findOneAndUpdate({ username }, {
            $set: { username: input.username, name: input.name, role: input.role, ...(input.pin ? { pin: input.pin } : {}) },
            $unset: { ...(input.role === 'admin' ? { clientId: '' } : {}), ...(input.pin ? { attempts: '', attemptUntil: '' } : {}) },
          }, { session, returnDocument: 'before' });
          if (!prior) return null;
          if (input.pin || input.role !== prior.role || input.username !== username) {
            await Session.deleteMany({ studioId: prior._id }, { session });
          }
          return { username: input.username, name: input.name, role: input.role,
            clientId: input.role === 'client' ? prior.clientId : undefined, createdAt: prior.createdAt };
        });
      } catch (error) {
        if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) throw new StoreError(409, 'Username is already in use.');
        throw error;
      }
    },
    async deleteManagedAccount(username) {
      const { connection, auth, Session } = await database();
      return connection.transaction(async session => {
        const account = await auth.findOneAndDelete({ username }, { session });
        if (!account) return false;
        await Session.deleteMany({ studioId: account._id }, { session });
        return true;
      });
    },
    async revokeSession(hash) {
      const { Session } = await database();
      await Session.deleteOne({ _id: hash });
    },
    async load(studioId) {
      const { workspace } = await database();
      const [row] = await workspace.aggregate<Parameters<typeof joinStudioData>[0]>([
        { $match: { _id: studioId } },
        { $lookup: { from: 'events', pipeline: [{ $sort: { createdAt: -1, _id: 1 } }], as: 'events' } },
        { $lookup: { from: 'clients', pipeline: [{ $sort: { createdAt: -1, _id: 1 } }], as: 'clients' } },
        { $lookup: { from: 'payments', pipeline: [{ $sort: { date: 1, _id: 1 } }], as: 'payments' } },
      ], { readConcern: { level: 'snapshot' } }).toArray();
      return row ? { data: joinStudioData(row), revision: row.revision } : null;
    },
    async save(studioId, revision, data, previous) {
      if (Buffer.byteLength(JSON.stringify(data)) > 4 * 1024 * 1024) {
        throw new StoreError(413, 'This studio has reached its API snapshot size limit.');
      }
      const { connection, workspace, events, clients, payments } = await database();
      const before = splitStudioData(previous);
      const after = splitStudioData(data);
      return connection.transaction(async session => {
        const result = await workspace.updateOne({ _id: studioId, revision }, {
          $set: after.settings, $inc: { revision: 1 },
        }, { session });
        if (!result.matchedCount) return false;
        await writeChanged(clients, before.clients, after.clients, session);
        await writeChanged(events, before.events, after.events, session);
        await writeChanged(payments, before.payments, after.payments, session);
        return true;
      });
    },
    async hasPhoto(studioId) {
      const { HomePhoto } = await database();
      return Boolean(await HomePhoto.exists({ _id: studioId }));
    },
    async getPhoto(studioId) {
      const { HomePhoto } = await database();
      const row = await HomePhoto.findById(studioId).select('bytes contentType -_id').exec();
      return row ? { bytes: Buffer.from(row.bytes), contentType: row.contentType } : null;
    },
    async savePhoto(studioId, photo) {
      const { HomePhoto } = await database();
      await HomePhoto.updateOne({ _id: studioId },
        { $set: { contentType: photo.contentType, bytes: Buffer.from(photo.bytes) } },
        { upsert: true, runValidators: true });
    },
    async deletePhoto(studioId) {
      const { HomePhoto } = await database();
      await HomePhoto.deleteOne({ _id: studioId });
    },
  };
}
