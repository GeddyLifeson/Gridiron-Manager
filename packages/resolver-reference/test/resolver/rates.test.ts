// The reference resolver's draws land on the rates in its parameter file, and move the right way with
// ratings and with the defensive family (J1.6.3). The numbers compared against are read from PARAMS.
// Three are typed here because the measured depth shares reach them and no parameter holds them:
// interception 2.28%, 7.7 air yards per attempt and 10.9 yards per completion (J15.4.1). Whether any of these figures is right is the calibration suite's question
// (Q2, WP-13): most J15 rows are PROVISIONAL (build plan section 4).
import { describe, expect, it } from 'vitest';
import { deadBallOf, eventsOf, type PlayCalls, type PlayResult, type SimTeam } from '@gm/schema';
import { PARAMS, REFERENCE_RESOLVER as R, referenceParamTable } from '../../src/resolver/index.ts';
import { defenseCall, input, kickCall, offenseCall, returnCall, situation, team } from './helpers.ts';

const P = (name: string): number => {
  const row = PARAMS.params.find((p) => p.name === `resolverRef.${name}`);
  if (!row) throw new Error(`no parameter ${name}`);
  return row.value;
};
const N = 40_000;
/** Five standard errors of a share measured on n draws. */
const tol = (p: number, n = N) => 5 * Math.sqrt((p * (1 - p)) / n);

/**
 * The base rows are checked with the situation factors switched off: no down, field-position, coverage or play-action tilt, no
 * screens taken out of the depth mix, no breakaway tail, and no return scores or fumbles on punts. The factors
 * themselves are checked in their own block below, with the parameter file as it ships.
 */
const NEUTRAL = referenceParamTable({
  ...Object.fromEntries(['d1', 'd2', 'd3', 'd4'].flatMap((d) => [[`pass.downCompletionFactor.${d}`, 1], [`pass.downSackFactor.${d}`, 1], [`pass.downDepthTilt.${d}`, 0]])),
  ...Object.fromEntries(PARAMS.params.filter((p) => p.name.startsWith('resolverRef.pass.coverageCompletion.')).map((p) => [p.name.slice('resolverRef.'.length), 0.65])),
  ...Object.fromEntries(PARAMS.params.filter((p) => p.name.startsWith('resolverRef.pass.coverageYacFactor.')).map((p) => [p.name.slice('resolverRef.'.length), 1])),
  ...Object.fromEntries(PARAMS.params.filter((p) => p.name.startsWith('resolverRef.pass.goalCompletion.')).map((p) => [p.name.slice('resolverRef.'.length), P('pass.completionAll')])),
  'pass.playActionYacFactor': 1, 'volume.screenShareOfAttempts': 0, 'pass.yacBreakawayShare': 0, 'pass.sticksShare': 0,
  'punt.returnTdShare': 0, 'punt.returnFumbleLostShare': 0,
});

function runMany(calls: PlayCalls, n: number, over: Parameters<typeof situation>[0] = {}, teams?: readonly [SimTeam, SimTeam], seed = 1, params: typeof NEUTRAL = NEUTRAL): PlayResult[] {
  const out: PlayResult[] = [];
  for (let i = 1; i <= n; i++) out.push(R.simulatePlay(input(situation({ ...over, playNumber: i }), calls, { teams, seed, params })));
  return out;
}

interface PassLine { dropbacks: number; sacks: number; scrambles: number; attempts: number; completions: number; interceptions: number; pressures: number; yards: number; air: number; fumbles: number; throwaways: number; drops: number }
function passLine(results: readonly PlayResult[], ballX: number): PassLine {
  const l: PassLine = { dropbacks: results.length, sacks: 0, scrambles: 0, attempts: 0, completions: 0, interceptions: 0, pressures: 0, yards: 0, air: 0, fumbles: 0, throwaways: 0, drops: 0 };
  for (const r of results) {
    const pressure = eventsOf(r.truth, 'pressure');
    if (pressure.some((e) => e.kind === 'pressure')) l.pressures++;
    if (eventsOf(r.truth, 'fumble').length) l.fumbles++;
    if (pressure.some((e) => e.kind === 'sack')) { l.sacks++; continue; }
    const release = eventsOf(r.truth, 'pass_release')[0];
    if (!release) { l.scrambles++; continue; }
    l.attempts++;
    l.air += release.airYd;
    if (release.throwaway) l.throwaways++;
    const cp = eventsOf(r.truth, 'catch_point')[0]!;
    if (cp.outcome === 'catch') { l.completions++; l.yards += deadBallOf(r.truth).spot.x - ballX; }
    if (cp.outcome === 'interception') l.interceptions++;
    if (cp.outcome === 'drop') l.drops++;
  }
  return l;
}

