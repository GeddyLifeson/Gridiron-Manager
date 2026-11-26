// WP-05 crew model: B11.1 to B11.4. Run on fixtures (see helpers.ts); real rule values come with WP-01.
import { describe, expect, it } from 'vitest';
import { seedFromNumber, stream } from '@gm/engine-core';
import { OfficialPosition, PlayTruth, RuleKeyManifest, playTruthProblems, type Ruling, type RulingContext } from '@gm/schema';
import {
  CREW, PARAMS, RULE_KEYS, WATCH, baseParam, crewModel, crewParamNames, detectionClass, drawCrew, foulsAfterReview, neutralCrew, officialSpots,
  phantomCallChance, rulingErrorChance, seenFrom, trueFoulCallChance, viewOf,
} from '../../src/crew/index.ts';
import { NO_ERRORS, candidatesOf, ctx, ev, plays, truthOf } from './helpers.ts';
import { PROB_FLOOR } from '@gm/schema';

const everyPlay = () => [
  plays.run(), plays.brokenTackle(), plays.catchAndRun({ marginYd: 0 }), plays.drop({ marginS: 0 }, { marginYd: 0 }), plays.interception({ marginYd: 0 }),
  plays.catchFumble({ marginYd: 0 }), plays.runFumble({ marginS: 0 }), plays.backwardLoose({ marginYd: 0 }), plays.goalLineScore({ marginYd: 0 }),
  plays.goalLineShort(0.05), plays.fieldGoal(true, { marginYd: 0 }), plays.fieldGoal(false, { marginYd: 0 }), plays.muffedPunt({ marginYd: 0 }),
  plays.falseStart(), plays.runWithFoul('fx_hold'), plays.runWithFoul('fx_mask', { borderline: true, severity: 1 }),
];
const numbered = (t: PlayTruth, playNumber: number): PlayTruth => ({ ...t, playNumber });
const rate = (n: number, f: (i: number) => boolean) => { let k = 0; for (let i = 1; i <= n; i++) if (f(i)) k++; return k / n; };
const wrong = (r: Ruling) => r.calledValue !== r.trueValue;

describe('parameters and rule keys', () => {
  it('every parameter the module asks for is in params.json, and nothing in the file is unused', () => {
    expect([...crewParamNames()].sort()).toEqual(PARAMS.params.map((p) => p.name).sort());
    for (const p of PARAMS.params) {
      expect(p.value, p.name).toBeGreaterThanOrEqual(p.min);
      expect(p.value, p.name).toBeLessThanOrEqual(p.max);
      expect(p.leaf, p.name).toMatch(/^B11\.\d\.\d$/);
    }
  });
  it('the rule-key manifest is well formed and names each key once', () => {
    const keys = RuleKeyManifest.parse(RULE_KEYS).map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('catch.feet_required');
    expect(keys).toContain('replay.reviewable.catch');
  });
});

describe('crew positions (B11.1.1)', () => {
  it('every play has seven official positions on the field, mirrored with the direction of attack', () => {
    for (const attackDir of [1, -1] as const) {
      const c = ctx();
      const spots = officialSpots(truthOf([ev.snap(), ev.dead(1, 'down_by_contact', 40, 0, 22)], { attackDir }), c);
      expect(spots.map((s) => s.position)).toEqual(OfficialPosition.options);
      for (const s of spots) {
        expect(s.x).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThanOrEqual(120);
        expect(s.y).toBeGreaterThanOrEqual(0); expect(s.y).toBeLessThanOrEqual(53.33);
      }
      const at = (p: string) => spots.find((s) => s.position === p)!;
      // The Referee is in the offensive backfield, the Back Judge deep behind the defense.
      expect((at('referee').x - 40) * attackDir).toBeLessThan(0);
      expect((at('back_judge').x - 40) * attackDir).toBeGreaterThan(0);
      expect(at('down_judge').x).toBe(40);
    }
  });
  it('each candidate foul location has an official who rules on it, for every family (acceptance)', () => {
    const c = ctx();
    const spots = officialSpots(plays.run(), c);
    for (const family of Object.values(WATCH).flat()) {
      for (let x = 0; x <= 120; x += 15) for (let y = 0; y <= 53; y += 13) {
        const v = viewOf(spots, x, y, family, c);
        expect(WATCH[v.official.position]).toContain(family);
        expect(v.missing).toBe(false);
      }
    }
  });
  it('a crew short of a position hands its calls to another official and sees less (edge case)', () => {
    const c = ctx({ crew: { positions: OfficialPosition.options.filter((p) => p !== 'umpire' && p !== 'referee') } });
    const spots = officialSpots(plays.run(), c);
    const v = viewOf(spots, 38, 26, 'offensive_holding', c);
    expect(v.missing).toBe(true);
    expect(v.official.present).toBe(true);
    const full = ctx();
    const cls = { family: 'offensive_holding' as const, objective: false };
    const e = { severity: 0.5, visibility: 'open' as const, atPointOfAttack: true };
    const whole = trueFoulCallChance(cls, e, { ...viewOf(officialSpots(plays.run(), full), 38, 26, 'offensive_holding', full), covered: true }, full);
    const short = trueFoulCallChance(cls, e, { ...v, covered: true }, c);
    expect(short).toBeCloseTo(whole * c.params.num(CREW.missingOfficialFactor), 10);
  });
});

