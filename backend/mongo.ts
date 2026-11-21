import mongoose from 'mongoose';
import type { StudioData } from '../src/domain/types';
import { createMongoModels } from './mongoModels';
import { StoreError, type SessionRecord, type StudioStore } from './store';

function sessionDocument(session: SessionRecord) {
  return { _id: session.hash, studioId: session.studioId, expiresAt: new Date(session.expires) };
}

export function createMongoStore(uri: string | undefined, dbName = 'mersal_media'): StudioStore {
  async function connect() {
    if (!uri) throw new StoreError(503, 'Studio database is unavailable.');
    const connection = mongoose.createConnection(uri, {
      dbName,
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false,
    });
    try {
      await connection.asPromise();
      const models = createMongoModels(connection);
      // Registration depends on the unique username index being ready.
      await Promise.all(Object.values(models).map(model => model.init()));
      return { connection, ...models };
    } catch {
      await connection.destroy().catch(() => undefined);
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
      const { connection, Studio, Session } = await database();
      try {
        await connection.transaction(async transaction => {
          await Studio.create([{
            _id: account.id,
            username: account.username,
            salt: account.salt,
            passwordHash: account.passwordHash,
            data: account.data,
          }], { session: transaction });
          await Session.create([sessionDocument(session)], { session: transaction });
        });
        return true;
      } catch (error) {
        if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000 && error.keyPattern?.username) return false;
        throw error;
      }
    },
    async findCredentials(username) {
      const { Studio } = await database();
      const row = await Studio.findOne({ username }).schemaLevelProjections(false).select('_id salt passwordHash').lean().exec();
      return row ? { id: row._id, salt: row.salt, passwordHash: row.passwordHash } : null;
    },
    async createSession(session) {
      const { Session } = await database();
      await Session.create(sessionDocument(session));
    },
    async findSession(hash, now) {
      const { Session } = await database();
      const row = await Session.findOne({ _id: hash, expiresAt: { $gt: new Date(now) } })
        .select('studioId -_id').lean().exec();
      return row?.studioId ?? null;
    },
    async revokeSession(hash) {
      const { Session } = await database();
      await Session.deleteOne({ _id: hash });
    },
    async load(studioId) {
      const { Studio } = await database();
      return Studio.findById(studioId).select('data revision -_id').lean<{ data: StudioData; revision: number }>().exec();
    },
    async save(studioId, revision, data) {
      if (Buffer.byteLength(JSON.stringify(data)) > 4 * 1024 * 1024 || mongoose.mongo.BSON.calculateObjectSize(data) > 15 * 1024 * 1024) {
        throw new StoreError(413, 'This studio has reached its database storage limit.');
      }
      const { Studio } = await database();
      const result = await Studio.updateOne({ _id: studioId, revision },
        { $set: { data }, $inc: { revision: 1 } }, { runValidators: true });
      return result.modifiedCount === 1;
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
