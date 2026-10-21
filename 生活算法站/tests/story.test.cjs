'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const modulePromise = import('../public/story.mjs');
const chapterIds = ['intro', 'temp', 'flow', 'seeds', 'signin', 'formula', 'quiz', 'complete'];
const copy = chapter => [chapter.title, chapter.speaker, ...(Array.isArray(chapter.text) ? chapter.text : [chapter.text]), chapter.task, chapter.imageAlt, chapter.action, chapter.outcome || ''].join(' ');

test('剧情模块可在无 document 的环境导入，八个章目具有完整展示数据', async () => {
  const { STORY, openStory } = await modulePromise;
  assert.deepEqual(Object.keys(STORY), chapterIds);
  assert.equal(typeof openStory, 'function');
  for (const id of chapterIds) {
    for (const field of ['title', 'speaker', 'text', 'task', 'image', 'imageAlt', 'action']) {
      assert.ok(STORY[id][field]?.length, `${id}.${field} 应有内容`);
    }
    assert.match(STORY[id].image, /^\.\/assets\/story\/.+\.png$/);
  }
});

test('四站串联校园开放日接待与体验指南，不增加科学观察剧情', async () => {
  const { STORY } = await modulePromise;
  assert.match(copy(STORY.intro), /校园开放日/);
  assert.match(copy(STORY.intro), /友好学校|友校/);
  assert.match(copy(STORY.intro), /校园体验指南/);
  for (const id of ['temp', 'flow', 'seeds', 'signin']) {
    assert.match(copy(STORY[id]), /指南|来访伙伴|开放日/, `${id} 应回到同一个真实任务`);
  }
  const all = Object.values(STORY).map(copy).join(' ');
  assert.doesNotMatch(all, /科学观察日|观察日志|实验签到|生物知识|科普|光合作用|科学小知识/);
});

test('气象角只给板报原始数据与任务，保留二月平均气温 50℉', async () => {
  const { STORY } = await modulePromise;
  const text = copy(STORY.temp);
  assert.match(text, /介绍板报/);
  assert.match(text, /2月|二月/);
  assert.match(text, /平均气温/);
  assert.match(text, /50\s*℉/);
  assert.match(text, /摄氏/);
});

test('黑板前要求写清并检查同伴能够执行的流程，不代选步骤', async () => {
  const { STORY } = await modulePromise;
  const text = copy(STORY.flow);
  assert.match(text, /黑板/);
  assert.match(text, /同伴|伙伴/);
  assert.match(text, /流程|步骤/);
  assert.match(text, /检查|试做/);
  assert.doesNotMatch(text, /先减|再乘|再除|正确选项|选第[一二三四]/);
});

test('实验室保留教材分豆条件，阅读站保留原有签到积分换购规则', async () => {
  const { STORY } = await modulePromise;
  assert.match(copy(STORY.seeds), /第1组3粒/);
  assert.match(copy(STORY.seeds), /第2组5粒/);
  assert.match(copy(STORY.seeds), /第10组/);
  assert.match(copy(STORY.seeds), /总数|一共/);
  const reading = copy(STORY.signin);
  assert.match(reading, /阅读/);
  assert.match(reading, /学校原有/);
  assert.match(reading, /1次1分/);
  assert.match(reading, /2次4分/);
  assert.match(reading, /3次7分/);
  assert.match(reading, /4次10分/);
  assert.match(reading, /15次/);
  assert.match(reading, /换购图书/);
});

test('剧情和图片替代文本不泄露待求结果与算法正确项', async () => {
  const { STORY } = await modulePromise;
  const all = Object.values(STORY).map(copy).join(' ');
  assert.ok(all.trim().length, '应有可审查的剧情文案');
  assert.doesNotMatch(all, /(^|\D)(21|120|43)(?=\D|$)|10\s*(℃|°C)|十摄氏度/);
  assert.doesNotMatch(all, /[Cc]\s*=|[Ff]\s*[-−]\s*32|[×*]\s*3\s*[-−]\s*2|第[一二三四]项是正确/);
});

test('剧情会话键稳定区分学生、班级、轮次与章目', async () => {
  const { storySessionKey } = await modulePromise;
  const student = { id: 'test-1', classId: '501', name: '演示甲' };
  const base = storySessionKey(student, 'r1', 'temp');
  assert.equal(base, storySessionKey({ name: '更名演示', classId: '501', id: 'test-1' }, 'r1', 'temp'));
  for (const key of [
    storySessionKey({ ...student, id: 'test-2' }, 'r1', 'temp'),
    storySessionKey({ ...student, classId: '502' }, 'r1', 'temp'),
    storySessionKey(student, 'r2', 'temp'),
    storySessionKey(student, 'r1', 'seeds')
  ]) assert.notEqual(key, base);
  assert.notEqual(storySessionKey({ id: 'a|b', classId: 'c' }, 'r1', 'temp'), storySessionKey({ id: 'b', classId: 'c|a' }, 'r1', 'temp'));
});

test('主线结算文案交代真实任务成果与下一站', async () => {
  const { STORY } = await modulePromise;
  assert.match(STORY.temp.outcome || '', /气温.*黑板/);
  assert.match(STORY.flow.outcome || '', /方法.*实验室/);
  assert.match(STORY.seeds.outcome || '', /分配.*阅读站/);
  assert.match(STORY.signin.outcome || '', /阅读.*指南.*基础检测.*自选挑战/);
  assert.match(copy(STORY.quiz), /四个必做站.*基础检测.*自选挑战/);
  assert.doesNotMatch(copy(STORY.quiz), /可以先试试|20题独立检查/);
});

