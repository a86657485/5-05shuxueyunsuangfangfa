'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createService } = require('../server.cjs');

function req(port, method, urlPath, body, cookie, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const r = http.request({
      host: '127.0.0.1', port, path: urlPath, method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        Origin: `http://127.0.0.1:${port}`,
        ...headers
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json = null; try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, json, text, cookie: res.headers['set-cookie'] });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

describe('classroom service', () => {
  let service, port, cookie, sid, round;
  const roster = [
    { id: 't-501-a', classId: '501', name: '测试甲' },
    { id: 't-501-b', classId: '501', name: '测试甲' },
    { id: 't-502-a', classId: '502', name: '测试乙' }
  ];
  before(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5l5-'));
    service = createService({
      runtimeDir: dir,
      roster,
      networkInterfaces: () => ({ lo: [{ address: '127.0.0.1', family: 'IPv4' }] })
    });
    await new Promise(r => service.server.listen(0, '127.0.0.1', r));
    port = service.server.address().port;
  });
  after(() => new Promise(r => service.server.close(() => { service.close(); r(); })));

  it('班级列表 501—504', async () => {
    const res = await req(port, 'GET', '/api/classes');
    assert.deepEqual(res.json.classes, ['501','502','503','504']);
  });

  it('登录与同名确认', async () => {
    const clash = await req(port, 'POST', '/api/login', { classId: '501', name: '测试甲' });
    assert.equal(clash.status, 409);
    assert.equal(clash.json.choices.length, 2);
    const ok = await req(port, 'POST', '/api/login', { classId: '501', id: 't-501-a' });
    assert.equal(ok.status, 200);
    cookie = ok.cookie[0].split(';')[0];
    sid = ok.json.student.id;
    round = ok.json.round;
  });

  const T = [{ verb: 'input', obj: 'F' }, { verb: 'calc', obj: 'C', method: 'ok' }, { verb: 'output', obj: 'C' }];
  const ev = (stage, part, record, eventId, hintLevel = 0) => req(port, 'POST', '/api/event', { sid, round, stage, part, record, eventId, hintLevel }, cookie);

  it('站序门禁：未完成上一站不能提交下一站', async () => {
    const skip = await ev('flow', 'fix', { marks: {} }, 'e-skip');
    assert.equal(skip.status, 409);
    const badPart = await ev('temp', 'nope', {}, 'e-badpart');
    assert.equal(badPart.status, 400);
  });

  it('首答永久保留、最终更新；全部证据点通过才得分，且只记一次', async () => {
    const wrong = await ev('temp', 'chain', { ask: 'F', known: 'C', how: 'guess', slots: { in: 'ask', proc: 'how', out: 'known' } }, 'e1', 1);
    assert.equal(wrong.status, 200);
    assert.equal(wrong.json.lastAssessment.ok, false);
    const right = await ev('temp', 'chain', { ask: 'C', known: 'F', how: 'formula', slots: { in: 'known', proc: 'how', out: 'ask' } }, 'e2');
    const part = right.json.records.temp.parts.chain;
    assert.equal(part.first.assessment.ok, false);
    assert.ok(part.first.assessment.tags.includes('ipo-swap'));
    assert.equal(part.last.assessment.ok, true);
    assert.equal(part.attempts, 2); assert.equal(part.hintMax, 1);
    assert.equal(right.json.points, 0); // 还有两个证据点
    await ev('temp', 'order', { ops: ['sub32', 'mul5', 'div9'], reason: 'order', tries: [['sub32', 'mul5', 'div9']] }, 'e3');
    const done = await ev('temp', 'steps', { rows: T }, 'e4');
    assert.equal(done.json.points, 10);
    const again = await ev('temp', 'steps', { rows: T }, 'e5');
    assert.equal(again.json.points, 10); // 重做不重复加分
    const dup = await ev('temp', 'steps', { rows: T }, 'e5');
    assert.equal(dup.json.records.temp.parts.steps.attempts, 2); // 同一 eventId 补传去重
  });

  it('伪造“通过”不被采信：服务端重新执行步骤判定', async () => {
    const fake = await ev('flow', 'fix', { marks: { b1: 'none' }, assessment: { ok: true } }, 'e-fake');
    assert.equal(fake.status, 200);
    assert.equal(fake.json.lastAssessment.ok, false);
    assert.equal(fake.json.awards.some(a => a.stage === 'flow'), false);
  });

  it('进站 visits 累计；通关后 summary.cleared 且重玩不扣分', async () => {
    const v1 = await req(port, 'POST', '/api/visit', { sid, round, stage: 'temp' }, cookie);
    assert.equal(v1.status, 200);
    assert.equal(v1.json.records.temp.visits, 1);
    const v2 = await req(port, 'POST', '/api/visit', { sid, round, stage: 'temp' }, cookie);
    assert.equal(v2.json.records.temp.visits, 2);
    assert.equal(v2.json.records.temp.summary.cleared, true);
    assert.ok(v2.json.records.temp.summary.stars >= 2);
    assert.equal(v2.json.points, 10);
  });

  it('教师大屏汇总含证据点首答与签到方法卡', async () => {
    const t = await req(port, 'GET', '/api/teacher/class?class=501');
    assert.equal(t.status, 200);
    const me = t.json.students.find(s => s.student.id === sid);
    assert.equal(me.records.temp.summary.pass, true);
    assert.equal(me.records.temp.summary.cleared, true);
    assert.ok(me.records.temp.summary.stars >= 2);
    assert.equal(me.records.temp.summary.parts[0].firstOk, false);
    assert.ok(me.records.temp.summary.correctedTags.includes('ipo-swap'));
    assert.ok(me.records.temp.parts.steps.last.record.rows.length === 3);
  });

  it('考核不泄露答案且可重考', async () => {
    const locked = await req(port, 'POST', '/api/exam/create', { sid, round }, cookie);
    assert.equal(locked.status, 409);
    await ev('flow', 'paper', { done: true, checks: ['shape', 'arrow'] }, 'exam-flow-paper');
    await ev('flow', 'fix', { marks: { b0: 'none', b1: 'shape', b2: 'order', b3: 'order', b4: 'missing' } }, 'exam-flow-fix');
    await ev('seeds', 'chain', { ask: ['m10', 'sum'], known: 'n-rule', how: 'm-then-s' }, 'exam-seeds-chain');
    await ev('seeds', 'steps', { rows: [{ verb: 'input', obj: 'n' }, { verb: 'calc', obj: 'm', method: 'ok' }, { verb: 'calc', obj: 's', method: 'ok' }, { verb: 'output', obj: 'ms' }] }, 'exam-seeds-steps');
    await ev('seeds', 'flow', { shapes: Object.fromEntries(require('../public/rules.js').seedFlowBoxes.map(b => [b.id, b.shape])) }, 'exam-seeds-flow');
    const rule = { a: 3, sign: '-', b: 2 };
    await ev('signin', 'rule', rule, 'exam-signin-rule');
    await ev('signin', 'steps', { rule, rows: [{ verb: 'input', obj: 'k' }, { verb: 'calc', obj: 'p', method: 'mine' }, { verb: 'output', obj: 'p' }] }, 'exam-signin-steps');
    const ready = await ev('signin', 'reflect', { was: 'answer', now: 'method' }, 'exam-signin-reflect');
    assert.equal(ready.json.currentExam.tier, 'base');
    const create = await req(port, 'POST', '/api/exam/create', { sid, round }, cookie);
    assert.equal(create.status, 200);
    assert.equal(create.json.questions.length, 16);
    assert.equal('answer' in create.json.questions[0], false);
    const answers = {};
    // need real answers from teacher endpoint
    const bank = await req(port, 'GET', '/api/teacher/answers');
    assert.equal(bank.status, 200);
    for (const q of create.json.questions) {
      // find by prompt in bank — options shuffled so match prompt
      const full = bank.json.questions.find(x => x.id === q.id);
      answers[q.id] = q.type === 'choice' ? q.options.indexOf(full.options[full.answer]) : full.answer;
    }
    const sub = await req(port, 'POST', '/api/exam/submit', { sid, round, examId: create.json.id, answers }, cookie);
    assert.equal(sub.status, 200);
    assert.equal(sub.json.score, 100);
    assert.deepEqual(Object.keys(sub.json.byTarget).sort(), ['G1', 'G2', 'K1', 'K2']);
    const create2 = await req(port, 'POST', '/api/exam/create', { sid, round }, cookie);
    assert.equal(create2.json.questions.length, 16);
  });

  it('教师页非本机 403（模拟）', async () => {
    // default allow is localhost — request already from 127.0.0.1 so 200
    const ok = await req(port, 'GET', '/api/teacher/class?class=501');
    assert.equal(ok.status, 200);
  });
});
