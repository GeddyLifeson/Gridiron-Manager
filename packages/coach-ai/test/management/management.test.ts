// Tests for bible K5 (G-59). Each describe names the leaf it covers. League-rate acceptance items (J15
// mix, timeouts per game) need engine batches and are owed to the gate run (DECISIONS.md).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  allowScore, challengeDecision, clockPlan, createManagementDecider, decide, endOfHalf, ERROR_IDS, errorChance, errorHappens, fourthDown,
  fourthDownOffsetPts, kneelWins, modelLine, overtimeChoice, param, PARAMS, penaltyChoice, restForSeason, restInGame, restThreshold, RULE_KEYS, soundMode,
  timeoutDecision, tossChoice, tryChoice, twoDownTerritory, type ChallengeAspect, type StaffPort, type TimeoutMoment, type ViewLike,
} from '../../src/management/index.ts';
import { CHART, MATH, OTHER_RULES, PRO_RULES, coach, draws, env, estimates, fixtureRules, share, sit } from './helpers.ts';

const TEMPO = { realPlayS: 18, spikeS: 5, teamSet: false };
const second = (p = {}) => sit({ firstHalf: false, period: 4, gameSecondsLeft: 600, halfSecondsLeft: 600, ...p });

describe('K5.1.1 estimate, offset, advice, choice', () => {
  const opts = [{ id: 'go', wp: 0.55 }, { id: 'punt', wp: 0.52 }];
  const run = (i: number, over = {}) => decide({ decisionType: 't', options: opts, habit: 'punt', offsetPts: 0, advisor: false, analyticsTrust: 0, draws: draws('m', i), ...over });

  it('rule 3: he leaves the habit only for a margin above his offset', () => {
    expect(run(1).chosen).toBe('go');
    expect(run(1, { offsetPts: 4 }).chosen).toBe('punt');
    expect(run(1).log.marginPts).toBeCloseTo(3, 9);
  });

  it('rule 4: with an advisor he switches to the model line with probability analyticsTrust', () => {
    const p = share(4000, (i) => run(i, { offsetPts: 4, advisor: true, analyticsTrust: 0.3 }).chosen === 'go');
    expect(p).toBeGreaterThan(0.27);
    expect(p).toBeLessThan(0.33);
    expect(run(2, { offsetPts: 4, advisor: true, analyticsTrust: 1 }).log.followedAdvice).toBe(true);
  });

  it('rule 5: without an advisor the weekly chart line replaces the live search', () => {
    expect(run(1, { weekly: { choice: 'punt', marginPts: 2 } }).chosen).toBe('punt');
    expect(run(1, { advisor: true, analyticsTrust: 1, weekly: { choice: 'punt', marginPts: 2 } }).chosen).toBe('go');
  });

  it('rule 7: thinking takes 2 to 6 s, longer when the margin sits at his offset', () => {
    for (let i = 0; i < 200; i++) {
      const t = run(i).thinkingS;
      expect(t).toBeGreaterThanOrEqual(2);
      expect(t).toBeLessThanOrEqual(6);
      expect(run(i, { offsetPts: 3.5 }).thinkingS).toBeGreaterThan(t);
    }
  });

  it('A3 ruling 22: every legal option keeps the floor chance, long shots included', () => {
    const seen = new Set<string>();
    const n = 120000;
    let off = 0;
    for (let i = 0; i < n; i++) {
      const r = run(i, { longShots: ['field_goal'] });
      seen.add(r.chosen);
      if (r.log.floor) off++;
    }
    expect(seen).toEqual(new Set(['go', 'punt', 'field_goal']));
    expect(off / n).toBeGreaterThan(param('prob.floor'));
    expect(off / n).toBeLessThan(param('prob.floor') * 4);
  });

  it('modelLine: the advisor line of rules 1 and 2, with no draw', () => {
    expect(modelLine(opts, 'punt')).toEqual({ optionId: 'go', marginPts: expect.closeTo(3, 9), close: false });
    expect(modelLine(opts, 'go')).toEqual({ optionId: 'go', marginPts: 0, close: true });
  });

  it('is deterministic and independent of option order', () => {
    const a = run(7), b = decide({ decisionType: 't', options: [...opts].reverse(), habit: 'punt', offsetPts: 0, advisor: false, analyticsTrust: 0, draws: draws('m', 7) });
    expect(b).toEqual(a);
  });
});

