'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const R = require('../public/rules.js');
const base = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');
const answersUrl = pathToFileURL(path.join(base, 'public', 'answers.mjs')).href;
let A = null;
const load = async () => (A ||= await import(answersUrl));

describe('各站标准答案：与关卡数据一一对应', () => {
  it('每站每证据点都有一条标准答案，且没有多余条目', async () => {
    const { ANSWER_SHEET } = await load();
    assert.equal(ANSWER_SHEET.length, R.stages.length);
    for (const st of R.stages) {
      const sheet = ANSWER_SHEET.find(s => s.stage === st.id);
      assert.ok(sheet, `缺少站点 ${st.id}`);
      assert.deepEqual(sheet.parts.map(p => p.id).sort(), st.parts.map(p => p.id).sort(), `${st.id} 证据点不齐`);
      assert.equal(sheet.short, st.short, `${st.id} 简称与关卡不一致`);
      assert.equal(!!sheet.optional, !!st.optional, `${st.id} 选做标记不一致`);
    }
  });

  it('每个证据点至少两条问答，且答案非空', async () => {
    const { ANSWER_SHEET } = await load();
    for (const st of ANSWER_SHEET) {
      for (const p of st.parts) {
        assert.ok(p.items.length >= 2, `${st.stage}.${p.id} 答案太少`);
        for (const [q, a] of p.items) {
          assert.ok(q && String(q).trim(), `${st.stage}.${p.id} 问题为空`);
          assert.ok(a && String(a).trim(), `${st.stage}.${p.id} 答案为空`);
        }
      }
    }
  });

  it('学生端参考答案表覆盖同样的证据点', async () => {
    const { TEST_ANSWERS } = await load();
    for (const st of R.stages) {
      for (const p of st.parts) {
        const key = `${st.id}.${p.id}`;
        assert.ok(TEST_ANSWERS[key], `缺少参考答案 ${key}`);
      }
    }
  });
});

describe('各站标准答案：数值与规则引擎一致', () => {
  it('温度换算与种子、签到三题的答案对不对', async () => {
    const { ANSWER_SHEET } = await load();
    const text = (sid, pid) => ANSWER_SHEET.find(s => s.stage === sid).parts.find(p => p.id === pid).items.map(([, a]) => a).join(' ');
    // 温度：50℉ = 10℃
    assert.equal(R.expected('temp', { F: 50 }).C, 10);
    assert.match(text('temp', 'chain'), /10℃|摄氏温度/);
    // 种子：n=10 → 21 粒、120 粒
    assert.equal(R.expected('seeds', { n: 10 }).m, 21);
    assert.equal(R.expected('seeds', { n: 10 }).s, 120);
    assert.match(text('seeds', 'chain'), /21|120/);
    // 签到：15 次 = 43 分，规律 3k−2
    assert.equal(R.expected('signin', { k: 15 }).p, 43);
    assert.match(text('signin', 'rule'), /43/);
    assert.match(text('signin', 'rule'), /3\s*×\s*签到次数\s*−\s*2/);
  });

  it('签到规律 3×次数−2 能复现表里每一行', async () => {
    for (const [k, p] of R.signinTable) assert.equal(R.ruleValue({ a: 3, sign: '-', b: 2 }, k), p, `第 ${k} 次`);
  });

  it('温度三步写法的判定与实际一致', async () => {
    const ok = [{ verb: 'input', obj: 'F' }, { verb: 'calc', obj: 'C', method: 'ok' }, { verb: 'output', obj: 'C' }];
    assert.equal(R.assessPart('temp', 'steps', { rows: ok }).ok, true);
    const bad = [{ verb: 'input', obj: 'F' }, { verb: 'calc', obj: 'C', method: 'bad' }, { verb: 'output', obj: 'C' }];
    assert.equal(R.assessPart('temp', 'steps', { rows: bad }).ok, false);
  });
});

describe('教师大屏：标准答案已接入', () => {
  it('大屏引用了同一份答案数据并渲染出板块', () => {
    const t = read('public/teacher.mjs');
    assert.match(t, /from '\.\/answers\.mjs'/);
    assert.match(t, /ANSWER_SHEET/);
    assert.match(t, /各站标准答案/);
    assert.match(t, /ansbox/);
  });

  it('学生端参考答案也来自同一份数据', () => {
    const app = read('public/app.mjs');
    assert.match(app, /from '\.\/answers\.mjs'/);
    assert.equal(/const TEST_ANSWERS = \{/.test(app), false, '不应再各自维护一份答案');
  });

  it('页面不外链', () => {
    for (const f of ['public/answers.mjs', 'public/teacher.mjs']) assert.equal(/https?:\/\//.test(read(f)), false, f);
  });
});
