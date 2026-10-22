/* 教师大屏：按班看图表——进度、每个证据点首答/最终、误解（首次/仍未纠正）、检测按目标、出门条。 */
import { api } from './sync.mjs';
import { ANSWER_SHEET } from './answers.mjs';
import { tierAttempts, scorePair, answerText } from './teacher-metrics.mjs';
const R = globalThis.LessonRules;
/* 标准答案各站展开状态：大屏每 5 秒重绘一次，需自己记住，否则会被收起 */
const ansOpen = { temp: true };
const CLASSES = ['501', '502', '503', '504'];
const dash = document.getElementById('dash');
let classId = '501', data = null, query = '', syncError = '';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (n, d) => d ? Math.round(100 * n / d) : 0;
/** 某学生某站已得星数（0–3） */
const starsOf = (s, id) => { const n = Number(s.records?.[id]?.summary?.stars); return Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : 0; };
const tchips = ts => ts.map(t => `<span class="tchip t-${t}">${t}</span>`).join('');
const WAS = { answer: '算法就是答案', order: '顺序无所谓', vague: '步骤写个大概', shape: '图框随便画', knew: '原来就明白' };
const NOW = { method: '算法是方法，换数也能用', order: '顺序影响结果', clear: '每步写清', flow: '流程图顺序一目了然' };

