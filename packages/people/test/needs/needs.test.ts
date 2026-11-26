import { describe, expect, it } from 'vitest';
import { EventTypeDef, ParamFile, type PersonState } from '@gm/schema';
import {
  PARAMS, STARTING_NEEDS, STARTING_CLASS_WEIGHTS, validateNeedRegistry, needWeights, applyCultureOverrides,
  nextCareerStage, stepNeedLevel, newReference, observeReference, rollReference, referenceMultiplier,
  stepStress, bandFor, decayPerWeek, capEvent, droppedGoalHit, overruledHit, startingStress, recordTalk, settleTalks, EMPTY_MEMO,
  weekOutcomes, actChance, spacingBlocks, finalStraw, applyRelease, largestUnmetNeed, FORMAL_ACTS,
  habitWeights, stepCoping, pickHabit, updatePerson, updateCadence, shouldUpdate, engineTraits, isProtected,
  NEEDS_EVENT_TYPES, PROTECTED_ALLOWED_ACTS,
  type ActCandidate, type StressBand, type StressMemo, type NeedDef, type FormalAct, type LastAct,
} from '../../src/needs/index.ts';
import { lcg } from './helpers.ts';

const need = (id: string) => STARTING_NEEDS.find((n) => n.id === id)!;
const neutral = { facets: {}, values: {} };

describe('params and content', () => {
  it('parameter file validates and every name is unique', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    expect(new Set(PARAMS.params.map((p) => p.name)).size).toBe(PARAMS.params.length);
    for (const p of PARAMS.params) expect(p.value >= p.min && p.value <= p.max, p.name).toBe(true);
  });
  it('event types validate, and personal types are never allowed on imported people', () => {
    for (const t of NEEDS_EVENT_TYPES) expect(() => EventTypeDef.parse(t), t.id).not.toThrow();
    expect(NEEDS_EVENT_TYPES.find((t) => t.id === 'coping_started')!.importedAllowed).toBe(false);
    expect(NEEDS_EVENT_TYPES.find((t) => t.id === 'effort_dropped')!.importedAllowed).toBe(false);
  });
  it('registry validation: the starting set passes, a need with no reader or relief fails', () => {
    expect(validateNeedRegistry(STARTING_NEEDS)).toEqual([]);
    const bad: NeedDef = { ...need('pay'), id: 'x', readers: [], relief: [], buildRate: 9 };
    const msgs = validateNeedRegistry([bad]).map((p) => p.message).join('|');
    expect(msgs).toMatch(/no reader/);
    expect(msgs).toMatch(/no relief/);
    expect(msgs).toMatch(/build rate/);
  });
});

