// G-44 yearly cohorts (X11). Acceptance: cohort targets per X11.2 are met each year. The cohorts are
// built through G-17's generator bound to @gm/engine-core streams (as the world layer will bind them).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ParamFile, computeStatus, type PersonRecord, type RandomStream, type WorldEvent } from '@gm/schema';
import { generatePlayer, generateNonPlayer, MAIN_POSITIONS } from '../../src/generator/index.ts';
import {
  PARAMS, COHORT_FACTS, COHORT_KINDS, COHORT_EVENT_TYPES, cohortTarget, coachEntrySize, runCohort, formUndraftedPool,
  oneCohortPerSeason, orderSameDate, entryAge, proPoolAgesPass, startingStress, dayOneProblems, bandShares, validateCohort,
  buildValidatedCohort, normalizeName, PackNameIndex, guardName, packImportsToSkip, familyEdgeProblems, planCoachEntry,
  unplacedShareInBand, ladderSpeedInBand, fillBossChair, planReporters, bossChairProblems, stockProblems, populationStable,
  proAgeBandProblems, coachRetirementChance, fillTopUp, backdatedEvents, existingShareInBand, facetBand, sizeWithinTolerance,
  countByLevel, unplacedLeavers, param, type CohortKind, type WorldScale,
} from '../../src/cohorts/index.ts';
import { rng } from '../generator/helpers.ts';

const R = rng(44044);
const open = (name: string, scope: readonly (string | number)[]): RandomStream => R.open(name, scope);
const WORLD: WorldScale = { topCollegeTeams: 136, draftedCount: 257, openEntryChairs: 300, retiredWouldBeCoaches: 12 };
const date = (seasonYear: number, dayIndex = 100) => ({ seasonYear, dayIndex });

let nextId = 1;
function maker(kind: CohortKind, season: number) {
  return (slot: number, attempt: number, s: RandomStream): PersonRecord => {
    const classKey = { classYear: season, classType: `${kind}:${attempt}`, slotIndex: slot };
    const ageYears = entryAge(kind, s);
    if (kind === 'coach_staff_entry') {
      return generateNonPlayer({ personId: nextId++, roles: ['coach'], group: 'entry_coach', ageYears, seasonYear: season, classKey, homeRegion: 'Region A', hometown: null, name: { first: 'Gen', last: `Coach${season}x${attempt}x${slot}`, suffix: null, nickname: null } }, R);
    }
    const position = MAIN_POSITIONS[slot % MAIN_POSITIONS.length]!;
    const talent = kind === 'recruit_class' ? { kind: 'tier' as const, tier: (1 + (slot % 5)) as 1 | 2 | 3 | 4 | 5 } : { kind: 'pro_entrant' as const };
    return generatePlayer({ personId: nextId++, position, ageYears, seasonYear: season, talent, classKey, group: kind === 'recruit_class' ? 'recruit' : 'pro_player', homeRegion: 'Region A', hometown: `Town ${slot}` }, R).record;
  };
}

describe('facts and parameters', () => {
  it('every fact row stores the status its sources compute (Q6.1.2) and cites a source', () => {
    for (const r of COHORT_FACTS) {
      expect(r.status, r.id).toBe(computeStatus(r));
      expect(r.sources.length, r.id).toBeGreaterThan(0);
    }
  });
  it('the parameter file is valid and every row names a leaf', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    for (const p of PARAMS.params) expect(p.leaf).toMatch(/^[A-Z]\d/);
  });
  it('event types meet the X2.1.2 shape', () => {
    for (const t of COHORT_EVENT_TYPES) expect(t.consumers.length).toBeGreaterThan(0);
  });
});

describe('X11.1.1 calendar windows', () => {
  it('orders exits, then vacancies, then cohorts on a shared date', () => {
    const got = orderSameDate([{ stage: 'cohort' as const, n: 1 }, { stage: 'exit' as const, n: 2 }, { stage: 'vacancy' as const, n: 3 }, { stage: 'exit' as const, n: 4 }]);
    expect(got.map((x) => x.n)).toEqual([2, 4, 3, 1]);
  });
  it('flags a season with a missing or doubled cohort', () => {
    const rows = COHORT_KINDS.map((kind) => ({ season: 2030, kind }));
    expect(oneCohortPerSeason(rows)).toEqual([]);
    expect(oneCohortPerSeason([...rows, { season: 2030, kind: 'recruit_class' }])).toHaveLength(1);
  });
});