const pass = (rushers = 4): PlayCalls => ({ snapping: offenseCall(0, 'dropback_pass'), opposing: defenseCall(1, { rushers }) });
const run = (boxCount = 7): PlayCalls => ({ snapping: offenseCall(0, 'run'), opposing: defenseCall(1, { boxCount }) });

describe('reference resolver: situation factors, with the parameter file as it ships', () => {
  const SHIPPED = referenceParamTable();
  const n = 20_000;
  const at = (over: Partial<import('@gm/schema').GameSituation>, calls: PlayCalls = pass(4), ballX = 35) => passLine(runMany(calls, n, { ballX, lineToGainX: ballX + (over.distanceYd ?? 10), ...over }, undefined, 1, SHIPPED), ballX);

  it('third down brings more sacks, fewer completions and deeper throws than first down', () => {
    const first = at({ down: 1 }), third = at({ down: 3 });
    expect(third.sacks / n).toBeGreaterThan(first.sacks / n);
    expect(third.completions / third.attempts).toBeLessThan(first.completions / first.attempts);
    expect(third.air / third.attempts).toBeGreaterThan(first.air / first.attempts);
  });

  it('a screen is thrown behind the line and completed near its own row', () => {
    const screen = at({ down: 1 }, { snapping: offenseCall(0, 'screen'), opposing: defenseCall(1) });
    expect(screen.air / screen.attempts).toBeLessThan(0);
    // First down and cover 3 each lift it about 3% off the row; 0.07 covers both.
    expect(Math.abs(screen.completions / screen.attempts - P('pass.screenCompletion'))).toBeLessThan(0.07);
  });

  it('completions are harder to come by at the goal line than in the open field', () => {
    const open = at({ down: 1 }), goal = at({ down: 1, distanceYd: 2, goalToGo: true }, pass(4), 98);
    expect(goal.completions / goal.attempts).toBeLessThan(open.completions / open.attempts - 0.05);
  });

  it('man coverage gives up fewer completions than zone', () => {
    const man = at({ down: 1 }, { snapping: offenseCall(0, 'dropback_pass'), opposing: defenseCall(1, { coverageFamily: 'cover1' }) });
    const zone = at({ down: 1 }, { snapping: offenseCall(0, 'dropback_pass'), opposing: defenseCall(1, { coverageFamily: 'cover2' }) });
    expect(man.completions / man.attempts).toBeLessThan(zone.completions / zone.attempts);
  });
});

