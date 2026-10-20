/**
 * 算力工厂 · 奖励小游戏（课堂检测 80 分以上解锁）
 * 玩法：机器给出「输入」和「处理」的运算法则，学生点出正确的「输出」。
 * 60 秒、3 颗心；答对连击加分，答错给出一算式讲解；难度随答对题数递增。
 */
import { sound } from './sfx.mjs';
import { makeRound, optionsFor, explainOf, levelOf, scoreOf, rankOf, TOTAL_TIME, LIVES } from './reward-rules.mjs';

const BEST_KEY = 'g5l5-reward-best';
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } };
const saveBest = v => { try { localStorage.setItem(BEST_KEY, String(v)); } catch {} };

const TPL = `
<div class="rw-wrap">
  <div class="rw-top">
    <button type="button" class="ghost-btn" id="rw-back">← 回地图</button>
    <h2 class="rw-title">算力工厂<small>考核 80 分以上解锁</small></h2>
    <div class="rw-meta">
      <span class="rw-chip">分数 <b id="rw-score">0</b></span>
      <span class="rw-chip">连击 <b id="rw-streak">0</b></span>
      <span class="rw-chip rw-hearts" id="rw-lives" aria-label="剩余生命"></span>
    </div>
  </div>
  <div class="rw-clock" id="rw-clock"><i id="rw-bar"></i></div>
  <div class="rw-stage">
    <div class="rw-machine">
      <div class="rw-box in"><small>输入</small><b id="rw-input">0</b></div>
      <span class="rw-joiner">▶</span>
      <div class="rw-ops" id="rw-ops"></div>
      <span class="rw-joiner">▶</span>
      <div class="rw-box out"><small>输出</small><b>?</b></div>
    </div>
    <p class="rw-ask">机器会算出什么？<b id="rw-hint">选一个数</b></p>
    <div class="rw-choices" id="rw-choices" role="group" aria-label="选择输出"></div>
    <p class="rw-tip" id="rw-tip" role="status">点正确的输出，越快连击越高</p>
  </div>
  <div class="rw-over" id="rw-over" hidden>
    <h3 id="rw-over-title">本轮结束</h3>
    <p class="rw-rank"><b id="rw-rank">B</b><span id="rw-rank-text"></span></p>
    <ul class="rw-stats">
      <li>得分<b id="rw-final">0</b></li>
      <li>答对<b id="rw-right">0</b></li>
      <li>最高连击<b id="rw-maxstreak">0</b></li>
      <li>历史最佳<b id="rw-best">0</b></li>
    </ul>
    <div class="rw-actions">
      <button type="button" class="go-btn" id="rw-again">再玩一轮</button>
      <button type="button" class="ghost-btn" id="rw-exit">回地图</button>
    </div>
  </div>
</div>`;

let G = null;

function stop() {
  if (!G) return;
  clearInterval(G.clock);
  clearTimeout(G.next);
  if (G.cleanup) G.cleanup();
  G = null;
}

