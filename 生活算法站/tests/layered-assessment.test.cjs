'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const quiz = require('../quiz.cjs');
const rules = require('../public/rules.js');
const { createService } = require('../server.cjs');

test('versioned bank preserves legacy items, uses a balanced 16+4 paper and strict structured grading', () => {
  assert.equal(quiz.questions.length, 36);
  const legacy = quiz.questions.filter(q => q.type === 'choice').map(q => Object.fromEntries(['id', 'target', 'goal', 'level', 'prompt', 'options', 'answer', 'explanation'].map(key => [key, q[key]])));
  assert.equal(require('node:crypto').createHash('sha256').update(JSON.stringify(legacy)).digest('hex'), '48bd396d6ba10fa7da4951a2fe9603ed3ac01bdc746ff33a29f306ee0b6f8bf2', 'original 32 questions retain every protected field');
  for (const tier of ['base', 'challenge']) {
    const items = quiz.pickPaper(tier);
    assert.equal(items.length, quiz.paperConfig[tier].count);
    assert.equal(new Set(items.map(q => q.id)).size, items.length);
    for (const target of quiz.codes) assert.equal(items.filter(q => q.target === target).length, quiz.paperConfig[tier].perTarget);
    assert.equal(items.some(q => q.id === 'G2-8'), false);
    for (const q of items) {
      const p = quiz.publicQuestion(q);
      assert.ok(p.literacy); assert.equal(p.tier, tier);
      for (const key of ['answer', 'explanation', 'classificationReason', 'reviewNote', 'evidence', 'scoring']) assert.equal(key in p, false);
      assert.equal(quiz.gradeAnswer(q, q.answer), true);
    }
  }
  const match = quiz.questions.find(q => q.type === 'match');
  assert.equal(quiz.gradeAnswer(match, { ...match.answer, extra: 'one_result' }), false);
  assert.equal(quiz.gradeAnswer(match, Object.fromEntries(Object.keys(match.answer).map(k => [k, 'one_result']))), false);
  const order = quiz.questions.find(q => q.type === 'order');
  assert.equal(quiz.gradeAnswer(order, [...order.answer].reverse()), false);
  assert.equal(quiz.gradeAnswer(order, Object.fromEntries(order.answer.map((v, i) => [i, v]))), false);
});

