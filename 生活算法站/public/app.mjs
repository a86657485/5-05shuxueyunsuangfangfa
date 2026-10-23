/**
 * 生活算法站 · 学生端（逆向设计改版）
 * 每站拆成若干“证据点”，一次只亮一个要点、一个主要操作；
 * 学生的每次“检查/让同桌照着做”都会作为证据提交（首答永久保留、最终答案更新）。
 */
import { api, queueEvent, flushQueue } from './sync.mjs';
import { setFocus, setExactFocus, applyLinearGate, spotlight, place as placeCoach } from './focus.mjs';
import { sound } from './sfx.mjs';
import { mapBackground, places, sprite, pickCharacter, guideSvg, CHARACTERS, mountRpg, paintLoginPreview } from './world.mjs';
import { STORY, openStory } from './story.mjs';
import { TEST_ANSWERS } from './answers.mjs';
import { openReward } from './reward.mjs';
import { UNLOCK_SCORE } from './reward-rules.mjs';
import { openLearning } from './learning.mjs';
import { openSkinPicker, starSnapshot, newlyUnlocked, loadRemembered, rememberFromState, portraitFor } from './skins.mjs';
import { mountQuestion, answerComplete, mountMatchReview } from './quiz-ui.mjs';
import { openMemoryReward } from './memory-reward.mjs';

const R = globalThis.LessonRules;
const L = globalThis.LinearGuide;
const $ = id => document.getElementById(id);
const mode = location.pathname === '/test' ? 'test' : location.pathname === '/demo' ? 'demo' : 'student';
const isLocal = mode !== 'student';
const PLACE_ORDER = [...R.stageIds, 'quiz'];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let state = null, stage = 'temp', partIdx = 0, screen = 'login';
let character = 'maleAdventurer', avatarAt = 'temp';
let ui = {}, hintLevel = 0, exam = null, quizAnswers = {}, quizResult = null;
let login = { classId: '', id: '', manual: false }, roster = [];
let rpg = null;
let submitting = false, talismanPending = false, draftVersion = 0, talismanFocus = null;
const showStory = (chapter, once = false) => openStory(chapter, { student: state.student, round: state.round, once });

async function enterCampus() {
  show('map');
  setFocus(null);
  await showStory('intro', true);
  await renderMap();
}

