import { createRealGame } from '../packages/headless/src/real-game/index.ts';
const id = process.argv[2] ?? 'pro_2026'; const n = Number(process.argv[3] ?? 40);
const g = createRealGame(id);
const t0 = performance.now();
for (let i = 0; i < n; i++) g.simulate(g.input(i, (0x1000 + i).toString(16).padStart(16, '0')));
const ms = (performance.now() - t0) / n;
console.log(JSON.stringify({ id, n, msPerGame: +ms.toFixed(1), rssMB: Math.round(process.memoryUsage().rss / 1e6) }));