describe('X5.1.1 need weights', () => {
  const backup = (ego: number) => needWeights({ kind: 'player', classIds: ['backup'], facets: { ego }, values: {}, isUser: false }, STARTING_NEEDS, STARTING_CLASS_WEIGHTS);
  it('ego changes role weight (acceptance: two backups differing only in ego)', () => {
    expect(backup(85).role_and_respect!).toBeGreaterThan(backup(20).role_and_respect!);
  });
  it('a person in two classes takes the higher weight per need', () => {
    const both = needWeights({ kind: 'player', classIds: ['veteran', 'backup'], ...neutral, isUser: false }, STARTING_NEEDS, STARTING_CLASS_WEIGHTS);
    expect(both.playing_time).toBe(0.8); // backup row
    expect(both.role_and_respect).toBe(0.8); // veteran row
  });
  it('the user person has no need vector', () => {
    expect(needWeights({ kind: 'coach', classIds: ['head_coach'], ...neutral, isUser: true }, STARTING_NEEDS, STARTING_CLASS_WEIGHTS)).toEqual({});
  });
  it('a need that does not apply to a person kind is not stored', () => {
    const w = needWeights({ kind: 'owner', classIds: ['owner'], ...neutral, isUser: false }, STARTING_NEEDS, STARTING_CLASS_WEIGHTS);
    expect(Object.keys(w).sort()).toEqual(['autonomy', 'winning']);
  });
  it('a culture override at one team changes class weights for its people only', () => {
    const team = applyCultureOverrides(STARTING_CLASS_WEIGHTS, { 'backup.playing_time': 0.2 });
    const here = needWeights({ kind: 'player', classIds: ['backup'], ...neutral, isUser: false }, STARTING_NEEDS, team);
    const there = needWeights({ kind: 'player', classIds: ['backup'], ...neutral, isUser: false }, STARTING_NEEDS, STARTING_CLASS_WEIGHTS);
    expect(here.playing_time).toBe(0.2);
    expect(there.playing_time).toBe(0.8);
    expect(STARTING_CLASS_WEIGHTS.find((r) => r.classId === 'backup')!.weights.playing_time).toBe(0.8);
  });
  it('protected people carry the neutral block, so their weights are the class row only (X5.5.1)', () => {
    const t = engineTraits({ origin: 'imported', traitBlock: { facets: { ego: 99 }, values: { money: 50 } } });
    const w = needWeights({ kind: 'player', classIds: ['starter'], ...t, isUser: false }, STARTING_NEEDS, STARTING_CLASS_WEIGHTS);
    const row = STARTING_CLASS_WEIGHTS.find((r) => r.classId === 'starter')!.weights;
    for (const [k, v] of Object.entries(w)) expect(v, k).toBe(row[k] ?? 0);
  });
});

describe('X5.1.1 career stages', () => {
  it('changes only on a qualifying event, once per change', () => {
    expect(nextCareerStage('entering', 'game_played', { seasonsAtLevel: 3, age: 23 })).toBeNull();
    expect(nextCareerStage('entering', 'season_rollover', { seasonsAtLevel: 1, age: 22 })).toBe('establishing');
    expect(nextCareerStage('establishing', 'season_rollover', { seasonsAtLevel: 1, age: 22 })).toBeNull();
    expect(nextCareerStage('prime', 'retired', { seasonsAtLevel: 8, age: 31 })).toBe('post_playing');
    expect(nextCareerStage('entry', 'promoted', { seasonsAtLevel: 1, age: 28 })).toBe('rising');
  });
  it('a player who changes level re-enters at entering', () => {
    expect(nextCareerStage('prime', 'level_changed', { seasonsAtLevel: 0, age: 22 })).toBe('entering');
    expect(nextCareerStage('entering', 'level_changed', { seasonsAtLevel: 0, age: 22 })).toBeNull();
  });
});

describe('X5.1.2 need levels and reference points', () => {
  it('no need goes from met to maximal in under half a season, even with a large reference gap', () => {
    for (const def of STARTING_NEEDS) {
      const ref = { needId: def.id, seasonBest: {}, reference: 100 };
      let level = 0;
      let weeks = 0;
      while (level < 100) { level = stepNeedLevel(level, def, { met: 0, current: 0 }, ref); weeks += 1; }
      expect(weeks, def.id).toBeGreaterThanOrEqual(13);
    }
  });
  it('a demoted three-year starter builds faster than a career backup in the same role', () => {
    const starter = observeReference(newReference('playing_time', 2030, 90), 2031, 95);
    const career = newReference('playing_time', 2031, 10);
    const a = stepNeedLevel(0, need('playing_time'), { met: 0.2, current: 10 }, starter);
    const b = stepNeedLevel(0, need('playing_time'), { met: 0.2, current: 10 }, career);
    expect(a).toBeGreaterThan(b);
    expect(referenceMultiplier(starter, 10)).toBeGreaterThan(1);
  });
  it('the reference falls a quarter of the gap per season', () => {
    const r = rollReference({ needId: 'pay', seasonBest: { 2030: 80 }, reference: 80 }, 2031, 40);
    expect(r.reference).toBe(70);
  });
  it('meeting the need lowers its level, and relief events lower it by their size', () => {
    expect(stepNeedLevel(50, need('pay'), { met: 1 }, undefined)).toBeLessThan(50);
    expect(stepNeedLevel(50, need('pay'), { met: 0.5, reliefSources: ['contract_signed'] }, undefined)).toBe(0);
  });
});

