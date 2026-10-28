/**
 * End-to-end smoke test: real server (temp DB, LOAD_TEST=1) + built client + headless Chromium.
 * Run with `npm run e2e` (needs `npx playwright install chromium` once). Takes ~20 s.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const fail = (msg: string): never => { throw new Error(`E2E FAILED: ${msg}`); };

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

async function main() {
  const dist = path.resolve('dist');
  if (!existsSync(path.join(dist, 'index.html'))) fail('dist/ missing - run `npm run build` first');
  const dir = mkdtempSync(path.join(tmpdir(), 'treadfront-e2e-'));
  const port = await freePort();
  const server = spawn('npx', ['tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(dir, 'e2e.db'), STATIC_DIR: dist, LOAD_TEST: '1', LOG_QUIET: '1', ADMIN_TOKEN: 'e2e' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  const base = `http://127.0.0.1:${port}`;
  let browser;
  try {
    const t0 = Date.now();
    while (true) {
      try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not up yet */ }
      if (Date.now() - t0 > 30_000) fail(`server did not start\n${serverLog}`);
      await new Promise((r) => setTimeout(r, 200));
    }
    browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.E2E_CHROMIUM || undefined });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await page.addInitScript(() => { try { localStorage.setItem('treadfront_lang', 'en'); } catch { /* ignore */ } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });

    await page.goto(base);
    await page.getByLabel('I am at least 13 years old.').check({ timeout: 15_000 }).catch(async () => { await page.locator('input[type=checkbox]').first().check(); });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: /DEPLOY TO BATTLEFIELD/ }).click({ timeout: 20_000 });
    await page.locator('canvas').first().waitFor({ timeout: 15_000 });
    await page.getByTitle(/Inventory & Loadout/).waitFor({ timeout: 15_000 }); // HUD is up

    await page.keyboard.press('F3'); // debug panel shows the player position
    const readPos = async (): Promise<[number, number]> => {
      const text = await page.locator('text=/Pos:/').first().innerText({ timeout: 10_000 });
      const m = /Pos:\s*(-?\d+),\s*(-?\d+)/.exec(text);
      if (!m) fail(`cannot read position from "${text}"`);
      return [Number(m![1]), Number(m![2])];
    };
    await page.waitForTimeout(1000);
    const before = await readPos();
    await page.keyboard.down('KeyD');
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyS');
    await page.keyboard.press('Space'); // auto-fire
    await page.waitForTimeout(500);
    const after = await readPos();
    const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
    if (moved < 20) fail(`player did not move (before ${before}, after ${after})`);

    await page.keyboard.press('KeyI');
    await page.getByText('Loadout & Workshop').waitFor({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    if (errors.length) fail(`browser errors:\n${errors.join('\n')}`);
    console.log(`E2E OK: moved ${moved.toFixed(0)} units in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0), (e) => { console.error(e.message ?? e); process.exit(1); });
