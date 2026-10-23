'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createService } = require('../server.cjs');

function req(port, method, urlPath, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const r = http.request({
      host: '127.0.0.1', port, path: urlPath, method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        Origin: `http://127.0.0.1:${port}`
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json = null; try { json = JSON.parse(text); } catch {}
        const raw = res.headers['set-cookie'];
        resolve({ status: res.statusCode, json, cookie: Array.isArray(raw) ? raw[0] : raw });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const CHAIN = { ask: 'C', known: 'F', how: 'formula', slots: { in: 'known', proc: 'how', out: 'ask' } };

describe('跨天继续学习：同一轮次内不会因为“不是今天”而被锁死', () => {
  let service, port, runtimeDir;
  let clock = new Date('2026-10-22T09:00:00+08:00');

  before(async () => {
    runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5l5-day-'));
    service = createService({
      runtimeDir,
      roster: [{ id: 'k1', classId: '501', name: '跨天甲' }],
      networkInterfaces: () => ({ lo: [{ address: '127.0.0.1', family: 'IPv4' }] }),
      now: () => clock
    });
    await new Promise(r => service.server.listen(0, '127.0.0.1', r));
    port = service.server.address().port;
  });
  after(async () => {
    try { service.server.closeAllConnections?.(); } catch {}
    await new Promise(r => { try { service.server.close(() => r()); } catch { r(); } });
    try { service.close(); } catch {}
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  });

  it('昨天做过、今天再来：仍可进站、仍可提交', async () => {
    const login = await req(port, 'POST', '/api/login', { classId: '501', id: 'k1' });
    const cookie = (login.cookie || '').split(';')[0];
    const round = login.json.round;

    // 第一天：完成一步
    const day1 = await req(port, 'POST', '/api/event', { sid: 'k1', round, stage: 'temp', part: 'chain', eventId: 'day1-e1', hintLevel: 0, record: CHAIN }, cookie);
    assert.equal(day1.status, 200, '第一天提交应成功');
    assert.ok(day1.json.records.temp.parts.chain, '第一天应有记录');

    // 第二天
    clock = new Date('2026-10-23T09:00:00+08:00');

    const me = await req(port, 'GET', '/api/me', null, cookie);
    assert.equal(me.status, 200);
    assert.equal(me.json.lessonExpired, false, '同一轮次跨天不应判定为过期');
    assert.ok(me.json.records.temp.parts.chain, '昨天的记录应仍然保留');

    const visit = await req(port, 'POST', '/api/visit', { sid: 'k1', round, stage: 'temp' }, cookie);
    assert.equal(visit.status, 200, '第二天应仍能进站（不再 409）');
    assert.equal(visit.json.records.temp.visits, 1, '访问次数累加');

    const day2 = await req(port, 'POST', '/api/event', { sid: 'k1', round, stage: 'temp', part: 'order', eventId: 'day2-e1', hintLevel: 0, record: { ops: ['sub32', 'mul5', 'div9'], reason: 'order', tries: [['sub32', 'mul5', 'div9']] } }, cookie);
    assert.equal(day2.status, 200, '第二天应仍能提交');
    assert.ok(day2.json.records.temp.parts.order);
    assert.ok(day2.json.records.temp.parts.chain, '第一天的记录不应丢');
  });

  it('老师开启新一轮后，学生拿到的是全新记录', async () => {
    const login = await req(port, 'POST', '/api/login', { classId: '501', id: 'k1' });
    const cookie = (login.cookie || '').split(';')[0];
    const before = await req(port, 'GET', '/api/me', null, cookie);
    assert.ok(before.json.records.temp.parts.chain, '新一轮前仍有旧记录');

    const opened = await req(port, 'POST', '/api/teacher/new-round', { classId: '501' }, cookie);
    assert.equal(opened.status, 200, '开新一轮接口应可用');

    const after = await req(port, 'POST', '/api/login', { classId: '501', id: 'k1' });
    const afterCookie = (after.cookie || '').split(';')[0];
    const fresh = await req(port, 'GET', '/api/me', null, afterCookie);
    assert.equal(fresh.status, 200);
    assert.notEqual(after.json.round, before.json.round, '轮次应变化');
    assert.deepEqual(Object.keys(fresh.json.records.temp.parts), [], '新一轮应为空白记录');
  });
});
