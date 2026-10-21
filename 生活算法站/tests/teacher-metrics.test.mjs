import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierAttempts, scorePair, answerText } from '../public/teacher-metrics.mjs';

test('基础、挑战和旧版整卷的首次最近成绩互不冒用', () => {
  const student = { quizAttempts: [{ score: 100 }, { tier: 'base', score: 75 }, { tier: 'challenge', score: 100 }, { tier: 'base', score: 81.25 }] };
  assert.deepEqual(tierAttempts(student, 'base').map(x => x.score), [75, 81.25]);
  assert.deepEqual(tierAttempts(student, 'legacy').map(x => x.score), [100]);
  assert.equal(scorePair(tierAttempts(student, 'base')), '75→81.25');
  assert.equal(scorePair([]), '—');
});

test('教师标准答案支持旧选择题、新排序和符号配对', () => {
  assert.equal(answerText({ options: ['甲', '乙'], answer: 1 }), '乙');
  assert.equal(answerText({ type: 'order', interaction: { items: [{ id: 'a', text: '输入' }, { id: 'b', text: '输出' }] }, answer: ['a', 'b'] }), '输入 → 输出');
  assert.equal(answerText({ type: 'flow', interaction: { leftItems: [{ id: 'start', text: '开始' }], rightItems: [{ id: 'round', text: '圆角矩形' }] }, answer: { start: 'round' } }), '开始 → 圆角矩形');
});
