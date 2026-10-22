'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const base = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');
const url = pathToFileURL(path.join(base, 'public', 'typewriter.mjs')).href;
let T = null;
const load = async () => (T ||= await import(url));

const fakeEl = () => ({
  textContent: '',
  classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } }
});

describe('讲解窗口：最少停留 5 秒', () => {
  it('停留时间不少于 5 秒', async () => {
    const M = await load();
    assert.ok(M.MIN_DWELL_MS >= 5000, '讲解窗口至少要停留 5 秒');
  });

  it('无动画能力时不加锁，避免离线/测试环境卡死', async () => {
    const M = await load();
    assert.equal(M.canAnimate(), false, 'Node 环境不应判定为可动画');
    const btn = { disabled: false, textContent: '开始探究', focus() {} };
    M.holdButtons([btn], M.MIN_DWELL_MS, { countdown: btn });
    assert.equal(btn.disabled, false, '降级环境不应锁住按钮');
    assert.equal(M.isHeld(), false);
  });

  it('剧情卡与先学卡都接入了同一套保护', () => {
    const story = read('public/story.mjs');
    const learning = read('public/learning.mjs');
    for (const src of [story, learning]) {
      assert.match(src, /from '\.\/typewriter\.mjs'/);
      assert.match(src, /holdButtons/);
      assert.match(src, /dwellFor/, '停留时长应按内容长度计算且不少于 5 秒');
      assert.match(src, /isHeld/, '保护期内应屏蔽 ESC');
    }
  });
});

describe('讲解窗口：打字机逐条出现', () => {
  it('语速为中等：剧情 18–36 字/秒，先学卡不慢于剧情', async () => {
    const M = await load();
    for (const cps of [M.CPS_STORY, M.CPS_CARD]) {
      assert.ok(cps >= 18 && cps <= 36, `语速 ${cps} 应在中等区间`);
    }
    assert.ok(M.CPS_CARD >= M.CPS_STORY);
    assert.ok(M.GAP_MS >= 120 && M.GAP_MS <= 500, '条目之间的停顿要短于阅读停顿');
  });

  it('按语速换算耗时，长句不会一瞬间跳完', async () => {
    const M = await load();
    assert.equal(M.msForChars(0), 0);
    assert.equal(M.msForChars(26, 26), 1000);
    assert.equal(M.msForChars(40, 20), 2000);
    assert.ok(M.msForChars(80, M.CPS_STORY) >= 2000, '80 字至少要打 2 秒');
  });

  it('要点多时保护期按打完时间顺延，且不少于 5 秒', async () => {
    const M = await load();
    const short = [['a', '很短的要点']];
    assert.equal(M.dwellFor(short), M.MIN_DWELL_MS, '短文按 5 秒起算');
    const long = Array.from({ length: 5 }, (_, i) => ['x', '这是一条比较长的讲解要点，用来测试顺延逻辑，大约三十多个字。']);
    const est = M.estimateMs(long, { cps: M.CPS_CARD });
    const dwell = M.dwellFor(long, { cps: M.CPS_CARD });
    assert.ok(est > M.MIN_DWELL_MS, '五条长要点应超过 5 秒');
    assert.ok(dwell > est, '保护期要略长于打完时间');
    assert.equal(M.estimateMs([], {}), 0);
  });

  it('降级环境直接整段写入', async () => {
    const M = await load();
    const el = fakeEl();
    await M.typeInto(el, '输入是拿到的数，处理是按规则计算。');
    assert.equal(el.textContent, '输入是拿到的数，处理是按规则计算。');
    assert.equal(el.classList.contains('typing'), false);
  });

  it('逐条写入时按顺序填充每一行', async () => {
    const M = await load();
    const a = fakeEl(), b = fakeEl();
    await M.typeLines([[a, '第一点'], [b, '第二点']], { cps: M.CPS_CARD });
    assert.equal(a.textContent, '第一点');
    assert.equal(b.textContent, '第二点');
  });

  it('先学卡先讲要点、后出例子', () => {
    const src = read('public/learning.mjs');
    assert.match(src, /typeLines\(items\.map/);
    assert.match(src, /exampleHead\.hidden\s*=\s*steps\.hidden\s*=\s*nextNote\.hidden\s*=\s*true/, '例子应在要点讲完后才出现');
  });

  it('剧情正文逐段出现，任务句最后才出现', () => {
    const src = read('public/story.mjs');
    assert.match(src, /typeLines\(paragraphs\.map/);
    assert.match(src, /taskEl\.textContent = ''/);
    assert.match(src, /then\(\(\) => \{ taskEl\.textContent = taskText; \}\)/);
  });

  it('打字机光标有样式且尊重减少动效偏好', () => {
    const css = read('public/style.css');
    assert.match(css, /\.typing::after/);
    assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.typing::after\{animation:none/);
  });
});