describe('reference resolver: dropbacks land on the J15.4 rows in the parameter file', () => {
  const line = passLine(runMany(pass(4), N), 35);

  it('sack, pressure and scramble shares against four rushers', () => {
    expect(Math.abs(line.sacks / N - P('pass.sackShare.r4'))).toBeLessThan(tol(P('pass.sackShare.r4')));
    expect(Math.abs(line.pressures / N - P('pass.pressureShare.r4'))).toBeLessThan(tol(P('pass.pressureShare.r4')));
    expect(Math.abs(line.scrambles / N - P('pass.scrambleShare'))).toBeLessThan(tol(P('pass.scrambleShare')));
    expect(Math.abs(line.fumbles / line.sacks - P('pass.fumbleLostPerDropback') / P('pass.sackShareAll'))).toBeLessThan(tol(0.116, line.sacks));
  });

  it('completion, interception, air yards and yards per completion', () => {
    expect(Math.abs(line.completions / line.attempts - P('pass.completionAll'))).toBeLessThan(0.012);
    // 2.28% interceptions is the J15.4.1 row; the measured depth shares give 2.29%.
    expect(Math.abs(line.interceptions / line.attempts - 0.0228)).toBeLessThan(tol(0.0228, line.attempts));
    expect(Math.abs(line.air / line.attempts - 7.7)).toBeLessThan(0.3);
    expect(Math.abs(line.yards / line.completions - 10.9)).toBeLessThan(0.4);
  });

  it('throwaways and drops per dropback', () => {
    expect(Math.abs(line.throwaways / N - P('pass.throwawayPerDropback'))).toBeLessThan(0.006);
    expect(Math.abs(line.drops / N - P('pass.dropPerDropback'))).toBeLessThan(0.006);
  });

  it('pressure and sacks follow the rusher count (J15.4.2 acceptance)', () => {
    const by = [3, 4, 5, 6, 7].map((r) => passLine(runMany(pass(r), N), 35));
    const pressure = by.map((l) => l.pressures / N);
    const sacks = by.map((l) => l.sacks / N);
    for (let i = 1; i < pressure.length; i++) expect(pressure[i]!).toBeGreaterThan(pressure[i - 1]!);
    expect(sacks[1]!).toBeGreaterThan(sacks[0]!);
    expect(sacks[2]!).toBeGreaterThan(sacks[1]!);
    expect(sacks[3]!).toBeGreaterThanOrEqual(sacks[1]!);
    // Seven or more is not required to rise; both sources show it falling.
    expect(sacks[4]!).toBeLessThan(sacks[3]!);
    // Rusher counts outside the table use its end rows.
    expect(passLine(runMany(pass(2), 5000), 35)).toEqual(passLine(runMany(pass(3), 5000), 35));
    expect(passLine(runMany(pass(9), 5000), 35)).toEqual(passLine(runMany(pass(7), 5000), 35));
    // Completion holds near its own row whatever the rush, by construction of the clean-pocket factor.
    for (const l of by) expect(Math.abs(l.completions / l.attempts - P('pass.completionAll'))).toBeLessThan(0.02);
  });

  it('yards after the catch follow the depth of the catch', () => {
    const sum: number[] = [], n: number[] = [], lost: number[] = [];
    for (const r of runMany(pass(4), N)) {
      const rel = eventsOf(r.truth, 'pass_release')[0];
      if (!rel || eventsOf(r.truth, 'catch_point')[0]?.outcome !== 'catch') continue;
      const a = Math.round(rel.airYd);
      const band = a < 0 ? 0 : a === 0 ? 1 : a <= 5 ? 2 : a <= 10 ? 3 : a <= 15 ? 4 : a <= 20 ? 5 : a <= 30 ? 6 : 7;
      const end = deadBallOf(r.truth).spot.x - 35;
      sum[band] = (sum[band] ?? 0) + end - rel.airYd; n[band] = (n[band] ?? 0) + 1;
      if (Math.round(end) < 0) lost[band] = (lost[band] ?? 0) + 1;
    }
    // From the 35 the goal line is out of reach for all but the deepest band, so each mean is the parameter.
    ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6'].forEach((b, i) => {
      const m = P(`pass.yacMeanYd.${b}`);
      // Five standard errors: the spread of the draw is at most its mean.
      expect(Math.abs(sum[i]! / n[i]! - m), `band ${b}`).toBeLessThan((5 * m) / Math.sqrt(n[i]!));
    });
    // Completions behind the line that lose yards: 13% in the real file; one exponential stage gave 28%.
    expect(Math.abs(lost[0]! / n[0]! - 0.13)).toBeLessThan(0.03);
  });

  it('completes fewer passes under pressure than from a clean pocket', () => {
    const results = runMany(pass(5), N);
    const hot = passLine(results.filter((r) => eventsOf(r.truth, 'pressure').length > 0), 35);
    const clean = passLine(results.filter((r) => eventsOf(r.truth, 'pressure').length === 0), 35);
    expect(hot.completions / hot.attempts).toBeLessThan(clean.completions / clean.attempts - 0.15);
  });
});

