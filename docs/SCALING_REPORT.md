# Server scaling spike (second cloud run, task 10)

Question: snapshot building and sending is about half of the server CPU under load. What is the cheapest change that gives a clear gain?
Result: **one change kept** (a memory leak and GC stall in the delta encoder cache), **400 clustered bots: average tick 28.0 ms -> 16.4 ms (-41 %)**, worst tick 4.5 s -> 0.09 s, and the server keeps 30 Hz where it used to fall to 24 Hz. No worker threads or process split were needed.

## How it was measured

| Tool | What it does |
|---|---|
| `npm run scaling -- --bots 400 --mode clustered --seconds 60 --warmup 15` | Starts the real server (own process, temp DB, `LOAD_TEST=1`) and the bots in separate processes (100 bots each), waits until everybody joined, **excludes the warm-up**, then reads the server's own tick statistics for the window (`GET /admin/api/tickstats?reset=1`). |
| `npx tsx scripts/snapshot-bench.ts --bots 400 --mode clustered` | In-process: the real `GameServer` with N sessions on fake sockets. No network, no bot processes, so it measures only server CPU per tick and is repeatable (used for the quick A/B steps and the heap check, run it with `node --expose-gc --import tsx` to get `heapMB`). |
| `--prof DIR` (scaling) + `npx tsx scripts/cpuprofile-top.ts FILE` | V8 CPU profile of the server and a self-time table. |

Scenarios: `clustered` = all bots on one map near the spawn point (everybody sees everybody: worst case for snapshot size, think of the hub), 100 per instance; `spread` = bots rotate over the three home maps and wander. 60 s measured after 15 s warm-up. The test machine has 4 cores shared by the server and the bot processes, so the absolute numbers are higher than on an idle machine; compare rows with each other.

## Before / after (real sockets, separate bot processes)

| bots | mode | avg ms | p50 | p95 | p99 | max | busy % | ticks per 60 s (1800 = 30 Hz) | kB/s out |
|---|---|---|---|---|---|---|---|---|---|
| 200 | clustered (before) | 9.4 | 1.6 | 29.1 | 41.9 | 75.1 | 27.6 | 1772 | 19443 |
| 200 | clustered (after) | 8.0 | 1.6 | 22.8 | 34.0 | 46.3 | 23.9 | 1800 | 19438 |
| 200 | spread (before) | 11.9 | 3.0 | 34.6 | 47.6 | 147.0 | 35.3 | 1774 | 2975 |
| 200 | spread (after) | 10.1 | 2.6 | 28.1 | 38.8 | 51.6 | 30.3 | 1801 | 2982 |
| **400** | **clustered (before)** | **28.0** | 9.7 | 62.0 | 85.1 | **4457** | 67 | 1440 | 31145 |
| **400** | **clustered (after)** | **16.4** | 4.2 | 48.1 | 59.0 | **91.5** | 49.2 | 1801 | 39338 |
| 400 | spread (before) | 32.4 | 12.0 | 59.7 | 77.5 | 4778 | 72.8 | 1411 | 6309 |
| 400 | spread (after) | 21.6 | 8.4 | 55.7 | 75.2 | 109.8 | 64.8 | 1800 | 7688 |

Change in the average tick: 200 clustered -15 %, 200 spread -15 %, **400 clustered -41 %**, 400 spread -33 %. (kB/s is higher after at 400 bots only because the server now really sends 30 Hz worth of snapshots instead of 24 Hz.)

In-process A/B, 400 clustered, 3 runs each (`snapshot-bench`):

| variant | avg ms | p95 | p99 | max |
|---|---|---|---|---|
| before | 14.5 | 34.8 | 44.2 | 2013 - 2084 |
| diff cache forward on the previous state (the fix) | 9.9 | 25.3 | 31.7 | 40 - 51 |
| + `for…in` in `compactEntity`, generation marks instead of a `Set` in `encode` | 9.7 | 24.5 | 33.5 | 38 - 48 |

## What was wrong

1. **A memory leak.** `shared/net/delta.ts` cached each `(prev -> cur)` diff in a `WeakMap` keyed by `cur` whose value was a `Map` keyed by `prev`. The newest state of an entity therefore kept every older state of it alive: heap after a forced GC with 100 clustered players grew **0.2 GB after 600 ticks and 0.6-0.7 GB after 2400 ticks (linear, ~0.3 MB per tick)**; with the fix it stays at 15 - 20 MB. On the live server (few players) the rate is far lower, but it is not zero, and it explains some of the "ticks of 60 - 250 ms" that were blamed on host jitter.
2. **GC stalls.** With thousands of short-lived `WeakMap` keys per snapshot, V8's ephemeron handling plus the ever-growing heap caused single ticks of 2 - 4.5 s. The CPU profile at 400 clustered bots showed the garbage collector at **21 % of all CPU** (11.2 s of 53 s). After the fix it is 7 %, and `compactEntity` dropped from 5.8 % to 2.6 %.

The fix (kept): the diff cache is stored **on `prev`, pointing forward to the newer state** (symbol key, invisible to `Object.keys` and JSON), the JSON string of a patch is cached on the patch the same way (no second `WeakMap`), and two small allocation savers (`for…in` instead of `Object.entries`, a generation mark instead of a `Set` per client and snapshot). Same bytes on the wire, same patches, same client behaviour. `test/delta.test.ts` proves it: encode / apply round trip, one shared diff per `(prev, cur)`, and a `WeakRef` + `gc()` test that fails on the old code ("oldest state is still referenced by the newest one").

## CPU profile at 400 clustered bots (self time, whole process)

| | before | after |
|---|---|---|
| idle | 30.4 % | 46.5 % |
| garbage collector | **21.0 %** | 7.0 % |
| `writev` (socket writes) | 7.5 % | 8.1 % |
| `sendSnapshots` | 5.9 % | 6.6 % |
| `compactEntity` | 5.8 % | 2.6 % |
| `encode` / `diffEntity` / `computeDiff` | 4.5 / 3.6 / 3.0 % | 4.4 / 3.0 / 2.6 % |
| `updatePhysicsAndCollisions` + `stepWorld` | 5.1 % | 5.4 % |

## What is left, and what was deliberately not done

* **Bandwidth is the next wall.** 400 clustered bots receive ~39 MB/s (about 9 kB per snapshot per client). `writev` is now the biggest single item. Ideas, in order of expected gain per risk: a compact binary or key-shortened patch format (breaking protocol change), sending far/low-priority entities at 5 Hz, a per-instance adaptive snapshot rate when an instance has more than ~60 players. None of these is needed for the current player count.
* **The simulation** is now 30 - 40 % of the tick in the spread scenario (6.3 ms avg at 400 bots): 100 players per instance means pairwise checks in `updatePhysicsAndCollisions`; a spatial grid there would be the next target, but it touches the shared deterministic sim and must be verified with the determinism tests.
* **Worker threads / one process per map group** (options 2 and 3 of the task) were not tried: the first change already gave -41 % at the worst case, and both need a protocol between sim and I/O threads plus careful handling of sessions that move between maps. Revisit when the in-process bench shows more than ~60 % real-time load.
* The measurement noise is about ±5 % between identical runs of the in-process bench; the real-socket numbers were taken once per cell.

## Deploying this

The change is in `shared/net/delta.ts` and `server/gameServer.ts` only; no protocol, data or database change. After the deploy watch `treadfront_tick_ms_max` in `/metrics` (it should stay far below 100 ms) and the process memory (should be flat instead of creeping up).