describe('acceptance: with error rates at zero the seen record equals the truth record', () => {
  it('holds for every kind of play, at the boundary of every close call', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const c = ctx({ seed, params: NO_ERRORS });
      for (const truth of everyPlay()) {
        const r = crewModel.perceive(truth, candidatesOf(truth), c);
        expect(r.seen).toEqual(truth);
        expect(r.rulings.filter((x) => x.aspect !== 'foul').filter(wrong)).toEqual([]);
        expect(r.fouls.filter((f) => f.called && !f.correct)).toEqual([]);
      }
    }
  });
  it('and with detection at certainty every committed foul is flagged and nothing else is', () => {
    const certain = { ...NO_ERRORS, [CREW.objectiveCallChance]: 1, [CREW.objectiveCallCap]: 1, [CREW.judgmentCallCap]: 1, [CREW.severityFactorMin]: 1, [CREW.impactAwayFactor]: 1,
      [CREW.sightCrowdedFactor]: 1, [CREW.sightPileFactor]: 1, [CREW.outOfZoneFactor]: 1, [baseParam('offensive_holding')]: 1, [baseParam('roughing_and_safety')]: 1 };
    const c = ctx({ params: certain });
    for (const truth of everyPlay()) {
      const r = crewModel.perceive(truth, candidatesOf(truth), c);
      const committed = truth.events.filter((e) => e.type === 'foul_committed' && !e.borderline).length;
      expect(r.fouls.filter((f) => f.called).length).toBe(committed);
      expect(r.fouls.every((f) => f.correct)).toBe(true);
    }
  });
});

describe('determinism (B11.3.1 rule 5, J13.2.1)', () => {
  it('the same truth, crew and seed give the same seen record, rulings and fouls', () => {
    for (let seed = 1; seed <= 40; seed++) for (const truth of everyPlay()) {
      const a = crewModel.perceive(truth, candidatesOf(truth), ctx({ seed }));
      const b = crewModel.perceive(truth, candidatesOf(truth), ctx({ seed }));
      expect(b).toEqual(a);
    }
  });
  it('a different seed or a different play number gives different calls somewhere', () => {
    const calls = (seed: number, play: number) => JSON.stringify(everyPlay().map((t) => crewModel.perceive(numbered(t, play), candidatesOf(t), ctx({ seed })).rulings.map((r) => r.calledValue)));
    expect(calls(1, 1)).not.toBe(calls(2, 1));
    expect(calls(1, 1)).not.toBe(calls(1, 2));
  });
  it('the input truth record is never changed', () => {
    for (const truth of everyPlay()) {
      const before = JSON.stringify(truth);
      for (let seed = 1; seed <= 20; seed++) crewModel.perceive(truth, candidatesOf(truth), ctx({ seed }));
      expect(JSON.stringify(truth)).toBe(before);
    }
  });
});

describe('the seen record is always a well-formed truth record', () => {
  it('over every play and many seeds, with errors at their most frequent', () => {
    const noisy = { [CREW.erroneousWhistlePerGame]: 0.05, [CREW.whistleChancesPerGame]: 1, [CREW.spotSdPileYd]: 2, [CREW.spotSdOpenYd]: 1.5 };
    let altered = 0;
    for (let seed = 1; seed <= 150; seed++) for (const truth of everyPlay()) {
      const r = crewModel.perceive(truth, candidatesOf(truth), ctx({ seed, params: noisy }));
      expect(playTruthProblems(r.seen)).toEqual([]);
      expect(PlayTruth.safeParse(r.seen).success).toBe(true);
      if (r.rulings.some((x) => x.aspect !== 'foul' && wrong(x))) altered++;
      for (const x of r.rulings) expect(truth.events[x.eventIndex]).toBeDefined();
    }
    expect(altered).toBeGreaterThan(300);
  });
});

