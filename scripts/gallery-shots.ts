/**
 * Screenshots the UI kit gallery (#/ui-gallery) in every faction theme and both languages, and checks that the virtual
 * list/grid only render a few rows. Run: `npm run gallery-shots` (builds first; set E2E_CHROMIUM for a custom Chromium).
 * Output: docs/screenshots/ui-kit/<faction>_<lang>.png
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const FACTIONS = ['coastal', 'highland', 'steppe']; const LANGS = ['en', 'de'];
const freePort = (): Promise<number> => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => res(p)); }); s.on('error', rej); });

async function main() {
  const dist = path.resolve('dist');
  if (!existsSync(path.join(dist, 'index.html'))) throw new Error('dist/ missing - run `npm run build` first');
  const out = path.resolve('docs/screenshots/ui-kit'); mkdirSync(out, { recursive: true });
  const dir = mkdtempSync(path.join(tmpdir(), 'treadfront-gallery-'));
  const port = await freePort();
  const server = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, PORT: String(port), DB_PATH: path.join(dir, 'g.db'), STATIC_DIR: dist, LOG_QUIET: '1' }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  let browser;
  try {
    const t0 = Date.now();
    while (true) { try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not up */ } if (Date.now() - t0 > 30_000) throw new Error('server did not start'); await new Promise((r) => setTimeout(r, 200)); }
    browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.E2E_CHROMIUM || undefined });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 2300 } })).newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const f of FACTIONS) for (const l of LANGS) {
      await page.goto(`${base}/#/ui-gallery?faction=${f}&lang=${l}`);
      await page.reload();
      await page.getByTestId('ui-gallery').waitFor({ timeout: 15_000 });
      await page.waitForTimeout(400);
      const rowsInDom = await page.locator('[role=listitem]').count();
      const itemsInDom = await page.locator('.k-item').count();
      if (rowsInDom > 60) throw new Error(`virtual list rendered ${rowsInDom} rows`);
      if (itemsInDom > 200) throw new Error(`virtual grid rendered ${itemsInDom} items`);
      await page.screenshot({ path: path.join(out, `${f}_${l}.png`), scale: 'css' });
    }
    if (errors.length) throw new Error(`page errors:\n${errors.join('\n')}`);
    console.log(`GALLERY OK: ${FACTIONS.length * LANGS.length} screenshots in docs/screenshots/ui-kit`);
  } finally { await browser?.close(); server.kill('SIGTERM'); rmSync(dir, { recursive: true, force: true }); }
}
main().then(() => process.exit(0), (e) => { console.error(e.message ?? e); process.exit(1); });