function runStress(start: number, weeks: number, levels: Record<string, number>, weights: Record<string, number>, patience = 50) {
  let s = start; let band: StressBand = bandFor(start, 'settled'); let memo: StressMemo = EMPTY_MEMO;
  const trace: number[] = [];
  for (let i = 0; i < weeks; i++) {
    const r = stepStress(s, band, memo, { needLevels: levels, weights, events: [], patience });
    s = r.stress; band = r.band; memo = r.memo; trace.push(s);
  }
  return { s, band, trace };
}

describe('X5.2.1 stress (acceptance)', () => {
  it('with every need met, stress falls from 500 to 0 within one calendar year at every patience', () => {
    for (const patience of [0, 25, 50, 100]) expect(runStress(500, 52, { pay: 0 }, { pay: 1 }, patience).s, String(patience)).toBe(0);
  });
  it('one fully unmet need at weight 1 takes at least 13 weeks to cross a 250-point band at every patience', () => {
    for (const patience of [0, 25, 50, 75, 100]) {
      const { trace } = runStress(0, 40, { pay: 100 }, { pay: 1 }, patience);
      expect(trace.findIndex((x) => x >= 250) + 1).toBeGreaterThanOrEqual(13);
    }
  });
  it('one maximal event moves stress by no more than 60', () => {
    const r = stepStress(300, 'unsettled', EMPTY_MEMO, { needLevels: {}, weights: {}, events: [{ source: 'benched_in_public', size: 500 }], patience: 100 });
    expect(r.stress - 300 + decayPerWeek(100)).toBeLessThanOrEqual(60);
    expect(capEvent(-500)).toBe(-60);
    expect(droppedGoalHit(80).size).toBe(48);
    expect(droppedGoalHit(100).size).toBe(60);
  });
  it('patience scales decay around 12 points a week, up to 1.5 times', () => {
    expect(decayPerWeek(0)).toBeCloseTo(10.2);
    expect(decayPerWeek(50)).toBe(12);
    expect(decayPerWeek(100)).toBe(18);
  });
  it('overruled against his grain: up to 20, a fitting order relieves up to 5, never for the user or protected people', () => {
    expect(overruledHit(1, { isUser: false, isProtected: false })!.size).toBe(20);
    expect(overruledHit(-1, { isUser: false, isProtected: false })!.size).toBe(-5);
    expect(overruledHit(1, { isUser: true, isProtected: false })).toBeNull();
    expect(overruledHit(1, { isUser: false, isProtected: true })).toBeNull();
  });
  it('a talk alone gives a small relief that is lost, with a penalty, if nothing changes within 4 weeks', () => {
    const t = recordTalk(EMPTY_MEMO, 'playing_time', 60);
    expect(t.relief.size).toBeLessThan(0);
    const later = { ...t.memo, week: 4 };
    const unchanged = settleTalks(later, { playing_time: 64 });
    expect(unchanged.events).toHaveLength(1);
    expect(unchanged.events[0]!.size).toBeGreaterThan(-t.relief.size);
    expect(settleTalks(later, { playing_time: 30 }).events).toHaveLength(0);
    expect(unchanged.memo.talks).toHaveLength(0);
  });
  it('generated people start between 0 and 200', () => {
    const d = lcg(7);
    for (let i = 0; i < 500; i++) { const s = startingStress(d); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(200); }
  });
});

