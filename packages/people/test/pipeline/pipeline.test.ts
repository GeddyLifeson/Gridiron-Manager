// G-39 college-to-pro pipeline tests (T11.1.1 to T11.5.1).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seedFromNumber, stream } from '@gm/engine-core';
import { computeStatus, FactRow, ParamFile } from '@gm/schema';
import {
  makePrior, NO_LEAN, observe, update, type Contributor, type Estimate,
} from '../../src/scouting/index.ts';
import {
  accessVarianceMultiplier, accuracyRecord, againstSlotScore, againstTopOpposition, assertLevelMoveKeepsTruth,
  calibrationReport, castVariance, combineInvites, COMPETITION_TIERS, draftInterest, expectedStarter3, factIdFor,
  isProvisional, levelFactor, levelMoveDiff, makeStatement, measure, measureForty, movementCheck, normaliseProduction,
  opponentWeight, p, PARAMS, PIPELINE_FACTS, pickSupply, pickSupplyShares, PREDRAFT_STEPS, proRegard, rate, roundBand,
  roundTarget, RULE_KEYS, splitByTier, statementEvidence, statLineEvidence, statLineVariance, stepBefore,
  testingEvidence, translationOdds, trustMultiplier, usualProEntry, visitHours, type CoachStatement, type DraftOutcome,
} from '../../src/pipeline/index.ts';

const D0 = { seasonYear: 2030, dayIndex: 100 };
const SCOUT: Contributor = { id: 21, line: 'personnel' };
const COACH: Contributor = { id: 99, line: 'college-coach' };
const rng = (n: number, name = 'pipeline-test') => stream(seedFromNumber(n), name, [n]);
const skill = () => 60;

describe('fact rows (Q6, T11.4.1)', () => {
  it('every row parses, stores its computed status, and has at least one real source', () => {
    expect(PIPELINE_FACTS.length).toBeGreaterThan(150);
    for (const r of PIPELINE_FACTS) {
      FactRow.parse(r);
      expect(computeStatus(r)).toBe(r.status);
      expect(['Unverified', 'Conflict']).not.toContain(r.status);
    }
  });
  it('ids are unique', () => {
    expect(new Set(PIPELINE_FACTS.map((r) => r.id)).size).toBe(PIPELINE_FACTS.length);
  });
  it('matches the bible table (T11.4.1 by round and by position)', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((r) => roundTarget(r, 'starter3'))).toEqual([0.781, 0.581, 0.384, 0.253, 0.206, 0.118, 0.084]);
    expect([1, 2, 3, 4, 5, 6, 7].map((r) => roundTarget(r, 'probowl'))).toEqual([0.448, 0.209, 0.115, 0.075, 0.068, 0.04, 0.021]);
    expect([1, 2, 3, 4, 5, 6, 7].map((r) => roundTarget(r, 'neverPlayed'))).toEqual([0, 0.011, 0.026, 0.052, 0.114, 0.179, 0.247]);
    const qb = translationOdds(1, 'QB');
    expect([qb.starter3, qb.starter5, qb.neverStarted, qb.sample]).toEqual([0.75, 0.554, 0.054, 56]);
    const ol = translationOdds(5, 'OL');
    expect([ol.starter3, ol.starter5, ol.neverStarted, ol.sample]).toEqual([0.216, 0.137, 0.584, 510]);
    expect(rate('qb1.notStarter3')).toBe(0.25);
  });
  it('rates short of Verified print PROVISIONAL (Q6.3.1)', () => {
    expect(isProvisional('round.1.starter3')).toBe(true);
    expect(translationOdds(1, 'QB').provisional).toBe(true);
  });
  it('the snap-count cross-check is recorded but not counted as independent', () => {
    const r = PIPELINE_FACTS.find((x) => x.id === factIdFor('round.1.starter3'))!;
    expect(r.sources.length).toBe(2);
    expect(new Set(r.sources.map((s) => s.independenceGroup)).size).toBe(1);
    expect(r.status).toBe('1 of 3');
  });
});