describe('wrong rulings (B11.3.2 rule 2)', () => {
  it('error chance is a coin flip at the boundary, falls with the margin, and is only the floor with no margin', () => {
    const c = ctx();
    const at = (marginYd: number | null) => rulingErrorChance('catch', { marginYd, marginS: null, visibility: 'open' }, c);
    expect(at(0)).toBeCloseTo(0.5, 12);
    expect(at(0.15)).toBeCloseTo(0.5 * Math.exp(-1), 6);
    expect(at(3)).toBe(PROB_FLOOR);
    expect(at(null)).toBe(PROB_FLOOR);
    expect(rulingErrorChance('catch', { marginYd: 0, marginS: null, visibility: 'pile' }, c)).toBe(0.5);
    expect(rulingErrorChance('catch', { marginYd: 0.15, marginS: null, visibility: 'pile' }, c)).toBeCloseTo(0.75 * Math.exp(-1), 6);
    // With both margins the one nearer its boundary counts.
    expect(rulingErrorChance('catch', { marginYd: 3, marginS: 0, visibility: 'open' }, c)).toBeCloseTo(0.5, 12);
  });
  it('a crew with better accuracy errs less (B11.4.1 rule 3)', () => {
    const j = { marginYd: 0.15, marginS: null, visibility: 'open' as const };
    expect(rulingErrorChance('catch', j, ctx({ crew: { accuracy: 0.8 } }))).toBeCloseTo(0.8 * rulingErrorChance('catch', j, ctx()), 10);
  });
  it('a catch at the boundary is ruled incomplete about half the time, and the play ends there', () => {
    const truth = plays.catchAndRun({ marginYd: 0 });
    let seenShort = 0;
    const share = rate(4000, (i) => {
      const r = crewModel.perceive(numbered(truth, i), [], ctx());
      const call = r.rulings.find((x) => x.aspect === 'catch')!;
      if (wrong(call)) {
        const dead = r.seen.events.find((e) => e.type === 'dead_ball')!;
        if (dead.type === 'dead_ball' && dead.reason === 'incomplete_pass' && r.seen.liveDurationTenths === 35) seenShort++;
        // Nothing after the ruled dead ball was ruled on.
        expect(r.rulings.filter((x) => x.aspect === 'spot')).toEqual([]);
      }
      return wrong(call);
    });
    expect(share).toBeGreaterThan(0.47); expect(share).toBeLessThan(0.53);
    expect(seenShort).toBe(Math.round(share * 4000));
  });
  it('a clear catch is almost never ruled incomplete (floor chance only)', () => {
    const truth = plays.catchAndRun({ marginYd: 5 });
    expect(rate(3000, (i) => wrong(crewModel.perceive(numbered(truth, i), [], ctx()).rulings.find((x) => x.aspect === 'catch')!))).toBeLessThan(0.002);
  });
});