function fakeDocument() {
  const doc = { activeElement: null };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.listeners = new Map();
      this.className = ''; this.hidden = false; this.open = false; this.textContent = '';
      this.classList = {
        contains: name => this.className.split(' ').includes(name),
        add: name => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); },
        remove: name => { this.className = this.className.split(' ').filter(x => x !== name).join(' '); }
      };
    }
    append(...children) { for (const child of children) { this.children.push(child); child.parentElement = this; } }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(type, listener, options) {
      const list = this.listeners.get(type) || [];
      list.push({ listener, once: !!options?.once }); this.listeners.set(type, list);
    }
    removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter(x => x.listener !== listener)); }
    dispatchEvent(event) {
      event.target ||= this;
      for (const entry of [...(this.listeners.get(event.type) || [])]) {
        entry.listener(event);
        if (entry.once) this.removeEventListener(event.type, entry.listener);
      }
    }
    querySelector(selector) {
      const matches = el => selector.startsWith('.') ? el.classList.contains(selector.slice(1)) : selector.startsWith('#') ? el.id === selector.slice(1) : el.tagName === selector.toUpperCase();
      for (const child of this.children) {
        if (matches(child)) return child;
        const nested = child.querySelector(selector); if (nested) return nested;
      }
      return null;
    }
    closest(selector) { return selector === '[hidden]' && this.hidden ? this : this.parentElement?.closest(selector) || null; }
    get isConnected() { return this === doc.body || !!this.parentElement?.isConnected; }
    getClientRects() { return this.isConnected && !this.closest('[hidden]') ? [{}] : []; }
    focus() { doc.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent({ type: 'close' }); }
  }
  doc.body = new Element('body');
  doc.createElement = tag => new Element(tag);
  doc.getElementById = id => doc.body.querySelector('#' + id);
  return doc;
}

test('原生剧情弹窗可继续、跳过、ESC退出，隔离键盘并在存储失败时记住本会话', async () => {
  const previousGlobals = Object.fromEntries(['document', 'sessionStorage', 'getComputedStyle'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const doc = fakeDocument();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('storage unavailable'); } });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: () => ({ display: 'block', visibility: 'visible' }) });
  try {
    const { openStory } = await import('../public/story.mjs?dialog-behavior-test');
    const trigger = doc.createElement('button'); doc.body.append(trigger); trigger.focus();
    const options = { student: { id: 'test-modal', classId: '501' }, round: 'r1', once: true };
    const pending = openStory('intro', options);
    const dialog = doc.getElementById('story-dialog');
    assert.ok(dialog?.open, '调用后应立即打开原生 dialog');
    assert.equal(dialog.className, 'story-dialog');
    assert.equal(doc.body.classList.contains('story-open'), true);
    assert.equal(openStory('intro', options), pending, '重复调用应等待同一张卡片');
    const next = dialog.querySelector('.story-continue');
    assert.equal(doc.activeElement, next);
    for (const type of ['keydown', 'keyup']) {
      const event = { type, stopped: false, stopPropagation() { this.stopped = true; } };
      dialog.dispatchEvent(event); assert.equal(event.stopped, true);
    }
    dialog.querySelector('.story-image').dispatchEvent({ type: 'error' });
    assert.equal(dialog.querySelector('.story-image').hidden, true, '坏图应隐藏');
    assert.ok(dialog.querySelector('.story-task').textContent.length, '坏图不能遮住任务文案');
    next.dispatchEvent({ type: 'click' }); await pending;
    assert.equal(doc.body.classList.contains('story-open'), false);
    assert.equal(doc.activeElement, trigger);
    await openStory('intro', options);
    assert.equal(dialog.open, false, 'once 在存储失败时仍应记住已读');
    const replay = openStory('intro', { ...options, once: false });
    assert.equal(dialog.open, true, '手动重看仍可打开');
    dialog.querySelector('.story-skip').dispatchEvent({ type: 'click' }); await replay;
    const escape = openStory('temp', options);
    const cancel = { type: 'cancel', preventDefault() { this.defaultPrevented = true; } };
    dialog.dispatchEvent(cancel);
    if (!cancel.defaultPrevented) dialog.close();
    await escape;
    assert.equal(dialog.open, false);
    assert.equal(doc.body.classList.contains('story-open'), false);
    const newRound = openStory('intro', { ...options, round: 'r2' });
    assert.equal(dialog.open, true, '新轮次应重新显示');
    trigger.hidden = true;
    dialog.close(); await newRound;
    assert.notEqual(doc.activeElement, trigger, '不可见的触发者不应恢复焦点');
    const showModal = dialog.showModal;
    dialog.showModal = () => { throw new Error('document inactive'); };
    await openStory('seeds', options);
    assert.equal(doc.body.classList.contains('story-open'), false);
    dialog.showModal = showModal;
    const retry = openStory('seeds', options);
    assert.equal(dialog.open, true, '未成功展示的卡片不能误记为已看');
    dialog.close(); await retry;
  } finally {
    for (const [key, descriptor] of Object.entries(previousGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
