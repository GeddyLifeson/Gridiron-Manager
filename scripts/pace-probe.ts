// Pace probe: the same snap-to-snap measurements taken from nflverse and cfbfastR, taken from real games of the engine.
// Usage: npx tsx scripts/pace-probe.ts <ruleSetId> [games] [name=value ...parameter overrides]
import { createRealGame } from '../packages/headless/src/real-game/index.ts';

const rulesId = process.argv[2] ?? 'pro_2026';
const games = Number(process.argv[3] ?? '50');
const overrides: Record<string, number> = {};
for (const a of process.argv.slice(4)) { const [k, v] = a.split('='); overrides[k!] = Number(v); }
const game = createRealGame(rulesId, { paramOverrides: overrides });

const acc: Record<string, number[]> = {};
const add = (k: string, v: number) => { (acc[k] ??= []).push(v); };
let plays = 0, kneels = 0, points = 0, noHuddle = 0, delay = 0, missed = 0, calls = 0, timeouts = 0, drives = 0;
for (let i = 0; i < games; i++) {
  const inp = game.input(i, (BigInt(i) * 0x9e3779b97f4a7c15n + 1n & 0xffffffffffffffffn).toString(16).padStart(16, '0'));
  const res = game.simulate(inp);
  points += res.final.score[0] + res.final.score[1];
  // Clock by reason, and the play clock when each call window opens.
  let lastType = '';
  for (const e of res.events) {
    if (e.type === 'clock_advanced') add(`advance.${e.reason}`, e.tenths / 10);
    if (e.type === 'decision_requested' && e.request.type === 'snapping_call') { calls++; add('callWindow.deadlineS', (e.request.deadlinePlayClockTenths ?? 0) / 10); }
    if (e.type === 'deadline_missed') missed++;
    if (e.type === 'timeout_charged' && e.kind === 'team') timeouts++;
    if (e.type === 'drive_ended') drives++;
    lastType = e.type;
  }
  void lastType;
  const recs = res.records;
  for (let j = 0; j < recs.length; j++) {
    const r = recs[j]!;
    const c = r.calls.snapping;
    if (r.situation.playKind !== 'scrimmage' || c.unit !== 'offense') continue;
    for (const f of r.called.fouls) if (f.foulId === 'delay_of_game') delay++;
    if (r.final.noPlay) continue;
    if (c.kind === 'kneel' || c.kind === 'spike') { kneels++; continue; }
    plays++;
    if (c.tempo !== 'huddle') noHuddle++;
    add('live.all', r.truth.liveDurationTenths / 10);
    const pass = c.kind !== 'run';
    add(pass ? 'live.pass' : 'live.run', r.truth.liveDurationTenths / 10);
    const n = recs[j + 1];
    if (!n || n.situation.playKind !== 'scrimmage' || n.calls.snapping.unit !== 'offense' || n.situation.offense !== r.situation.offense || n.situation.period !== r.situation.period) continue;
    if (r.final.enforcement !== null || n.final.noPlay) continue;
    const nk = n.calls.snapping; if (nk.unit !== 'offense' || nk.kind === 'kneel' || nk.kind === 'spike') continue;
    const gap = (r.situation.clockTenths - n.situation.clockTenths) / 10;
    if (gap < 0 || gap > 60) continue;
    if (r.situation.period <= 3) {
      add(pass ? 'gap.afterPass.q1to3' : 'gap.afterRun.q1to3', gap);
      if (!r.final.incomplete && !r.final.endedOutOfBounds) {
        add('gap.inBounds.q1to3', gap);
        // The neutral rows leave out the last two minutes of the half, as the real-data rows do.
        if (!(r.situation.period === 2 && r.situation.clockTenths <= 1200)) {
          add('gap.neutral', gap);
          add(nk.tempo === 'huddle' ? 'gap.neutral.nextHuddle' : 'gap.neutral.nextNoHuddle', gap);
        } else if (nk.tempo === 'hurry_up') add('gap.lastTwoMinutes.nextHurryUp', gap);
      }
    }
  }
}
const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
console.log(`${rulesId}: ${games} games; scrimmage plays per game ${(plays / games).toFixed(1)} (per team ${(plays / games / 2).toFixed(1)}); kneels+spikes ${(kneels / games).toFixed(2)}; points ${(points / games).toFixed(1)}; no-huddle share ${(noHuddle / plays).toFixed(3)}; delay of game per game ${(delay / games).toFixed(2)}; timeouts per game ${(timeouts / games).toFixed(2)}; drives per team ${(drives / games / 2).toFixed(2)}; missed deadlines ${missed} of ${calls} call windows`);
for (const k of Object.keys(acc).sort()) {
  const xs = acc[k]!.sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`${k.padEnd(34)} n=${String(xs.length).padStart(6)} mean=${mean.toFixed(2)} p5=${q(xs, 0.05)} p25=${q(xs, 0.25)} p50=${q(xs, 0.5)} p75=${q(xs, 0.75)} p95=${q(xs, 0.95)}`);
}
