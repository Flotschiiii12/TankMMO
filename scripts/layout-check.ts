/**
 * Automated layout check of the real UI in mobile emulation (Playwright + headless Chromium).
 * Run with `npm run layout-check` after `npm run build` (set E2E_CHROMIUM to a Chromium binary if needed).
 *
 * Rules (mobile viewports): nothing in the HUD overlaps the joystick or the fire buttons, every button/link/input is at least
 * 44x44 CSS px, text is at least 11 px (after HUD scaling), nothing sticks into the safe-area insets (notch), modals fit the
 * screen or scroll, the chat input leaves the controls free, no horizontal page scroll, the zoom setting and pinch zoom work.
 * The desktop viewport (1280x720) skips the touch-target rule.
 *
 *   --screens <dir>   also save a screenshot of every screen (docs/screenshots)
 *   --report-only     print the violations but exit 0
 * Verified in emulation only: real notch shapes, real thumb reach, browser chrome of iOS Safari. See docs/CLOUD_REPORT_3.md.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

interface Viewport { name: string; width: number; height: number; touch: boolean; insets: { top: number; right: number; bottom: number; left: number } }
const VIEWPORTS: Viewport[] = [
  { name: 'phone-844x390', width: 844, height: 390, touch: true, insets: { top: 0, right: 47, bottom: 21, left: 47 } },
  { name: 'phone-740x360', width: 740, height: 360, touch: true, insets: { top: 0, right: 44, bottom: 20, left: 44 } },
  { name: 'phone-667x375', width: 667, height: 375, touch: true, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: 'desktop-1280x720', width: 1280, height: 720, touch: false, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
];
const MIN_TARGET = 44; const MIN_TEXT = 11;

const args = process.argv.slice(2);
const reportOnly = args.includes('--report-only');
const screensDir = args.includes('--screens') ? args[args.indexOf('--screens') + 1] : undefined;

interface Violation { viewport: string; screen: string; rule: string; element: string; detail: string }
const violations: Violation[] = [];

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => resolve(p)); }); s.on('error', reject); });
}

/** Runs inside the page. Returns plain data only (strings passed to evaluate to avoid tsx helper injection). */
const MEASURE = (modal: boolean) => `(() => {
  const MODAL = ${modal};
  const inModal = (el) => !!el.closest('[role=dialog], [data-modal], .fixed.inset-0');
  const vw = window.innerWidth, vh = window.innerHeight;
  const describe = (el) => {
    const t = (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-testid') || el.getAttribute('data-hud') || el.getAttribute('data-ui') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 32);
    return el.tagName.toLowerCase() + (t ? '[' + t + ']' : '');
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false; } return true; };
  const zoomOf = (el) => { let z = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const v = parseFloat(getComputedStyle(n).zoom); if (v && v !== 1) z *= v; } return z; };
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const out = { vw, vh, targets: [], texts: [], hud: [], joystick: null, fireButtons: [], dialogs: [], scrollX: document.documentElement.scrollWidth - vw };
  for (const el of document.querySelectorAll('button, a[href], [role=button], input:not([type=hidden]), select, textarea')) {
    if (!visible(el) || (MODAL && !inModal(el))) continue;
    const box = (el.closest('label') && el.tagName === 'INPUT') ? el.closest('label') : el;
    const r = box.getBoundingClientRect(); const z = zoomOf(el);
    let scrollable = false; for (let n = el.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 2) { scrollable = true; break; } }
    out.targets.push({ el: describe(el), w: r.width, h: r.height, x: r.left, y: r.top, scrollable, inDialog: !!el.closest('[role=dialog], [data-modal]') });
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement; if (!el || seen.has(el) || !n.textContent.trim()) continue;
    if (['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)) continue;
    seen.add(el);
    if (!visible(el) || (MODAL && !inModal(el))) continue;
    const size = parseFloat(getComputedStyle(el).fontSize) * zoomOf(el);
    out.texts.push({ el: describe(el), size, text: n.textContent.trim().slice(0, 24), y: el.getBoundingClientRect().top, inDialog: !!el.closest('[role=dialog], [data-modal]') });
  }
  for (const el of document.querySelectorAll('[data-hud], [data-testid=target-panel], [data-testid=kill-feed], [data-testid=tutorial-chip], [data-testid=hint-toast], [data-testid=spectate-bar]')) {
    if (visible(el)) out.hud.push({ el: describe(el), ...rect(el) });
  }
  const js = document.querySelector('[data-ui=joystick] > div'); if (js && visible(js)) out.joystick = rect(js);
  for (const b of document.querySelectorAll('[data-ui=fire] button')) if (visible(b)) out.fireButtons.push({ el: describe(b), ...rect(b) });
  for (const d of document.querySelectorAll('[role=dialog], [data-modal], .fixed.inset-0')) {
    if (!MODAL || !visible(d) || d.querySelector('canvas') || d.getAttribute('aria-hidden') === 'true') continue;
    const panel = d.matches('[role=dialog]') ? d.querySelector('.k-panel__body') || d : (d.firstElementChild && d.firstElementChild.getBoundingClientRect().width > 0 ? d.firstElementChild : d);
    const cs = getComputedStyle(panel);
    out.dialogs.push({ el: describe(d), ...rect(panel), scrollH: panel.scrollHeight, clientH: panel.clientHeight, overflowY: cs.overflowY, outerScroll: getComputedStyle(d).overflowY });
  }
  return out;
})()`;

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 3 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 3;

