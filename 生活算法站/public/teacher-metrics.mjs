/* 旧版整卷和两层检测各自统计，避免挑战高分代替基础成绩。 */
export const tierAttempts = (student, tier) => (student.quizAttempts || []).filter(q => (q.tier || 'legacy') === tier);
export const scorePair = attempts => attempts.length ? `${attempts[0].score}→${attempts.at(-1).score}` : '—';
export function answerText(q) {
  if (!q.type || q.type === 'choice') return q.options[q.answer];
  const textOf = (items, id) => (items || []).find(item => item.id === id)?.text || id;
  if (q.type === 'order') return q.answer.map(id => textOf(q.interaction.items, id)).join(' → ');
  return Object.entries(q.answer).map(([left, right]) => `${textOf(q.interaction.leftItems, left)} → ${textOf(q.interaction.rightItems, right)}`).join('；');
}
