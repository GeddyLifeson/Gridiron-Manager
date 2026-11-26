// G-95 decision record score (N4.1, N4.2, N4.4, N4.5). Values are fixtures, not facts.
import { describe, expect, it } from 'vitest';
import { DecisionLog } from '../../src/decisions/log.ts';
import type { DecisionRecord, DecisionView, GameManagementView, OptionScore } from '../../src/decisions/types.ts';
import { COMPONENTS } from '../../src/rating/components.ts';
import { limitsNote } from '../../src/rating/limits.ts';
import { PARAMS } from '../../src/rating/params.ts';
import { buildRecord, exportChain, largestLosses, selectEvidence, verifyExportedChain, verifyRecord, type RecordConditions } from '../../src/rating/record.ts';
import { clearEdge, leagueMedianPolicy, referenceFourthDownLoss, startingPolicy } from '../../src/rating/reference.ts';
import { rosterExpectation } from '../../src/rating/roster.ts';
import { gameManagementLoss, profile, type ProfileInput } from '../../src/rating/score.ts';
import { Draws } from '../../src/rating/stats.ts';
import { SEGMENT, USER, OC, record } from '../decisions/helpers.ts';

const VERSIONS = { gameVersion: '0.1.0', epModel: 'ep.test', wpModel: 'wp.test', reference: 'reference.g95.1' };
const opt = (optionId: string, value: number, half = 0.005): OptionScore => ({ optionId, value, low: value - half, high: value + half, sparse: false });

/** A fourth-down view: go and punt with the given WP values; chosen option given. */
function fourth(goWp: number, puntWp: number, chosen: 'go' | 'punt', half = 0.005): GameManagementView {
  const options = [opt('go', goWp, half), opt('punt', puntWp, half)];
  const best = goWp >= puntWp ? 'go' : 'punt';
  const bestV = Math.max(goWp, puntWp), chosenV = chosen === 'go' ? goWp : puntWp;
  const cost = bestV - chosenV, margin = 2 * half;
  return { kind: 'game_management', modelId: 'wp.test', options, chosen, best, cost, margin, class: chosen === best ? (Math.abs(goWp - puntWp) > margin ? 'clearly_right' : 'toss_up') : cost > margin ? 'clearly_wrong' : 'toss_up', lacks: [] };
}

function fourthRecord(id: string, chosen: 'go' | 'punt', gameId = 1, over: Partial<DecisionRecord> = {}): DecisionRecord {
  return record(id, 'fourth_down', {
    chosen, time: { worldDate: '2027-10-03', gameId, playIndex: 10, period: 2, gameClockTenths: 3000 },
    options: [{ optionId: 'go', labelKey: 'opt.go', detail: null }, { optionId: 'punt', labelKey: 'opt.punt', detail: null }],
    ...over,
  });
}

function logOf(items: { r: DecisionRecord; v: GameManagementView; outcome?: number }[]): DecisionLog {
  const log = DecisionLog.create(SEGMENT);
  for (const { r, v, outcome } of items) {
    log.appendDecision(r);
    log.appendModelView(r.id, v);
    log.appendTruthView(r.id, { kind: 'game_management', options: v.options, best: v.best, cost: v.cost });
    if (outcome !== undefined) log.appendOutcome(r.id, { result: { gained: outcome }, luck: null });
  }
  return log;
}

const policy = startingPolicy();
function input(views: readonly DecisionView[], over: Partial<ProfileInput> = {}): ProfileInput {
  return {
    personId: USER, views, versions: VERSIONS,
    referenceLoss: (_d, v) => referenceFourthDownLoss(v, policy),
    referenceCall: () => null,
    ...over,
  };
}
const gm = (p: ReturnType<typeof profile>) => p.components.find((c) => c.id === 'game_management')!;

