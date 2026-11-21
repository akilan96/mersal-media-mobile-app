import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApi } from '../backend/sqlite';

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

    await request('POST', '/event-types', 201, { name: 'Studio Launch' }, token);
    await request('POST', '/event-types', 409, { name: 'studio launch' }, token);
    await request('PATCH', '/settings', 200, { theme: 'forest' }, token);
    const payload = { title: 'Test shoot', date: '2030-01-01T10:00:00Z', location: 'Studio', type: 'Studio Launch', attendees: 12, crew: ['Photographer'], totalAmount: 500, advance: 100, contact: { name: 'Client One', phone: '+91 98765 43210' } };
    await request('POST', '/events', 422, { ...payload, advance: 600 }, token);
    assert.deepEqual(await request('GET', '/clients', 200, undefined, token), []);
    const event = await request('POST', '/events', 201, payload, token);
    const sameClient = await request('POST', '/events', 201, { ...payload, contact: { phone: '+919876543210' } }, token);
    assert.equal(sameClient.clientId, event.clientId);
    assert.equal((await request('GET', '/clients', 200, undefined, token)).length, 1);
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
