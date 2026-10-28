/** Longer fuzz run: `npm run fuzz -- --seconds 120 [--seed 1] [--clients 4]`. Exits 1 on the first violation and prints the seed. */
import { runFuzz } from './fuzzLib.ts';

const arg = (name: string, def: number): number => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? Number(process.argv[i + 1]) : def; };
const seconds = arg('seconds', 60); let seed = arg('seed', Date.now() % 100000); const clients = arg('clients', 4);
const end = Date.now() + seconds * 1000; let rounds = 0, sent = 0;
while (Date.now() < end) {
  const r = await runFuzz({ seed, clients, framesPerClient: 1500 });
  rounds++; sent += r.sent;
  console.log(`seed ${seed}: sent ${r.sent}, ok ${r.okResults}, rejected ${r.errResults}, reconnects ${r.reconnects}, violations ${r.violations.length}, uncaught ${r.uncaught.length}`);
  if (r.violations.length || r.uncaught.length) { console.error([...r.violations, ...r.uncaught].join('\n')); console.error(`FAILED - reproduce with: npm run fuzz -- --seed ${seed} --seconds 1`); process.exit(1); }
  seed++;
}
console.log(`fuzz OK: ${rounds} rounds, ${sent} frames`);
process.exit(0);