describe('params', () => {
  it('parse as a ParamFile, every value inside its range, and the rule key list', () => {
    ParamFile.parse(PARAMS);
    for (const x of PARAMS.params) {
      expect(x.value).toBeGreaterThanOrEqual(x.min);
      expect(x.value).toBeLessThanOrEqual(x.max);
    }
    expect(RULE_KEYS).toEqual(['league_rules.draft.rounds']);
    expect(() => p('nope')).toThrow();
  });
});

describe('T11.1.1 nothing rescales at the draft', () => {
  const playing = {
    position: 'QB', lastJersey: 7, heightIn: 75, weightLb: 220,
    attributes: { throwPower: 41, accuracyShort: 38, speed: 30 },
    tests: { fortyS: 4.8 } as never, ceilings: { throwPower: 55, accuracyShort: 52, speed: 31 },
    hidden: { growthRate: 0.4 }, conditioning: 60, freshnessLongTerm: 1,
    eligibility: { college: { seasonsOfCompetitionUsed: 4, clockStartYear: 2026, redshirtUsed: false }, pro: { seasonsOnRoster: 0, accruedSeasons: 0, creditedSeasons: 0 } },
  };
  it('a draft that changes only the job row leaves every true value as it was', () => {
    const before = { id: 5, playing };
    const after = { id: 5, playing: { ...playing, freshnessLongTerm: 0.9, eligibility: { ...playing.eligibility, pro: { seasonsOnRoster: 1, accruedSeasons: 0, creditedSeasons: 0 } } } };
    expect(levelMoveDiff(before, after)).toEqual([]);
    expect(() => assertLevelMoveKeepsTruth('draft', before, after)).not.toThrow();
  });
  it('finds a changed attribute, ceiling or growth parameter, and refuses a new record', () => {
    const after = { id: 5, playing: { ...playing, attributes: { ...playing.attributes, throwPower: 60 }, hidden: { growthRate: 0.5 } } };
    expect(levelMoveDiff({ id: 5, playing }, after)).toEqual(['playing.attributes.throwPower', 'playing.hidden.growthRate']);
    expect(() => assertLevelMoveKeepsTruth('draft', { id: 5, playing }, after)).toThrow(/T11.1.1/);
    expect(() => levelMoveDiff({ id: 5, playing }, { id: 6, playing })).toThrow();
  });
  it('honours move draft interest by the manager disposition, capped, and nothing else', () => {
    expect(draftInterest({ boardGrade: 40, honourCount: 4, honourWeight: 0 })).toBe(40);
    expect(draftInterest({ boardGrade: 40, honourCount: 4, honourWeight: 1 })).toBeCloseTo(40 + 4 * p('honours.interestIssPerHonour'));
    expect(draftInterest({ boardGrade: 40, honourCount: 50, honourWeight: 1 })).toBeCloseTo(40 + p('honours.cap') * p('honours.interestIssPerHonour'));
  });
  it('no pipeline source writes to an attribute, a ceiling or a growth value', () => {
    const dir = join(__dirname, '../../src/pipeline');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const code = readFileSync(join(dir, f), 'utf8');
      expect(code).not.toMatch(/\.(attributes|ceilings|hidden)\s*(\[[^\]]*\])?\s*=[^=]/);
      expect(code).not.toMatch(/\b(attributes|ceilings)\s*:\s*\{/);
    }
  });
});