describe('what each wrong ruling does to the record (B11.2.1)', () => {
  const c = ctx();
  const ruling = (aspect: Ruling['aspect'], eventIndex: number, trueValue: string, calledValue: string, marginYd: number | null = 0): Ruling =>
    ({ aspect, eventIndex, trueValue, calledValue, marginYd, marginS: null, visibility: 'open', official: 'back_judge', reviewable: true });
  const seen = (truth: PlayTruth, r: Ruling, cx: RulingContext = c) => {
    const s = seenFrom(truth, [r], new Set(), cx, null);
    expect(playTruthProblems(s)).toEqual([]);
    expect(PlayTruth.safeParse(s).success).toBe(true);
    return s;
  };
  const dead = (t: PlayTruth) => { const d = t.events.find((e) => e.type === 'dead_ball')!; if (d.type !== 'dead_ball') throw new Error(); return d; };

  it('catch ruled incomplete: dead at the catch point, nobody in possession', () => {
    const s = seen(plays.catchAndRun(), ruling('catch', 2, 'complete', 'incomplete'));
    expect(dead(s)).toMatchObject({ reason: 'incomplete_pass', side: null, carrierId: null, t: 3.5, spot: { x: 55, y: 20 } });
    expect(s.events.some((e) => e.type === 'possession' && e.how === 'catch')).toBe(false);
    expect(s.liveDurationTenths).toBe(35);
  });
  it('interception ruled incomplete: no change of possession', () => {
    const s = seen(plays.interception(), ruling('catch', 2, 'intercepted', 'incomplete'));
    expect(dead(s).reason).toBe('incomplete_pass');
    expect(s.events.some((e) => e.type === 'possession' && e.side === 1)).toBe(false);
  });
  it('incomplete ruled a catch: the intended receiver has it, down at the spot, with the feet the rule set asks for', () => {
    const s = seen(plays.drop(), ruling('catch', 2, 'incomplete', 'complete'));
    expect(dead(s)).toMatchObject({ reason: 'down_by_contact', side: 0, carrierId: 80, spot: { x: 55, y: 20 } });
    expect(s.events.find((e) => e.type === 'catch_point')).toMatchObject({ outcome: 'catch', catcherId: 80, feetInBounds: 2 });
    const other = seen(plays.drop(), ruling('catch', 2, 'incomplete', 'complete'), ctx({ model: 'booth_all_plays' }));
    expect(other.events.find((e) => e.type === 'catch_point')).toMatchObject({ feetInBounds: 1 });
  });
  it('fumble ruled down by contact: dead in the runner\'s hands at the fumble spot, the return never happened', () => {
    const s = seen(plays.runFumble(), ruling('fumble_before_down', 2, 'fumble', 'down'));
    expect(dead(s)).toMatchObject({ reason: 'down_by_contact', side: 0, carrierId: 22, t: 3, spot: { x: 46, y: 24 } });
    expect(s.events.some((e) => e.type === 'fumble')).toBe(false);
  });
  it('backward pass ruled forward: incomplete where it landed, the scoop and score never happened', () => {
    const s = seen(plays.backwardLoose(), ruling('forward_or_backward_pass', 1, 'backward', 'forward'));
    expect(dead(s)).toMatchObject({ reason: 'incomplete_pass', side: null, spot: { x: 33, y: 24 } });
    expect(s.events.find((e) => e.type === 'pass_release')).toMatchObject({ forward: true });
    expect(s.endZoneImpetus).toBeNull();
  });
  it('forward pass ruled backward: a loose ball at rest that stays with the passing team', () => {
    const s = seen(plays.drop(), ruling('forward_or_backward_pass', 1, 'forward', 'backward'));
    expect(dead(s)).toMatchObject({ reason: 'loose_ball_at_rest', side: 0, carrierId: null, spot: { x: 55, y: 20 } });
    expect(s.events.find((e) => e.type === 'fumble')).toMatchObject({ kind: 'backward_pass_loose', playerId: 12, side: 0 });
  });
  it('score ruled short: down outside the goal line by at least the short-of-goal distance', () => {
    const s = seen(plays.goalLineScore({ marginYd: 0.1 }), ruling('score', 2, 'score', 'short', 0.1));
    expect(dead(s)).toMatchObject({ reason: 'down_by_contact', side: 0, carrierId: 22, spot: { x: 109.5, y: 24 } });
    expect(s.events.some((e) => e.type === 'boundary')).toBe(false);
    expect(s.endZoneImpetus).toBeNull();
    const far = seen(plays.goalLineScore({ marginYd: 0.8 }), ruling('score', 2, 'score', 'short', 0.8));
    expect(dead(far).spot.x).toBe(109.2);
  });
  it('down short ruled a score: the plane is recorded as broken in possession', () => {
    const s = seen(plays.goalLineShort(0.2), ruling('score', 3, 'short', 'score', 0.2));
    expect(dead(s)).toMatchObject({ reason: 'ball_across_goal_line_in_possession', side: 0, carrierId: 22, spot: { x: 110, y: 24 } });
    expect(s.events.find((e) => e.type === 'boundary')).toMatchObject({ kind: 'ball_crosses_goal_line', playerId: 22 });
  });
  it('a score toward the west goal line is handled the same way', () => {
    const west = truthOf([ev.snap(), ev.possession(0.6, 0, 22, 16, 'exchange'), ev.tackle(2.2, 'made', 22, 10.3), ev.dead(2.2, 'down_by_contact', 10.3, 0, 22)], { originX: 14, attackDir: -1 });
    const cw = ctx({ situation: { attackDir: -1, ballX: 14, lineToGainX: 10 } });
    const s = seen(west, ruling('score', 3, 'short', 'score', 0.3), cw);
    expect(dead(s)).toMatchObject({ reason: 'ball_across_goal_line_in_possession', spot: { x: 10, y: 24 } });
  });
  it('spot: the called spot replaces the true one along the field only', () => {
    const s = seen(plays.run(), ruling('spot', 3, '44', '44.31'));
    expect(dead(s)).toMatchObject({ reason: 'down_by_contact', spot: { x: 44.31, y: 24 } });
  });
  it('field goal: the ruling flips good and no good', () => {
    expect(dead(seen(plays.fieldGoal(true), ruling('kick_good', 2, 'good', 'no_good'))).reason).toBe('kick_failed');
    expect(dead(seen(plays.fieldGoal(false), ruling('kick_good', 2, 'no_good', 'good'))).reason).toBe('kick_through_uprights');
  });
  it('touch of a kick not seen: the touch and its muff are gone, the recovery stays', () => {
    const s = seen(plays.muffedPunt(), ruling('touching', 2, 'touched', 'untouched'));
    expect(s.events.some((e) => e.type === 'kick_touch' || e.type === 'fumble')).toBe(false);
    expect(dead(s)).toMatchObject({ reason: 'kick_recovered_by_kickers', side: 0 });
  });
  it('erroneous whistle: the broken tackle is ruled the end of the play', () => {
    const s = seen(plays.brokenTackle(), ruling('down_by_contact', 2, 'live', 'whistle', null));
    expect(dead(s)).toMatchObject({ reason: 'forward_progress_stopped', side: 0, carrierId: 22, spot: { x: 42, y: 24 }, t: 2 });
    expect(s.liveDurationTenths).toBe(20);
  });
  it('a foul or injury after the ruled dead ball is kept in the record', () => {
    const truth = truthOf([
      ev.snap(), ev.release(2.4, true), ev.catchPoint(3.5, 'catch'), ev.possession(3.5, 0, 80, 55, 'catch', 20),
      ev.foul(4.2, 'fx_mask', 1), ev.tackle(5.0, 'made', 80, 63), ev.dead(5.0, 'down_by_contact', 63, 0, 80),
    ]);
    const s = seen(truth, ruling('catch', 2, 'complete', 'incomplete'));
    expect(s.events.map((e) => e.type)).toEqual(['snap', 'pass_release', 'catch_point', 'dead_ball', 'foul_committed']);
  });
});

