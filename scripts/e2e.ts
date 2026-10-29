/**
 * End-to-end smoke test: real server (temp DB, LOAD_TEST=1) + built client + headless Chromium.
 * Run with `npm run e2e` (needs `npx playwright install chromium` once). Takes ~20 s.
 * Set `E2E_GRAPHICS_QUALITY=high|medium|low|off` to force a graphics preset during the frame-time sample.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const fail = (msg: string): never => { throw new Error(`E2E FAILED: ${msg}`); };
/** Time from navigation to the visible title screen in software-rendered headless Chromium; generous on purpose, it catches regressions, not tuning. */
const FIRST_RENDER_BUDGET_MS = Number(process.env.FIRST_RENDER_BUDGET_MS || 5000);
const QUALITY_LABELS: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low', off: 'Off' };

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
  let botsProcess: ReturnType<typeof spawn> | undefined;
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

    const tNav = Date.now();
    await page.goto(base);
    await page.getByTestId('title-screen').waitFor({ timeout: 15_000 });
    const firstRenderMs = Date.now() - tNav;
    const fcp = (await page.evaluate(() => Math.round(performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')?.startTime ?? -1))) as number;
    console.log(`first render: title screen after ${firstRenderMs} ms, first contentful paint ${fcp} ms (budget ${FIRST_RENDER_BUDGET_MS} ms / 3000 ms)`);
    if (firstRenderMs > FIRST_RENDER_BUDGET_MS) fail(`title screen took ${firstRenderMs} ms to render (budget ${FIRST_RENDER_BUDGET_MS} ms)`);
    if (fcp > 3000) fail(`first contentful paint took ${fcp} ms (budget 3000 ms)`);
    await page.getByLabel('I am at least 13 years old.').check({ timeout: 15_000 }).catch(async () => { await page.locator('input[type=checkbox]').first().check(); });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: /DEPLOY TO BATTLEFIELD/ }).click({ timeout: 20_000 });
    await page.locator('canvas').first().waitFor({ timeout: 15_000 });
    await page.getByRole('button', { name: /^Inventory & Loadout$/ }).waitFor({ timeout: 15_000 }); // HUD is up

    const requestedQuality = process.env.E2E_GRAPHICS_QUALITY;
    if (requestedQuality) {
      const label = QUALITY_LABELS[requestedQuality];
      if (!label) fail(`unsupported E2E_GRAPHICS_QUALITY "${requestedQuality}"`);
      await page.keyboard.press('KeyO');
      await page.getByRole('radiogroup', { name: 'Graphics quality' }).getByRole('radio', { name: label, exact: true }).click();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      console.log(`graphics quality: ${requestedQuality}`);
    }

    await page.keyboard.press('F3'); // debug panel shows the player position
    const readPos = async (): Promise<[number, number]> => {
      const text = await page.locator('text=/Pos:/').first().innerText({ timeout: 10_000 });
      const m = /Pos:\s*(-?\d+),\s*(-?\d+)/.exec(text);
      if (!m) fail(`cannot read position from "${text}"`);
      return [Number(m![1]), Number(m![2])];
    };
    await page.waitForTimeout(1000);
    const botsCount = Number(process.env.E2E_BOTS_COUNT ?? '0');
    let botsDone: Promise<number> | undefined;
    let botsLog = '';
    if (botsCount > 0) {
      if (!Number.isInteger(botsCount) || botsCount > 200) fail(`invalid E2E_BOTS_COUNT "${process.env.E2E_BOTS_COUNT}" (expected 1..200)`);
      const botsSeconds = Number(process.env.E2E_BOTS_SECONDS ?? '20');
      if (!Number.isInteger(botsSeconds) || botsSeconds < 5 || botsSeconds > 120) fail(`invalid E2E_BOTS_SECONDS "${process.env.E2E_BOTS_SECONDS}" (expected 5..120)`);
      botsProcess = spawn('npm', ['run', 'bots', '--', '--count', String(botsCount), '--seconds', String(botsSeconds), '--mode', 'clustered', '--url', base], { stdio: ['ignore', 'pipe', 'pipe'] });
      const botsStdout = botsProcess.stdout;
      const botsStderr = botsProcess.stderr;
      if (botsStdout === null || botsStderr === null) throw new Error('bot benchmark output streams were not created');
      botsStdout.on('data', (data) => { botsLog += data.toString(); });
      botsStderr.on('data', (data) => { botsLog += data.toString(); });
      botsDone = new Promise((resolve, reject) => {
        botsProcess!.once('error', reject);
        botsProcess!.once('close', (code) => resolve(code ?? 1));
      });
      await page.waitForTimeout(2000);
      console.log(`browser frame sample under ${botsCount} clustered bots`);
    }
    const before = await readPos();
    // frame-time probe: requestAnimationFrame deltas while driving and shooting (budget check below)
    await page.evaluate('window.__frames = []; (function () { var last = performance.now(); function tick(t) { window.__frames.push(t - last); last = t; requestAnimationFrame(tick); } requestAnimationFrame(tick); })()');
    await page.keyboard.down('KeyD');
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyS');
    await page.keyboard.press('Space'); // auto-fire
    await page.waitForTimeout(500);
    const after = await readPos();
    const frames = ((await page.evaluate('window.__frames')) as number[]).slice(5).sort((a, b) => a - b);
    const avgFrame = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length); const p95Frame = frames[Math.floor(frames.length * 0.95)] ?? 0;
    console.log(`frame time: avg ${avgFrame.toFixed(1)} ms, p95 ${p95Frame.toFixed(1)} ms over ${frames.length} frames (software-rendered headless Chromium)`);
    if (frames.length < 20) fail('too few animation frames measured');
    if (avgFrame > Number(process.env.E2E_MAX_AVG_FRAME_MS ?? 80)) fail(`average frame time ${avgFrame.toFixed(1)} ms is over the budget`);
    if (botsDone) {
      const code = await botsDone;
      botsProcess = undefined;
      if (code !== 0) fail(`npm run bots exited with code ${code}\n${botsLog}`);
      console.log(`browser bot load finished:\n${botsLog.trim()}`);
    }
    const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
    if (moved < 20) fail(`player did not move (before ${before}, after ${after})`);

    await page.keyboard.press('KeyI');
    await page.getByText('Loadout & Workshop').waitFor({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    if (errors.length) fail(`browser errors:\n${errors.join('\n')}`);
    console.log(`E2E OK: moved ${moved.toFixed(0)} units in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } finally {
    if (botsProcess && !botsProcess.killed) botsProcess.kill('SIGTERM');
    await browser?.close();
    server.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0), (e) => { console.error(e.message ?? e); process.exit(1); });
