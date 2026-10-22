/**
 * 换装奖励：每一站拿到 3 颗星，解锁一套装扮。
 * 精灵由原角色改调色板生成，尺寸/姿势与原有素材完全一致（同风格）。
 */

export const STAR_REQUIRED = 3;

export const STAGE_SHORT = { temp: '温度换算', flow: '流程图', seeds: '分种子', signin: '签到积分' };

/** 四套通关奖励装扮（每套有男女两款） */
export const SKINS = [
  { key: 'Weather', name: '气象观测员', stage: 'temp', desc: '整理气温资料时的装扮' },
  { key: 'Flow', name: '流程设计师', stage: 'flow', desc: '把流程一步步写清楚' },
  { key: 'Seeds', name: '实验小助手', stage: 'seeds', desc: '分装活动材料时的装扮' },
  { key: 'Signin', name: '阅读领读员', stage: 'signin', desc: '解说积分规则时的装扮' }
];

/** 默认形象，一直可用 */
export const BASES = [
  { id: 'maleAdventurer', name: '男生形象', gender: 'male' },
  { id: 'femaleAdventurer', name: '女生形象', gender: 'female' }
];

export const skinId = (key, gender) => (gender === 'female' ? 'female' : 'male') + key;
export const genderOf = id => (String(id || '').startsWith('female') ? 'female' : 'male');
export const spriteFor = (id, pose = 'idle') => `/assets/kenney/characters/${id}_${pose}.png`;
/** 奖励装扮另有专属立绘（头像/换装卡片用），地图上仍用同配色精灵 */
export const portraitFor = id => SKINS.some(s => id === skinId(s.key, 'male') || id === skinId(s.key, 'female'))
  ? `/assets/skins/portrait_${id}.png`
  : null;

/** 某站已得星数（优先用通关奖励里的记录，其次用当前回合小结） */
export function starsOf(state, stage) {
  if (!stage) return STAR_REQUIRED;
  const award = (state?.awards || []).find(a => a.stage === stage);
  if (award && Number.isFinite(Number(award.stars))) return Number(award.stars);
  const sum = state?.records?.[stage]?.summary;
  return Number(sum?.stars) || 0;
}

/** 整套装扮是否已解锁：默认形象恒可用；奖励装扮要求该站 3 星，或此前已解锁过 */
export function isSkinUnlocked(state, skin, remembered = null) {
  if (!skin || !skin.stage) return true;
  if (remembered && typeof remembered.has === 'function' && remembered.has(skin.stage)) return true;
  return starsOf(state, skin.stage) >= STAR_REQUIRED;
}

/** 供界面渲染的清单：默认形象在前，奖励按关卡顺序，男女各一款 */
export function catalog(state, remembered = null) {
  const out = BASES.map(b => ({ id: b.id, name: b.name, gender: b.gender, stage: null, desc: '入学时的样子', unlocked: true, portrait: null }));
  for (const skin of SKINS) {
    for (const gender of ['male', 'female']) {
      const id = skinId(skin.key, gender);
      out.push({
        id,
        name: `${skin.name}·${gender === 'female' ? '女生' : '男生'}`,
        gender,
        stage: skin.stage,
        desc: skin.desc,
        unlocked: isSkinUnlocked(state, skin, remembered),
        portrait: portraitFor(id)
      });
    }
  }
  return out;
}

/* ---------- 跨轮次记忆：解锁过的装扮不因「开启新一轮」被收回 ---------- */
const storageKey = student => 'g5l5-skins:' + JSON.stringify([String(student?.classId || ''), String(student?.id || '')]);

export function loadRemembered(student) {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(student));
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter(s => STAGE_SHORT[s]) : []);
  } catch { return new Set(); }
}

export function rememberStages(student, stages) {
  try {
    const merged = loadRemembered(student);
    for (const s of stages || []) if (STAGE_SHORT[s]) merged.add(s);
    globalThis.localStorage?.setItem(storageKey(student), JSON.stringify([...merged]));
  } catch {}
}

/** 把当前回合已达成三星的站并入记忆 */
export function rememberFromState(student, state) {
  rememberStages(student, SKINS.filter(s => starsOf(state, s.stage) >= STAR_REQUIRED).map(s => s.stage));
}

/** 记录当前各站星数，用于比较「刚刚是否新达成三星」 */
export function starSnapshot(state) {
  const out = {};
  for (const skin of SKINS) out[skin.stage] = starsOf(state, skin.stage);
  return out;
}

/** 与快照比较，返回本次新解锁的装扮名称列表 */
export function newlyUnlocked(before, state) {
  return SKINS
    .filter(s => Number(before?.[s.stage] || 0) < STAR_REQUIRED && starsOf(state, s.stage) >= STAR_REQUIRED)
    .map(s => s.name);
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 打开换装面板；onPick(id) 由调用方负责保存与刷新 */
export function openSkinPicker({ state, current, remembered = null, onPick, onClose } = {}) {
  if (typeof document === 'undefined') return null;
  const list = catalog(state, remembered);
  const dialog = document.createElement('dialog');
  dialog.className = 'skin-dialog';
  dialog.setAttribute('aria-label', '换装');
  const unlockedCount = list.filter(x => x.unlocked && x.stage).length;
  const card = s => `
    <button type="button" class="skin-card${s.unlocked ? '' : ' locked'}${s.id === current ? ' current' : ''}"
      data-id="${esc(s.id)}" ${s.unlocked ? '' : 'disabled'} aria-pressed="${s.id === current}">
      <img src="${s.portrait || spriteFor(s.id)}" class="${s.portrait ? 'portrait' : 'sprite'}" alt="${esc(s.name)}" loading="lazy">
      <b>${esc(s.name)}</b>
      <small>${s.unlocked ? (s.stage ? '已解锁' : '默认可用') : `🔒 ${esc(STAGE_SHORT[s.stage] || '')} ${STAR_REQUIRED}★`}</small>
    </button>`;
  dialog.innerHTML = `
    <header class="skin-head">
      <h2>换装</h2>
      <button type="button" class="ghost-btn" id="skinClose">关闭</button>
    </header>
    <p class="skin-hint">每一站拿到 ${STAR_REQUIRED} 颗星，解锁一套新装扮。已解锁 ${unlockedCount}/${SKINS.length} 套。</p>
    <h3 class="skin-group">默认形象</h3>
    <div class="skin-grid">${list.filter(s => !s.stage).map(card).join('')}</div>
    <h3 class="skin-group">通关奖励</h3>
    <div class="skin-grid">${list.filter(s => s.stage).map(card).join('')}</div>`;
  document.body.append(dialog);
  const close = () => dialog.close();
  dialog.querySelector('#skinClose').onclick = close;
  dialog.querySelectorAll('.skin-card').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      const item = list.find(x => x.id === id);
      if (!item || !item.unlocked) return;
      try { onPick?.(id); } catch {}
      close();
    };
  });
  dialog.addEventListener('close', () => { dialog.remove(); onClose?.(); }, { once: true });
  dialog.showModal();
  return dialog;
}