async function check(page: Page, vp: Viewport, screen: string, opts: { modal?: boolean } = {}) {
  const m: any = await page.evaluate(MEASURE(!!opts.modal));
  const add = (rule: string, element: string, detail: string) => { if (!violations.some((v) => v.viewport === vp.name && v.screen === screen && v.rule === rule && v.element === element)) violations.push({ viewport: vp.name, screen, rule, element, detail }); };
  if (m.scrollX > 1) add('page-scroll', 'document', `page is ${Math.round(m.scrollX)} px wider than the screen`);
  if (vp.touch) for (const t of m.targets) if (Math.min(t.w, t.h) < MIN_TARGET - 0.5) add('target-size', t.el, `${Math.round(t.w)}x${Math.round(t.h)} px, needs ${MIN_TARGET}x${MIN_TARGET}`);
  for (const t of m.texts) if (t.size < MIN_TEXT - 0.05) add('text-size', t.el, `"${t.text}" is ${t.size.toFixed(1)} px, needs ${MIN_TEXT}`);
  if (!opts.modal) {
    const controls = [...(m.joystick ? [{ el: 'joystick', ...m.joystick }] : []), ...m.fireButtons];
    for (const h of m.hud) for (const c of controls) if (overlap(h, c)) add('hud-overlaps-controls', h.el, `overlaps ${c.el}`);
    const L = vp.insets.left, R = vp.width - vp.insets.right, T = vp.insets.top, Bt = vp.height - vp.insets.bottom;
    for (const c of controls) if (c.x < L - 1 || c.x + c.w > R + 1 || c.y + c.h > Bt + 1) add('safe-area', c.el, `sticks into the notch/home-bar inset (${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.w)}x${Math.round(c.h)})`);
    for (const h of m.hud) if (h.x < L - 1 || h.x + h.w > R + 1 || h.y < T - 1 || h.y + h.h > Bt + 1) add('safe-area', h.el, `outside the safe area (${Math.round(h.x)},${Math.round(h.y)} ${Math.round(h.w)}x${Math.round(h.h)})`);
    for (const t of m.targets) if (!t.inDialog && !t.scrollable && vp.touch && (t.x < L - 1 || t.x + t.w > R + 1 || t.y + t.h > Bt + 1)) add('safe-area', t.el, 'interactive element inside the inset margin');
    // persistent HUD blocks must not sit on top of each other
    for (let i = 0; i < m.hud.length; i++) for (let j = i + 1; j < m.hud.length; j++) {
      const a = m.hud[i], b = m.hud[j];
      if (['banner', 'tutorial-card'].some((k) => a.el.includes(k) || b.el.includes(k))) continue;
      const inside = (p: any, q: any) => p.x >= q.x - 1 && p.y >= q.y - 1 && p.x + p.w <= q.x + q.w + 1 && p.y + p.h <= q.y + q.h + 1;
      if (inside(a, b) || inside(b, a)) continue; // a block nested in another one (the guided-start chip lives inside the status block)
      if (overlap(a, b)) add('hud-overlaps-hud', a.el, `overlaps ${b.el}`);
    }
  }
  if (opts.modal) {
    for (const d of m.dialogs) {
      if (d.x < -1 || d.y < -1 || d.x + d.w > m.vw + 1 || d.y + d.h > m.vh + 1) add('modal-fit', d.el, `panel ${Math.round(d.w)}x${Math.round(d.h)} at (${Math.round(d.x)},${Math.round(d.y)}) does not fit ${m.vw}x${m.vh}`);
      if (d.scrollH > d.clientH + 2 && !['auto', 'scroll'].includes(d.overflowY) && !['auto', 'scroll'].includes(d.outerScroll)) add('modal-scroll', d.el, `content ${d.scrollH} px in a ${d.clientH} px panel and it cannot scroll`);
    }
  }
  if (screensDir) { mkdirSync(screensDir, { recursive: true }); await page.screenshot({ path: path.join(screensDir, `${vp.name}_${screen}.png`), scale: 'css' }); }
}