describe('X11.2 targets met each year (G-44 acceptance)', () => {
  const SEASONS = [2030, 2031, 2032];
  const entered: { season: number; kind: string }[] = [];
  const results = new Map<string, ReturnType<typeof runCohort>>();
  for (const season of SEASONS) {
    for (const kind of ['recruit_class', 'college_walk_on', 'pro_entry_pool', 'coach_staff_entry'] as const) {
      const existingIds = kind === 'coach_staff_entry' ? Array.from({ length: WORLD.retiredWouldBeCoaches }, (_, i) => 900000 + season * 100 + i) : [];
      const r = runCohort({ kind, season, date: date(season), world: WORLD, open, makePerson: maker(kind, season), existingIds, levelOfId: (id) => (id % 2 ? 'college' : 'pro') });
      results.set(`${season}:${kind}`, r);
      for (const e of r.emits) if (e.type === 'cohort_entered') entered.push({ season, kind: String(e.payload.kind) });
    }
    const pool = results.get(`${season}:pro_entry_pool`)!.enteredIds;
    const u = formUndraftedPool(pool, pool.slice(0, WORLD.draftedCount), season, date(season, 120));
    entered.push({ season, kind: String(u.emit.payload.kind) });
    results.set(`${season}:undrafted_pool`, { ...results.get(`${season}:pro_entry_pool`)!, enteredIds: u.ids });
  }

  it('every cohort size is within 15 percent of its X11.2.1 target, every season, first attempt', () => {
    for (const season of SEASONS) {
      for (const kind of ['recruit_class', 'college_walk_on', 'pro_entry_pool', 'coach_staff_entry'] as const) {
        const r = results.get(`${season}:${kind}`)!;
        expect(sizeWithinTolerance(r.enteredIds.length, cohortTarget(kind, WORLD).size), `${season} ${kind}`).toBe(true);
        expect(r.problems, `${season} ${kind}`).toEqual([]);
        expect(r.attempt).toBe(0);
      }
    }
  });
  it('the undrafted pool is the pool minus the drafted', () => {
    expect(results.get('2030:undrafted_pool')!.enteredIds).toHaveLength(cohortTarget('pro_entry_pool', WORLD).size - WORLD.draftedCount);
  });
  it('exactly one cohort_entered per kind per season', () => {
    expect(oneCohortPerSeason(entered)).toEqual([]);
  });
  it('the pro entry pool ages meet X11.2.1 / X11.1.2 each season', () => {
    for (const season of SEASONS) {
      const ages = results.get(`${season}:pro_entry_pool`)!.people.map((p) => season - p.birthDate.seasonYear - (p.birthDate.dayIndex > 243 ? 1 : 0));
      expect(proPoolAgesPass(ages), String(season)).toBe(true);
    }
  });
  it('every person created has a valid block and nothing described ahead of evidence (X11.1.2)', () => {
    for (const r of results.values()) {
      for (const p of r.people) {
        expect(dayOneProblems({ record: p, edges: [], memory: [], labels: [], knownEventIds: new Set(), createdOn: date(2030) })).toEqual([]);
      }
    }
  });
  it('the coach cohort counts returning former players and splits by level', () => {
    const r = results.get('2031:coach_staff_entry')!;
    expect(r.enteredIds.length).toBe(coachEntrySize(WORLD.openEntryChairs, WORLD.retiredWouldBeCoaches));
    const p = r.emits[0]!.payload;
    expect(Number(p.count_college) + Number(p.count_pro)).toBe(Number(p.count));
  });
  it('trait band shares of a 500+ cohort sit within 3 points of a reference generation of the same group', () => {
    const ref = Array.from({ length: 4000 }, (_, i) => maker('pro_entry_pool', 2099)(i, 9, R.open('ref', [i])).traitBlock);
    const target = bandShares(ref);
    const pool = results.get('2030:pro_entry_pool')!.people;
    expect(pool.length).toBeGreaterThanOrEqual(param('bandCheckMinCohort'));
    expect(validateCohort(pool, pool.length, target)).toEqual([]);
  });
  it('measured: the widened band check passes correct cohorts of 500 and catches a shifted one (X11.2.2 conflict)', () => {
    const ref = bandShares(Array.from({ length: 6000 }, (_, i) => maker('pro_entry_pool', 2098)(i, 9, R.open('ref2', [i])).traitBlock));
    let fails = 0, fixedFails = 0;
    const N = 12;
    for (let c = 0; c < N; c++) {
      const cohort = Array.from({ length: 500 }, (_, i) => maker('pro_entry_pool', 2200 + c)(i, 0, R.open('coh', [c, i])));
      if (validateCohort(cohort, 500, ref).length > 0) fails++;
      const blocks = bandShares(cohort.map((p) => p.traitBlock));
      if (Object.entries(ref).some(([f, b]) => Object.entries(b).some(([band, t]) => Math.abs((blocks[f]?.[band as keyof typeof b] ?? 0) - t) > param('bandTolPoints')))) fixedFails++;
      if (c === 0) {
        const shifted = cohort.map((p) => ({ ...p, traitBlock: { ...p.traitBlock, facets: { ...p.traitBlock.facets, ambition: 85 } } }));
        expect(validateCohort(shifted, 500, ref).some((x) => x.check === 'band_share')).toBe(true);
      }
    }
    expect(fails).toBeLessThanOrEqual(1);
    expect(fixedFails).toBeGreaterThan(N / 2);
  });
});