describe('K5.2.1 go, kick, or punt', () => {
  const fd = (s: ReturnType<typeof sit>, c = coach(), i = 0, extra = {}) => fourthDown(env(['fd', i]), { situation: s, estimates: estimates(), chart: CHART, coach: c, ...extra });

  it('K5.1.1 acceptance: zero offsets, full trust, no errors: the model’s best option in every non-close state', () => {
    let n = 0;
    for (let ytg = 2; ytg <= 98; ytg += 3) for (const d of [1, 2, 4, 7, 11]) {
      if (d > ytg) continue;
      const r = fd(sit({ down: 4, distanceYd: d, yardsToGoalYd: ytg }), coach(), n++);
      if (r.log.floor) continue;
      expect(r.chosen).toBe(r.log.model);
      for (const o of r.log.options) expect(o.wp).toBeLessThanOrEqual(r.log.options.find((x) => x.id === r.chosen)!.wp);
    }
    expect(n).toBeGreaterThan(100);
  });

  it('rule 2: the habit is the field goal in range and the punt otherwise; an out-of-range kick is not weighed', () => {
    expect(fd(sit({ down: 4, distanceYd: 8, yardsToGoalYd: 20 })).log.habit).toBe('field_goal');
    const deep = fd(sit({ down: 4, distanceYd: 8, yardsToGoalYd: 70 }));
    expect(deep.log.habit).toBe('punt');
    expect(deep.log.options.map((o) => o.id)).toEqual(['go', 'punt']);
    // 36 yards to goal is a 53-yard kick: make chance 0.69 by the fixture, so in range; at 38 it is past the kicker's range.
    expect(fd(sit({ down: 4, distanceYd: 8, yardsToGoalYd: 38 }), coach(), 0, {}).log.options.some((o) => o.id === 'field_goal')).toBe(true);
    expect(fourthDown(env(['fd', 0]), { situation: sit({ down: 4, distanceYd: 8, yardsToGoalYd: 38 }), estimates: estimates(40), chart: CHART, coach: coach() }).log.options.some((o) => o.id === 'field_goal')).toBe(false);
  });

  it('rule 3: the offset applies at fourth and 1 and grows half a point per extra yard', () => {
    const c = coach({ fourthDownOffset: 2 });
    expect(fourthDownOffsetPts(sit({ down: 4, distanceYd: 1 }), c, env(['x']))).toBe(2);
    expect(fourthDownOffsetPts(sit({ down: 4, distanceYd: 5 }), c, env(['x']))).toBe(4);
  });

  it('rule 4: trailing by more than one score in the final 5 minutes halves it; trailing in the final 2 minutes removes it', () => {
    const c = coach({ fourthDownOffset: 2 }), e = env(['x']);
    expect(fourthDownOffsetPts(second({ down: 4, distanceYd: 1, scoreDiff: -10, gameSecondsLeft: 280 }), c, e)).toBe(1);
    expect(fourthDownOffsetPts(second({ down: 4, distanceYd: 1, scoreDiff: -7, gameSecondsLeft: 280 }), c, e)).toBe(2);
    expect(fourthDownOffsetPts(second({ down: 4, distanceYd: 1, scoreDiff: -3, gameSecondsLeft: 100 }), c, e)).toBe(0);
    expect(fourthDownOffsetPts(second({ down: 4, distanceYd: 1, scoreDiff: 3, gameSecondsLeft: 100 }), c, e)).toBe(2);
  });

  it('acceptance: go rate on fourth and 2 or less is monotonic in fourthDownOffset', () => {
    const states: ReturnType<typeof sit>[] = [];
    for (let ytg = 5; ytg <= 95; ytg += 5) for (const d of [1, 2]) states.push(sit({ down: 4, distanceYd: d, yardsToGoalYd: ytg }));
    const rate = (offset: number) => share(states.length, (i) => fd(states[i]!, coach({ fourthDownOffset: offset, analyticsTrust: 0 }), i).unit === 'offense');
    const rates = [-4, -2, 0, 1, 2, 4, 8].map(rate);
    for (let k = 1; k < rates.length; k++) expect(rates[k]!).toBeLessThanOrEqual(rates[k - 1]!);
    expect(rates[0]!).toBeGreaterThan(rates[rates.length - 1]!);
  });

  it('rule 5: he pre-decides on third down when the margin beats his offset by 2 points', () => {
    const s = sit({ down: 4, distanceYd: 1, yardsToGoalYd: 40 });
    const i = { situation: s, estimates: estimates(), chart: CHART, coach: coach({ fourthDownOffset: -3 }) };
    expect(twoDownTerritory(env(['x']), i)).toBe(true);
    expect(twoDownTerritory(env(['x']), { ...i, coach: coach({ fourthDownOffset: 40 }) })).toBe(false);
  });

  it('K5.1.1 rule 5: with no advisor he reads the weekly chart cell nearest the ball', () => {
    // Trailing by 10 late the live search wants to go; the neutral weekly chart says punt, and he has no advisor.
    const s = second({ down: 4, distanceYd: 2, yardsToGoalYd: 46, scoreDiff: -10, gameSecondsLeft: 200, halfSecondsLeft: 200 });
    const weekly = [{ yardsToGoalYd: 45, distanceYd: 2, model: 'punt' as const, margin: 0.01 }, { yardsToGoalYd: 20, distanceYd: 2, model: 'go' as const, margin: 0.09 }];
    const alone = fd(s, coach({}, {}, false), 3, { weekly });
    expect(alone.log.model).toBe('go');
    expect(alone.chosen).toBe('punt');
    expect(alone.log.advice).toBeNull();
    expect(fd(s, coach({}, {}, true), 3, { weekly }).chosen).toBe('go');
    expect(fd(s, coach({}, {}, false), 3, { weekly: [{ yardsToGoalYd: 45, distanceYd: 2, model: 'go' as const, margin: 0.05 }] }).chosen).toBe('go');
  });

  it('output: the unit, and the short-yardage hint to K4', () => {
    const r = fd(sit({ down: 4, distanceYd: 1, yardsToGoalYd: 1 }));
    expect(r.unit).toBe('offense');
    expect(r.shortYardage).toBe(true);
  });
});

