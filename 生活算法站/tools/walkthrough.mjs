/* 浏览器走查 + 关键界面截图（虚构姓名，独立临时数据库，不碰真实课堂数据）。
 * 运行：NODE_PATH=<playwright-core 所在 node_modules> node tools/walkthrough.mjs [截图目录] */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const { createService } = require('../server.cjs');
const R = require('../public/rules.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shotDir = process.argv[2] || path.join(__dirname, '../../截图');
fs.mkdirSync(shotDir, { recursive: true });
for (const f of fs.readdirSync(shotDir)) if (f.endsWith('.png')) fs.unlinkSync(path.join(shotDir, f));

const names = ['走查同学甲', '走查同学乙', '走查同学丙', '走查同学丁', '走查同学戊', '走查同学己', '走查同学庚'];
const roster = names.map((n, i) => ({ id: 'walk-501-' + i, classId: '501', name: n }));
const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5l5-walk-'));
const service = createService({ runtimeDir, roster, networkInterfaces: () => ({ lo: [{ address: '127.0.0.1', family: 'IPv4' }] }) });
await new Promise(r => service.server.listen(0, '127.0.0.1', r));
const port = service.server.address().port;
const base = `http://127.0.0.1:${port}`;

/* ---- 用接口为其他虚构学生造一些课堂证据，让大屏有图 ---- */
async function post(p, body, cookie) {
  const res = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  return { json: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
const T = [{ verb: 'input', obj: 'F' }, { verb: 'calc', obj: 'C', method: 'ok' }, { verb: 'output', obj: 'C' }];
const S = [{ verb: 'input', obj: 'n' }, { verb: 'calc', obj: 'm', method: 'ok' }, { verb: 'calc', obj: 's', method: 'ok' }, { verb: 'output', obj: 'ms' }];
const G = [{ verb: 'input', obj: 'k' }, { verb: 'calc', obj: 'p', method: 'mine' }, { verb: 'output', obj: 'p' }];
const rule = { a: 3, sign: '-', b: 2 };
async function seed(i, depth, mistakes) {
  const login = await post('/api/login', { classId: '501', id: 'walk-501-' + i });
  const ck = login.cookie, sid = login.json.student.id, round = login.json.round;
  let n = 0;
  const ev = (stage, part, record, h = 0) => post('/api/event', { sid, round, stage, part, record, hintLevel: h, eventId: `seed-${i}-${n++}` }, ck);
  if (mistakes) await ev('temp', 'chain', { ask: 'C', known: 'F', how: 'formula', slots: { in: 'ask', proc: 'how', out: 'known' } });
  await ev('temp', 'chain', { ask: 'C', known: 'F', how: 'formula', slots: { in: 'known', proc: 'how', out: 'ask' } });
  await ev('temp', 'order', { ops: ['sub32', 'mul5', 'div9'], reason: 'order', tries: mistakes ? [['mul5', 'div9', 'sub32'], ['sub32', 'mul5', 'div9']] : [['sub32', 'mul5', 'div9']] });
  if (mistakes) await ev('temp', 'steps', { rows: [T[0], { verb: 'output', obj: 'ANS' }] }, 1);
  if (depth < 2) { if (mistakes > 1) await ev('temp', 'steps', { rows: [T[0], { verb: 'calc', obj: 'C', method: 'none' }, T[2]] }, 2); return; }
  await ev('temp', 'steps', { rows: T });
  await ev('flow', 'paper', { done: true, checks: ['terminal', 'io', 'process', 'line'] });
  if (mistakes) await ev('flow', 'fix', { marks: { b1: 'none', b2: 'order', b3: 'order', b4: 'missing' } });
  await ev('flow', 'fix', { marks: { b0: 'none', b1: 'shape', b2: 'order', b3: 'order', b4: 'missing' } });
  if (depth < 3) return;
  await ev('seeds', 'chain', { ask: ['m10', 'sum'], known: 'n-rule', how: mistakes ? 's-then-m' : 'm-then-s' });
  if (mistakes) await ev('seeds', 'chain', { ask: ['m10', 'sum'], known: 'n-rule', how: 'm-then-s' });
  if (mistakes) await ev('seeds', 'steps', { rows: [S[0], S[2], S[1], S[3]], hand: { m: 21, s: 120 } });
  await ev('seeds', 'steps', { rows: S, hand: { m: 21, s: 120 } });
  await ev('seeds', 'flow', { shapes: Object.fromEntries(R.seedFlowBoxes.map(b => [b.id, b.shape])) });
  if (depth < 4) return;
  if (mistakes) await ev('signin', 'rule', { a: 1, sign: '+', b: 0 });
  await ev('signin', 'rule', rule);
  await ev('signin', 'steps', { rows: G, rule, hand: { p: 43 } });
  await ev('signin', 'reflect', { was: mistakes ? 'answer' : 'order', now: mistakes ? 'method' : 'clear' });
  const ex = await post('/api/exam/create', { sid, round }, ck);
  const bank = (await (await fetch(base + '/api/teacher/answers')).json()).questions;
  const answers = {};
  ex.json.questions.forEach((q, k) => { const full = bank.find(x => x.id === q.id); const right = q.options.indexOf(full.options[full.answer]); answers[q.id] = (mistakes && k % 4 === 0) ? (right + 1) % q.options.length : right; });
  await post('/api/exam/submit', { sid, round, examId: ex.json.id, answers }, ck);
}
await seed(1, 4, 1); await seed(2, 4, 0); await seed(3, 3, 1); await seed(4, 2, 0); await seed(5, 1, 2);

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
await page.emulateMedia({ reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const shots = [];
async function shot(name) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(shotDir, name + '.png') }); shots.push(name); console.log('shot', name); }
const click = async sel => { const l = page.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await l.click(); };
async function compose(rows) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    await click(`.step-row[data-i="${i}"] .v[data-v="${r.verb}"]`);
    if (r.obj) await click(`.step-row[data-i="${i}"] .o[data-v="${r.obj}"]`);
    if (r.method) await click(`.step-row[data-i="${i}"] .m[data-v="${r.method}"]`);
  }
}
const run = async () => { await click('#run'); await page.waitForSelector('#fb.ok, #fb.bad'); };
const next = async () => { await click('#next'); };

