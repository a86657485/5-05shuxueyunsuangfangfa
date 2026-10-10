'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/rules.js');
const T = [{ verb: 'input', obj: 'F' }, { verb: 'calc', obj: 'C', method: 'ok' }, { verb: 'output', obj: 'C' }];
const S = [{ verb: 'input', obj: 'n' }, { verb: 'calc', obj: 'm', method: 'ok' }, { verb: 'calc', obj: 's', method: 'ok' }, { verb: 'output', obj: 'ms' }];
const rule = { a: 3, sign: '-', b: 2 };

describe('对齐：每个证据点都标注了目标', () => {
  it('四个目标齐全，每个主线证据点至少指向一个目标', () => {
    assert.deepEqual(Object.keys(R.targets), ['G1', 'G2', 'K1', 'K2']);
    for (const st of R.stages) for (const p of st.parts) assert.ok(p.targets.length && p.targets.every(t => R.targets[t]), st.id + '.' + p.id);
    const covered = new Set(R.stages.filter(s => !s.optional).flatMap(s => s.parts.flatMap(p => p.targets)));
    assert.equal(covered.size, 4);
  });
  it('教材数据：50℉→10℃，第10组21粒共120粒，签到15次43分', () => {
    assert.equal(R.expected('temp', { F: 50 }).C, 10);
    assert.deepEqual([R.expected('seeds', { n: 10 }).m, R.expected('seeds', { n: 10 }).s], [21, 120]);
    assert.equal(R.ruleValue(rule, 15), 43);
  });
});

describe('同桌照着做：执行学生写的步骤', () => {
  it('教材三步通过（两个不同的输入都对）', () => {
    const r = R.runSteps('temp', T);
    assert.equal(r.ok, true); assert.equal(r.results.length, 2);
  });
  it('写死答案：50℉ 碰巧对，换 86℉ 暴露 → algo-is-answer', () => {
    const r = R.runSteps('temp', [{ verb: 'input', obj: 'F' }, { verb: 'output', obj: 'ANS' }]);
    assert.equal(r.ok, false); assert.equal(r.tag, 'algo-is-answer'); assert.equal(r.results[0].ok, true);
  });
  it('“算一下”不写方法 → vague-step；“想一想” → vague-step', () => {
    assert.equal(R.runSteps('temp', [T[0], { verb: 'calc', obj: 'C', method: 'none' }, T[2]]).tag, 'vague-step');
    assert.equal(R.runSteps('temp', [{ verb: 'think', obj: null }, ...T]).tag, 'vague-step');
  });
  it('先乘除再减32 → op-order；先输出后计算 → output-early；没输入就算 → missing-input', () => {
    assert.equal(R.runSteps('temp', [T[0], { verb: 'calc', obj: 'C', method: 'bad' }, T[2]]).tag, 'op-order');
    assert.equal(R.runSteps('temp', [T[0], T[2], T[1]]).tag, 'output-early');
    assert.equal(R.runSteps('temp', [T[1], T[0], T[2]]).tag, 'missing-input');
  });
  it('缺输出 → missing-output；输入所求 → ipo-swap', () => {
    assert.equal(R.runSteps('temp', [T[0], T[1]]).tag, 'missing-output');
    assert.equal(R.runSteps('temp', [{ verb: 'input', obj: 'C' }, T[1], T[2]]).tag, 'ipo-swap');
  });
  it('种子：教材四步通过；先算 s 再算 m → dep-order', () => {
    assert.equal(R.runSteps('seeds', S).ok, true);
    assert.equal(R.runSteps('seeds', [S[0], S[2], S[1], S[3]]).tag, 'dep-order');
  });
  it('签到：用学生自己验证过的规律通过；没验证的“×3” → no-verify', () => {
    const rows = [{ verb: 'input', obj: 'k' }, { verb: 'calc', obj: 'p', method: 'mine' }, { verb: 'output', obj: 'p' }];
    assert.equal(R.runSteps('signin', rows, { rule }).ok, true);
    assert.equal(R.runSteps('signin', rows, { rule: { a: 4, sign: '-', b: 3 } }).ok, false);
    assert.equal(R.runSteps('signin', [rows[0], { verb: 'calc', obj: 'p', method: 'times3' }, rows[2]], { rule }).tag, 'no-verify');
  });
  it('选做公式：长方形周长（输入长和宽）通过，“长+宽×2” → op-order', () => {
    assert.equal(R.runSteps('rect', [{ verb: 'input', obj: 'ab' }, { verb: 'calc', obj: 'c', method: 'ok' }, { verb: 'output', obj: 'c' }]).ok, true);
    assert.equal(R.runSteps('rect', [{ verb: 'input', obj: 'ab' }, { verb: 'calc', obj: 'c', method: 'bad' }, { verb: 'output', obj: 'c' }]).tag, 'op-order');
  });
});