describe('K5.3.1 one point or two', () => {
  const run = (s: ReturnType<typeof sit>, c = coach(), i = 0, rules = PRO_RULES, est: { kickTry: number; twoPoint: number } = estimates()) => tryChoice(env(['try', i], {}, rules), { situation: s, estimates: est, coach: c });

  it('acceptance: where the model margin for two exceeds 5 points, at least 90% of coaches go', () => {
    const late = second({ scoreDiff: -2, gameSecondsLeft: 40, halfSecondsLeft: 40 });
    // The bootstrap win-probability model is smooth in score (DECISIONS.md), so the scripted state pairs the
    // late deficit with a staff that rates its two-point play highly; the margin is what the acceptance conditions on.
    const est = { kickTry: 0.95, twoPoint: 0.75 };
    expect(run(late, coach(), 0, PRO_RULES, est).log.marginPts).toBeGreaterThan(5);
    const n = 2000;
    const p = share(n, (i) => {
      const d = draws('pop', i);
      const c = coach({ twoPointOffset: 1 + 1.5 * d.normal(), analyticsTrust: Math.min(0.98, Math.max(0.02, 0.5 + 0.18 * d.normal())) });
      return run(late, c, i, PRO_RULES, est).choice === 'two_point';
    });
    expect(p).toBeGreaterThanOrEqual(0.9);
  });

  it('early in a level game the habit holds: he kicks', () => {
    const r = run(sit({ scoreDiff: 0, gameSecondsLeft: 3000, halfSecondsLeft: 1200, period: 1 }), coach({ twoPointOffset: 1, analyticsTrust: 0 }));
    expect(r.choice).toBe('kick');
    expect(r.forced).toBe(false);
  });

  it('edge case: a hurt kicker moves the choice toward two', () => {
    const s = sit({ scoreDiff: 0, gameSecondsLeft: 3000, halfSecondsLeft: 1200 });
    const r = tryChoice(env(['try', 0]), { situation: s, estimates: { kickTry: 0.5, twoPoint: 0.48 }, coach: coach() });
    expect(r.choice).toBe('two_point');
  });

  it('an overtime format that requires the two-point try removes the choice (rule key, not level)', () => {
    const ot = sit({ overtime: true, period: 7, firstHalf: false, gameSecondsLeft: 0, halfSecondsLeft: 0 });
    const r = run(ot, coach({ twoPointOffset: 50 }), 0, OTHER_RULES);
    expect(r.forced).toBe(true);
    expect(r.choice).toBe('two_point');
    expect(run({ ...ot, period: 6 }, coach({ twoPointOffset: 50 }), 0, OTHER_RULES).forced).toBe(false);
    expect(run(ot, coach({ twoPointOffset: 50 }), 0, PRO_RULES).forced).toBe(false);
  });
});

describe('K5.4.1 clock mode', () => {
  const e = env(['x']);
  it('rule 2: burn starts at a two-score lead with 10 minutes left; leadProtection moves it', () => {
    expect(soundMode(e, second({ scoreDiff: 10, gameSecondsLeft: 590 }), coach(), null)).toBe('burn');
    expect(soundMode(e, second({ scoreDiff: 10, gameSecondsLeft: 700 }), coach(), null)).toBe('neutral');
    expect(soundMode(e, second({ scoreDiff: 10, gameSecondsLeft: 700 }), coach({ leadProtection: 1 }), null)).toBe('burn');
    expect(soundMode(e, second({ scoreDiff: 3, gameSecondsLeft: 500 }), coach(), null)).toBe('neutral');
    expect(soundMode(e, second({ scoreDiff: 3, gameSecondsLeft: 290 }), coach(), null)).toBe('burn');
  });

  it('rule 3: save when trailing late; deficitUrgency moves it; no lock-in when the lead shrinks', () => {
    expect(soundMode(e, second({ scoreDiff: -4, gameSecondsLeft: 280 }), coach(), null)).toBe('save');
    expect(soundMode(e, second({ scoreDiff: -4, gameSecondsLeft: 400 }), coach(), null)).toBe('neutral');
    expect(soundMode(e, second({ scoreDiff: -4, gameSecondsLeft: 400 }), coach({ deficitUrgency: 1 }), null)).toBe('save');
    expect(soundMode(e, second({ scoreDiff: -4, hasBall: false, gameSecondsLeft: 100 }), coach(), null)).toBe('save');
    expect(soundMode(e, second({ scoreDiff: 0, gameSecondsLeft: 400 }), coach(), null)).toBe('neutral');
  });

  it('rule 4 and outputs: in burn he snaps with 1 to 3 s left and K4 is told to stay in bounds', () => {
    for (let i = 0; i < 300; i++) {
      const p = clockPlan(env(['cp', i], { errors: false }), { situation: second({ scoreDiff: 10, gameSecondsLeft: 400 }), estimates: estimates(), coach: coach(), tempo: TEMPO });
      if (p.floor) continue;
      expect(p.mode).toBe('burn');
      expect(p.snapAtPlayClockS!).toBeGreaterThanOrEqual(1);
      expect(p.snapAtPlayClockS!).toBeLessThanOrEqual(3);
      expect(p.constraints).toEqual(['stay_in_bounds', 'avoid_incompletion']);
    }
  });

  it('rule 6: only a coach above clockManagement z +1 lets the offense score to get the ball back', () => {
    const s = second({ hasBall: false, scoreDiff: 1, yardsToGoalYd: 8, down: 1, gameSecondsLeft: 70, halfSecondsLeft: 70, timeoutsOwn: 0, autoStopPending: false });
    const fg = estimates().fieldGoal;
    expect(allowScore(e, s, coach({}, { clockManagement: 1.5 }), fg)).toBe(true);
    expect(allowScore(e, s, coach({}, { clockManagement: 0.5 }), fg)).toBe(false);
    expect(allowScore(e, { ...s, timeoutsOwn: 3 }, coach({}, { clockManagement: 1.5 }), fg)).toBe(false);
    expect(allowScore(e, { ...s, scoreDiff: 10 }, coach({}, { clockManagement: 1.5 }), fg)).toBe(false);
  });
});

