/**
 * Load test: N headless bots against a running server.
 *   npm run bots -- --count 200 --seconds 30 --url http://127.0.0.1:3000
 * Each bot creates a guest account, joins, drives in random directions, targets and fires.
 */
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '../shared/protocol.ts';

const arg = (name: string, def: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const COUNT = Number(arg('count', '50'));
const SECONDS = Number(arg('seconds', '20'));
const URL = arg('url', 'http://127.0.0.1:3000');
const WS_URL = URL.replace(/^http/, 'ws') + '/ws';

let connected = 0, messages = 0, bytes = 0, errors = 0, kicked = 0;
const latencies: number[] = [];

async function bot(i: number): Promise<() => void> {
  const r = await fetch(`${URL}/api/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ageConfirmed: true }) });
  if (!r.ok) { errors++; return () => {}; }
  const { credential } = (await r.json()) as { credential: string };
  const [accountId, secret] = credential.split('.');
  const ws = new WebSocket(WS_URL);
  let seq = 0;
  let timer: NodeJS.Timeout | undefined;
  let entities = new Map<number, any>();
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'c_join', protocolVersion: PROTOCOL_VERSION, accountId, secret }));
    timer = setInterval(() => {
      const a = Math.random() * Math.PI * 2;
      const cmds: any[] = [{ type: 'Drive', x: Math.cos(a), y: Math.sin(a) }];
      if (Math.random() < 0.2) {
        const foes = [...entities.values()].filter((e) => e.isHostile && e.hull > 0 && e.kind !== 'gate');
        if (foes.length) cmds.push({ type: 'SetTarget', targetId: foes[Math.floor(Math.random() * foes.length)].id }, { type: 'ToggleAutoFire' });
      }
      ws.send(JSON.stringify({ type: 'c_input', seq: ++seq, commands: cmds, clientTime: Date.now() }));
      if (seq % 10 === 0) ws.send(JSON.stringify({ type: 'c_ping', timestamp: Date.now() }));
    }, 100 + Math.random() * 100);
  });
  ws.on('message', (d) => {
    messages++; bytes += (d as Buffer).length;
    const m = JSON.parse(d.toString());
    if (m.type === 's_map') { connected++; entities = new Map(); }
    else if (m.type === 's_state') { for (const p of m.patches) { if (p.full) entities.set(p.id, p.full); else if (entities.has(p.id)) Object.assign(entities.get(p.id), p.d); } for (const id of m.removed) entities.delete(id); }
    else if (m.type === 's_pong') latencies.push(Date.now() - m.originalTimestamp);
  });
  ws.on('close', () => { kicked++; });
  ws.on('error', () => { errors++; });
  return () => { if (timer) clearInterval(timer); ws.close(); };
}

const stops: Array<() => void> = [];
console.log(`Starting ${COUNT} bots against ${URL} for ${SECONDS}s`);
for (let i = 0; i < COUNT; i++) {
  stops.push(await bot(i));
  if (i % 20 === 19) await new Promise((r) => setTimeout(r, 200));
}
await new Promise((r) => setTimeout(r, SECONDS * 1000));
latencies.sort((a, b) => a - b);
const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;
console.log(JSON.stringify({ bots: COUNT, joined: connected, errors, disconnected: kicked, messages, kbPerSecPerBot: Math.round(bytes / 1024 / SECONDS / Math.max(1, connected) * 10) / 10, pingMs: { p50: pct(0.5), p95: pct(0.95), max: latencies[latencies.length - 1] ?? 0 } }, null, 2));
const m = await (await fetch(`${URL}/metrics`)).text();
console.log(m.split('\n').filter((l) => l.startsWith('treadfront_tick') || l.startsWith('treadfront_players') || l.includes('instance')).join('\n'));
stops.forEach((s) => s());
process.exit(0);
