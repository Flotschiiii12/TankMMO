/**
 * Visual QA harness: screenshots every screen of the real UI (title, loading, recovery, HUD and every window) in DE and EN,
 * at 844x390, 667x375 and 1280x720, in all three faction themes. Needs `npm run build` first (the npm script does it).
 *
 *   npm run ui-shots                                   whole matrix -> docs/screenshots/ui/<lang>/<viewport>/<faction>_<screen>.png
 *   npm run ui-shots -- --quick                        EN, coastal only, three viewports (about 50 shots, ~1 min)
 *   npm run ui-shots -- --langs en --factions steppe --viewports 844x390 --screens inventory,market
 *   npm run ui-shots -- --format jpeg                  smaller files (quality 70), used for the committed set
 *   npm run ui-shots -- --mask-canvas --out docs/screenshots/ui-baseline            write a baseline (game canvas hidden, it is never still)
 *   npm run ui-shots -- --mask-canvas --diff docs/screenshots/ui-baseline           compare against it: exit 1 if a screen changed by more than --threshold (default 2 %)
 *
 * Set E2E_CHROMIUM to a Chromium binary if Playwright's own browser is not installed. The diff mode never overwrites the baseline;
 * it writes the fresh shots to docs/screenshots/ui-diff/ and a report.json next to them.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

const arg = (name: string, def = ''): string => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? (process.argv[i + 1] ?? '') : def; };
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const quick = flag('quick');
const LANGS = (arg('langs') || (quick ? 'en' : 'en,de')).split(',').filter(Boolean);
const FACTIONS = (arg('factions') || (quick ? 'coastal' : 'coastal,highland,steppe')).split(',').filter(Boolean);
const VIEWPORTS = (arg('viewports') || '844x390,667x375,1280x720').split(',').filter(Boolean).map((v) => { const [w, h] = v.split('x').map(Number); return { name: v, width: w, height: h, touch: w < 900 }; });
const ONLY = (arg('screens') || '').split(',').filter(Boolean);
const FORMAT = arg('format', 'png') === 'jpeg' ? 'jpeg' : 'png';
const MASK = flag('mask-canvas');
const DIFF_BASE = arg('diff');
const THRESHOLD = Number(arg('threshold', '2')) / 100;
const OUT = path.resolve(DIFF_BASE ? 'docs/screenshots/ui-diff' : arg('out', 'docs/screenshots/ui'));
const want = (screen: string) => ONLY.length === 0 || ONLY.some((s) => screen.includes(s) || s.startsWith(screen));

const freePort = (): Promise<number> => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); s.on('error', rej); });

/** Windows opened with their shortcut. `setup` runs once the window is open (settings tabs). */
const WINDOWS: Array<{ screen: string; key: string; shift?: boolean }> = [
  { screen: 'garage', key: 'KeyG' }, { screen: 'inventory', key: 'KeyI' }, { screen: 'quests', key: 'KeyJ' }, { screen: 'social', key: 'KeyC' },
  { screen: 'map', key: 'KeyM' }, { screen: 'market', key: 'KeyK' }, { screen: 'career', key: 'KeyX' }, { screen: 'chat', key: 'KeyY' },
  { screen: 'notifications', key: 'KeyN' }, { screen: 'howto', key: 'KeyH' }, { screen: 'shortcuts', key: 'Slash', shift: true },
];
const SETTINGS_TABS = ['Graphics', 'Audio', 'Controls', 'Interface', 'Accessibility', 'Account', 'About'];