describe('K5.4.2 end of half', () => {
  const pop = (i: number) => { const d = draws('eoh', i); return coach({ endOfHalfAggression: d.normal() }); };
  it('acceptance: 1:30, three timeouts, midfield: at least 95% attack', () => {
    const s = sit({ halfSecondsLeft: 90, gameSecondsLeft: 1890, yardsToGoalYd: 50 });
    expect(share(1000, (i) => endOfHalf(env(['e', i]), s, estimates(), pop(i))!.plan === 'attack')).toBeGreaterThanOrEqual(0.95);
  });
  it('acceptance: 0:20, no timeouts, own 20: at least 90% sit on it', () => {
    const s = sit({ halfSecondsLeft: 20, gameSecondsLeft: 1820, yardsToGoalYd: 80, timeoutsOwn: 0 });
    expect(share(1000, (i) => endOfHalf(env(['e', i]), s, estimates(), pop(i))!.plan === 'sit')).toBeGreaterThanOrEqual(0.9);
  });
  it('keeps a timeout for the field goal unit unless a spike can stop the clock, and picks the last play', () => {
    expect(endOfHalf(env(['e']), sit({ halfSecondsLeft: 10, yardsToGoalYd: 30, timeoutsOwn: 1 }), estimates(), coach())!.reserveTimeout).toBe(true);
    expect(endOfHalf(env(['e']), sit({ halfSecondsLeft: 60, yardsToGoalYd: 30, timeoutsOwn: 1 }), estimates(), coach())!.reserveTimeout).toBe(false);
    expect(endOfHalf(env(['e']), sit({ halfSecondsLeft: 5, yardsToGoalYd: 30 }), estimates(), coach())!.lastPlay).toBe('field_goal');
    expect(endOfHalf(env(['e']), sit({ halfSecondsLeft: 5, yardsToGoalYd: 55 }), estimates(), coach())!.lastPlay).toBe('hail_mary');
    expect(endOfHalf(env(['e']), sit({ halfSecondsLeft: 5, yardsToGoalYd: 90 }), estimates(), coach())!.lastPlay).toBe('kneel');
    expect(endOfHalf(env(['e']), sit({ halfSecondsLeft: 600 }), estimates(), coach())).toBeNull();
  });
});