const toast = msg => { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2800); };
// crypto.randomUUID 仅在安全上下文(HTTPS/localhost)可用；机房用局域网 http 访问时不存在，
// 需回退到 getRandomValues（非安全上下文也可用），否则提交会因异常静默失败。
const uid = () => (typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
const shuffle = a => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = ms => new Promise(r => setTimeout(r, reduced() ? 0 : ms));
const say = (main, sub = '') => { $('say-main').textContent = main; $('say-sub').textContent = sub; $('say-sub').className = ''; };
function setSync(msg, warn) { const el = $('sync-status'); if (el) { el.textContent = msg || ''; el.classList.toggle('warning', !!warn); } }

/* ---------- 当前操作组与主动法宝 ---------- */
const guideContext = () => ({ rule: partRecord('signin', 'rule') });
const inPart = () => screen === 'level' && !!$('body') && !!$('card');
const partBusy = () => submitting || talismanPending;
const modalOpen = () => !!document.querySelector('dialog[open]');
const talismanRemaining = () => Math.max(0, Number(state?.magic?.remaining ?? (3 - (state?.magic?.used || 0))));
const usedTalismanFor = (st, pt) => (state?.magic?.uses || []).some(use => use.stage === st && use.part === pt);
function actionableTarget(action) {
  const selector = action?.target?.selector;
  if (!selector || !inPart()) return null;
  const target = $('body').querySelector(selector);
  if (!target || target.closest('[hidden]') || target.disabled || target.getAttribute('aria-disabled') === 'true') return null;
  const rect = target.getBoundingClientRect();
  return rect.width && rect.height ? target : null;
}
function currentAction() {
  if (!inPart() || partBusy() || modalOpen() || state?.lessonExpired || $('next')) return null;
  const action = L.nextAction(stage, curPart().id, ui, guideContext());
  return actionableTarget(action) ? action : null;
}
function renderTalisman() {
  const button = $('talisman');
  if (!button) return;
  $('talisman-count').textContent = `${talismanRemaining()}/3`;
  button.disabled = talismanPending || !state || talismanRemaining() <= 0 || !currentAction();
  button.setAttribute('aria-disabled', String(button.disabled));
  button.title = isLocal ? '虚构演示：本页共3次，刷新可重演，不写班级记录' : '每人每轮整课共3次，使用后由你完成下一操作';
}
function endTalisman(clear = false) {
  talismanFocus = null;
  if (clear && $('talisman-panel')) $('talisman-panel').hidden = true;
}
function clearDraftFeedback() {
  draftVersion++;
  endTalisman(true);
  const fb = $('fb'); if (fb) { fb.innerHTML = ''; fb.className = 'feedback'; }
  $('composer')?.querySelectorAll('.bad-row').forEach(row => row.classList.remove('bad-row'));
  if ($('trace')) $('trace').innerHTML = '';
  if ($('fixed')) $('fixed').hidden = true;
}
function refreshLinear(focus = true) {
  if (!inPart()) { renderTalisman(); return; }
  const plan = L.linearPlan(stage, curPart().id, ui, guideContext());
  applyLinearGate($('body'), plan, partBusy());
  const add = $('addRow');
  if (add) {
    add.disabled = partBusy() || !plan.filter(row => row.key !== 'run').every(row => row.done);
    add.setAttribute('aria-disabled', String(add.disabled));
    if (add.disabled) { add.dataset.linearLocked = 'true'; add.setAttribute('tabindex', '-1'); }
    else { delete add.dataset.linearLocked; add.removeAttribute('tabindex'); }
  }
  $('card').setAttribute('aria-busy', String(partBusy()));
  bindSubmissionActions();
  if (focus && !partBusy() && !modalOpen() && !$('next')) {
    const exact = talismanFocus && actionableTarget(talismanFocus);
    if (exact) setExactFocus(exact, talismanFocus.text);
    else {
      const next = plan.find(row => !row.done);
      const targets = next && [...$('body').querySelectorAll(next.selector)];
      const target = targets?.find(el => !el.closest('[hidden]') && !el.disabled && el.getAttribute('aria-disabled') !== 'true');
      if (target) {
        // 组选择器有时返回一组中的多个数字按钮，普通焦点仍落在整组。
        const group = target.matches('button.opt') ? target.closest('.seg,.q,.shape-pick,.fault-pick,.chips-row,.chips-col') : target.closest('.stepper') || target;
        setFocus(group || target, next.text);
      }
    }
  }
  renderTalisman();
}
function bindSubmissionActions() {
  for (const id of ['check', 'run']) {
    const button = $(id);
    if (!button || button._linearSubmit || !button.onclick) continue;
    const handler = button.onclick;
    button._linearSubmit = true;
    button.onclick = async event => {
      if (partBusy() || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
      submitting = true; endTalisman(); refreshLinear(false);
      try { await handler(event); }
      catch (error) { toast(error.message || '本次操作没有完成，作品仍保留，请再试一次。'); }
      finally { submitting = false; refreshLinear(false); }
    };
  }
}
// capture 守卫覆盖鼠标、键盘生成的 click 及脚本 click，避免只变灰却仍进入旧 handler。
function guardLinear(event) {
  const target = event.target.closest?.('button,input,select,textarea,[role="button"]');
  if (!target) return;
  if (partBusy() && (target.closest('#card') || target.closest('#parts') || target.closest('#hud') || target.closest('#test-tools') || target.id === 'to-map')) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  if (!inPart() || !target.closest('#body')) return;
  if (target.disabled || target.getAttribute('aria-disabled') === 'true' || target.dataset.linearLocked === 'true') { event.preventDefault(); event.stopImmediatePropagation(); return; }
  if (event.type === 'click' && target.matches('input,select,textarea')) return;
  if (!['check', 'run'].includes(target.id)) clearDraftFeedback();
  requestAnimationFrame(() => refreshLinear());
}
['click', 'input', 'change'].forEach(type => document.addEventListener(type, guardLinear, true));
async function useTalisman() {
  const action = currentAction();
  if (talismanPending || !action || talismanRemaining() <= 0) return;
  const ticket = { sid: state.student.id, round: state.round, stage, part: curPart().id, version: draftVersion };
  const sameIdentity = () => state?.student.id === ticket.sid && state?.round === ticket.round;
  const stillCurrent = () => sameIdentity() && inPart() && stage === ticket.stage && curPart().id === ticket.part && draftVersion === ticket.version;
  talismanPending = true; refreshLinear(false);
  try {
    let granted;
    if (isLocal) {
      const used = (state.magic?.used || 0) + 1;
      state.magic = { limit: 3, used, remaining: 3 - used };
      granted = action;
    } else {
      const result = await api('/api/talisman/use', { method: 'POST', body: { sid: ticket.sid, round: ticket.round, eventId: uid(), stage: ticket.stage, part: ticket.part, draft: structuredClone(ui) } });
      if (!sameIdentity()) return;
      if (result.state?.magic) state.magic = result.state.magic;
      granted = result.action;
    }
    if (!stillCurrent()) return;
    talismanPending = false; refreshLinear(false);
    hintLevel = 3;
    const partState = currentPartState();
    partState.hintMax = Math.max(partState.hintMax || 0, 3);
    $('talisman-panel').hidden = false;
    $('talisman-action').textContent = granted?.text || '当前操作已变化，请按普通引导继续。';
    $('talisman-explanation').textContent = granted?.explanation || '';
    $('talisman-status').textContent = isLocal ? '虚构演示 · 刷新可重演 · 不写入班级记录' : `本轮还可用 ${talismanRemaining()} 次；请你亲自完成操作。`;
    const target = actionableTarget(granted);
    if (target && !modalOpen() && !submitting) { talismanFocus = granted; setExactFocus(target, granted.text); sound.play('hint'); }
  } catch (error) {
    if (sameIdentity() && error.data?.state?.magic) state.magic = error.data.state.magic;
    if (stillCurrent()) toast(error.status ? `法宝未使用：${error.message}` : '网络暂不可用，未显示法宝帮助；恢复网络后再试。');
  } finally { talismanPending = false; refreshLinear(false); }
}

/* ---------- 证据状态 ---------- */
const awarded = id => (state?.awards || []).some(a => a.stage === id);
const summaryOf = id => R.stageSummary(id, state?.records?.[id] || {}, awarded(id));
/** 主线站：≥2 星才可回地图；选做站与出门条检测可自由离开 */
function canLeaveStage(id) {
  const meta = R.stageOf(id);
  if (!meta || meta.optional) return true;
  return !!summaryOf(id).cleared;
}
const currentPartState = () => state?.records?.[stage]?.parts?.[curPart()?.id] || {};
const errorCount = () => Number(currentPartState().errorStreak) || 0;
const teachGuide = () => errorCount() >= 2;
const rewardReady = () => isLocal || !!state?.examStatus?.rewardUnlocked;
function unlocked(id) {
  if (mode === 'test') return true;
  if (state?.lessonExpired) return false;
  if (id === 'quiz') return isLocal ? R.requiredIds.every(id => summaryOf(id).cleared) : !!(state?.examStatus?.open || state?.examStatus?.baseCompleted) && !state?.examStatus?.closed;
  const meta = R.stageOf(id); const req = R.requiredIds;
  if (meta.optional) return awarded(req[req.length - 1]);
  const i = req.indexOf(id);
  return i <= 0 || awarded(req[i - 1]);
}
const nextPlace = () => R.requiredIds.find(id => unlocked(id) && !awarded(id)) || 'quiz';
const curPart = () => R.stageOf(stage).parts[partIdx];
const partRecord = (st, pt) => state?.records?.[st]?.parts?.[pt]?.last?.record || null;

/* 本地（教师测试 / 断网时）按服务端同样的规则记账 */
function applyLocal(p, assessment) {
  const rec = state.records[p.stage] ||= { parts: {}, history: [] };
  rec.parts ||= {}; rec.history ||= [];
  if (rec.history.some(e => e.eventId === p.eventId)) return;
  const entry = { eventId: p.eventId, part: p.part, record: p.record, assessment, hintLevel: p.hintLevel, created: new Date().toISOString(), ...(usedTalismanFor(p.stage, p.part) ? { helpSources: ['talisman'] } : {}) };
  const part = rec.parts[p.part] ||= { first: null, last: null, attempts: 0, hintMax: 0 };
  if (!part.first) part.first = entry;
  let prior = Number.isFinite(part.errorStreak) ? part.errorStreak : 0;
  if (!Number.isFinite(part.errorStreak)) {
    for (const e of rec.history.filter(e => e.part === p.part).slice().reverse()) { if (e.assessment?.ok ?? e.ok) break; prior++; if (prior >= 3) break; }
  }
  part.errorStreak = assessment.ok ? 0 : prior + 1;
  part.last = entry; part.attempts++; part.hintMax = Math.max(part.hintMax, p.hintLevel, Math.min(3,part.errorStreak));
  rec.history.push(entry); if (rec.history.length > 80) rec.history.shift();
  const sum = R.stageSummary(p.stage, rec, false);
  if (sum.cleared && !awarded(p.stage)) {
    state.awards.push({ stage: p.stage, points: R.stageOf(p.stage).points, stars: sum.stars });
    state.points = state.awards.reduce((n, a) => n + a.points, 0);
  }
}
let eventSequence = Promise.resolve();
function submitPart(record) {
  const pt = curPart().id;
  const assessment = R.assessPart(stage, pt, record);
  const payload = { sid: state.student.id, round: state.round, stage, part: pt, eventId: uid(), hintLevel, record };
  const starsBefore = starSnapshot(state);
  const run = eventSequence.then(async () => {
  const sameIdentity = () => state?.student.id === payload.sid && state?.round === payload.round;
  const switched = () => ({ ok: false, saveFailed: true, feedback: '学生或课堂轮次已切换，请在当前课堂重新检查。', evidence: {}, tags: [] });
  if (!sameIdentity()) return switched();
  if (isLocal) applyLocal(payload, assessment);
  else {
    try {
      const remaining = await flushQueue(payload);
      if (remaining) throw new Error('还有离线记录等待补传');
      const saved = await api('/api/event', { method: 'POST', body: payload });
      if (!sameIdentity()) return switched();
      state = saved;
      setSync('已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      if (e.status) {
        const message = `本次没有保存：${e.message} 当前作品仍保留。`;
        setSync('尚未保存', true);
        return {ok:false,saveFailed:true,feedback:message,evidence:{},tags:[]};
      }
      if (!sameIdentity()) return switched();
      try { queueEvent(payload); }
      catch { return { ok: false, saveFailed: true, feedback: '本次未能保存离线记录，作品仍在页面，请恢复网络后再检查。', evidence: {}, tags: [] }; }
      applyLocal(payload, assessment);
      setSync('网络不稳，已记下，稍后自动补传', true);
    }
  }
  renderHud();
  // 解锁过的装扮记住，换轮次不收回
  rememberFromState(state.student, state);
  // 刚好凑满三星：解锁一套新装扮
  const fresh = newlyUnlocked(starsBefore, state);
  if (fresh.length) {
    try { localStorage.setItem('g5l5-skin-new', '1'); } catch {}
    $('hud-avatar')?.classList.add('new-skin');
    sound.play('star');
    toast(`三星达成！解锁新装扮：${fresh.join('、')}　点头像更换`);
  }
  return assessment;
  });
  eventSequence = run.catch(() => {});
  return run;
}

/* ---------- 屏幕与 HUD ---------- */
function show(id) {
  screen = id;
  if (id !== 'level') endTalisman(true);
  for (const s of ['login', 'map', 'level', 'quiz-page', 'reward']) { const el = $(s); if (el) el.hidden = s !== (id === 'quiz' ? 'quiz-page' : id); }
  $('hud').hidden = id === 'login';
  $('menu').hidden = true;
  renderHud();
}
function renderHud() {
  if (!state || screen === 'login') return;
  $('identity').textContent = `${state.student.classId}班 · ${state.student.name}`;
  $('points').textContent = `积分 ${state.points || 0}`;
  const hs = $('hud-stars');
  if (hs) {
    if (screen === 'level') {
      const sum = summaryOf(stage);
      hs.textContent = sum.starGlyphs || R.starGlyphs(sum.stars || 0);
      hs.title = `本站 ${sum.stars || 0} 星（通关 ≥${R.PASS_STARS} 星）`;
    } else {
      const total = R.stageIds.reduce((n, id) => n + (summaryOf(id).stars || 0), 0);
      hs.textContent = `⭐ ${total}/${R.stageIds.length * 3}`;
      hs.title = '各站星级合计';
    }
  }
  const rb = $('reward-btn');
  if (rb) rb.hidden = !rewardReady();
  const portrait = portraitFor(character);
  const avatarImg = $('hud-avatar-img');
  avatarImg.src = portrait || sprite(character, 'idle');
  avatarImg.classList.toggle('portrait', !!portrait);
  const avatarBtn = $('hud-avatar');
  if (avatarBtn) {
    let pending = false;
    try { pending = localStorage.getItem('g5l5-skin-new') === '1'; } catch {}
    avatarBtn.classList.toggle('new-skin', pending);
  }
  $('hud-progress').innerHTML = PLACE_ORDER.map(id => {
    const done = id === 'quiz' ? (state.quizAttempts || []).length : awarded(id);
    const here = (screen === 'level' && stage === id) || (screen === 'quiz' && id === 'quiz');
    const label = id === 'quiz' ? '测' : R.stageOf(id).optional ? '选' : R.requiredIds.indexOf(id) + 1;
    const st = id === 'quiz' ? 0 : (summaryOf(id).stars || 0);
    return `<li class="${done ? 'done' : ''} ${here ? 'here' : ''}" title="${places[id].name}${st ? ' · ' + R.starGlyphs(st) : ''}">${label}</li>`;
  }).join('');
  $('actor').src = sprite(character, 'idle');
  $('sound').textContent = sound.on ? '🔊' : '🔇';
  if (mode === 'test') { $('test-tools').hidden = false; document.body.classList.add('with-tools'); }
  updateLeaveButton();
  renderTalisman();
}
function updateLeaveButton() {
  const btn = $('to-map');
  if (!btn) return;
  if (screen !== 'level') { btn.disabled = false; btn.removeAttribute('aria-disabled'); btn.title = ''; return; }
  const ok = canLeaveStage(stage);
  btn.disabled = !ok;
  btn.setAttribute('aria-disabled', String(!ok));
  const sum = summaryOf(stage);
  btn.title = ok ? '回校园地图' : `还差 ${'★'.repeat(Math.max(1, R.PASS_STARS - (sum.stars || 0)))} 才能离开（通关要至少 ${R.PASS_STARS} 星）`;
  btn.textContent = ok ? '← 地图' : `← 地图（需≥${R.PASS_STARS}星）`;
}
function tryLeaveToMap() {
  if (screen === 'level' && !canLeaveStage(stage)) {
    const sum = summaryOf(stage);
    const miss = (sum.missing || []).map(id => (R.partOf(stage, id) || {}).name || id);
    const need = Math.max(1, R.PASS_STARS - (sum.stars || 0));
    toast(`还差 ${'★'.repeat(need)} 才能离开`);
    say('还不能回地图', miss.length
      ? `当前 ${sum.starGlyphs || R.starGlyphs(sum.stars)}。还差：${miss.join('、')}`
      : `当前 ${sum.starGlyphs || R.starGlyphs(sum.stars)}，通关要至少 ${R.PASS_STARS} 星`);
    updateLeaveButton();
    return false;
  }
  show('map'); renderMap();
  return true;
}

/* ---------- 登录 ---------- */
function setupLogin() {
  $('login-bg').innerHTML = mapBackground();
  paintLoginPreview($('login-rpg-canvas'));
  $('class-tiles').innerHTML = ['501', '502', '503', '504'].map(c => `<button type="button" class="tile" data-class="${c}">${c}<small>班</small></button>`).join('');
  $('class-tiles').querySelectorAll('[data-class]').forEach(b => { b.onclick = () => { sound.play('tap'); pickClass(b.dataset.class); }; });
  setFocus($('class-tiles').querySelector('[data-class]'), '先点班级');
  $('search').oninput = renderNames;
  $('manual-toggle').onclick = () => { $('manual-box').hidden = false; login.manual = true; login.id = ''; setFocus($('manual-name'), '写下姓名'); };
  $('manual-name').oninput = confirmText;
  $('login-form').onsubmit = async e => { e.preventDefault(); await doLogin(); };
}
async function pickClass(c) {
  login = { classId: c, id: '', manual: false };
  $('class-tiles').querySelectorAll('[data-class]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.class === c)));
  $('step-name').hidden = false; $('manual-box').hidden = true; $('same-name').hidden = true;
  $('search').value = ''; $('name-grid').innerHTML = '<p class="note">加载名单…</p>';
  try {
    roster = isLocal ? [{ id: 'local-1', classId: c, name: '测试同学' }, { id: 'local-2', classId: c, name: '演示同学' }] : await api('/api/roster?class=' + c);
    renderNames();
  } catch (e) { $('login-error').textContent = e.message; }
}
function renderNames() {
  const q = $('search').value.trim();
  const list = roster.filter(s => !q || s.name.includes(q));
  $('name-grid').innerHTML = list.length
    ? list.map(s => `<button type="button" class="name-chip" data-id="${esc(s.id)}" aria-pressed="${login.id === s.id}">${esc(s.name)}</button>`).join('')
    : '<p class="note">没有找到，可点“名单里没有我”</p>';
  $('name-grid').querySelectorAll('[data-id]').forEach(b => {
    b.onclick = () => { sound.play('tap'); login.id = b.dataset.id; login.manual = false; $('manual-box').hidden = true; renderNames(); };
  });
  confirmText();
  if (list.length && !login.id && !login.manual) setFocus($('name-grid').querySelector('.name-chip'), '点自己的姓名');
}
const chosenName = () => login.manual ? $('manual-name').value.trim() : roster.find(s => s.id === login.id)?.name;
function confirmText() {
  const name = chosenName();
  $('identity-confirm').textContent = login.classId && name ? `请确认：${login.classId}班 · ${name}` : '';
  $('login-submit').hidden = !(login.classId && name);
  if (login.classId && name) setFocus($('login-submit'), '确认身份后出发');
}
async function doLogin() {
  $('login-error').textContent = '';
  try {
    if (isLocal) state = { student: { id: login.id || 'local', classId: login.classId, name: chosenName() }, round: 'r1', records: {}, awards: [], points: 0, quizAttempts: [] };
    else state = await api('/api/login', { method: 'POST', body: login.manual ? { classId: login.classId, name: chosenName() } : { classId: login.classId, id: login.id } });
    character = pickCharacter(state.student.id);
    sound.play('good');
    await enterCampus();
  } catch (e) {
    if (e.status === 409 && e.data?.choices) {
      $('same-name').hidden = false;
      $('same-name').innerHTML = '<p>已有同名，请确认：</p>' + e.data.choices.map(c => `<button type="button" class="name-chip" data-id="${esc(c.id)}">${esc(c.name)}</button>`).join('');
      $('same-name').querySelectorAll('[data-id]').forEach(b => { b.onclick = () => { login.id = b.dataset.id; login.manual = false; doLogin(); }; });
      setFocus($('same-name').querySelector('.name-chip'), '确认是哪一位');
    } else $('login-error').textContent = e.message;
  }
}

/* ---------- 地图（俯视校园 RPG） ---------- */
function placeMeta(id) {
  const open = unlocked(id);
  const done = id === 'quiz' ? (state.quizAttempts || []).length : awarded(id);
  const opt = id !== 'quiz' && R.stageOf(id).optional;
  const badge = done ? '✓' : id === 'quiz' ? '测' : opt ? '选' : String(R.requiredIds.indexOf(id) + 1);
  return { open, done: !!done, badge, optional: !!opt };
}
async function renderMap() {
  const world = $('map-world');
  $('map-guide-svg').innerHTML = guideSvg(56);
  const target = nextPlace();
  $('mission-status').textContent = state.lessonExpired ? '上一课次的学习记录已保留为只读，请老师为本班开启新一轮。' : awarded(R.requiredIds.at(-1)) ? STORY.complete.task : STORY[target].task;
  $('map-say').textContent = state.lessonExpired ? '今天请从新一轮开始，原来的作品、分数和记录都会保留。'
    : awarded(R.requiredIds.at(-1))
    ? '体验指南四部分准备好了！到校门完成基础检测，检查换个输入是否仍会用。挑战题和公式墙可以选做。'
    : `走到「${places[target].name}」：${places[target].label}。方向键或摇杆移动，靠近后按空格或点「对话」。`;
  if (rpg) { try { rpg.destroy(); } catch {} rpg = null; }
  rpg = await mountRpg(world, {
    character,
    spawnPlace: avatarAt,
    nextTarget: () => nextPlace(),
    getMeta: placeMeta,
    onInteract: id => enterPlace(id),
  });
  placeCoach();
  // 焦点落在对话键或画布
  const talk = world.querySelector('#rpg-talk');
  if (talk) setFocus(talk, `去${places[target].name}`);
}
async function bumpVisit(id) {
  if (!state || id === 'quiz') return;
  const bumpLocal = () => {
    const rec = state.records[id] ||= { parts: {}, history: [], visits: 0 };
    rec.visits = Math.max(0, Number(rec.visits) || 0) + 1;
  };
  if (isLocal) { bumpLocal(); return; }
  try {
    state = await api('/api/visit', { method: 'POST', body: { sid: state.student.id, round: state.round, stage: id } });
  } catch (e) {
    bumpLocal(); // 断网时本地记一次，下次连上再由服务端累计
    if (e.status && e.status < 500) toast(e.message);
  }
}
async function enterPlace(id) {
  if (partBusy()) return;
  // walkthrough / 无障碍备用入口
  if (state?.lessonExpired) return toast('这份学习记录属于上一课次，请老师为本班开启新一轮。');
  if (!unlocked(id)) return toast(id === 'quiz' ? '完成四个必做站后，基础检测会开放；老师关闭检测时请等待老师安排。' : '请先完成上一站');
  sound.play('tap');
  avatarAt = id;
  if (rpg) { try { rpg.destroy(); } catch {} rpg = null; }
  if (id === 'quiz') { show('quiz'); setFocus(null); await showStory('quiz', true); renderQuiz(); return; }
  stage = id;
  await bumpVisit(id);
  const sum = summaryOf(id);
  partIdx = sum.cleared ? 0 : Math.max(0, R.stageOf(id).parts.findIndex(p => p.id === sum.currentPart));
  show('level');
  setFocus(null);
  if (!sum.cleared) await showStory(id, true);
  startPart(sum.cleared ? 'summary' : null);
  await openLearning(stage, {student:state.student,round:state.round,once:true});
}
function startPart(special) {
  draftVersion++; endTalisman(true);
  ui = {}; hintLevel = Math.max(usedTalismanFor(stage, curPart().id) ? 3 : 0, Math.min(3, Number(currentPartState().hintMax) || 0));
  show('level');
  renderLevel(special);
}

/* ---------- 每个证据点的文案：本步要学会、要点、提示 ---------- */
const PARTS = {
  'temp.chain': { learn: '分清所求、已知、怎么求', point: '已知 → 输入，怎么求 → 处理，所求 → 输出。',
    hints: ['再读一遍题：最后要告诉同学的是哪种温度？', '题目里已经写出来的数是“已知”；要算出来的是“所求”。', '先放进去的是已知的华氏温度，算出来的是摄氏温度。'],
    scaffold: ['分三步想：①最后要算出什么？②题里已经给了什么？③用什么办法从已知到所求？', '示例句：「所求是____；已知是____；怎么求：用____。」（先填空，别急着点选项）', '错因对照：把“所求”放进输入、把“已知”放进输出 → 输入输出搞反了。'],
    example: '写法框架：所求＝要算的温度；已知＝题里给的华氏度数；怎么求＝用换算公式。' },
  'temp.order': { learn: '说清先算什么、后算什么', point: '计算的步骤和顺序会直接影响结果。',
    hints: ['公式里的括号是什么意思？', '括号里的要先算。', '先减 32，再乘 5、除以 9。'],
    scaffold: ['看公式里的括号：括号里的运算要先做。', '示例句：「我先做____，因为括号要求先算它。」', '错因对照：先乘除再减 32，会得到不合理的温度（比如冬天变成零下很多）。'],
    example: '写法框架：括号里先减 32，再乘 5、除以 9（乘除可互换）。' },
  'temp.steps': { learn: '用自然语言写出明确有序的步骤', point: '算法是明确、有序、可执行的步骤：换一个数也能照着算——它是方法，不是答案。',
    hints: ['同桌照着做，第一步要知道哪个数？', '每一步都要说清：做什么（输入/计算/输出）、对哪个数、怎么算。', '输入华氏温度 → 计算摄氏温度（写清怎么算）→ 输出摄氏温度。'],
    scaffold: ['三步骨架：输入 → 计算（写清怎么算）→ 输出。不要写死某个答案。', '示例句：「输入华氏温度；计算摄氏温度：用……；输出摄氏温度。」', '错因对照：只写“答案10℃”、或“算一下”没写方法 → 同桌换个数就不会做。'],
    example: '写法框架：输入（华氏温度）→ 计算（写清减32、乘5、除9）→ 输出（摄氏温度）。' },
  'flow.paper': { learn: '会用图框和流程线画流程图', point: '圆角矩形=开始/结束，平行四边形=输入/输出，直角矩形=处理，流程线=执行方向。',
    hints: ['跟着老师在黑板上拼的图框画。', '画完逐条对照自查。', '有不确定的，举手请老师看你的学习单。'],
    scaffold: ['先对照黑板上的四种图框含义，再一笔一笔画。', '自查口诀：开始/结束用圆角；输入输出用平行四边形；计算用直角矩形。', '不确定就举手，请老师看学习单——本步是自查，不替你交答案。'],
    example: '图框对照：圆角＝起止；平行四边形＝输入/输出；直角＝处理。' },
  'flow.fix': { learn: '看出流程图的形状和顺序问题', point: '流程图让每一步的先后关系一目了然：顺序结构就是一步接一步。',
    hints: ['逐个图框问自己：形状对吗？', '再问：先后对吗？有没有缺了什么？', '输入框的形状、计算和输出的先后、最后少了什么框？'],
    scaffold: ['每个图框问两句：①形状对吗？②位置（先后）对吗？', '示例句：「这一框应该是____形，因为这一步在____。」', '错因对照：输入却画成处理框；还没算就输出；最后少了结束框。'],
    example: '排查顺序：从上到下，先形状，再先后，再有没有缺框。' },
  'seeds.chain': { learn: '自己分析新问题的所求、已知、怎么求', point: '换一道题，同样先分清所求、已知、怎么求。',
    hints: ['题目一共问了几个问题？', '看看 s = n×(3+m)÷2 里用到了谁。', '要先知道 m，才能算 s。'],
    scaffold: ['题目问了几个量？所求可能不止一个。', '示例句：「所求有____和____；已知是____；要先算____再算____。」', '错因对照：想先算一共的 s，却还不知道每组的 m → 依赖顺序反了。'],
    example: '写法框架：所求＝第n组种子数 + 一共；已知＝组数与规律；怎么求＝先 m 后 s。' },
  'seeds.steps': { learn: '写出可执行的四步', point: '有依赖的量，要先算被依赖的那个。',
    hints: ['和温度题比一比，哪里一样？', '算 s 要用到 m，m 必须更早算出来。', '输入组数 n → 算 m → 算 s → 输出 m 和 s。'],
    scaffold: ['四步骨架：输入 n → 算 m → 算 s → 输出 m 和 s。', '示例句：「计算 m：用……；计算 s：用……（里面要用到 m）。」', '错因对照：先写算 s 再算 m → 同桌执行时还没有 m。'],
    example: '写法框架：输入 n → 计算 m → 计算 s（用到 m）→ 输出 m 和 s。' },
  'seeds.flow': { learn: '把步骤画成流程图', point: '图框形状表示这一步在做什么。',
    hints: ['这一框是在“开始/结束”“输入/输出”还是“处理”？', '“输入组数”和“输出结果”是同一种图框。', '两个“计算”框都是处理。'],
    scaffold: ['按步骤顺序给每一框选形状，不要跳步。', '示例句：「“输入组数”是____形；“计算 m”是____形。」', '错因对照：把计算画成输入/输出框，或把输入画成处理框。'],
    example: '形状口诀：起止圆角；输入输出平行四边形；计算直角矩形。' },
  'signin.rule': { learn: '找规律并用数据验证', point: '找到规律后，要用表里的数据举例验证。',
    hints: ['每多签到 1 次，积分多几分？', '试试“签到次数 × 3”，和表里比一比，差多少？', '每一行都差同一个数。'],
    scaffold: ['先看相邻两次差几分，再写成“□ × 签到次数 ± □”。', '示例句：「我猜积分＝____×次数____；用表里 1、2、3、4 次逐行验算。」', '错因对照：只写“×3”却不核对表 → 每一行都会对不上。'],
    example: '写法框架：积分＝a×次数±b，并用表中四行验算。' },
  'signin.steps': { learn: '写成任何次数都能用的方法', point: '方法卡要能换任意次数来算。',
    hints: ['回想三问：所求？已知？怎么求？', '每一步写清：做什么、对哪个数、怎么算。', '和温度题一样，三步就够。'],
    scaffold: ['三步骨架：输入签到次数 → 计算积分（用你验证过的规律）→ 输出积分。', '示例句：「计算积分：用我找到的规律……」不要写死某一个次数的答案。', '错因对照：写死“43分”或用没验证过的公式 → 换次数就错。'],
    example: '写法框架：输入次数 → 用已验证规律计算积分 → 输出积分。' },
  'signin.reflect': { learn: '回头看看自己的想法变化', point: '写步骤，要让别人照着做也能算对。',
    hints: ['选最符合你的两句就好。', '', ''],
    scaffold: ['诚实选“原来”和“现在”各一句，写出自己的变化。', '这是出门条自查，没有标准选项答案。', '想一想：算法是方法还是某一个答案？'],
    example: '选两句能代表你想法变化的话即可。' },
  'formula.steps': { learn: '在新的公式里找到算法', point: '学过的很多公式里，都藏着算法。',
    hints: ['先选一个你熟悉的公式。', '已知的数先输入。', '输入 → 计算（写清怎么算）→ 输出。'],
    scaffold: ['先选公式，再套三步：输入已知 → 计算（写清怎么算）→ 输出所求。', '示例句：「输入长和宽；计算周长：用……；输出周长。」', '错因对照：运算顺序写错（如长+宽×2 忘了括号）。'],
    example: '写法框架：输入已知量 → 计算（写清公式与顺序）→ 输出结果。' }
};
/* 参考答案集中在 answers.mjs，教师大屏用同一份数据 */
const targetChips = targets => targets.map(t => `<span class="tchip t-${t}">${esc(R.targets[t].split(' ')[0])}</span>`).join('');

/* ---------- 关卡框架 ---------- */
function renderLevel(special) {
  const meta = R.stageOf(stage), sum = summaryOf(stage);
  const firstIncomplete = sum.parts.findIndex(p => !p.lastOk);
  const partAllowed = i => !!sum.parts[i]?.lastOk || i === firstIncomplete;
  $('chapter').textContent = `${places[stage].name} · ${meta.aim} · ${sum.starGlyphs || R.starGlyphs(sum.stars)}`;
  $('stage-title').textContent = meta.name;
  $('parts').innerHTML = meta.parts.map((p, i) => {
    const s = sum.parts[i];
    const now = special !== 'summary' && i === partIdx;
    return `<li class="step ${now ? 'now' : ''} ${s.lastOk ? 'done' : ''}"><button type="button" data-i="${i}" aria-disabled="${!partAllowed(i)}" ${partAllowed(i) ? '' : 'disabled tabindex="-1"'}><i>${s.lastOk ? '✓' : i + 1}</i>${esc(p.name.split('：')[0].split('（')[0])}</button></li>`;
  }).join('');
  $('parts').querySelectorAll('button[data-i]').forEach(b => { b.onclick = () => { const i = Number(b.dataset.i); if (partBusy() || !partAllowed(i)) return; partIdx = i; startPart(); }; });
  $('test-answer-text').textContent = '';
  if (special === 'summary') return renderStageSummary();
  const part = curPart(), key = stage + '.' + part.id, info = PARTS[key];
  const guideOn = teachGuide();
  $('scene').innerHTML = `<div class="part-card" id="card">
    <div class="part-head"><span class="learn">本步要学会：<b>${esc(info.learn)}</b></span>${targetChips(part.targets)}
      <span class="stars" title="本站星级">${esc(sum.starGlyphs || R.starGlyphs(sum.stars))}</span></div>
    <div class="stage-mission"><span>${esc(STORY[stage].task)}</span><span class="stage-tools"><button type="button" class="ghost-btn" id="stage-learning">学习资料</button><button type="button" class="ghost-btn" id="stage-story">重看任务</button></span></div>
    <div id="body" class="part-body"></div>
    <div id="fb" class="feedback" role="status"></div>
  </div>`;
  $('stage-story').onclick = () => showStory(stage);
  $('stage-learning').onclick = () => openLearning(stage,{student:state.student,round:state.round});
  $('actor').src = sprite(character, 'think');
  if (guideOn) say('可以按提示继续修改', '先完成当前一步，再检查是否能照着做');
  else say('先自己想一想', '卡住再点右上角“?”');
  ({
    'temp.chain': partTempChain, 'temp.order': partTempOrder, 'temp.steps': () => partSteps('temp'),
    'flow.paper': partFlowPaper, 'flow.fix': partFlowFix,
    'seeds.chain': partSeedsChain, 'seeds.steps': () => partSteps('seeds'), 'seeds.flow': partSeedsFlow,
    'signin.rule': partSigninRule, 'signin.steps': () => partSteps('signin'), 'signin.reflect': partReflect,
    'formula.steps': partFormula
  })[key]();
  refreshLinear();
  renderHud();
}
/** 判定后的反馈：失败指向可改处；成功只亮一个要点，并给出唯一的下一步 */
function feedback(a, retryFocus) {
  const fb = $('fb');
  const key = stage + '.' + curPart().id;
  const info = PARTS[key] || {};
  const sum = summaryOf(stage);
  if (a.ok) {
    sound.play('good');
    $('actor').src = sprite(character, 'cheer0');
    const last = partIdx === R.stageOf(stage).parts.length - 1;
    fb.className = 'feedback ok';
    fb.innerHTML = `<p>${esc(a.feedback)}</p><p class="keypoint">要点：${esc(info.point)}</p>
      <p class="stars">本站 ${esc(sum.starGlyphs || R.starGlyphs(sum.stars))}（通关 ≥${R.PASS_STARS} 星 · 首答正确率 ${Math.round((sum.checkRate || 0) * 100)}%，≥${Math.round(R.THREE_STAR_RATE * 100)}% 得三星）</p>
      <button type="button" class="go-btn" id="next">${last ? '查看本站结算 →' : '下一步 →'}</button>`;
    $('next').onclick = () => { if (partBusy()) return; if (last) startPart('summary'); else { const sumNow = summaryOf(stage); const i = partIdx + 1; const first = sumNow.parts.findIndex(p => !p.lastOk); if (!sumNow.parts[i]?.lastOk && i !== first) return; partIdx = i; startPart(); } };
    setFocus($('next'), last ? '看看星级与收获' : '进入下一步');
    say('做到了！', sum.cleared ? '已达通关星级' : `再完成剩余证据点，争取 ${R.starGlyphs(R.PASS_STARS)}`);
  } else {
    sound.play('bad');
    $('actor').src = sprite(character, 'think');
    fb.className = 'feedback bad';
    const tags = (a.tags || []).filter(t => R.misconceptions[t]);
    const tagLine = tags.length ? `<ul class="tag-compare">${tags.map(t => `<li><b>可能错因</b>：${esc(R.misconceptions[t])}</li>`).join('')}</ul>` : '';
    const record = currentPartState().last?.record || {};
    const support = a.saveFailed ? null : R.supportFor?.(stage,curPart().id,record,a,errorCount());
    if (support) { hintLevel = Math.max(hintLevel,support.level); currentPartState().hintMax = Math.max(currentPartState().hintMax || 0,hintLevel); }
    const sc = support ? `<p class="scaffold-tip"><b>第 ${support.level} 步帮助：</b>${esc(support.text)}</p>` : '';
    fb.innerHTML = `<p>${esc(a.feedback)}</p>${tagLine}${sc}<p class="note">改一改再检查，所有尝试都会记录，不扣分。当前 ${esc(sum.starGlyphs || R.starGlyphs(sum.stars))}。</p>`;
    const target = supportTarget(support?.target);
    if (target || retryFocus) setFocus(target || retryFocus, a.saveFailed ? '保留作品，再试保存' : '从这里改');
    say(a.saveFailed ? '还没有保存成功' : support?.text || '再看一看当前步骤', a.saveFailed ? '作品已保留，请稍后再试' : '按提示改完，再由你检查');
  }
  updateLeaveButton();
}
function supportTarget(target) {
  if (!target) return null;
  if (target.kind === 'group') return $(target.id);
  if (target.kind === 'row') {
    const row=$('composer')?.querySelector(`.step-row[data-i="${target.row}"]`);
    const selector={verb:'.verbs',obj:'.objs',method:'.methods'}[target.field];
    return (selector&&row?.querySelector(selector)) || row;
  }
  if (target.kind === 'flow') return $('chart')?.querySelector(`.fbox[data-id="${target.id}"]`);
  if (target.kind === 'shape') return $('chart')?.querySelector(`.sp[data-id="${target.id}"]`)?.closest('.shape-pick');
  if (target.kind === 'rule') return target.id==='sign'?$('sign'):$({a:'va',b:'vb'}[target.id])?.closest('.stepper');
  return target.kind==='ops'?$('opsPool'):target.kind==='reason'?$('why'):null;
}
function renderStageSummary() {
  const meta = R.stageOf(stage), sum = summaryOf(stage);
  const glyphs = sum.starGlyphs || R.starGlyphs(sum.stars);
  const cleared = !!sum.cleared;
  const miss = (sum.missing || []).map(id => (R.partOf(stage, id) || {}).name || id);
  const rows = [
    ['★☆☆', '过半证据点最终通过', sum.stars >= 1],
    ['★★☆', `全部证据点最终通过（通关，≥${R.PASS_STARS} 星可离开）`, sum.stars >= 2],
    ['★★★', '全部通过，且多数计分点首答也对', sum.stars >= 3]
  ];
  $('scene').innerHTML = `<div class="part-card summary-card">
    <img src="${sprite(character, cleared ? 'cheer1' : 'think')}" alt="" width="72" height="96">
    <div class="star-burst" aria-label="本站${sum.stars}星">${esc(glyphs)}</div>
    <h2>${esc(meta.name)} · ${cleared ? '通关' : '尚未通关'}</h2>
    ${cleared ? `<div class="story-outcome" id="story-outcome"><b>体验指南更新了</b><p>${esc(STORY[stage].outcome || STORY[stage].task)}</p></div>` : ''}
    <ul class="star-rows">${rows.map(([g, t, ok]) => `<li class="${ok ? 'got' : ''}"><b>${g}</b><span>${esc(t)}</span></li>`).join('')}</ul>
    ${cleared
      ? `<p class="note">本站收获（+${meta.points} 积分，只记一次；重玩不扣分）</p>
         <ol class="keypoints">${meta.parts.map(p => `<li>${esc(PARTS[stage + '.' + p.id].point)}</li>`).join('')}</ol>
         <div class="summary-actions">
           <button type="button" class="go-btn" id="backMap">回地图 →</button>
           <button type="button" class="ghost-btn" id="replayStage">再玩本站</button>
         </div>`
      : `<p class="note">还差 ${esc('★'.repeat(Math.max(1, R.PASS_STARS - sum.stars)))} 才能离开校园地图。</p>
         ${miss.length ? `<p>还缺：<b>${esc(miss.join('、'))}</b></p>` : ''}
         <p class="encourage">别着急，改完再检查。连续尝试后会给你更具体的一步提示，也可重看学习资料。</p>
         <button type="button" class="go-btn" id="keepTrying">继续完成 →</button>
         <button type="button" class="ghost-btn" id="backMap" disabled title="未达 2 星不能离开">回地图（需≥${R.PASS_STARS}星）</button>`}
  </div>`;
  if (cleared) {
    sound.play('star');
    $('backMap').onclick = () => tryLeaveToMap();
    $('replayStage').onclick = () => { partIdx = 0; startPart(); };
    setFocus($('backMap'), '去下一站');
    say('通关啦！', `${glyphs} · 积分只记一次`);
    if (stage === R.requiredIds.at(-1) && R.requiredIds.every(awarded)) showStory('complete', true);
  } else {
    $('keepTrying').onclick = () => {
      const idx = Math.max(0, meta.parts.findIndex(p => p.id === sum.currentPart));
      partIdx = idx; startPart();
    };
    $('backMap').onclick = () => tryLeaveToMap();
    setFocus($('keepTrying'), '先把缺的证据点做完');
    say('还差一点', miss.length ? `还缺：${miss.join('、')}` : '继续加油');
  }
  renderHud();
}

/* 单选 / 多选 小组件 */
function chips(container, items, { multi = false, value = multi ? [] : null, onChange } = {}) {
  let cur = value;
  container.innerHTML = items.map(([v, label]) => `<button type="button" class="opt chip" data-v="${esc(v)}">${label}</button>`).join('');
  const sync = () => container.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(multi ? cur.includes(b.dataset.v) : cur === b.dataset.v)));
  container.querySelectorAll('.chip').forEach(b => {
    b.onclick = () => {
      sound.play('tap');
      if (multi) cur = cur.includes(b.dataset.v) ? cur.filter(x => x !== b.dataset.v) : cur.concat(b.dataset.v);
      else cur = b.dataset.v;
      sync(); onChange && onChange(cur);
    };
  });
  sync();
  return { get: () => cur };
}

/* ---------- 气象角 ① 问题三问 + 输入—处理—输出 ---------- */
function partTempChain() {
  const d = ui;
  $('body').innerHTML = `
    <div class="story-row">
      <div class="weather-card"><small>友好学校所在城市 · 2月</small><b>平均气温 50 ℉</b><span>（网页上写的是华氏温度）</span></div>
      <p class="story">学校要出“友好学校介绍”板报。同学们习惯看摄氏温度，需要把华氏温度换算成摄氏温度。<br>
      换算公式：<b>摄氏温度 = 5 ×（华氏温度 − 32）÷ 9</b></p>
    </div>
    <div class="qgrid">
      <div class="q"><b>1. 所求是什么？</b><div id="qAsk" class="chips-row"></div></div>
      <div class="q"><b>2. 已知条件是什么？</b><div id="qKnown" class="chips-row"></div></div>
      <div class="q"><b>3. 怎么求解？</b><div id="qHow" class="chips-row"></div></div>
    </div>
    <div id="ipoBox" class="ipo-pick" hidden>
      <p class="focus-q">把三问的答案放进“输入—处理—输出”：</p>
      <div class="ipo-row">
        <div class="ipo-slot"><b>输入</b><div id="sIn" class="chips-col"></div></div><span class="arrow">→</span>
        <div class="ipo-slot"><b>处理</b><div id="sProc" class="chips-col"></div></div><span class="arrow">→</span>
        <div class="ipo-slot"><b>输出</b><div id="sOut" class="chips-col"></div></div>
      </div>
    </div>
    <div class="part-actions"><button type="button" class="go-btn" id="check" hidden>检查</button></div>`;
  const slotItems = [['known', '华氏温度 50℉'], ['how', '换算公式'], ['ask', '摄氏温度']];
  d.slots = {};
  const step = () => {
    const missing = ['ask', 'known', 'how'].find(k => !d[k]);
    if (missing) { setFocus($({ ask: 'qAsk', known: 'qKnown', how: 'qHow' }[missing]).querySelector('.chip'), '选一个'); say('先读题，回答三问'); return; }
    $('ipoBox').hidden = false;
    const sm = ['in', 'proc', 'out'].find(k => !d.slots[k]);
    if (sm) { setFocus($({ in: 'sIn', proc: 'sProc', out: 'sOut' }[sm]).querySelector('.chip'), '放进来'); say('三问答完，再对应输入—处理—输出'); return; }
    $('check').hidden = false; setFocus($('check'), '检查');
  };
  chips($('qAsk'), shuffle([['C', '摄氏温度'], ['F', '华氏温度'], ['place', '友好学校在哪里']]), { onChange: v => { d.ask = v; step(); } });
  chips($('qKnown'), shuffle([['F', '华氏温度 50℉'], ['C', '摄氏温度'], ['days', '2月有几天']]), { onChange: v => { d.known = v; step(); } });
  chips($('qHow'), shuffle([['formula', '用已知的公式进行转换'], ['guess', '估一个差不多的数'], ['search', '直接上网找答案']]), { onChange: v => { d.how = v; step(); } });
  chips($('sIn'), slotItems, { onChange: v => { d.slots.in = v; step(); } });
  chips($('sProc'), slotItems, { onChange: v => { d.slots.proc = v; step(); } });
  chips($('sOut'), slotItems, { onChange: v => { d.slots.out = v; step(); } });
  $('check').onclick = async () => feedback(await submitPart({ ask: d.ask, known: d.known, how: d.how, slots: { ...d.slots } }), $('qAsk').querySelector('.chip'));
  step();
}

/* ---------- 气象角 ② 计算顺序会影响结果 ---------- */
function partTempOrder() {
  const d = ui; d.ops = []; d.tries = []; d.reason = null;
  $('body').innerHTML = `
    <p class="focus-q">第 2 步“计算摄氏温度”时，公式 5 ×（华氏温度 − 32）÷ 9 里的三个运算，<b>先做哪个？</b></p>
    <div class="ops-row"><div id="opsPool" class="chips-row"></div><button type="button" class="ghost-btn" id="opsClear">清空</button></div>
    <div class="ops-chain" id="chain"></div>
    <div class="part-actions"><button type="button" class="go-btn" id="calc" disabled>用 50℉ 算一算</button></div>
    <div id="zhou" class="peer-card" hidden>
      <img src="${sprite('maleAdventurer', 'think')}" alt="" width="42" height="56">
      <div><p><b>同学小周</b>先乘 5、再除以 9、最后减 32，得到 −4.2℃。他错在哪？</p><div id="why" class="chips-col"></div></div>
    </div>
    <div class="part-actions"><button type="button" class="go-btn" id="check" hidden>检查</button></div>`;
  const draw = () => {
    $('opsPool').innerHTML = Object.entries(R.tempOps).filter(([k]) => !d.ops.includes(k)).map(([k, o]) => `<button type="button" class="opt chip op" data-k="${k}">${o.text}</button>`).join('') || '<span class="note">三个运算都排好了</span>';
    $('opsPool').querySelectorAll('.op').forEach(b => { b.onclick = () => { sound.play('tap'); d.ops.push(b.dataset.k); draw(); }; });
    const res = d.ops.length === 3 ? R.runOps(d.ops, 50) : null;
    $('chain').innerHTML = `<span class="num">50℉</span>` + [0, 1, 2].map(i => `<span class="op-slot ${d.ops[i] ? 'filled' : ''}">${d.ops[i] ? R.tempOps[d.ops[i]].text : '第' + (i + 1) + '个'}</span><span class="num" data-i="${i}">${d.shown && res ? res.trace[i + 1] : '？'}</span>`).join('<span class="arrow">→</span>');
    $('calc').disabled = d.ops.length < 3;
    if (d.ops.length < 3) setFocus($('opsPool').querySelector('.op'), `第${d.ops.length + 1}个做什么？`);
    else if (!d.shown) setFocus($('calc'), '算一算');
  };
  $('opsClear').onclick = () => { d.ops = []; d.shown = false; d.reason = null; $('zhou').hidden = true; $('check').hidden = true; $('why').querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', 'false')); draw(); };
  $('calc').onclick = async () => {
    sound.play('tap'); d.shown = true; d.tries.push(d.ops.slice()); draw();
    const res = R.runOps(d.ops, 50);
    say(`按你的顺序：50℉ → ${res.value}℃`, res.value === 10 ? '和教材里的 10℃ 一样。' : '2月份 50℉ 是凉爽天气，这个结果合理吗？');
    $('zhou').hidden = false;
    if (!d.reason) setFocus($('why').querySelector('.chip'), '小周错在哪？');
    else { $('check').hidden = false; setFocus($('check'), '检查'); }
  };
  chips($('why'), shuffle([['order', '运算顺序不对：括号表示要先减 32'], ['digits', '公式里的数字记错了'], ['tool', '计算器出了问题'], ['both', '没有错，两种算法都对']]), {
    onChange: v => { d.reason = v; $('check').hidden = false; setFocus($('check'), '检查'); }
  });
  $('check').onclick = async () => {
    const a = await submitPart({ ops: d.ops.slice(), reason: d.reason, tries: d.tries });
    feedback(a, $('opsClear'));

  };
  draw();
  say('先排三个运算，再算一算');
}

/* ---------- 写步骤 + 同桌照着做（温度/种子/签到/选做共用） ---------- */
function partSteps(pid, opts = {}) {
  const d = ui;
  const p = R.problems[pid];
  const ctx = pid === 'signin' ? { rule: partRecord('signin', 'rule') } : {};
  d.rows ||= Array.from({ length: p.rows }, () => ({ verb: null, obj: null, method: null }));
  d.hand ||= {};
  const handSpec = { seeds: { label: '先自己按步骤算：n = 10 时', fields: [['m', 'm =', '粒'], ['s', 's =', '粒']] }, signin: { label: '先自己算：签到 15 次时', fields: [['p', '积分 =', '分']] } }[pid];
  const intro = {
    temp: '把“华氏换摄氏”写成三步，让同桌照着做。同桌会用 50℉ 和另一个温度来试。',
    seeds: '把种子题写成步骤。同桌会用第 10 组和另一组来试。',
    signin: '为阅读小站写一张“积分怎么算”的方法卡。同桌会用 15 次和另一个次数来试。'
  }[pid] || `为“${p.title}”写步骤。同桌会换两组数来试。`;
  $('body').innerHTML = `
    ${opts.header || ''}
    <p class="focus-q">${esc(intro)}</p>
    <div class="steps-split">
      <div class="composer" id="composer"></div>
      <div class="runner">
        <div class="card-preview"><b>我的方法卡</b><ol id="preview"></ol></div>
        ${handSpec ? `<div class="hand" id="hand"><b>${handSpec.label}（可选手算）</b> ${handSpec.fields.map(([k, l, u]) => `<label>${l}<input data-k="${k}" inputmode="decimal" value="${esc(d.hand[k] ?? '')}" maxlength="6">${u}</label>`).join(' ')}</div>` : ''}
        <button type="button" class="go-btn" id="run">请同桌照着做</button>
        <div class="peer"><img id="peerImg" src="${sprite('femaleAdventurer', 'idle')}" alt="" width="42" height="56"><div><b>同桌小安</b><ul id="trace" class="trace"></ul></div></div>
      </div>
    </div>`;
  const verbs = R.verbs, objs = R.objectChoices(pid), methods = R.methodsFor(pid, ctx) || {};
  const objOrder = shuffle(objs); // 打乱对象顺序，避免按位置猜
  const rowDone = r => r.verb === 'think' || (r.verb && r.obj && (r.verb !== 'calc' || r.method || !methods[r.obj]));
  const handReady = () => !handSpec || handSpec.fields.every(([k]) => String(d.hand[k] ?? '').trim() !== '');
  const draw = () => {
    $('composer').innerHTML = d.rows.map((r, i) => `
      <div class="step-row" data-i="${i}">
        <div class="row-head"><b>第 ${i + 1} 步</b>${d.rows.length > 1 ? `<button type="button" class="ghost-btn del" data-i="${i}" aria-label="删除这一步">删除</button>` : ''}</div>
        <div class="seg verbs">${verbs.map(v => `<button type="button" class="opt chip v" data-i="${i}" data-v="${v.id}" aria-pressed="${r.verb === v.id}">${v.text}</button>`).join('')}</div>
        ${r.verb && r.verb !== 'think' ? `<div class="seg objs">${objOrder.filter(o => !(r.verb === 'calc' && (p.combos || {})[o.id])).map(o => `<button type="button" class="opt chip o" data-i="${i}" data-v="${o.id}" aria-pressed="${r.obj === o.id}">${esc(o.text)}</button>`).join('')}</div>` : ''}
        ${r.verb === 'calc' && r.obj && methods[r.obj] ? `<div class="seg methods"><small>怎么算：</small>${methods[r.obj].map(m => `<button type="button" class="opt chip m" data-i="${i}" data-v="${m.id}" aria-pressed="${r.method === m.id}">${esc(m.text)}</button>`).join('')}</div>` : ''}
      </div>`).join('') + (d.rows.length < 6 ? `<button type="button" class="ghost-btn add" id="addRow">＋ 再加一步</button>` : '');
    $('preview').innerHTML = d.rows.map((r, i) => `<li data-i="${i}">${esc(R.rowText(pid, r, ctx))}</li>`).join('');
    const C = $('composer');
    C.querySelectorAll('.v').forEach(b => { b.onclick = () => { const r = d.rows[b.dataset.i]; if (r.verb !== b.dataset.v) { r.verb = b.dataset.v; r.obj = null; r.method = null; } sound.play('tap'); changed(); }; });
    C.querySelectorAll('.o').forEach(b => { b.onclick = () => { const r = d.rows[b.dataset.i]; if (r.obj !== b.dataset.v) { r.obj = b.dataset.v; r.method = null; } sound.play('tap'); changed(); }; });
    C.querySelectorAll('.m').forEach(b => { b.onclick = () => { d.rows[b.dataset.i].method = b.dataset.v; sound.play('tap'); changed(); }; });
    C.querySelectorAll('.del').forEach(b => { b.onclick = () => { d.rows.splice(Number(b.dataset.i), 1); changed(); }; });
    const add = $('addRow'); if (add) add.onclick = () => { d.rows.push({ verb: null, obj: null, method: null }); changed(); };
    guide();
  };
  const guide = () => {
    const i = d.rows.findIndex(r => !rowDone(r));
    if (i >= 0) {
      const r = d.rows[i], row = $('composer').querySelector(`.step-row[data-i="${i}"]`);
      const target = !r.verb ? row.querySelector('.v') : !r.obj ? row.querySelector('.o') : row.querySelector('.m');
      setFocus(target, !r.verb ? `第${i + 1}步做什么？` : !r.obj ? '对哪个数？' : '怎么算？');
      say(`写第 ${i + 1} 步`, '每步说清：做什么、对哪个数、怎么算');
    }
    else { setFocus($('run'), '请同桌照着做'); say('写好了，请同桌照着做'); }
  };
  const changed = () => { draw(); };
  if ($('hand')) $('hand').querySelectorAll('input').forEach(inp => { inp.oninput = () => { d.hand[inp.dataset.k] = inp.value.trim(); if (!$('run').classList.contains('cta')) guide(); }; inp.onchange = guide; });
  $('run').onclick = async () => {
    if (d.rows.some(r => !rowDone(r)) && !d.rows.some(r => r.verb === 'think')) { guide(); return toast('还有步骤没写完'); }
    if (pid === 'signin' && !ctx.rule) return toast('请先完成上一步：找规律');
    $('run').disabled = true;
    const record = { rows: d.rows.map(r => ({ ...r })), hand: handSpec ? { ...d.hand } : undefined, rule: ctx.rule || undefined, problem: stage === 'formula' ? pid : undefined };
    const a = await submitPart(record);
    await animateRun(pid, record.rows, ctx);
    $('run').disabled = false;
    let hand = '';
    if (handSpec && a.evidence.handOk === false) hand = '（你先算的数和同桌算的不一样，再核对一下自己的计算。）';
    if (!a.ok && Number.isInteger(a.evidence.row)) {
      const row = $('composer').querySelector(`.step-row[data-i="${a.evidence.row}"]`);
      if (row) row.classList.add('bad-row');
      feedback({ ...a, feedback: a.feedback + hand }, row && (row.querySelector('.o[aria-pressed="true"]') || row.querySelector('.v')));
    } else feedback({ ...a, feedback: a.feedback + hand });
  };
  draw();
}
async function animateRun(pid, rows, ctx) {
  const run = R.runSteps(pid, rows, ctx);
  const ul = $('trace'), img = $('peerImg'), p = R.problems[pid];
  ul.innerHTML = ''; img.src = sprite('femaleAdventurer', 'interact');
  const pv = $('preview');
  for (const res of run.results) {
    const t = Object.entries(res.test).map(([k, v]) => `${p.vars[k].name}=${v}`).join('，');
    ul.insertAdjacentHTML('beforeend', `<li class="test">试：${esc(t)}</li>`);
    for (const line of res.trace) {
      pv.querySelectorAll('li').forEach(li => li.classList.toggle('on', Number(li.dataset.i) === line.row));
      ul.insertAdjacentHTML('beforeend', `<li>第${line.row + 1}步 ${esc(line.text)}</li>`);
      await wait(260);
    }
    if (!res.ok) {
      pv.querySelectorAll('li').forEach(li => li.classList.toggle('stuck', Number(li.dataset.i) === res.row));
      ul.insertAdjacentHTML('beforeend', `<li class="stuck">✋ ${esc(res.msg)}</li>`);
      img.src = sprite('femaleAdventurer', 'think');
      return;
    }
    ul.insertAdjacentHTML('beforeend', `<li class="good">✓ 算对了</li>`);
    await wait(200);
  }
  pv.querySelectorAll('li').forEach(li => li.classList.remove('on'));
  img.src = sprite('femaleAdventurer', 'cheer0');
}

/* ---------- 黑板 ① 跟老师画（自查） ---------- */
function partFlowPaper() {
  const d = ui; d.checks = []; d.reviewed = 0;
  const items = [['terminal', '“开始”“结束”画成圆角矩形'], ['io', '“输入华氏温度值”“输出摄氏温度值”画成平行四边形'], ['process', '“计算摄氏温度值”画成直角矩形'], ['line', '用带箭头的流程线，从上到下连起来']];
  $('body').innerHTML = `
    <div class="teacher-note"><b>看黑板</b>老师正在用图框把温度换算的三步拼成流程图。请你在<strong>学习单</strong>上用铅笔同步画。</div>
    <p class="focus-q">画好了吗？对照你的学习单，逐条自查（如实勾选）：</p>
    <div id="checks" class="chips-col"></div>
    <div class="part-actions"><button type="button" id="paperNext">核对下一条</button><span id="paper-progress" class="note">已核对 0/4 条，可如实勾选或不勾选</span></div>
    <div class="part-actions"><button type="button" class="go-btn" id="check">我画好了，学习单交给老师看</button></div>`;
  chips($('checks'), items, { multi: true, onChange: v => { d.checks = v; } });
  $('paperNext').onclick = () => { d.reviewed = Math.min(items.length, d.reviewed + 1); $('paper-progress').textContent = `已核对 ${d.reviewed}/4 条，可如实勾选或不勾选`; $('paperNext').hidden = d.reviewed >= items.length; };
  $('check').onclick = async () => feedback(await submitPart({ done: true, checks: d.checks }));
  setFocus($('checks').querySelector('.chip'), '对照学习单自查');
  say('跟着老师在学习单上画', '这里只记录你的自查，老师会看你的学习单');
}
const shapeBox = (shape, text, extra = '') => `<div class="fbox ${shape}" ${extra}><span>${esc(text)}</span></div>`;

/* ---------- 黑板 ② 帮同学改流程图 ---------- */
function partFlowFix() {
  const d = ui; d.marks = {}; d.open = null;
  $('body').innerHTML = `
    <p class="focus-q">同学小周画的温度换算流程图有<b>3 类问题，涉及 4 个位置</b>。点图框，说出问题在哪。</p>
    <div class="fix-split"><div id="chart" class="flowchart"></div><div id="fixed" class="flowchart ghost" hidden></div></div>
    <div class="part-actions"><button type="button" class="go-btn" id="check" hidden>检查</button></div>`;
  const draw = () => {
    $('chart').innerHTML = R.flawedFlow.map((b, i) => `${i ? '<div class="fline">↓</div>' : ''}
      <div class="fitem">${shapeBox(b.shape, b.text || '？', `data-id="${b.id}" role="button" tabindex="0"`)}
        ${d.marks[b.id] ? `<span class="mark ${d.marks[b.id] === 'none' ? 'okm' : ''}">${R.faultNames[d.marks[b.id]]}</span>` : ''}
        ${d.open === b.id ? `<div class="fault-pick">${Object.entries(R.faultNames).map(([k, t]) => `<button type="button" class="opt chip f" data-k="${k}">${t}</button>`).join('')}</div>` : ''}</div>`).join('');
    $('chart').querySelectorAll('.fbox').forEach(el => { el.onclick = () => { d.open = el.dataset.id; sound.play('tap'); draw(); $('chart').querySelector('.fault-pick button')?.focus(); }; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } }; });
    $('chart').querySelectorAll('.f').forEach(b => { b.onclick = e => { e.stopPropagation(); const id = d.open; d.marks[id] = b.dataset.k; d.open = null; sound.play('tap'); draw(); $('chart').querySelector(`.fbox[data-id="${id}"]`)?.focus(); }; });
    const faults = Object.values(d.marks).filter(v => v !== 'none').length;
    if (d.open) setFocus($('chart').querySelector('.fault-pick .chip'), '这里有什么问题？');
    else if (faults >= 1 || Object.keys(d.marks).length >= R.flawedFlow.length) { $('check').hidden = false; setFocus($('check'), '检查'); }
    else { const nx = R.flawedFlow.find(b => !d.marks[b.id]); setFocus($('chart').querySelector(`.fbox[data-id="${nx ? nx.id : 'b0'}"]`), `已标出 ${faults} 处，点图框检查`); }
    say(`已标出 ${faults} 处`, '形状对吗？先后对吗？缺什么吗？');
  };
  $('check').onclick = async () => {
    const a = await submitPart({ marks: { ...d.marks } });
    feedback(a, $('chart').querySelector('.fbox'));
    if (a.ok) {
      $('fixed').hidden = false;
      $('fixed').innerHTML = '<p class="note">改正后</p>' + [['terminal', '开始'], ['io', '输入华氏温度值'], ['process', '计算摄氏温度值'], ['io', '输出摄氏温度值'], ['terminal', '结束']].map(([s, t], i) => (i ? '<div class="fline">↓</div>' : '') + shapeBox(s, t)).join('');
    }
  };
  draw();
}

