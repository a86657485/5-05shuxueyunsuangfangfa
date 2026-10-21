'use strict';
const { it } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/rules.js');

it('流程图三类四位置：已标三位置时准确指出仍缺的计算框', () => {
  const record = { marks: { b1: 'shape', b2: 'order', b4: 'missing' } };
  const result = R.assessPart('flow', 'fix', record);
  assert.equal(result.ok, false);
  assert.deepEqual(result.evidence.wrongIds, ['b3']);
  const support = R.supportFor('flow', 'fix', record, result, 3);
  assert.equal(support.target.id, 'b3');
  assert.match(support.text, /计算.*输出|输出.*计算/);
  assert.equal(R.assessPart('flow', 'fix', { marks: { ...record.marks, b3: 'order' } }).ok, true);
});

it('帮助随连续有效错误递进，支持文字不同且不替学生改作品', () => {
  const record = { ask: 'C', known: 'C', how: 'formula', slots: { in: 'known', proc: 'how', out: 'ask' } };
  const before = JSON.stringify(record), result = R.assessPart('temp', 'chain', record);
  assert.deepEqual(result.evidence.wrongIds, ['known']);
  const help = [1, 2, 3].map(n => R.supportFor('temp', 'chain', record, result, n));
  assert.deepEqual(help.map(h => h.level), [1, 2, 3]);
  assert.equal(new Set(help.map(h => h.text)).size, 3);
  assert.ok(help.every(h => h.target.id === 'qKnown'));
  assert.match(help[2].text, /华氏|50/);
  assert.equal(JSON.stringify(record), before);
});

it('实际错误方法字段定位，不把输入首行当所有错题焦点', () => {
  const record = { rows: [{ verb: 'input', obj: 'F' }, { verb: 'calc', obj: 'C', method: 'none' }, { verb: 'output', obj: 'C' }] };
  const result = R.assessPart('temp', 'steps', record);
  assert.equal(result.evidence.row, 1);
  assert.equal(result.evidence.field, 'method');
  const support = R.supportFor('temp', 'steps', record, result, 3);
  assert.deepEqual(support.target, { kind: 'row', row: 1, field: 'method' });
  assert.match(support.text, /第2步.*怎么算/);
});

it('种子流程仅错末框时指末框；所求漏总数时指所求', () => {
  const shapes = Object.fromEntries(R.seedFlowBoxes.map(b => [b.id, b.shape]));
  const record = { shapes: { ...shapes, f5: 'io' } };
  const a = R.assessPart('seeds', 'flow', record);
  assert.deepEqual(a.evidence.wrongIds, ['f5']);
  assert.equal(R.supportFor('seeds', 'flow', record, a, 3).target.id, 'f5');
  const chain = { ask: ['m10'], known: 'n-rule', how: 'm-then-s' };
  assert.equal(R.supportFor('seeds', 'chain', chain, R.assessPart('seeds', 'chain', chain), 3).target.id, 'qAsk');
});

it('种子所求只有总数时补第10组，多选已知第1组时只提示取消多项', () => {
  const onlySum = { ask: ['sum'], known: 'n-rule', how: 'm-then-s' };
  const missing = R.supportFor('seeds', 'chain', onlySum, R.assessPart('seeds', 'chain', onlySum), 3).text;
  assert.match(missing, /补选第10组/);
  assert.doesNotMatch(missing, /补选一共/);
  const extra = { ...onlySum, ask: ['m10', 'sum', 'g1'] };
  const excess = R.supportFor('seeds', 'chain', extra, R.assessPart('seeds', 'chain', extra), 3).text;
  assert.match(excess, /取消第1组/);
  assert.doesNotMatch(excess, /补选/);
});

it('签到按当前差异精准支架，成功不产生错误帮助', () => {
  const record = { a: 3, sign: '+', b: 0 }, a = R.assessPart('signin', 'rule', record);
  const support = R.supportFor('signin', 'rule', record, a, 3);
  assert.match(support.text, /1.*3.*2|3.*1.*2/);
  assert.ok(['sign', 'b'].includes(support.target.id));
  assert.equal(R.supportFor('signin', 'rule', { a: 3, sign: '-', b: 2 }, R.assessPart('signin', 'rule', { a: 3, sign: '-', b: 2 }), 3), null);
});