describe('K5.4.3 kneel and spike', () => {
  const lead = (p = {}) => second({ scoreDiff: 3, gameSecondsLeft: 100, halfSecondsLeft: 100, timeoutsOpp: 0, autoStopPending: false, ...p });
  const plan = (s: ReturnType<typeof sit>, i: number, c = coach(), errors = false, tempo = TEMPO) => clockPlan(env(['k', i], { errors }), { situation: s, estimates: estimates(), coach: c, tempo });

  it('acceptance: where kneeling wins by arithmetic with the 2 s margin, every coach kneels', () => {
    expect(kneelWins(lead(), fixtureRules(PRO_RULES))).toBe(true);
    expect(kneelWins(lead({ gameSecondsLeft: 115, halfSecondsLeft: 115 }), fixtureRules(PRO_RULES))).toBe(false);
    expect(kneelWins(lead({ timeoutsOpp: 1 }), fixtureRules(PRO_RULES))).toBe(false);
    expect(kneelWins(lead({ autoStopPending: true }), fixtureRules(PRO_RULES))).toBe(false);
    expect(kneelWins(lead({ autoStopPending: true }), fixtureRules(OTHER_RULES))).toBe(true);
    let n = 0;
    for (let i = 0; i < 2000; i++) { const p = plan(lead(), i); if (!p.floor) { expect(p.kneel).toBe(true); n++; } }
    expect(n).toBeGreaterThan(1900);
  });

  it('spikes in save mode with the clock running and no timeout, never on the last down bar the floor', () => {
    const s = second({ scoreDiff: -4, gameSecondsLeft: 40, halfSecondsLeft: 40, timeoutsOwn: 0, down: 1 });
    const a = plan(s, 1);
    expect(a.mode).toBe('save');
    expect(a.spike).toBe(true);
    expect(plan({ ...s, timeoutsOwn: 2 }, 1).spike).toBe(false);
    expect(plan({ ...s, clockRunning: false }, 1).spike).toBe(false);
    expect(plan(s, 1, coach({}, { clockManagement: 1 }), false, { ...TEMPO, teamSet: true }).spike).toBe(false);
    const fourth = share(20000, (i) => { const p = plan({ ...s, down: 4 }, i); return p.spike && !p.floor; });
    expect(fourth).toBe(0);
  });

  it('K5.6.1 kneel_miscount: only within one snap of the margin, and tagged', () => {
    const near = lead({ gameSecondsLeft: 112, halfSecondsLeft: 112 });
    const bad = coach({}, { clockManagement: -2 }, false);
    const tagged = share(5000, (i) => { const p = plan(near, i, bad, true); return p.errorId === 'kneel_miscount' && p.kneel === false; });
    expect(tagged).toBeGreaterThan(0.03);
    expect(tagged).toBeLessThan(0.09);
    const far = lead({ gameSecondsLeft: 30, halfSecondsLeft: 30 });
    expect(share(5000, (i) => plan(far, i, bad, true).errorId === 'kneel_miscount')).toBe(0);
  });
});

describe('K5.5.1 timeouts', () => {
  const run = (moment: TimeoutMoment, s = second({ scoreDiff: -4, gameSecondsLeft: 100, halfSecondsLeft: 100, hasBall: false }), over = {}, i = 0, c = coach(), errors = false) =>
    timeoutDecision(env(['to', i], { errors }), { situation: s, coach: c, mode: 'save', reserveTimeout: false, moment, legal: true, ...over });

  it('acceptance: a timeout the rule set forbids is never called', () => {
    const moments: TimeoutMoment[] = [{ kind: 'delay_looming' }, { kind: 'alert', alert: 'too_many_men', costPts: 99 }, { kind: 'play_ended', canSaveS: 35, beforePuntReturn: false }, { kind: 'opponent_kick' }, { kind: 'long_drive' }];
    for (const m of moments) for (let i = 0; i < 3000; i++) {
      expect(run(m, undefined, { legal: false }, i, coach({ iceKicker: 1 }), true).call).toBe(false);
      expect(run(m, second({ timeoutsOwn: 0 }), {}, i, coach({ iceKicker: 1 }), true).call).toBe(false);
    }
  });

  it('reason 3: in save mode on defense he stops the clock at once', () => {
    const r = run({ kind: 'play_ended', canSaveS: 35, beforePuntReturn: false });
    expect(r).toEqual({ call: true, reason: 'stop_clock', waitS: 0, errorId: null });
    expect(run({ kind: 'play_ended', canSaveS: 35, beforePuntReturn: false }, undefined, { mode: 'neutral' }).call).toBe(false);
    expect(run({ kind: 'play_ended', canSaveS: 35, beforePuntReturn: false }, second({ timeoutsOwn: 1, hasBall: false }), { reserveTimeout: true }).call).toBe(false);
  });

  it('reason 1: the delay foul is weighed against the timeout; third and short late takes the timeout', () => {
    const late = second({ down: 3, distanceYd: 1, yardsToGoalYd: 4, scoreDiff: -4, gameSecondsLeft: 50, halfSecondsLeft: 50, timeoutsOwn: 3 });
    expect(run({ kind: 'delay_looming' }, late, { mode: 'save' }).reason).toBe('avoid_delay');
  });

  it('reason 4: ices the kicker at his iceKicker rate when the timeout is not needed', () => {
    const s = second({ hasBall: false, scoreDiff: 0 });
    const p = share(4000, (i) => run({ kind: 'opponent_kick' }, s, { mode: 'neutral' }, i, coach({ iceKicker: 0.35 })).reason === 'ice_kicker');
    expect(p).toBeGreaterThan(0.32);
    expect(p).toBeLessThan(0.38);
  });

  it('reason 5: rests the defense on about 5% of eligible drives, first and third quarters only', () => {
    const q1 = sit({ hasBall: false, period: 1 });
    const p = share(8000, (i) => run({ kind: 'long_drive' }, q1, { mode: 'neutral' }, i).reason === 'rest_defense');
    expect(p).toBeGreaterThan(0.04);
    expect(p).toBeLessThan(0.06);
    expect(share(8000, (i) => run({ kind: 'long_drive' }, sit({ hasBall: false, period: 2 }), { mode: 'neutral' }, i).reason === 'rest_defense')).toBe(0);
  });

  it('K5.6.1: the late two-minute timeout waits 5 to 15 s and is tagged; the punt-return miss lets it run', () => {
    const bad = coach({}, { clockManagement: -1 }, false);
    let late = 0, miss = 0;
    for (let i = 0; i < 4000; i++) {
      const a = run({ kind: 'play_ended', canSaveS: 35, beforePuntReturn: false }, undefined, {}, i, bad, true);
      if (a.errorId === 'late_two_minute_timeout') { late++; expect(a.call).toBe(true); expect(a.waitS).toBeGreaterThanOrEqual(5); expect(a.waitS).toBeLessThanOrEqual(15); }
      const b = run({ kind: 'play_ended', canSaveS: 35, beforePuntReturn: true }, undefined, {}, i, bad, true);
      if (b.errorId === 'no_timeout_before_punt_return') { miss++; expect(b.call).toBe(false); }
    }
    expect(late / 4000).toBeGreaterThan(0.2);
    expect(miss / 4000).toBeGreaterThan(0.13);
  });
});