describe('X11.2.2 validate and reseed', () => {
  const tiny = (n: number, base: number): PersonRecord[] => Array.from({ length: n }, (_, i) => maker('coach_staff_entry', 2040)(i, base, R.open('t', [base, i])));
  it('a cohort generated 15 percent too large fails, regenerates and passes, at the same attempt every time', () => {
    const build = (attempt: number) => tiny(attempt === 0 ? 120 : 100, attempt);
    const a = buildValidatedCohort(build, (ps) => validateCohort(ps, 100));
    const b = buildValidatedCohort(build, (ps) => validateCohort(ps, 100));
    expect(a.attempt).toBe(1);
    expect(b.attempt).toBe(1);
    expect(a.warning).toBe(false);
  });
  it('after 3 failed reseeds the cohort is accepted with a logged warning', () => {
    const r = runCohort({ kind: 'coach_staff_entry', season: 2041, date: date(2041), world: { ...WORLD, openEntryChairs: 10, retiredWouldBeCoaches: 0 }, open, makePerson: maker('coach_staff_entry', 2041), sizeOverride: 30 });
    expect(r.attempt).toBe(param('maxReseeds'));
    expect(r.emits.map((e) => e.type)).toEqual(['cohort_entered', 'cohort_validation_warning']);
    expect(r.emits[1]!.payload.failing_checks).toBe('size');
  });
  it('catches a duplicate identity and a missing block', () => {
    const [p] = tiny(1, 7);
    const broken = { ...p!, id: p!.id + 100000, traitBlock: { ...p!.traitBlock, facets: { x: 500 } } } as PersonRecord;
    const checks = validateCohort([p!, broken], 2).map((x) => x.check).sort();
    expect(checks).toEqual(['duplicate_identity', 'trait_block']);
  });
  it('bands follow X1.2.1 rule 2', () => {
    expect([0, 9, 10, 24, 25, 39, 40, 60, 61, 75, 76, 90, 91, 100].map(facetBand)).toEqual([
      'extreme_low', 'extreme_low', 'strong_low', 'strong_low', 'mild_low', 'mild_low', 'neutral', 'neutral', 'mild_high', 'mild_high', 'strong_high', 'strong_high', 'extreme_high', 'extreme_high']);
  });
});