/* ---------- 实验室 ① 自己分析（支架减半） ---------- */
function seedsSvg() {
  let s = '';
  [3, 5, 7, 9, 11, 13].forEach((n, r) => { for (let i = 0; i < n; i++) s += `<circle cx="${112 + (i - (n - 1) / 2) * 16}" cy="${14 + r * 16}" r="7" fill="#9fd8f0" stroke="#2a9d8f" stroke-width="1.2"/>`; s += `<text x="226" y="${19 + r * 16}" font-size="12" fill="#1a3a4a">${n}</text>`; });
  return `<svg viewBox="0 0 246 110" width="246" height="110" aria-label="第1至第6小组种子数示意">${s}</svg>`;
}
function partSeedsChain() {
  const d = ui; d.ask = []; d.askConfirmed = false;
  $('body').innerHTML = `
    <div class="story-row"><div class="seed-pic">${seedsSvg()}<small>第 1～6 小组的种子数</small></div>
      <p class="story">科学课做发芽实验：第 1 小组分 3 粒、第 2 小组分 5 粒、第 3 小组分 7 粒……按此规律，<b>第 10 小组</b>分多少粒？老师<b>一共</b>分发了多少粒？<br>
      公式：m = n×2+1（第 n 小组的种子数），s = n×(3+m)÷2（一共的种子数）</p></div>
    <details class="aside"><summary>选看：s 的公式是怎么来的？</summary>
      <p>把这一堆种子（像梯形）复制一份倒过来，和原来的拼在一起，就成了每行都一样多的平行四边形：每行 (3+m) 粒，共 n 行。总数是它的一半：s = n×(3+m)÷2。</p></details>
    <p class="focus-q">根据题目分析所求、已知和怎么求，需要时可以重看学习资料或点“?”：</p>
    <div class="qgrid">
      <div class="q"><b>所求（可多选）</b><div id="qAsk" class="chips-row"></div><button type="button" id="askConfirm">所求选好了</button></div>
      <div class="q"><b>已知</b><div id="qKnown" class="chips-row"></div></div>
      <div class="q"><b>怎么求</b><div id="qHow" class="chips-col"></div></div>
    </div>
    <div class="part-actions"><button type="button" class="go-btn" id="check" hidden>检查</button></div>`;
  const step = () => {
    if (!d.ask.length) return setFocus($('qAsk').querySelector('.chip'), '要求出什么？');
    if (!d.askConfirmed) return setFocus($('askConfirm'), '所求选好了');
    if (!d.known) return setFocus($('qKnown').querySelector('.chip'), '知道什么？');
    if (!d.how) return setFocus($('qHow').querySelector('.chip'), '怎么求？');
    $('check').hidden = false; setFocus($('check'), '检查');
  };
  chips($('qAsk'), shuffle([['m10', '第 10 小组的种子数'], ['sum', '一共分发的种子数'], ['g1', '第 1 小组的种子数']]), { multi: true, onChange: v => { d.ask = v; d.askConfirmed = false; step(); } });
  $('askConfirm').onclick = () => { d.askConfirmed = true; step(); };
  chips($('qKnown'), shuffle([['n-rule', '组数 n=10，每组比前一组多 2 粒'], ['answer', '答案 21 粒和 120 粒'], ['none', '什么也不知道']]), { onChange: v => { d.known = v; step(); } });
  chips($('qHow'), shuffle([['m-then-s', '先用 m=n×2+1 算第 10 组，再用 s=n×(3+m)÷2 算总数'], ['s-then-m', '先用 s 的公式算总数，再算第 10 组'], ['guess', '估一个差不多的数']]), { onChange: v => { d.how = v; step(); } });
  $('check').onclick = async () => feedback(await submitPart({ ask: d.ask, known: d.known, how: d.how }), $('qAsk').querySelector('.chip'));
  step();
  say('自己读题分析', '需要时可以点“?”');
}