describe('X5.2.3 bands', () => {
  it('bands are 250 wide and moving down needs 50 below the line', () => {
    expect(bandFor(249, 'settled')).toBe('settled');
    expect(bandFor(250, 'settled')).toBe('unsettled');
    expect(bandFor(760, 'settled')).toBe('at_breaking_point');
    expect(bandFor(230, 'unsettled')).toBe('unsettled');
    expect(bandFor(199, 'unsettled')).toBe('settled');
    expect(bandFor(460, 'at_breaking_point')).toBe('unhappy');
    expect(bandFor(420, 'at_breaking_point')).toBe('unsettled');
  });
  it('no breakpoint on a week with only one stress event and met needs', () => {
    const r = stepStress(245, 'settled', EMPTY_MEMO, { needLevels: { pay: 0 }, weights: { pay: 1 }, events: [{ source: 'benched_in_public', size: 60 }], patience: 50 });
    expect(r.stress).toBeGreaterThanOrEqual(250);
    expect(r.band).toBe('settled');
    // A second push the next week does cross.
    const r2 = stepStress(r.stress, r.band, r.memo, { needLevels: { pay: 0 }, weights: { pay: 1 }, events: [{ source: 'criticised', size: 30 }], patience: 50 });
    expect(r2.band).toBe('unsettled');
  });
});

const cand = (over: Partial<ActCandidate> & { personId: number }): ActCandidate => ({
  stress: 800, band: 'at_breaking_point', memo: { ...EMPTY_MEMO, week: 100, bandWeeks: 3, recent: [{ source: 'need:playing_time', amount: 30, week: 100 }] },
  needLevels: { playing_time: 90 }, weights: { playing_time: 1 }, loyalty: 0, candor: 50, isProtected: false, isUser: false,
  legalActs: [...FORMAL_ACTS], lastAct: null, actHistory: [], warned: true, ...over,
});
const always = () => 0;

describe('X5.2.3 outcomes', () => {
  it('acts only after two straight weeks at the breaking point', () => {
    expect(weekOutcomes([cand({ personId: 1, memo: { ...cand({ personId: 1 }).memo, bandWeeks: 1 } })], always).outcomes).toHaveLength(0);
    expect(weekOutcomes([cand({ personId: 1 })], always).outcomes).toHaveLength(1);
  });
  it('an unhappy person with mild or higher candor asks for a meeting first; a low-candor person gives no warning', () => {
    const o = weekOutcomes([cand({ personId: 1, band: 'unhappy', warned: false })], always).outcomes;
    expect(o).toEqual([{ personId: 1, kind: 'meeting_requested', needId: 'playing_time' }]);
    expect(weekOutcomes([cand({ personId: 1, band: 'unhappy', warned: false, candor: 10 })], always).outcomes).toHaveLength(0);
    const silent = weekOutcomes([cand({ personId: 1, warned: false, candor: 10 })], always).outcomes;
    expect(silent[0]!.kind).toBe('trade_requested');
  });
  it('the act matches the need and what is legal; with no legal act he stays', () => {
    const pay = weekOutcomes([cand({ personId: 1, needLevels: { pay: 90 }, weights: { pay: 1 }, legalActs: ['holdout_started', 'trade_requested'] })], always).outcomes[0]!;
    expect(pay.kind).toBe('holdout_started');
    const portal = weekOutcomes([cand({ personId: 1, legalActs: ['portal_entry'] })], always).outcomes[0]!;
    expect(portal.kind).toBe('portal_entry');
    expect(weekOutcomes([cand({ personId: 1, legalActs: [] })], always).outcomes).toHaveLength(0);
  });
  it('loyalty lowers the weekly chance from 15 percent', () => {
    expect(actChance(0)).toBeCloseTo(0.15);
    expect(actChance(100)).toBeLessThan(actChance(0));
  });
  it('team cap: at most 2 formal acts a week, highest stress first; the rest are deferred; an open window releases all', () => {
    const cs = [1, 2, 3, 4].map((i) => cand({ personId: i, stress: 750 + i * 10 }));
    const w = weekOutcomes(cs, always);
    expect(w.outcomes.map((o) => o.personId)).toEqual([4, 3]);
    expect(w.deferred).toEqual([2, 1]);
    expect(weekOutcomes(cs, always, true).outcomes).toHaveLength(4);
    // Deferred people act next week without a new draw; one who fell below the band is dropped.
    const next = weekOutcomes([cand({ personId: 2 }), cand({ personId: 1, band: 'unhappy' })], () => 0.99, false, w.deferred);
    expect(next.outcomes.map((o) => o.personId)).toEqual([2]);
  });
  it('every formal act names a final straw from the three largest recent contributors', () => {
    const recent = [
      { source: 'need:playing_time', amount: 30, week: 10 }, { source: 'benched_in_public', amount: 40, week: 9 },
      { source: 'need:pay', amount: 5, week: 10 }, { source: 'criticised', amount: 20, week: 8 }, { source: 'old', amount: 99, week: 2 },
    ];
    const seen = new Set<string>();
    const d = lcg(3);
    for (let i = 0; i < 200; i++) seen.add(finalStraw(recent, 10, d));
    expect([...seen].sort()).toEqual(['benched_in_public', 'criticised', 'need:playing_time']);
  });
  it('protected people: football-ordinary acts only, never effort dropped or a holdout', () => {
    const p = weekOutcomes([cand({ personId: 1, isProtected: true, needLevels: { pay: 90 }, weights: { pay: 1 }, legalActs: ['holdout_started', 'effort_dropped'] })], always);
    expect(p.outcomes).toHaveLength(0);
    const ok = weekOutcomes([cand({ personId: 1, isProtected: true, legalActs: ['effort_dropped', 'trade_requested'] })], always);
    expect(ok.outcomes[0]!.kind).toBe('trade_requested');
    expect(PROTECTED_ALLOWED_ACTS).not.toContain('effort_dropped');
  });
  it('the user never appears', () => {
    expect(weekOutcomes([cand({ personId: 1, isUser: true })], always).outcomes).toHaveLength(0);
  });
});