describe('T11.3.1 level discount', () => {
  it('opponent weight is 1 against equal or stronger, falls with the D6.4.5 form, and stops near 0.2', () => {
    expect(opponentWeight(40, 45)).toBe(1);
    expect(opponentWeight(40, 32)).toBe(1); // within the D6.4.5 offset
    expect(opponentWeight(40, 20)).toBeCloseTo(0.5); // 1 / (1 + 1)
    expect(opponentWeight(45, 5)).toBe(p('opponent.minWeight'));
  });
  it('level factors run from pro down to high school', () => {
    const f = COMPETITION_TIERS.map(levelFactor);
    expect(f).toEqual([1, 0.6, 0.45, 0.3, 0.2, 0.1]);
  });
  it('a lower-tier stat line carries more variance; a skill-0 evaluator ignores the discount', () => {
    const base = { seasonShare: 1, opponentGrade: 30, playerGrade: 40, castGap: 0, skill: 80 } as const;
    const power = statLineVariance({ ...base, tier: 'college_power' });
    const lower = statLineVariance({ ...base, tier: 'college_lower' });
    expect(lower).toBeGreaterThan(power * 1.5);
    const blind = statLineVariance({ ...base, tier: 'college_lower', skill: 0 });
    const blindPower = statLineVariance({ ...base, tier: 'college_power', skill: 0 });
    expect(blind).toBeCloseTo(blindPower);
    const item = statLineEvidence({ ...base, tier: 'pro', attribute: 'accuracyShort', impliedIss: 44, evaluator: SCOUT, date: D0 });
    expect(item.value).toBe(44);
  });
  it('the cast adjustment adds its own uncertainty in both directions', () => {
    expect(castVariance(0)).toBe(0);
    expect(castVariance(-10)).toBeCloseTo(castVariance(10));
    expect(castVariance(10)).toBeGreaterThan(0);
  });
  it('normalises per opportunity and by system pass rate (rule 6)', () => {
    const tempo = normaliseProduction({ total: 4000, opportunities: 500, kind: 'pass_volume', systemPassRate: 0.5, referencePassRate: 0.5 });
    const slow = normaliseProduction({ total: 3200, opportunities: 400, kind: 'pass_volume', systemPassRate: 0.5, referencePassRate: 0.5 });
    expect(tempo).toBeCloseTo(slow);
    const airRaid = normaliseProduction({ total: 4000, opportunities: 500, kind: 'pass_volume', systemPassRate: 0.65, referencePassRate: 0.5 });
    expect(airRaid).toBeLessThan(tempo);
    const runHeavyRush = normaliseProduction({ total: 1500, opportunities: 300, kind: 'rush_volume', systemPassRate: 0.35, referencePassRate: 0.5 });
    expect(runHeavyRush).toBeLessThan(5);
    expect(normaliseProduction({ total: 80, opportunities: 10, kind: 'efficiency', systemPassRate: 0.7, referencePassRate: 0.5 })).toBe(8);
  });
  it('film filter and level-split lines', () => {
    expect(againstTopOpposition([{ opponentGrade: 20 }, { opponentGrade: 40 }], 35)).toEqual([{ opponentGrade: 40 }]);
    expect(splitByTier([
      { tier: 'college_second', total: 10, opportunities: 2 },
      { tier: 'college_power', total: 30, opportunities: 4 },
      { tier: 'college_power', total: 10, opportunities: 1 },
    ])).toEqual([{ tier: 'college_power', total: 40, opportunities: 5 }, { tier: 'college_second', total: 10, opportunities: 2 }]);
  });

  // Acceptance: grade error at the draft is larger for players from lower levels.
  it('in simulation, draft-day grade error is larger for players who faced weaker opposition', () => {
    function simulate(opponentMean: number, tier: 'college_power' | 'college_lower', seed: number): { err: number; sd: number } {
      const r = rng(seed, `level-${tier}`);
      let errSum = 0;
      let sdSum = 0;
      const n = 400;
      for (let i = 0; i < n; i += 1) {
        const truth = 42 + r.normal() * 6;
        let e: Estimate = makePrior(35, 8, D0);
        for (let season = 0; season < 3; season += 1) {
          const date = { seasonYear: D0.seasonYear + season, dayIndex: 200 };
          const opp = opponentMean + r.normal() * 4;
          // Play-level film (people.scouting path), evaluator of skill 50.
          const look = { attribute: 'a', source: 'game_film' as const, units: 300, date, evaluator: SCOUT, skill: 50, estimateMean: e.mean, opponent: opp };
          e = update(e, observe(truth, look, NO_LEAN, r), 21, () => 50);
          // Whole stat line (summary path).
          const implied = truth + r.normal() * 6 + (truth - opp > 10 ? (truth - opp - 10) * 0.25 : 0);
          e = update(e, statLineEvidence({ attribute: 'a', impliedIss: implied, seasonShare: 1, tier, opponentGrade: opp, playerGrade: e.mean, castGap: 0, skill: 50, evaluator: SCOUT, date }), 21, () => 50);
        }
        errSum += Math.abs(e.mean - truth);
        sdSum += Math.sqrt(e.variance);
      }
      return { err: errSum / n, sd: sdSum / n };
    }
    const top = simulate(40, 'college_power', 1);
    const low = simulate(18, 'college_lower', 2);
    expect(low.err).toBeGreaterThan(top.err * 1.2);
    expect(low.sd).toBeGreaterThan(top.sd);
  });
});