describe('reference resolver: runs land on the J15.5.1 rows in the parameter file', () => {
  const gain = (r: PlayResult) => deadBallOf(r.truth).spot.x - 35;
  const mean = (rs: readonly PlayResult[]) => rs.reduce((s, r) => s + gain(r), 0) / rs.length;
  const clean = (rs: readonly PlayResult[]) => rs.filter((r) => eventsOf(r.truth, 'fumble').length === 0);

  const BOXES = [[6, 'box6'], [7, 'box7'], [8, 'box8'], [9, 'box9']] as const;
  const ypc = (name: string) => P(`run.ypc${name[0]!.toUpperCase()}${name.slice(1)}`);
  /** The by-box rows averaged over the real mix of boxes: the reference the box shift is measured from. */
  const boxMean = BOXES.reduce((s, [, name]) => s + P(`run.boxShare.${name}`) * ypc(name), 0) / BOXES.reduce((s, [, name]) => s + P(`run.boxShare.${name}`), 0);

  it('mean gain by box count is the table mean moved by the by-box row less the rows\' average over the real mix', () => {
    const means = BOXES.map(([box]) => mean(clean(runMany(run(box), N))));
    BOXES.forEach(([box, name], i) => expect(Math.abs(means[i]! - means[1]! - (ypc(name) - ypc('box7'))), `box ${box}: ${means[i]}`).toBeLessThan(0.25));
    // A defense that calls the real mix of boxes leaves the mean on the table's own mean (4.59 yd with the goal line out of reach).
    const mixed = BOXES.reduce((s, [, name], i) => s + P(`run.boxShare.${name}`) * means[i]!, 0);
    expect(Math.abs(mixed - 4.59), `mixed ${mixed}`).toBeLessThan(0.15);
    expect(mean(runMany(run(5), 5000))).toBe(mean(runMany(run(6), 5000)));
    expect(mean(runMany(run(11), 5000))).toBe(mean(runMany(run(9), 5000)));
  });

  it('a carry is stopped at or behind the line as often as real designed runs (18.5%) when the box is the real mix', () => {
    // Reported gain is whole yards between the nearest yard lines; from a snap on a yard line that is round(gain).
    let stuffed = 0;
    BOXES.forEach(([box, name]) => {
      const rs = clean(runMany(run(box), N));
      stuffed += P(`run.boxShare.${name}`) * rs.filter((r) => Math.round(gain(r)) <= 0).length / rs.length;
    });
    expect(Math.abs(stuffed - 0.185), `stuffed ${stuffed}`).toBeLessThan(0.012);
  });

  it('keeps the shape of the quantile table and loses the ball at the fumble row', () => {
    const results = runMany(run(7), N);
    const gains = clean(results).map(gain).sort((a, b) => a - b);
    const at = (p: number) => gains[Math.floor(p * gains.length)]!;
    const shift = ypc('box7') - boxMean;
    for (const [p, name] of [[0.10, 'run.q10'], [0.25, 'run.q25'], [0.50, 'run.q50'], [0.75, 'run.q75'], [0.90, 'run.q90']] as const) {
      expect(Math.abs(at(p) - (P(name) + shift)), `quantile ${p}`).toBeLessThan(0.35);
    }
    const lost = results.length - clean(results).length;
    expect(Math.abs(lost / N - P('run.fumbleLostShare'))).toBeLessThan(tol(P('run.fumbleLostShare')));
    for (const r of results) {
      const f = eventsOf(r.truth, 'fumble')[0];
      if (f) { expect(f.side).toBe(0); expect(deadBallOf(r.truth).side).toBe(1); }
    }
  });

  it('a quarterback run has no exchange and a draw is a run', () => {
    const qb = R.simulatePlay(input(situation(), { snapping: offenseCall(0, 'qb_run'), opposing: defenseCall(1) }));
    expect(eventsOf(qb.truth, 'exchange')).toEqual([]);
    const draw = R.simulatePlay(input(situation(), { snapping: offenseCall(0, 'draw'), opposing: defenseCall(1) }));
    expect(eventsOf(draw.truth, 'exchange').length).toBe(1);
    expect(eventsOf(draw.truth, 'pass_release')).toEqual([]);
  });
});