const written: string[] = [];
async function shot(page: Page, lang: string, vpName: string, faction: string, screen: string) {
  if (!want(screen)) return;
  const dir = path.join(OUT, lang, vpName); mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${faction}_${screen}.${FORMAT === 'jpeg' ? 'jpg' : 'png'}`);
  await page.screenshot({ path: file, type: FORMAT, ...(FORMAT === 'jpeg' ? { quality: 70 } : {}), animations: 'disabled', caret: 'hide' });
  written.push(file);
}

async function newPage(browser: Browser, base: string, vp: { width: number; height: number; touch: boolean }, lang: string, credential?: string) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.touch, hasTouch: vp.touch, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.addInitScript(([l, c]) => { try { localStorage.setItem('treadfront_lang', l as string); if (c) localStorage.setItem('treadfront_credential', c as string); } catch { /* ignore */ } }, [lang, credential ?? '']);
  const extra = MASK ? 'canvas{visibility:hidden!important}' : ''; // the game world is never still; hidden, a diff only sees the UI
  await page.addInitScript((x) => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;caret-color:transparent!important}' + x; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); }, extra);
  await page.goto(base);
  return { ctx, page };
}

/** Title flow of a fresh visitor: loading, welcome (with each faction picked), recovery. */
async function titleShots(browser: Browser, base: string, vp: { name: string; width: number; height: number; touch: boolean }, lang: string) {
  const { ctx, page } = await (async () => {
    const c = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, isMobile: vp.touch, hasTouch: vp.touch, reducedMotion: 'reduce' });
    const p = await c.newPage();
    await p.addInitScript((l) => { try { localStorage.setItem('treadfront_lang', l as string); localStorage.removeItem('treadfront_credential'); } catch { /* ignore */ } }, lang);
    await p.route('**/api/time', async (r) => { await new Promise((x) => setTimeout(x, 1500)); await r.continue(); }); // keeps the loading screen up long enough to shoot
    await p.goto(base);
    return { ctx: c, page: p };
  })();
  await page.getByTestId('loading-screen').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
  await shot(page, lang, vp.name, 'any', 'loading');
  await page.getByTestId('title-screen').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  for (const f of ['coastal', 'highland', 'steppe']) {
    if (!FACTIONS.includes(f)) continue;
    await page.locator('[role=radio]').nth(['coastal', 'highland', 'steppe'].indexOf(f)).click();
    await page.waitForTimeout(150);
    await shot(page, lang, vp.name, f, 'title');
  }
  await page.getByRole('button', { name: /already have an account|schon ein Konto|bereits/i }).click().catch(() => {});
  await page.waitForTimeout(250);
  await shot(page, lang, vp.name, FACTIONS[0], 'recover');
  await ctx.close();
}

async function gameShots(browser: Browser, base: string, vp: { name: string; width: number; height: number; touch: boolean }, lang: string, faction: string) {
  const g: any = await (await fetch(`${base}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true, faction }) })).json();
  const { ctx, page } = await newPage(browser, base, vp, lang, g.credential);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // the ready step of the loading screen, then in the game
  await page.getByRole('button', { name: /DEPLOY|EINSATZ|SCHLACHTFELD/i }).waitFor({ timeout: 25_000 });
  await page.waitForTimeout(300);
  await shot(page, lang, vp.name, faction, 'ready');
  await page.getByRole('button', { name: /DEPLOY|EINSATZ|SCHLACHTFELD/i }).click();
  await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 15_000 });
  await page.waitForTimeout(1800);
  await shot(page, lang, vp.name, faction, 'hud');
  for (const w of WINDOWS) {
    if (!want(w.screen) && !(w.screen === 'inventory' && want('workshop'))) continue;
    if (w.shift) await page.keyboard.press('Shift+Slash'); else await page.keyboard.press(w.key);
    await page.waitForTimeout(500);
    await shot(page, lang, vp.name, faction, w.screen);
    if (w.screen === 'inventory' && want('workshop')) {
      await page.getByRole('tab', { name: /Workshop|Werkstatt/ }).click();
      await page.waitForTimeout(300);
      await shot(page, lang, vp.name, faction, 'workshop');
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  }
  if (want('settings')) { // runs for `--screens settings` and for single tabs such as `settings_audio` (the shot() filter picks the tab)
    await page.keyboard.press('KeyO'); await page.waitForTimeout(400);
    const tabs = page.getByRole('tab');
    const n = await tabs.count();
    for (let i = 0; i < Math.min(n, SETTINGS_TABS.length); i++) {
      await tabs.nth(i).click(); await page.waitForTimeout(250);
      await shot(page, lang, vp.name, faction, `settings_${SETTINGS_TABS[i].toLowerCase()}`);
    }
    await page.keyboard.press('Escape');
  }
  if (errors.length) console.warn(`page errors in ${lang}/${vp.name}/${faction}:`, errors.slice(0, 3));
  await ctx.close();
}

