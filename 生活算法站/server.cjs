'use strict';
/* 第5课《数学运算讲方法》课堂服务：名单登录、证据点首答/最终记录、积分去重、20题检测、教师大屏。端口8795。 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const quiz = require('./quiz.cjs');
const { isTeacherAddress, teacherOrigins, parseAllowList } = require('./teacher-access.cjs');

const BASE = __dirname;
const CLASSES = ['501', '502', '503', '504'];
const COOKIE_STUDENT = 'g5l5_student';
const DEFAULT_PORT = 8795;

function shuffleQuestion(q) {
  if (q.type && q.type !== 'choice') {
    const interaction = structuredClone(q.interaction);
    if (interaction.rightItems) interaction.rightItems = shuffle(interaction.rightItems);
    return { ...q, interaction };
  }
  const order = q.options.map((_, i) => i).map(i => ({ i, n: crypto.randomInt(0, 1e9) })).sort((a, b) => a.n - b.n).map(v => v.i);
  return { ...q, options: order.map(i => q.options[i]), answer: order.indexOf(q.answer) };
}
function shuffle(items) { return items.map(value => ({ value, n: crypto.randomInt(0, 1e9) })).sort((a, b) => a.n - b.n).map(x => x.value); }

function createService(options = {}) {
  const networkInterfaces = options.networkInterfaces || os.networkInterfaces;
  const allow = parseAllowList(options.teacherAllow ?? process.env.TEACHER_ALLOW);
  const runtimeDir = options.runtimeDir || process.env.DATA_DIR || path.join(BASE, 'runtime');
  fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
  let roster = options.roster;
  if (!roster) {
    const source = fs.existsSync(path.join(BASE, 'roster.json')) ? 'roster.json' : 'roster.example.json';
    roster = JSON.parse(fs.readFileSync(path.join(BASE, source), 'utf8'));
    if (source.includes('example')) console.warn('使用样例名单，请导入五年级正式名单。');
  }
  const rules = require('./public/rules.js');
  const stages = rules.stageIds;
  const pointsOf = id => rules.stages.find(s => s.id === id).points;
  const db = new DatabaseSync(path.join(runtimeDir, 'classroom.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY, classId TEXT NOT NULL, name TEXT NOT NULL, manual INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rounds(classId TEXT PRIMARY KEY, n INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS states(sid TEXT NOT NULL, round TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(sid, round));
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, role TEXT NOT NULL, sid TEXT, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id TEXT NOT NULL, sid TEXT NOT NULL, round TEXT NOT NULL, PRIMARY KEY(id, sid, round));
    CREATE TABLE IF NOT EXISTS talisman_events(id TEXT NOT NULL, sid TEXT NOT NULL, round TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(id, sid, round));
    CREATE TABLE IF NOT EXISTS exams(id TEXT PRIMARY KEY, sid TEXT NOT NULL, round TEXT NOT NULL, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS exam_controls(classId TEXT NOT NULL, round TEXT NOT NULL, lessonDay TEXT NOT NULL, closed INTEGER NOT NULL, PRIMARY KEY(classId, round, lessonDay));`);
  const rosterIds = new Set();
  for (const s of roster) {
    if (!CLASSES.includes(String(s.classId)) || !s.id || !String(s.name).trim()) throw new Error('名单包含不合法的五年级班级或身份');
    rosterIds.add(String(s.id));
    db.prepare('INSERT INTO students VALUES(?,?,?,0) ON CONFLICT(id) DO UPDATE SET classId=excluded.classId, name=excluded.name, manual=0')
      .run(String(s.id), String(s.classId), String(s.name).trim());
  }
  for (const c of CLASSES) db.prepare('INSERT OR IGNORE INTO rounds VALUES(?,1)').run(c);

  const clock = options.now || (() => new Date());
  const now = () => clock().toISOString();
  const dayOf = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const lessonDay = () => dayOf(clock());
  const expiredMessage = '这份学习记录属于上一课次，已保留为只读。请老师为本班开启新一轮后再学习。';
  const student = id => { const s = db.prepare('SELECT * FROM students WHERE id=?').get(id); return s ? { ...s, manual: !!s.manual } : null; };
  const roundOf = classId => 'r' + db.prepare('SELECT n FROM rounds WHERE classId=?').get(classId).n;
  const roundFor = s => roundOf(s.classId);
  const emptyStage = () => ({ parts: {}, history: [], visits: 0 });
  const initial = (s, round) => ({ student: s, round, records: Object.fromEntries(stages.map(k => [k, emptyStage()])), awards: [], points: 0, updated: null, quizAttempts: [] });

  const examsOf = (s, round) => db.prepare('SELECT json FROM exams WHERE sid=? AND round=? ORDER BY rowid DESC').all(s.id, round).map(row => JSON.parse(row.json));
  const isCurrentExam = e => e.paperVersion === quiz.PAPER_VERSION && e.lessonDay === lessonDay();
  const examClosed = (s, round) => !!db.prepare('SELECT closed FROM exam_controls WHERE classId=? AND round=? AND lessonDay=?').get(s.classId, round, lessonDay())?.closed;
  const publicExam = e => ({ id: e.id, round: e.round, tier: e.tier, bankVersion: e.bankVersion, paperVersion: e.paperVersion, lessonDay: e.lessonDay, counts: { base: quiz.paperConfig.base.count, challenge: quiz.paperConfig.challenge.count }, questions: e.questions.map(quiz.publicQuestion) });
  function newExam(s, round, tier) {
    const e = { id: crypto.randomUUID(), sid: s.id, round, tier, bankVersion: quiz.BANK_VERSION, paperVersion: quiz.PAPER_VERSION, lessonDay: lessonDay(), created: now(), questions: quiz.pickPaper(tier).map(shuffleQuestion), submitted: null };
    db.prepare('INSERT INTO exams VALUES(?,?,?,?)').run(e.id, s.id, round, JSON.stringify(e));
    return e;
  }
  function examStatus(s, round, list = examsOf(s, round)) {
    const current = list.filter(isCurrentExam), baseResults = current.filter(e => e.tier === 'base' && e.submitted).map(e => e.submitted);
    const baseScore = baseResults.length ? Math.max(...baseResults.map(r => r.score)) : null;
    return { open: current.some(e => e.tier === 'base'), closed: examClosed(s, round), baseCompleted: baseResults.length > 0, basePassed: baseScore !== null && baseScore >= quiz.paperConfig.passPercent, rewardUnlocked: baseScore !== null && baseScore >= quiz.paperConfig.passPercent, baseScore, requiredPercent: quiz.paperConfig.passPercent, counts: { base: quiz.paperConfig.base.count, challenge: quiz.paperConfig.challenge.count } };
  }

  function state(s, round = roundFor(s)) {
    const row = db.prepare('SELECT json FROM states WHERE sid=? AND round=?').get(s.id, round);
    const data = row ? JSON.parse(row.json) : initial(s, round);
    data.student = s;
    const uses = Array.isArray(data.magic?.uses) ? data.magic.uses : [];
    data.magic = { limit: 3, used: uses.length, remaining: Math.max(0, 3 - uses.length), uses };
    for (const k of stages) data.records[k] ||= emptyStage();
    const learnedParts = Object.values(data.records).flatMap(st => Object.values(st.parts || {})).filter(part => part.first || part.last);
    if (!data.learningDay && learnedParts.length) {
      const firstTimes = learnedParts.map(part => Date.parse(part.first?.created)).filter(Number.isFinite);
      const fallback = Date.parse(data.updated);
      data.learningDay = firstTimes.length ? dayOf(new Date(Math.min(...firstTimes))) : Number.isFinite(fallback) ? dayOf(new Date(fallback)) : 'unknown';
    }
    data.lessonExpired = !!data.learningDay && data.learningDay !== lessonDay();
    const list = examsOf(s, round);
    // Historical awards never substitute for the latest saved work. Opening is permanent for this lesson.
    if (!data.lessonExpired && !examClosed(s, round) && !list.some(isCurrentExam) && rules.requiredIds.every(k => rules.stageSummary(k, data.records[k], false).pass) && !list.some(e => e.lessonDay && e.lessonDay !== lessonDay())) list.unshift(newExam(s, round, 'base'));
    const open = list.find(e => isCurrentExam(e) && !e.submitted && !e.skipped);
    if (open && !data.lessonExpired && !examClosed(s, round)) data.currentExam = publicExam(open);
    else delete data.currentExam;
    data.examStatus = examStatus(s, round, list);
    if (data.lessonExpired) { data.examStatus.open = false; data.examStatus.rewardUnlocked = false; }
    return data;
  }
  function save(data) {
    data.updated = now();
    const copy = { ...data }; delete copy.currentExam; delete copy.examStatus; delete copy.lessonExpired;
    db.prepare('INSERT INTO states VALUES(?,?,?) ON CONFLICT(sid, round) DO UPDATE SET json=excluded.json').run(data.student.id, data.round, JSON.stringify(copy));
  }
  function cookieSession(req) {
    const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE_STUDENT + '='))?.slice(COOKIE_STUDENT.length + 1);
    if (!token) return null;
    return db.prepare('SELECT * FROM sessions WHERE token=? AND role=? AND expires>?').get(token, 'student', Date.now());
  }
  function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
  function fail(status, message, extra = {}) { throw Object.assign(new Error(message), { status, ...extra }); }
  function teacher(req) {
    if (isTeacherAddress(req.socket.remoteAddress, networkInterfaces(), allow)) return;
    const from = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    console.log(`[教师端拒绝] 来自 ${from} ${req.method} ${req.url}`);
    fail(403, `教师入口仅限教师设备访问（你的地址 ${from} 不在放行范围）`);
  }
  function signedStudent(req) { const session = cookieSession(req); if (!session) fail(401, '请先选择班级与姓名'); const s = student(session.sid); if (!s) fail(401, '学生身份不存在'); return s; }
  function matchIdentity(req, body) {
    const s = signedStudent(req);
    if (body.sid !== s.id) fail(403, '记录身份与当前学生不一致');
    if (body.round !== roundFor(s)) fail(409, '课堂已经开启新轮次，请刷新', { round: roundFor(s) });
    return s;
  }
  function setSession(res, sid) {
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(token, 'student', sid, Date.now() + 7 * 86400000);
    res.setHeader('Set-Cookie', `${COOKIE_STUDENT}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
  }
  async function readBody(req) {
    let size = 0; const parts = [];
    for await (const chunk of req) { size += chunk.length; if (size > 128 * 1024) fail(413, '提交内容过大'); parts.push(chunk); }
    if (!parts.length) return {};
    try { const body = JSON.parse(Buffer.concat(parts).toString()); if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, '提交格式不正确'); return body; }
    catch (e) { if (e.status) throw e; fail(400, '提交格式不正确'); }
  }
  function examFor(s, id) {
    const row = db.prepare('SELECT json FROM exams WHERE id=? AND sid=?').get(String(id), s.id);
    if (!row) fail(404, '考核不存在');
    const e = JSON.parse(row.json);
    if (e.round !== roundFor(s)) fail(409, '本次考核属于旧轮次');
    if (state(s).lessonExpired) fail(409, expiredMessage);
    if (!isCurrentExam(e)) fail(409, '本次考核属于旧课次，请参加本课新检测');
    if (examClosed(s, e.round)) fail(409, '老师已关闭本班检测');
    return e;
  }
  function classPayload(classId, full = false) {
    const round = roundOf(classId);
    const students = db.prepare('SELECT * FROM students WHERE classId=? ORDER BY rowid').all(classId)
      .filter(s => rosterIds.has(s.id) || s.manual)
      .map(s => {
        s.manual = !!s.manual;
        const current = state(s);
        delete current.currentExam;
        for (const k of stages) {
          const st = current.records[k];
          st.summary = rules.stageSummary(k, st, (current.awards || []).some(a => a.stage === k));
          if (!full) {
            // 大屏只需要每个证据点的首答/最终答案与判定；历史只保留时间与对错
            for (const part of Object.values(st.parts || {})) for (const f of ['first', 'last']) if (part[f]) part[f] = { record: part[f].record, assessment: { ok: part[f].assessment.ok, tags: part[f].assessment.tags }, created: part[f].created, hintLevel: part[f].hintLevel, ...(part[f].helpSources ? { helpSources: part[f].helpSources } : {}) };
            st.history = (st.history || []).map(h => ({ part: h.part, created: h.created, ok: !!h.ok }));
          }
        }
        if (!full) current.quizAttempts = (current.quizAttempts || []).map(q => ({ id: q.id, score: q.score, tier: q.tier || 'legacy', paperVersion: q.paperVersion, lessonDay: q.lessonDay, right: q.right, total: q.total, passed: q.passed, baseScore: q.baseScore, byGoal: q.byGoal, byTarget: q.byTarget, created: q.created }));
        current.roundHistory = db.prepare('SELECT round FROM states WHERE sid=? AND round<>?').all(s.id, current.round).map(r => r.round);
        return current;
      });
    return { classId, at: now(), round, lessonDay: lessonDay(), examClosed: examClosed({ classId }, round), students };
  }

  const talismanUses = (data, stage, part) => data.magic.uses.filter(use => use.stage === stage && use.part === part).length;
  function handleTalisman(req, body) {
    const s = matchIdentity(req, body);
    const meta = rules.stageOf(body.stage);
    if (!meta) fail(400, '未知关卡');
    if (!rules.partOf(body.stage, body.part)) fail(400, '未知证据点');
    if (typeof body.eventId !== 'string' || !body.eventId.trim() || body.eventId.length > 120) fail(400, '缺少有效记录标识');
    const draft = body.draft;
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) fail(400, '缺少当前作品');
    if (draft.rows !== undefined && (!Array.isArray(draft.rows) || draft.rows.length > 8)) fail(400, '步骤格式不正确');
    db.exec('BEGIN IMMEDIATE');
    try {
      const data = state(s);
      if (data.lessonExpired) fail(409, expiredMessage);
      const prior = db.prepare('SELECT json FROM talisman_events WHERE id=? AND sid=? AND round=?').get(body.eventId, s.id, data.round);
      if (prior) {
        const use = JSON.parse(prior.json);
        db.exec('COMMIT');
        return { state: data, remaining: data.magic.remaining, action: use.action, use };
      }
      const required = rules.requiredIds;
      const prev = meta.optional ? required[required.length - 1] : required[required.indexOf(body.stage) - 1];
      if (prev && !data.awards.some(a => a.stage === prev)) fail(409, '请先完成上一站');
      const st = data.records[body.stage], current = st.parts?.[body.part];
      const partIndex = meta.parts.findIndex(part => part.id === body.part);
      if (!current?.last?.assessment?.ok && !meta.parts.slice(0, partIndex).every(part => st.parts?.[part.id]?.last?.assessment?.ok)) fail(409, '请先完成本站前一步');
      if (draft.busy || draft.submitting || draft.summary) fail(409, '当前没有可操作的下一步');
      if (!data.magic.remaining) fail(409, '本轮三次通关法宝已用完');
      const verifiedRule = data.records.signin.parts?.rule?.last;
      const ctx = { rule: verifiedRule?.assessment?.ok ? verifiedRule.record : null };
      const action = require('./public/linear-guide.js').nextAction(body.stage, body.part, draft, ctx);
      if (!action?.target?.selector) fail(409, '当前没有可操作的下一步');
      const created = now();
      const use = { eventId: body.eventId, stage: body.stage, part: body.part, created, action };
      data.magic.uses.push(use);
      data.magic.used = data.magic.uses.length;
      data.magic.remaining = Math.max(0, data.magic.limit - data.magic.used);
      data.learningDay ||= lessonDay();
      st.parts ||= {};
      const part = st.parts[body.part] ||= { first: null, last: null, attempts: 0, hintMax: 0 };
      part.talismanUses = talismanUses(data, body.stage, body.part);
      part.hintMax = 3;
      st.summary = rules.stageSummary(body.stage, st, data.awards.some(a => a.stage === body.stage));
      save(data);
      db.prepare('INSERT INTO talisman_events VALUES(?,?,?,?)').run(body.eventId, s.id, data.round, JSON.stringify(use));
      db.exec('COMMIT');
      return { state: data, remaining: data.magic.remaining, action, use };
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  function handleEvent(req, body) {
    const s = matchIdentity(req, body);
    if (!stages.includes(body.stage)) fail(400, '未知关卡');
    const meta = rules.stageOf(body.stage);
    if (!rules.partOf(body.stage, body.part)) fail(400, '未知证据点');
    if (typeof body.eventId !== 'string' || !body.eventId.trim() || body.eventId.length > 120) fail(400, '缺少有效记录标识');
    const r = body.record;
    if (!r || typeof r !== 'object' || Array.isArray(r)) fail(400, '缺少学习记录');
    if (r.rows !== undefined && (!Array.isArray(r.rows) || r.rows.length > 8)) fail(400, '步骤格式不正确');
    const data = state(s);
    if (data.lessonExpired) fail(409, expiredMessage);
    if (db.prepare('SELECT 1 FROM events WHERE id=? AND sid=? AND round=?').get(body.eventId, s.id, data.round)) return data;
    // 解锁：主线按顺序；选做在主线最后一站完成后开放
    const required = rules.requiredIds;
    const prev = meta.optional ? required[required.length - 1] : required[required.indexOf(body.stage) - 1];
    if (prev && !data.awards.some(a => a.stage === prev)) fail(409, '请先完成上一站');
    const assessment = rules.assessPart(body.stage, body.part, r);
    data.learningDay ||= lessonDay();
    const st = data.records[body.stage];
    st.parts ||= {};
    const part = st.parts[body.part] ||= { first: null, last: null, attempts: 0, hintMax: 0 };
    if (!Number.isInteger(part.errorStreak) || part.errorStreak < 0) {
      part.errorStreak = 0;
      // Recover only demonstrable trailing errors, never infer failures from total attempts.
      const history = (st.history || []).filter(h => h.part === body.part);
      for (let i = history.length - 1; i >= 0 && !history[i].ok; i--) part.errorStreak++;
      if (!history.length && part.last?.assessment?.ok === false) part.errorStreak = 1;
    }
    const magicHelp = talismanUses(data, body.stage, body.part);
    const hintLevel = Math.max(magicHelp ? 3 : 0, Math.min(3, part.errorStreak), Math.max(0, Math.min(3, Number(body.hintLevel) || 0)));
    const created = now();
    const entry = { record: r, assessment, hintLevel, created, eventId: body.eventId, ...(magicHelp ? { helpSources: ['talisman'] } : {}) };
    if (magicHelp) part.talismanUses = magicHelp;
    part.errorStreak = assessment.ok ? 0 : part.errorStreak + 1;
    if (!part.first) part.first = entry; // 首答：该证据点第一次提交，永不覆盖
    part.last = entry;                    // 最终：最近一次提交
    part.attempts = Math.max(0, Number(part.attempts) || 0) + 1;
    part.hintMax = Math.max(part.hintMax || 0, hintLevel, Math.min(3, part.errorStreak));
    if (assessment.ok && !part.okAt) part.okAt = created;
    st.history ||= [];
    st.history.push({ part: body.part, created, ok: assessment.ok, tags: assessment.tags });
    if (st.history.length > 80) st.history = st.history.slice(-80);
    const summary = rules.stageSummary(body.stage, st, false);
    // 通关 = ≥2 星；积分每站只记一次（重玩不扣、不重复加）
    if (summary.cleared && !data.awards.some(a => a.stage === body.stage)) {
      data.awards.push({ stage: body.stage, points: pointsOf(body.stage), created, eventId: body.eventId, stars: summary.stars });
      data.points = data.awards.reduce((n, a) => n + a.points, 0);
    }
    for (const k of stages) data.records[k].summary = rules.stageSummary(k, data.records[k], data.awards.some(a => a.stage === k));
    db.exec('BEGIN IMMEDIATE');
    try { save(data); db.prepare('INSERT INTO events VALUES(?,?,?)').run(body.eventId, s.id, data.round); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
    return { ...state(s), lastAssessment: assessment };
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'self'");
    try {
      const url = new URL(req.url, 'http://localhost'); const p = url.pathname;
      if (!['GET', 'POST', 'HEAD'].includes(req.method)) fail(405, '不支持的请求方法');
      if (req.method === 'POST' && req.headers.origin) { let same = false; try { same = new URL(req.headers.origin).host === req.headers.host; } catch {} if (!same) fail(403, '不接受来自其他页面的提交'); }
      const body = req.method === 'POST' ? await readBody(req) : {};
      if (p === '/api/classes' && req.method === 'GET') return json(res, 200, { classes: CLASSES });
      if (p === '/api/roster' && req.method === 'GET') {
        const c = url.searchParams.get('class'); if (!CLASSES.includes(c)) fail(400, '请选择五年级班级');
        return json(res, 200, db.prepare('SELECT id,name,manual FROM students WHERE classId=? ORDER BY rowid').all(c).filter(s => rosterIds.has(s.id) || s.manual).map(s => ({ ...s, manual: !!s.manual })));
      }
      if (p === '/api/login' && req.method === 'POST') {
        const classId = String(body.classId || ''); if (!CLASSES.includes(classId)) fail(400, '请选择五年级班级');
        let s;
        if (body.id) { s = student(String(body.id)); if (!s || s.classId !== classId) fail(400, '姓名不属于所选班级'); }
        else {
          if (typeof body.name !== 'string') fail(400, '请输入姓名文字');
          const name = body.name.trim(); if (!name || name.length > 30) fail(400, '请输入有效姓名，最多30个字符');
          const matches = db.prepare('SELECT * FROM students WHERE classId=? AND name=?').all(classId, name);
          if (matches.length) fail(409, '已有同名记录，请确认并选择已有身份', { choices: matches.map(m => ({ id: m.id, name: m.name, manual: !!m.manual })) });
          s = { id: 'manual-' + crypto.randomUUID(), classId, name, manual: true };
          db.prepare('INSERT INTO students VALUES(?,?,?,1)').run(s.id, classId, name);
        }
        const data = state(s); if (!data.updated && !data.lessonExpired) save(data); setSession(res, s.id); return json(res, 200, state(s));
      }
      if (p === '/api/me' && req.method === 'GET') return json(res, 200, state(signedStudent(req)));
      if (p === '/api/logout' && req.method === 'POST') {
        const session = cookieSession(req); if (session) db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);
        res.setHeader('Set-Cookie', `${COOKIE_STUDENT}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`); return json(res, 200, { ok: true });
      }
      if (p === '/api/visit' && req.method === 'POST') {
        const s = matchIdentity(req, body);
        if (!stages.includes(body.stage)) fail(400, '未知关卡');
        const data = state(s);
        if (data.lessonExpired) fail(409, expiredMessage);
        const st = data.records[body.stage] ||= emptyStage();
        st.visits = Math.max(0, Number(st.visits) || 0) + 1;
        for (const k of stages) data.records[k].summary = rules.stageSummary(k, data.records[k], data.awards.some(a => a.stage === k));
        save(data);
        return json(res, 200, data);
      }
      if (p === '/api/stage/reset' && req.method === 'POST') {
        // 学生重开本站：清空本站作答与星级，收回该站积分，可重新争取星星
        const s = matchIdentity(req, body);
        if (!stages.includes(body.stage)) fail(400, '未知关卡');
        const data = state(s);
        data.records[body.stage] = emptyStage();
        data.awards = (data.awards || []).filter(a => a.stage !== body.stage);
        data.points = data.awards.reduce((n, a) => n + (Number(a.points) || 0), 0);
        for (const k of stages) data.records[k].summary = rules.stageSummary(k, data.records[k], data.awards.some(a => a.stage === k));
        db.exec('BEGIN IMMEDIATE');
        try { save(data); db.exec('COMMIT'); }
        catch (e) { db.exec('ROLLBACK'); throw e; }
        return json(res, 200, data);
      }
      if (p === '/api/event' && req.method === 'POST') return json(res, 200, handleEvent(req, body));
      if (p === '/api/talisman/use' && req.method === 'POST') return json(res, 200, handleTalisman(req, body));
      if (p === '/api/reward/status' && req.method === 'GET') {
        const s = signedStudent(req), status = state(s).examStatus;
        return json(res, 200, { ...status, unlocked: status.rewardUnlocked });
      }
      if (p === '/api/exam/skip' && req.method === 'POST') {
        const s = matchIdentity(req, body), e = examFor(s, body.examId);
        if (e.tier !== 'challenge') fail(409, '基础检测需要提交，只有选做挑战可以跳过');
        if (e.submitted) fail(409, '这份挑战已经提交');
        if (!e.skipped) {
          e.skipped = now();
          db.prepare('UPDATE exams SET json=? WHERE id=?').run(JSON.stringify(e), e.id);
        }
        return json(res, 200, { ok: true, id: e.id, skipped: true });
      }
      if (p === '/api/exam/create' && req.method === 'POST') {
        const s = matchIdentity(req, body), data = state(s), tier = body.tier || 'base';
        if (data.lessonExpired) fail(409, expiredMessage);
        if (!['base', 'challenge'].includes(tier)) fail(400, '请选择基础或挑战检测');
        if (data.examStatus.closed) fail(409, '老师已关闭本班检测');
        const list = examsOf(s, data.round), current = list.filter(isCurrentExam);
        if (list.some(e => e.lessonDay && e.lessonDay !== lessonDay())) fail(409, '课次已变化，请老师开启新轮次后参加检测');
        if (!current.length && !rules.requiredIds.every(k => rules.stageSummary(k, data.records[k], false).pass)) fail(409, '完成本课四个必做站后自动开启基础检测');
        if (tier === 'challenge' && !data.examStatus.baseCompleted) fail(409, '提交基础检测后可以选择挑战');
        const open = current.find(e => !e.submitted && !e.skipped);
        if (open) {
          if (open.tier !== tier) fail(409, '请先完成已经开始的检测');
          return json(res, 200, publicExam(open));
        }
        return json(res, 200, publicExam(newExam(s, data.round, tier)));
      }
      if (p === '/api/exam/submit' && req.method === 'POST') {
        const s = matchIdentity(req, body), e = examFor(s, body.examId);
        if (e.skipped) fail(409, '这份挑战已经跳过，请重新开始挑战');
        if (e.submitted) return json(res, 200, e.submitted);
        const answers = body.answers;
        if (!answers || typeof answers !== 'object' || Array.isArray(answers)) fail(400, '请提交有效的作答记录');
        const feedback = e.questions.map(q => ({ ...q, correct: quiz.gradeAnswer(q, answers[q.id]), chosen: answers[q.id] ?? null, unanswered: answers[q.id] == null }));
        const byGoal = {}, byTarget = {};
        for (const q of feedback) {
          byGoal[q.goal] ||= { right: 0, total: 0 }; byGoal[q.goal].total++; if (q.correct) byGoal[q.goal].right++;
          byTarget[q.target] ||= { right: 0, total: 0 }; byTarget[q.target].total++; if (q.correct) byTarget[q.target].right++;
        }
        const right = feedback.filter(q => q.correct).length, total = feedback.length, score = total ? right / total * 100 : 0;
        const prior = examStatus(s, e.round);
        const baseScore = e.tier === 'base' ? Math.max(prior.baseScore ?? 0, score) : prior.baseScore;
        const result = { id: e.id, tier: e.tier, bankVersion: e.bankVersion, paperVersion: e.paperVersion, lessonDay: e.lessonDay, score, right, total, passed: e.tier === 'base' ? score >= quiz.paperConfig.passPercent : null, baseScore, rewardUnlocked: baseScore !== null && baseScore >= quiz.paperConfig.passPercent, byGoal, byTarget, feedback, created: now() };
        e.submitted = result;
        const data = state(s); data.quizAttempts ||= []; data.quizAttempts.push(result); delete data.currentExam;
        db.exec('BEGIN IMMEDIATE');
        try { db.prepare('UPDATE exams SET json=? WHERE id=?').run(JSON.stringify(e), e.id); save(data); db.exec('COMMIT'); }
        catch (error) { db.exec('ROLLBACK'); throw error; }
        return json(res, 200, result);
      }
      if (p.startsWith('/api/teacher/')) {
        teacher(req);
        if (p === '/api/teacher/class' && req.method === 'GET') {
          const classId = url.searchParams.get('class'); if (!CLASSES.includes(classId)) fail(400, '请选择五年级班级');
          return json(res, 200, classPayload(classId, url.searchParams.get('full') === '1'));
        }
        if (p === '/api/teacher/answers' && req.method === 'GET') return json(res, 200, { questions: quiz.questions, goals: quiz.groups, codes: quiz.codes, config: quiz.paperConfig, bankVersion: quiz.BANK_VERSION, paperVersion: quiz.PAPER_VERSION });
        if (p === '/api/teacher/exam-close' && req.method === 'POST') {
          if (!CLASSES.includes(body.classId) || typeof body.closed !== 'boolean') fail(400, '请选择班级与检测开关');
          const round = roundOf(body.classId);
          db.prepare('INSERT INTO exam_controls VALUES(?,?,?,?) ON CONFLICT(classId,round,lessonDay) DO UPDATE SET closed=excluded.closed').run(body.classId, round, lessonDay(), body.closed ? 1 : 0);
          return json(res, 200, { ok: true, classId: body.classId, round, closed: body.closed, lessonDay: lessonDay() });
        }
        if (p === '/api/teacher/new-round' && req.method === 'POST') {
          if (!CLASSES.includes(body.classId)) fail(400, '请选择五年级班级');
          db.prepare('UPDATE rounds SET n=n+1 WHERE classId=?').run(body.classId);
          return json(res, 200, { ok: true, classId: body.classId, round: roundOf(body.classId) });
        }
      }
      if (p.startsWith('/api/')) fail(404, '接口不存在');
      if (['/test', '/teacher', '/demo'].includes(p)) {
        teacher(req);
        if (p === '/teacher') console.log(`[教师端] ${String(req.socket.remoteAddress || '').replace(/^::ffff:/, '')} 打开了教师大屏`);
      }
      const aliases = { '/': 'index.html', '/teacher': 'teacher.html', '/test': 'index.html', '/demo': 'index.html' };
      let relative = aliases[p];
      if (!relative) {
        let decoded; try { decoded = decodeURIComponent(p); } catch { fail(400, '地址格式不正确'); }
        if (decoded.includes('..') || decoded.includes('\\') || decoded.includes('\0')) fail(404, '文件不存在');
        relative = decoded.replace(/^\/+/, '');
      }
      const publicRoot = path.join(BASE, 'public'), file = path.resolve(publicRoot, relative);
      if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) fail(404, '文件不存在');
      if (!fs.realpathSync(file).startsWith(fs.realpathSync(publicRoot) + path.sep)) fail(404, '文件不存在');
      if (['teacher.html', 'teacher.mjs', 'demo-class.json'].includes(path.basename(file))) teacher(req);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ['.html', '.js', '.mjs', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      json(res, e.status || 500, { error: e.status ? e.message : '服务暂时无法保存，请稍后重试', ...(e.choices ? { choices: e.choices } : {}), ...(e.round ? { round: e.round } : {}) });
      if (!e.status) console.error('课堂服务错误:', e.message);
    }
  });
  return { server, close: () => db.close(), runtimeDir };
}

function lanAddresses() {
  // 代理/虚拟网卡（Clash、VPN、虚拟机）不是学生能访问的地址，必须排除
  const skipName = /^(docker|br-|veth|utun|awdl|llw|bridge|vmnet|lo|clash|tun|tap|wg|tailscale|zerotier|vethernet)/i;
  const skipIp = ip => /^(198\.1[89]\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/.test(ip);
  const rank = ip => (ip.startsWith('10.') ? 0 : /^192\.168\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  const out = [];
  for (const [name, nets] of Object.entries(os.networkInterfaces())) {
    if (skipName.test(name)) continue;
    for (const net of nets || []) {
      if (net.family !== 'IPv4' || net.internal || skipIp(net.address)) continue;
      out.push(net.address);
    }
  }
  return out.sort((a, b) => rank(a) - rank(b));
}

if (require.main === module) {
  const service = createService();
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const allowList = parseAllowList(process.env.TEACHER_ALLOW);
  service.server.listen(port, '0.0.0.0', () => {
    const ipOf = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
    console.log(`教师端放行范围：${allowList.length ? allowList.map(a => `${ipOf(a.base)}/${a.prefix}`).join('、') : '仅本机'}`);
    console.log(`教师本机入口：http://localhost:${port}/teacher（免密码，限教师设备访问）`);
    for (const ip of lanAddresses()) console.log(`学生局域网入口：http://${ip}:${port}`);
    console.log('课堂数据保存在 runtime/classroom.sqlite；关闭此窗口即停止服务。');
  });
  const shutdown = () => service.server.close(() => { service.close(); process.exit(0); });
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
module.exports = { createService, CLASSES, DEFAULT_PORT };
