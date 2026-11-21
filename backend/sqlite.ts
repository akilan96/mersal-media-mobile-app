import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { StudioData } from '../src/domain/types';
import { createExpressApi } from './api';
import type { StudioStore } from './store';

export function createSqliteStore(filename: string) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS studios (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL,
      password_hash TEXT NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, studio_id TEXT NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
    CREATE TABLE IF NOT EXISTS home_photos (
      studio_id TEXT PRIMARY KEY REFERENCES studios(id) ON DELETE CASCADE,
      content_type TEXT NOT NULL, bytes BLOB NOT NULL
    );
  `);

  const insertSession = db.prepare('INSERT INTO sessions VALUES (?, ?, ?)');
  const store: StudioStore = {
    ping() { db.prepare('SELECT 1').get(); },
    register(account, session) {
      if (!('passwordHash' in account)) throw new Error('SQLite accounts require passwords.');
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = db.prepare('INSERT INTO studios (id, username, salt, password_hash, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(username) DO NOTHING')
          .run(account.id, account.username, account.salt, account.passwordHash, JSON.stringify(account.data));
        if (result.changes) insertSession.run(session.hash, session.studioId, session.expires);
        db.exec('COMMIT');
        return Boolean(result.changes);
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    findCredentials(username) {
      const row = db.prepare('SELECT id, salt, password_hash FROM studios WHERE username = ?').get(username);
      return row ? { id: String(row.id), salt: String(row.salt), passwordHash: String(row.password_hash) } : null;
    },
    createSession(session) {
      db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
      insertSession.run(session.hash, session.studioId, session.expires);
    },
    findSession(hash, now) {
      const row = db.prepare('SELECT studio_id FROM sessions WHERE hash = ? AND expires > ?').get(hash, now);
      return row ? String(row.studio_id) : null;
    },
    revokeSession(hash) { db.prepare('DELETE FROM sessions WHERE hash = ?').run(hash); },
    load(studioId) {
      const row = db.prepare('SELECT data, revision FROM studios WHERE id = ?').get(studioId);
      return row ? { data: JSON.parse(String(row.data)) as StudioData, revision: Number(row.revision) } : null;
    },
    save(studioId, revision, data) {
      const write = db.prepare('UPDATE studios SET data = ?, revision = revision + 1 WHERE id = ? AND revision = ?')
        .run(JSON.stringify(data), studioId, revision);
      return Boolean(write.changes);
    },
    hasPhoto(studioId) { return Boolean(db.prepare('SELECT 1 FROM home_photos WHERE studio_id = ?').get(studioId)); },
    getPhoto(studioId) {
      const row = db.prepare('SELECT content_type, bytes FROM home_photos WHERE studio_id = ?').get(studioId);
      return row ? { contentType: String(row.content_type), bytes: row.bytes as Uint8Array } : null;
    },
    savePhoto(studioId, photo) {
      db.prepare('INSERT INTO home_photos VALUES (?, ?, ?) ON CONFLICT(studio_id) DO UPDATE SET content_type = excluded.content_type, bytes = excluded.bytes')
        .run(studioId, photo.contentType, photo.bytes);
    },
    deletePhoto(studioId) { db.prepare('DELETE FROM home_photos WHERE studio_id = ?').run(studioId); },
  };
  return { store, close: () => db.close() };
}

export function createApi(filename: string) {
  const { store, close } = createSqliteStore(filename);
  return { app: createExpressApi(store), close };
}