describe('N4.1.1 components', () => {
  it('lists the twelve components, people and program as a description', () => {
    expect(COMPONENTS).toHaveLength(12);
    expect(COMPONENTS.find((c) => c.id === 'people_program')!.unit).toBe('description');
    expect(COMPONENTS.filter((c) => c.aggregateOnly).map((c) => c.id)).toEqual(['film_evaluation', 'player_evaluation', 'teaching_development']);
  });
  it('PARAMS are registered with bible or assumption basis and no rule keys', () => {
    expect(PARAMS.params.every((p) => p.name.startsWith('models.rating.'))).toBe(true);
    expect(PARAMS.params.find((p) => p.name === 'models.rating.shrinkageK')!.value).toBe(50);
  });
});

describe('N4.2.1 decision-based scoring', () => {
  it('an edge of 1.4 points is a close call and scores zero; 3 points with an interval above zero is a loss of 3', () => {
    expect(gameManagementLoss(fourth(0.514, 0.5, 'punt'))).toBe(0);
    const v = fourth(0.53, 0.5, 'punt');
    expect(v.class).toBe('clearly_wrong');
    expect(gameManagementLoss(v)).toBeCloseTo(0.03, 10);
    // A 3-point edge whose interval does not exclude zero is a close call too.
    expect(gameManagementLoss(fourth(0.53, 0.5, 'punt', 0.02))).toBe(0);
  });

  it('different outcomes leave every component score unchanged (outcomes never enter)', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ r: fourthRecord(`f${i}`, i % 3 ? 'go' : 'punt'), v: fourth(0.55, 0.5, i % 3 ? 'go' : 'punt') }));
    const a = profile(input(logOf(items.map((x, i) => ({ ...x, outcome: i % 5 }))).views()));
    const b = profile(input(logOf(items.map((x, i) => ({ ...x, outcome: -(i % 7) }))).views()));
    expect(a.components).toEqual(b.components);
    expect(gm(a).status).toBe('scored');
  });

  it('the reference coach scored against itself is 50 within its range', () => {
    const g = new Draws(7);
    const items = Array.from({ length: 300 }, (_, i) => {
      const goClear = i % 2 === 0;
      const chosen: 'go' | 'punt' = goClear ? (g.unit() < policy.goRateWhenGoClear ? 'go' : 'punt') : (g.unit() < policy.kickRateWhenKickClear ? 'punt' : 'go');
      return { r: fourthRecord(`r${i}`, chosen), v: goClear ? fourth(0.56, 0.52, chosen) : fourth(0.5, 0.54, chosen) };
    });
    const c = gm(profile(input(logOf(items).views())));
    expect(c.low!).toBeLessThanOrEqual(50);
    expect(c.high!).toBeGreaterThanOrEqual(50);
  });

  it('a coach who follows the model on every clear fourth down scores above 50', () => {
    const items = Array.from({ length: 200 }, (_, i) => {
      const goClear = i % 2 === 0;
      const chosen: 'go' | 'punt' = goClear ? 'go' : 'punt';
      return { r: fourthRecord(`m${i}`, chosen), v: goClear ? fourth(0.56, 0.52, chosen) : fourth(0.5, 0.54, chosen) };
    });
    const c = gm(profile(input(logOf(items).views())));
    expect(c.score!).toBeGreaterThan(50);
    expect(c.low!).toBeGreaterThan(50);
  });

  it('shrinks small samples toward 50 and flags under 50 decisions as mostly prior', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ r: fourthRecord(`s${i}`, 'go'), v: fourth(0.56, 0.52, 'go') }));
    const p = profile(input(logOf(items).views()));
    expect(gm(p).mostlyPrior).toBe(true);
    expect(limitsNote(p).sample.mostlyPrior).toContain('game_management');
    const few = profile(input(logOf(items.slice(0, 5)).views()));
    expect(gm(few).status).toBe('not_enough_evidence');
  });

  it('credits an accepted suggestion at half weight to each side and drops delegated calls', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      r: fourthRecord(`a${i}`, 'go', 1, { attribution: i < 10 ? { creditedPersonId: USER, basis: 'suggestion_taken', viaPersonId: OC } : { creditedPersonId: USER, basis: 'delegated', viaPersonId: OC } }),
      v: fourth(0.56, 0.52, 'go'),
    }));
    const views = logOf(items).views();
    const mine = gm(profile(input(views)));
    expect(mine.n).toBe(5);
    expect(mine.delegated).toBe(10);
    expect(gm(profile(input(views, { personId: OC }))).n).toBe(5);
  });

  it('a fully delegated component is not certified for the user (N4.3.1 rule 6)', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ r: fourthRecord(`d${i}`, 'go', 1, { attribution: { creditedPersonId: USER, basis: 'delegated', viaPersonId: OC } }), v: fourth(0.56, 0.52, 'go') }));
    expect(gm(profile(input(logOf(items).views()))).certifiedForUser).toBe(false);
  });

  it('two runs with the same inputs give the same score and range', () => {
    const items = Array.from({ length: 80 }, (_, i) => ({ r: fourthRecord(`t${i}`, i % 4 ? 'go' : 'punt'), v: fourth(0.56, 0.52, i % 4 ? 'go' : 'punt') }));
    expect(profile(input(logOf(items).views()))).toEqual(profile(input(logOf(items).views())));
  });

  it('truth-scored components show season aggregates only, never item ids', () => {
    const external = Array.from({ length: 40 }, (_, i) => ({ component: 'film_evaluation' as const, diff: i % 2 ? 0.1 : 0, recordId: `film:${i}`, seasonYear: 2027 + (i % 2), worldDate: '2027-11-01' }));
    const c = profile(input([], { external })).components.find((x) => x.id === 'film_evaluation')!;
    expect(c.status).toBe('scored');
    expect(c.evidence).toEqual([]);
    expect(c.seasons.map((s) => s.seasonYear)).toEqual([2027, 2028]);
  });

  it('refuses to score components whose model misses the 0.01 calibration check', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ r: fourthRecord(`c${i}`, 'go'), v: fourth(0.56, 0.52, 'go') }));
    expect(gm(profile(input(logOf(items).views(), { calibration: { ep: 0.005, wp: 0.02 } }))).status).toBe('model_not_calibrated');
  });

  it('no headline number unless turned on', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ r: fourthRecord(`h${i}`, 'go'), v: fourth(0.56, 0.52, 'go') }));
    const views = logOf(items).views();
    expect(profile(input(views)).headline).toBeNull();
    expect(profile(input(views, { showHeadline: true })).headline).not.toBeNull();
  });
});

