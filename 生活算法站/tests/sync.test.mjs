import { test } from 'node:test';
import assert from 'node:assert/strict';

test('离线补传按身份轮次串行，补传中新增记录不被旧快照覆盖', async () => {
  const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
  const sync = await import('../public/sync.mjs?ordered-queue-test');
  const identity = { sid: 'a', round: 'r1' };
  sync.queueEvent({ ...identity, eventId: 'old-1' });
  sync.queueEvent({ sid: 'b', round: 'r1', eventId: 'other-student' });
  sync.queueEvent({ sid: 'a', round: 'r0', eventId: 'old-round' });
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const seen = [];
  globalThis.fetch = async (url, options) => {
    const event = JSON.parse(options.body); seen.push(event.eventId);
    if (event.eventId === 'old-1') await wait;
    return { ok: true, json: async () => ({}) };
  };
  try {
    const first = sync.flushQueue(identity);
    await new Promise(resolve => setTimeout(resolve, 0));
    sync.queueEvent({ ...identity, eventId: 'new-2' });
    const parallel = sync.flushQueue(identity);
    release();
    assert.equal(await first, 0);
    assert.equal(await parallel, 0);
    assert.deepEqual(seen, ['old-1', 'new-2']);
    const remain = JSON.parse(store.get('g5l5-pending'));
    assert.deepEqual(remain.map(x => x.eventId), ['other-student', 'old-round']);
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('补传失败即停止，新作答不会越过旧作答；恢复后保持旧错、新对顺序', async () => {
  const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
  const sync = await import('../public/sync.mjs?retry-queue-test');
  const identity = { sid: 'a', round: 'r1' };
  sync.queueEvent({ ...identity, eventId: 'wrong-1' });
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    assert.equal(await sync.flushQueue(identity), 1);
    sync.queueEvent({ ...identity, eventId: 'correct-2' });
    const seen = [];
    globalThis.fetch = async (url, options) => { seen.push(JSON.parse(options.body).eventId); return { ok: true, json: async () => ({}) }; };
    assert.equal(await sync.flushQueue(identity), 0);
    assert.deepEqual(seen, ['wrong-1', 'correct-2']);
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});
