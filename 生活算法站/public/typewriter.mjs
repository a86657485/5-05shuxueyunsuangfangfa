/**
 * 讲解窗口通用效果：打字机逐条出现 + 最少停留时间。
 * - 只有「纯讲解」的窗口用它：剧情卡（story.mjs）、先学卡（learning.mjs）
 * - 无浏览器环境（Node 测试、无 rAF）时自动降级为直接显示、不加锁，
 *   保证测试与离线渲染同步可用。
 */

/** 讲解窗口最少停留毫秒数（学生点击不会早于这个时间生效） */
export const MIN_DWELL_MS = 5000;
/** 剧情正文语速（字/秒），中文中等偏慢 */
export const CPS_STORY = 26;
/** 先学卡语速（字/秒），比剧情略快 */
export const CPS_CARD = 30;
/** 两条要点之间的停顿 */
export const GAP_MS = 240;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** 是否具备动画能力（浏览器 + 有 rAF） */
export function canAnimate() {
  return typeof globalThis.requestAnimationFrame === 'function' && typeof globalThis.document !== 'undefined';
}

/** 纯函数：按语速算打完一句话需要多少毫秒（便于测试与预估） */
export function msForChars(count, cps = CPS_STORY) {
  const n = Math.max(0, Number(count) || 0);
  const speed = Math.max(1, Number(cps) || CPS_STORY);
  return Math.round((n / speed) * 1000);
}

/** 纯函数：按语速估算打完一整组要点需要多少毫秒（含条目间停顿） */
export function estimateMs(pairs, { cps = CPS_STORY, gap = GAP_MS } = {}) {
  const list = pairs || [];
  if (!list.length) return 0;
  const total = list.reduce((sum, [, text]) => sum + msForChars(String(text ?? '').length, cps), 0);
  return total + gap * (list.length - 1);
}

/** 保护期时长：至少 5 秒；要点较多时按打完时间顺延，避免字没打完就能关窗 */
export function dwellFor(pairs, { cps = CPS_STORY, gap = GAP_MS } = {}) {
  return Math.max(MIN_DWELL_MS, estimateMs(pairs, { cps, gap }) + 600);
}

let holdUntil = 0;
/** 讲解窗口当前是否处于「不可关闭」的保护期 */
export function isHeld() {
  return Date.now() < holdUntil;
}

/**
 * 逐字写入一个元素。
 * @param {HTMLElement} el 目标元素
 * @param {string} text 全文
 * @param {{cps?:number, cursor?:boolean}} options
 * @returns {Promise<void>} 打完（或降级直接写完）后 resolve
 */
export function typeInto(el, text, { cps = CPS_STORY, cursor = true } = {}) {
  const full = String(text ?? '');
  if (!canAnimate() || !full) {
    el.textContent = full;
    return Promise.resolve();
  }
  if (cursor) el.classList.add('typing');
  const per = Math.max(12, Math.round(1000 / Math.max(1, cps)));
  let i = 0;
  el.textContent = '';
  return new Promise(resolve => {
    const tick = () => {
      i += 1;
      el.textContent = full.slice(0, i);
      if (i >= full.length) {
        if (cursor) el.classList.remove('typing');
        resolve();
      } else {
        setTimeout(tick, per);
      }
    };
    setTimeout(tick, per);
  });
}

/**
 * 依次打完多条要点：前一条打完、停顿一下，下一条才开始。
 * @param {Array<[HTMLElement, string]>} pairs
 */
export async function typeLines(pairs, { cps = CPS_STORY, gap = GAP_MS, cursor = true } = {}) {
  if (!canAnimate()) {
    for (const [el, text] of pairs) el.textContent = String(text ?? '');
    return;
  }
  for (let i = 0; i < pairs.length; i += 1) {
    const [el, text] = pairs[i];
    await typeInto(el, text, { cps, cursor });
    if (i < pairs.length - 1) await wait(gap);
  }
}

/**
 * 锁定若干按钮一段时间，期间学生无法关闭讲解窗口。
 * @param {HTMLElement[]} buttons 需要禁用的按钮
 * @param {number} ms 停留毫秒
 * @param {{countdown?:HTMLElement}} options countdown 指定在哪个按钮上显示倒计时数字
 */
export function holdButtons(buttons, ms = MIN_DWELL_MS, { countdown = null } = {}) {
  if (!canAnimate() || !(ms > 0)) return;
  const list = (buttons || []).filter(Boolean);
  if (!list.length) return;
  const saved = list.map(btn => ({ btn, disabled: btn.disabled, text: btn.textContent }));
  for (const { btn } of saved) btn.disabled = true;
  holdUntil = Math.max(holdUntil, Date.now() + ms);
  const base = countdown ? countdown.textContent : '';
  let left = Math.ceil(ms / 1000);
  if (countdown) countdown.textContent = `${base}（${left}）`;
  const ticker = setInterval(() => {
    left -= 1;
    if (left > 0 && countdown) countdown.textContent = `${base}（${left}）`;
  }, 1000);
  setTimeout(() => {
    clearInterval(ticker);
    for (const { btn, disabled, text } of saved) {
      btn.disabled = disabled;
      btn.textContent = text;
    }
    holdUntil = 0;
    const target = list.find(btn => !btn.disabled);
    if (target && typeof target.focus === 'function') target.focus();
  }, ms);
}

/** 测试与特殊场景用：立刻解除保护期 */
export function releaseHold() {
  holdUntil = 0;
}
