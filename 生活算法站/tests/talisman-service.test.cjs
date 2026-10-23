'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createService } = require('../server.cjs');
const rules = require('../public/rules.js');

const CHAIN = { ask: 'C', known: 'F', how: 'formula', slots: { in: 'known', proc: 'how', out: 'ask' } };
const roster = [
  { id: 'magic-a', classId: '501', name: '法宝同名' },
  { id: 'magic-b', classId: '501', name: '法宝同名' },
  { id: 'magic-c', classId: '502', name: '法宝乙' }
];

async function setup(t) {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5-talisman-'));
  let date = new Date('2026-10-23T01:00:00Z'), service, url;
  async function start() {
    service = createService({ runtimeDir, roster, now: () => date });
    await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${service.server.address().port}`;
  }
  async function stop() {
    service.server.closeAllConnections();
    await new Promise(resolve => service.server.close(resolve));
    service.close();
  }
  await start();
  const fixture = new DatabaseSync(path.join(runtimeDir, 'classroom.sqlite'));
  t.after(async () => { fixture.close(); await stop(); fs.rmSync(runtimeDir, { recursive: true, force: true }); });
  async function request(route, body, cookie) {
    const res = await fetch(url + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  async function login(id = 'magic-a') {
    const student = roster.find(s => s.id === id);
    const result = await request('/api/login', { classId: student.classId, id });
    assert.equal(result.status, 200);
    return { sid: id, round: result.data.round, cookie: result.cookie, state: result.data };
  }
  const use = (who, eventId, extra = {}) => request('/api/talisman/use', { sid: who.sid, round: who.round, eventId, stage: 'temp', part: 'chain', draft: {}, ...extra }, who.cookie);
  const event = (who, eventId, extra = {}) => request('/api/event', { sid: who.sid, round: who.round, eventId, stage: 'temp', part: 'chain', record: CHAIN, hintLevel: 0, ...extra }, who.cookie);
  function change(who, edit) {
    const saved = JSON.parse(fixture.prepare('SELECT json FROM states WHERE sid=? AND round=?').get(who.sid, who.round).json);
    edit(saved);
    fixture.prepare('UPDATE states SET json=? WHERE sid=? AND round=?').run(JSON.stringify(saved), who.sid, who.round);
  }
  function passStage(saved, stage) {
    for (const part of rules.stageOf(stage).parts) saved.records[stage].parts[part.id] = { first: { assessment: { ok: true, tags: [] } }, last: { assessment: { ok: true, tags: [] } }, attempts: 1, hintMax: 0 };
    saved.awards.push({ stage, points: rules.stageOf(stage).points });
  }
  return { runtimeDir, request, login, use, event, change, passStage, fixture, setDate: value => { date = new Date(value); }, restart: async () => { await stop(); await start(); } };
}

function assertAction(result) {
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.ok(result.data.action?.target?.selector);
  assert.ok(result.data.action.text);
  assert.ok(result.data.action.explanation);
}

test('旧记录默认三次法宝，使用帮助不伪造首答、尝试、通过或积分', async t => {
  const f = await setup(t), who = await f.login();
  assert.deepEqual(who.state.magic, { limit: 3, used: 0, remaining: 3, uses: [] });
  f.change(who, saved => { delete saved.magic; });
  const used = await f.use(who, 'first-magic');
  assertAction(used);
  assert.equal(used.data.remaining, 2);
  assert.equal(used.data.state.magic.used, 1);
  assert.equal(used.data.use.eventId, 'first-magic');
  const state = used.data.state, part = state.records.temp.parts.chain;
  assert.equal(part.hintMax, 3);
  assert.equal(part.talismanUses, 1);
  assert.equal(part.first, null);
  assert.equal(part.last, null);
  assert.equal(part.attempts, 0);
  assert.equal(state.records.temp.history.length, 0);
  assert.equal(state.points, 0);
  assert.deepEqual(state.awards, []);
  assert.equal(rules.stageSummary('temp', state.records.temp, false).pass, false);
});

test('整轮最多三次，第四次不返回新action，同event重放仍返回原凭据且不重扣', async t => {
  const f = await setup(t), who = await f.login();
  let first;
  for (let i = 1; i <= 3; i++) {
    const result = await f.use(who, 'use-' + i);
    assertAction(result);
    assert.equal(result.data.remaining, 3 - i);
    assert.equal(result.data.state.magic.uses.length, i);
    if (i === 1) first = result.data;
  }
  const fourth = await f.use(who, 'use-4');
  assert.equal(fourth.status, 409);
  assert.equal(fourth.data.action, undefined);
  const replay = await f.use(who, 'use-1');
  assertAction(replay);
  assert.deepEqual(replay.data.use, first.use);
  assert.deepEqual(replay.data.action, first.action);
  assert.equal(replay.data.remaining, 0);
  assert.equal(replay.data.state.magic.used, 3);
});

test('并发不同事件只能扣三次，并发同event只扣一次', async t => {
  const f = await setup(t), who = await f.login();
  const duplicates = await Promise.all(Array.from({ length: 8 }, () => f.use(who, 'parallel-same')));
  assert.ok(duplicates.every(r => r.status === 200));
  assert.ok(duplicates.every(r => r.data.remaining === 2));
  const unique = await Promise.all(Array.from({ length: 8 }, (_, i) => f.use(who, 'parallel-' + i)));
  assert.equal(unique.filter(r => r.status === 200).length, 2);
  assert.equal(unique.filter(r => r.status === 409).length, 6);
  const me = (await f.request('/api/me', undefined, who.cookie)).data;
  assert.equal(me.magic.used, 3);
  assert.equal(new Set(me.magic.uses.map(u => u.eventId)).size, 3);
});

test('登录身份、同名身份与轮次隔离，非法请求不消费', async t => {
  const f = await setup(t), a = await f.login(), b = await f.login('magic-b');
  assert.equal((await f.request('/api/talisman/use', { sid: a.sid, round: a.round, stage: 'temp', part: 'chain', draft: {}, eventId: 'anon' })).status, 401);
  assert.equal((await f.use(a, 'wrong-id', { sid: b.sid })).status, 403);
  assert.equal((await f.use(a, 'old-round', { round: 'r0' })).status, 409);
  for (const eventId of ['', ' ', 'x'.repeat(121), null]) assert.equal((await f.use(a, eventId)).status, 400);
  assertAction(await f.use(a, 'same-id'));
  const own = await f.use(b, 'same-id');
  assertAction(own);
  assert.equal(own.data.remaining, 2);
  assert.equal((await f.request('/api/me', undefined, a.cookie)).data.magic.used, 1);
});

test('未知关卡、检测、未开放站或part及错误草稿不消费', async t => {
  const f = await setup(t), who = await f.login();
  for (const extra of [{ stage: 'quiz' }, { stage: 'missing' }, { part: 'missing' }, { draft: [] }, { draft: null }, { draft: { rows: 'nope' } }, { draft: { rows: Array(9).fill({}) } }]) {
    assert.equal((await f.use(who, 'invalid', extra)).status, 400);
  }
  for (const extra of [{ stage: 'flow', part: 'paper' }, { stage: 'formula', part: 'steps' }, { part: 'order' }, { part: 'steps' }]) assert.equal((await f.use(who, 'locked', extra)).status, 409);
  assert.equal((await f.request('/api/me', undefined, who.cookie)).data.magic.used, 0);
});

test('法宝沿用既有进站资格，历史奖励不伪造当前通过或开放检测', async t => {
  const f = await setup(t), who = await f.login();
  f.change(who, saved => { saved.awards.push({ stage: 'temp', points: 10 }); });
  const opened = await f.use(who, 'existing-entry', { stage: 'flow', part: 'paper' });
  assertAction(opened);
  assert.equal(opened.data.remaining, 2);
  assert.equal(rules.stageSummary('temp', opened.data.state.records.temp, true).pass, false);
  assert.equal(opened.data.state.currentExam, undefined);
  assert.equal((await f.request('/api/exam/create', { sid: who.sid, round: who.round }, who.cookie)).status, 409);
});

test('已通过摘要和无操作目标不扣次，明确重做与返改作品仍可求助', async t => {
  const f = await setup(t), who = await f.login();
  await f.event(who, 'passed-chain');
  const unchanged = await f.use(who, 'summary', { draft: { ...CHAIN, summary: true } });
  assert.equal(unchanged.status, 409);
  const noTarget = await f.use(who, 'busy', { draft: { busy: true } });
  assert.equal(noTarget.status, 409);
  const replayWork = await f.use(who, 'redo', { draft: { ...CHAIN, active: true } });
  assertAction(replayWork);
  assert.equal(replayWork.data.action.target.selector, '#check');
  const changed = await f.use(who, 'changed', { draft: { ...CHAIN, ask: 'F' } });
  assertAction(changed);
  assert.equal(changed.data.remaining, 1);
});

test('共享指导没有合法目标时不扣次也不保存帮助记录', async t => {
  const f = await setup(t), who = await f.login();
  f.change(who, saved => f.passStage(saved, 'temp'));
  const emptySteps = await f.use(who, 'no-target', { part: 'steps', draft: { rows: [] } });
  assert.equal(emptySteps.status, 409);
  assert.equal(emptySteps.data.action, undefined);
  assert.equal((await f.request('/api/me', undefined, who.cookie)).data.magic.used, 0);
});

test('刷新、服务重启与重开本站不恢复额度，老师新轮次才恢复', async t => {
  const f = await setup(t), who = await f.login();
  const original = await f.use(who, 'persist');
  assertAction(original);
  await f.restart();
  assert.equal((await f.request('/api/me', undefined, who.cookie)).data.magic.remaining, 2);
  const reset = await f.request('/api/stage/reset', { sid: who.sid, round: who.round, stage: 'temp' }, who.cookie);
  assert.equal(reset.data.magic.remaining, 2);
  assert.deepEqual(reset.data.magic.uses, original.data.state.magic.uses);
  const replay = await f.use(who, 'persist');
  assert.equal(replay.data.remaining, 2);
  assert.equal((await f.login()).state.magic.remaining, 2);
  const next = (await f.request('/api/teacher/new-round', { classId: '501' })).data.round;
  assert.equal((await f.use(who, 'persist')).status, 409);
  const fresh = await f.use({ ...who, round: next }, 'persist');
  assertAction(fresh);
  assert.equal(fresh.data.remaining, 2);
  assert.equal(fresh.data.state.magic.used, 1);
});

test('仅求助也锁定课日，旧课不接受新use或旧use重放且不改保存记录', async t => {
  const f = await setup(t), who = await f.login();
  assertAction(await f.use(who, 'yesterday'));
  const saved = f.fixture.prepare('SELECT json FROM states WHERE sid=? AND round=?').get(who.sid, who.round).json;
  f.setDate('2026-10-24T01:00:00Z');
  for (const eventId of ['today', 'yesterday']) {
    const expired = await f.use(who, eventId);
    assert.equal(expired.status, 409);
    assert.equal(expired.data.action, undefined);
  }
  assert.equal(f.fixture.prepare('SELECT json FROM states WHERE sid=? AND round=?').get(who.sid, who.round).json, saved);
  assert.equal((await f.request('/api/me', undefined, who.cookie)).data.lessonExpired, true);
});

test('法宝与作答使用相同eventId互不吞记录，后续真实首答由服务端标法宝来源', async t => {
  const f = await setup(t), who = await f.login();
  const use = await f.use(who, 'shared-event-id');
  assertAction(use);
  const submitted = await f.event(who, 'shared-event-id');
  assert.equal(submitted.status, 200);
  const part = submitted.data.records.temp.parts.chain;
  assert.equal(part.attempts, 1);
  assert.equal(part.first.assessment.ok, true);
  assert.equal(part.first.hintLevel, 3);
  assert.ok(part.first.helpSources.includes('talisman'));
  assert.equal(part.last.hintLevel, 3);
  assert.equal(submitted.data.magic.used, 1);
  assert.equal((await f.event(who, 'shared-event-id')).data.records.temp.parts.chain.attempts, 1);
  const other = await f.login('magic-b');
  await f.event(other, 'record-before-magic', { record: { ask: 'F' } });
  const laterUse = await f.use(other, 'record-before-magic');
  assertAction(laterUse);
  assert.equal(laterUse.data.state.records.temp.parts.chain.attempts, 1);
});

test('重开后已有法宝来源仍保留，历史首答不会被求助改写，教师可见帮助次数', async t => {
  const f = await setup(t), who = await f.login();
  await f.event(who, 'independent-wrong', { record: { ask: 'F' } });
  assertAction(await f.use(who, 'after-first'));
  const corrected = (await f.event(who, 'corrected')).data.records.temp.parts.chain;
  assert.equal(corrected.first.hintLevel, 0);
  assert.equal(corrected.first.helpSources, undefined);
  assert.equal(corrected.last.hintLevel, 3);
  assert.ok(corrected.last.helpSources.includes('talisman'));
  const teacher = (await f.request('/api/teacher/class?class=501')).data.students.find(s => s.student.id === who.sid);
  assert.equal(teacher.records.temp.parts.chain.talismanUses, 1);
  assert.ok(teacher.records.temp.parts.chain.last.helpSources.includes('talisman'));
  await f.request('/api/stage/reset', { sid: who.sid, round: who.round, stage: 'temp' }, who.cookie);
  const restarted = (await f.event(who, 'after-reset')).data.records.temp.parts.chain;
  assert.equal(restarted.first.hintLevel, 3);
  assert.ok(restarted.first.helpSources.includes('talisman'));
});

test('签到方法法宝仅使用服务器已通过的规律，忽略客户端伪造上下文', async t => {
  const f = await setup(t), who = await f.login();
  const rule = { a: 3, sign: '-', b: 2 };
  f.change(who, saved => {
    for (const stage of ['temp', 'flow', 'seeds']) f.passStage(saved, stage);
    saved.records.signin.parts.rule = { first: { record: rule, assessment: { ok: true, tags: [] } }, last: { record: rule, assessment: { ok: true, tags: [] } }, attempts: 1, hintMax: 0 };
  });
  const draft = { rows: [{ verb: 'input', obj: 'k' }, { verb: 'calc', obj: 'p', method: null }, { verb: 'output', obj: 'p' }], rule: { a: 9, sign: '+', b: 9 } };
  const result = await f.use(who, 'verified-rule', { stage: 'signin', part: 'steps', draft, ctx: { rule: draft.rule } });
  assertAction(result);
  const guide = require('../public/linear-guide.js');
  assert.deepEqual(result.data.action, guide.nextAction('signin', 'steps', draft, { rule }));
  f.change(who, saved => { saved.records.signin.parts.rule.last.assessment.ok = false; });
  assert.equal((await f.use(who, 'unverified-rule', { stage: 'signin', part: 'steps', draft })).status, 409);
  assert.equal((await f.request('/api/me', undefined, who.cookie)).data.magic.used, 1);
});

test('三次额度跨站共享，法宝帮助不会额外扣原有星级或积分', async t => {
  const f = await setup(t), who = await f.login();
  assertAction(await f.use(who, 'temp-help'));
  await f.event(who, 'temp-chain');
  await f.event(who, 'temp-order', { part: 'order', record: { ops: ['sub32', 'mul5', 'div9'], reason: 'order', tries: [['sub32', 'mul5', 'div9']] } });
  const tempDone = await f.event(who, 'temp-steps', { part: 'steps', record: { rows: [{ verb: 'input', obj: 'F' }, { verb: 'calc', obj: 'C', method: 'ok' }, { verb: 'output', obj: 'C' }] } });
  assert.equal(tempDone.data.records.temp.summary.stars, 3);
  assert.equal(tempDone.data.points, 10);
  assertAction(await f.use(who, 'flow-help', { stage: 'flow', part: 'paper' }));
  await f.event(who, 'flow-paper', { stage: 'flow', part: 'paper', record: { done: true, checks: [] } });
  await f.event(who, 'flow-fix', { stage: 'flow', part: 'fix', record: { marks: { b0: 'none', b1: 'shape', b2: 'order', b3: 'order', b4: 'missing' } } });
  const third = await f.use(who, 'seeds-help', { stage: 'seeds', part: 'chain' });
  assertAction(third);
  assert.equal(third.data.remaining, 0);
  assert.deepEqual(third.data.state.magic.uses.map(u => u.stage), ['temp', 'flow', 'seeds']);
  assert.equal(third.data.state.points, 20);
  const exhausted = await f.use(who, 'seeds-fourth', { stage: 'seeds', part: 'chain' });
  assert.equal(exhausted.status, 409);
  assert.equal(exhausted.data.action, undefined);
});
