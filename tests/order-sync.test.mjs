import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { enqueueOrder, readOutbox, claimOrder, acknowledgeOrder, releaseOrder, createOutboxWorker } from '../lib/order-outbox.ts';
import { createRefreshCoordinator } from '../lib/refresh-coordinator.ts';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const order = () => ({ id: crypto.randomUUID(), customerName: 'LOCAL ONLY', takeout: false, status: 'preparing', createdAt: new Date().toISOString(), daySessionId: 'local-day', items: [] });
beforeEach(async () => {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('laisla-order-outbox-v1');
    request.onsuccess = resolve; request.onerror = reject;
  });
});

test('offline submission survives worker recreation and keeps its original day and ID', async () => {
  const payload = order();
  await enqueueOrder(payload);
  const offline = createOutboxWorker({ online: () => false, send: () => { throw Error('must not send'); }, changed() {} });
  await offline();
  assert.deepEqual((await readOutbox()).pending[0].order, payload);
  const restarted = createOutboxWorker({ online: () => true, send: async o => { assert.deepEqual(o, payload); return 4; }, changed() {} });
  await restarted();
  const state = await readOutbox();
  assert.equal(state.pending.length, 0);
  assert.equal(state.receipts[0].id, payload.id);
  assert.equal(state.receipts[0].orderNumber, 4);
});

test('two tabs claim one durable entry only once', async () => {
  const payload = order(); await enqueueOrder(payload);
  const claims = await Promise.all([claimOrder(payload.id, 'tab-a'), claimOrder(payload.id, 'tab-b')]);
  assert.equal(claims.filter(Boolean).length, 1);
});

test('overlapping flushes and separate tabs cannot duplicate an active submission', async () => {
  await enqueueOrder(order());
  const response = deferred(); let calls = 0;
  const options = { online: () => true, send: async () => { calls++; await response.promise; return 7; }, changed() {} };
  const a = createOutboxWorker(options); const b = createOutboxWorker(options);
  const first = a(); const second = a();
  assert.equal(first, second);
  await new Promise(r => setImmediate(r));
  const other = b();
  await new Promise(r => setTimeout(r, 10));
  response.resolve(); await Promise.all([first, second, other]);
  assert.equal(calls, 1);
});

test('lost response preserves the payload; a later retry acknowledges the same ID', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100_000 });
  const payload = order(); await enqueueOrder(payload);
  const committed = new Map(); let attempts = 0;
  const worker = createOutboxWorker({ online: () => true, changed() {}, send: async o => {
    attempts++; if (!committed.has(o.id)) committed.set(o.id, 12);
    if (attempts === 1) throw new TypeError('lost response');
    return committed.get(o.id);
  } });
  await worker();
  assert.equal((await readOutbox()).pending[0].state, 'pending');
  await worker(); assert.equal(attempts, 1);
  t.mock.timers.tick(5_001); await worker();
  assert.equal(attempts, 2); assert.equal(committed.size, 1);
  assert.equal((await readOutbox()).pending.length, 0);
});

test('expired owner cannot overwrite or acknowledge a newer tab lease', async () => {
  const payload = order(); await enqueueOrder(payload);
  const a = await claimOrder(payload.id, 'a', 100_000);
  const b = await claimOrder(payload.id, 'b', 130_001);
  await releaseOrder(a, new Error()); await acknowledgeOrder(a, 1);
  assert.equal((await readOutbox()).pending[0].owner, 'b');
  await acknowledgeOrder(b, 1); assert.equal((await readOutbox()).pending.length, 0);
});

test('closed-day rejection remains visible and is never assigned to another day', async () => {
  const payload = order(); await enqueueOrder(payload); let calls = 0;
  const worker = createOutboxWorker({ online: () => true, changed() {}, send: async () => { calls++; throw { code: 'PT410' }; } });
  await worker(); await worker();
  const pending = (await readOutbox()).pending[0];
  assert.equal(pending.state, 'blocked'); assert.equal(pending.order.daySessionId, 'local-day'); assert.equal(calls, 1);
});

test('storage failure does not create a pending order', async () => {
  await assert.rejects(enqueueOrder({ ...order(), unclonable: () => {} }));
  assert.equal((await readOutbox()).pending.length, 0);
});

test('late snapshot invalidated by realtime never overwrites newer data', async () => {
  const first = deferred(); const applied = []; let reads = 0;
  const sync = createRefreshCoordinator({ read: async () => ++reads === 1 ? first.promise : 'fresh', apply: v => applied.push(v), error: e => { throw e; } });
  const running = sync.request(); void sync.invalidate(); first.resolve('old'); await running;
  assert.deepEqual(applied, ['fresh']); assert.equal(reads, 2);
});

test('poll ticks coalesce while a slow snapshot is in flight', async () => {
  const first = deferred(); let active = 0, maxActive = 0, reads = 0; const applied = [];
  const sync = createRefreshCoordinator({ read: async () => { active++; maxActive = Math.max(maxActive, active); reads++; if (reads === 1) await first.promise; active--; return reads; }, apply: v => applied.push(v), error: e => { throw e; } });
  const running = sync.request(); void sync.request(); void sync.request(); first.resolve(); await running;
  assert.equal(maxActive, 1); assert.deepEqual(applied, [1, 2]);
});

test('snapshots wait for local writes and discard pre-write results', async () => {
  const initial = deferred(), mutation = deferred(); let reads = 0; const applied = [];
  const sync = createRefreshCoordinator({ read: async () => ++reads === 1 ? initial.promise : 'committed', apply: v => applied.push(v), error: e => { throw e; } });
  const reading = sync.request(); const writing = sync.write(() => mutation.promise);
  initial.resolve('old'); await reading; assert.deepEqual(applied, []);
  mutation.resolve(); await writing; await sync.request();
  assert.equal(applied.every(v => v === 'committed'), true); assert.ok(applied.length > 0);
});

test('failed read retries on next wake, and unmounted coordinator never applies', async () => {
  let calls = 0, errors = 0; const applied = [];
  const sync = createRefreshCoordinator({ read: async () => { if (++calls === 1) throw Error('offline'); return 'fresh'; }, apply: v => applied.push(v), error: () => errors++ });
  await sync.request(); assert.equal(errors, 1); assert.equal(calls, 1);
  await sync.request(); assert.deepEqual(applied, ['fresh']);
  sync.stop(); await sync.request(); assert.equal(calls, 2);
});