describe('spots (B11.3.2 rule 3)', () => {
  const sdOf = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length); };
  const errors = (truth: PlayTruth, n: number, trueX: number, o = {}) => Array.from({ length: n }, (_, i) => {
    const r = crewModel.perceive(numbered(truth, i + 1), [], ctx(o));
    return Number(r.rulings.find((x) => x.aspect === 'spot')!.calledValue) - trueX;
  });
  it('the called spot is the true spot plus an error of 0.3 yd in the open and 0.6 yd in a pile', () => {
    const open = errors(plays.run(44, { visibility: 'open' }), 5000, 44);
    const pile = errors(plays.run(44, { visibility: 'pile' }), 5000, 44);
    expect(sdOf(open)).toBeGreaterThan(0.28); expect(sdOf(open)).toBeLessThan(0.32);
    expect(sdOf(pile)).toBeGreaterThan(0.57); expect(sdOf(pile)).toBeLessThan(0.63);
    expect(Math.abs(open.reduce((a, b) => a + b, 0) / open.length)).toBeLessThan(0.02);
  });
  it('the seen record carries the called spot, and the ruling keeps both values', () => {
    const truth = plays.run(44);
    const r = crewModel.perceive(truth, [], ctx({ seed: 3 }));
    const spot = r.rulings.find((x) => x.aspect === 'spot')!;
    const dead = r.seen.events.find((e) => e.type === 'dead_ball')!;
    expect(spot.trueValue).toBe('44');
    expect(dead.type === 'dead_ball' && String(dead.spot.x)).toBe(spot.calledValue);
    expect(spot.marginYd).toBe(6);
    expect(spot.reviewable).toBe(true);
  });
  it('a spotting error never carries the ball across a goal line: a score is its own ruling', () => {
    const truth = plays.goalLineShort(0.1);
    for (let i = 1; i <= 3000; i++) {
      const r = crewModel.perceive(numbered(truth, i), [], ctx({ params: { [CREW.spotSdOpenYd]: 1.5 } }));
      const spot = r.rulings.find((x) => x.aspect === 'spot');
      if (spot) expect(Number(spot.calledValue)).toBeLessThan(110);
      const dead = r.seen.events.find((e) => e.type === 'dead_ball')!;
      if (dead.type === 'dead_ball' && dead.reason === 'down_by_contact') expect(dead.spot.x).toBeLessThan(110);
    }
  });
  it('a runner down inside the score window is ruled in about the modelled share of plays; outside it never', () => {
    const c = ctx();
    const p = rulingErrorChance('score', { marginYd: 0.1, marginS: null, visibility: 'open' }, c);
    const share = rate(6000, (i) => crewModel.perceive(numbered(plays.goalLineShort(0.1), i), [], ctx()).rulings.some((x) => x.aspect === 'score' && x.calledValue === 'score'));
    expect(Math.abs(share - p)).toBeLessThan(0.02);
    expect(crewModel.perceive(plays.run(100), [], c).rulings.some((x) => x.aspect === 'score')).toBe(false);
  });
});

