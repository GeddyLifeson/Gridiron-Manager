// Tests for bible K2 (G-26). Each describe names the leaf it covers.
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import { scanForbiddenJson } from '@gm/schema';
import {
  advanceSeason, bucketBelief, calibrationReport, checkReaders, fromHiddenMap, generateCoachProfile, generateTraced,
  getPopulation, LEVELS, moments, profileFromImport, recordObservation, restOf, ROLES, scaleBehaviorSpread, TEMPLATES,
  toHiddenMap, tuneMeans, validateCoachProfile, type CoachGenInput, type CoachLevel, type CoachProfile, type CoachRole,
  type Draws, type SideOfBall,
} from '../../src/profile/index.ts';

const SEED = seedFromNumber(20261126);
const worldgen = (i: number | string): Draws => stream(SEED, 'worldgen', ['coach', i]);

function input(i: number, level: CoachLevel, role: CoachRole, over: Partial<CoachGenInput> = {}): CoachGenInput {
  const d = stream(SEED, 'test-inputs', [level, role, i]);
  const sides: (SideOfBall | null)[] = ['offense', 'defense', null];
  return {
    personId: `p${i}`, level, role,
    age: Math.round(getPopulation(level, role).age.mean + getPopulation(level, role).age.sd * d.normal()),
    playedSide: sides[d.int(0, 2)]!,
    seasonsCalling: 3, seasonsAsHeadCoach: 3,
    ...over,
  };
}

function population(n: number, level: CoachLevel, role: CoachRole, over: (i: number) => Partial<CoachGenInput> = () => ({})): CoachProfile[] {
  const out: CoachProfile[] = [];
  for (let i = 0; i < n; i++) out.push(generateCoachProfile(input(i, level, role, over(i)), worldgen(`${level}.${role}.${i}`)));
  return out;
}

describe('K2.2.1 generating a coach', () => {
  it('one seed gives identical profiles; no two of 1,000 are equal; every template appears; no template name is stored', () => {
    const a = population(1000, 'pro', 'headCoach');
    const b = population(1000, 'pro', 'headCoach');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const keys = new Set(a.map((p) => JSON.stringify({ ...p, personId: '' })));
    expect(keys.size).toBe(1000);
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateTraced(input(i, 'pro', 'headCoach'), worldgen(`pro.headCoach.${i}`)).templateId);
    for (const t of TEMPLATES) expect(seen.has(t.id)).toBe(true);
    const text = JSON.stringify(a);
    for (const t of TEMPLATES) expect(text.includes(t.id)).toBe(false);
  });

  it('coordinators get the side of their job; a former offensive player leans offense as a head coach', () => {
    const oc = population(200, 'pro', 'offensiveCoordinator');
    expect(oc.every((p) => p.system.primarySide === 'offense')).toBe(true);
    const hc = population(2000, 'pro', 'headCoach', () => ({ playedSide: 'offense' }));
    const share = hc.filter((p) => p.system.primarySide === 'offense').length / hc.length;
    expect(share).toBeGreaterThan(0.77);
    expect(share).toBeLessThan(0.83);
  });

  it('rule 4 correlations hold at the stated sizes', () => {
    const n = 3000;
    const facets = (i: number) => {
      const d = stream(SEED, 'test-facets', [i]);
      return { facets: { risk_tolerance: 50 + 8.3 * d.normal(), work_habits: 50 + 8.3 * d.normal() } };
    };
    const ps = population(n, 'pro', 'headCoach', facets);
    const xs = ps.map((_, i) => (facets(i).facets.risk_tolerance - 50) / 8.3);
    const ws = ps.map((_, i) => (facets(i).facets.work_habits - 50) / 8.3);
    const ages = ps.map((_, i) => input(i, 'pro', 'headCoach').age);
    expect(corr(xs, ps.map((p) => p.tendencies.fourthDownOffset))).toBeCloseTo(-0.5, 1);
    expect(corr(ws, ps.map((p) => p.behavior.preparation))).toBeCloseTo(0.4, 1);
    expect(corr(ages, ps.map((p) => p.tendencies.analyticsTrust))).toBeCloseTo(-0.3, 1);
  });

  it('rule 5: a first-year play caller starts lower on adjustment and clock management', () => {
    const vets = population(2000, 'pro', 'offensiveCoordinator');
    const rookies = population(2000, 'pro', 'offensiveCoordinator', () => ({ seasonsCalling: 0 }));
    const diff = moments(rookies, 'behavior.adjustment').mean - moments(vets, 'behavior.adjustment').mean;
    expect(diff).toBeGreaterThan(-0.6);
    expect(diff).toBeLessThan(-0.4);
  });

  it('rule 7: a position coach carries calling fields, drawn lower and wider, unused', () => {
    const pc = population(2000, 'pro', 'positionCoach');
    const m = moments(pc, 'behavior.callFit');
    expect(m.mean).toBeLessThan(-0.4);
    expect(m.sd).toBeGreaterThan(1.1);
  });
});

