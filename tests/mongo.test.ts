import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import mongoose from 'mongoose';
import { createMongoModels } from '../backend/mongoModels';
import { createMongoStore } from '../backend/mongo';
import { StoreError } from '../backend/store';

test('Atlas models preserve nested records and declare required indexes', async () => {
  const connection = mongoose.createConnection();
  try {
    const { Studio, Session, HomePhoto } = createMongoModels(connection);
    const studioId = randomUUID();
    const clientId = randomUUID();
    const date = '2026-12-12T12:00:00+05:30';
    const studio = new Studio({
      _id: studioId,
      username: 'studio.owner',
      salt: 'a'.repeat(32),
      passwordHash: 'b'.repeat(128),
      data: {
        version: 1,
        theme: 'pancake',
        profile: { name: 'Owner', studioName: 'Mersal', username: 'studio.owner', phone: '', email: '' },
        clients: [{ id: clientId, name: 'Client', phone: '', email: '', notes: '', createdAt: date }],
        events: [{
          id: randomUUID(), title: 'Portraits', date, location: 'Studio', attendees: 0,
          type: 'Studio portraits', status: 'Cancelled', clientId, totalAmount: 1500,
          payments: [{ id: randomUUID(), amount: 500, date, note: 'Advance' }], createdAt: date,
        }],
        customEventTypes: ['Studio portraits'],
      },
    });
    await studio.validate();
    const snapshot = studio.toObject().data;
    assert.equal(studio.revision, 0);
    assert.equal(snapshot.clients[0].id, snapshot.events[0].clientId);
    assert.equal(snapshot.events[0].payments[0].amount, 500);
    assert.equal(snapshot.events[0].date, date);
    assert.ok(!Object.hasOwn(snapshot.events[0], '_id'));
    assert.deepEqual(Studio.schema.indexes(), [[{ username: 1 }, { unique: true }]]);
    assert.deepEqual(Session.schema.indexes(), [[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]]);
    await assert.rejects(new HomePhoto({ _id: studioId, contentType: 'image/png', bytes: Buffer.alloc(0) }).validate());
  } finally {
    await connection.destroy();
  }
});

test('missing Atlas configuration fails without exposing connection details', async () => {
  const store = createMongoStore(undefined);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(async () => store.ping(), (error: unknown) =>
      error instanceof StoreError && error.status === 503 && error.message === 'Studio database is unavailable.');
  }
});
