// A play-through regression test: the game must still be a game after any change.
//
// The smoke test proves the shell boots. This proves the loop actually runs —
// enemies die, levels happen, the canvas draws something, and nothing throws
// along the way. It exists because the next piece of work (lifting the core loop
// out of game.ts) will touch combat, and nothing currently notices if combat
// silently stops working while every other check stays green.
//
// Deliberately headless and deterministic-ish: easy difficulty, autoplay on,
// level-ups auto-picked. Runtime is ~90s.

import { chromium } from 'playwright';

const URL = process.env.PLAY_URL || 'http://localhost:4173';
const MIN_KILLS = Number(process.env.PLAY_MIN_KILLS || 10);
const DURATION_MS = Number(process.env.PLAY_MS || 90000);

let failures = 0;
const ok = (name, pass, info = '') => {
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${info ? '  ' + info : ''}`);
};

// prefer the system Chrome (present on CI runners and dev machines); fall back
// to Playwright's bundled build when that is what is installed
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
} catch {
  browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
}
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.addInitScript(() => {
  try {
    if (sessionStorage.getItem('__play_seed')) return;
    sessionStorage.setItem('__play_seed', '1');
    localStorage.clear();
    localStorage.setItem('sd_diff', 'easy');
  } catch { /* storage blocked — the run still works */ }
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(2200);

// start a run: first class card, skip the intro, turn on autoplay
await page.locator('.card').first().click();
await page.waitForTimeout(1200);
for (const sel of ['#siSkip', '#introSkip']) {
  try { await page.locator(sel).first().click({ timeout: 1200 }); break; } catch { /* already skipped */ }
}
await page.waitForTimeout(800);
try { await page.locator('#autoplayBadge').click({ timeout: 3000 }); } catch { /* autoplay is optional */ }

const startedAt = Date.now();
let kills = 0;
let level = 0;
let wave = 0;
let levelUps = 0;
let cutscenes = 0;

while (Date.now() - startedAt < DURATION_MS) {
  await page.waitForTimeout(500);

  const state = await page.evaluate(() => {
    const text = document.body.innerText;
    const num = (re) => { const m = text.match(re); return m ? Number(m[1]) : 0; };
    return {
      kills: num(/(\d+)\s*kills/i),
      level: num(/Lv\s*(\d+)/i),
      wave: num(/Wave\s*(\d+)/i),
      upgOpen: !document.getElementById('upgScreen')?.classList.contains('hidden'),
      cutscene: !document.getElementById('cutsceneBars')?.classList.contains('hidden'),
      dead: /GAME OVER|YOU DIED|RESTART/i.test(text),
    };
  });

  kills = Math.max(kills, state.kills);
  wave = Math.max(wave, state.wave);
  if (state.level > level) { level = state.level; levelUps += 1; }
  if (state.upgOpen) { await page.keyboard.press('1'); continue; }
  if (state.cutscene) { cutscenes += 1; await page.keyboard.press('Space'); }
  if (state.dead) break;
}

// the canvas must actually contain something, not just exist
const canvas = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return { ok: false, reason: 'no canvas' };
  const ctx = c.getContext('2d');
  if (!ctx) return { ok: false, reason: 'no 2d context' };
  const w = Math.min(c.width, 240), h = Math.min(c.height, 160);
  const data = ctx.getImageData(0, 0, w, h).data;
  let lit = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] + data[i + 1] + data[i + 2] > 40) lit += 1;
  }
  return { ok: lit > 200, lit, total: w * h / 1 };
});

const crashLog = await page.evaluate(() => localStorage.getItem('sd_errors_v1'));

ok('run started', wave >= 1, `wave ${wave}`);
ok('enemies were killed', kills >= MIN_KILLS, `${kills} kills in ${Math.round(DURATION_MS / 1000)}s`);
ok('level-ups happened', levelUps >= 1, `level ${level}`);
ok('canvas is drawing', canvas.ok, canvas.lit ? `${canvas.lit} lit pixels` : canvas.reason || 'blank');
ok('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
ok('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
ok('crash log stayed empty', !crashLog || crashLog === '[]', crashLog ? String(crashLog).slice(0, 120) : 'empty');

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nPLAY OK');
process.exit(failures ? 1 : 0);
