'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../public/rules.js');
const guidePath = path.join(__dirname, '../public/linear-guide.js');
const G = fs.existsSync(guidePath) ? require(guidePath) : {};

test('shared linear guide exposes navigation and one actionable talisman target', () => {
  assert.equal(typeof G.linearPlan, 'function');
  assert.equal(typeof G.nextAction, 'function');
});

if (G.linearPlan) {
  const next = (stage, part, draft = {}, ctx = {}) => G.nextAction(stage, part, draft, ctx);
  const target = (...args) => next(...args)?.target.selector;
  const current = (...args) => G.linearPlan(...args).find(s => !s.done);
  const rule = { a: 3, sign: '-', b: 2 };
  const tempRows = [{ verb: 'input', obj: 'F' }, { verb: 'calc', obj: 'C', method: 'ok' }, { verb: 'output', obj: 'C' }];

  test('all twelve parts have an initial neutral operation and a concrete active help target', () => {
    for (const st of R.stages) for (const part of st.parts) {
      const draft = part.id === 'steps' && st.id !== 'formula' ? { rows: Array.from({ length: R.problems[st.id].rows }, () => ({})) } : {};
      const plan = G.linearPlan(st.id, part.id, draft, { rule });
      assert.ok(plan.length, `${st.id}.${part.id}`);
      const a = next(st.id, part.id, draft, { rule });
      assert.ok(a?.target?.selector && a.text && a.explanation, `${st.id}.${part.id}`);
      assert.equal(JSON.stringify(draft).includes('input'), false, 'help must not write the student work');
    }
  });

  test('temperature chain opens by completeness, allows wrong earlier answers, and help repairs earliest error', () => {
    const d = { ask: 'F', known: 'F', how: 'formula', slots: { in: 'known', proc: 'how', out: 'ask' } };
    assert.equal(current('temp', 'chain', {}).selector, '#qAsk');
    assert.equal(current('temp', 'chain', { ask: 'F' }).selector, '#qKnown');
    assert.equal(current('temp', 'chain', d).selector, '#check');
    assert.equal(target('temp', 'chain', d), '#qAsk [data-v="C"]');
    assert.equal(target('temp', 'chain', { ...d, ask: 'C' }), '#check');
    assert.equal(current('temp', 'chain', { ...d, known: null }).selector, '#qKnown');
  });

  test('temperature ordering retains either legal multiply/divide order and clears a wrong first operation', () => {
    assert.equal(target('temp', 'order', { ops: ['mul5'] }), '#opsClear');
    assert.match(target('temp', 'order', { ops: ['sub32', 'div9'] }), /mul5/);
    assert.match(target('temp', 'order', { ops: ['sub32', 'mul5'] }), /div9/);
    for (const ops of [['sub32', 'mul5', 'div9'], ['sub32', 'div9', 'mul5']]) {
      assert.equal(target('temp', 'order', { ops }), '#calc');
      assert.equal(target('temp', 'order', { ops, shown: true, reason: 'order' }), '#check');
    }
  });

  test('paper self check is neutral and permits four unselected items before confirmation', () => {
    assert.equal(current('flow', 'paper', { reviewed: 0, checks: [] }).key, 'review-0');
    assert.equal(target('flow', 'paper', { reviewed: 0, checks: [] }), '#paperNext');
    assert.equal(current('flow', 'paper', { reviewed: 4, checks: [] }).selector, '#check');
    assert.equal(R.assessPart('flow', 'paper', { done: true, checks: [] }).ok, true);
    assert.doesNotMatch(next('flow', 'paper', {}).text, /必须勾|全勾/);
  });

  test('flow fix help opens a box first, then points at one visible category', () => {
    assert.equal(target('flow', 'fix', {}), '.fbox[data-id="b0"]');
    assert.equal(target('flow', 'fix', { open: 'b0' }), '.fault-pick [data-k="none"]');
    assert.equal(target('flow', 'fix', { marks: { b0: 'none' } }), '.fbox[data-id="b1"]');
    assert.equal(current('flow', 'fix', { marks: { b0: 'shape' } }).key, 'box-b1');
    assert.equal(target('flow', 'fix', { marks: { b0: 'none', b1: 'none' }, open: 'b1' }), '.fault-pick [data-k="shape"]');
  });

  test('seed multiselect requires a neutral confirmation and repairs only one actual missing or extra result', () => {
    assert.equal(current('seeds', 'chain', { ask: ['m10'] }).key, 'ask-confirm');
    assert.equal(current('seeds', 'chain', { ask: ['m10'], askConfirmed: true }).selector, '#qKnown');
    assert.match(target('seeds', 'chain', { ask: ['m10', 'sum', 'g1'] }), /g1/);
    assert.match(target('seeds', 'chain', { ask: ['sum'] }), /m10/);
    assert.equal(target('seeds', 'chain', { ask: ['m10', 'sum'] }), '#askConfirm');
  });

  test('seed flow and reflection help are local to current work; reflection never selects a viewpoint', () => {
    const shapes = Object.fromEntries(R.seedFlowBoxes.map(b => [b.id, b.shape]));
    assert.equal(target('seeds', 'flow', { shapes: { ...shapes, f5: 'io' } }), '.sp[data-id="f5"][data-s="terminal"]');
    assert.equal(target('signin', 'reflect', {}), '#was');
    assert.equal(target('signin', 'reflect', { was: 'knew' }), '#now');
    assert.equal(target('signin', 'reflect', { was: 'knew', now: 'clear' }), '#check');
    const free = G.linearPlan('signin', 'reflect', {}).find(step => step.selector === '#free');
    assert.equal(free?.done, true, 'optional text follows both reflection groups without requiring writing');
    assert.equal(target('formula', 'steps', {}), '#pick');
  });

  test('signin numeric adjustment remains adjustable until explicit confirmation and help makes one adjustment', () => {
    assert.match(target('signin', 'rule', { a: 1, sign: '+', b: 0 }), /data-k="a".*data-d="1"/);
    assert.equal(target('signin', 'rule', { a: 3, sign: '+', b: 0 }), '#aConfirm');
    assert.equal(target('signin', 'rule', { a: 3, aConfirmed: true, sign: '-', b: 2 }), '#signConfirm');
    assert.equal(target('signin', 'rule', { a: 3, aChanged: true, sign: '+', b: 0 }), '#aConfirm');
    assert.equal(target('signin', 'rule', { a: 3, aChanged: true, aConfirmed: true, sign: '+', b: 0 }), '#sign');
    assert.equal(target('signin', 'rule', { a: 3, aChanged: true, aConfirmed: true, sign: '-', signTouched: true, b: 0 }), '#signConfirm');
    assert.match(target('signin', 'rule', { ...rule, aChanged: true, aConfirmed: true, signTouched: true, signConfirmed: true, bChanged: true, b: 1 }), /data-k="b".*data-d="1"/);
    assert.equal(target('signin', 'rule', { ...rule, aChanged: true, aConfirmed: true, signTouched: true, signConfirmed: true, bChanged: true }), '#check');
  });

  test('numeric and multiselect confirmation buttons stay closed until their operation is completed', () => {
    const startRule = G.linearPlan('signin', 'rule', { a: 1, sign: '+', b: 0 });
    assert.equal(current('signin', 'rule', { a: 1, sign: '+', b: 0 }).key, 'a-adjust');
    assert.equal(startRule.find(x => x.key === 'a-adjust').selector, '.mini-btn[data-k="a"]');
    assert.equal(G.linearPlan('signin', 'rule', { a: 1, sign: '+', b: 0 }).some(x => x.key === 'a-confirm'), true);
    const adjustedRule = G.linearPlan('signin', 'rule', { a: 3, aChanged: true, sign: '+', b: 0 });
    assert.equal(adjustedRule.find(x => !x.done).key, 'a-confirm');
    assert.equal(adjustedRule.find(x => x.key === 'a-confirm').selector, '#aConfirm');
    const afterA = G.linearPlan('signin', 'rule', { a: 3, aChanged: true, aConfirmed: true, sign: '+', b: 0 });
    assert.equal(afterA.find(x => !x.done).key, 'sign-change');
    assert.equal(afterA.find(x => x.key === 'sign-change').selector, '#sign');
    const signed = G.linearPlan('signin', 'rule', { a: 3, aChanged: true, aConfirmed: true, sign: '-', signTouched: true, b: 0 });
    assert.equal(signed.find(x => !x.done).key, 'sign-confirm');
    assert.equal(signed.find(x => x.key === 'sign-confirm').selector, '#signConfirm');
    const adjustedB = G.linearPlan('signin', 'rule', { a: 3, aChanged: true, aConfirmed: true, sign: '-', signTouched: true, signConfirmed: true, b: 2, bChanged: true });
    assert.equal(adjustedB.find(x => !x.done).key, 'check');
    const savedCorrectRule = G.linearPlan('signin', 'rule', { a: 3, sign: '-', b: 2 });
    assert.equal(savedCorrectRule.find(x => !x.done).key, 'a-confirm');
    assert.equal(savedCorrectRule.find(x => x.key === 'a-adjust').done, true);
    assert.equal(savedCorrectRule.find(x => x.key === 'sign-change').done, true);
    assert.equal(savedCorrectRule.find(x => x.key === 'b-adjust').done, true);

    const noAsk = G.linearPlan('seeds', 'chain', { ask: [], askConfirmed: false });
    assert.equal(noAsk.find(x => !x.done).key, 'ask');
    assert.equal(noAsk.find(x => x.key === 'ask').selector, '#qAsk');
    assert.equal(noAsk.some(x => x.key === 'ask-confirm'), true);
    assert.equal(noAsk.find(x => x.key === 'ask-confirm').done, false);
    const askSelected = G.linearPlan('seeds', 'chain', { ask: ['m10'], askConfirmed: false });
    assert.equal(askSelected.find(x => !x.done).key, 'ask-confirm');
    assert.equal(askSelected.find(x => x.key === 'ask-confirm').selector, '#askConfirm');
    const confirmed = G.linearPlan('seeds', 'chain', { ask: ['m10', 'sum'], askConfirmed: true });
    assert.equal(confirmed.find(x => !x.done).key, 'known');
  });

  test('steps preserve legal split inputs and outputs, and target the real failing method', () => {
    const rect = [{ verb: 'input', obj: 'a' }, { verb: 'input', obj: 'b' }, { verb: 'calc', obj: 'c', method: 'ok' }, { verb: 'output', obj: 'c' }];
    const seeds = [{ verb: 'input', obj: 'n' }, { verb: 'calc', obj: 'm', method: 'ok' }, { verb: 'calc', obj: 's', method: 'ok' }, { verb: 'output', obj: 'm' }, { verb: 'output', obj: 's' }];
    assert.equal(target('formula', 'steps', { problem: 'rect', rows: rect }), '#run');
    assert.equal(target('seeds', 'steps', { rows: seeds }), '#run');
    assert.equal(target('temp', 'steps', { rows: tempRows }), '#run');
    assert.equal(target('temp', 'steps', { rows: [tempRows[0], { ...tempRows[1], method: 'none' }, tempRows[2]] }), '.step-row[data-i="1"] .m[data-v="ok"]');
    assert.equal(target('formula', 'steps', { problem: 'rect', rows: [rect[0], { verb: 'input' }, {}, {}] }), '.step-row[data-i="1"] .o[data-v="b"]');
    assert.equal(target('temp', 'steps', { rows: [{ verb: 'output' }, {}, {}] }), '.step-row[data-i="0"] .v[data-v="input"]');
    assert.equal(current('temp', 'steps', { rows: [{ verb: 'calc', obj: 'C' }, {}] }).selector, '.step-row[data-i="0"] .methods');
  });

  test('signin help uses only a validated context rule and unknown content has no target', () => {
    assert.equal(next('signin', 'steps', { rows: [{}], rule }), null);
    assert.ok(next('signin', 'steps', { rows: [{}] }, { rule }));
    assert.equal(next('quiz', 'base', {}), null);
    assert.equal(next('temp', 'unknown', {}), null);
    assert.equal(next('formula', 'steps', { problem: 'injected' }), null);
  });

  test('every method already accepted by the original engine goes straight to execution', () => {
    const rows = [tempRows[0], { verb: 'output', obj: 'F' }, tempRows[1], tempRows[2]];
    assert.equal(R.runSteps('temp', rows).ok, true);
    assert.equal(target('temp', 'steps', { rows }), '#run');
    const extra = [{ verb: 'input', obj: 'F' }, { verb: 'output', obj: 'F' }, {}, {}];
    assert.match(target('temp', 'steps', { rows: extra }), /data-i="2".*data-v="calc"/);
    assert.equal(target('temp', 'steps', { rows: [...tempRows, { verb: 'think' }] }), '.step-row[data-i="3"] .del');
  });

  test('malformed JSON drafts never throw or turn unknown formula identifiers into targets', () => {
    for (const problem of ['__proto__', 'constructor', 'temp', { toString: 3 }, [], 42]) {
      assert.equal(next('formula', 'steps', { problem }), null);
      assert.deepEqual(G.linearPlan('formula', 'steps', { problem }), []);
    }
    for (const rows of [[null, false, 3], ['x'], [{ verb: { toString: 3 } }], [{ verb: 'calc', obj: '__proto__', method: 'bad' }]]) {
      assert.doesNotThrow(() => next('temp', 'steps', { rows }));
    }
    assert.doesNotThrow(() => next('signin', 'rule', { a: { toString: 3 }, b: { valueOf: 3 } }));
    assert.doesNotThrow(() => next('flow', 'paper', { reviewed: { toString: 3 } }));
  });
}