test('lesson exam gate, base-only rewards, challenge optional, persistent streak and no cross-lesson continuation', async t => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5-layered-'));
  let date = new Date('2026-10-21T01:00:00Z');
  const roster = [{ id: 'only-test-student', classId: '501', name: '测试学生' }];
  const svc = createService({ runtimeDir, roster, now: () => date });
  await new Promise(resolve => svc.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => svc.server.close(() => { svc.close(); fs.rmSync(runtimeDir, { recursive: true, force: true }); resolve(); })));
  const baseUrl = `http://127.0.0.1:${svc.server.address().port}`;
  let cookie;
  async function request(url, body) {
    const res = await fetch(baseUrl + url, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    return { status: res.status, data: await res.json() };
  }
  const login = await request('/api/login', { classId: '501', id: roster[0].id });
  const identity = { sid: roster[0].id, round: login.data.round };
  assert.equal((await request('/api/exam/create', identity)).status, 409);
  assert.equal((await request('/api/reward/status')).data.unlocked, false);
  const wrong = { ask: 'F', known: 'C', how: 'guess', slots: { in: 'ask', proc: 'how', out: 'known' } };
  const ev = (eventId, record = wrong) => request('/api/event', { ...identity, stage: 'temp', part: 'chain', record, eventId });
  for (let n = 1; n <= 3; n++) {
    const result = await ev('wrong-' + n);
    assert.equal(result.data.records.temp.parts.chain.errorStreak, n);
    assert.equal(result.data.records.temp.parts.chain.hintMax, n);
  }
  assert.equal((await ev('wrong-3')).data.records.temp.parts.chain.errorStreak, 3);
  assert.equal((await request('/api/me')).data.records.temp.parts.chain.errorStreak, 3);
  const corrected = await ev('correct', { ask: 'C', known: 'F', how: 'formula', slots: { in: 'known', proc: 'how', out: 'ask' } });
  assert.equal(corrected.data.records.temp.parts.chain.errorStreak, 0);
  assert.equal(corrected.data.records.temp.parts.chain.last.hintLevel, 3);
  // Persist representative prior current-pass evidence only in this isolated fixture database.
  const fixture = new DatabaseSync(path.join(runtimeDir, 'classroom.sqlite'));
  const saved = JSON.parse(fixture.prepare('SELECT json FROM states WHERE sid=? AND round=?').get(identity.sid, identity.round).json);
  for (const stage of rules.stages.filter(s => !s.optional)) for (const part of stage.parts) saved.records[stage.id].parts[part.id] = { first: { assessment: { ok: true, tags: [] } }, last: { assessment: { ok: true, tags: [] } }, attempts: 1, hintMax: 0 };
  fixture.prepare('UPDATE states SET json=? WHERE sid=? AND round=?').run(JSON.stringify(saved), identity.sid, identity.round);
  const me = (await request('/api/me')).data;
  assert.equal(me.currentExam.tier, 'base');
  assert.equal(me.currentExam.questions.length, 16);
  // A subsequent bad revision does not take an already opened examination away.
  await ev('revision-after-open');
  assert.equal((await request('/api/me')).data.currentExam.id, me.currentExam.id);
  const bank = (await request('/api/teacher/answers')).data.questions;
  function answersFor(exam, right) {
    return Object.fromEntries(exam.questions.map((q, index) => {
      const full = bank.find(x => x.id === q.id);
      const answer = q.type === 'choice' ? q.options.indexOf(full.options[full.answer]) : full.answer;
      return [q.id, index < right ? answer : (q.type === 'choice' ? (answer + 1) % q.options.length : null)];
    }));
  }
  const fail = await request('/api/exam/submit', { ...identity, examId: me.currentExam.id, answers: answersFor(me.currentExam, 12) });
  assert.equal(fail.status, 200); assert.equal(fail.data.passed, false); assert.equal(fail.data.score, 75);
  const afterBase = (await request('/api/me')).data;
  assert.equal(afterBase.examStatus.open, true, 'first opening remains open after base submission');
  assert.equal(afterBase.examStatus.baseCompleted, true);
  assert.equal(afterBase.currentExam, undefined);
  assert.equal((await request('/api/reward/status')).data.unlocked, false);
  const challenge = await request('/api/exam/create', { ...identity, tier: 'challenge' });
  assert.equal(challenge.status, 200); assert.equal(challenge.data.questions.length, 4);
  const skipped = await request('/api/exam/skip', { ...identity, examId: challenge.data.id });
  assert.equal(skipped.status, 200); assert.equal(skipped.data.skipped, true);
  assert.equal((await request('/api/me')).data.quizAttempts.length, 1, 'skipping challenge is not a zero-scored attempt');
  assert.equal((await request('/api/me')).data.currentExam, undefined);
  assert.equal((await request('/api/exam/submit', { ...identity, examId: challenge.data.id, answers: {} })).status, 409);
  const challengeRetry = await request('/api/exam/create', { ...identity, tier: 'challenge' });
  await request('/api/exam/submit', { ...identity, examId: challengeRetry.data.id, answers: answersFor(challengeRetry.data, 4) });
  assert.equal((await request('/api/reward/status')).data.unlocked, false);
  const retry = await request('/api/exam/create', { ...identity, tier: 'base' });
  assert.equal(retry.status, 200);
  assert.equal((await request('/api/exam/skip', { ...identity, examId: retry.data.id })).status, 409);
  const pass = await request('/api/exam/submit', { ...identity, examId: retry.data.id, answers: answersFor(retry.data, 13) });
  assert.equal(pass.data.passed, true); assert.equal(pass.data.score, 81.25);
  assert.equal((await request('/api/reward/status')).data.unlocked, true);
  const before = await request('/api/exam/create', identity);
  await request('/api/teacher/exam-close', { classId: '501', closed: true });
  assert.equal((await request('/api/exam/submit', { ...identity, examId: before.data.id, answers: {} })).status, 409);
  await request('/api/teacher/exam-close', { classId: '501', closed: false });
  date = new Date('2026-10-22T01:00:00Z');
  assert.equal((await request('/api/exam/submit', { ...identity, examId: before.data.id, answers: {} })).status, 409);
  assert.equal((await request('/api/reward/status')).data.unlocked, false);
  assert.equal((await request('/api/me')).data.currentExam, undefined);
  fixture.close();
});