describe('K2.3.1 league calibration of the generated population', () => {
  for (const level of LEVELS) for (const role of ROLES) {
    it(`coachPopulation.${level}.${role} matches its file within J15.1.2 tolerances`, () => {
      const ps = population(3000, level, role);
      const rep = calibrationReport(ps, getPopulation(level, role));
      const failed = rep.rows.filter((r) => !r.pass);
      expect(failed).toEqual([]);
      expect(rep.owed.length).toBeGreaterThan(0);
    });
  }

  it('pro means are the register values (J15.3.2, J15.8.3)', () => {
    const pop = getPopulation('pro', 'offensiveCoordinator');
    expect(pop.fields['offenseRates.shotgun']!.mean).toBe(0.7);
    expect(pop.fields['tempo.noHuddleShare']!.mean).toBe(0.105);
    expect(pop.fields['offenseRates.playAction']!.mean).toBe(0.215);
    expect(pop.fields['offenseRates.neutralPass']!.mean).toBe(0.573);
    expect(pop.fields['offenseRates.neutralPass']!.sd).toBe(0.047);
    expect(pop.personnel.p11).toBe(0.632);
    expect(getPopulation('college', 'offensiveCoordinator').fields['offenseRates.shotgun']!.meanStatus).toBe('Assumption');
  });

  it('tuneMeans moves the file until a distorted measure hits the target (the K4 batch hook)', () => {
    const pop = getPopulation('pro', 'offensiveCoordinator');
    // Stand-in for the K4.3.7 lean: the simulated league pulls only part of the way to each prior.
    const measure = (p: typeof pop) => ({ 'offenseRates.playAction': 0.6 * p.fields['offenseRates.playAction']!.mean + 0.05 });
    const res = tuneMeans(pop, { 'offenseRates.playAction': 0.215 }, measure, { maxIterations: 40 });
    expect(res.converged).toBe(true);
    expect(Math.abs(measure(res.population)['offenseRates.playAction'] - 0.215) / 0.215).toBeLessThanOrEqual(0.03);
    expect(res.population.version).toBe(pop.version + 1);
  });

  it('K2.3.2 rule 3: spread scaling changes behaviour SDs only', () => {
    const pop = getPopulation('pro', 'headCoach');
    const wide = scaleBehaviorSpread(pop, 1.5);
    expect(wide.fields['behavior.preparation']!.sd).toBeCloseTo(1.5, 10);
    expect(wide.fields['offenseRates.playAction']).toEqual(pop.fields['offenseRates.playAction']);
  });
});