await page.goto(base + '/');
await page.waitForSelector('.tile');
await click('.tile[data-class="501"]');
await page.waitForSelector('.name-chip');
await click('.name-chip[data-id="walk-501-0"]');
await shot('01-登录-大问题');
await click('#login-submit');
await page.waitForSelector('.rpg-canvas');
await page.waitForTimeout(400);
await shot('02-地图-主线4站与选做');

// 气象角
await page.evaluate(id => window.__enterPlace(id), "temp");
await page.waitForSelector('#qAsk');
await click('#qAsk .chip[data-v="C"]'); await click('#qKnown .chip[data-v="F"]'); await click('#qHow .chip[data-v="formula"]');
await click('#sIn .chip[data-v="known"]'); await click('#sProc .chip[data-v="how"]'); await click('#sOut .chip[data-v="ask"]');
await click('#check'); await page.waitForSelector('#fb.ok');
await shot('03-气象角-问题三问与IPO-亮一个要点');
await next();
await click('#opsPool .op[data-k="mul5"]'); await click('#opsPool .op[data-k="div9"]'); await click('#opsPool .op[data-k="sub32"]');
await click('#calc');
await shot('04-气象角-计算顺序-先乘除得负4度');
await click('#opsClear'); await click('#opsPool .op[data-k="sub32"]'); await click('#opsPool .op[data-k="mul5"]'); await click('#opsPool .op[data-k="div9"]');
await click('#calc'); await click('#why .chip[data-v="order"]'); await click('#check'); await page.waitForSelector('#fb.ok');
await next();
await compose([{ verb: 'input', obj: 'F' }, { verb: 'output', obj: 'ANS' }]);
await click('.step-row[data-i="2"] .del');
await run();
await shot('05-写步骤-写死答案被同桌换数暴露');
await click('.step-row[data-i="1"] .v[data-v="calc"]'); await click('.step-row[data-i="1"] .o[data-v="C"]'); await click('.step-row[data-i="1"] .m[data-v="ok"]');
await click('#addRow'); await click('.step-row[data-i="2"] .v[data-v="output"]'); await click('.step-row[data-i="2"] .o[data-v="C"]');
await run();
await shot('06-写步骤-同桌两次都算对-要点');
await next();
await page.waitForSelector('.summary-card');
await shot('07-本站收获');
await click('#backMap');