describe('erroneous whistle (B11.3.2 rule 4)', () => {
  it('happens at the configured rate, only at a broken or missed tackle, and is never reviewable', () => {
    const o = { params: { [CREW.erroneousWhistlePerGame]: 0.2, [CREW.whistleChancesPerGame]: 1 } };
    let n = 0;
    for (let i = 1; i <= 4000; i++) {
      const r = crewModel.perceive(numbered(plays.brokenTackle(), i), [], ctx(o));
      const w = r.rulings.find((x) => x.aspect === 'down_by_contact');
      if (w) { n++; expect(w.reviewable).toBe(false); expect(w.calledValue).toBe('whistle'); }
      expect(crewModel.perceive(numbered(plays.run(), i), [], ctx(o)).rulings.some((x) => x.aspect === 'down_by_contact')).toBe(false);
    }
    expect(n / 4000).toBeGreaterThan(0.17); expect(n / 4000).toBeLessThan(0.23);
  });
  it('the starting rate is one per 500 games', () => {
    expect(ctx().params.num(CREW.erroneousWhistlePerGame)).toBe(1 / 500);
  });
});

describe('detection (B11.3.1)', () => {
  const c = ctx();
  const view = (covered = true, missing = false) => ({ ...viewOf(officialSpots(plays.run(), c), 41, 26, 'offensive_holding', c), covered, missing });
  it('classifies a foul from its record: at the snap objective, then conduct, personal, kicks, pass, run', () => {
    const f = (o: object) => detectionClass({ foulId: 'fx', timing: 'live', phase: 'running_play', foulClass: 'other', side: 0, t: 2, ...o } as never, 0);
    expect(f({ timing: 'before_snap' })).toEqual({ family: 'pre_snap', objective: true });
    expect(f({ t: 0 })).toEqual({ family: 'pre_snap', objective: true });
    expect(f({ foulClass: 'unsportsmanlike' })).toEqual({ family: 'conduct', objective: false });
    expect(f({ foulClass: 'personal' })).toEqual({ family: 'roughing_and_safety', objective: false });
    expect(f({ phase: 'scrimmage_kick' })).toEqual({ family: 'special_teams_blocks', objective: false });
    expect(f({ phase: 'pass_play', side: 1 })).toEqual({ family: 'defensive_coverage', objective: false });
    expect(f({ phase: 'pass_play' })).toEqual({ family: 'offensive_holding', objective: false });
    expect(f({})).toEqual({ family: 'offensive_holding', objective: false });
    expect(f({ side: 1 })).toEqual({ family: 'other', objective: false });
    expect(f({ foulId: 'dpi', foulClass: 'personal' })).toEqual({ family: 'defensive_coverage', objective: false });
  });
  it('judgment fouls: base x severity x visibility x impact x crew, capped at 0.98', () => {
    const cls = { family: 'offensive_holding' as const, objective: false };
    const base = c.params.num(baseParam('offensive_holding'));
    const chance = (e: object, v = view(), cx: RulingContext = c) => trueFoulCallChance(cls, { severity: 0.5, visibility: 'open', atPointOfAttack: true, ...e }, v, cx);
    expect(chance({})).toBeCloseTo(base * 1 * 1 * 1.2, 10);
    expect(chance({ severity: 1 })).toBeCloseTo(base * 1.5 * 1.2, 10);
    expect(chance({ severity: 0 })).toBeCloseTo(base * 0.5 * 1.2, 10);
    expect(chance({ atPointOfAttack: false })).toBeCloseTo(base * 0.6, 10);
    expect(chance({ visibility: 'pile' })).toBeCloseTo(base * 0.5 * 1.2, 10);
    expect(chance({}, view(false))).toBeCloseTo(base * 0.6 * 1.2, 10);
    expect(chance({}, view(), ctx({ crew: { crewFactor: { offensive_holding: 1.3 } } }))).toBeCloseTo(base * 1.2 * 1.3, 10);
    expect(chance({ severity: 1 }, view(), ctx({ crew: { crewFactor: { offensive_holding: 5 } } }))).toBe(0.98);
  });
  it('objective fouls are flagged between 95 and 99 percent of the time, whatever the sight line', () => {
    const cls = { family: 'pre_snap' as const, objective: true };
    expect(trueFoulCallChance(cls, { severity: 0, visibility: 'pile', atPointOfAttack: false }, view(false), c)).toBe(0.97);
    expect(trueFoulCallChance(cls, { severity: 0, visibility: 'pile', atPointOfAttack: false }, view(), ctx({ crew: { crewFactor: { pre_snap: 1.5 } } }))).toBe(0.99);
    const live = truthOf([ev.snap(), ev.foul(0, 'fx_early', 0, { phase: 'running_play' }), ev.possession(0.6, 0, 22, 38, 'exchange'), ev.dead(3.1, 'down_by_contact', 44, 0, 22)]);
    const share = rate(5000, (i) => crewModel.perceive(numbered(live, i), candidatesOf(live), ctx()).fouls[0]!.called);
    expect(share).toBeGreaterThan(0.96); expect(share).toBeLessThan(0.98);
  });
  it('a foul that shut the play down before the snap is always flagged', () => {
    const truth = plays.falseStart();
    expect(rate(2000, (i) => crewModel.perceive(numbered(truth, i), candidatesOf(truth), ctx()).fouls[0]!.called)).toBe(1);
  });
  it('a judgment foul is flagged at its modelled rate; called and correct are set, and a ruling is kept for each', () => {
    const truth = plays.runWithFoul('fx_hold', { severity: 0.5 });
    const cand = candidatesOf(truth);
    const cls = detectionClass(cand[0]!, 0);
    const expected = trueFoulCallChance(cls, { severity: 0.5, visibility: 'open', atPointOfAttack: true }, viewOf(officialSpots(truth, c), 41, 26, cls.family, c), c);
    const share = rate(6000, (i) => {
      const r = crewModel.perceive(numbered(truth, i), cand, ctx());
      const f = r.fouls[0]!;
      expect(f.correct).toBe(f.called);
      const ruling = r.rulings.find((x) => x.aspect === 'foul')!;
      expect(ruling).toMatchObject({ trueValue: 'foul', calledValue: f.called ? 'foul' : 'no_foul', reviewable: false, eventIndex: 2 });
      return f.called;
    });
    expect(Math.abs(share - expected)).toBeLessThan(0.02);
  });
  it('a crew that calls a family tightly flags more of it (B11.4.1)', () => {
    const truth = plays.runWithFoul('fx_hold', { severity: 0.3, atPointOfAttack: false });
    const share = (factor: number) => rate(5000, (i) => crewModel.perceive(numbered(truth, i), candidatesOf(truth), ctx({ crew: { crewFactor: { offensive_holding: factor } } })).fouls[0]!.called);
    const loose = share(0.7), tight = share(1.3);
    expect(tight / loose).toBeGreaterThan(1.6); expect(tight / loose).toBeLessThan(2.1);
  });
});