/** Percentage of pixels that differ clearly between two images, computed inside the browser (no image library needed). */
async function compare(browser: Browser, aFile: string, bFile: string): Promise<number> {
  const page = await browser.newPage();
  await page.evaluate('globalThis.__name = (f) => f'); // tsx wraps functions with a __name helper that does not exist in the page
  const url = (f: string) => `data:image/${f.endsWith('.jpg') ? 'jpeg' : 'png'};base64,${readFileSync(f).toString('base64')}`;
  const ratio = await page.evaluate(async ([a, b]) => {
    const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const [x, y] = await Promise.all([load(a), load(b)]);
    if (x.width !== y.width || x.height !== y.height) return 1;
    const data = (i: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d')!; g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const p = data(x), q = data(y); let diff = 0;
    for (let k = 0; k < p.length; k += 4) if (Math.abs(p[k] - q[k]) + Math.abs(p[k + 1] - q[k + 1]) + Math.abs(p[k + 2] - q[k + 2]) > 60) diff++;
    return diff / (p.length / 4);
  }, [url(aFile), url(bFile)] as [string, string]);
  await page.close();
  return ratio;
}

function walk(dir: string): string[] { return !existsSync(dir) ? [] : readdirSync(dir).flatMap((n) => { const p = path.join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; }); }

async function main() {
  const dist = path.resolve('dist');
  if (!existsSync(path.join(dist, 'index.html'))) throw new Error('dist/ missing - run `npm run build` first');
  if (DIFF_BASE && !existsSync(path.resolve(DIFF_BASE))) throw new Error(`baseline ${DIFF_BASE} does not exist - create it first with --mask-canvas --out ${DIFF_BASE}`);
  const dir = mkdtempSync(path.join(tmpdir(), 'treadfront-shots-'));
  const port = await freePort();
  const server = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, PORT: String(port), DB_PATH: path.join(dir, 's.db'), STATIC_DIR: dist, LOAD_TEST: '1', LOG_QUIET: '1' }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined; let failed = false;
  try {
    const t0 = Date.now();
    while (true) { try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not up yet */ } if (Date.now() - t0 > 30_000) throw new Error('server did not start'); await new Promise((r) => setTimeout(r, 200)); }
    browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.E2E_CHROMIUM || undefined });
    for (const lang of LANGS) for (const vp of VIEWPORTS) {
      await titleShots(browser, base, vp, lang);
      for (const f of FACTIONS) { await gameShots(browser, base, vp, lang, f); console.log(`${lang} ${vp.name} ${f}: done`); }
    }
    console.log(`${written.length} screenshots in ${path.relative('.', OUT)}`);
    if (DIFF_BASE) {
      const base0 = path.resolve(DIFF_BASE); const rows: Array<{ file: string; diff: number | null }> = [];
      for (const f of written) {
        const rel = path.relative(OUT, f); const old = path.join(base0, rel);
        rows.push({ file: rel, diff: existsSync(old) ? await compare(browser, old, f) : null });
      }
      writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(rows, null, 1));
      const over = rows.filter((r) => r.diff !== null && r.diff > THRESHOLD); const fresh = rows.filter((r) => r.diff === null);
      for (const r of over) console.log(`CHANGED ${(r.diff! * 100).toFixed(2)} %  ${r.file}`);
      for (const r of fresh) console.log(`NEW      ${r.file}`);
      console.log(`diff: ${rows.length} compared, ${over.length} over ${(THRESHOLD * 100).toFixed(1)} %, ${fresh.length} without baseline`);
      failed = over.length > 0;
    }
  } finally {
    await browser?.close(); server.kill(); rmSync(dir, { recursive: true, force: true });
  }
  if (failed) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