/* ---------- 实验室 ③ 画成流程图 ---------- */
function partSeedsFlow() {
  const d = ui; d.shapes = {};
  $('body').innerHTML = `
    <p class="focus-q">把你写的种子题步骤画成流程图：为每个图框<b>选对形状</b>。</p>
    <div id="chart" class="flowchart pick"></div>
    <div class="part-actions"><button type="button" class="go-btn" id="check" hidden>检查</button></div>`;
  const draw = () => {
    $('chart').innerHTML = R.seedFlowBoxes.map((b, i) => `${i ? '<div class="fline">↓</div>' : ''}
      <div class="fitem row">${shapeBox(d.shapes[b.id] || 'empty', b.text)}
        <div class="shape-pick">${['terminal', 'io', 'process'].map(s => `<button type="button" class="opt chip sp" data-id="${b.id}" data-s="${s}" aria-pressed="${d.shapes[b.id] === s}" title="${R.shapeNames[s]}"><i class="mini ${s}"></i>${R.shapeNames[s].split('（')[0]}</button>`).join('')}</div></div>`).join('');
    $('chart').querySelectorAll('.sp').forEach(b => { b.onclick = () => { d.shapes[b.dataset.id] = b.dataset.s; sound.play('tap'); $('fb').innerHTML = ''; draw(); }; });
    const next = R.seedFlowBoxes.find(b => !d.shapes[b.id]);
    if (next) setFocus($('chart').querySelector(`.sp[data-id="${next.id}"]`), `“${next.text}”用哪种框？`);
    else { $('check').hidden = false; setFocus($('check'), '检查'); }
  };
  $('check').onclick = async () => feedback(await submitPart({ shapes: { ...d.shapes } }), $('chart').querySelector('.sp'));
  draw();
  say('为每个图框选形状');
}