describe('证据点判定', () => {
  it('温度三问 + IPO；把所求放进输入 → ipo-swap', () => {
    const ok = { ask: 'C', known: 'F', how: 'formula', slots: { in: 'known', proc: 'how', out: 'ask' } };
    assert.equal(R.assessPart('temp', 'chain', ok).ok, true);
    const bad = R.assessPart('temp', 'chain', { ...ok, slots: { in: 'ask', proc: 'how', out: 'known' } });
    assert.equal(bad.ok, false); assert.ok(bad.tags.includes('ipo-swap'));
    assert.ok(R.assessPart('temp', 'chain', { ...ok, how: 'guess' }).tags.includes('no-method'));
  });
  it('计算顺序：先减32才对（乘5/除9可互换）；首次尝试顺序错也留下标签', () => {
    assert.equal(R.assessPart('temp', 'order', { ops: ['sub32', 'div9', 'mul5'], reason: 'order' }).ok, true);
    assert.equal(R.assessPart('temp', 'order', { ops: ['mul5', 'div9', 'sub32'], reason: 'order' }).ok, false);
    const fixed = R.assessPart('temp', 'order', { ops: ['sub32', 'mul5', 'div9'], reason: 'order', tries: [['mul5', 'div9', 'sub32'], ['sub32', 'mul5', 'div9']] });
    assert.equal(fixed.ok, true); assert.ok(fixed.tags.includes('op-order'));
  });
  it('流程图找错：三处全对且不误判才通过', () => {
    const marks = { b0: 'none', b1: 'shape', b2: 'order', b3: 'order', b4: 'missing' };
    assert.equal(R.assessPart('flow', 'fix', { marks }).ok, true);
    const miss = R.assessPart('flow', 'fix', { marks: { ...marks, b1: 'none' } });
    assert.equal(miss.ok, false); assert.ok(miss.tags.includes('shape-mix'));
    assert.equal(R.assessPart('flow', 'fix', { marks: { ...marks, b0: 'shape' } }).ok, false);
  });
  it('种子：所求两个、先 m 后 s；种子流程图图框', () => {
    assert.equal(R.assessPart('seeds', 'chain', { ask: ['m10', 'sum'], known: 'n-rule', how: 'm-then-s' }).ok, true);
    assert.ok(R.assessPart('seeds', 'chain', { ask: ['m10', 'sum'], known: 'n-rule', how: 's-then-m' }).tags.includes('dep-order'));
    const shapes = Object.fromEntries(R.seedFlowBoxes.map(b => [b.id, b.shape]));
    assert.equal(R.assessPart('seeds', 'flow', { shapes }).ok, true);
    assert.ok(R.assessPart('seeds', 'flow', { shapes: { ...shapes, f2: 'io' } }).tags.includes('shape-mix'));
  });
  it('签到规律需4组举例验证全部吻合；手算43被记录', () => {
    assert.equal(R.assessPart('signin', 'rule', rule).ok, true);
    assert.ok(R.assessPart('signin', 'rule', { a: 1, sign: '+', b: 0 }).tags.includes('no-verify'));
    const a = R.assessPart('signin', 'steps', { rows: [{ verb: 'input', obj: 'k' }, { verb: 'calc', obj: 'p', method: 'mine' }, { verb: 'output', obj: 'p' }], rule, hand: { p: '43' } });
    assert.equal(a.ok, true); assert.equal(a.evidence.handOk, true);
  });
  it('stageSummary：首答保留、仍未纠正只算未通过的点', () => {
    const fail = { assessment: { ok: false, tags: ['op-order'] } }, pass = { assessment: { ok: true, tags: ['op-order'] } };
    const st = { parts: { chain: { first: pass, last: pass, attempts: 1 }, order: { first: fail, last: pass, attempts: 2 }, steps: { first: fail, last: fail, attempts: 1 } } };
    const sum = R.stageSummary('temp', st, false);
    assert.equal(sum.pass, false); assert.equal(sum.currentPart, 'steps');
    assert.deepEqual(sum.lingeringTags, ['op-order']); assert.equal(sum.firstOkCount, 1);
  });
});

describe('星级与通关门禁', () => {
  const pass = { assessment: { ok: true, tags: [] } };
  const fail = { assessment: { ok: false, tags: ['op-order'] } };
  it('PASS_STARS=2；过半1星、全过2星、首答质量好3星', () => {
    assert.equal(R.PASS_STARS, 2);
    assert.equal(R.starGlyphs(2), '★★☆');
    assert.equal(R.starGlyphs(3), '★★★');
    // temp 三证据点：只过 1 个 → 0 星（未过半）；过 2 个 → 1 星；全过 → ≥2
    const one = { parts: { chain: { first: pass, last: pass, attempts: 1 } } };
    assert.equal(R.stageSummary('temp', one, false).stars, 0);
    const two = { parts: {
      chain: { first: pass, last: pass, attempts: 1 },
      order: { first: fail, last: pass, attempts: 2 }
    } };
    const s2 = R.stageSummary('temp', two, false);
    assert.equal(s2.stars, 1); assert.equal(s2.cleared, false);
    const allFirst = { parts: {
      chain: { first: pass, last: pass, attempts: 1 },
      order: { first: pass, last: pass, attempts: 1 },
      steps: { first: pass, last: pass, attempts: 1 }
    } };
    const s3 = R.stageSummary('temp', allFirst, false);
    assert.equal(s3.stars, 3); assert.equal(s3.cleared, true); assert.equal(s3.pass, true);
    const allRetry = { parts: {
      chain: { first: fail, last: pass, attempts: 2 },
      order: { first: fail, last: pass, attempts: 2 },
      steps: { first: fail, last: pass, attempts: 2 }
    } };
    const sRetry = R.stageSummary('temp', allRetry, false);
    assert.equal(sRetry.stars, 2); assert.equal(sRetry.cleared, true);
    assert.deepEqual(sRetry.missing, []);
  });
  it('flow 站：自查+计分；全过且计分点首答对 → 3 星', () => {
    const st = { parts: {
      paper: { first: pass, last: pass, attempts: 1 },
      fix: { first: pass, last: pass, attempts: 1 }
    } };
    const sum = R.stageSummary('flow', st, false);
    assert.equal(sum.stars, 3); assert.equal(sum.cleared, true);
  });
  it('选做 formula：做完即通关；visits 写入 summary', () => {
    const st = { visits: 2, parts: { steps: { first: pass, last: pass, attempts: 1 } } };
    const sum = R.stageSummary('formula', st, true);
    assert.equal(sum.stars, 3); assert.equal(sum.cleared, true); assert.equal(sum.visits, 2);
  });
});