describe('reference resolver: the rating shift (J1.6.3)', () => {
  // Two standard deviations of average attribute difference: 70 against 50.
  const strongOffense: readonly [SimTeam, SimTeam] = [team(0, 70), team(1, 50)];
  const strongDefense: readonly [SimTeam, SimTeam] = [team(0, 50), team(1, 70)];

  it('moves the mean run gain by 0.1 standard deviations per z, in the direction of the better unit', () => {
    const gain = (rs: readonly PlayResult[]) => rs.filter((r) => eventsOf(r.truth, 'fumble').length === 0).reduce((s, r, _, a) => s + (deadBallOf(r.truth).spot.x - 35) / a.length, 0);
    const even = gain(runMany(run(), N));
    const up = gain(runMany(run(), N, {}, strongOffense));
    const down = gain(runMany(run(), N, {}, strongDefense));
    // Same draws, so the difference is the shift itself: 2 z times 0.1 SD times the table's SD (about 6.5 yd).
    expect(up - even).toBeGreaterThan(1.1);
    expect(up - even).toBeLessThan(1.5);
    expect(even - down).toBeGreaterThan(1.0);
    expect(even - down).toBeLessThan(1.5);
  });

  it('moves completions, sacks, interceptions and place kicks the same way', () => {
    const even = passLine(runMany(pass(), N), 35);
    const up = passLine(runMany(pass(), N, {}, strongOffense), 35);
    const down = passLine(runMany(pass(), N, {}, strongDefense), 35);
    const comp = (l: PassLine) => l.completions / l.attempts;
    expect(comp(up)).toBeGreaterThan(comp(even) + 0.04);
    expect(comp(down)).toBeLessThan(comp(even) - 0.04);
    expect(up.sacks).toBeLessThan(even.sacks);
    expect(down.sacks).toBeGreaterThan(even.sacks);
    expect(up.interceptions).toBeLessThan(down.interceptions);
    const kick: PlayCalls = { snapping: kickCall(0, 'field_goal'), opposing: returnCall(1, { returnKind: 'field_goal_block' }) };
    const made = (teams: readonly [SimTeam, SimTeam]) => runMany(kick, N, { ballX: 80 }, teams).filter((r) => deadBallOf(r.truth).reason === 'kick_through_uprights').length;
    expect(made(strongOffense)).toBeGreaterThan(made(strongDefense));
  });

  it('is exactly zero for an even matchup, whatever the level of the two teams', () => {
    const a = runMany(pass(), 500, {}, [team(0, 30), team(1, 30)]);
    const b = runMany(pass(), 500, {}, [team(0, 80), team(1, 80)]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('reference resolver: kicks land on the rows in the parameter file', () => {
  it('field goals by distance band, and the try kick', () => {
    // Kick length is the yards to the goal line plus the end zone plus the hold depth.
    const cases = [[25, 'fg.make.d0_29'], [35, 'fg.make.d30_39'], [42, 'fg.make.d40_44'], [47, 'fg.make.d45_49'], [52, 'fg.make.d50_54'], [58, 'fg.make.d55']] as const;
    for (const [length, name] of cases) {
      const ballX = 110 - (length - 10 - P('fg.holdDepthYd'));
      const rs = runMany({ snapping: kickCall(0, 'field_goal'), opposing: returnCall(1, { returnKind: 'field_goal_block' }) }, N, { ballX, down: 4 });
      const good = rs.filter((r) => deadBallOf(r.truth).reason === 'kick_through_uprights').length;
      expect(Math.abs(good / N - P(name)), `${length} yd`).toBeLessThan(tol(P(name)));
    }
    const tries = runMany({ snapping: kickCall(0, 'try_kick'), opposing: returnCall(1, { returnKind: 'try_block' }) }, N, { ballX: 95, playKind: 'try', down: null, distanceYd: null, lineToGainX: null });
    const good = tries.filter((r) => deadBallOf(r.truth).reason === 'kick_through_uprights').length;
    expect(Math.abs(good / N - P('try.kickMake'))).toBeLessThan(tol(P('try.kickMake')));
    for (const r of tries.slice(0, 500)) {
      const d = deadBallOf(r.truth);
      const between = d.spot.y > 80 / 3 - 18.5 / 6 && d.spot.y < 80 / 3 + 18.5 / 6;
      expect(between).toBe(d.reason === 'kick_through_uprights');
      expect(d.spot.x).toBe(120);
    }
  });

  it('punts from deep in a team\'s own end: gross distance, blocks, and the outcome mix', () => {
    const rs = runMany({ snapping: kickCall(0, 'punt'), opposing: returnCall(1, { returnKind: 'punt_return' }) }, N, { ballX: 30, down: 4 });
    let blocked = 0, gross = 0, returned = 0, fair = 0, out = 0, downed = 0, returnYards = 0;
    for (const r of rs) {
      const k = eventsOf(r.truth, 'kick')[0]!;
      const d = deadBallOf(r.truth);
      if (k.blockedById !== null) { blocked++; expect(k.crossedLine).toBe(false); expect(d.side).toBe(1); continue; }
      gross += k.landingSpot.x - 30;
      if (d.reason === 'fair_catch') fair++;
      else if (d.reason === 'ball_out_of_bounds') out++;
      else if (d.reason === 'kick_recovered_by_kickers') downed++;
      else if (d.reason !== 'ball_dead_in_end_zone') { returned++; returnYards += k.landingSpot.x - d.spot.x; }
    }
    const kicked = N - blocked;
    expect(Math.abs(blocked / N - P('punt.blockedShare'))).toBeLessThan(tol(P('punt.blockedShare')));
    expect(Math.abs(gross / kicked - P('punt.grossMeanYd'))).toBeLessThan(0.5);
    const total = P('punt.returnedShare') + P('punt.fairCatchShare') + P('punt.outOfBoundsShare') + P('punt.downedShare');
    const live = returned + fair + out + downed;
    expect(Math.abs(returned / live - P('punt.returnedShare') / total)).toBeLessThan(0.015);
    expect(Math.abs(fair / live - P('punt.fairCatchShare') / total)).toBeLessThan(0.015);
    expect(Math.abs(out / live - P('punt.outOfBoundsShare') / total)).toBeLessThan(0.015);
    expect(Math.abs(returnYards / returned - P('punt.returnMeanYd'))).toBeLessThan(0.5);
  });

  it('punt touchbacks over spots spread from the 15 to the opponent\'s 40 sit near the touchback row', () => {
    let touchbacks = 0;
    for (let i = 0; i < N; i++) {
      const r = R.simulatePlay(input(situation({ playNumber: i + 1, ballX: 25 + (i % 46), down: 4 }), { snapping: kickCall(0, 'punt'), opposing: returnCall(1, { returnKind: 'punt_return' }) }));
      if (deadBallOf(r.truth).reason === 'ball_dead_in_end_zone') { touchbacks++; expect(r.truth.endZoneImpetus).toBe(0); }
    }
    expect(Math.abs(touchbacks / N - P('punt.touchbackShare'))).toBeLessThan(0.015);
  });

  it('kickoffs: touchback share and returns; onside kicks: recovery share', () => {
    const free = { ballX: 45, playKind: 'kickoff', down: null, distanceYd: null, lineToGainX: null } as const;
    const rs = runMany({ snapping: kickCall(0, 'kickoff'), opposing: returnCall(1) }, N, free);
    let touchbacks = 0, returns = 0, start = 0, lostFumbles = 0;
    for (const r of rs) {
      const d = deadBallOf(r.truth);
      expect(eventsOf(r.truth, 'snap')).toEqual([]);
      if (d.reason === 'ball_dead_in_end_zone') touchbacks++;
      else if (d.reason !== 'ball_out_of_bounds') {
        // A3.1 ruling 22: a return can end in a fumble the kickers recover (floor chance only).
        if (d.side !== 1) { lostFumbles++; expect(eventsOf(r.truth, 'fumble')).toHaveLength(1); continue; }
        returns++; start += 110 - d.spot.x;
      }
    }
    expect(lostFumbles / N).toBeLessThan(0.002);
    expect(Math.abs(touchbacks / N - P('kickoff.touchbackShare'))).toBeLessThan(tol(P('kickoff.touchbackShare')));
    // Mean catch depth plus mean return, less the few returns that reach the far goal line.
    const expected = P('kickoff.catchMaxYd') / 2 + P('kickoff.returnMinYd') + P('kickoff.returnTailMeanYd');
    expect(Math.abs(start / returns - expected)).toBeLessThan(0.6);
    const onside = runMany({ snapping: kickCall(0, 'onside_kick'), opposing: returnCall(1, { returnKind: 'hands_team' }) }, N, free);
    const kept = onside.filter((r) => deadBallOf(r.truth).reason === 'kick_recovered_by_kickers').length;
    expect(Math.abs(kept / N - P('onside.recoveryShare'))).toBeLessThan(tol(P('onside.recoveryShare')));
    const safety = runMany({ snapping: kickCall(0, 'safety_kick'), opposing: returnCall(1) }, 200, { ...free, ballX: 30, playKind: 'safety_kick' });
    for (const r of safety) expect(eventsOf(r.truth, 'kick')[0]!.kickKind).toBe('safety_kick');
  });
});
