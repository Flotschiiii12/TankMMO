/**
 * Server scaling benchmark (second cloud run, task 10).
 *   npm run scaling -- --bots 400 --mode clustered --seconds 60 --warmup 15
 * Starts the real server (LOAD_TEST=1, temp database) in its own process and the bots in separate processes of up to
 * 100 bots each, waits until everybody joined, excludes the warm-up and prints the server's own tick statistics for the
 * measured window (avg / p50 / p95 / p99 / max tick, busy %, bytes out per second, time per phase).
 *   --label NAME   tag for the result line      --out FILE   append the JSON result to FILE
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

const arg = (name: string, def: string): string => { const i = process.argv.indexOf(`--${name}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const BOTS = Number(arg('bots', '200'));
const MODE = arg('mode', 'spread');
const SECONDS = Number(arg('seconds', '60'));
const WARMUP = Number(arg('warmup', '15'));
const LABEL = arg('label', 'baseline');
const OUT = arg('out', '');
const PROF = arg('prof', ''); // directory: run the server with --cpu-prof and write the profile there
const PER_PROCESS = 100;
const TOKEN = 'bench-token';

const freePort = (): Promise<number> => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); }); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(path.join(tmpdir(), 'treadfront-bench-'));
const children: ChildProcess[] = [];
const kill = () => { for (const c of children) c.kill('SIGKILL'); try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } };
process.on('exit', kill);

const serverArgs = PROF ? ['--cpu-prof', `--cpu-prof-dir=${PROF}`, '--import', 'tsx', 'server/index.ts'] : ['tsx', 'server/index.ts'];
const server = spawn(PROF ? 'node' : 'npx', serverArgs, { env: { ...process.env, PORT: String(port), LOAD_TEST: '1', DB_PATH: path.join(dir, 'bench.db'), ADMIN_TOKEN: TOKEN, STATIC_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
children.push(server);
server.stderr?.on('data', (d) => { const t = String(d); if (!/ExperimentalWarning|trace-warnings/.test(t)) process.stderr.write(`[server] ${t}`); });
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${url}/health`)).ok) break; } catch { /* not up yet */ } await sleep(300); }

const totalSeconds = WARMUP + SECONDS + 40; // bots keep running until we kill them
const botResults: string[] = [];
for (let off = 0; off < BOTS; off += PER_PROCESS) {
  const n = Math.min(PER_PROCESS, BOTS - off);
  const p = spawn('npx', ['tsx', 'scripts/bots.ts', '--count', String(n), '--seconds', String(totalSeconds), '--url', url, '--mode', MODE, '--offset', String(off), '--json'], { stdio: ['ignore', 'pipe', 'inherit'] });
  p.stdout?.on('data', (d) => botResults.push(String(d)));
  children.push(p);
}

const admin = async (p: string) => (await (await fetch(`${url}/admin/api/${p}`, { headers: { 'x-admin-token': TOKEN } })).json()) as any;
let players = 0;
for (let i = 0; i < 180 && players < BOTS * 0.98; i++) { await sleep(1000); players = ((await (await fetch(`${url}/health`)).json()) as any).players; }
console.error(`joined ${players}/${BOTS}, warming up ${WARMUP}s...`);
await sleep(WARMUP * 1000);
await admin('tickstats?reset=1');
await sleep(SECONDS * 1000);
const stats = await admin('tickstats');
const info = await admin('stats');
const result = { label: LABEL, bots: BOTS, mode: MODE, joined: players, instances: info.instances.length, ...stats };
console.log(JSON.stringify(result));
if (OUT) appendFileSync(OUT, JSON.stringify(result) + '\n');
if (PROF) { server.kill('SIGINT'); await new Promise((r) => server.once('exit', r)); }
kill();
process.exit(0);
