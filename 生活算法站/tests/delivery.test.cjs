'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');

describe('交付约束', () => {
  it('启动脚本不写死 /workspace 路径，按脚本所在目录运行，含 /usr/local/bin', () => {
    const s = read('启动课堂.command');
    assert.equal(s.includes('/workspace'), false);
    assert.ok(s.includes('dirname "$0"'));
    assert.ok(s.includes('/usr/local/bin'));
  });
  it('示例名单只用虚构姓名', () => {
    const ex = JSON.parse(read('roster.example.json'));
    assert.ok(ex.every(s => /^样例同学/.test(s.name)));
  });
  it('音效默认关闭', () => {
    assert.match(read('public/sfx.mjs'), /let on = false;/);
  });
  it('素材离线：页面不引用外部网址', () => {
    for (const f of ['public/index.html', 'public/teacher.html', 'public/app.mjs', 'public/style.css']) assert.equal(/https?:\/\//.test(read(f)), false, f);
  });
});

describe('俯视校园 RPG 主界面', () => {
  it('含 RPG 引擎与离线瓦片/像素角色', () => {
    const rpg = read('public/rpg.mjs');
    assert.match(rpg, /mountRpg/);
    assert.match(rpg, /ArrowUp|WASD/);
    assert.match(rpg, /rpg-stick/);
    assert.equal(/https?:\/\//.test(rpg), false);
    assert.ok(fs.existsSync(path.join(base, 'public/assets/kenney/tiny-town/Tiles/tile_0000.png')));
    assert.ok(fs.existsSync(path.join(base, 'public/assets/pixel/boy_down0.png')));
    assert.ok(fs.existsSync(path.join(base, 'public/assets/kenney/License-tiny-town.txt')));
  });
  it('站点覆盖气象角/黑板前/实验室/阅读小站/公式墙/出门条', () => {
    const rpg = read('public/rpg.mjs');
    for (const name of ['气象角', '黑板前', '实验室', '阅读小站', '公式墙', '出门条']) {
      assert.match(rpg, new RegExp(name));
    }
  });
  it('页面不外链且启动脚本仍无 /workspace', () => {
    assert.equal(read('启动课堂.command').includes('/workspace'), false);
    assert.equal(/https?:\/\//.test(read('public/rpg.mjs')), false);
  });
});
