// D9 acceptance criteria and the G5 planner rules.
import { describe, expect, it } from 'vitest';
import {
  AVERAGE_LEARNER, baseErrorChance, carryFamilies, cohesionEffects, crowding, drawPlayErrors, errorChance, estimateSd, gainFrom,
  installOrder, isFading, ItemCatalogue, knowledgeNumbers, lateScratch, pairCohesion, planWeek, playReadiness, playWarnings,
  prepAfterGame, processingDelay, readinessReport, recognitionBonus, seedNewcomer, similarityProblems, teach, unitRate,
  backupQbSplit, catchUpPackage, defaultCampCycle, dailyLimitSplit, KnowledgeBook, PARAMS, unitCohesion,
  type CalledPlay, type SheetCall,
} from '../../src/knowledge/index.ts';
import { ITEMS, MATH, N, rng, setup } from './helpers.ts';

const WEEK = 7;

describe('params', () => {
  it('every row is basis bible or assumption with a leaf in D9 or G5', () => {
    for (const r of PARAMS.params) expect(r.leaf).toMatch(/^(D9|G5)\./);
  });
  it('an override of an unknown name throws', () => {
    expect(() => knowledgeNumbers({ 'no.such': 1 })).toThrow();
  });
});

describe('D9.1.1 items', () => {
  it('a concept cannot exceed its family by more than 20', () => {
    const { book } = setup();
    book.set(1, 'fam.wide_zone', 40, 0);
    book.set(1, 'c.wz_weak', 90, 0);
    expect(book.value(1, 'c.wz_weak', 0)).toBe(60);
  });
  it('a play using an uninstalled tag reads zero for it and warns', () => {
    const { cat, book } = setup();
    cat.add({ id: 'v.new_tag', level: 'variation', parent: 'c.stick', difficulty: {}, defaultDifficulty: 1 });
    book.set(7, 'fam.quick', 90, 0);
    book.set(7, 'c.stick', 90, 0);
    book.set(7, 'v.new_tag', 90, 0);
    const play: CalledPlay = { id: 'p1', items: ['c.stick', 'v.new_tag'], assignments: [{ player: 7, position: 'QB', items: ['c.stick', 'v.new_tag'] }] };
    expect(book.effective(7, ['c.stick', 'v.new_tag'], 0)).toBe(0);
    expect(playWarnings(cat, play)).toEqual([{ play: 'p1', item: 'v.new_tag', why: 'not_installed' }]);
  });
  it('rejects a bad tree and a difficulty outside 1 to 5', () => {
    const cat = new ItemCatalogue(N);
    expect(() => cat.add({ id: 'x', level: 'concept', parent: null, difficulty: {}, defaultDifficulty: 1 })).toThrow();
    expect(() => cat.add({ id: 'f', level: 'family', parent: null, difficulty: {}, defaultDifficulty: 6 })).toThrow();
  });
  it('a removed item keeps its knowledge, decaying, and reads zero until reinstalled', () => {
    const { cat, book } = setup();
    book.set(1, 'fam.quick', 90, 0);
    cat.remove('fam.quick');
    expect(book.value(1, 'fam.quick', 0)).toBe(0);
    cat.install('fam.quick');
    expect(book.value(1, 'fam.quick', 0)).toBe(90);
  });
  it('rows round-trip', () => {
    const { cat, book } = setup();
    book.set(2, 'fam.quick', 50, 3);
    book.set(1, 'c.stick', 30, 4);
    const b2 = new KnowledgeBook(N, MATH, cat);
    b2.load(book.rows());
    expect(b2.rows()).toEqual(book.rows());
  });
});