describe('phantom calls (B11.3.2 rule 1)', () => {
  it('no flag is ever created from nothing (acceptance)', () => {
    for (let i = 1; i <= 2000; i++) {
      for (const truth of [plays.run(), plays.catchAndRun({ marginYd: 0 }), plays.runWithFoul('fx_hold')]) {
        const r = crewModel.perceive(numbered(truth, i), candidatesOf(truth), ctx());
        for (const f of r.fouls) if (f.called) expect(f.correct).toBe(true);
        expect(r.fouls.length).toBe(truth.events.filter((e) => e.type === 'foul_committed').length);
      }
    }
  });
  it('a borderline act draws a flag at up to 15 percent, rising toward the foul boundary', () => {
    const cls = { family: 'roughing_and_safety' as const, objective: false };
    const c = ctx();
    expect(phantomCallChance(cls, { severity: 1 }, c)).toBeCloseTo(0.15, 12);
    expect(phantomCallChance(cls, { severity: 0.4 }, c)).toBeCloseTo(0.06, 12);
    expect(phantomCallChance(cls, { severity: 0 }, c)).toBe(0);
    expect(phantomCallChance(cls, { severity: 1 }, ctx({ crew: { accuracy: 1.2 } }))).toBe(0.15);
    const truth = plays.runWithFoul('fx_mask', { borderline: true, severity: 1 });
    const share = rate(6000, (i) => {
      const r = crewModel.perceive(numbered(truth, i), [], ctx());
      expect(r.fouls.length).toBe(1);
      const f = r.fouls[0]!;
      expect(f.correct).toBe(!f.called);
      expect(f.eventIndex).toBeNull();
      expect(r.rulings.find((x) => x.aspect === 'foul')).toMatchObject({ trueValue: 'no_foul', calledValue: f.called ? 'foul' : 'no_foul', eventIndex: 2 });
      return f.called;
    });
    expect(share).toBeGreaterThan(0.13); expect(share).toBeLessThan(0.17);
  });
  it('the record of a mistaken flag takes its catalogue fields from the rule set', () => {
    const truth = plays.runWithFoul('fx_mask', { borderline: true, severity: 1 });
    const f = crewModel.perceive(truth, [], ctx()).fouls[0]!;
    expect(f).toMatchObject({ foulId: 'fx_mask', yards: 15, foulClass: 'personal', dq: 'if_flagrant', side: 0, beforeChangeOfPossession: true, spot: { x: 41, y: 26 } });
  });
  it('a borderline act the foul module already listed is weighed once, as a borderline act', () => {
    const truth = plays.runWithFoul('fx_mask', { borderline: true, severity: 1 });
    const cand = candidatesOf(truth, true);
    const share = rate(4000, (i) => {
      const r = crewModel.perceive(numbered(truth, i), cand, ctx());
      expect(r.fouls.length).toBe(1);
      return r.fouls[0]!.called;
    });
    expect(share).toBeGreaterThan(0.13); expect(share).toBeLessThan(0.17);
  });
  it('a foul that does not exist in the rule set cannot be flagged by mistake', () => {
    const truth = plays.runWithFoul('fx_gone', { borderline: true, severity: 1 });
    for (let i = 1; i <= 200; i++) expect(crewModel.perceive(numbered(truth, i), [], ctx()).fouls).toEqual([]);
  });
  it('replay picks a flag up by its ruling index', () => {
    const truth = plays.runWithFoul('fx_mask', { borderline: true, severity: 1 });
    let i = 1;
    let r = crewModel.perceive(numbered(truth, i), [], ctx());
    while (!r.fouls[0]!.called) r = crewModel.perceive(numbered(truth, ++i), [], ctx());
    const at = r.rulings.findIndex((x) => x.aspect === 'foul');
    const after = foulsAfterReview(r.fouls, r.rulings, [at]);
    expect(after[0]).toMatchObject({ called: false, correct: true });
    expect(r.fouls[0]!.called).toBe(true);
  });
});