describe('K2.7.1 forbidden parameters and K2.1.1 record rules', () => {
  const p = generateCoachProfile(input(1, 'pro', 'headCoach'), worldgen('one'));

  it('a generated profile is valid, has readers for every field, and passes the project forbidden-key scan', () => {
    expect(validateCoachProfile(p)).toEqual([]);
    expect(checkReaders()).toEqual([]);
    expect(scanForbiddenJson('profile', p)).toEqual([]);
    for (const level of LEVELS) for (const role of ROLES) for (const q of population(50, level, role)) expect(validateCoachProfile(q)).toEqual([]);
  });

  const bad: [string, (q: any) => void][] = [
    ['teamDiscipline', (q) => { q.behavior.teamDiscipline = 1; }],
    ['penaltyModifier', (q) => { q.tendencies.penaltyModifier = 0.1; }],
    ['fumble modifier', (q) => { q.system.fumbleRate = 0.1; }],
    ['tenure modifier', (q) => { q.tendencies.tenureBoost = 1; }],
    ['coach points', (q) => { q.coachPoints = 3; }],
    ['xp', (q) => { q.xp = 100; }],
    ['level', (q) => { q.behavior.level = 2; }],
    ['perk', (q) => { q.perks = []; }],
    ['difficulty', (q) => { q.difficulty = 'hard'; }],
    ['stored label', (q) => { q.labels = ['aggressive']; }],
    ['archetype', (q) => { q.archetype = 'x'; }],
    ['reputation number', (q) => { q.reputation = 70; }],
    ['motivation (removed, K2.1.1 rule 4)', (q) => { q.behavior.motivation = 1; }],
    ['template name as a value', (q) => { q.system.playbookId = 'analytics-led'; }],
    ['unknown field', (q) => { q.system.extra = 1; }],
    ['share out of range', (q) => { q.system.offenseRates.playAction = 1.4; }],
  ];
  for (const [name, mutate] of bad) {
    it(`rejects ${name}`, () => {
      const q = JSON.parse(JSON.stringify(p));
      mutate(q);
      expect(validateCoachProfile(q).length).toBeGreaterThan(0);
    });
  }

  it('saving and loading is lossless, through JSON and through the coaching.hidden codec', () => {
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    const back = fromHiddenMap(JSON.parse(JSON.stringify(toHiddenMap(p))), JSON.parse(JSON.stringify(restOf(p))));
    expect(back).toEqual(p);
    expect(Object.values(toHiddenMap(p)).every((v) => typeof v === 'number')).toBe(true);
  });
});

describe('K2.2.2 imported real coaches', () => {
  it('neutral behaviour at the role median, estimates used, flagged imported, no draw made', () => {
    const pop = getPopulation('pro', 'headCoach');
    const q = profileFromImport('real1', 'pro', 'headCoach', 'offense', { offenseRates: { playAction: 0.3 }, behavior: { callFit: 2 } });
    expect(q.imported).toBe(true);
    expect(q.system.offenseRates.playAction).toBe(0.3);
    expect(q.behavior.callFit).toBe(pop.fields['behavior.callFit']!.mean); // no source given, so ignored
    expect(validateCoachProfile(q)).toEqual([]);
    const sourced = profileFromImport('real2', 'pro', 'headCoach', 'offense', { behavior: { callFit: 1 }, behaviorSource: 'pack row 12' });
    expect(sourced.behavior.callFit).toBe(1);
  });
});

describe('K2.5.2 lineage', () => {
  it('assistants take the heaviest mentor\'s families (more than twice the base rate) and tendencies weakly', () => {
    const mentor = generateCoachProfile(input(9, 'pro', 'headCoach'), worldgen('mentor'));
    const other = generateCoachProfile(input(10, 'pro', 'headCoach'), worldgen('other'));
    const kids = population(300, 'pro', 'offensiveCoordinator', () => ({
      mentors: [
        { mentorId: 'm1', seasons: 4, lastSeason: 2030, system: mentor.system, tendencies: mentor.tendencies },
        { mentorId: 'm2', seasons: 2, lastSeason: 2026, system: other.system, tendencies: other.tendencies },
      ],
    }));
    const base = 1 / Object.keys(getPopulation('pro', 'offensiveCoordinator').families.offense).length;
    const share = kids.filter((k) => k.system.offenseFamily === mentor.system.offenseFamily).length / kids.length;
    expect(share).toBeGreaterThan(2 * base);
    expect(kids.every((k) => k.lineage.mentors.length === 2)).toBe(true);
    // Tendencies: 0.25 weight on the mentor blend (m1 weight 8, m2 weight 2).
    const blend = (8 * mentor.tendencies.leadProtection + 2 * other.tendencies.leadProtection) / 10;
    const plain = population(300, 'pro', 'offensiveCoordinator');
    const gotShift = moments(kids, 'tendencies.leadProtection').mean - 0.75 * moments(plain, 'tendencies.leadProtection').mean;
    expect(gotShift).toBeCloseTo(0.25 * blend, 1);
  });
});