describe('D9.2.1 gain', () => {
  it('meetings alone stop at 60, walk-through at 80, full speed reaches past 80', () => {
    const { book } = setup();
    for (let d = 0; d < 30; d++) teach(book, { player: 1, position: 'QB', item: 'fam.quick', mode: 'meeting', amount: 40, day: d }, AVERAGE_LEARNER);
    expect(book.raw(1, 'fam.quick', 29)).toBeCloseTo(60, 6);
    for (let d = 30; d < 60; d++) teach(book, { player: 1, position: 'QB', item: 'fam.quick', mode: 'walkthrough', amount: 20, day: d }, AVERAGE_LEARNER);
    expect(book.raw(1, 'fam.quick', 59)).toBeCloseTo(80, 6);
    teach(book, { player: 1, position: 'QB', item: 'fam.quick', mode: 'fullSpeed', amount: 20, day: 60 }, AVERAGE_LEARNER);
    expect(book.raw(1, 'fam.quick', 60)).toBeGreaterThan(85);
  });
  it('a block of n units equals n single units', () => {
    const r = 4;
    let k = 20;
    for (let i = 0; i < 7; i++) k = gainFrom(N, MATH, k, r, 1, 100);
    expect(gainFrom(N, MATH, 20, r, 7, 100)).toBeCloseTo(k, 9);
  });
  it('doubling new items lowers gain per item by the crowding formula', () => {
    const ev = { player: 1, position: 'QB', item: 'fam.quick', mode: 'fullSpeed' as const, amount: 1, day: 0 };
    const r12 = unitRate(N, ev, { ...AVERAGE_LEARNER, newItemsThisWeek: 12 }, 1, 1);
    const r24 = unitRate(N, ev, { ...AVERAGE_LEARNER, newItemsThisWeek: 24 }, 1, 1);
    expect(crowding(N, 12)).toBe(2);
    expect(crowding(N, 24)).toBe(5);
    expect(r12 / r24).toBeCloseTo(5 / 2, 9);
  });
  it('a harder assignment for the position learns slower', () => {
    const { book } = setup();
    teach(book, { player: 1, position: 'C', item: 'c.wz_weak', mode: 'fullSpeed', amount: 5, day: 0 }, AVERAGE_LEARNER);
    teach(book, { player: 2, position: 'WR', item: 'c.wz_weak', mode: 'fullSpeed', amount: 5, day: 0 }, AVERAGE_LEARNER);
    expect(book.raw(1, 'c.wz_weak', 0)).toBeLessThan(book.raw(2, 'c.wz_weak', 0));
  });
  it('attention falls after 45 minutes in one meeting', () => {
    const a = setup(); const b = setup();
    teach(a.book, { player: 1, position: 'QB', item: 'fam.quick', mode: 'meeting', amount: 15, day: 0, meetingMinutesBefore: 0 }, AVERAGE_LEARNER);
    teach(b.book, { player: 1, position: 'QB', item: 'fam.quick', mode: 'meeting', amount: 15, day: 0, meetingMinutesBefore: 60 }, AVERAGE_LEARNER);
    expect(b.book.raw(1, 'fam.quick', 0)).toBeLessThan(a.book.raw(1, 'fam.quick', 0));
  });
  it('a player absent gets nothing: no event, no change', () => {
    const { book } = setup();
    expect(book.raw(9, 'fam.quick', 0)).toBe(0);
  });
});

describe('D9.3.1 decay', () => {
  it('an item at 90 unused for 8 weeks falls to about 80', () => {
    const { book } = setup();
    book.set(1, 'c.stick', 90, 0);
    book.set(1, 'fam.quick', 95, 0);
    expect(book.raw(1, 'c.stick', 8 * WEEK)).toBeCloseTo(80, 0);
  });
  it('never decays below 60 percent of peak (concept) or 85 percent (family)', () => {
    const { book } = setup();
    book.set(1, 'c.stick', 90, 0);
    book.set(1, 'fam.quick', 90, 0);
    expect(book.raw(1, 'c.stick', 1000 * WEEK)).toBeCloseTo(54, 9);
    expect(book.raw(1, 'fam.quick', 1000 * WEEK)).toBeCloseTo(76.5, 9);
  });
  it('a review resets the timer and restores up to 5 points, then reps build from there', () => {
    const { book } = setup();
    book.set(1, 'fam.quick', 100, 0);
    book.set(1, 'c.stick', 90, 0);
    const d = 8 * WEEK;
    book.review(1, 'c.stick', d);
    expect(book.raw(1, 'c.stick', d)).toBeCloseTo(85, 0);
    teach(book, { player: 1, position: 'WR', item: 'c.stick', mode: 'fullSpeed', amount: 2, day: d }, AVERAGE_LEARNER);
    // D9.3.1 acceptance: back to about 90 with two full-speed reps and a review. The rep block itself
    // counts as a review rep (restores up to 5 more, never past the peak), then the reps add their gain.
    expect(book.raw(1, 'c.stick', d)).toBeGreaterThan(89.5);
    expect(book.raw(1, 'c.stick', d)).toBeLessThan(91);
  });
  it('in camp, gain below the previous peak is double', () => {
    const a = setup(); const b = setup();
    for (const s of [a, b]) { s.book.set(1, 'fam.quick', 90, 0); s.book.set(1, 'fam.quick', 50, 1, 90); }
    teach(a.book, { player: 1, position: 'WR', item: 'fam.quick', mode: 'fullSpeed', amount: 1, day: 1 }, AVERAGE_LEARNER);
    teach(b.book, { player: 1, position: 'WR', item: 'fam.quick', mode: 'fullSpeed', amount: 1, day: 1, camp: true }, AVERAGE_LEARNER);
    expect(b.book.raw(1, 'fam.quick', 1) - 55).toBeCloseTo(2 * (a.book.raw(1, 'fam.quick', 1) - 55), 1);
  });
});

