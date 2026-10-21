const KEY = 'g5l5-pending';
function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function save(list) { localStorage.setItem(KEY, JSON.stringify(list.slice(-40))); }
export async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || '请求失败'), { status: res.status, data });
  return data;
}
export function queueEvent(payload) {
  const list = load();
  list.push({ ...payload, queuedAt: Date.now() });
  save(list);
}
let flushSequence = Promise.resolve();
export function flushQueue(identity) {
  if (!identity?.sid || !identity?.round) return Promise.resolve(0);
  const matches = item => item.sid === identity.sid && item.round === identity.round;
  const run = flushSequence.then(async () => {
    let item;
    while ((item = load().find(matches))) {
      try { await api('/api/event', { method: 'POST', body: item }); }
      catch (e) {
        if (e.status) throw e;
        return load().filter(matches).length;
      }
      // Read again: a new event may have been queued while the request was in flight.
      save(load().filter(entry => !(matches(entry) && entry.eventId === item.eventId)));
    }
    return 0;
  });
  flushSequence = run.catch(() => {});
  return run;
}