describe('K5.5.2 challenges', () => {
  const asp = (p: Partial<ChallengeAspect> = {}): ChallengeAspect => ({ optionId: 'catch', boothReversal: 0.7, sidelineReversal: 0.5, valuePts: 6, ...p });
  const run = (aspects: ChallengeAspect[], i = 0, over = {}, c = coach(), rules = PRO_RULES, errors = false) =>
    challengeDecision(env(['ch', i], { errors }, rules), { situation: second(), coach: c, aspects, challengesUsed: 0, ...over });

  it('rule 1: challenges when estimated reversal chance times value beats the cost', () => {
    expect(run([asp()]).optionId).toBe('catch');
    expect(run([asp({ boothReversal: 0.1, valuePts: 0.4 })]).optionId).toBeNull();
  });

  it('rule 3: without the booth’s look he decides on his sideline view', () => {
    const cost = 6 * 0.5;
    expect(cost).toBe(3);
    expect(run([asp({ boothReversal: null, sidelineReversal: 0.02, valuePts: 6 })]).optionId).toBeNull();
    expect(run([asp({ boothReversal: null, sidelineReversal: 0.9, valuePts: 6 })]).optionId).toBe('catch');
  });

  it('acceptance and edge case: nothing reviewable, no challenge left, or no timeout where one is required: never', () => {
    for (let i = 0; i < 20000; i++) {
      expect(run([], i, {}, coach(), PRO_RULES, true).optionId).toBeNull();
      expect(run([asp()], i, { challengesUsed: 2 }, coach(), PRO_RULES, true).optionId).toBeNull();
      expect(run([asp()], i, { situation: second({ timeoutsOwn: 0 }) }, coach(), PRO_RULES, true).optionId).toBeNull();
    }
    expect(run([asp()], 0, { situation: second({ timeoutsOwn: 0 }) }, coach(), OTHER_RULES).optionId).toBe('catch');
  });

  it('challengeEagerness lowers the bar; the low-value error is tagged', () => {
    const weak = [asp({ boothReversal: 0.3, valuePts: 1.2 })];
    const base = share(1, () => run(weak).optionId !== null);
    const eager = share(1, () => run(weak, 0, {}, coach({ challengeEagerness: 3 })).optionId !== null);
    expect(eager).toBeGreaterThanOrEqual(base);
    const low = [asp({ boothReversal: 0.1, valuePts: 0.2 })];
    const p = share(6000, (i) => run(low, i, {}, coach({}, {}, false), PRO_RULES, true).errorId === 'low_value_challenge');
    expect(p).toBeGreaterThan(0.03);
    expect(p).toBeLessThan(0.05);
  });
});

describe('K5.6.1 the error list', () => {
  it('acceptance: every row’s chance falls with clockManagement, capped at 3 times base, cut 40% by a heard advisor', () => {
    for (const id of ERROR_IDS) {
      const zs = [-3, -2, -1, 0, 1, 2, 3].map((z) => errorChance(id, z, false, MATH));
      for (let k = 1; k < zs.length; k++) expect(zs[k]!).toBeLessThanOrEqual(zs[k - 1]!);
      expect(zs[0]!).toBeCloseTo(3 * zs[3]!, 12);
      expect(errorChance(id, 0, true, MATH)).toBeCloseTo(0.6 * zs[3]!, 12);
      expect(zs[6]!).toBeGreaterThan(0);
    }
  });

  it('acceptance: with the list disabled no decision differs from the sound one, on the same stream', () => {
    const c = { clockManagementZ: -3, advisor: false, analyticsTrust: 0, math: MATH };
    for (let i = 0; i < 2000; i++) {
      const d = draws('err', i);
      expect(errorHappens('timeout_for_delay', { ...c, enabled: false, draws: d })).toBe(false);
      const after = d.uniform();
      const d2 = draws('err', i);
      errorHappens('timeout_for_delay', { ...c, enabled: true, draws: d2 });
      expect(d2.uniform()).toBe(after);
    }
    const s = second({ scoreDiff: 10, gameSecondsLeft: 400 });
    for (let i = 0; i < 2000; i++) {
      const p = clockPlan(env(['off', i], { errors: false }), { situation: s, estimates: estimates(), coach: coach({}, { clockManagement: -3 }), tempo: TEMPO });
      expect(p.errorId).toBeNull();
    }
  });

  it('early snap with a lead: 8 to 15 s left on the play clock, more often for a weak clock manager', () => {
    const s = second({ scoreDiff: 10, gameSecondsLeft: 400 });
    const rate = (z: number) => share(4000, (i) => {
      const p = clockPlan(env(['es', i]), { situation: s, estimates: estimates(), coach: coach({}, { clockManagement: z }, false), tempo: TEMPO });
      if (p.errorId === 'early_snap_with_lead') { expect(p.snapAtPlayClockS!).toBeGreaterThanOrEqual(8); expect(p.snapAtPlayClockS!).toBeLessThanOrEqual(15); }
      return p.errorId === 'early_snap_with_lead';
    });
    expect(rate(-1.5)).toBeGreaterThan(rate(1.5));
    expect(rate(0)).toBeGreaterThan(0.08);
    expect(rate(0)).toBeLessThan(0.12);
  });
});