describe('D9.3.2 carryover', () => {
  const links = [
    { newFamily: 'fam.wide_zone', oldFamily: 'old.outside_zone', similarity: 1, terminology: 0.2 },
    { newFamily: 'fam.quick', oldFamily: 'old.quick_game', similarity: 0.7, terminology: 0.2 },
  ];
  it('family = old x similarity, terminology = old x word similarity, concepts = family - 20', () => {
    const carried = carryFamilies(N, [
      { family: 'old.outside_zone', value: 70, terminology: 80 },
      { family: 'old.quick_game', value: 60, terminology: 80 },
    ], links, ['fam.quick', 'fam.wide_zone']);
    expect(carried).toEqual([
      { family: 'fam.quick', familyValue: 42, terminologyValue: 16 },
      { family: 'fam.wide_zone', familyValue: 70, terminologyValue: 16 },
    ]);
    const { book } = setup();
    seedNewcomer(book, 5, 0, carried, (f) => (f === 'fam.wide_zone' ? 'term.wide_zone' : undefined));
    expect(book.raw(5, 'c.wz_weak', 0)).toBe(50);
    expect(book.raw(5, 'c.stick', 0)).toBe(22);
    expect(book.raw(5, 'term.wide_zone', 0)).toBe(16);
  });
  it('similarity values outside 0, 1 or the related band are problems', () => {
    expect(similarityProblems(N, links)).toEqual([]);
    expect(similarityProblems(N, [{ newFamily: 'a', oldFamily: 'b', similarity: 0.3, terminology: 0 }])).toHaveLength(1);
  });
});

describe('D9.4.1 knowledge errors', () => {
  it('the formula gives 0, 2, 8, 18 percent at 100, 80, 60, 40', () => {
    expect([100, 80, 60, 40].map((k) => baseErrorChance(N, k))).toEqual([0, 0.02, 0.08, 0.18].map((x) => expect.closeTo(x, 12)));
  });
  it('100,000 assignments at each level land within 10 percent of the formula', () => {
    const { book } = setup();
    for (const [i, k] of [80, 60, 40].entries()) {
      const pl = 100 + i;
      book.set(pl, 'fam.quick', k, 0);
      const r = rng(64, 'errors', k);
      let hits = 0;
      const trials = 100000;
      // Difficulty 3 maps to factor 1.1; divide it back out.
      for (let t = 0; t < trials; t++) hits += drawPlayErrors(book, [{ player: pl, position: 'X', items: ['fam.quick'] }], 0, 1, r)[0]!.error ? 1 : 0;
      const want = baseErrorChance(N, k) * errorChance(N, { knowledge: 0, difficulty: 1, changedAtLine: false, noise: 1 }) / baseErrorChance(N, 0);
      expect(Math.abs(hits / trials - want) / want).toBeLessThan(0.1);
    }
  });
  it('line changes, difficulty and noise multiply; delay is (80 - k) x 0.01 s', () => {
    const base = errorChance(N, { knowledge: 60, difficulty: 1, changedAtLine: false, noise: 1 });
    expect(base).toBeCloseTo(0.08 * 0.6, 12);
    expect(errorChance(N, { knowledge: 60, difficulty: 5, changedAtLine: true, noise: 1.2 })).toBeCloseTo(0.08 * 1.6 * 1.3 * 1.2, 12);
    expect(processingDelay(N, 60)).toBeCloseTo(0.2, 12);
    expect(processingDelay(N, 90)).toBe(0);
  });
  it('a drawn error is tagged knowledge and names the weakest item', () => {
    const { book } = setup();
    book.set(3, 'fam.quick', 30, 0);
    book.set(3, 'c.stick', 10, 0);
    const r = rng(1, 'tag');
    const draws = Array.from({ length: 200 }, () => drawPlayErrors(book, [{ player: 3, position: 'QB', items: ['fam.quick', 'c.stick'] }], 0, 1, r)[0]!);
    const hit = draws.find((d) => d.error !== null)!;
    expect(hit.tag).toBe('knowledge');
    expect(hit.item).toBe('c.stick');
  });
  it('same seed, same draws', () => {
    const { book } = setup();
    book.set(3, 'fam.quick', 50, 0);
    const a = Array.from({ length: 50 }, (_, i) => drawPlayErrors(book, [{ player: 3, position: 'QB', items: ['fam.quick'] }], 0, 1, rng(9, i))[0]!.error);
    const b = Array.from({ length: 50 }, (_, i) => drawPlayErrors(book, [{ player: 3, position: 'QB', items: ['fam.quick'] }], 0, 1, rng(9, i))[0]!.error);
    expect(a).toEqual(b);
  });
});