describe('crew tendencies (B11.4.1)', () => {
  it('a drawn crew has family multipliers around 1 with the configured spread and accuracy in its range', () => {
    const p = ctx().params;
    const all: number[] = [];
    for (let i = 1; i <= 800; i++) {
      const crew = drawCrew(i, stream(seedFromNumber(11), 'between', [i]), p, 'regular');
      expect(Object.keys(crew.crewFactor).sort()).toEqual(['conduct', 'defensive_coverage', 'offensive_holding', 'pre_snap', 'roughing_and_safety', 'special_teams_blocks']);
      all.push(...Object.values(crew.crewFactor));
      expect(crew.accuracy).toBeGreaterThanOrEqual(0.8); expect(crew.accuracy).toBeLessThanOrEqual(1.2);
      for (const v of Object.values(crew.crewFactor)) { expect(v).toBeGreaterThanOrEqual(0.5); expect(v).toBeLessThanOrEqual(1.5); }
    }
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    const sd = Math.sqrt(all.reduce((a, b) => a + (b - mean) * (b - mean), 0) / all.length);
    expect(Math.abs(mean - 1)).toBeLessThan(0.01);
    expect(sd).toBeGreaterThan(0.14); expect(sd).toBeLessThan(0.16);
  });
  it('a postseason crew is neutral and more accurate (edge case)', () => {
    const p = ctx().params;
    for (let i = 1; i <= 200; i++) {
      const crew = drawCrew(i, stream(seedFromNumber(11), 'between', [i]), p, 'postseason');
      expect(Object.values(crew.crewFactor).every((v) => v === 1)).toBe(true);
      expect(crew.accuracy).toBeGreaterThanOrEqual(0.8); expect(crew.accuracy).toBeLessThanOrEqual(0.9);
    }
    expect(neutralCrew(4)).toMatchObject({ crewId: 4, accuracy: 1, pace: 1 });
  });
});
