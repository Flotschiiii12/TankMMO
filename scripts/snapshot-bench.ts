/**
 * In-process tick benchmark: the real GameServer with N sessions on fake sockets (no network, no bot processes), so the
 * numbers are the server's own CPU per tick and are not disturbed by the machine running the bots.
 *   npx tsx scripts/snapshot-bench.ts --bots 400 --mode clustered --ticks 1200 --warm 300 [--label x] [--out file]
 * `clustered`: every bot stays near the spawn point of one map (worst case for snapshot size, e.g. the hub);
 * `spread`: bots start on the 3 home maps and wander.
 */
import { appendFileSync } from 'node:fs';
import { createApp } from '../server/app.ts';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';

process.env.LOAD_TEST = '1';
const arg = (name: string, def: string): string => { const i = process.argv.indexOf(`--${name}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const BOTS = Number(arg('bots', '400'));
const MODE = arg('mode', 'clustered');
const TICKS = Number(arg('ticks', '1200'));
const WARM = Number(arg('warm', '300'));
const LABEL = arg('label', 'run');
const OUT = arg('out', '');

let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const ctx = createApp({ adminToken: 'x' });
const game = ctx.game as any;
let bytes = 0; let messages = 0;
const makeWs = () => ({ readyState: 1, bufferedAmount: 0, send(d: string) { bytes += d.length; messages++; }, close() {}, on() {}, ping() {} });

const sessions: any[] = [];
for (let i = 0; i < BOTS; i++) {
  const faction = MODE === 'clustered' ? 'coastal' : (['coastal', 'highland', 'steppe'] as const)[i % 3];
  const g = ctx.service.createGuest(true, faction);
  if (!g.ok) throw new Error('guest');
  const [accountId, secret] = g.cred.credential.split('.');
  const s = game.handleJoin(makeWs(), { type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId, secret }, `10.0.${i >> 8}.${i & 255}`);
  if (!s) throw new Error('join failed');
  sessions.push(s);
}

let seq = 0;
const drive = () => {
  seq++;
  for (const s of sessions) {
    if (rnd() > 0.35) continue; // bots send ~10 inputs/s
    const e = s.instance.world.entities.get(s.entityId);
    let a = rnd() * Math.PI * 2;
    if (MODE === 'clustered' && e) { const dx = 2000 - e.pos.x, dy = 2000 - e.pos.y; if (Math.hypot(dx, dy) > 250) a = Math.atan2(dy, dx); }
    s.pending.push({ type: 'Drive', x: Math.cos(a), y: Math.sin(a) });
    if (rnd() < 0.03) {
      const foes = [...s.instance.world.entities.values()].filter((x: any) => x.isHostile && x.hull > 0 && x.kind !== 'gate');
      if (foes.length) s.pending.push({ type: 'SetTarget', targetId: foes[Math.floor(rnd() * foes.length)].id }, { type: 'ToggleAutoFire' });
    }
  }
};

for (let t = 0; t < WARM; t++) { drive(); game.stepAll(); }
game.resetTickWindow();
bytes = 0; messages = 0;
(globalThis as any).gc?.();
const mem0 = process.memoryUsage().heapUsed;
const t0 = performance.now();
for (let t = 0; t < TICKS; t++) { drive(); game.stepAll(); }
const wall = (performance.now() - t0) / 1000;
const st = game.tickWindowStats();
const simSeconds = TICKS / 30;
const result = {
  label: LABEL, bots: BOTS, mode: MODE, instances: game.instanceInfo().length, ticks: TICKS,
  avgMs: +st.avgMs.toFixed(3), p50Ms: +st.p50Ms.toFixed(3), p95Ms: +st.p95Ms.toFixed(3), p99Ms: +st.p99Ms.toFixed(3), maxMs: +st.maxMs.toFixed(2),
  realtimeLoadPercent: +((wall / simSeconds) * 100).toFixed(1), kbPerSecOut: Math.round(bytes / 1024 / simSeconds), msgsPerSec: Math.round(messages / simSeconds),
  heapMB: { before: Math.round(mem0 / 1048576), after: Math.round((((globalThis as any).gc?.()), process.memoryUsage().heapUsed) / 1048576) }, // needs node --expose-gc
  avgPhaseMs: st.avgPhaseMs,
};
console.log(JSON.stringify(result));
if (OUT) appendFileSync(OUT, JSON.stringify(result) + '\n');
process.exit(0);
