import test from 'node:test';
import { planEventReminders } from '../src/domain/eventReminders';
import assert from 'node:assert/strict';
import { balanceAmount, eventSummary, paidAmount, paymentLabel, upcomingEvents } from '../src/domain/helpers';
import { assertStudioData, putEvent, removeClient, validateEvent } from '../src/domain/validation';
import type { Client, EventInput, Payment, StudioData, StudioEvent } from '../src/domain/types';

const timestamp = '2026-11-19T10:00:00.000Z';
function client(id = 'client-1'): Client {
  return { id, name: 'Test client', phone: '+91 9876543210', email: 'client@example.test', notes: '', createdAt: timestamp };
}
function payment(amount: number, id = 'payment-1'): Payment {
  return { id, amount, date: timestamp, note: 'Bank transfer' };
}
function eventInput(overrides: Partial<EventInput> = {}): EventInput {
  return { title: 'Test shoot', date: timestamp, location: 'Test venue', attendees: 25, type: 'Portraits', status: 'Scheduled', crew: ['Lead photographer'], equipment: ['Camera × 2'], totalAmount: 1000, payments: [], notes: '', ...overrides };
}
function event(id = 'event-1', overrides: Partial<StudioEvent> = {}): StudioEvent {
  return { ...eventInput(), id, createdAt: timestamp, ...overrides };
}
function studio(overrides: Partial<StudioData> = {}): StudioData {
  return { version: 1, profile: { name: 'Test photographer', studioName: 'Test studio', username: 'test.studio', phone: '', email: '' }, events: [], clients: [], ...overrides };
}

test('creating and updating a shoot preserves unrelated records and the original snapshot', () => {
  const untouched = event('unrelated-event', { title: 'Another shoot' });
  const original = studio({ clients: [client()], events: [untouched] });
  const created = putEvent(original, eventInput({ clientId: 'client-1', payments: [payment(250)] }), 'new-event', timestamp);
  assert.deepEqual(original.events, [untouched]);
  assert.equal(created.events.length, 2);
  assert.deepEqual(created.clients, original.clients);
  assert.deepEqual(created.profile, original.profile);
  const saved = created.events.find(item => item.id === 'new-event')!;
  const updated = putEvent(created, { ...saved, title: 'Revised shoot', status: 'Editing' }, saved.id, saved.createdAt);
  assert.equal(updated.events.length, 2);
  assert.equal(updated.events[0], untouched);
  assert.equal(updated.events[1].title, 'Revised shoot');
  assert.equal(updated.events[1].status, 'Editing');
  assert.equal(updated.events[1].createdAt, timestamp);
  assert.deepEqual(updated.events[1].payments, [payment(250)]);
  assert.equal(created.events[1].title, 'Test shoot');
});

test('payment totals and balance retain exact currency precision for decimal receipts', () => {
  const partial = event('decimal-event', { totalAmount: 1, payments: [payment(0.1, 'first'), payment(0.2, 'second')] });
  assert.equal(paidAmount(partial), 0.3);
  assert.equal(balanceAmount(partial), 0.7);
  assert.equal(paymentLabel(partial), 'Partially Paid');
  const paid = { ...partial, totalAmount: 0.3 };
  assert.doesNotThrow(() => validateEvent(paid, []));
  assert.equal(balanceAmount(paid), 0);
  assert.equal(paymentLabel(paid), 'Paid');
  assert.equal(paymentLabel(event()), 'Pending');
  assert.equal(paymentLabel(event('free-shoot', { totalAmount: 0 })), 'Paid');
});

test('overpayments and duplicate receipts are rejected before they enter saved state', () => {
  assert.throws(() => validateEvent(eventInput({ totalAmount: 0.3, payments: [payment(0.1, 'first'), payment(0.21, 'second')] }), []), /exceed/);
  assert.throws(() => validateEvent(eventInput({ payments: [payment(100), payment(200)] }), []), /unique/);
  const before = studio();
  assert.throws(() => putEvent(before, eventInput({ totalAmount: 100, payments: [payment(101)] }), 'bad-event', timestamp), /exceed/);
  assert.deepEqual(before.events, []);
});

test('invalid totals cannot create negative, nonfinite or sub-paise balances', () => {
  for (const amount of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.001, 1e10 + 1]) {
    assert.throws(() => validateEvent(eventInput({ totalAmount: amount }), []), `Expected total ${amount} to be rejected`);
  }
  assert.doesNotThrow(() => validateEvent(eventInput({ totalAmount: 1250.25 }), []));
});

test('receipts require positive finite amounts with at most two decimals', () => {
  for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.001]) {
    assert.throws(() => validateEvent(eventInput({ payments: [payment(amount)] }), []), `Expected receipt ${amount} to be rejected`);
  }
  assert.throws(() => validateEvent(eventInput({ payments: [{ ...payment(10), date: 'not-a-date' }] }), []));
});

