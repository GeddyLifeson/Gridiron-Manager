// Violation log bench: a long history of rule-breaking acts at the off-screen recruiting rate, timed per
// season. Each act is a K2.8.2 decision (the cooldown read) and, on a yes, `commitAct`. Once a week the
// L8.2.5 pipeline runs (detection, false accusations, due cases), as the world's compliance step does.
// Prints ms per block of seasons and the live and archived log sizes, plus a digest of every event, case,
// record entry and order (the digest must match between a run that retires acts and one that does not).
//   npx tsx packages/league/test/compliance/tools/log-bench.ts [--seasons=60] [--acts=3000] [--block=10] [--weekly=1] [--hold=1]
// --hold=1 holds the log for the season's acts (as the recruiting pass does) when the code has `ownLog`.
// Runs unchanged on code from before log.ts (no ownLog, no archive), for the before numbers.
import { createHash } from 'node:crypto';
import * as compliance from '../../../src/compliance/index.ts';
import { D, META, MemorySink, PRO_VALUES, act, ctx, emptyCompliance, party, realStreams, ruleSet } from '../fixtures.ts';

const arg = (k: string, d: string): string => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const SEASONS = Number(arg('seasons', '60'));
const ACTS = Number(arg('acts', '3000'));
const BLOCK = Number(arg('block', '10'));
const WEEKLY = arg('weekly', '1') === '1';
const HOLD = arg('hold', '1') === '1';
const c = compliance as typeof compliance & { ownLog?: (s: compliance.ComplianceState) => compliance.ComplianceState; releaseLog?: (s: compliance.ComplianceState) => compliance.ComplianceState };

const pro = ruleSet(PRO_VALUES);
const sink = new MemorySink();
const conduct = realStreams(5, 'conduct');
const cx = ctx({ rules: pro, enforcement: realStreams(11, 'enforcement'), respond: () => compliance.aiResponse(40) });
const TEAMS = Array.from({ length: 130 }, (_, i) => i + 1);
const STAFF = 1300;
let s: compliance.ComplianceState = emptyCompliance();
let blockMs = 0;
const t0 = performance.now();
for (let k = 0; k < SEASONS; k++) {
  const year = 1900 + k;
  const t = performance.now();
  if (HOLD && c.ownLog) s = c.ownLog(s);
  for (let w = 0; w < 52; w++) {
    for (let i = 0; i < ACTS / 52; i++) {
      const n = w * 1000 + i;
      const person = 10_000 + ((n * 7919 + k * 31) % STAFF);
      const date = D(year, w * 7 + (i % 7));
      const d = compliance.decideViolation(s, { classId: 'tampering_players', gain: 1, pDetectPerceived: 0, penaltyPerceived: 0 },
        { personId: person, origin: 'generated', ruleRespectZ: -3, riskTolerance: 100, candor: 40, pressure: 1 }, date, conduct);
      if (!d.commit) continue;
      const team = 1 + (person % TEAMS.length);
      const r = compliance.commitAct(s, act({ classId: 'tampering_players', actor: party(person, 'general_manager', team), knew: [person + 50_000], date }), pro, sink);
      if (r.ok) s = r.state;
    }
    if (WEEKLY) {
      if (HOLD && c.releaseLog) s = c.releaseLog(s);
      s = compliance.complianceWeek(s, D(year, w * 7), TEAMS, cx, sink, META);
      if (HOLD && c.ownLog) s = c.ownLog(s);
    }
  }
  if (HOLD && c.releaseLog) s = c.releaseLog(s);
  blockMs += performance.now() - t;
  if ((k + 1) % BLOCK === 0 || k === SEASONS - 1) {
    const archived = (s as { archive?: { rows: readonly (readonly unknown[])[] } }).archive?.rows.reduce((a, x) => a + x.length, 0) ?? 0;
    console.log(JSON.stringify({ seasons: k + 1, blockMs: Math.round(blockMs), msPerSeason: Math.round(blockMs / BLOCK), live: s.log.length, archived }));
    blockMs = 0;
  }
}
const digest = createHash('sha256').update(JSON.stringify([sink.events, s.record, s.orders])).digest('hex').slice(0, 16);
console.log(JSON.stringify({ totalMs: Math.round(performance.now() - t0), events: sink.events.length, record: s.record.length, orders: s.orders.length, digest }));