/* ---------- 阅读小站 ① 找规律并举例验证 ---------- */
function partSigninRule() {
  const d = ui; const prev = partRecord('signin', 'rule'); d.aChanged = false; d.bChanged = false; d.signTouched = false;
  d.a = prev?.a ?? 1; d.sign = prev?.sign ?? '+'; d.b = prev?.b ?? 0; d.checked = null;
  $('body').innerHTML = `
    <p class="story">学校阅读小站推出活动：阅读签到能得积分，积分可以换购图书。签到 1 次得 1 分，2 次共 4 分，3 次共 7 分，4 次共 10 分……<b>签到 15 次</b>能得多少分？</p>
    <p class="focus-q">先找规律，写成“积分 = □ × 签到次数 ± □”，再用表里的数据举例验证。</p>
    <div class="rule-split">
      <table class="rule-table"><thead><tr><th>签到次数</th><th>积分</th><th>按我的规律</th></tr></thead><tbody id="tb"></tbody></table>
      <div class="rule-build">
        <div class="formula">积分 =
          <span class="stepper"><button type="button" class="mini-btn" data-k="a" data-d="-1">−</button><b id="va"></b><button type="button" class="mini-btn" data-k="a" data-d="1">＋</button></span>
          <button type="button" class="mini-btn" id="aConfirm">这个数调好了</button>
          × 签到次数
          <button type="button" class="opt chip" id="sign"></button>
          <button type="button" class="mini-btn" id="signConfirm">符号选好了</button>
          <span class="stepper"><button type="button" class="mini-btn" data-k="b" data-d="-1">−</button><b id="vb"></b><button type="button" class="mini-btn" data-k="b" data-d="1">＋</button></span>
        </div>
        <button type="button" class="go-btn" id="check">举例验证</button>
      </div>
    </div>`;
  const draw = () => {
    $('va').textContent = d.a; $('vb').textContent = d.b; $('sign').textContent = d.sign === '+' ? '＋' : '−';
    $('tb').innerHTML = R.signinTable.map(([k, p], i) => `<tr><td>${k}</td><td>${p}</td><td>${d.checked ? `${R.ruleValue(d.checked, k)} ${d.checkRes[i] ? '✓' : '✗'}` : '—'}</td></tr>`).join('') + '<tr class="muted"><td>15</td><td>？</td><td></td></tr>';
  };
  $('body').querySelectorAll('.stepper .mini-btn').forEach(b => { b.onclick = () => { const k = b.dataset.k, before = d[k]; d[k] = Math.max(0, Math.min(10, d[k] + Number(b.dataset.d))); if (d[k] !== before && k === 'a') d.aChanged = true; if (d[k] !== before && k === 'b') d.bChanged = true; if (k === 'a') d.aConfirmed = false; if (k === 'b') d.checked = null; draw(); }; });
  $('aConfirm').onclick = () => { d.aConfirmed = true; };
  $('sign').onclick = () => { d.sign = d.sign === '+' ? '-' : '+'; d.signTouched = true; d.signConfirmed = false; d.checked = null; draw(); };
  $('signConfirm').onclick = () => { d.signConfirmed = true; };
  $('check').onclick = async () => {
    const rule = { a: d.a, sign: d.sign, b: d.b };
    d.checked = rule; d.checkRes = R.signinTable.map(([k, p]) => R.ruleValue(rule, k) === p); draw();
    feedback(await submitPart(rule), $('va').previousElementSibling.parentElement);
  };
  draw();
  setFocus($('body').querySelector('.stepper'), '调一调规律');
  say('找规律', '每多签到 1 次，积分多几分？');
}