describe('X11.1.3 entry coaches, X11.1.4 bosses and reporters', () => {
  it('sizes the cohort as openings x 1.3 rounded up plus would-be coaches and draws the background mix', () => {
    const plan = planCoachEntry(100, [5, 6], R.open('c', [1]));
    expect(plan.size).toBe(132);
    expect(plan.generated).toHaveLength(130);
    const big = planCoachEntry(10000, [], R.open('c', [2]));
    const share = big.generated.filter((b) => b === 'college_only').length / big.generated.length;
    expect(Math.abs(share - param('coachMixCollegeOnly'))).toBeLessThan(0.02);
  });
  it('decays the unplaced pool at the starting rate and checks the bands', () => {
    const ids = Array.from({ length: 10000 }, (_, i) => i + 1);
    expect(Math.abs(unplacedLeavers(ids, R.open('d', [1])).length / ids.length - param('coachUnplacedLeaveChance'))).toBeLessThan(0.02);
    expect(unplacedShareInBand(20, 100)).toBe(true);
    expect(unplacedShareInBand(50, 100)).toBe(false);
    expect(ladderSpeedInBand([12, 15, 16, 20])).toBe(true);
    expect(ladderSpeedInBand([5, 6, 7])).toBe(false);
  });
  it('fills a boss chair from the world first and never schedules an owner', () => {
    expect(fillBossChair('general_manager', [11, 12, 13], R.open('b', [1]))).toEqual({ kind: 'from_world', personId: 11 });
    const g = fillBossChair('athletic_director', [11], R.open('b', [2]));
    expect(g.kind).toBe('generate');
    if (g.kind === 'generate') expect(g.ageYears).toBeGreaterThanOrEqual(35);
    expect(fillBossChair('owner', [1, 2, 3], R.open('b', [3])).kind).toBe('not_scheduled');
    expect(fillBossChair('owner', [], R.open('b', [4]), true).kind).toBe('generate');
    expect(bossChairProblems([{ chair: 'owner', holderId: 4, holderAge: 86 }, { chair: 'general_manager', holderId: null, holderAge: null }])).toHaveLength(2);
  });
  it('replaces reporters one for one plus new outlets, retirees first', () => {
    const p = planReporters(10, 2, Array.from({ length: 2000 }, (_, i) => i + 1), R.open('r', [1]));
    expect(p.total).toBe(12);
    expect(p.fromRetirees.length + p.generatedAges.length).toBe(12);
    expect(p.fromRetirees.length).toBe(12);
  });
});

describe('X11.2.3 stock balance', () => {
  it('passes balanced windows and fails an unbalanced one', () => {
    const seasons = Array.from({ length: 12 }, (_, i) => ({ season: 2030 + i, entries: 100, exits: 98, netChange: 2 }));
    expect(stockProblems(seasons)).toEqual([]);
    expect(stockProblems(seasons.map((s) => ({ ...s, entries: 120 })))).not.toEqual([]);
    expect(populationStable([90, 95, 98, 99, 100, 100, 100, 100, 100, 1000, 1010, 990, 1040])).toBe(true);
    expect(populationStable([0, 0, 0, 0, 0, 0, 0, 0, 0, 1000, 1100])).toBe(false);
  });
  it('checks the soak age bands', () => {
    expect(proAgeBandProblems({ finalSeasonAges: [26, 27, 27], careerSeasons: [2, 3, 4], rosterAges: [25, 26, 27] })).toEqual([]);
    expect(proAgeBandProblems({ finalSeasonAges: [33], careerSeasons: [9], rosterAges: [31] })).toHaveLength(3);
  });
  it('coach retirement chance starts at 55 and caps at 40 percent', () => {
    expect(coachRetirementChance(54)).toBe(0);
    expect(coachRetirementChance(55)).toBeCloseTo(0.03);
    expect(coachRetirementChance(60)).toBeCloseTo(0.13);
    expect(coachRetirementChance(80)).toBeCloseTo(0.4);
  });
});

describe('X11.3.1 top-up', () => {
  it('fills from existing people first and caps generation per position per week', () => {
    const needs = Array.from({ length: 6 }, (_, i) => ({ teamId: i + 1, position: 'CB', existingCandidates: [] as number[], walkOnBand: false }));
    const fills = fillTopUp([{ teamId: 9, position: 'S', existingCandidates: [1, 2, 3], walkOnBand: false }, ...needs], R.open('u', [1]));
    expect(fills[0]).toEqual({ kind: 'existing', personId: 1 });
    expect(fills.filter((f) => f.kind === 'generate')).toHaveLength(param('topUpMaxPerPositionWeek'));
    expect(fills.filter((f) => f.kind === 'unfilled')).toHaveLength(6 - param('topUpMaxPerPositionWeek'));
    for (const f of fills) if (f.kind === 'generate') expect(f.ageYears).toBeGreaterThanOrEqual(param('topUpProAgeMin'));
    expect(existingShareInBand(80, 20)).toBe(true);
    expect(existingShareInBand(70, 30)).toBe(false);
  });
  it('finds events dated before a person was created', () => {
    const ev = (id: number, day: number): WorldEvent => ({ id, type: 'x', when: { date: date(2030, day), period: null, clockTenths: null }, competitionId: null, where: { teamId: null, venueId: null }, actors: [{ personId: 5, role: 'a' }], subjects: [], payload: {}, witnesses: { kind: 'public' }, causeId: null, notability: null, tier: 1, source: 'sim' });
    expect(backdatedEvents(5, date(2030, 50), [ev(1, 40), ev(2, 60)])).toEqual([1]);
  });
});