/** Escape must close whatever is open; a modal that stays is a violation (and would make the next screen measure the wrong thing). */
async function closeModal(page: Page, vp: Viewport, screen: string) {
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const open = (await page.evaluate("Array.from(document.querySelectorAll('.fixed.inset-0, [role=dialog]')).filter((e) => e.getAttribute('aria-hidden') !== 'true' && !e.querySelector('canvas') && e.getBoundingClientRect().width > 0 && getComputedStyle(e).zIndex !== '100').length")) as number;
  if (open > 0) { violations.push({ viewport: vp.name, screen, rule: 'escape-closes', element: 'modal', detail: 'Escape did not close the window' }); await page.mouse.click(2, 2).catch(() => {}); }
}

async function main() {
  const dist = path.resolve('dist');
  if (!existsSync(path.join(dist, 'index.html'))) throw new Error('dist/ missing - run `npm run build` first');
  const dir = mkdtempSync(path.join(tmpdir(), 'treadfront-layout-'));
  const port = await freePort();
  const server = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, PORT: String(port), DB_PATH: path.join(dir, 'l.db'), STATIC_DIR: dist, LOAD_TEST: '1', LOG_QUIET: '1', ADMIN_TOKEN: 'x' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = `http://127.0.0.1:${port}`;
  let browser;
  try {
    const t0 = Date.now();
    while (true) { try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not up yet */ } if (Date.now() - t0 > 30_000) throw new Error('server did not start'); await new Promise((r) => setTimeout(r, 200)); }
    browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.E2E_CHROMIUM || undefined });
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.touch ? 2 : 1, isMobile: vp.touch, hasTouch: vp.touch });
      const page = await ctx.newPage();
      await page.addInitScript(() => { try { localStorage.setItem('treadfront_lang', 'en'); } catch { /* ignore */ } });
      const inset = vp.insets;
      const applyInsets = () => page.addStyleTag({ content: `:root{--safe-top:${inset.top}px !important;--safe-right:${inset.right}px !important;--safe-bottom:${inset.bottom}px !important;--safe-left:${inset.left}px !important}` });
      await page.goto(base);
      await applyInsets();
      await check(page, vp, 'title');
      // worst-case HUD fixture (long names, 4 target statuses, 3 party members, cooldowns, notices, kill feed, events): normal and left-handed
      for (const variant of vp.touch ? ['', '&left=1'] : ['']) {
        const fx = await ctx.newPage();
        await fx.goto(`${base}/#/hud-fixture?x=1${variant}`); await fx.reload();
        await fx.addStyleTag({ content: `:root{--safe-top:${inset.top}px !important;--safe-right:${inset.right}px !important;--safe-bottom:${inset.bottom}px !important;--safe-left:${inset.left}px !important}` });
        await fx.getByTestId('hud-fixture').waitFor({ timeout: 15_000 }); await fx.waitForTimeout(500);
        await check(fx, vp, `hud-fixture${variant ? '-left' : ''}`);
        if (!variant) { // interaction: abilities send commands, the chat ticker expands, the bell opens the history
          const bad = (m: string) => violations.push({ viewport: vp.name, screen: 'hud-fixture', rule: 'hud-interaction', element: 'hud', detail: m });
          await fx.getByRole('button', { name: /^Repair kit$/ }).first().click({ force: true }).catch(() => bad('repair kit button not clickable'));
          const cmds = (await fx.evaluate('window.__cmds || []')) as string[];
          if (!cmds.includes('UseAbility')) bad(`clicking an ability should send UseAbility, got ${JSON.stringify(cmds)}`);
          await fx.getByRole('button', { name: /^Chat/ }).first().click(); await fx.waitForTimeout(150);
          if (!(await fx.getByTestId('chat-open').count())) bad('the chat ticker should expand on tap');
          await fx.keyboard.press('Escape');
          await fx.getByRole('button', { name: /^Notifications$/ }).first().click({ force: true }); await fx.waitForTimeout(250);
          if (!(await fx.locator('[data-window=notifications]').count())) bad('the bell should open the notification history');
        }
        await fx.close();
      }
      await page.getByLabel('I am at least 13 years old.').check({ timeout: 15_000 }).catch(async () => { await page.locator('input[type=checkbox]').first().check(); });
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await page.getByRole('button', { name: /DEPLOY TO BATTLEFIELD/ }).click({ timeout: 20_000 });
      await page.locator('canvas').first().waitFor({ timeout: 15_000 });
      await page.getByRole('button', { name: /^Inventory & Loadout$/ }).waitFor({ timeout: 15_000 });
      await applyInsets();
      await page.waitForTimeout(1500);
      await check(page, vp, 'game');

      // chat open: the input must not cover the controls
      const chatBtn = page.getByRole('button', { name: /^Chat/ });
      if (await chatBtn.count()) { await chatBtn.first().click(); await page.waitForTimeout(150); await check(page, vp, 'game-chat-open'); await page.keyboard.press('Escape'); }

      // modals
      const modals: Array<[string, RegExp | string]> = [['inventory', /^Inventory & Loadout$/], ['quests', /^Quests$/], ['social', /^Social$/], ['worldmap', /^World Map$/], ['garage', /^Garage/], ['howto', /^How to play$/]];
      for (const [name, title] of modals) {
        const btn = page.getByRole('button', { name: title });
        if (!(await btn.count())) continue;
        await btn.first().click({ force: true }).catch(() => {});
        await page.waitForTimeout(400);
        await check(page, vp, `modal-${name}`, { modal: true });
        await closeModal(page, vp, `modal-${name}`);
      }
      // window manager: shortcuts toggle, stacking, Escape closes only the top window, help overlay, drag (desktop) / sheet (phone)
      {
        const wm = (msg: string) => violations.push({ viewport: vp.name, screen: 'windows', rule: 'window-manager', element: 'wm', detail: msg });
        const openIds = async () => (await page.evaluate("Array.from(document.querySelectorAll('[data-window]')).map((e) => e.getAttribute('data-window')).join(',')")) as string;
        await page.keyboard.press('KeyI'); await page.keyboard.press('KeyJ'); await page.waitForTimeout(250);
        if ((await openIds()) !== 'inventory,quests' && (await openIds()) !== 'quests,inventory') wm(`I and J should open two windows, found "${await openIds()}"`);
        await page.keyboard.press('Escape'); await page.waitForTimeout(150);
        if ((await openIds()) !== 'inventory') wm(`Escape should close only the top window, found "${await openIds()}"`);
        if (vp.touch) {
          const box = (await page.evaluate("(() => { const r = document.querySelector('[data-window=inventory]').getBoundingClientRect(); return [r.width, r.height]; })()")) as number[];
          if (box[0] < vp.width - 2 || box[1] < vp.height - 2) wm(`on a phone a window must be a full-screen sheet, it is ${Math.round(box[0])}x${Math.round(box[1])}`);
        } else {
          const head = page.locator('[data-window=inventory] header').first(); const hb = await head.boundingBox();
          if (hb) { await page.mouse.move(hb.x + 60, hb.y + 12); await page.mouse.down(); await page.mouse.move(hb.x + 160, hb.y + 62, { steps: 5 }); await page.mouse.up(); }
          const pos = (await page.evaluate("JSON.parse(localStorage.getItem('treadfront_win_pos') || '{}').inventory")) as { dx: number; dy: number } | undefined;
          if (!pos || Math.abs(pos.dx - 100) > 4 || Math.abs(pos.dy - 50) > 4) wm(`dragging the header by (100,50) should be remembered, stored ${JSON.stringify(pos)}`);
          await page.evaluate("localStorage.removeItem('treadfront_win_pos')");
        }
        await page.keyboard.press('Escape'); await page.waitForTimeout(150);
        if (await openIds()) wm(`everything should be closed, found "${await openIds()}"`);
        await page.keyboard.press('Shift+Slash'); await page.waitForTimeout(250);
        if ((await openIds()) !== 'shortcuts') wm(`? should open the shortcut help, found "${await openIds()}"`); else await check(page, vp, 'modal-shortcuts', { modal: true });
        await closeModal(page, vp, 'modal-shortcuts');
      }
      // settings via the HUD gear, if there is one
      const gear = page.getByRole('button', { name: /^Settings$/ });
      if (await gear.count()) {
        await gear.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(300);
        await check(page, vp, 'modal-settings', { modal: true });
        // zoom setting is written to the profile
        const slider = page.locator('input[type=range]').nth(1);
        if (await slider.count()) {
          await slider.fill('0.6');
          const z = await page.evaluate(`JSON.parse(localStorage.getItem('treadfront_save_v1') || '{}').settings?.zoom`);
          if (z !== 0.6) violations.push({ viewport: vp.name, screen: 'modal-settings', rule: 'zoom-setting', element: 'zoom slider', detail: `profile zoom is ${z}, expected 0.6` });
        }
        await closeModal(page, vp, 'modal-settings');
      }
      // left-handed layout and performance mode (settings toggles): controls swap sides, the DPR cap drops to 1.5
      if (vp.touch && (await page.getByRole('button', { name: /^Settings$/ }).count())) {
        const toggle = async (label: string) => { await page.getByRole('button', { name: /^Settings$/ }).first().click({ force: true }); await page.waitForTimeout(200); await page.getByRole('button', { name: label }).first().evaluate((el) => (el as HTMLElement).click()).catch(() => {}); };
        const canvasRatio = async () => (await page.evaluate("(() => { const c = document.querySelector('canvas'); return c.width / window.innerWidth; })()")) as number;
        const before = await canvasRatio();
        // the toggle rows are buttons named ON/OFF right after their title: click by the row text
        await page.getByRole('button', { name: /^Settings$/ }).first().click({ force: true }); await page.waitForTimeout(200);
        await page.locator('div:has(> div > span:text-is("Left-handed controls")) button').first().click();
        await page.locator('div:has(> div > span:text-is("Performance mode")) button').first().click();
        await closeModal(page, vp, 'modal-settings');
        await page.waitForTimeout(400);
        await check(page, vp, 'game-left-handed-performance');
        const sides = (await page.evaluate("(() => { const j = document.querySelector('[data-ui=joystick] > div').getBoundingClientRect(); const f = document.querySelector('[data-ui=fire]').getBoundingClientRect(); return [j.left, f.left]; })()")) as number[];
        if (!(sides[0] > sides[1])) violations.push({ viewport: vp.name, screen: 'game-left-handed-performance', rule: 'left-handed', element: 'joystick', detail: `joystick (x=${Math.round(sides[0])}) is not right of the fire cluster (x=${Math.round(sides[1])})` });
        const after = await canvasRatio();
        if (!(after <= 1.51 && before > 1.9)) violations.push({ viewport: vp.name, screen: 'game', rule: 'performance-mode', element: 'canvas', detail: `canvas/CSS pixel ratio ${before.toFixed(2)} -> ${after.toFixed(2)}, expected 2 -> 1.5` });
        void toggle;
      }
      // pinch zoom on the canvas (two pointers moving apart changes the stored zoom)
      if (vp.touch) {
        await page.evaluate(`(() => { const c = document.querySelector('canvas'); const ev = (t, id, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 })); ev('pointerdown', 1, 300, 200); ev('pointerdown', 2, 360, 200); for (let i = 1; i <= 10; i++) { ev('pointermove', 2, 360 + i * 12, 200); } ev('pointerup', 2, 480, 200); ev('pointerup', 1, 300, 200); })()`);
        await page.waitForTimeout(200);
        const z2 = await page.evaluate(`JSON.parse(localStorage.getItem('treadfront_save_v1') || '{}').settings?.zoom`);
        if (typeof z2 !== 'number' || Math.abs(z2 - 0.6) < 0.01) violations.push({ viewport: vp.name, screen: 'game', rule: 'pinch-zoom', element: 'canvas', detail: `zoom stayed ${z2} after a pinch gesture` });
      }
      await ctx.close();
    }
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  }
}

main().then(() => {
  if (!violations.length) { console.log('LAYOUT CHECK OK: no violations'); process.exit(0); }
  const byRule = new Map<string, number>();
  for (const v of violations) byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);
  console.log(`LAYOUT CHECK: ${violations.length} violation(s)  (${[...byRule].map(([r, n]) => `${r}: ${n}`).join(', ')})`);
  for (const v of violations) console.log(`  [${v.viewport}] ${v.screen} / ${v.rule}: ${v.element} - ${v.detail}`);
  process.exit(reportOnly ? 0 : 1);
}, (e) => { console.error(e.message ?? e); process.exit(2); });