/* ---------- 阅读小站 ③ 出门条 ---------- */
function partReflect() {
  const d = ui;
  $('body').innerHTML = `
    <p class="focus-q">出门条：回到今天的大问题——<b>我写的计算步骤，同桌照着做，换一个数也能算对吗？</b></p>
    <div class="q"><b>我原来以为……</b><div id="was" class="chips-col"></div></div>
    <div class="q"><b>现在我认为……</b><div id="now" class="chips-col"></div></div>
    <label class="free">还想补充一句（可不写，最多 40 字）：<input id="free" maxlength="40"></label>
    <div class="part-actions"><button type="button" class="go-btn" id="check" hidden>提交出门条</button></div>`;
  const step = () => { if (!d.was) return setFocus($('was').querySelector('.chip'), '原来'); if (!d.now) return setFocus($('now').querySelector('.chip'), '现在'); $('check').hidden = false; setFocus($('check'), '提交'); };
  chips($('was'), [['answer', '算法就是最后算出来的答案'], ['order', '只要公式对，步骤顺序无所谓'], ['vague', '步骤写个大概就行'], ['shape', '流程图随便画个框就行'], ['knew', '这些我原来就明白']], { onChange: v => { d.was = v; step(); } });
  chips($('now'), [['method', '算法是一步步怎么算的方法，换个数也能用'], ['order', '计算的顺序会影响结果，先后要正确'], ['clear', '每一步要写清做什么、用哪个数、怎么算'], ['flow', '流程图用对图框、连好流程线，顺序一目了然']], { onChange: v => { d.now = v; step(); } });
  $('free').oninput = () => { d.text = $('free').value.trim().slice(0, 40); };
  $('check').onclick = async () => feedback(await submitPart({ was: d.was, now: d.now, text: $('free').value.trim().slice(0, 40) }));
  step();
  say('写出门条', '没有对错，如实选');
}

