'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const quiz = require('../quiz.cjs');
const R = require('../public/rules.js');

describe('检测题库（按目标对齐）', () => {
  it('32题，4个目标各8题，每题标注目标与层级', () => {
    assert.equal(quiz.questions.length, 32);
    assert.deepEqual(quiz.codes, ['G1', 'G2', 'K1', 'K2']);
    for (const q of quiz.questions) {
      assert.ok(R.targets[q.target], q.id);
      assert.ok(['A', 'M', 'T'].includes(q.level), q.id);
      assert.ok(q.answer >= 0 && q.answer < q.options.length);
      assert.equal(new Set(q.options).size, q.options.length, '选项不重复 ' + q.id);
    }
  });
  it('每个目标都有迁移题（T）', () => {
    for (const c of quiz.codes) assert.ok(quiz.questions.some(q => q.target === c && q.level === 'T'), c);
  });
  it('每次抽20题，每个目标5题', () => {
    const pick = quiz.pickQuestions();
    assert.equal(pick.length, 20);
    for (const c of quiz.codes) assert.equal(pick.filter(q => q.target === c).length, 5);
  });
  it('publicQuestion 不泄露答案和解析', () => {
    const p = quiz.publicQuestion(quiz.questions[0]);
    assert.equal('answer' in p, false); assert.equal('explanation' in p, false); assert.equal(p.target, 'G1');
  });
});