describe('X5.2.4 release and spacing', () => {
  it('a formal act releases 150 points', () => {
    expect(applyRelease(800)).toBe(650);
    expect(applyRelease(100)).toBe(0);
  });
  it('same act within 26 weeks and any act within 8 weeks are blocked, except a legal next step', () => {
    const last: LastAct = { week: 100, kind: 'effort_dropped' };
    expect(spacingBlocks('effort_dropped', 120, last, [last])).toBe(true);
    expect(spacingBlocks('effort_dropped', 126, null, [last])).toBe(false);
    expect(spacingBlocks('resigned', 104, last, [last])).toBe(true);
    expect(spacingBlocks('trade_requested', 104, last, [last])).toBe(false);
    expect(spacingBlocks('trade_requested', 108, last, [last])).toBe(false);
  });
});

describe('X5.2.4 coping', () => {
  const subj = { isUser: false, isProtected: false, age: 25, facets: { discipline: 10, composure: 10, faith: 80, sociability: 50, work_habits: 50 }, hasWarmEdge: true };
  it('starts after 4 straight strained weeks and stops after 4 settled weeks', () => {
    expect(stepCoping(null, subj, { week: 3, strainedWeeks: 3, settledWeeks: 0 }, false, always).kind).toBe('none');
    const s = stepCoping(null, subj, { week: 4, strainedWeeks: 4, settledWeeks: 0 }, false, always);
    expect(s.kind).toBe('started');
    const rec = (s as { record: { copingId: 'extra_work'; sinceWeek: number } }).record;
    expect(stepCoping(rec, subj, { week: 9, strainedWeeks: 0, settledWeeks: 4 }, false, always).kind).toBe('stopped');
  });
  it('protected people never cope by going out late, venting in public or faith practice; minors never go out late or vent', () => {
    const p = habitWeights({ ...subj, isProtected: true });
    expect(p.going_out_late).toBe(0); expect(p.venting_public).toBe(0); expect(p.faith_practice).toBe(0);
    const m = habitWeights({ ...subj, age: 17 });
    expect(m.going_out_late).toBe(0); expect(m.venting_public).toBe(0);
    const d = lcg(11);
    for (let i = 0; i < 300; i++) expect(['going_out_late', 'venting_public', 'faith_practice']).not.toContain(pickHabit({ ...subj, isProtected: true }, d));
  });
  it('confiding needs a warm edge; faith practice needs faith of mild or higher', () => {
    expect(habitWeights({ ...subj, hasWarmEdge: false }).confiding).toBe(0);
    expect(habitWeights({ ...subj, facets: { ...subj.facets, faith: 5 } }).faith_practice).toBe(0);
  });
  it('the user never holds a coping record', () => {
    expect(stepCoping(null, { ...subj, isUser: true }, { week: 9, strainedWeeks: 9, settledWeeks: 0 }, false, always).kind).toBe('none');
  });
});

