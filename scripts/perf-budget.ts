/**
 * Bundle size budget for the production build (run after `vite build`; `npm run budget` does both).
 * Gzip sizes of the files index.html loads at start (the entry), all JavaScript together, and the CSS. Lazy chunks (gallery,
 * HUD fixture) do not count against the entry budget. Override limits with BUDGET_ENTRY_KB / BUDGET_TOTAL_KB / BUDGET_CSS_KB.
 * The first-render time budget lives in scripts/e2e.ts (needs a browser).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMITS = { entryKb: Number(process.env.BUDGET_ENTRY_KB || 330), totalKb: Number(process.env.BUDGET_TOTAL_KB || 360), cssKb: Number(process.env.BUDGET_CSS_KB || 24) };
const dist = path.resolve('dist');
if (!existsSync(path.join(dist, 'index.html'))) { console.error('dist/ missing - run `npm run build` first'); process.exit(1); }
const gz = (f: string) => gzipSync(readFileSync(f), { level: 9 }).length / 1024;
const assets = readdirSync(path.join(dist, 'assets')).map((n) => path.join(dist, 'assets', n));
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
const inEntry = (f: string) => html.includes(`/assets/${path.basename(f)}`);

const js = assets.filter((f) => f.endsWith('.js')); const css = assets.filter((f) => f.endsWith('.css'));
const entryJs = js.filter(inEntry).reduce((a, f) => a + gz(f), 0);
const totalJs = js.reduce((a, f) => a + gz(f), 0);
const cssKb = css.reduce((a, f) => a + gz(f), 0);
const rows: Array<[string, number, number]> = [['entry JS (gzip)', entryJs, LIMITS.entryKb], ['all JS (gzip)', totalJs, LIMITS.totalKb], ['CSS (gzip)', cssKb, LIMITS.cssKb]];
let fail = false;
for (const [name, v, lim] of rows) { const ok = v <= lim; if (!ok) fail = true; console.log(`${ok ? 'ok  ' : 'OVER'} ${name.padEnd(18)} ${v.toFixed(1).padStart(7)} KB  (limit ${lim} KB)`); }
const biggest = js.map((f) => [path.basename(f), gz(f)] as const).sort((a, b) => b[1] - a[1]).slice(0, 3);
console.log('largest chunks:', biggest.map(([n, s]) => `${n} ${s.toFixed(0)} KB`).join(', '));
if (fail) { console.error('PERF BUDGET EXCEEDED'); process.exit(1); }
console.log('PERF BUDGET OK');