describe('D9.5.1 cohesion', () => {
  it('1,000 snaps together beat zero by the configured cap; all caps zero removes every effect', () => {
    const c1000 = pairCohesion(N, MATH, { unit: 'ol', a: 1, b: 2, gameSnaps: 1000, practiceReps: 0 });
    expect(c1000).toBeCloseTo(100 * (1 - Math.exp(-1000 / 600)), 6);
    const e0 = cohesionEffects(N, 0);
    const e1 = cohesionEffects(N, c1000);
    expect(e1.stuntPickup).toBeGreaterThan(e0.stuntPickup);
    expect(cohesionEffects(N, 100).stuntPickup).toBeCloseTo(0.08, 12);
    expect(cohesionEffects(N, 100).optionAgreement).toBeCloseTo(0.98, 12);
    expect(e0.optionAgreement).toBeCloseTo(0.8, 12);
    const zero = knowledgeNumbers({ 'cohesion.cap.stunt': 0, 'cohesion.cap.combo': 0, 'cohesion.cap.timing': 0, 'cohesion.cap.passOff': 0, 'cohesion.optionAgreeHigh': 0.8 });
    expect(cohesionEffects(zero, 100)).toEqual(cohesionEffects(zero, 0));
  });
  it('practice reps count 0.6; decay 10 percent a season and 2 percent a week apart', () => {
    const g = pairCohesion(N, MATH, { unit: 'qb_receiver', a: 1, b: 2, gameSnaps: 60, practiceReps: 0 });
    const pr = pairCohesion(N, MATH, { unit: 'qb_receiver', a: 1, b: 2, gameSnaps: 0, practiceReps: 100 });
    expect(pr).toBeCloseTo(g, 9);
    expect(pairCohesion(N, MATH, { unit: 'qb_center', a: 1, b: 2, gameSnaps: 250, practiceReps: 0 }, { seasons: 1, inSeasonWeeks: 0 })).toBeCloseTo(0.9 * 100 * (1 - Math.exp(-1)), 6);
    expect(pairCohesion(N, MATH, { unit: 'secondary', a: 1, b: 2, gameSnaps: 500, practiceReps: 0 }, { seasons: 0, inSeasonWeeks: 2 })).toBeCloseTo(0.98 * 0.98 * 100 * (1 - Math.exp(-1)), 6);
    expect(unitCohesion(N, MATH, [])).toBe(0);
  });
});

