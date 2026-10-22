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
const ORDER = { ops: ['sub32', 'mul5', 'div9'], reason: 'order', tries: [['sub32', 'mul5', 'div9']] };
const STEPS = { rows: [{ verb: 'input', obj: 'F' }, { verb: 'calc', obj: 'C', method: 'ok' }, { verb: 'output', obj: 'C' }] };

describe('重开本站：清空记录后重新计算星星', () => {
  let service, port, runtimeDir, cookie, login;
  before(async () => {
    runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5l5-reset-'));
    service = createService({
      runtimeDir,
      roster: [{ id: 'r1', classId: '501', name: '重置甲' }],
      networkInterfaces: () => ({ lo: [{ address: '127.0.0.1', family: 'IPv4' }] })
    });
    await new Promise(r => service.server.listen(0, '127.0.0.1', r));
    port = service.server.address().port;
    login = await req(port, 'POST', '/api/login', { classId: '501', id: 'r1' });
    cookie = (login.cookie || '').split(';')[0];
  });
  after(async () => {
    try { service.server.closeAllConnections?.(); } catch {}
    await new Promise(r => { try { service.server.close(() => r()); } catch { r(); } });
    try { service.close(); } catch {}
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  });

  const submit = (stage, part, record, eventId) => req(port, 'POST', '/api/event', {
    sid: 'r1', round: login.json.round, stage, part, eventId: eventId || `e-${stage}-${part}-${Date.now()}-${Math.random()}`, hintLevel: 0, record
  }, cookie);

  it('通关一个站后重开，星级、作答与积分都归零，并可再次作答', async () => {
    let last;
    for (const [part, record] of [['chain', CHAIN], ['order', ORDER], ['steps', STEPS]]) {
      const r = await submit('temp', part, record);
      assert.equal(r.status, 200, `${part} 应提交成功`);
      last = r.json;
    }
    assert.equal(last.records.temp.summary.pass, true, '三部分都通过应通关');
    assert.ok(last.awards.some(a => a.stage === 'temp'), '应记录通关奖励');
    const pointsBefore = last.points;
    assert.ok(pointsBefore > 0, '通关后应有积分');
    const starsBefore = last.records.temp.summary.stars;
    assert.ok(starsBefore >= 2);

    // 重开本站
    const reset = await req(port, 'POST', '/api/stage/reset', { sid: 'r1', round: login.json.round, stage: 'temp' }, cookie);
    assert.equal(reset.status, 200);
    assert.deepEqual(Object.keys(reset.json.records.temp.parts), [], '作答记录应清空');
    assert.equal(reset.json.records.temp.summary.stars, 0, '星级应归零');
    assert.equal(reset.json.records.temp.summary.pass, false);
    assert.equal(reset.json.awards.length, 0, '该站奖励应收回');
    assert.equal(reset.json.points, 0, '积分应清零');
    assert.equal(reset.json.records.temp.visits, 0);

    // 重新作答后可以重新计算星级
    const again = await submit('temp', 'chain', CHAIN);
    assert.equal(again.status, 200);
    assert.ok(again.json.records.temp.parts.chain, '重开后应能再次记录作答');
    assert.equal(again.json.records.temp.parts.chain.attempts, 1, '应为全新记录');
    assert.ok(again.json.records.temp.summary.stars >= 0);
  });

  it('重开只影响本站，其他站的作答保留', async () => {
    // 先通关温度站，解锁流程站
    for (const [part, record] of [['chain', CHAIN], ['order', ORDER], ['steps', STEPS]]) {
      const r = await submit('temp', part, record);
      assert.equal(r.status, 200, `${part} 应提交成功`);
    }
    const other = await submit('flow', 'fix', {
      blocks: [
        { id: 'b0', shape: 'terminal' }, { id: 'b1', shape: 'io' },
        { id: 'b2', shape: 'process' }, { id: 'b3', shape: 'process' }, { id: 'b4', shape: 'terminal' }
      ]
    });
    assert.equal(other.status, 200);
    assert.ok(other.json.records.flow.parts.fix, '流程站应已记录');
    const reset = await req(port, 'POST', '/api/stage/reset', { sid: 'r1', round: login.json.round, stage: 'temp' }, cookie);
    assert.equal(reset.status, 200);
    assert.deepEqual(Object.keys(reset.json.records.temp.parts), [], '只清空温度站');
    assert.ok(reset.json.records.flow.parts.fix, '流程站的作答应保留');
  });

  it('未知关卡或未登录会被拒绝', async () => {
    const bad = await req(port, 'POST', '/api/stage/reset', { sid: 'r1', round: login.json.round, stage: 'nope' }, cookie);
    assert.equal(bad.status, 400);
    const anon = await req(port, 'POST', '/api/stage/reset', { stage: 'temp' });
    assert.equal(anon.status, 401);
  });
});