// 黑板流程图
await page.evaluate(id => window.__enterPlace(id), "flow");
await page.waitForSelector('#checks');
for (const v of ['terminal', 'io', 'process', 'line']) await click(`#checks .chip[data-v="${v}"]`);
await click('#check'); await page.waitForSelector('#fb.ok'); await next();
await click('.fbox[data-id="b1"]'); await click('.fault-pick .chip[data-k="shape"]');
await click('.fbox[data-id="b2"]'); await click('.fault-pick .chip[data-k="order"]');
await shot('08-流程图-帮同学找错');
await click('.fbox[data-id="b3"]'); await click('.fault-pick .chip[data-k="order"]');
await click('.fbox[data-id="b4"]'); await click('.fault-pick .chip[data-k="missing"]');
await click('.fbox[data-id="b0"]'); await click('.fault-pick .chip[data-k="none"]');
await click('#check'); await page.waitForSelector('#fb.ok');
await shot('09-流程图-改正后对照');
await next(); await click('#backMap');

// 种子
await page.evaluate(id => window.__enterPlace(id), "seeds");
await page.waitForSelector('#qAsk');
await click('#qAsk .chip[data-v="m10"]'); await click('#qAsk .chip[data-v="sum"]'); await click('#qKnown .chip[data-v="n-rule"]'); await click('#qHow .chip[data-v="m-then-s"]');
await click('#check'); await page.waitForSelector('#fb.ok'); await next();
await compose([S[0], S[2], S[1], S[3]]);
await page.fill('#hand input[data-k="m"]', '21'); await page.fill('#hand input[data-k="s"]', '120');
await run();
await shot('10-种子-先算s再算m-同桌卡住');
await click('.step-row[data-i="1"] .o[data-v="m"]'); await click('.step-row[data-i="1"] .m[data-v="ok"]');
await click('.step-row[data-i="2"] .o[data-v="s"]'); await click('.step-row[data-i="2"] .m[data-v="ok"]');
await run(); await page.waitForSelector('#fb.ok'); await next();
for (const b of R.seedFlowBoxes) await click(`.sp[data-id="${b.id}"][data-s="${b.shape}"]`);
await shot('11-种子-把步骤画成流程图');
await click('#check'); await page.waitForSelector('#fb.ok'); await next(); await click('#backMap');

// 签到（迁移）
await page.evaluate(id => window.__enterPlace(id), "signin");
await page.waitForSelector('.stepper');
await click('.stepper .mini-btn[data-k="a"][data-d="1"]'); await click('#check'); await page.waitForSelector('#fb.bad');
await shot('12-签到-举例验证不吻合');
await click('.stepper .mini-btn[data-k="a"][data-d="1"]'); await click('#sign');
await click('.stepper .mini-btn[data-k="b"][data-d="1"]'); await click('.stepper .mini-btn[data-k="b"][data-d="1"]');
await click('#check'); await page.waitForSelector('#fb.ok'); await next();
await compose(G);
await page.fill('#hand input[data-k="p"]', '43');
await run();
await shot('13-签到-独立写方法卡-同桌验证');
await next();
await click('#was .chip[data-v="answer"]'); await click('#now .chip[data-v="method"]');
await shot('14-出门条');
await click('#check'); await page.waitForSelector('#fb.ok'); await next(); await click('#backMap');

// 检测
await page.evaluate(id => window.__enterPlace(id), "quiz");
await page.waitForSelector('.q-item');
await shot('15-检测-每题标注目标');
const items = await page.locator('.q-item').count();
for (let i = 0; i < items; i++) await page.locator('.q-item').nth(i).locator('.opt').first().click();
await click('#submitQuiz');
await page.waitForSelector('.target-bars');
await shot('16-检测结果-按目标与错题解析');

// 教师测试模式
await page.goto(base + '/test');
await page.waitForSelector('.rpg-canvas');
await page.evaluate(id => window.__enterPlace(id), "seeds"); await page.waitForSelector('#qAsk'); await click('#test-answer');
await shot('17-教师测试-参考答案');

// 教师大屏
await page.setViewportSize({ width: 1920, height: 1080 });
await page.goto(base + '/teacher');
await page.waitForSelector('.kpi');
await page.waitForTimeout(500);
await shot('18-教师大屏-图表');
await page.screenshot({ path: path.join(shotDir, '19-教师大屏-整页含学生明细.png'), fullPage: true }); shots.push('19-教师大屏-整页含学生明细');

await browser.close();
await new Promise(r => service.server.close(r));
service.close();
fs.rmSync(runtimeDir, { recursive: true, force: true });
fs.writeFileSync(path.join(shotDir, '走查结果.txt'), `截图 ${shots.length} 张（虚构姓名“走查同学甲…庚”，临时数据库）\n${shots.join('\n')}\n页面错误：${errors.length ? errors.join(' | ') : '无'}\n${new Date().toString()}\n`, 'utf8');
console.log('done', shots.length, 'errors', errors);
