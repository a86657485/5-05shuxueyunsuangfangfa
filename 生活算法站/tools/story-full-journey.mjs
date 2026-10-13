/* Complete four-station browser journey. Uses /test and an isolated temporary service/database.
 * Run with bundled Node; optional first argument is the screenshot/report directory. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = createRequire('/Users/jun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.story-require.cjs')('playwright-core');
const { createService } = require('../server.cjs');
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.resolve(process.argv[2] || path.join(projectDir, 'runtime/story-verification'));
const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5l5-full-story-'));
const roster = [{ id: 'full-story-501-0', classId: '501', name: '虚构旅程同学' }];
const checks = [], stages = [], errors = [], shots = [];
let service, browser, page, quiz = null;
fs.mkdirSync(outputDir, { recursive: true });
const record = (id, pass, counts = {}) => { const check = { id, pass: !!pass, ...counts }; checks.push(check); console.log(JSON.stringify(check)); };
try {
  service = createService({ runtimeDir, roster, networkInterfaces: () => ({ lo: [{ address: '127.0.0.1', family: 'IPv4' }] }) });
  await new Promise((resolve, reject) => { service.server.once('error', reject); service.server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${service.server.address().port}`;
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.name));
  const click = async selector => { const element = page.locator(selector).first(); await element.scrollIntoViewIfNeeded(); await element.click(); };
  const closeStory = async () => { await click('.story-continue'); await page.waitForFunction(() => !document.body.classList.contains('story-open')); };
  const enter = async id => {
    await page.evaluate(stage => { void window.__enterPlace(stage); }, id);
    await page.locator('#story-dialog').waitFor({ state: 'visible' }); await closeStory();
  };
  const chip = (id, value) => click(`#${id} .chip[data-v="${value}"]`);
  const checked = async id => { await click('#check'); await page.waitForSelector('#fb.ok'); record(id, true); };
  const next = () => click('#next');
  const compose = async rows => {
    for (const [index, row] of rows.entries()) for (const [key, value] of Object.entries(row)) {
      await click(`.step-row[data-i="${index}"] .${{ verb: 'v', obj: 'o', method: 'm' }[key]}[data-v="${value}"]`);
    }
  };
  const run = async id => { await click('#run'); await page.waitForSelector('#fb.ok'); record(id, true); await next(); };
  const screenshot = async name => { const file = path.join(outputDir, name); await page.screenshot({ path: file, fullPage: true }); shots.push(file); };
  const stageSummary = async (id, index) => {
    await page.waitForSelector('.summary-card');
    const counts = await page.evaluate(() => ({
      stars: Number(document.querySelector('.star-burst').getAttribute('aria-label').match(/\d+/)?.[0]),
      points: Number(document.querySelector('#points').textContent.match(/\d+/)?.[0]),
      cleared: document.querySelector('.summary-card h2').textContent.endsWith('· 通关'),
      done: document.querySelectorAll('#hud-progress li.done').length,
      outcome: !!document.querySelector('#story-outcome')
    }));
    stages.push({ id, ...counts }); record(`${id}-actually-cleared`, counts.cleared && counts.stars >= 2 && counts.points === index * 10 && counts.done === index && counts.outcome, counts);
  };

  await page.goto(base + '/test'); await page.locator('#story-dialog').waitFor({ state: 'visible' }); await closeStory();
  await enter('temp');
  await chip('qAsk', 'C'); await chip('qKnown', 'F'); await chip('qHow', 'formula');
  await chip('sIn', 'known'); await chip('sProc', 'how'); await chip('sOut', 'ask'); await checked('temp-chain-ui-correct'); await next();
  for (const op of ['sub32', 'mul5', 'div9']) await click(`#opsPool .op[data-k="${op}"]`);
  await click('#calc'); await chip('why', 'order'); await checked('temp-order-ui-correct'); await next();
  await compose([{ verb: 'input', obj: 'F' }, { verb: 'calc', obj: 'C', method: 'ok' }, { verb: 'output', obj: 'C' }]);
  await run('temp-method-ui-correct'); await stageSummary('temp', 1); await click('#backMap');

  await enter('flow');
  for (const value of ['terminal', 'io', 'process', 'line']) await chip('checks', value);
  await checked('flow-self-check-ui-submitted'); await next();
  for (const [id, fault] of [['b1', 'shape'], ['b2', 'order'], ['b3', 'order'], ['b4', 'missing'], ['b0', 'none']]) {
    await click(`.fbox[data-id="${id}"]`); await click(`.fault-pick .chip[data-k="${fault}"]`);
  }
  await checked('flow-corrections-ui-correct'); await next(); await stageSummary('flow', 2); await click('#backMap');

  await enter('seeds');
  await chip('qAsk', 'm10'); await chip('qAsk', 'sum'); await chip('qKnown', 'n-rule'); await chip('qHow', 'm-then-s');
  await checked('seeds-analysis-ui-correct'); await next();
  await compose([{ verb: 'input', obj: 'n' }, { verb: 'calc', obj: 'm', method: 'ok' }, { verb: 'calc', obj: 's', method: 'ok' }, { verb: 'output', obj: 'ms' }]);
  await page.fill('#hand input[data-k="m"]', '21'); await page.fill('#hand input[data-k="s"]', '120'); await run('seeds-method-ui-correct');
  for (const [id, shape] of [['f0', 'terminal'], ['f1', 'io'], ['f2', 'process'], ['f3', 'process'], ['f4', 'io'], ['f5', 'terminal']]) {
    await click(`.sp[data-id="${id}"][data-s="${shape}"]`);
  }
  await checked('seeds-flowchart-ui-correct'); await next(); await stageSummary('seeds', 3); await click('#backMap');

  await enter('signin');
  for (let i = 0; i < 2; i++) await click('.stepper .mini-btn[data-k="a"][data-d="1"]');
  await click('#sign'); for (let i = 0; i < 2; i++) await click('.stepper .mini-btn[data-k="b"][data-d="1"]');
  await checked('signin-rule-ui-correct'); await next();
  await compose([{ verb: 'input', obj: 'k' }, { verb: 'calc', obj: 'p', method: 'mine' }, { verb: 'output', obj: 'p' }]);
  await page.fill('#hand input[data-k="p"]', '43'); await run('signin-method-ui-correct');
  await chip('was', 'answer'); await chip('now', 'method'); await checked('signin-reflection-ui-submitted'); await next();
  await page.locator('#story-dialog').waitFor({ state: 'visible' });
  const finalText = await page.locator('#story-dialog').innerText();
  record('final-dialog-auto-opens-after-four-clears', finalText.includes('校园体验指南，准备就绪') && /温度资料、活动流程、材料安排和阅读规则/.test(finalText));
  await page.locator('#story-dialog img').evaluate(image => image.decode()); await screenshot('06-full-complete.png');
  await closeStory(); await stageSummary('signin', 4);
  record('final-outcome-guide-complete', /校园体验指南已经齐了/.test(await page.locator('#story-outcome').innerText()));
  await click('#backMap'); await page.waitForSelector('.rpg-canvas');
  record('all-four-cleared-return-to-map', await page.locator('#map').isVisible() && await page.locator('#hud-progress li.done').count() === 4);

  await enter('quiz'); await page.waitForSelector('.q-item');
  const questionCount = await page.locator('.q-item').count(); record('quiz-renders-twenty-items', questionCount === 20, { questionCount });
  record('quiz-does-not-expose-feedback-before-submit', await page.locator('.wrong-item, .explain, .target-bars').count() === 0);
  for (let index = 0; index < questionCount; index++) await page.locator('.q-item').nth(index).locator('.opt').last().click();
  record('all-twenty-have-student-selections', await page.locator('.q-item .opt[aria-pressed="true"]').count() === 20);
  await click('#submitQuiz'); await page.waitForSelector('.target-bars');
  quiz = await page.evaluate(() => {
    const score = Number(document.querySelector('#quiz-page h2').textContent.match(/\d+/)?.[0]);
    const targetCounts = [...document.querySelectorAll('.target-bars .tb b')].map(element => element.textContent.split('/').map(Number));
    return { score, targetCount: targetCounts.length, perTarget: targetCounts.map(([right, total]) => ({ right, total })), right: targetCounts.reduce((sum, counts) => sum + counts[0], 0), total: targetCounts.reduce((sum, counts) => sum + counts[1], 0), wrong: document.querySelectorAll('.wrong-item').length, explained: document.querySelectorAll('.wrong-item .explain').length };
  });
  record('twenty-result-counts-and-score-agree', quiz.total === 20 && quiz.targetCount === 4 && quiz.perTarget.every(target => target.total === 5) && quiz.right + quiz.wrong === 20 && quiz.score === quiz.right * 5 && quiz.explained === quiz.wrong, quiz);
  record('wrong-answer-feedback-actually-rendered', quiz.wrong > 0 && quiz.explained === quiz.wrong, { wrong: quiz.wrong, explained: quiz.explained });
  await page.locator('#quiz-page').evaluate(element => { element.scrollTop = 0; });
  await screenshot('07-full-quiz-result.png');
  record('quiz-result-return-and-retake-available', await page.locator('#backMapR').isEnabled() && await page.locator('#retake').isEnabled());
  await click('#backMapR'); await page.waitForSelector('.rpg-canvas'); record('quiz-result-returns-to-map', await page.locator('#map').isVisible());

  const early = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  early.on('pageerror', error => errors.push(error.name));
  await early.goto(base + '/test'); await early.locator('#story-dialog').waitFor({ state: 'visible' }); await early.locator('.story-continue').click();
  await early.waitForFunction(() => !document.body.classList.contains('story-open'));
  await early.evaluate(() => { void window.__enterPlace('quiz'); }); await early.locator('#story-dialog').waitFor({ state: 'visible' });
  const earlyText = await early.locator('#story-dialog').innerText();
  record('early-quiz-story-allows-trying-before-clearing', /可以先试试/.test(earlyText) && !/四站.*完成|完成.*四站/.test(earlyText)); await early.close();
  record('no-browser-page-errors', errors.length === 0, { count: errors.length });
} catch (error) { record('full-journey-reached-end', false, { errorType: error.name }); console.error(error.message); }
finally {
  try { await browser?.close(); } catch { record('browser-cleanup', false); }
  try { if (service) { await new Promise(resolve => service.server.close(resolve)); service.close(); } } catch { record('service-cleanup', false); }
  fs.rmSync(runtimeDir, { recursive: true, force: true });
  const failed = checks.filter(check => !check.pass).length;
  fs.writeFileSync(path.join(outputDir, 'story-full-journey-results.json'), JSON.stringify({ checks, stages, quiz, pageErrors: errors.length, shots, isolatedDatabaseRemoved: !fs.existsSync(runtimeDir) }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, failed, clearedStations: stages.filter(stage => stage.cleared).length, screenshots: shots.length, isolatedDatabaseRemoved: !fs.existsSync(runtimeDir) }));
  process.exitCode = failed ? 1 : 0;
}