export function openReward(root, { onExit = () => {} } = {}) {
  stop();
  root.innerHTML = TPL;
  const q = sel => root.querySelector(sel);
  const g = G = {
    root, onExit, ended: false, locked: false,
    score: 0, streak: 0, maxStreak: 0, correct: 0, lives: LIVES,
    left: TOTAL_TIME, clock: null, next: null, round: null
  };

  const paint = () => {
    q('#rw-score').textContent = String(g.score);
    q('#rw-streak').textContent = String(g.streak);
    q('#rw-lives').innerHTML = Array.from({ length: LIVES }, (_, i) => `<span class="${i < g.lives ? '' : 'lost'}">❤</span>`).join('');
    q('#rw-final').textContent = String(g.score);
  };

  const ask = () => {
    if (g.ended) return;
    const round = g.round = makeRound(levelOf(g.correct));
    q('#rw-input').textContent = String(round.input);
    q('#rw-ops').innerHTML = round.ops
      .map((o, i) => `${i ? '<span class="rw-op-sep">→</span>' : ''}<span class="rw-op">${o.op}${o.n}</span>`)
      .join('');
    const box = q('#rw-choices');
    box.innerHTML = '';
    optionsFor(round).forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rw-choice';
      b.dataset.v = String(v);
      b.innerHTML = `${v}<kbd>${i + 1}</kbd>`;
      b.onclick = () => answer(v, b);
      box.appendChild(b);
    });
    q('#rw-tip').className = 'rw-tip';
    q('#rw-tip').textContent = '点正确的输出，越快连击越高';
    q('#rw-hint').textContent = levelOf(g.correct) >= 2 ? '这台机器有两步运算' : '选一个数';
  };

  const answer = (v, btn) => {
    if (g.ended || g.locked) return;
    const round = g.round;
    const right = v === round.answer;
    g.locked = true;
    for (const b of q('#rw-choices').children) {
      b.disabled = true;
      if (Number(b.dataset.v) === round.answer) b.classList.add('reveal');
    }
    if (right) {
      const gain = scoreOf(g.streak);
      btn.classList.add('right');
      g.score += gain;
      g.streak += 1;
      g.maxStreak = Math.max(g.maxStreak, g.streak);
      g.correct += 1;
      sound.play('good');
      q('#rw-tip').className = 'rw-tip ok';
      q('#rw-tip').textContent = g.streak >= 3 ? `连击 ${g.streak}！+${gain} 分` : `答对了 +${gain} 分`;
      paint();
      g.next = setTimeout(() => { g.locked = false; ask(); }, 330);
      return;
    }
    btn.classList.add('wrong');
    g.lives -= 1;
    g.streak = 0;
    sound.play('bad');
    q('#rw-tip').className = 'rw-tip bad';
    q('#rw-tip').textContent = `正确答案 ${round.answer}：${explainOf(round)}`;
    paint();
    if (g.lives <= 0) g.next = setTimeout(() => over('三次机会用完了'), 900);
    else g.next = setTimeout(() => { g.locked = false; ask(); }, 1500);
  };

  const over = why => {
    if (g.ended) return;
    g.ended = true;
    clearInterval(g.clock);
    clearTimeout(g.next);
    const prev = readBest();
    const best = Math.max(prev, g.score);
    if (g.score > prev) saveBest(g.score);
    const rank = rankOf(g.score);
    q('#rw-over').hidden = false;
    q('#rw-over').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    q('#rw-over-title').textContent = why;
    q('#rw-rank').textContent = rank.key;
    q('#rw-rank-text').textContent = rank.text;
    q('#rw-right').textContent = String(g.correct);
    q('#rw-maxstreak').textContent = String(g.maxStreak);
    q('#rw-best').textContent = String(best);
    q('#rw-final').textContent = String(g.score);
    sound.play('star');
    q('#rw-again').focus();
  };

  const quit = () => { const back = g.onExit; stop(); back(); };

  q('#rw-back').onclick = quit;
  q('#rw-exit').onclick = quit;
  q('#rw-again').onclick = () => {
    q('#rw-over').hidden = true;
    g.ended = false; g.locked = false;
    g.score = 0; g.streak = 0; g.maxStreak = 0; g.correct = 0; g.lives = LIVES; g.left = TOTAL_TIME;
    paint();
    q('#rw-bar').style.width = '100%';
    q('#rw-clock').classList.remove('low');
    clearInterval(g.clock);
    g.clock = setInterval(tick, 100);
    ask();
  };

  const tick = () => {
    if (g.ended) return;
    g.left = Math.max(0, g.left - 0.1);
    q('#rw-bar').style.width = (g.left / TOTAL_TIME) * 100 + '%';
    q('#rw-clock').classList.toggle('low', g.left <= 10);
    if (g.left <= 0) over('时间到');
  };

  const onKey = e => {
    if (g.ended) return;
    const i = ['1', '2', '3'].indexOf(e.key);
    if (i < 0) return;
    const b = q('#rw-choices').children[i];
    if (b && !b.disabled) { e.preventDefault(); b.click(); }
  };
  document.addEventListener('keydown', onKey);
  g.cleanup = () => document.removeEventListener('keydown', onKey);

  paint();
  g.clock = setInterval(tick, 100);
  ask();
}
