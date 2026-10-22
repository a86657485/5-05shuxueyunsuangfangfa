'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const base = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');
const url = pathToFileURL(path.join(base, 'public', 'skins.mjs')).href;
let S = null;
const load = async () => (S ||= await import(url));

const stateWith = stars => ({ awards: Object.entries(stars).map(([stage, s]) => ({ stage, stars: s })), records: {} });

describe('换装奖励：三星解锁', () => {
  it('默认形象始终可用，奖励装扮按站解锁', async () => {
    const M = await load();
    const empty = M.catalog({ awards: [], records: {} });
    assert.equal(empty.length, 10, '2 个默认 + 4 套 × 男女');
    assert.equal(empty.filter(s => !s.stage).every(s => s.unlocked), true, '默认形象不受关卡限制');
    assert.equal(empty.filter(s => s.stage).every(s => !s.unlocked), true, '未通关时奖励装扮全部锁住');

    const temp3 = M.catalog(stateWith({ temp: 3 }));
    const weather = temp3.filter(s => s.stage === 'temp');
    assert.equal(weather.length, 2, '每套有男女两款');
    assert.ok(weather.every(s => s.unlocked), '温度换算三星应解锁气象观测员');
    assert.ok(temp3.filter(s => s.stage === 'flow').every(s => !s.unlocked), '其他站仍未解锁');
  });

  it('两颗星不解锁，必须满三星', async () => {
    const M = await load();
    assert.equal(M.starsOf(stateWith({ temp: 2 }), 'temp'), 2);
    const list = M.catalog(stateWith({ temp: 2 }));
    assert.ok(list.filter(s => s.stage === 'temp').every(s => !s.unlocked));
  });

  it('四站全满三星则四套全解锁', async () => {
    const M = await load();
    const list = M.catalog(stateWith({ temp: 3, flow: 3, seeds: 3, signin: 3 }));
    assert.equal(list.filter(s => s.stage && s.unlocked).length, 8);
  });

  it('星级可回退读取当前回合小结', async () => {
    const M = await load();
    const state = { awards: [], records: { seeds: { summary: { stars: 3 } } } };
    assert.equal(M.starsOf(state, 'seeds'), 3);
    assert.equal(M.starsOf({ awards: [], records: {} }, 'seeds'), 0);
    assert.equal(M.starsOf({ awards: [{ stage: 'seeds', stars: 1 }], records: { seeds: { summary: { stars: 3 } } } }, 'seeds'), 1, '以通关记录为准');
  });

  it('能识别“本次刚刚达成三星”', async () => {
    const M = await load();
    const before = M.starSnapshot(stateWith({ temp: 2, flow: 0, seeds: 0, signin: 0 }));
    const after = stateWith({ temp: 3, flow: 0, seeds: 0, signin: 0 });
    assert.deepEqual(M.newlyUnlocked(before, after), ['气象观测员']);
    const again = M.starSnapshot(after);
    assert.deepEqual(M.newlyUnlocked(again, after), [], '重复提交不应反复提示');
    assert.deepEqual(M.newlyUnlocked(M.starSnapshot(stateWith({ temp: 1 })), stateWith({ temp: 3, flow: 3 })), ['气象观测员', '流程设计师']);
  });

  it('解锁过的装扮在换轮次后仍然可用', async () => {
    const M = await load();
    const fresh = { awards: [], records: {} };
    const list = M.catalog(fresh, new Set(['temp']));
    assert.ok(list.filter(s => s.stage === 'temp').every(s => s.unlocked), '记忆中的装扮应保持解锁');
    assert.ok(list.filter(s => s.stage === 'flow').every(s => !s.unlocked));
  });

  it('记忆按学生区分，且忽略未知站点', async () => {
    const M = await load();
    const saved = globalThis.localStorage;
    globalThis.localStorage = { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = String(v); } };
    try {
      const a = { classId: '501', id: 'a' }, b = { classId: '501', id: 'b' };
      assert.equal(M.loadRemembered(a).size, 0);
      M.rememberStages(a, ['temp', 'bogus']);
      assert.deepEqual([...M.loadRemembered(a)], ['temp']);
      assert.equal(M.loadRemembered(b).size, 0, '不同学生互不影响');
      M.rememberFromState(a, { awards: [{ stage: 'seeds', stars: 3 }, { stage: 'flow', stars: 2 }], records: {} });
      assert.deepEqual([...M.loadRemembered(a)].sort(), ['seeds', 'temp'], '只记住三星的站');
    } finally {
      if (saved === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = saved;
    }
  });

  it('角色 id 与性别一一对应', async () => {
    const M = await load();
    assert.equal(M.skinId('Weather', 'male'), 'maleWeather');
    assert.equal(M.skinId('Weather', 'female'), 'femaleWeather');
    assert.equal(M.genderOf('femaleFlow'), 'female');
    assert.equal(M.genderOf('maleFlow'), 'male');
  });
});