describe('D9.6.1 and G5.4.1 readiness', () => {
  const play = (id: string, players: number[]): SheetCall => ({ section: id.startsWith('r') ? 'red_zone' : 'base', play: { id, items: ['c.stick'], assignments: players.map((p) => ({ player: p, position: 'WR', items: ['c.stick'] })) } });
  const est = new Map([[1, 90], [2, 80], [3, 60], [4, 95]]);
  const E = (p: number): number => est.get(p) ?? 0;
  it('every call on the sheet gets a readiness value; weakest link and G5.4.1 formula', () => {
    const rep = readinessReport(N, [play('b1', [1, 2]), play('b2', [1, 3]), play('r1', [2, 4])], E, [{ look: 'cover0', reps: 6, prep: 50 }]);
    expect(rep.calls.map((c) => c.weakestLink)).toEqual([80, 60, 80]);
    expect(rep.calls[1]!.playReadiness).toBeCloseTo(75 - 0.5 * 15, 9);
    expect(rep.flaggedCalls).toEqual(['b2']);
    expect(rep.calls[1]!.low).toEqual([{ player: 3, estimate: 60 }]);
    expect(rep.sections).toEqual([{ section: 'base', weakestLink: 60 }, { section: 'red_zone', weakestLink: 80 }]);
    expect(rep.opponent[0]!.recognitionBonus).toBeCloseTo(0.1, 12);
    expect(playReadiness(N, [])).toBe(0);
  });
  it('a late scratch recomputes with the substitute and flags calls that fell below 70', () => {
    expect(lateScratch(N, [play('b1', [1, 2]), play('r1', [2, 4])], E, 4, 3)).toEqual(['r1']);
  });
  it('opponent preparation expires except for division or conference, which keep 30 percent', () => {
    expect(prepAfterGame(N, 80, false)).toBe(0);
    expect(prepAfterGame(N, 80, true)).toBeCloseTo(24, 12);
    expect(recognitionBonus(N, 100)).toBeCloseTo(0.2, 12);
  });
  it('staff estimate error: 20 unseen, minus 2 a rep to 6, 4 after a test, coach skill multiplies', () => {
    expect(estimateSd(N, { observedReps: 0, tested: false }, 'average')).toBe(20);
    expect(estimateSd(N, { observedReps: 3, tested: false }, 'average')).toBe(14);
    expect(estimateSd(N, { observedReps: 30, tested: false }, 'average')).toBe(6);
    expect(estimateSd(N, { observedReps: 0, tested: true }, 'average')).toBe(4);
    expect(estimateSd(N, { observedReps: 0, tested: false }, 'low')).toBe(30);
    expect(estimateSd(N, { observedReps: 0, tested: false }, 'high')).toBeCloseTo(14, 12);
  });
});

describe('G5 install', () => {
  it('orders units by prerequisite and rejects cycles or missing units', () => {
    expect(installOrder([
      { id: 'play', items: {}, requires: ['formation', 'protection'] },
      { id: 'protection', items: {}, requires: [] },
      { id: 'formation', items: {}, requires: [] },
      { id: 'check', items: {}, requires: ['play'] },
    ])).toEqual(['formation', 'protection', 'play', 'check']);
    expect(() => installOrder([{ id: 'a', items: {}, requires: ['b'] }, { id: 'b', items: {}, requires: ['a'] }])).toThrow(/cycle/);
    expect(() => installOrder([{ id: 'a', items: {}, requires: ['z'] }])).toThrow(/not in the plan/);
  });
  it('daily limit splits at 12; the camp cycle is three installs of three days plus a situational day, three times', () => {
    const planned = Array.from({ length: 15 }, (_, i) => `u${i}`);
    expect(dailyLimitSplit(N, planned).over).toEqual(['u12', 'u13', 'u14']);
    const cycle = defaultCampCycle(N);
    expect(cycle).toHaveLength(30);
    expect(cycle.filter((d) => d.kind === 'situational')).toHaveLength(3);
  });
  it('weekly plan: new calls get 3+ reps, carry calls 1+, a short week projects lower and caps at walk-through', () => {
    const cat = new ItemCatalogue(N, ITEMS);
    for (const it of ITEMS) cat.install(it.id);
    const calls = [
      { call: 'carry1', items: ['c.stick'], players: [{ player: 1, position: 'WR', estimates: { 'c.stick': 85 } }] },
      { call: 'new1', items: ['c.wz_weak'], players: [{ player: 2, position: 'C', estimates: { 'c.wz_weak': 20 } }] },
    ];
    const base = { calls, repBudget: 12, walkthroughRepsPerCall: 3, meetingMinutesPerItem: 30, shortWeek: false };
    const full = planWeek(N, MATH, cat, base);
    expect(full.calls.find((c) => c.call === 'new1')!.reps).toBeGreaterThanOrEqual(3);
    expect(full.calls.find((c) => c.call === 'carry1')!.reps).toBeGreaterThanOrEqual(1);
    expect(full.repsUsed).toBe(12);
    const short = planWeek(N, MATH, cat, { ...base, shortWeek: true });
    expect(short.averageProjected).toBeLessThan(full.averageProjected);
    for (const c of short.calls) expect(c.projected).toBeLessThanOrEqual(Math.max(85, 80));
  });
  it('fading, backup QB split, catch-up package', () => {
    expect(isFading(N, 49, false)).toBe(true);
    expect(isFading(N, 49, true)).toBe(false);
    expect(isFading(N, 51, false)).toBe(false);
    expect(backupQbSplit(N, 100)).toEqual({ starter: 95, backup: 5 });
    expect(backupQbSplit(N, 100, 0.9)).toEqual({ starter: 50, backup: 50 });
    expect(catchUpPackage(N, Array.from({ length: 30 }, (_, i) => `c${i}`))).toHaveLength(15);
  });
});