describe('X11.4 identity', () => {
  it('a pack with "Michael Smith Jr." blocks "Mike Smith" and "Michael Smith III" (X11.4.2 acceptance)', () => {
    const idx = new PackNameIndex([{ first: 'Michael', last: 'Smith Jr.' }]);
    expect(idx.collides('Mike', 'Smith')).toBe(true);
    expect(idx.collides('Michael', 'Smith III')).toBe(true);
    expect(idx.collides('Michaela', 'Smith')).toBe(false);
    expect(normalizeName('José', "O'Neil-Brown")).toBe('jose oneilbrown');
  });
  it('redraws first name, then last name, then both', () => {
    const idx = new PackNameIndex([{ first: 'Mike', last: 'Smith' }]);
    const firsts = ['Michael', 'Mikey', 'Mike', 'Mike', 'Mike', 'Carl'];
    let fi = 0;
    const draw = { first: () => firsts[fi++]!, last: () => 'Jones' };
    const g = guardName('Mike', 'Smith', idx, draw, R.open('n', [1]));
    expect(g).toEqual({ first: 'Mike', last: 'Jones', redraws: 6, clear: true });
    expect(guardName('Carl', 'Smith', idx, draw, R.open('n', [2])).redraws).toBe(0);
  });
  it('a mid-world pack skips the colliding import and never renames a generated person', () => {
    const gen = [{ id: 1, origin: 'generated' as const, name: { first: 'Chris', last: 'Hall', suffix: null, nickname: null } }];
    expect(packImportsToSkip(gen, [{ key: 'a', first: 'Christopher', last: 'Hall' }, { key: 'b', first: 'Chris', last: 'Ball' }])).toEqual(['a']);
  });
  it('no family link touches an imported person (X11.4.1)', () => {
    const origin = (id: number) => (id === 2 ? 'imported' as const : 'generated' as const);
    expect(familyEdgeProblems([{ a: 1, b: 2 }, { a: 1, b: 3 }], origin)).toEqual([{ a: 1, b: 2 }]);
  });
  it('static check: no cohort source reads another person\'s attributes or traits to build one (X11.4.1)', () => {
    const dir = join(import.meta.dirname, '../../src/cohorts');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const code = readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/\.playing\b|\.attributes\b|\.facets\[|\.values\[/);
    }
  });
});

describe('determinism and day-one draws', () => {
  it('the same world builds the same cohort', () => {
    const run = () => { nextId = 700000; return runCohort({ kind: 'coach_staff_entry', season: 2050, date: date(2050), world: { ...WORLD, openEntryChairs: 20, retiredWouldBeCoaches: 0 }, open, makePerson: maker('coach_staff_entry', 2050) }); };
    expect(JSON.stringify(run().people)).toBe(JSON.stringify(run().people));
  });
  it('day-one stress starts inside 20 to 80 and edges need tracked events', () => {
    const s = R.open('st', [1]);
    for (let i = 0; i < 200; i++) { const v = startingStress(s); expect(v).toBeGreaterThanOrEqual(20); expect(v).toBeLessThanOrEqual(80); }
    const p = maker('coach_staff_entry', 2060)(0, 0, R.open('dp', [1]));
    const edge = { a: p.id, b: 77, bTeamId: null, kind: 'worked_with' as const, strength: 10, sign: 'warm' as const, since: date(2060, 1), lastContact: date(2060, 1), basisEventIds: [3] };
    expect(dayOneProblems({ record: p, edges: [edge], memory: [], labels: ['x'], knownEventIds: new Set(), createdOn: date(2060, 0) })).toHaveLength(4);
  });
  it('count by level uses the fixed level of a one-level kind', () => {
    expect(countByLevel('recruit_class', [1, 2, 3])).toEqual({ college: 3, pro: 0 });
    expect(countByLevel('coach_staff_entry', [1, 2, 3], (id) => (id === 1 ? 'pro' : 'college'))).toEqual({ college: 2, pro: 1 });
  });
});