describe('换装奖励：素材齐备', () => {
  const poses = ['cheer0', 'cheer1', 'idle', 'interact', 'show', 'think', 'walk0', 'walk1', 'walk2', 'walk3', 'walk4', 'walk5', 'walk6', 'walk7'];
  const dir = path.join(base, 'public', 'assets', 'kenney', 'characters');

  it('十款形象 × 十四个姿势的精灵都存在且是 PNG', async () => {
    const M = await load();
    const ids = M.catalog({ awards: [], records: {} }).map(s => s.id);
    assert.equal(ids.length, 10);
    for (const id of ids) {
      for (const pose of poses) {
        const file = path.join(dir, `${id}_${pose}.png`);
        assert.ok(fs.existsSync(file), `缺少 ${id}_${pose}.png`);
        const head = fs.readFileSync(file).subarray(0, 8);
        assert.deepEqual([...head], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${id}_${pose}.png 不是 PNG`);
      }
    }
  });

  it('八款奖励装扮都有专属立绘，体积可控', async () => {
    const M = await load();
    const ids = M.catalog({ awards: [], records: {} }).filter(s => s.stage).map(s => s.id);
    assert.equal(ids.length, 8);
    let total = 0;
    for (const id of ids) {
      assert.equal(M.portraitFor(id), `/assets/skins/portrait_${id}.png`);
      const file = path.join(base, 'public', 'assets', 'skins', `portrait_${id}.png`);
      assert.ok(fs.existsSync(file), `缺少立绘 ${id}`);
      total += fs.statSync(file).size;
    }
    assert.ok(total < 1.2 * 1024 * 1024, '立绘总量应小于 1.2MB');
    assert.equal(M.portraitFor('maleAdventurer'), null, '默认形象沿用原精灵');
  });

  it('新角色与原角色同尺寸（同风格，不改绘制比例）', async () => {
    const size = file => {
      const b = fs.readFileSync(path.join(dir, file));
      return [b.readUInt32BE(16), b.readUInt32BE(20)];
    };
    const ref = size('maleAdventurer_idle.png');
    for (const id of ['maleWeather', 'femaleWeather', 'maleFlow', 'femaleFlow', 'maleSeeds', 'femaleSeeds', 'maleSignin', 'femaleSignin']) {
      assert.deepEqual(size(`${id}_idle.png`), ref, `${id} 尺寸应与原角色一致`);
    }
  });
});

describe('换装奖励：接入学生端', () => {
  it('学生端改用换装面板，角色表包含新装扮', () => {
    const app = read('public/app.mjs');
    assert.match(app, /from '\.\/skins\.mjs'/);
    assert.match(app, /openSkinPicker/);
    assert.match(app, /newlyUnlocked/);
    const rpg = read('public/rpg.mjs');
    for (const id of ['maleWeather', 'femaleWeather', 'maleFlow', 'maleSeeds', 'maleSignin']) assert.match(rpg, new RegExp(id));
  });

  it('页面不外链', async () => {
    assert.equal(/https?:\/\//.test(read('public/skins.mjs')), false);
  });
});