/* ---------- 选做：我身边的公式 ---------- */
function partFormula() {
  const d = ui;
  if (!d.problem) {
    $('body').innerHTML = `<p class="focus-q">教材“进一步思考”：你还学过哪些公式？选一个，把它写成算法。</p>
      <div id="pick" class="chips-col"></div>`;
    chips($('pick'), R.formulaChoices.map(id => [id, `${R.problems[id].pick} —— ${R.problems[id].title}`]), { onChange: v => { d.problem = v; partFormula(); } });
    setFocus($('pick').querySelector('.chip'), '选一个公式');
    say('选做：选一个公式');
    return;
  }
  partSteps(d.problem, { header: `<p class="note">已选：${esc(R.problems[d.problem].pick)} <button type="button" class="link-btn" id="repick">换一个</button></p>` });
  $('repick').onclick = () => { ui = {}; partFormula(); };
}

/* ---------- 分层课堂检测 ---------- */
function localGrade(question, answer) {
  if (!question.type || question.type === 'choice') return Number.isInteger(answer) && answer === question.answer;
  if (question.type === 'order') return Array.isArray(answer) && answer.length === question.answer.length && answer.every((id,i) => id === question.answer[i]);
  return answer && !Array.isArray(answer) && Object.keys(answer).length === Object.keys(question.answer).length && new Set(Object.values(answer)).size === Object.keys(question.answer).length && Object.entries(question.answer).every(([key,value]) => answer[key] === value);
}
async function renderQuiz(requestedTier) {
  const tier = requestedTier || exam?.tier || state?.currentExam?.tier || 'base';
  const page = $('quiz-page');
  if (!exam && !quizResult && !isLocal && state?.currentExam) {
    exam = state.currentExam;
    if (requestedTier && requestedTier !== exam.tier) toast(exam.tier === 'challenge' ? '还有未完成的挑战，可以继续作答或先跳过挑战。' : '先完成当前基础检测，再选择挑战。');
  }
  if (!exam && !quizResult) {
    setFocus(null);
    page.innerHTML = '<p class="note" style="padding:40px;text-align:center">准备'+(tier==='challenge'?'挑战':'基础')+'检测…</p>';
    try {
      if (isLocal) {
        const data = await api('/api/teacher/answers');
        const config = data.config;
        if (!config?.[tier]) throw new Error('检测配置还没有准备好，请稍后重试。');
        const pick = Object.keys(R.targets).flatMap(target => {
          const pool=data.questions.filter(q=>q.target===target&&q.tier===tier&&!q.excludedFromNewDraw);
          return shuffle([...(tier==='base'?pool.filter(q=>q.type!=='choice'):[]),...shuffle(pool.filter(q=>q.type==='choice')).slice(0,config[tier].choicePerTarget)]);
        });
        const questions=pick.map(q=>{
          const view=structuredClone(q);
          if (view.interaction?.rightItems) view.interaction.rightItems=shuffle(view.interaction.rightItems);
          if (view.type==='order') view.interaction.initialOrder=shuffle(view.interaction.items).map(x=>x.id);
          return view;
        });
        exam={id:uid(),tier,questions,key:Object.fromEntries(pick.map(q=>[q.id,q])),counts:{base:config.base.count,challenge:config.challenge.count},requiredPercent:config.passPercent};
      } else {
        exam = await api('/api/exam/create', {method:'POST',body:{sid:state.student.id,round:state.round,tier}});
        state = await api('/api/me');
      }
    } catch (e) { toast(e.message); show('map'); renderMap(); return; }
  }
  if (quizResult) return renderQuizResult();
  const qs=exam.questions, isChallenge=exam.tier==='challenge';
  setFocus(null);
  page.innerHTML=`<div class="quiz-wrap"><button type="button" class="ghost-btn" id="backMapQ">← 地图</button>
    <h2>${isChallenge?'可选挑战':'基础检测'} · ${qs.length}题</h2>
    <p class="note">${isChallenge?'挑战只加分，不影响基础达标；可以退出，已交的基础成绩会保留。':'提交前可以修改选择、步骤和配对；提交后再看解析。基础达到 '+UNLOCK_SCORE+'% 解锁奖励小游戏。'}</p>
    <div id="qList"></div><p id="unanswered" class="note" role="status"></p>
    <button type="button" class="go-btn" id="submitQuiz">提交${isChallenge?'挑战':'基础检测'}</button>
    ${isChallenge?'<button type="button" class="ghost-btn" id="skipChallenge">跳过挑战，返回校园</button>':''}</div>`;
  function updateUn(){
    const miss=qs.map((q,i)=>answerComplete(q,quizAnswers[q.id])?null:i+1).filter(Boolean);
    $('unanswered').textContent=miss.length?'尚未完成：'+miss.join('、'):'已完成 '+qs.length+' 题，可以提交。';
    if (!miss.length) setFocus($('submitQuiz'),'提交检测');
  }
  qs.forEach((q,i)=>{
    const item=document.createElement('div');item.className='q-item';item.dataset.questionId=q.id;
    item.innerHTML=`<p><b>${i+1}.</b> <span class="tchip t-${q.target}">${esc(R.targets[q.target])}</span> ${esc(q.prompt)}</p>${q.instruction?'<p class="note">'+esc(q.instruction)+'</p>':''}<div class="card-options"></div>`;
    $('qList').append(item);mountQuestion(item.querySelector('.card-options'),q,quizAnswers,updateUn);
  });
  updateUn();
  const back=()=>{show('map');renderMap();};
  $('backMapQ').onclick=back;
  if($('skipChallenge')) $('skipChallenge').onclick=async()=>{
    // Challenge is optional: leave it unanswered, while retaining the submitted base result.
    if (!isLocal) {
      try { await api('/api/exam/skip',{method:'POST',body:{sid:state.student.id,round:state.round,examId:exam.id}});state=await api('/api/me'); }
      catch(e){toast(e.message);return;}
    }
    exam=null;quizResult=null;quizAnswers={};back();
  };
  $('submitQuiz').onclick=async()=>{
    if (qs.some(q=>!answerComplete(q,quizAnswers[q.id]))) return toast('还有没有完成的题，先检查下方的未答编号。');
    $('submitQuiz').disabled=true;
    try {
      if(isLocal){
        const feedback=qs.map(q=>({...exam.key[q.id],chosen:quizAnswers[q.id],correct:!!localGrade(exam.key[q.id],quizAnswers[q.id])}));
        const right=feedback.filter(q=>q.correct).length,total=feedback.length,score=right/total*100,byTarget={};
        feedback.forEach(q=>{byTarget[q.target]||={right:0,total:0};byTarget[q.target].total++;if(q.correct)byTarget[q.target].right++;});
        quizResult={id:exam.id,tier:exam.tier,score,right,total,passed:!isChallenge&&score>=exam.requiredPercent,byTarget,feedback};
        state.quizAttempts.push(quizResult);
      }else{
        quizResult=await api('/api/exam/submit',{method:'POST',body:{sid:state.student.id,round:state.round,examId:exam.id,answers:quizAnswers}});
        state=await api('/api/me');
      }
      sound.play('star');renderHud();renderQuizResult();
    }catch(e){toast(e.message);if($('submitQuiz'))$('submitQuiz').disabled=false;}
  };
}
function readableAnswer(q, value) {
  if (value == null) return '未作答';
  if (!q.type || q.type==='choice') return q.options[value] ?? '未作答';
  if (q.type==='order') return Array.isArray(value)?value.map(id=>q.interaction.items.find(x=>x.id===id)?.text||id).join(' → '):'未完成排序';
  return q.interaction.leftItems.map(left=>left.text+' → '+(q.interaction.rightItems.find(right=>right.id===value[left.id])?.text||'未配对')).join('；');
}
function renderQuizResult(){
  const result=quizResult,challenge=result.tier==='challenge',wrong=(result.feedback||[]).filter(q=>!q.correct);
  const baseDone=isLocal?state.quizAttempts.some(q=>q.tier==='base'):state.examStatus?.baseCompleted;
  const attempts=(state.quizAttempts||[]).filter(q=>q.tier===result.tier&&q.paperVersion===result.paperVersion);
  const first=attempts.at(0),latest=attempts.at(-1);
  $('quiz-page').innerHTML=`<div class="quiz-wrap"><h2>${challenge?'可选挑战':'基础检测'}：${result.right} / ${result.total} 题</h2>
    <p class="result-score">${Number(result.score.toFixed(2))}%${challenge?' · 挑战只加分，不改变基础达标状态':result.passed?' · 基础达标':' · 可以回到学习资料，再试一试'}</p>
    ${first?'<p class="note">本层首次 '+Number(first.score.toFixed(2))+'%；最近 '+Number(latest.score.toFixed(2))+'%。</p>':''}
    <div class="target-bars">${Object.entries(R.targets).map(([id,name])=>{const v=result.byTarget?.[id]||{right:0,total:0};return `<div class="tb"><span>${esc(name)}</span><i style="--w:${v.total?100*v.right/v.total:0}%"></i><b>${v.right}/${v.total}</b></div>`;}).join('')}</div>
    ${!challenge&&baseDone?'<button type="button" class="go-btn" id="startChallenge">基础已完成，选做挑战</button><button type="button" class="ghost-btn" id="skipChallengeResult">跳过挑战，返回校园</button>':''}
    ${rewardReady()?'<button type="button" class="go-btn" id="toReward">进入奖励小游戏</button>':'<p class="note">基础达到 '+UNLOCK_SCORE+'% 即可解锁奖励；挑战不补足基础分数。</p>'}
    <button type="button" class="ghost-btn" id="retake">再做一份基础检测</button>
    <button type="button" class="ghost-btn" id="backMapR">返回校园</button>
    <h3>核对方法，回到学习</h3>
    ${wrong.map((q,i)=>`<div class="wrong-item"><p><span class="tchip t-${q.target}">${esc(R.targets[q.target])}</span> ${esc(q.prompt)}</p>${q.type==='match'?`<div class="match-review" data-i="${i}"></div>`:''}<p>你的作答：${esc(readableAnswer(q,q.chosen))}</p><p>参考方法：<b>${esc(readableAnswer(q,q.answer))}</b></p><p class="explain">${esc(q.explanation)}</p><button type="button" class="ghost-btn review-learning" data-stage="${{G1:'temp',G2:'temp',K1:'seeds',K2:'flow'}[q.target]||'temp'}">重看对应学习资料</button></div>`).join('')||'<p>本层全部完成正确。</p>'}</div>`;
  const start=tier=>{exam=null;quizResult=null;quizAnswers={};renderQuiz(tier);};
  $('retake').onclick=()=>start('base');
  const back=()=>{show('map');renderMap();};$('backMapR').onclick=back;
  if($('startChallenge'))$('startChallenge').onclick=()=>start('challenge');
  if($('skipChallengeResult'))$('skipChallengeResult').onclick=back;
  if($('toReward'))$('toReward').onclick=enterReward;
  document.querySelectorAll('.review-learning').forEach(button=>button.onclick=()=>openLearning(button.dataset.stage,{student:state.student,round:state.round}));
  // 配对题：用连线回看对错（绿线=配对成功，红线=配对错误）
  document.querySelectorAll('.match-review').forEach(box=>{const q=wrong[Number(box.dataset.i)];if(q&&q.type==='match')mountMatchReview(box,q,q.chosen);});
  setFocus($('backMapR'),'基础成绩会保留，挑战可以选做');
}

