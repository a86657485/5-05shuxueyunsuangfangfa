'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const base = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');
// Windows 下绝对路径要转成 file:// URL 才能被 ESM 加载器接受
const rulesUrl = pathToFileURL(path.join(base, 'public', 'reward-rules.mjs')).href;
let loaded = null;
const load = async () => (loaded ||= await import(rulesUrl));

describe('奖励小游戏 · 出题与判分', () => {
  it('每题答案都是非负整数，且分步结果与最终答案一致', async () => {
    const R = await load();
    for (let i = 0; i < 400; i++) {
      const level = 1 + (i % 3);
      const round = R.makeRound(level);
      assert.ok(Number.isInteger(round.answer), '答案必须是整数');
      assert.ok(round.answer >= 0, '答案不能为负');
      assert.ok(round.steps.length >= 1);
      assert.equal(round.steps[round.steps.length - 1].after, round.answer);
      assert.equal(round.steps[0].before, round.input);
      for (let k = 1; k < round.steps.length; k++) assert.equal(round.steps[k].before, round.steps[k - 1].after, '上一步的输出就是下一步的输入');
      for (const s of round.steps) assert.ok(Number.isInteger(s.after) && s.after >= 0, '每步都是非负整数');
    }
  });

  it('难度递增：低难度一步、高难度两步（并出现除法）', async () => {
    const R = await load();
    for (let i = 0; i < 60; i++) assert.equal(R.makeRound(1).ops.length, 1);
    for (let i = 0; i < 60; i++) assert.equal(R.makeRound(3).ops.length, 2);
    assert.equal(R.levelOf(0), 1);
    assert.equal(R.levelOf(4), 1);
    assert.equal(R.levelOf(5), 2);
    assert.equal(R.levelOf(11), 2);
    assert.equal(R.levelOf(12), 3);
  });

  it('三个选项互不相同且包含正确答案', async () => {
    const R = await load();
    for (let i = 0; i < 300; i++) {
      const round = R.makeRound(1 + (i % 3));
      const opts = R.optionsFor(round);
      assert.equal(opts.length, 3);
      assert.equal(new Set(opts).size, 3, '选项不能重复');
      assert.ok(opts.includes(round.answer), '必须包含正确答案');
      assert.ok(opts.every(v => v >= 0), '干扰项不能是负数');
    }
  });

  it('连击加分单调且封顶', async () => {
    const R = await load();
    assert.equal(R.scoreOf(0), 10);
    assert.ok(R.scoreOf(3) > R.scoreOf(2));
    assert.equal(R.scoreOf(8), R.scoreOf(30), '连击加分封顶');
  });

  it('评级按分数分档', async () => {
    const R = await load();
    assert.equal(R.rankOf(0).key, 'C');
    assert.equal(R.rankOf(90).key, 'B');
    assert.equal(R.rankOf(160).key, 'A');
    assert.equal(R.rankOf(240).key, 'S');
  });

  it('答错讲解能还原每一步算式', async () => {
    const R = await load();
    const round = { input: 7, ops: [{ op: '×', n: 2 }, { op: '+', n: 3 }], answer: 17, steps: [{ before: 7, op: '×', n: 2, after: 14 }, { before: 14, op: '+', n: 3, after: 17 }] };
    assert.equal(R.explainOf(round), '7 × 2 = 14，再 14 + 3 = 17');
  });
});

describe('奖励小游戏 · 解锁门槛', () => {
  it('课堂检测 80 分及以上才解锁', async () => {
    const R = await load();
    assert.equal(R.UNLOCK_SCORE, 80);
    assert.equal(R.rewardUnlocked([]), false);
    assert.equal(R.rewardUnlocked(undefined), false);
    assert.equal(R.rewardUnlocked([{ score: 79 }]), false);
    assert.equal(R.rewardUnlocked([{ score: 80 }]), true);
    assert.equal(R.rewardUnlocked([{ score: 55 }, { score: 85 }]), true, '取历史最高分');
  });

  it('最高分容错：缺字段或异常值不影响判定', async () => {
    const R = await load();
    assert.equal(R.bestQuizScore([{ score: 60 }, {}, { score: null }]), 60);
    assert.equal(R.bestQuizScore([{ score: '95' }]), 95);
    assert.equal(R.rewardUnlocked([{ score: '90' }]), true);
  });
});

describe('奖励小游戏 · 页面接入', () => {
  it('三个文件齐备且不引用外部网址', () => {
    for (const f of ['public/reward.mjs', 'public/reward.css', 'public/reward-rules.mjs']) {
      assert.ok(fs.existsSync(path.join(base, f)), f);
      assert.equal(/https?:\/\//.test(read(f)), false, f);
    }
  });

  it('学生端挂上了样式、屏幕与 HUD 入口', () => {
    const html = read('public/index.html');
    assert.match(html, /\/reward\.css/);
    assert.match(html, /id="reward"/);
    assert.match(html, /id="reward-btn"/);
    assert.equal(/https?:\/\//.test(html), false);
  });

  it('app.mjs 只在解锁后显示入口', () => {
    const app = read('public/app.mjs');
    assert.match(app, /rewardUnlocked/);
    assert.match(app, /openReward/);
    assert.match(app, /'reward'/);
    assert.equal(/https?:\/\//.test(app), false);
  });
});
