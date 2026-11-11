/**
 * Headless smoke test — runs against a production build via `vite preview`.
 * Fails the process on console errors, page errors, or missing core UI.
 */
import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL || 'http://localhost:4173';
const failures = [];
const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) failures.push(label);
};

const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu'];
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', args });
} catch {
  browser = await chromium.launch({ args });
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1200);

// 1. shell renders
ok('page title present', (await page.title()).length > 0, await page.title());
ok('canvas exists', await page.locator('#game').count() === 1);

// 2. class roster is populated (71 classes) — the grid filters by archetype,
//    so switch to "All" before counting
await page.locator('.arch-tab[data-arch="All"]').click();
await page.waitForTimeout(400);
const cards = await page.locator('.card').count();
ok('class cards >= 60', cards >= 60, `${cards} cards`);

// 3. archive (meta) UI opens
await page.locator('#archiveBtn').click();
await page.waitForTimeout(400);
ok('archive opens', !(await page.locator('#archiveScreen').getAttribute('class')).includes('hidden'));
ok('soul tracks render', (await page.locator('.arc-track').count()) === 4);
const imgs = await page.evaluate(() =>
  [...document.querySelectorAll('.arc-boss img')].map((i) => i.complete && i.naturalWidth > 0));
await page.locator('.arc-tab[data-tab="codex"]').click();
await page.waitForTimeout(300);
// images are network-bound on a real deployment, so wait for them to settle
// instead of sampling immediately (this is what made the check flaky on live)
await page.waitForFunction(() => {
  const imgs = [...document.querySelectorAll('.arc-boss img')];
  return imgs.length === 5 && imgs.every((i) => i.complete);
}, null, { timeout: 10000 }).catch(() => {});
const codexImgs = await page.evaluate(() =>
  [...document.querySelectorAll('.arc-boss img')].map((i) => i.complete && i.naturalWidth > 0));
ok('bestiary art loads', codexImgs.length === 5 && codexImgs.every(Boolean), JSON.stringify(codexImgs));
await page.locator('#archiveClose').click();

// 4. a run starts and the canvas keeps rendering
await page.locator('.card').first().click();
await page.waitForTimeout(1200);
const skip = page.locator('#siSkip');
if (await skip.count()) { try { await skip.first().click({ timeout: 1500 }); } catch {} }
await page.waitForTimeout(2500);
const menuHidden = await page.evaluate(() => document.getElementById('menu').classList.contains('hidden'));
ok('run starts', menuHidden);
const shot = await page.evaluate(() => {
  const c = document.getElementById('game');
  return c ? { w: c.width, h: c.height } : null;
});
ok('canvas has a backing store', !!shot && shot.w > 300 && shot.h > 300, JSON.stringify(shot));

// 5. no runtime errors during play
await page.waitForTimeout(2500);
ok('no console/page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nSMOKE OK');