/* ---------- 服务端基础达标后的奖励 ---------- */
async function enterReward(){
  if(!isLocal){
    try{
      const status=await api('/api/reward/status');
      state.examStatus={...state.examStatus,...status,rewardUnlocked:!!status.unlocked};renderHud();
      if(!status.unlocked)return toast('基础检测达到 '+status.requiredPercent+'% 后即可进入奖励。');
    }catch(e){toast(e.message);return;}
  }
  if (rpg) { try { rpg.destroy(); } catch {} rpg = null; }
  show('reward');setFocus(null);
  const root=$('reward'),back=()=>{show('map');renderMap();};
  root.innerHTML=`<div class="memory-wrap"><button type="button" class="ghost-btn" id="rewardBack">← 返回校园</button><h1>接待任务小憩</h1><p>${isLocal?'教师预览 · 不写入班级记录':'基础检测已达标。可以用小游戏再复习一下。'}</p><div class="reward-choices"><button type="button" class="go-btn" id="rewardMemory">算法搭档配对</button><button type="button" class="ghost-btn" id="rewardFactory">算力工厂</button></div><p class="note">配对没有倒计时，不扣生命；随时可以返回校园。</p></div>`;
  $('rewardBack').onclick=back;
  $('rewardMemory').onclick=()=>openMemoryReward(root,{onExit:back});
  $('rewardFactory').onclick=()=>openReward(root,{onExit:back});
}

/* ---------- HUD 事件 ---------- */
$('talisman').onclick = useTalisman;
new MutationObserver(records => {
  if (records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node.matches('dialog') || node.querySelector?.('dialog'))))) refreshLinear();
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
$('to-map').onclick = () => { tryLeaveToMap(); };
$('menu-btn').onclick = () => { $('menu').hidden = !$('menu').hidden; };
$('reward-btn').onclick = () => { enterReward(); };
$('sound').onclick = () => { sound.toggle(); renderHud(); sound.play('tap'); };
$('story-replay').onclick = () => { if (state) showStory(screen === 'level' ? stage : screen === 'quiz' ? 'quiz' : 'intro'); };
$('help').onclick = () => {
  if (screen !== 'level' || !PARTS[stage + '.' + curPart()?.id]) { spotlight(2200); return; }
  hintLevel = Math.min(3, hintLevel + 1);
  sound.play('hint'); spotlight(2200);
  const info = PARTS[stage + '.' + curPart().id];
  const pool = info.scaffold?.length ? info.scaffold : info.hints;
  const last = currentPartState().last;
  const support = last?.assessment?.ok === false ? R.supportFor?.(stage,curPart().id,last.record,last.assessment,Math.max(hintLevel,errorCount())) : null;
  const tip = support?.text || pool[hintLevel - 1] || pool[pool.length - 1] || '看当前操作区域';
  const target=supportTarget(support?.target);if(target)setFocus(target,'按这一步修改');
  if (currentPartState().last) currentPartState().hintMax=Math.max(currentPartState().hintMax||0,hintLevel);
  say(`${teachGuide() ? '引导' : '提示'} ${hintLevel}：${tip}`, hintLevel < 3 ? '还需要可以再点“?”' : '');
  $('say-sub').className = 'hint';
};
$('switch').onclick = async () => {
  if (!confirm('切换学生？已提交的记录都已保存。')) return;
  try { if (!isLocal) await api('/api/logout', { method: 'POST', body: {} }); } catch {}
  state = null; exam = null; quizResult = null; quizAnswers = {}; if (rpg) { try { rpg.destroy(); } catch {} rpg = null; } show('login'); setupLogin();
};
$('fresh').onclick = async () => {
  if (screen !== 'level') return;
  const name = R.stageOf(stage).short;
  if (!confirm(`重新开始「${name}」？\n本站的作答记录与星级会清空，可以重新争取星星（该站积分也会重新计算）。`)) return;
  try {
    if (isLocal) {
      state.records[stage] = { parts: {}, history: [], visits: 0 };
      state.awards = (state.awards || []).filter(a => a.stage !== stage);
      state.points = state.awards.reduce((n, a) => n + (Number(a.points) || 0), 0);
    } else {
      state = await api('/api/stage/reset', { method: 'POST', body: { sid: state.student.id, round: state.round, stage } });
    }
    $('menu').hidden = true;
    ui = {}; hintLevel = 0; partIdx = 0;
    renderHud();
    startPart();
    toast('本站已重新开始，可以重新争取星星');
  } catch (e) { toast(e.message); }
};
$('hud-avatar').onclick = () => {
  try { localStorage.removeItem('g5l5-skin-new'); } catch {}
  $('hud-avatar').classList.remove('new-skin');
  openSkinPicker({
    state,
    current: character,
    remembered: loadRemembered(state?.student),
    onPick: id => {
      if (!CHARACTERS[id]) return;
      character = id;
      try { localStorage.setItem('g5l5-character', id); } catch {}
      renderHud();
      if (screen === 'map') {
        if (rpg && rpg.setCharacter) rpg.setCharacter(character);
        else renderMap();
      }
      sound.play('good');
    }
  });
};
$('test-quiz').onclick = () => { show('quiz'); exam = null; quizResult = null; quizAnswers = {}; renderQuiz(); };
$('test-answer').onclick = () => { $('test-answer-text').textContent = screen === 'level' ? (TEST_ANSWERS[stage + '.' + curPart()?.id] || '') : '进入某一站后可看本步参考答案'; };

/* ---------- 启动 ---------- */
async function boot() {
  setupLogin();
  if (mode === 'test') {
    state = { student: { id: 'teacher-test', classId: '501', name: '教师测试' }, round: 'r1', records: {}, awards: [], points: 0, quizAttempts: [] };
    // /test?game=1 直达奖励游戏，便于教师课前预览
    if (new URLSearchParams(location.search).has('game')) { enterReward(); return; }
    await enterCampus(); return;
  }
  if (mode === 'student') {
    try { state = await api('/api/me'); character = pickCharacter(state.student.id); await enterCampus(); }
    catch { show('login'); }
    setInterval(() => {
      if (!state) return;
      const identity = { sid: state.student.id, round: state.round };
      flushQueue(identity).then(n => { if (n === 0 && state?.student.id === identity.sid && state.round === identity.round) setSync('已补传完成'); }).catch(() => {});
    }, 8000);
  } else show('login');
}
window.__enterPlace = id => enterPlace(id);
window.__places = () => places;
boot();