describe('K2.5.1 between-season change', () => {
  it('a coach who never calls plays keeps callFit over 30 seasons; use grows a parameter; age declines it', () => {
    let pc = generateCoachProfile(input(3, 'pro', 'positionCoach'), worldgen('pc'));
    const start = pc.behavior.callFit;
    for (let s = 0; s < 30; s++) pc = advanceSeason(pc, { age: 35 + s, roleLastSeason: 'positionCoach', seasonsInRole: s + 1 }, stream(SEED, 'careerDrift', [s, 'pc']));
    expect(pc.behavior.callFit).toBe(start);
    expect(pc.version).toBe(31);

    const oc = generateCoachProfile(input(4, 'pro', 'offensiveCoordinator'), worldgen('oc'));
    let gains = 0;
    for (let i = 0; i < 400; i++) gains += advanceSeason(oc, { age: 40, roleLastSeason: 'offensiveCoordinator', seasonsInRole: 1 }, stream(SEED, 'careerDrift', [i, 'oc'])).behavior.callFit - oc.behavior.callFit;
    expect(gains / 400).toBeCloseTo(0.1, 1);

    const out = advanceSeason(oc, { age: 64, roleLastSeason: null, seasonsInRole: 0 }, stream(SEED, 'careerDrift', [0, 'out']));
    expect(out.behavior.callFit).toBe(oc.behavior.callFit);
    expect(out.behavior.adjustment).toBeCloseTo(oc.behavior.adjustment - 0.05, 10);
  });

  it('tendencies step toward what worked', () => {
    const hc = generateCoachProfile(input(5, 'pro', 'headCoach'), worldgen('hc'));
    const best = hc.tendencies.fourthDownOffset - 4;
    const next = advanceSeason(hc, { age: 50, roleLastSeason: 'headCoach', seasonsInRole: 2, bestTendency: { fourthDownOffset: best } }, stream(SEED, 'careerDrift', [1, 'hc']));
    expect(next.tendencies.fourthDownOffset).toBeLessThan(hc.tendencies.fourthDownOffset);
  });
});

describe('K2.1.5 memory', () => {
  it('after two games of one concept on third and medium, the starting belief puts at least 60% on it', () => {
    const p = generateCoachProfile(input(6, 'pro', 'defensiveCoordinator'), worldgen('dc'));
    let m = p.memory;
    for (let game = 0; game < 2; game++) for (let k = 0; k < 9; k++) {
      m = recordObservation(m, 'callerX', { bucket: '3rd-medium', observed: 'mesh', worked: false, season: 2027, week: game + 1 });
      m = recordObservation(m, 'callerX', { bucket: '1st-10', observed: k % 2 ? 'inside-zone' : 'play-action', worked: false, season: 2027, week: game + 1 });
    }
    expect(bucketBelief(m, 'callerX', '3rd-medium').mesh!).toBeGreaterThanOrEqual(0.6);
    expect(validateCoachProfile({ ...p, memory: m })).toEqual([]);
  });

  it('rows per caller are capped at 40', () => {
    let m = generateCoachProfile(input(7, 'pro', 'defensiveCoordinator'), worldgen('dc2')).memory;
    for (let i = 0; i < 60; i++) m = recordObservation(m, 'c', { bucket: `b${i}`, observed: 'x', worked: true, season: 2027, week: 1 });
    expect(m.opponentNotes.c!.length).toBe(40);
  });
});

function corr(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i]! - ma) * (b[i]! - mb); sa += (a[i]! - ma) ** 2; sb += (b[i]! - mb) ** 2; }
  return sab / Math.sqrt(sa * sb);
}