test('a linked client cannot be removed or replaced with a dangling event reference', () => {
  const linked = studio({ clients: [client()], events: [event('linked-event', { clientId: 'client-1' })] });
  assert.throws(() => removeClient(linked, 'client-1'), /linked/);
  assert.equal(linked.clients.length, 1);
  assert.throws(() => validateEvent(eventInput({ clientId: 'missing-client' }), linked.clients), /no longer exists/);
  const unlinked = studio({ clients: [client(), client('client-2')], events: [event()] });
  const after = removeClient(unlinked, 'client-1');
  assert.deepEqual(after.clients.map(item => item.id), ['client-2']);
  assert.equal(unlinked.clients.length, 2);
  assert.deepEqual(after.events, unlinked.events);
});

test('upcoming shoots exclude past times and other workflow stages, then sort chronologically', () => {
  const now = new Date('2026-11-19T10:00:00.000Z');
  const source = [
    event('later', { date: '2026-11-20T12:00:00.000Z' }),
    event('completed', { date: '2026-11-21T12:00:00.000Z', status: 'Completed' }),
    event('earlier', { date: '2026-11-19T11:00:00.000Z' }),
    event('past-today', { date: '2026-11-19T09:59:59.000Z' }),
    event('editing', { date: '2026-11-21T12:00:00.000Z', status: 'Editing' }),
    event('cancelled', { date: '2026-11-21T12:00:00.000Z', status: 'Cancelled' }),
    event('starts-now', { date: now.toISOString() }),
  ];
  const originalOrder = source.map(item => item.id);
  assert.deepEqual(upcomingEvents(source, now).map(item => item.id), ['starts-now', 'earlier', 'later']);
  assert.deepEqual(source.map(item => item.id), originalOrder);
});

test('valid persisted studio data round-trips through JSON without losing payments or links', () => {
  const original = studio({ clients: [client()], events: [event('saved', { clientId: 'client-1', payments: [payment(125.5)] })] });
  const restored: unknown = JSON.parse(JSON.stringify(original));
  assert.doesNotThrow(() => assertStudioData(restored));
  assert.deepEqual(restored, original);
});

test('corrupt persisted schemas are rejected instead of being presented as an empty studio', () => {
  const corrupt: unknown[] = [
    null, {}, { ...studio(), version: 2 }, { ...studio(), events: 'bad' },
    { ...studio(), profile: { username: 'only-one-field' } },
    studio({ clients: [client(), client()] }),
    studio({ events: [event(), event()] }),
    studio({ events: [{ ...event(), date: 'not-a-date' }] }),
    studio({ events: [{ ...event(), clientId: 'unknown-client' }] }),
    studio({ events: [{ ...event(), equipment: [''] }] }),
    studio({ events: [{ ...event(), attendees: -5 }] }),
    { ...studio(), events: [{ ...event(), payments: [{ ...payment(10), note: {} }] }] },
    { ...studio(), events: [{ ...event(), payments: [{ id: 'no-note', amount: 10, date: timestamp }] }] },
    { ...studio(), events: [{ ...event(), payments: [{ ...payment(10), id: 123 }] }] },
  ];
  for (const value of corrupt) assert.throws(() => assertStudioData(value), `Expected damaged schema to be rejected: ${JSON.stringify(value)}`);
});

test('event exports report saved values, client contact and computed balances', () => {
  const record = eventSummary(event('export', { totalAmount: 1000, payments: [payment(250)], notes: 'Bring a tripod' }), client());
  assert.match(record, /Test shoot/);
  assert.match(record, /Client: Test client/);
  assert.match(record, /Phone: \+91 9876543210/);
  assert.match(record, /Received:.*250/);
  assert.match(record, /Balance:.*750/);
  assert.match(record, /Bank transfer/);
  assert.match(record, /Bring a tripod/);
});
test('shoot reminders skip elapsed alerts and keep the 3-hour and 1-hour alerts on the shoot day', () => {
  const afternoon = new Date(2026, 10, 26, 15);
  const morning = new Date(2026, 10, 26, 2);
  const now = new Date(2026, 10, 24, 12).getTime();
  const eventAt = (date: Date, status: 'Scheduled' | 'Cancelled' = 'Scheduled') => ({
    ...event(), id: date.toISOString() + status, date: date.toISOString(), status,
  });
  const reminders = planEventReminders([eventAt(afternoon), eventAt(morning), eventAt(afternoon, 'Cancelled')], now);
  assert.deepEqual(reminders.filter(r => r.event.date === afternoon.toISOString()).map(r => r.hours), [24, 3, 1]);
  assert.deepEqual(reminders.filter(r => r.event.date === morning.toISOString()).map(r => r.hours), [24, 1]);
  assert.deepEqual(planEventReminders([eventAt(afternoon)], afternoon.getTime() - 2 * 3600000).map(r => r.hours), [1]);
});