describe('K5.7 penalties, tosses, overtime and rest', () => {
  it('K5.7.1 acceptance: at z of 0 or more the higher win-probability option; below -1 expected points only', () => {
    const options = [{ optionId: 'accept', wp: 0.40, ep: 1.5 }, { optionId: 'decline', wp: 0.46, ep: 1.1 }];
    for (let i = 0; i < 300; i++) {
      const r = penaltyChoice(options, coach({}, { clockManagement: i % 3 }), draws('pen', i));
      if (!r.floor) expect(r.optionId).toBe('decline');
    }
    expect(penaltyChoice(options, coach({}, { clockManagement: -1.5 }), draws('pen', 0)).optionId).toBe('accept');
  });

  it('K5.7.2: defers unless the model disagrees by more than half a point; takes the wind above 12 mph', () => {
    const o = (id: string, wp: number) => ({ optionId: id, wp, ep: 0 });
    expect(tossChoice({ options: [o('receive', 0.503), o('kick', 0.49), o('defer', 0.5)], deferId: 'defer' }, draws('t', 0)).optionId).toBe('defer');
    expect(tossChoice({ options: [o('receive', 0.52), o('kick', 0.49), o('defer', 0.5)], deferId: 'defer' }, draws('t', 0)).optionId).toBe('receive');
    const goals = [o('defend_east', 0.5), o('defend_west', 0.5)];
    expect(tossChoice({ options: goals, deferId: null, wind: { mph: 20, backInFourthId: 'defend_west' } }, draws('t', 0)).optionId).toBe('defend_west');
    expect(overtimeChoice([o('offense', 0.48), o('defense', 0.52)], draws('t', 0)).optionId).toBe('defense');
  });

  it('K5.7.2 acceptance: every election is one of the legal options, under every option list', () => {
    const lists = [['receive', 'kick', 'defer'], ['receive', 'kick'], ['defend_west', 'defend_east'], ['offense', 'defense', 'defend_west', 'defend_east']];
    for (const ids of lists) for (let i = 0; i < 500; i++) {
      const d = draws('legal', ids.length, i);
      const options = ids.map((id) => ({ optionId: id, wp: d.uniform(), ep: 0 }));
      expect(ids).toContain(tossChoice({ options, deferId: ids.includes('defer') ? 'defer' : null }, d).optionId);
      expect(ids).toContain(overtimeChoice(options, d).optionId);
    }
  });

  it('K5.7.3: pulls starters past the threshold, inside 97% to 99.7%, and brings them back in a comeback', () => {
    expect(restThreshold(0)).toBe(0.99);
    expect(restThreshold(10)).toBe(0.97);
    expect(restThreshold(-10)).toBe(0.997);
    const d = () => draws('rest', 1);
    expect(restInGame({ wp: 0.995, starterRestBias: 0, pulled: false, forbidden: false }, d()).pull).toBe(true);
    expect(restInGame({ wp: 0.004, starterRestBias: 0, pulled: false, forbidden: false }, d()).pull).toBe(true);
    expect(restInGame({ wp: 0.9, starterRestBias: 0, pulled: false, forbidden: false }, d()).pull).toBe(false);
    expect(restInGame({ wp: 0.995, starterRestBias: 0, pulled: false, forbidden: true }, d()).pull).toBe(false);
    expect(restInGame({ wp: 0.93, starterRestBias: 0, pulled: true, forbidden: false }, d()).bringBack).toBe(true);
    expect(restInGame({ wp: 0.97, starterRestBias: 0, pulled: true, forbidden: false }, d()).bringBack).toBe(false);
  });

  it('K5.7.3 acceptance: no team rests starters in a game that can change its seeding', () => {
    for (let i = 0; i < 20000; i++) expect(restForSeason({ canChangeSeeding: true, starterRestBias: 3, forbidden: false }, draws('season', i))).toBe(false);
    const p = (bias: number) => share(4000, (i) => restForSeason({ canChangeSeeding: false, starterRestBias: bias, forbidden: false }, draws('season', i)));
    expect(p(1)).toBeGreaterThan(p(-1));
  });
});