describe('N4.2.3 reference coach', () => {
  it('a close call costs the reference coach nothing; a clear go costs half the edge at the 50% go rate', () => {
    expect(referenceFourthDownLoss(fourth(0.51, 0.5, 'go'), policy)).toBe(0);
    expect(referenceFourthDownLoss(fourth(0.56, 0.52, 'go'), policy)).toBeCloseTo(0.02, 10);
    expect(referenceFourthDownLoss(fourth(0.5, 0.54, 'punt'), policy)).toBeCloseTo(0.002, 10);
    expect(clearEdge(fourth(0.56, 0.52, 'go'))!.best).toBe('go');
  });
  it('takes the league median after a season of AI decisions', () => {
    const downs = [1, 2, 3].flatMap((coachId) => Array.from({ length: 10 }, (_, i) => ({ coachId, view: fourth(0.56, 0.52, i < coachId * 2 ? 'go' : 'punt') })));
    const p = leagueMedianPolicy(2027, downs, policy);
    expect(p.source).toBe('league_median');
    expect(p.goRateWhenGoClear).toBeCloseTo(0.4, 10);
    expect(p.kickRateWhenKickClear).toBe(policy.kickRateWhenKickClear);
  });
});

describe('N4.2.2 results beside the roster', () => {
  it('6 games under one coach shows too few games to say', () => {
    expect(rosterExpectation(4, 6, [1, 2, 3, 4, 5, 6], 'public_estimate').words).toBe('too_few_games');
  });
  it('the reference coach on the same roster lands near the 50th percentile (45 to 55 over 100 seasons)', () => {
    const g = new Draws(11);
    const season = (): number => { let w = 0; for (let k = 0; k < 17; k++) if (g.unit() < 0.5) w++; return w; };
    const pcts: number[] = [];
    for (let s = 0; s < 100; s++) {
      const runs = Array.from({ length: 200 }, season);
      pcts.push(rosterExpectation(season(), 17, runs, 'public_estimate').percentile);
    }
    pcts.sort((a, b) => a - b);
    const median = (pcts[49]! + pcts[50]!) / 2;
    expect(median).toBeGreaterThanOrEqual(45);
    expect(median).toBeLessThanOrEqual(55);
  });
});

