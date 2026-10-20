/**
 * 算力工厂 · 题目生成与计分
 * 纯函数、不依赖 DOM，可直接在 Node 中测试（tests/reward.test.cjs）。
 * 题目结构对应本课目标：给一个「输入」，经过机器「处理」（一步或两步运算），求出「输出」。
 */

/** 解锁门槛：课堂检测 80 分以上 */
export const UNLOCK_SCORE = 80;
/** 单局时长（秒） */
export const TOTAL_TIME = 60;
/** 初始生命 */
export const LIVES = 3;

export function calc(x, o) {
  if (o.op === '+') return x + o.n;
  if (o.op === '−') return x - o.n;
  if (o.op === '×') return x * o.n;
  if (o.op === '÷') return x / o.n;
  return NaN;
}

const pick = (list, rng) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];

function makeOp(kind, level, rng) {
  if (kind === '+') return { op: '+', n: level >= 3 ? 4 + Math.floor(rng() * 6) : 2 + Math.floor(rng() * 5) };
  if (kind === '−') return { op: '−', n: 2 + Math.floor(rng() * 5) };
  if (kind === '×') return { op: '×', n: level >= 3 ? 3 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 2) };
  return { op: '÷', n: 2 };
}

/** 出题：保证每一步都是非负整数，结果不超过 400（适合五年级心算） */
export function makeRound(level = 1, rng = Math.random) {
  const firstPool = level >= 3 ? ['+', '−', '×', '×', '÷'] : level >= 2 ? ['+', '−', '×', '×'] : ['+', '−', '×'];
  const twoStep = level >= 2;
  for (let attempt = 0; attempt < 60; attempt++) {
    const ops = [makeOp(pick(firstPool, rng), level, rng)];
    if (twoStep) ops.push(makeOp(pick(['+', '−', '×'], rng), level, rng));
    const input = 2 + Math.floor(rng() * (level >= 3 ? 24 : 12));
    const steps = [];
    let cur = input;
    let ok = true;
    for (const o of ops) {
      const next = calc(cur, o);
      if (!Number.isInteger(next) || next < 0 || next > 400) { ok = false; break; }
      steps.push({ before: cur, op: o.op, n: o.n, after: next });
      cur = next;
    }
    if (ok) return { input, ops, answer: cur, steps };
  }
  const input = 3 + Math.floor(rng() * 9);
  return { input, ops: [{ op: '+', n: 3 }], answer: input + 3, steps: [{ before: input, op: '+', n: 3, after: input + 3 }] };
}

export function shuffleWith(list, rng = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 三个选项：1 个正确 + 2 个干扰项（互不相同、非负） */
export function optionsFor(round, rng = Math.random) {
  const answer = round.answer;
  const pool = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 3, answer - 3, answer + 10, answer - 10];
  const others = [];
  for (const v of pool) {
    if (v < 0 || v === answer || others.includes(v)) continue;
    others.push(v);
    if (others.length === 2) break;
  }
  while (others.length < 2) others.push(answer + 4 + others.length);
  return shuffleWith([answer, ...others], rng);
}

/** 连击加分：10 起，每连一次 +2，最多 +16 */
export function scoreOf(streak) {
  return 10 + Math.min(Math.max(streak, 0), 8) * 2;
}

/** 难度：答对 5 题进两步运算，答对 12 题加入除法 */
export function levelOf(correct) {
  return correct >= 12 ? 3 : correct >= 5 ? 2 : 1;
}

export function rankOf(score) {
  if (score >= 240) return { key: 'S', text: '算力大师 · 一步不差' };
  if (score >= 160) return { key: 'A', text: '换算高手 · 又快又准' };
  if (score >= 90) return { key: 'B', text: '流水线熟练工' };
  return { key: 'C', text: '再来一轮会更快' };
}

/** 把每一步写成可读算式，用于答错后的讲解 */
export function explainOf(round) {
  return round.steps.map(s => `${s.before} ${s.op} ${s.n} = ${s.after}`).join('，再 ');
}

/** 课堂检测历史最高分 */
export function bestQuizScore(attempts) {
  return Math.max(0, ...(attempts || []).map(a => Number(a && a.score) || 0));
}

/** 是否解锁奖励游戏 */
export function rewardUnlocked(attempts) {
  return bestQuizScore(attempts) >= UNLOCK_SCORE;
}