describe('J11.6.1 decider', () => {
  interface V extends ViewLike { tag?: string }
  const logs: string[] = [];
  const staff: StaffPort<V> = {
    env: (v) => env(['dec', v.request.requestId], { errors: false }),
    situation: () => second({ scoreDiff: -2, gameSecondsLeft: 40, halfSecondsLeft: 40 }),
    estimates: () => estimates(),
    toss: () => ({ options: [{ optionId: 'receive', wp: 0.5, ep: 0 }, { optionId: 'defer', wp: 0.5, ep: 0 }, { optionId: 'bogus', wp: 0.9, ep: 0 }], deferId: 'defer' }),
    valued: () => [{ optionId: 'a', wp: 0.4, ep: 0 }, { optionId: 'b', wp: 0.6, ep: 0 }],
    timeout: () => ({ moment: { kind: 'play_ended', canSaveS: 30, beforePuntReturn: false }, mode: 'save', reserveTimeout: false, legal: true }),
    challenge: () => ({ aspects: [{ optionId: 'catch', boothReversal: 0.8, sidelineReversal: 0.5, valuePts: 8 }, { optionId: 'not_offered', boothReversal: 1, sidelineReversal: 1, valuePts: 50 }], challengesUsed: 0 }),
    log: (r) => { logs.push(r.decisionType); },
  };
  const ids = { none: 'none', timeout: 'timeout', tryKick: 'kick', tryTwo: 'two_point', defer: 'defer' };
  const dec = createManagementDecider<V>({ side: 1, personId: 77, coach: coach(), staff, ids });
  const req = (type: V['request']['type'], options: string[], requestId = 1, side: 0 | 1 = 1): V => ({ request: { requestId, type, side, options: options.map((optionId) => ({ optionId })), defaultOptionId: options[0] ?? null } });

  it('answers each management request with an offered option and leaves calls to K4', () => {
    expect(dec.decide(req('snapping_call', []))).toBeNull();
    expect(dec.decide(req('try_choice', ['kick', 'two_point']))!.optionId).toBe('two_point');
    expect(logs).toEqual(['try']);
    expect(dec.decide(req('toss_choice', ['receive', 'defer']))!.optionId).toBe('defer');
    expect(dec.decide(req('penalty_choice', ['a', 'b']))!.optionId).toBe('b');
    expect(dec.decide(req('timeout', ['none', 'timeout']))!.optionId).toBe('timeout');
    expect(dec.decide(req('challenge', ['none', 'catch']))!.optionId).toBe('catch');
    expect(['heads', 'tails']).toContain(dec.decide(req('toss_call', ['heads', 'tails']))!.optionId);
    const d = dec.decide(req('overtime_choice', ['a', 'b']))!;
    expect(d.actor).toEqual({ kind: 'ai', personId: 77 });
    expect(dec.decide(req('try_choice', ['kick', 'two_point'], 1, 0))).toBeNull();
  });

  it('is deterministic: the same request gives the same answer', () => {
    expect(dec.decide(req('challenge', ['none', 'catch'], 5))).toEqual(dec.decide(req('challenge', ['none', 'catch'], 5)));
  });
});

describe('K5.8.1 level differences and parameters', () => {
  it('acceptance: K5 code holds no level word and reads every rule value by key', () => {
    const dir = join(import.meta.dirname, '../../src/management');
    const declared = new Set(RULE_KEYS.map((k) => k.key));
    const used = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && x !== 'params.ts')) {
      const code = readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code).not.toMatch(/['"](college|pro|nfl|ncaa)['"]/i);
      for (const m of code.matchAll(/rules\.num\('([^']+)'\)/g)) used.add(m[1]!);
      // No bare football number: every literal above 2 outside params.ts would be a rule or tuning value.
      expect(code.replace(/'[^']*'/g, '').replace('export const PTS = 100;', '')).not.toMatch(/(?<![\w.$\]])(?:\d+\.\d+|[3-9]\d*|[12]\d+)(?![\w.])/);
    }
    expect([...used].sort()).toEqual([...declared].sort());
  });

  it('every parameter is inside its bounds and names its leaf', () => {
    for (const p of PARAMS.params) {
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
      expect(p.leaf).toMatch(/^[A-Z]\d+(\.\d+)*$/);
    }
    expect(new Set(PARAMS.params.map((p) => p.name)).size).toBe(PARAMS.params.length);
  });

  it('the suite’s decisions run under a second rule set with its own results', () => {
    const s = second({ scoreDiff: -4, gameSecondsLeft: 100, halfSecondsLeft: 100, down: 4, distanceYd: 2, yardsToGoalYd: 30 });
    const a = fourthDown(env(['lv', 0], {}, PRO_RULES), { situation: s, estimates: estimates(), chart: CHART, coach: coach() });
    const b = fourthDown(env(['lv', 0], {}, OTHER_RULES), { situation: s, estimates: estimates(), chart: CHART, coach: coach() });
    expect(['offense', 'field_goal', 'punt']).toContain(a.unit);
    expect(['offense', 'field_goal', 'punt']).toContain(b.unit);
  });
});