describe('X5.5.1 tiers and protected people', () => {
  it('tier 1 on events, tier 2 weekly, tier 3 at season points', () => {
    expect(updateCadence(1)).toBe('event');
    expect(shouldUpdate(2, 'event')).toBe(false);
    expect(shouldUpdate(2, 'week_end')).toBe(true);
    expect(shouldUpdate(3, 'week_end')).toBe(false);
    expect(shouldUpdate(3, 'season_point')).toBe(true);
    expect(isProtected({ origin: 'imported' })).toBe(true);
    expect(isProtected({ origin: 'generated' })).toBe(false);
  });
});

const baseState = (personId: number): PersonState => ({ personId, needs: {}, stress: 0, stressBand: 'settled', lastAct: null, coping: null });

describe('person update', () => {
  it('throws for the user person', () => {
    expect(() => updatePerson({
      person: { id: 1, origin: 'user', age: 40 }, state: baseState(1), memo: EMPTY_MEMO, coping: null, needs: STARTING_NEEDS, weights: {},
      conditions: {}, references: {}, events: [], facets: {}, hasWarmEdge: false, copingAddressed: false, today: { seasonYear: 2030, dayIndex: 0 },
    }, always)).toThrow();
  });
  it('a strained protected person never gets a coping or effort event; a generated one does get coping events', () => {
    const run = (origin: 'imported' | 'generated') => {
      let state = baseState(1); let memo = EMPTY_MEMO; let coping = null as ReturnType<typeof updatePerson>['coping'];
      const events: string[] = [];
      const d = lcg(5);
      for (let w = 0; w < 60; w++) {
        const r = updatePerson({
          person: { id: 1, origin, age: 25 }, state, memo, coping, needs: STARTING_NEEDS, weights: { playing_time: 1, pay: 1 },
          conditions: { playing_time: { met: 0 }, pay: { met: 0 } }, references: {}, events: [], facets: { discipline: 5, composure: 5 },
          hasWarmEdge: false, copingAddressed: false, today: { seasonYear: 2030, dayIndex: w * 7 },
        }, d);
        state = r.state; memo = r.memo; coping = r.coping; events.push(...r.events.map((e) => e.type));
      }
      return { events, state };
    };
    const imp = run('imported');
    expect(imp.events.filter((e) => e.startsWith('coping'))).toEqual([]);
    expect(imp.state.stress).toBeGreaterThan(250);
    const gen = run('generated');
    expect(gen.events).toContain('coping_started');
    expect(gen.events).toContain('stress_band_changed');
  });
});

