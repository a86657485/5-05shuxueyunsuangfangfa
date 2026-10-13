/* Real-browser story regression. Run with bundled Node; optional first argument: screenshot directory.
 * --baseline reproduces the original defects. Only fictional identities and a temporary database are used. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = createRequire('/Users/jun/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.story-require.cjs')('playwright-core');
const { createService } = require('../server.cjs');
const baseline = process.argv.includes('--baseline');
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = path.resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || path.join(projectDir, 'runtime/story-verification'));
fs.mkdirSync(shotDir, { recursive: true });
const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g5l5-story-'));
const roster = [0, 1].map(i => ({ id: `story-501-${i}`, classId: '501', name: `虚构走查${i + 1}` }));
const checks = [], errors = [], shots = [];
const record = (id, pass, counts = {}) => { const item = { id, pass: !!pass, ...counts }; checks.push(item); console.log(JSON.stringify(item)); };
let service, browser, page;
try {
  service = createService({ runtimeDir, roster, networkInterfaces: () => ({ lo: [{ address: '127.0.0.1', family: 'IPv4' }] }) });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1366, height: 820 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.name));
  const click = async selector => { const el = page.locator(selector).first(); await el.scrollIntoViewIfNeeded(); await el.click(); };
  const storyVisible = () => page.locator('#story-dialog').isVisible();
  const closed = () => page.waitForFunction(() => !document.body.classList.contains('story-open'));
  const finishStory = async () => { for (let i = 0; i < 8 && await storyVisible(); i++) await click('.story-continue'); await closed(); };
  const shot = async name => { const file = path.join(shotDir, name + '.png'); await page.screenshot({ path: file, fullPage: true }); shots.push(file); };
  const neutral = async id => {
    const counts = await page.evaluate(async () => {
      const { focusTarget } = await import('/focus.mjs');
      return {
        choices: document.querySelectorAll('#body button.opt.cta').length,
        guidedAnswers: document.querySelectorAll('#body button.opt[data-cta-tip]').length,
        pressed: document.querySelectorAll('#body button.opt[aria-pressed="true"]').length,
        coachOnChoice: !document.querySelector('#coach')?.hidden && focusTarget()?.matches('#body button.opt') ? 1 : 0
      };
    });
    record(id, !counts.choices && !counts.guidedAnswers && !counts.coachOnChoice, counts);
  };
  const enter = async id => { await page.evaluate(stage => { void window.__enterPlace(stage); }, id); await page.locator('#story-dialog').waitFor({ state: 'visible' }); };
  const pressChip = (id, value) => click(`#${id} .chip[data-v="${value}"]`);
  const check = async ok => { await click('#check'); await page.waitForSelector(ok ? '#fb.ok' : '#fb.bad'); };
  const next = () => click('#next');
  const compose = async rows => {
    for (const [i, row] of rows.entries()) for (const [key, value] of Object.entries(row)) {
      const cls = { verb: 'v', obj: 'o', method: 'm' }[key];
      await click(`.step-row[data-i="${i}"] .${cls}[data-v="${value}"]`);
      await neutral(`composer-${i}-${key}`);
    }
  };
  const contains = async (selector, patterns) => { const text = await page.locator(selector).innerText(); return patterns.every(pattern => pattern.test(text)); };
  await page.goto(base + '/test');
  if (baseline) {
    await page.waitForSelector('.rpg-canvas');
    const count = await page.locator('#story-dialog').count();
    record('opening-story-present', count > 0, { count });
    if (await storyVisible()) await click('.story-skip');
    await page.evaluate(() => { void window.__enterPlace('temp'); });
    if (await storyVisible()) await click('.story-skip');
    await page.waitForSelector('#qAsk');
    const guided = await page.locator('#qAsk .chip.cta').count();
    record('unanswered-choices-neutral', guided === 0, { count: guided });
  } else {
    await page.locator('#story-dialog').waitFor({ state: 'visible' });
    record('test-opening-real-reception', await contains('#story-dialog', [/校园开放日/, /友好学校/, /接待|体验指南/]));
    record('no-science-day-theme', !(await page.locator('body').innerText()).includes('科学观察日'));
    await shot('01-opening-reception');
    await click('.story-skip'); await closed();
    await page.waitForSelector('.rpg-canvas');
    record('skip-returns-to-map', await page.locator('#map').isVisible());
    record('mission-remains-visible', await page.locator('#mission-status').isVisible());
    await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowUp');
    try { await page.waitForSelector('#rpg-talk:not([hidden]):not([disabled])', { timeout: 3000 }); }
    finally { await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp'); }
    record('keyboard-test-begins-near-usable-station', await page.locator('#rpg-talk').isVisible() && await page.locator('#rpg-talk').isEnabled());
    if (!await page.locator('#story-replay').isVisible()) await click('#menu-btn');
    await click('#story-replay'); await page.locator('#story-dialog').waitFor({ state: 'visible' });
    record('opening-can-be-replayed', await contains('#story-dialog', [/校园开放日/]));
    await page.evaluate(() => document.activeElement.blur());
    const originalNow = await page.evaluate(() => { window.__storyClock = performance.now; performance.now = () => 12345; return true; });
    await page.waitForTimeout(80);
    const mapBefore = await page.locator('.rpg-canvas').evaluate(canvas => canvas.toDataURL());
    await page.keyboard.down('ArrowDown'); await page.waitForTimeout(200); await page.keyboard.up('ArrowDown'); await page.waitForTimeout(80);
    const mapAfter = await page.locator('.rpg-canvas').evaluate(canvas => canvas.toDataURL());
    if (originalNow) await page.evaluate(() => { performance.now = window.__storyClock; delete window.__storyClock; });
    record('story-keyboard-keeps-map-still', mapBefore === mapAfter);
    await page.keyboard.press('Space'); await page.keyboard.press('Enter');
    record('story-keyboard-does-not-open-map-task', await storyVisible() && await page.locator('#level').isHidden()); await finishStory();

    await enter('temp');
    record('temp-story-context', await contains('#story-dialog', [/介绍板报/, /2月平均气温/, /50\s*℉/])); await finishStory();
    await page.waitForSelector('#qAsk'); await neutral('temp-unanswered-three-questions');
    record('temp-source-data-preserved', await contains('#body', [/2月/, /50\s*℉/, /5\s*×/, /32/, /9/]));
    await click('#stage-story'); await page.locator('#story-dialog').waitFor({ state: 'visible' });
    record('temp-task-story-replay', await contains('#story-dialog', [/介绍板报/, /50\s*℉/])); await finishStory();
    await pressChip('qAsk', 'F'); await pressChip('qKnown', 'days'); await pressChip('qHow', 'guess');
    record('student-selection-state-preserved', await page.locator('#qAsk [data-v="F"][aria-pressed="true"]').count() === 1);
    await page.waitForSelector('#ipoBox:not([hidden])'); await neutral('temp-unanswered-ipo-after-wrong-choices');
    await pressChip('sIn', 'ask'); await pressChip('sProc', 'known'); await pressChip('sOut', 'how');
    record('check-retains-action-emphasis', await page.locator('#check.cta').count() === 1);
    await check(false); await neutral('temp-retry-does-not-point-at-answer');
    await pressChip('qAsk', 'C'); await pressChip('qKnown', 'F'); await pressChip('qHow', 'formula');
    await pressChip('sIn', 'known'); await pressChip('sProc', 'how'); await pressChip('sOut', 'ask');
    await check(true); await next(); await neutral('operation-pool-first-choice-neutral');
    for (const op of ['sub32', 'mul5', 'div9']) await click(`#opsPool [data-k="${op}"]`);
    await click('#calc'); await page.waitForSelector('#zhou:not([hidden])'); await neutral('unanswered-error-reason-neutral');
    await pressChip('why', 'order'); await check(true); await next();
    await compose([{ verb: 'input', obj: 'F' }, { verb: 'calc', obj: 'C', method: 'ok' }, { verb: 'output', obj: 'C' }]);
    await click('#run'); await page.waitForSelector('#fb.ok'); await next();
    record('temp-cleared-story-outcome', await page.locator('#story-outcome').isVisible() && await contains('#story-outcome', [/气温|板报|温度/, /黑板|下一站/]));
    await shot('02-completed-reception-result'); await click('#backMap');

    for (const [id, expected, body] of [
      ['flow', [/黑板/, /检查/], [/学习单/, /华氏温度/]],
      ['seeds', [/第\s*1\s*组\s*3\s*粒/, /第\s*2\s*组\s*5\s*粒/, /第\s*10\s*组/], [/3\s*粒/, /5\s*粒/, /7\s*粒/, /第\s*10\s*小组/, /m\s*=\s*n×2\+1/, /s\s*=\s*n×\(3\+m\)÷2/]],
      ['signin', [/学校原有/, /阅读签到/, /15\s*次/, /换购图书/], [/签到\s*1\s*次得\s*1\s*分/, /2\s*次共\s*4\s*分/, /3\s*次共\s*7\s*分/, /4\s*次共\s*10\s*分/, /15\s*次/]]
    ]) {
      await enter(id); record(`${id}-story-coherent`, await contains('#story-dialog', expected)); await finishStory();
      record(`${id}-source-data-preserved`, await contains('#body', body)); await neutral(`${id}-unanswered-neutral`);
      await click('#stage-story'); await page.locator('#story-dialog').waitFor({ state: 'visible' });
      record(`${id}-task-story-replay`, await contains('#story-dialog', expected));
      if (id === 'flow') await page.keyboard.press('Escape'); else await click('.story-skip'); await closed();
      record(`${id}-replay-returns-to-task`, await page.locator('#body').isVisible());
      if (id === 'flow') { await click('#parts [data-i="1"]'); await click('.fbox[data-id="b1"]'); await neutral('flow-fault-choices-neutral'); }
      if (id === 'seeds') { await click('#parts [data-i="2"]'); await neutral('seed-flow-shape-choices-neutral'); }
      if (id === 'signin') { await click('#parts [data-i="2"]'); await neutral('reflection-choices-neutral'); }
    }
    await click('#stage-story'); await page.locator('#story-dialog').waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.story-continue').scrollIntoViewIfNeeded();
    const mobile = await page.evaluate(() => {
      const dialog = document.querySelector('#story-dialog'), button = dialog.querySelector('.story-continue'), rect = button.getBoundingClientRect();
      return { pageOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), dialogOverflow: Math.max(0, dialog.scrollWidth - dialog.clientWidth), buttonVisible: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth };
    });
    record('mobile-story-scroll-and-no-overflow', mobile.buttonVisible && mobile.pageOverflow <= 1 && mobile.dialogOverflow <= 1, mobile);
    await shot('03-mobile-story-continue'); await finishStory();
    await page.setViewportSize({ width: 1366, height: 820 });

    const studentPage = await browser.newPage({ viewport: { width: 1366, height: 820 }, reducedMotion: 'reduce' });
    page = studentPage; page.on('pageerror', error => errors.push(error.name)); page.on('dialog', dialog => dialog.accept());
    const loginStudent = async index => {
      await click('.tile[data-class="501"]'); await click(`.name-chip[data-id="story-501-${index}"]`); await click('#login-submit');
      await page.locator('#story-dialog').waitFor({ state: 'visible' });
    };
    await page.goto(base + '/'); await loginStudent(0);
    record('ordinary-login-opens-intro', await contains('#story-dialog', [/校园开放日/, /友好学校/])); await click('.story-skip'); await closed();
    await page.reload(); await page.waitForSelector('.rpg-canvas'); await page.waitForTimeout(300);
    record('restored-session-does-not-force-intro', !await storyVisible());
    await click('#menu-btn'); await click('#switch'); await page.waitForSelector('.tile'); await loginStudent(1);
    record('new-identity-opens-intro', await contains('#story-dialog', [/校园开放日/])); await finishStory();
  }
  record('no-browser-page-errors', errors.length === 0, { count: errors.length });
} catch (error) {
  record('browser-flow-completed', false, { errorType: error.name });
  console.error(error.message);
} finally {
  try { await browser?.close(); } catch { record('browser-cleanup', false); }
  try { if (service) { await new Promise(resolve => service.server.close(resolve)); service.close(); } } catch { record('service-cleanup', false); }
  fs.rmSync(runtimeDir, { recursive: true, force: true });
  const failed = checks.filter(check => !check.pass).length;
  fs.writeFileSync(path.join(shotDir, baseline ? 'baseline-results.json' : 'story-results.json'), JSON.stringify({ checks, pageErrors: errors.length, shots, isolatedDatabaseRemoved: !fs.existsSync(runtimeDir) }, null, 2));
  console.log(JSON.stringify({ total: checks.length, failed, screenshots: shots.length, isolatedDatabaseRemoved: !fs.existsSync(runtimeDir) }));
  process.exitCode = failed ? 1 : 0;
}
