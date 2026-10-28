/** Prints the functions with the most self time of a V8 .cpuprofile:  npx tsx scripts/cpuprofile-top.ts FILE [N] */
import { readFileSync } from 'node:fs';
const file = process.argv[2]; const top = Number(process.argv[3] ?? 25);
const prof = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map<number, any>(prof.nodes.map((n: any) => [n.id, n]));
const self = new Map<number, number>();
const dt: number[] = prof.timeDeltas;
prof.samples.forEach((id: number, i: number) => self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0)));
const agg = new Map<string, number>();
for (const [id, us] of self) { const n = byId.get(id); const f = n.callFrame; const key = `${f.functionName || '(anonymous)'}  ${f.url.replace(/^.*\/TankMMO\//, '').replace(/^file:\/\//, '')}:${f.lineNumber + 1}`; agg.set(key, (agg.get(key) ?? 0) + us); }
const total = [...agg.values()].reduce((a, b) => a + b, 0);
for (const [k, us] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${(us / 1000).toFixed(0).padStart(7)} ms  ${((us / total) * 100).toFixed(1).padStart(5)} %  ${k}`);