describe('30-season soak (X5.2.3, X5.2.4 acceptance)', () => {
  it('no repeat inside spacing, warnings before acts unless low candor, at most 2 acts a team-week outside windows, no protected effort or coping', () => {
    const d = lcg(20261126);
    const people = Array.from({ length: 53 }, (_, i) => ({
      id: i + 1, origin: (i % 9 === 0 ? 'imported' : 'generated') as 'imported' | 'generated',
      loyalty: Math.floor(d() * 100), candor: Math.floor(d() * 100), patience: Math.floor(d() * 100),
      state: { ...baseState(i + 1), stress: startingStress(d) } as PersonState, memo: EMPTY_MEMO, coping: null as ReturnType<typeof updatePerson>['coping'],
      last: null as LastAct | null, history: [] as LastAct[], warned: false, unmet: d() < 0.3,
    }));
    let deferred: number[] = [];
    let violations = 0; let acts = 0;
    for (let week = 1; week <= 30 * 52; week++) {
      const windowOpen = week % 52 === 2;
      for (const p of people) {
        if (week % 26 === 0) p.unmet = d() < 0.3; // roles change twice a season
        const r = updatePerson({
          person: { id: p.id, origin: p.origin, age: 25 }, state: p.state, memo: p.memo, coping: p.coping, needs: STARTING_NEEDS,
          weights: { playing_time: 0.8, pay: 0.6, winning: 0.5 }, conditions: { playing_time: { met: p.unmet ? 0 : 1 }, pay: { met: p.unmet ? 0.3 : 1 }, winning: { met: d() } },
          references: {}, events: d() < 0.1 ? [{ source: 'criticised', size: 40 }] : [], facets: { patience: p.patience, discipline: 30, composure: 40, sociability: 50 },
          hasWarmEdge: d() < 0.5, copingAddressed: false, today: { seasonYear: 2030 + Math.floor(week / 52), dayIndex: (week % 52) * 7 },
        }, d);
        p.state = r.state; p.memo = r.memo; p.coping = r.coping;
        if (p.origin === 'imported') for (const e of r.events) if (e.type.startsWith('coping') || e.type === 'effort_dropped') violations++;
        if (p.state.stressBand === 'settled') p.warned = false;
      }
      const cands: ActCandidate[] = people.map((p) => ({
        personId: p.id, stress: p.state.stress, band: p.state.stressBand as StressBand, memo: p.memo, needLevels: p.state.needs,
        weights: { playing_time: 0.8, pay: 0.6, winning: 0.5 }, loyalty: p.loyalty, candor: p.candor, isProtected: p.origin === 'imported', isUser: false,
        legalActs: (windowOpen ? ['portal_entry', 'trade_requested', 'effort_dropped'] : ['trade_requested', 'effort_dropped']) as FormalAct[],
        lastAct: p.last, actHistory: p.history, warned: p.warned,
      }));
      const out = weekOutcomes(cands, d, windowOpen, deferred);
      deferred = [...out.deferred];
      const formal = out.outcomes.filter((o) => o.kind !== 'meeting_requested');
      if (!windowOpen) expect(formal.length).toBeLessThanOrEqual(2);
      for (const o of out.outcomes) {
        const p = people.find((x) => x.id === o.personId)!;
        if (o.kind === 'meeting_requested') { p.warned = true; continue; }
        acts++;
        expect(spacingBlocks(o.kind as FormalAct, week, p.last, p.history)).toBe(false);
        if (p.candor >= 25) expect(p.warned).toBe(true);
        if (p.origin === 'imported') expect(PROTECTED_ALLOWED_ACTS).toContain(o.kind);
        p.last = { week, kind: o.kind }; p.history.push(p.last);
        p.state = { ...p.state, stress: applyRelease(p.state.stress) };
        p.memo = { ...p.memo, week };
      }
      for (const p of people) p.memo = { ...p.memo, week };
    }
    expect(violations).toBe(0);
    expect(acts).toBeGreaterThan(0);
    expect(largestUnmetNeed({ a: 10, b: 10 }, { a: 1, b: 1 })).toBe('a');
  });
});