test('legacy recovery, event identity/part/round isolation and teacher class controls preserve old data', async t => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5-isolation-'));
  const roster = [{ id: 'isolation-a', classId: '501', name: '测试甲' }, { id: 'isolation-b', classId: '502', name: '测试乙' }];
  const svc = createService({ runtimeDir, roster });
  await new Promise(resolve => svc.server.listen(0, '127.0.0.1', resolve));
  const fixture = new DatabaseSync(path.join(runtimeDir, 'classroom.sqlite'));
  t.after(() => new Promise(resolve => svc.server.close(() => { fixture.close(); svc.close(); fs.rmSync(runtimeDir, { recursive: true, force: true }); resolve(); })));
  const baseUrl = `http://127.0.0.1:${svc.server.address().port}`;
  async function request(url, body, cookie) {
    const res = await fetch(baseUrl + url, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  const a = await request('/api/login', { classId: '501', id: roster[0].id });
  const b = await request('/api/login', { classId: '502', id: roster[1].id });
  const identityA = { sid: roster[0].id, round: a.data.round }, identityB = { sid: roster[1].id, round: b.data.round };
  const saved = JSON.parse(fixture.prepare('SELECT json FROM states WHERE sid=? AND round=?').get(identityA.sid, identityA.round).json);
  const oldEntry = { assessment: { ok: false, tags: ['ipo-swap'] }, hintLevel: 0, record: { ask: 'F' } };
  saved.records.temp.parts.chain = { first: oldEntry, last: oldEntry, attempts: 17, hintMax: 0 };
  saved.records.temp.history = [{ part: 'chain', ok: false }, { part: 'chain', ok: true }, { part: 'chain', ok: false }, { part: 'order', ok: true }, { part: 'chain', ok: false }];
  saved.quizAttempts = [{ id: 'legacy-perfect', score: 100, created: '2026-10-01T01:00:00Z' }];
  fixture.prepare('UPDATE states SET json=? WHERE sid=? AND round=?').run(JSON.stringify(saved), identityA.sid, identityA.round);
  const legacyExam = { id: 'legacy-open', sid: identityA.sid, round: identityA.round, created: '2026-10-01T01:00:00Z', questions: quiz.pickQuestions(), submitted: null };
  fixture.prepare('INSERT INTO exams VALUES(?,?,?,?)').run(legacyExam.id, identityA.sid, identityA.round, JSON.stringify(legacyExam));
  assert.equal((await request('/api/me', null, a.cookie)).data.currentExam, undefined);
  assert.equal((await request('/api/reward/status', null, a.cookie)).data.unlocked, false);
  assert.equal((await request('/api/exam/submit', { ...identityA, examId: legacyExam.id, answers: {} }, a.cookie)).status, 409);
  const record = { ask: 'F', known: 'C', how: 'guess', slots: { in: 'ask', proc: 'how', out: 'known' } };
  const body = { ...identityA, stage: 'temp', part: 'chain', eventId: 'shared-offline-event', record };
  assert.equal((await request('/api/event', { ...body, sid: identityB.sid }, a.cookie)).status, 403);
  assert.equal((await request('/api/event', { ...body, eventId: '' }, a.cookie)).status, 400);
  const correctedHistory = (await request('/api/event', body, a.cookie)).data.records.temp.parts.chain;
  assert.equal(correctedHistory.errorStreak, 3); assert.equal(correctedHistory.attempts, 18);
  assert.equal(correctedHistory.first.hintLevel, 0); assert.equal(correctedHistory.last.hintLevel, 2); assert.equal(correctedHistory.hintMax, 3);
  assert.equal((await request('/api/event', body, a.cookie)).data.records.temp.parts.chain.attempts, 18);
  const otherPart = await request('/api/event', { ...body, part: 'order', eventId: 'other-part', record: { ops: ['mul5', 'div9', 'sub32'], reason: 'guess' } }, a.cookie);
  assert.equal(otherPart.data.records.temp.parts.order.errorStreak, 1);
  assert.equal(otherPart.data.records.temp.parts.chain.errorStreak, 3);
  const otherStudent = await request('/api/event', { ...body, ...identityB }, b.cookie);
  assert.equal(otherStudent.data.records.temp.parts.chain.errorStreak, 1);
  await request('/api/teacher/exam-close', { classId: '501', closed: true });
  assert.equal((await request('/api/teacher/class?class=501')).data.examClosed, true);
  assert.equal((await request('/api/teacher/class?class=502')).data.examClosed, false);
  assert.equal((await request('/api/teacher/class?class=503')).data.examClosed, false);
  const bank = (await request('/api/teacher/answers')).data;
  assert.equal(bank.config.base.count, 16); assert.equal(bank.config.challenge.count, 4);
  assert.equal(bank.bankVersion, quiz.BANK_VERSION); assert.equal(bank.paperVersion, quiz.PAPER_VERSION);
  const newRound = (await request('/api/teacher/new-round', { classId: '501' })).data.round;
  assert.notEqual(newRound, identityA.round);
  assert.equal((await request('/api/event', body, a.cookie)).status, 409);
  const fresh = await request('/api/event', { ...body, round: newRound }, a.cookie);
  assert.equal(fresh.data.records.temp.parts.chain.errorStreak, 1);
  assert.equal(fresh.data.records.temp.parts.chain.first.hintLevel, 0);
  assert.equal(fresh.data.examStatus.closed, false);
  assert.equal(fresh.data.quizAttempts.length, 0);
  const historical = JSON.parse(fixture.prepare('SELECT json FROM states WHERE sid=? AND round=?').get(identityA.sid, identityA.round).json);
  assert.equal(historical.quizAttempts[0].id, 'legacy-perfect');
  assert.equal(historical.quizAttempts[0].score, 100);
  assert.equal(historical.records.temp.parts.chain.attempts, 18);
  assert.equal(fixture.prepare('SELECT json FROM exams WHERE id=?').get(legacyExam.id).json, JSON.stringify(legacyExam));
});

test('昨日学习可跨日继续补站，未满四站不自动开考，新轮次回到空白', async t => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5-learning-day-'));
  let date = new Date('2026-10-21T01:00:00Z');
  const sid = 'day-student', svc = createService({ runtimeDir, roster: [{ id: sid, classId: '501', name: '课日样例' }], now: () => date });
  await new Promise(resolve => svc.server.listen(0, '127.0.0.1', resolve));
  const fixture = new DatabaseSync(path.join(runtimeDir, 'classroom.sqlite'));
  t.after(() => new Promise(resolve => svc.server.close(() => { fixture.close(); svc.close(); fs.rmSync(runtimeDir, { recursive: true, force: true }); resolve(); })));
  const url = `http://127.0.0.1:${svc.server.address().port}`;
  let cookie;
  async function request(route, body) {
    const res = await fetch(url + route, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    return { status: res.status, data: await res.json() };
  }
  const login = await request('/api/login', { classId: '501', id: sid });
  const identity = { sid, round: login.data.round };
  const record = { ask: 'C', known: 'F', how: 'formula', slots: { in: 'known', proc: 'how', out: 'ask' } };
  const first = await request('/api/event', { ...identity, stage: 'temp', part: 'chain', eventId: 'yesterday-only-temp', record });
  assert.equal(first.data.learningDay, '2026-10-21');
  assert.equal(first.data.currentExam, undefined);
  // Simulate a legacy state written before learningDay existed; first.created is authoritative.
  const old = JSON.parse(fixture.prepare('SELECT json FROM states WHERE sid=? AND round=?').get(sid, identity.round).json);
  delete old.learningDay;
  old.updated = '2026-10-22T00:00:00Z';
  fixture.prepare('UPDATE states SET json=? WHERE sid=? AND round=?').run(JSON.stringify(old), sid, identity.round);
  date = new Date('2026-10-22T01:00:00Z');
  // 同一轮次跨天不再判定过期：学生第二天回来可以继续做
  const continued = (await request('/api/me')).data;
  assert.equal(continued.lessonExpired, false);
  assert.equal(continued.learningDay, '2026-10-21', '仍记录第一次学习日');
  assert.equal(continued.currentExam, undefined);
  assert.ok(continued.records.temp.parts.chain, '昨天的记录保留');
  const attempt = await request('/api/event', {
    ...identity, stage: 'temp', part: 'order', eventId: 'today-order',
    record: { ops: ['sub32', 'mul5', 'div9'], reason: 'order', tries: [['sub32', 'mul5', 'div9']] }
  });
  assert.equal(attempt.status, 200, '跨日应能继续作答');
  assert.ok(attempt.data.records.temp.parts.order, '新作答被记录');
  assert.ok(attempt.data.records.temp.parts.chain, '旧作答不丢');
  assert.equal((await request('/api/visit', { ...identity, stage: 'temp' })).status, 200, '跨日应能进站');
  // 没有完成四个必做站，不会自动开考
  assert.equal(fixture.prepare('SELECT count(*) AS n FROM exams WHERE sid=?').get(sid).n, 0);
  const next = (await request('/api/teacher/new-round', { classId: '501' })).data.round;
  const fresh = await request('/api/event', { sid, round: next, stage: 'temp', part: 'chain', eventId: 'today-fresh', record });
  assert.equal(fresh.status, 200); assert.equal(fresh.data.lessonExpired, false); assert.equal(fresh.data.learningDay, '2026-10-22');
});
