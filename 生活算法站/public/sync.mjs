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
export async function flushQueue() {
  const list = load();
  if (!list.length) return;
  const remain = [];
  for (const item of list) {
    try { await api('/api/event', { method: 'POST', body: item }); }
    catch (e) { if (e.status !== 409) remain.push(item); }
  }
  save(remain);
  return remain.length;
}
