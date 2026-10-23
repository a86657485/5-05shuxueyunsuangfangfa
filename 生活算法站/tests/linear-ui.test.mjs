import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Control {
  constructor(tagName = 'BUTTON') {
    this.tagName = tagName; this.disabled = false; this.dataset = {}; this.attrs = new Map();
    this.isConnected = true; this.children = []; this.parentElement = null;
    this.classList = { values: new Set(), add: c => this.classList.values.add(c), remove: c => this.classList.values.delete(c), contains: c => this.classList.values.has(c) };
  }
  matches(selector) { return selector === 'button.opt' ? this.option === true : selector.includes('button') && this.tagName === 'BUTTON' || selector.includes('[role="button"]') && this.tagName === 'DIV'; }
  closest(selector) { return selector === '[hidden]' ? null : this.parentElement; }
  querySelectorAll() { return this.children; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  getBoundingClientRect() { return { top: 100, bottom: 140, left: 100, right: 150, width: 50, height: 40 }; }
  scrollIntoView() {}
}
function loadFocus(root) {
  const source = readFileSync(new URL('../public/focus.mjs', import.meta.url), 'utf8').replace(/^export /gm, '');
  const context = { document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => root?.querySelectorAll('.cta') || [] },
    matchMedia: () => ({ matches: true }), addEventListener() {}, setInterval() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, innerWidth: 1366, innerHeight: 900 };
  vm.runInNewContext(source + '\nglobalThis.api = { applyLinearGate: typeof applyLinearGate === "function" ? applyLinearGate : null, setFocus, setExactFocus: typeof setExactFocus === "function" ? setExactFocus : null, focusTarget };', context);
  return context.api;
}
function fakeRoot(groups) {
  const controls = [...new Set(Object.values(groups).flat())];
  return { querySelectorAll(selector) { return selector === '.cta' ? controls.filter(e => e.classList.contains('cta')) : groups[selector] || controls; } };
}
test('linear gate opens completed and first incomplete groups, preserving revisions', () => {
  const a = new Control(), b = new Control(), c = new Control(), later = new Control('DIV');
  later.setAttribute('tabindex', '0');
  const root = fakeRoot({ '#a': [a], '#b': [b], '#c': [c, later] }), M = loadFocus(root);
  assert.equal(typeof M.applyLinearGate, 'function', 'UI needs a real DOM gate');
  M.applyLinearGate(root, [{ selector: '#a', done: true }, { selector: '#b', done: false }, { selector: '#c', done: false }]);
  assert.equal(a.disabled, false); assert.equal(b.disabled, false); assert.equal(c.disabled, true);
  assert.equal(later.getAttribute('aria-disabled'), 'true'); assert.equal(later.getAttribute('tabindex'), '-1');
  M.applyLinearGate(root, [{ selector: '#a', done: true }, { selector: '#b', done: true }, { selector: '#c', done: false }]);
  assert.equal(c.disabled, false); assert.equal(later.getAttribute('aria-disabled'), 'false'); assert.equal(later.getAttribute('tabindex'), '0');
  M.applyLinearGate(root, [{ selector: '#a', done: false }, { selector: '#b', done: true }, { selector: '#c', done: true }]);
  assert.equal(a.disabled, false); assert.equal(b.disabled, true); assert.equal(c.disabled, true);
});
test('submission lock includes optional controls and restores their prior disabled state', () => {
  const current = new Control(), optional = new Control(), originallyDisabled = new Control(); originallyDisabled.disabled = true;
  const root = fakeRoot({ '#a': [current], '.all': [current, optional, originallyDisabled] }), M = loadFocus(root);
  assert.equal(typeof M.applyLinearGate, 'function');
  const plan = [{ selector: '#a', done: false }];
  M.applyLinearGate(root, plan, true);
  assert.ok([current, optional, originallyDisabled].every(e => e.disabled));
  M.applyLinearGate(root, plan, false);
  assert.equal(current.disabled, false); assert.equal(optional.disabled, false); assert.equal(originallyDisabled.disabled, true);
});
test('ordinary candidate focus stays on the group; explicit talisman focus targets one control', () => {
  const group = new Control('DIV'), option = new Control(); option.option = true; option.parentElement = group;
  const root = fakeRoot({ '#group': [group, option] }), M = loadFocus(root);
  M.setFocus(option, '选一个'); assert.equal(M.focusTarget(), group);
  assert.equal(option.classList.contains('cta'), false);
  assert.equal(typeof M.setExactFocus, 'function', 'specific candidate needs explicit opt-in');
  M.setExactFocus(option, '点这一个'); assert.equal(M.focusTarget(), option);
  assert.equal(option.classList.contains('cta'), true);
});

test('capture guard refreshes after target handler edits the draft', () => {
  const source = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
  const guard = source.slice(source.indexOf('function guardLinear(event) {'), source.indexOf("['click', 'input', 'change'].forEach"));
  let draft = 'before'; const observed = [], scheduled = [];
  const target = { id: 'selection', dataset: {}, disabled: false, closest: () => ({}), getAttribute: () => null, matches: () => false };
  const context = { partBusy: () => false, inPart: () => true, clearDraftFeedback() {}, refreshLinear: () => observed.push(draft), queueMicrotask: fn => fn(), requestAnimationFrame: fn => scheduled.push(fn), setTimeout: fn => scheduled.push(fn) };
  vm.runInNewContext(guard + '\nglobalThis.runGuard = guardLinear;', context);
  context.runGuard({ type: 'click', target: { closest: () => target } });
  draft = 'after'; scheduled.forEach(fn => fn());
  assert.deepEqual(observed, ['after'], 'linear gate must read the draft after the selected control handler runs');
});