describe('N4.4.1 coaching record', () => {
  const conditions: RecordConditions = { certified: true, certifiedBrokenReason: null, certifiedRuleset: 'certified.1', gameVersions: ['0.1.0'], peoplePackChecksum: null, seasons: [2027], jobs: [{ rung: 'job.head_coach', teamId: 3, from: '2027-02-01', to: null }] };
  const items = Array.from({ length: 30 }, (_, i) => ({ r: fourthRecord(`e${i}`, i % 3 ? 'go' : 'punt'), v: fourth(0.5 + 0.01 * (i % 7), 0.5, i % 3 ? 'go' : 'punt') }));
  const log = logOf(items);
  const p = profile(input(log.views()));
  const make = (chosen: string[] = ['e1', 'e2']) => buildRecord({ name: ' Test Coach ', profile: p, entries: log.entries, conditions, results: [{ seasonYear: 2027, teamId: 3, wins: 9, losses: 8, ties: 0, pointMargin: 12, completed: true, roster: null, rosterTrue: rosterExpectation(9, 17, [8, 9, 10], 'true_attributes') }], chosenEvidence: chosen });

  it('verifies, holds every credited decision, and redacts truth views', () => {
    const rec = make();
    expect(verifyRecord(rec)).toEqual({ ok: true, problems: [] });
    expect(rec.decisions).toHaveLength(30);
    expect(rec.name).toBe('Test Coach');
    expect(JSON.stringify(rec)).not.toContain('"truth_view","decisionId"');
    expect(rec.chain.entries.some((e) => 'redacted' in e)).toBe(true);
    expect(rec.results[0]!.rosterTrue).toBeUndefined(); // switch off until Marlon decides
  });

  it('always includes the 5 largest losses, and they cannot be removed', () => {
    const rec = make();
    const forced = largestLosses(rec.decisions);
    expect(forced).toHaveLength(5);
    for (const id of forced) expect(rec.evidence.map((e) => e.decisionId)).toContain(id);
    const removed = { ...rec, evidence: rec.evidence.filter((e) => e.decisionId !== forced[0]) };
    expect(verifyRecord(removed).ok).toBe(false);
    expect(() => selectEvidence(Array.from({ length: 11 }, (_, i) => `e${i}`), rec.decisions)).toThrow(/at most 10/);
  });

  it('altering one record makes verification fail', () => {
    const rec = make();
    const decisions = rec.decisions.map((d, i) => (i === 3 ? { ...d, record: { ...d.record, chosen: d.record.chosen === 'go' ? 'punt' : 'go' } } : d));
    expect(verifyRecord({ ...rec, decisions }).ok).toBe(false);
    const entries = rec.chain.entries.map((e, i) => (i === 4 && !('redacted' in e) && e.payload.kind === 'decision' ? { ...e, payload: { ...e.payload, record: { ...e.payload.record, chosen: 'x' } } } : e));
    expect(verifyExportedChain(entries).ok).toBe(false);
    expect(verifyExportedChain(exportChain(log.entries)).ok).toBe(true);
  });
});