async function load() {
  try { data = await api('/api/teacher/class?class=' + classId); syncError = ''; }
  catch (e) { syncError = '刷新失败：' + e.message; }
  render();
}
function pairBars(rows, { a = '首答', b = '最终', unit = '%' } = {}) {
  if (!rows.length) return '<p class="muted">尚无证据</p>';
  return `<div class="legend"><i class="ca"></i>${a}<i class="cb"></i>${b}</div>` + rows.map(r => `
    <div class="pair"><span class="lbl" title="${esc(r.title || r.label)}">${r.label}</span>
      <div class="bars"><div class="bar a"><span style="width:${r.av}%"></span><em>${r.at}</em></div>
      <div class="bar b"><span style="width:${r.bv}%"></span><em>${r.bt}</em></div></div></div>`).join('');
}
function answerSheet() {
  return ANSWER_SHEET.map(st => `<details class="ansbox" data-stage="${esc(st.stage)}" ${ansOpen[st.stage] ? 'open' : ''}>
    <summary>${esc(st.short)} · ${esc(st.name)}${st.optional ? '（选做）' : ''} · ${st.parts.length} 个证据点</summary>
    ${st.parts.map(p => `<div class="anspart"><h3>${esc(p.name)}</h3>
      <table class="anstab"><tbody>${p.items.map(([q, a]) => `<tr><th>${esc(q)}</th><td>${esc(a)}</td></tr>`).join('')}</tbody></table>
      ${p.wrong ? `<p class="answrong">${esc(p.wrong)}</p>` : ''}</div>`).join('')}
  </details>`).join('');
}
function render() {
  const students = data?.students || [];
  const N = students.length;
  const entered = students.filter(s => Object.values(s.records || {}).some(r => r.summary?.started) || (s.quizAttempts || []).length).length;
  const mainDone = students.filter(s => R.requiredIds.every(id => s.records?.[id]?.summary?.pass)).length;
  const quized = students.filter(s => tierAttempts(s, 'base').length);
  const challenge = students.filter(s => tierAttempts(s, 'challenge').length);
  const legacy = students.filter(s => tierAttempts(s, 'legacy').length);
  const avg = arr => arr.length ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : null;
  const q0 = avg(quized.map(s => tierAttempts(s, 'base')[0].score)), q1 = avg(quized.map(s => tierAttempts(s, 'base').at(-1).score));

  // ① 各站进度 + 星星分布
  const prog = R.stages.map(st => {
    const done = students.filter(s => s.records?.[st.id]?.summary?.pass).length;
    const going = students.filter(s => !s.records?.[st.id]?.summary?.pass && s.records?.[st.id]?.summary?.started).length;
    const bucket = [0, 0, 0, 0];
    for (const s of students) bucket[starsOf(s, st.id)] += 1;
    const total = bucket.reduce((acc, c, i) => acc + c * i, 0);
    return { st, done, going, none: N - done - going, bucket, stars: total, avg: N ? total / N : 0 };
  });
  const starTotal = prog.reduce((acc, p) => acc + p.stars, 0);
  const starMax = N * R.requiredIds.length * 3;
  // ② 证据点首答 vs 最终（分母=提交过该证据点的学生）
  const partRows = R.stages.flatMap(st => st.parts.filter(p => !p.selfCheck).map(p => {
    const subs = students.map(s => s.records?.[st.id]?.parts?.[p.id]).filter(x => x && x.first);
    const f = subs.filter(x => x.first.assessment.ok).length, l = subs.filter(x => x.last.assessment.ok).length;
    return { label: `${st.short}·${p.name.split('：')[0].split('（')[0].slice(0, 9)} ${tchips(p.targets)}`, title: p.name, av: pct(f, subs.length), bv: pct(l, subs.length), at: subs.length ? `${pct(f, subs.length)}%` : '—', bt: subs.length ? `${pct(l, subs.length)}%（n=${subs.length}）` : '尚无证据', n: subs.length };
  }));
  // ③ 误解：首次出现人数 vs 仍未纠正人数
  const mis = {};
  for (const s of students) {
    const first = new Set(), left = new Set();
    for (const id of R.stageIds) { const sum = s.records?.[id]?.summary; (sum?.firstTags || []).forEach(t => first.add(t)); (sum?.lingeringTags || []).forEach(t => left.add(t)); }
    first.forEach(t => { (mis[t] ||= { f: 0, l: 0 }).f++; });
    left.forEach(t => { (mis[t] ||= { f: 0, l: 0 }).l++; });
  }
  const misRows = Object.entries(mis).sort((a, b) => b[1].f - a[1].f).slice(0, 9).map(([t, v]) => ({ label: esc(R.misconceptions[t] || t), av: pct(v.f, N), bv: pct(v.l, N), at: `${v.f}人`, bt: `${v.l}人` }));
  // ④ 检测按目标：首次 vs 最近
  const tgtRows = Object.entries(R.targets).map(([t, name]) => {
    const agg = which => quized.reduce((acc, s) => { const attempts = tierAttempts(s, 'base'); const v = (which === 0 ? attempts[0] : attempts.at(-1)).byTarget?.[t]; if (v) { acc.r += v.right; acc.t += v.total; } return acc; }, { r: 0, t: 0 });
    const a = agg(0), b = agg(1);
    return { label: `${tchips([t])} ${esc(name.split(' ').slice(1).join(' '))}`, av: pct(a.r, a.t), bv: pct(b.r, b.t), at: a.t ? `${pct(a.r, a.t)}%` : '—', bt: b.t ? `${pct(b.r, b.t)}%（${quized.length}人）` : '尚无证据' };
  });
  // ⑤ 出门条
  const ref = { was: {}, now: {} };
  students.forEach(s => { const r = s.records?.signin?.parts?.reflect?.last?.record; if (r) { ref.was[r.was] = (ref.was[r.was] || 0) + 1; ref.now[r.now] = (ref.now[r.now] || 0) + 1; } });
  const refN = students.filter(s => s.records?.signin?.parts?.reflect).length;

  const list = students.filter(s => !query || s.student.name.includes(query));
  dash.innerHTML = `
  <header>
    <div><h1>生活算法站 · 教师大屏</h1>
      <div class="muted">第5课 数学运算讲方法 · 轮次 ${esc(data?.round || '')} · 统计分母=本班名单 ${N} 人（证据点正确率分母=提交过该点的人数）</div></div>
    <div class="chips" id="classes">${CLASSES.map(c => `<button data-c="${c}" class="${c === classId ? 'on' : ''}">${c}班</button>`).join('')}</div>
    <div class="actions"><button id="refresh">刷新</button><button id="testMode">教师测试</button><button id="showAnswers">标准答案</button><button id="answers">题库与答案</button><button id="examControl" ${data ? '' : 'disabled'}>${data?.examClosed ? '重新开放本班检测' : '关闭本班检测'}</button><button id="newRound" class="warn">开启本班新一轮</button></div>
  </header>
  ${syncError ? `<p class="err">${esc(syncError)}</p>` : ''}
  <div class="kpi">
    <div><b>${N}</b>名单</div><div><b>${entered}</b>已开始</div><div><b>${N - entered}</b>未开始</div>
    <div><b>${mainDone}</b>主线当前通过</div><div><b>${quized.length}</b>已交基础检测</div>
    <div><b>${q0 == null ? '—' : q0 + '→' + q1}</b>基础均分 首次→最近</div>
  </div>
  <p class="muted exam-state">本班检测：${data?.examClosed ? '已关闭' : '按必做站完成情况自动开放'}。基础达80%解锁奖励；挑战自选，不能弥补基础不足。${challenge.length}人已交挑战，${legacy.length}人保留旧版整卷记录。</p>
  <div class="grid">
    <section class="panel"><h2>① 各站进度与星星</h2>
      ${N ? prog.map(p => `<div class="stack-row"><span class="lbl">${esc(p.st.short)}${p.st.optional ? '（选做）' : ''}</span>
        <div class="stack"><span class="s-done" style="width:${pct(p.done, N)}%"></span><span class="s-going" style="width:${pct(p.going, N)}%"></span></div>
        <span class="num">${p.done}/${N}</span></div>
        <div class="star-line"><span class="lbl"></span>
          <span class="starcount"><b class="s3">3★</b>${p.bucket[3]}<b class="s2">2★</b>${p.bucket[2]}<b class="s1">1★</b>${p.bucket[1]}<b class="s0">0★</b>${p.bucket[0]}</span>
          <span class="num">均 ${p.avg.toFixed(1)}★</span></div>`).join('')
        + `<div class="legend"><i class="cd"></i>完成<i class="cg"></i>进行中<i class="cn"></i>未开始</div>
           <p class="muted small">全班星星合计 <b class="star-total">${starTotal}</b> / 满额 ${starMax}（每站每人 3 颗）</p>` : '<p class="muted">尚无证据</p>'}
    </section>
    <section class="panel"><h2>② 证据点：首答 vs 最终正确率</h2>${pairBars(partRows.filter(r => r.n), { a: '首答', b: '最终' }) }</section>
    <section class="panel"><h2>③ 误解：首次出现 vs 仍未纠正（人数）</h2>${pairBars(misRows, { a: '首次出现', b: '仍未纠正' })}
      <p class="muted small">建议：先处理“仍未纠正”最多的一项，再请学生回到对应证据点重做。</p></section>
    <section class="panel"><h2>④ 基础检测：按目标正确率</h2>${quized.length ? pairBars(tgtRows, { a: '首次', b: '最近' }) : '<p class="muted">尚无证据</p>'}
      <p class="muted small">共同先学不算加强提示；结合方法卡首答、实际帮助等级和修订看学习证据。挑战、旧版整卷不混入本图。</p></section>
    <section class="panel wide"><h2>⑤ 出门条（${refN}人）：我原来以为 → 现在我认为</h2>
      ${refN ? `<div class="two">${['was', 'now'].map(k => `<div>${Object.entries(k === 'was' ? WAS : NOW).map(([v, t]) => `<div class="stack-row"><span class="lbl">${t}</span><div class="stack"><span class="${k === 'was' ? 's-was' : 's-done'}" style="width:${pct(ref[k][v] || 0, refN)}%"></span></div><span class="num">${ref[k][v] || 0}</span></div>`).join('')}</div>`).join('')}</div>` : '<p class="muted">尚无证据</p>'}
    </section>
    <section class="panel wide" id="ansSheet"><h2>⑥ 各站标准答案 <span class="muted small" style="font-weight:400">（与 /test 的「本步参考答案」同一份数据）</span></h2>
      ${answerSheet()}
    </section>
  </div>
  <section class="panel" style="margin-top:12px">
    <h2>学生明细 <input id="q" placeholder="查姓名（只筛选下表，不改变上方统计）" value="${esc(query)}"></h2>
    <table><thead><tr><th>姓名</th><th>当前位置</th><th>主线</th><th>各站星星</th><th>首答正确</th><th>尝试</th><th>最高帮助</th><th>仍未纠正的误解</th><th>签到方法卡（最终）</th><th>基础 / 挑战 / 旧版（首→近）</th><th>最近同步</th></tr></thead>
      <tbody>${list.map(row).join('') || '<tr><td colspan="11" class="muted">尚无证据</td></tr>'}</tbody></table>
    <p class="muted">更新于 ${data?.at ? new Date(data.at).toLocaleTimeString('zh-CN') : '—'} · 每5秒自动刷新 · 带*为名单外手动登录</p>
  </section>`;
  dash.querySelectorAll('#classes button').forEach(b => { b.onclick = () => { classId = b.dataset.c; load(); }; });
  dash.querySelector('#refresh').onclick = load;
  dash.querySelector('#showAnswers').onclick = () => { document.getElementById('ansSheet').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  dash.querySelectorAll('.ansbox').forEach(d => d.addEventListener('toggle', () => { ansOpen[d.dataset.stage] = d.open; }));
  dash.querySelector('#testMode').onclick = () => { location.href = '/test'; };
  dash.querySelector('#q').oninput = e => { query = e.target.value.trim(); const pos = e.target.selectionStart; render(); const q = dash.querySelector('#q'); q.focus(); q.setSelectionRange(pos, pos); };
  dash.querySelector('#newRound').onclick = async () => {
    if (!confirm(`为 ${classId} 班开启新一轮？旧一轮记录保留在数据库，大屏和学生端从零开始。`)) return;
    await api('/api/teacher/new-round', { method: 'POST', body: { classId } }); load();
  };
  dash.querySelector('#examControl').onclick = async e => {
    e.currentTarget.disabled = true;
    try { await api('/api/teacher/exam-close', { method: 'POST', body: { classId, closed: !data.examClosed } }); await load(); }
    catch (err) { syncError = '检测设置失败：' + err.message; render(); }
  };
  dash.querySelector('#answers').onclick = async () => {
    const a = await api('/api/teacher/answers');
    const w = window.open('', '_blank');
    if (w) w.document.body.innerHTML = '<meta charset="utf-8"><h2>题库与答案</h2>' + a.questions.map(q => `<p><b>[${esc(q.id)}·${esc(q.tier || '旧版')}·${esc(q.type || 'choice')}]</b> ${esc(q.prompt)}${q.excludedFromNewDraw ? '（仅保留历史，新卷不抽）' : ''}<br>答案：${esc(answerText(q))}<br><small>${esc(q.explanation)}</small></p>`).join('');
  };
}
function row(s) {
  const done = R.requiredIds.filter(id => s.records?.[id]?.summary?.pass).length;
  const cur = R.requiredIds.find(id => !s.records?.[id]?.summary?.pass);
  const curSum = cur && s.records?.[cur]?.summary;
  const curPart = curSum?.currentPart ? R.partOf(cur, curSum.currentPart)?.name.split('：')[0].split('（')[0] : '';
  const withId = R.stageIds.map(id => ({ id, sum: s.records?.[id]?.summary })).filter(x => x.sum);
  const sums = withId.map(x => x.sum);
  const graded = withId.reduce((n, x) => n + x.sum.parts.filter(p => p.started && !R.partOf(x.id, p.id)?.selfCheck).length, 0);
  const firstOk = withId.reduce((n, x) => n + x.sum.parts.filter(p => p.started && p.firstOk && !R.partOf(x.id, p.id)?.selfCheck).length, 0);
  const tries = sums.reduce((n, x) => n + x.parts.reduce((m, p) => m + p.attempts, 0), 0);
  const hint = Math.max(0, ...sums.map(x => x.hintMax || 0));
  const tags = [...new Set(sums.flatMap(x => x.lingeringTags || []))];
  const card = s.records?.signin?.parts?.steps?.last;
  const cardText = card ? card.record.rows.map((r, i) => `${i + 1}.${R.rowText('signin', r, { rule: card.record.rule })}`).join(' ') : '';
  const q = s.quizAttempts || [];
  const started = sums.some(x => x.started) || q.length;
  return `<tr class="${started ? '' : 'idle'}">
    <td>${esc(s.student.name)}${s.student.manual ? '*' : ''}</td>
    <td>${s.lessonExpired ? '上一课次（只读，请开新一轮）' : started ? (cur ? `${esc(R.stageOf(cur).short)}·${esc(curPart || '')}` : '主线完成') : '未开始'}</td>
    <td>${done}/${R.requiredIds.length}</td>
    <td class="stars-cell">${R.requiredIds.map(id => { const n = starsOf(s, id); return `<span class="sg n${n}" title="${esc(R.stageOf(id).short)}：${n} 星">${R.starGlyphs(n)}</span>`; }).join('')}</td>
    <td>${graded ? `${firstOk}/${graded}` : '—'}</td><td>${tries || '—'}</td><td>${hint || '—'}</td>
    <td>${tags.map(t => `<span class="tag">${esc((R.misconceptions[t] || t).slice(0, 12))}</span>`).join('') || '—'}</td>
    <td class="cardtxt">${card ? `<span class="${card.assessment.ok ? 'okt' : 'badt'}">${card.assessment.ok ? '✓' : '✗'}</span> ${esc(cardText)}` : '—'}</td>
    <td class="quiz-tiers">基础 ${scorePair(tierAttempts(s, 'base'))}<br>挑战 ${scorePair(tierAttempts(s, 'challenge'))}<br>旧版 ${scorePair(tierAttempts(s, 'legacy'))}</td>
    <td>${s.updated ? new Date(s.updated).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td></tr>`;
}
load();
setInterval(load, 5000);