describe('T11.4.1 translation rates and calibration', () => {
  it('round bands', () => {
    expect([1, 2, 3, 4, 7, 8].map(roundBand)).toEqual(['r1', 'r2_3', 'r2_3', 'r4_7', 'r4_7', 'r4_7']);
    expect(() => roundBand(0)).toThrow();
  });
  it('pick supply matches the bible starting values and shares sum to 1', () => {
    const s = pickSupply();
    expect([s.WR, s.QB, s.TE, s.OL]).toEqual([32.2, 12, 14.1, 43.3]);
    const shares = pickSupplyShares();
    expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  function outcomesAtTargets(shift: number): DraftOutcome[] {
    const out: DraftOutcome[] = [];
    const N = 1000;
    for (let r = 1; r <= 7; r += 1) {
      const s3 = roundTarget(r, 'starter3') + shift;
      const s5 = roundTarget(r, 'starter5') + shift;
      const pb = roundTarget(r, 'probowl');
      const ng = roundTarget(r, 'neverPlayed');
      for (let i = 0; i < N; i += 1) {
        const u = (i + 0.5) / N;
        const seasons = u < s5 ? 6 : u < s3 ? 3 : u < 0.95 ? 1 : 0;
        out.push({ round: r, group: null, seasonsAsPrimaryStarter: seasons, proBowls: u < pb ? 1 : 0, gamesPlayed: (1 - u) < ng ? 0 : 20 });
      }
    }
    // First-round quarterbacks at the real Starter 5 share.
    for (let i = 0; i < 100; i += 1) out.push({ round: 1, group: 'QB', seasonsAsPrimaryStarter: i < 55 ? 5 : 1, proBowls: 0, gamesPlayed: 10 });
    return out;
  }
  it('a simulated world at the targets passes every by-round row; one 10 points off fails', () => {
    const ok = calibrationReport(outcomesAtTargets(0), 7);
    expect(ok.byRoundPass).toBe(true);
    expect(ok.qb1Starter5Pass).toBe(true);
    expect(ok.rows.filter((x) => x.id.startsWith('round.')).length).toBe(28);
    expect(ok.rows.every((x) => x.provisional)).toBe(true);
    const off = calibrationReport(outcomesAtTargets(0.1), 7);
    expect(off.byRoundPass).toBe(false);
  });
  it('tolerance is 8 points on big real samples and 12 on small ones', () => {
    const rep = calibrationReport(outcomesAtTargets(0), 7);
    expect(rep.rows.find((x) => x.id === 'round.1.starter3')!.tolerance).toBe(0.08);
    expect(rep.rows.find((x) => x.id === 'group.TE.r1.starter3')!.tolerance).toBe(0.12); // 24 real picks
    expect(rep.rows.find((x) => x.id === 'group.TE.r1.starter3')!.pass).toBe(false); // no simulated TE picks
  });
  it('rounds the rule set has but the real table lacks are listed, not failed', () => {
    const rep = calibrationReport(outcomesAtTargets(0), 8);
    expect(rep.roundsWithoutTarget).toEqual([8]);
    expect(rep.byRoundPass).toBe(true);
  });
  it('coach movement within 50 percent of 32 and 18 a year (T11.5.1)', () => {
    expect(movementCheck({ collegeToPro: 30, proToCollege: 20 })).toEqual({ collegeToPro: true, proToCollege: true });
    expect(movementCheck({ collegeToPro: 60, proToCollege: 5 })).toEqual({ collegeToPro: false, proToCollege: false });
  });
});

describe('T11.2.1 scouts on campus', () => {
  it('statements: honest says the belief, talk up adds, decline says nothing', () => {
    const base = { coachId: 99, scoutTeamId: 3, playerId: 1, attribute: 'a', date: D0, coachBelief: 40 } as const;
    expect(makeStatement({ ...base, choice: 'honest' }).stated).toBe(40);
    expect(makeStatement({ ...base, choice: 'talk_up' }).stated).toBe(40 + p('report.talkUpIss'));
    const d = makeStatement({ ...base, choice: 'decline' });
    expect(d.stated).toBeNull();
    expect(statementEvidence(d, accuracyRecord([], () => null), COACH)).toBeNull();
  });
  it('trust falls with a poor record and with each surfaced hidden injury', () => {
    const neutral = trustMultiplier(accuracyRecord([], () => null));
    const good = trustMultiplier({ count: 40, meanAbsError: 2, hiddenInjuriesSurfaced: 0 });
    const bad = trustMultiplier({ count: 40, meanAbsError: 7, hiddenInjuriesSurfaced: 0 });
    expect(good).toBeLessThan(neutral);
    expect(bad).toBeGreaterThan(neutral);
    expect(trustMultiplier({ count: 40, meanAbsError: 2, hiddenInjuriesSurfaced: 1 })).toBeCloseTo(good * p('report.hiddenInjuryPenalty'));
  });
  it('open access narrows visit evidence; visit time per role', () => {
    expect(accessVarianceMultiplier(true)).toBeLessThan(accessVarianceMultiplier(false));
    expect(visitHours('head_coach')).toBe(1);
    expect(visitHours('position_coach')).toBeGreaterThan(1);
  });

  // Acceptance: a coach with a long honest record measurably reduces grade error on his players.
  it('in simulation, an honest coach with a long record cuts grade error; a talker does not help', () => {
    const r = rng(7, 'coach-reports');
    function history(honest: boolean): CoachStatement[] {
      const out: CoachStatement[] = [];
      for (let i = 0; i < 40; i += 1) {
        const truth = 40 + r.normal() * 6;
        out.push(makeStatement({ coachId: 99, scoutTeamId: 3, playerId: 1000 + i, attribute: 'a', date: D0, choice: honest ? 'honest' : 'talk_up', coachBelief: truth + r.normal() * 3 }));
      }
      return out;
    }
    // Scouts' settled estimate after pro evidence: close to truth, never truth itself.
    const settled = new Map<number, number>();
    function recordFor(stmts: CoachStatement[], honest: boolean) {
      for (const s of stmts) settled.set(s.playerId, (s.stated ?? 0) - (honest ? 0 : p('report.talkUpIss')) + r.normal() * 2);
      return accuracyRecord(stmts, (id) => settled.get(id) ?? null);
    }
    const honestRec = recordFor(history(true), true);
    const talkerRec = recordFor(history(false), false);
    let errNone = 0;
    let errHonest = 0;
    let errTalker = 0;
    const n = 500;
    for (let i = 0; i < n; i += 1) {
      const truth = 40 + r.normal() * 6;
      let e: Estimate = makePrior(40, 8, D0);
      const look = { attribute: 'a', source: 'game_film' as const, units: 200, date: D0, evaluator: SCOUT, skill: 60, estimateMean: 40, opponent: null };
      e = update(e, observe(truth, look, NO_LEAN, r), 21, skill);
      errNone += Math.abs(e.mean - truth);
      const belief = truth + r.normal() * 3;
      const sH = makeStatement({ coachId: 99, scoutTeamId: 3, playerId: i, attribute: 'a', date: D0, choice: 'honest', coachBelief: belief });
      const sT = makeStatement({ coachId: 98, scoutTeamId: 3, playerId: i, attribute: 'a', date: D0, choice: 'talk_up', coachBelief: belief });
      errHonest += Math.abs(update(e, statementEvidence(sH, honestRec, COACH)!, 21, skill).mean - truth);
      errTalker += Math.abs(update(e, statementEvidence(sT, talkerRec, { id: 98, line: 'college-coach-2' })!, 21, skill).mean - truth);
    }
    expect(errHonest / n).toBeLessThan((errNone / n) * 0.9);
    expect(errTalker / n).toBeGreaterThan(errHonest / n);
    expect(trustMultiplier(talkerRec)).toBeGreaterThan(trustMultiplier(honestRec) * 1.5);
  });
});

describe('T11.2.2 pre-draft steps', () => {
  it('the sequence runs season end, declaration, all-star, combine, pro days, draft, undrafted signing', () => {
    expect(PREDRAFT_STEPS[0]).toBe('season_end');
    expect(stepBefore('combine', 'pro_days')).toBe(true);
    expect(stepBefore('draft', 'combine')).toBe(false);
  });
  it('invites the top 320 by consensus grade; the rest go to pro days', () => {
    const pool = Array.from({ length: 500 }, (_, i) => ({ personId: i + 1, consensusGrade: (i * 37) % 101 }));
    const { invited, proDayOnly } = combineInvites(pool);
    expect(invited.length).toBe(320);
    expect(proDayOnly.length).toBe(180);
    const g = new Map(pool.map((x) => [x.personId, x.consensusGrade]));
    expect(Math.min(...invited.map((id) => g.get(id)!))).toBeGreaterThanOrEqual(Math.max(...proDayOnly.map((id) => g.get(id)!)));
  });
  it('a measured test has small error and no flattering bias; a skipped test gives nothing', () => {
    const r = rng(3, 'forty');
    let sum = 0;
    for (let i = 0; i < 2000; i += 1) sum += measureForty(4.6, r, false)! - 4.6;
    expect(Math.abs(sum / 2000)).toBeLessThan(0.003);
    expect(measure(4.6, 0.02, r, true)).toBeNull();
  });
  it('testing evidence is tighter than a single snap of film', () => {
    const t = testingEvidence({ attribute: 'speed', impliedIss: 45, date: D0, evaluator: SCOUT, skill: 50, estimateMean: 40 });
    const film = observe(45, { attribute: 'speed', source: 'game_film', units: 1, date: D0, evaluator: SCOUT, skill: 50, estimateMean: 40, opponent: null }, NO_LEAN, rng(4));
    expect(t.variance).toBeLessThan(film.variance);
  });
});

describe('T11.5.1 standing with pro teams', () => {
  const noRecord = { count: 0, meanAbsError: 4, hiddenInjuriesSurfaced: 0 };
  it('a coach with no history reads neutral', () => {
    expect(proRegard({ draftees: [], accuracy: noRecord, networkTies: 0, believesSystemTransfers: false }).total).toBe(50);
  });
  it('players drafted high who fail pull regard down even with many draftees', () => {
    const busts = Array.from({ length: 6 }, () => ({ round: 1, group: 'QB' as const, seasonsSinceDraft: 5, seasonsAsPrimaryStarter: 0 }));
    const hits = Array.from({ length: 6 }, () => ({ round: 5, group: 'OL' as const, seasonsSinceDraft: 5, seasonsAsPrimaryStarter: 4 }));
    expect(againstSlotScore(busts)).toBeCloseTo(-6 * expectedStarter3(1, 'QB'));
    const a = proRegard({ draftees: busts, accuracy: noRecord, networkTies: 0, believesSystemTransfers: false });
    const b = proRegard({ draftees: hits, accuracy: noRecord, networkTies: 0, believesSystemTransfers: false });
    expect(a.againstSlot).toBeLessThan(0);
    expect(b.total).toBeGreaterThan(a.total);
    // Unresolved draftees (under three seasons) count as drafted but not against slot.
    expect(againstSlotScore([{ round: 1, group: null, seasonsSinceDraft: 1, seasonsAsPrimaryStarter: 0 }])).toBe(0);
  });
  it('accuracy, network ties and a transferable system add, capped', () => {
    const r = proRegard({ draftees: [], accuracy: { count: 30, meanAbsError: 1, hiddenInjuriesSurfaced: 0 }, networkTies: 50, believesSystemTransfers: true });
    expect(r.network).toBe(p('regard.networkCap'));
    expect(r.accuracy).toBeGreaterThan(0);
    expect(r.system).toBe(p('regard.transferableSystem'));
    expect(r.total).toBeLessThanOrEqual(100);
  });
  it('usual pro entry jobs by college role (rule 4)', () => {
    expect(usualProEntry('head_coach')).toEqual(['head_coach', 'coordinator']);
    expect(usualProEntry('position_coach')).toEqual(['position_coach', 'assistant']);
  });
});
