import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR } from '@gm/league';
import { CohesionRow, ParamFile, RelationshipEdge, type WorldDate } from '@gm/schema';
import {
  PARAMS, BASISLESS_KINDS, CohesionLedger, TieStore, applyEvent, contestModifier, createTie, d95Inputs, describeSide, fadeDormantRival,
  fit, formOrGrow, openPromise, personRivalry, resolvePromise, rivalryTrigger, rosterSeason, settleTie, settleVouch, sharedSnaps,
  sideOf, staffSeason, teamRivalry, toEdgeRows, vouch, closeness, friction, coachedSeason,
  type FitPerson, type PairContext, type SnapLineup,
} from '../../src/relationships/index.ts';
import { lcg } from '../needs/helpers.ts';

const day = (y: number, d: number): WorldDate => ({ seasonYear: y, dayIndex: d });
const MONTH = DAYS_PER_YEAR / 12;
const at = (months: number): WorldDate => { const days = Math.round(months * MONTH); return day(2030 + Math.floor(days / DAYS_PER_YEAR), days % DAYS_PER_YEAR); };

const ctx = (over: Partial<PairContext> = {}): PairContext => ({
  fitOf: () => 0, sociabilityOf: () => 50, loyaltyOf: () => 50, userId: null, ...over,
});
const person = (id: number, facets: Record<string, number> = {}, over: Partial<FitPerson> = {}): FitPerson => ({ id, origin: 'generated', protected: false, facets, ...over });
const pairDrawFrom = (seed: number) => (lo: number, hi: number): number => lcg(seed ^ Math.imul(lo, 73856093) ^ Math.imul(hi, 19349663))();

describe('params', () => {
  it('parameter file validates and every param names its leaf', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    for (const p of PARAMS.params) expect(p.leaf.length).toBeGreaterThan(0);
  });
});

describe('edge record (X7.1.1)', () => {
  it('a tie with no basis event cannot exist, except family and prior', () => {
    expect(() => createTie({ a: 1, b: 2, kind: 'worked_with', date: day(2030, 0), basisEventId: null })).toThrow(/basis event/);
    for (const k of BASISLESS_KINDS) expect(() => createTie({ a: 1, b: 2, kind: k, date: day(2030, 0), basisEventId: null })).not.toThrow();
  });

  it('starts at 20 moved by sociability up to plus or minus 10', () => {
    const lo = createTie({ a: 1, b: 2, kind: 'teammate', date: day(2030, 0), basisEventId: 5, sociabilityA: 0, sociabilityB: 0 });
    const hi = createTie({ a: 1, b: 2, kind: 'teammate', date: day(2030, 0), basisEventId: 5, sociabilityA: 100, sociabilityB: 100 });
    const mid = createTie({ a: 1, b: 2, kind: 'teammate', date: day(2030, 0), basisEventId: 5 });
    expect(lo.ab!.strength).toBe(10);
    expect(hi.ab!.strength).toBe(30);
    expect(mid.ab!.strength).toBe(20);
  });

  it("the user's own side is never stored", () => {
    const t = createTie({ a: 7, b: 8, kind: 'worked_under', date: day(2030, 0), basisEventId: 1, userId: 7 });
    expect(t.ab).toBeNull();
    expect(t.ba).not.toBeNull();
    const rows = toEdgeRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.a).toBe(8);
  });

  it('a staff season makes worked_under to the direct boss and worked_with among the rest, each with its basis event', () => {
    const store = new TieStore();
    const members = [
      { personId: 1, reportsTo: null, weeks: 40 },
      { personId: 2, reportsTo: 1, weeks: 40 },
      { personId: 3, reportsTo: 1, weeks: 40 },
      { personId: 4, reportsTo: 2, weeks: 1 }, // one week: no tie (edge case)
    ];
    staffSeason(store, ctx(), members, { eventId: 100, date: day(2030, 300), memoryStrength: 40 });
    expect(store.find('worked_under', 2, 1)).toBeDefined();
    expect(store.find('worked_under', 3, 1)).toBeDefined();
    expect(store.find('worked_with', 2, 3)).toBeDefined();
    expect(store.of(4)).toHaveLength(0);
    for (const t of store.all()) {
      expect(t.basis.length).toBeGreaterThan(0);
      for (const row of toEdgeRows(t)) expect(() => RelationshipEdge.parse(row)).not.toThrow();
    }
  });

  it('teammate ties form only within a position group or among starters on one side', () => {
    const store = new TieStore();
    rosterSeason(store, ctx(), [
      { personId: 1, group: 'OL', starterSide: 'offense', weeks: 17 },
      { personId: 2, group: 'OL', starterSide: null, weeks: 17 },
      { personId: 3, group: 'WR', starterSide: 'offense', weeks: 17 },
      { personId: 4, group: 'DB', starterSide: 'defense', weeks: 17 },
      { personId: 5, group: 'WR', starterSide: null, weeks: 17 },
    ], { eventId: 9, date: day(2030, 200), memoryStrength: 30 });
    expect(store.find('teammate', 1, 2)).toBeDefined(); // same group
    expect(store.find('teammate', 1, 3)).toBeDefined(); // starters, same side
    expect(store.find('teammate', 3, 5)).toBeDefined(); // same group
    expect(store.find('teammate', 1, 4)).toBeUndefined();
    expect(store.find('teammate', 2, 3)).toBeUndefined();
  });

  it('a second season together grows the tie instead of making another', () => {
    const store = new TieStore();
    const members = [{ personId: 1, reportsTo: null, weeks: 40 }, { personId: 2, reportsTo: 1, weeks: 40 }];
    staffSeason(store, ctx(), members, { eventId: 1, date: day(2030, 300), memoryStrength: 50 });
    const before = store.find('worked_under', 2, 1)!.ab!.strength;
    staffSeason(store, ctx(), members, { eventId: 2, date: day(2031, 300), memoryStrength: 50, togetherFrom: day(2031, 0) });
    expect(store.size).toBe(1);
    expect(store.find('worked_under', 2, 1)!.ab!.strength).toBe(before + 5);
    expect(store.find('worked_under', 2, 1)!.basis.map((b) => b.eventId)).toContain(2);
    // Without the season's start date the months between the two season-end events count as no contact.
    const gap = new TieStore();
    staffSeason(gap, ctx(), members, { eventId: 1, date: day(2030, 300), memoryStrength: 50 });
    staffSeason(gap, ctx(), members, { eventId: 2, date: day(2031, 300), memoryStrength: 50 });
    expect(gap.find('worked_under', 2, 1)!.ab!.strength).toBeLessThan(before + 5);
  });

  it('coached and recruited ties point from the junior party', () => {
    const store = new TieStore();
    coachedSeason(store, ctx(), 50, [{ personId: 1, weeks: 17 }, { personId: 50, weeks: 17 }], { eventId: 3, date: day(2030, 1), memoryStrength: 20 });
    expect(store.find('coached', 1, 50)).toBeDefined();
    expect(store.size).toBe(1);
  });

  it('keeps only the five strongest basis events', () => {
    const t = createTie({ a: 1, b: 2, kind: 'teammate', date: day(2030, 0), basisEventId: 1 });
    for (let i = 2; i <= 9; i++) applyEvent(t, { eventId: i, date: day(2030, i), sign: 1, memoryStrength: i * 5, firstHand: true, contact: true }, 0, null);
    expect(t.basis).toHaveLength(5);
    expect(t.basis[0]!.eventId).toBe(1); // the forming event carried the start strength (20)
  });

  it('rivals form after 3 meetings with stakes 15 or more inside 6 seasons', () => {
    const m = (id: number, y: number, stakes: number) => ({ eventId: id, date: day(y, 100), stakes });
    expect(rivalryTrigger([m(1, 2030, 20), m(2, 2032, 20), m(3, 2036, 20)])).toBeNull(); // spans 7 seasons
    expect(rivalryTrigger([m(1, 2030, 20), m(2, 2031, 10), m(3, 2032, 20)])).toBeNull(); // one low stakes
    expect(rivalryTrigger([m(1, 2030, 20), m(2, 2031, 15), m(3, 2035, 30)])).toBe(3);
    const store = new TieStore();
    expect(personRivalry(store, ctx(), 5, 4, [m(1, 2030, 20), m(2, 2031, 15), m(3, 2035, 30)])!.basis[0]!.eventId).toBe(3);
    const team = teamRivalry(store, 20, 10, [m(4, 2030, 20), m(5, 2031, 15), m(6, 2032, 30)])!;
    expect(team.request).toEqual({ type: 'rivalry_formed', teamId: 10, otherTeamId: 20, causeId: 6, date: day(2032, 100) });
    expect(teamRivalry(store, 10, 20, [])!.request).toBeNull();
  });
});

describe('fit (X7.2.1)', () => {
  it('is 0 with no pair term when either party is the user, imported or protected', () => {
    let calls = 0;
    const draw = () => { calls += 1; return 0.9; };
    const g = person(1, { work_habits: 90 });
    for (const other of [person(2, {}, { origin: 'user' }), person(2, {}, { origin: 'imported' }), person(2, { work_habits: 90 }, { protected: true })]) {
      expect(fit({ a: g, b: other, role: 'peers', pairDraw: draw })).toBe(0);
    }
    expect(calls).toBe(0);
  });

  it('friction terms subtract for the named pairings', () => {
    const boss = person(1, { ego: 80, candor: 20, risk_tolerance: 10 });
    const sub = person(2, { ego: 85, candor: 80, risk_tolerance: 90 });
    expect(friction(boss, sub, 'peers')).toBe(0);
    expect(friction(boss, sub, 'boss_and_subordinate')).toBeCloseTo(0.5);
    expect(friction(boss, sub, 'head_coach_and_play_caller')).toBeCloseTo(0.7);
  });

  it('the pair term is the same in either order and stays inside plus or minus 0.3', () => {
    const d = pairDrawFrom(7);
    const a = person(3, { work_habits: 50, discipline: 50, candor: 50 });
    const b = person(9, { work_habits: 50, discipline: 50, candor: 50 });
    const ab = fit({ a, b, role: 'peers', pairDraw: d });
    const ba = fit({ a: b, b: a, role: 'peers', pairDraw: d });
    expect(ab).toBe(ba);
    expect(Math.abs(ab - closeness(a, b))).toBeLessThanOrEqual(0.3);
  });

  it('over 1,000 seeded pairs, low-fit staff pairs end the season weaker than high-fit pairs with identical events', () => {
    const r = lcg(42);
    const d = pairDrawFrom(99);
    const results: { f: number; s: number }[] = [];
    for (let i = 0; i < 1000; i++) {
      const facets = () => ({ work_habits: Math.floor(r() * 101), discipline: Math.floor(r() * 101), candor: Math.floor(r() * 101), ego: Math.floor(r() * 101), risk_tolerance: Math.floor(r() * 101) });
      const boss = person(2 * i + 1, facets());
      const sub = person(2 * i + 2, facets());
      const f = fit({ a: boss, b: sub, role: 'boss_and_subordinate', pairDraw: d });
      const store = new TieStore();
      const c = ctx({ fitOf: () => f });
      staffSeason(store, c, [{ personId: boss.id, reportsTo: null, weeks: 40 }, { personId: sub.id, reportsTo: boss.id, weeks: 40 }], { eventId: 1, date: day(2030, 10), memoryStrength: 40 });
      const t = store.find('worked_under', sub.id, boss.id)!;
      for (let e = 0; e < 6; e++) applyEvent(t, { eventId: 10 + e, date: day(2030, 20 + e * 30), sign: 1, memoryStrength: 50, firstHand: true, contact: true }, f, null);
      results.push({ f, s: t.ab!.strength });
    }
    results.sort((x, y) => x.f - y.f);
    const q = results.length / 4;
    const mean = (xs: { s: number }[]) => xs.reduce((a, b) => a + b.s, 0) / xs.length;
    expect(mean(results.slice(0, q))).toBeLessThan(mean(results.slice(-q)));
  });
});

describe('growth and decay (X7.2.2)', () => {
  it('a positive event adds memory strength x 0.1 x (1 + 0.5 fit)', () => {
    const t = createTie({ a: 1, b: 2, kind: 'worked_with', date: day(2030, 0), basisEventId: 1 });
    applyEvent(t, { eventId: 2, date: day(2030, 1), sign: 1, memoryStrength: 60, firstHand: true, contact: true }, 1, 1);
    expect(t.ab!.strength).toBeCloseTo(20 + 60 * 0.1 * 1.5);
    expect(t.ba!.strength).toBe(20); // only the holder's side moved
  });

  it('an untouched edge reaches its floor and stops', () => {
    const t = createTie({ a: 1, b: 2, kind: 'worked_with', date: at(0), basisEventId: 1, strength: 80 });
    settleTie(t, at(5));
    expect(t.ab!.strength).toBe(80); // inside the 6-month grace
    settleTie(t, at(16));
    expect(t.ab!.strength).toBeCloseTo(70, 0);
    settleTie(t, at(200));
    expect(t.ab!.strength).toBe(20); // a quarter of the peak of 80
    settleTie(t, at(400));
    expect(t.ab!.strength).toBe(20);
    expect(t.ab!.sign).toBe('neutral'); // time never changes the sign
  });

  it('decay is the same whether settled monthly or at once, and halves for a loyal holder', () => {
    const once = createTie({ a: 1, b: 2, kind: 'worked_with', date: at(0), basisEventId: 1, strength: 80 });
    const monthly = createTie({ a: 1, b: 2, kind: 'worked_with', date: at(0), basisEventId: 1, strength: 80 });
    for (let m = 1; m <= 30; m++) settleTie(monthly, at(m));
    settleTie(once, at(30));
    expect(monthly.ab!.strength).toBeCloseTo(once.ab!.strength, 0);
    const loyal = createTie({ a: 1, b: 2, kind: 'worked_with', date: at(0), basisEventId: 1, strength: 80 });
    settleTie(loyal, at(26), { a: 90, b: 50 });
    expect(loyal.ab!.strength).toBeCloseTo(70, 0);
    expect(loyal.ba!.strength).toBeCloseTo(60, 0);
  });

  it('a cold edge warms only through first-hand positive events, never by time or hearsay', () => {
    const t = createTie({ a: 1, b: 2, kind: 'worked_with', date: day(2030, 0), basisEventId: 1 });
    applyEvent(t, { eventId: 2, date: day(2030, 5), sign: -1, memoryStrength: 80, firstHand: true, contact: true }, 0, 1);
    expect(t.ab!.sign).toBe('cold');
    const s = t.ab!.strength;
    applyEvent(t, { eventId: 3, date: day(2030, 10), sign: 1, memoryStrength: 100, firstHand: false, contact: false }, 0, 1);
    expect(t.ab!.strength).toBe(s);
    for (let i = 0; i < 4; i++) applyEvent(t, { eventId: 4 + i, date: day(2030, 20 + i), sign: 1, memoryStrength: 100, firstHand: true, contact: true }, 0, 1);
    expect(t.ab!.sign).not.toBe('cold');
    expect(describeSide(t.ab!)).not.toBe('cold');
  });

  it('a dormant team rivalry fades by a tenth of the gap a season after 10 seasons, from its faded strength', () => {
    const store = new TieStore();
    const { tie } = teamRivalry(store, 1, 2, [1, 2, 3].map((i) => ({ eventId: i, date: day(2030 + i, 1), stakes: 50 })))!;
    tie.ab!.strength = 80; tie.ab!.peak = 80;
    fadeDormantRival(tie, 2043, 2033);
    expect(tie.ab!.strength).toBe(80);
    fadeDormantRival(tie, 2044, 2033);
    expect(tie.ab!.strength).toBeCloseTo(80 - 0.1 * (80 - 20));
  });

  it('words, never numbers', () => {
    const t = createTie({ a: 1, b: 2, kind: 'worked_with', date: day(2030, 0), basisEventId: 1, strength: 65 });
    expect(describeSide(t.ab!)).toBe('close');
    t.ab!.strength = 35; expect(describeSide(t.ab!)).toBe('working');
    t.ab!.strength = 10; expect(describeSide(t.ab!)).toBe('distant');
  });
});

describe('promises (X7.2.3)', () => {
  const setup = () => {
    const store = new TieStore();
    const c = ctx();
    // holder 1 and witness 3 have warm ties to coach 9; bystander 4 has a tie to coach 9 but heard nothing.
    for (const p of [1, 3, 4]) {
      const t = createTie({ a: p, b: 9, kind: 'coached', date: day(2030, 0), basisEventId: 100 + p, strength: 70 });
      t.ab!.sign = 'warm';
      store.put(t);
    }
    openPromise(store, c, { promiseId: 5, promiserId: 9, holderId: 1, eventId: 200, date: day(2030, 10) });
    return { store, c };
  };

  it('a broken promise turns a warm edge cold, hits 30, and moves only the witnesses', () => {
    const { store, c } = setup();
    const effects = resolvePromise(store, c, { promiseId: 5, promiserId: 9, holderId: 1, outcome: 'broken', eventId: 201, date: day(2030, 50), witnesses: [{ personId: 3, memoryStrength: 40 }] });
    const holder = store.find('coached', 1, 9)!;
    expect(holder.ab!.strength).toBe(40);
    expect(holder.ab!.sign).toBe('cold');
    expect(store.find('promise', 1, 9, null, 5)).toBeUndefined();
    expect(store.find('coached', 3, 9)!.ab!.strength).toBeCloseTo(66);
    expect(store.find('coached', 4, 9)!.ab!.strength).toBe(70);
    expect(effects.map((e) => e.personId).sort()).toEqual([1, 3]);
  });

  it('kept adds 15; void changes nothing', () => {
    const a = setup();
    resolvePromise(a.store, a.c, { promiseId: 5, promiserId: 9, holderId: 1, outcome: 'kept', eventId: 201, date: day(2030, 50), witnesses: [] });
    expect(a.store.find('coached', 1, 9)!.ab!.strength).toBe(85);
    const b = setup();
    expect(resolvePromise(b.store, b.c, { promiseId: 5, promiserId: 9, holderId: 1, outcome: 'void', eventId: 201, date: day(2030, 50), witnesses: [{ personId: 3, memoryStrength: 40 }] })).toEqual([]);
    expect(b.store.find('coached', 1, 9)!.ab!.strength).toBe(70);
  });
});

describe('vouching (X7.4.2)', () => {
  it('an unknown candidate with a strong voucher outranks an identical one without', () => {
    const store = new TieStore();
    const c = ctx();
    formOrGrow(store, c, 'worked_with', 1, 2, { eventId: 1, date: day(2030, 0), memoryStrength: 50 }); // decider 1, voucher 2
    sideOf(store.find('worked_with', 1, 2)!, 1)!.strength = 80;
    const base = 0.5;
    const withVoucher = base + vouch(store, { voucherId: 2, deciderId: 1, candidateId: 10, opinion: 0.8, voucherProtected: false, date: day(2031, 0) }).impression;
    const without = base;
    expect(withVoucher).toBeGreaterThan(without);
    expect(withVoucher - base).toBeCloseTo(80 * 0.01 * 0.8);
  });

  it('a voucher the decider is cold to lowers the candidate; a protected voucher is neutral', () => {
    const store = new TieStore();
    formOrGrow(store, ctx(), 'worked_with', 1, 2, { eventId: 1, date: day(2030, 0), memoryStrength: 50 });
    sideOf(store.find('worked_with', 1, 2)!, 1)!.sign = 'cold';
    expect(vouch(store, { voucherId: 2, deciderId: 1, candidateId: 10, opinion: 0.9, voucherProtected: false, date: day(2031, 0) }).impression).toBeLessThan(0);
    const n = vouch(store, { voucherId: 2, deciderId: 1, candidateId: 10, opinion: 0.9, voucherProtected: true, date: day(2031, 0) });
    expect(n.event.form).toBe('neutral');
    expect(n.impression === 0).toBe(true);
  });

  it('a fired candidate within 2 seasons costs the voucher 10; promoted adds 5', () => {
    const store = new TieStore();
    formOrGrow(store, ctx(), 'worked_with', 1, 2, { eventId: 1, date: day(2030, 0), memoryStrength: 50 });
    expect(settleVouch(store, 1, 2, 'fired', 1)).toBe(-10);
    expect(settleVouch(store, 1, 2, 'fired', 3)).toBe(0);
    expect(settleVouch(store, 1, 2, 'promoted', 1)).toBe(5);
  });
});

describe('unit cohesion (X7.3)', () => {
  const lineup = (ol: number[], qb: number, c: number, wr: number[], db: number[]): SnapLineup => ({ offensiveLine: ol, quarterback: qb, center: c, receivers: wr, secondary: db });

  it('pair counts equal the sum of shared snaps in the play log for a test season', () => {
    const r = lcg(5);
    const ledger = new CohesionLedger(1, 2030);
    const log: { l: SnapLineup; kind: 'game' | 'practice' }[] = [];
    for (let i = 0; i < 1200; i++) {
      const five = r() < 0.2 // 15 rotates in for 14
        ? [10, 11, 12, 13, 15] : [10, 11, 12, 13, 14];
      log.push({ l: lineup(five, 1, 12, r() < 0.5 ? [20, 21, 22] : [20, 23], [30, 31, 32, 33]), kind: r() < 0.7 ? 'game' : 'practice' });
    }
    for (const { l, kind } of log) ledger.record(l, kind, day(2030, 100));
    const expectPair = (unit: 'ol' | 'qb_receiver', x: number, y: number) => {
      let g = 0; let p = 0;
      for (const { l, kind } of log) {
        const together = unit === 'ol' ? l.offensiveLine!.includes(x) && l.offensiveLine!.includes(y) : l.quarterback === x && l.receivers!.includes(y);
        if (together) { if (kind === 'game') g += 1; else p += 1; }
      }
      const got = ledger.get(unit, x, y)!;
      expect(got.gameSnaps).toBe(g);
      expect(got.practiceReps).toBe(p);
      expect(sharedSnaps(got)).toBeCloseTo(g + 0.25 * p);
    };
    expectPair('ol', 10, 14);
    expectPair('ol', 13, 14);
    expectPair('ol', 11, 15);
    expectPair('qb_receiver', 1, 23);
    expect(ledger.get('ol', 14, 15)).toBeUndefined(); // never on the field together
    for (const row of ledger.toRows()) expect(() => CohesionRow.parse(row)).not.toThrow();
  });

  it('counts carry over between seasons at 70 percent; D9.5.1 reads raw counts', () => {
    const ledger = new CohesionLedger(1, 2030);
    for (let i = 0; i < 100; i++) ledger.record({ quarterback: 1, center: 2 }, 'game', day(2030, 10));
    for (let i = 0; i < 40; i++) ledger.record({ quarterback: 1, center: 2 }, 'practice', day(2030, 11));
    ledger.rollSeason(2031);
    const p = ledger.get('qb_center', 2, 1)!;
    expect(p.gameSnaps).toBeCloseTo(70);
    expect(p.practiceReps).toBeCloseTo(28);
    expect(d95Inputs(ledger)).toEqual([{ unit: 'qb_center', a: 1, b: 2, gameSnaps: p.gameSnaps, practiceReps: p.practiceReps, lastTogether: day(2030, 11) }]);
  });

  it('the contest modifier ships at zero, saturates at 90 percent of its cap by 800 snaps, and never exceeds the cap', () => {
    expect(contestModifier(5000)).toBe(0);
    const cap = 0.015;
    expect(contestModifier(800, cap) / cap).toBeCloseTo(0.9);
    expect(contestModifier(0, cap)).toBe(0);
    // Two otherwise equal lines (0 and 100,000 shared snaps) differ by less than the stated band: the cap.
    expect(contestModifier(100000, cap) - contestModifier(0, cap)).toBeLessThan(cap);
  });
});

describe('determinism', () => {
  it('same inputs, same ties', () => {
    const build = () => {
      const store = new TieStore();
      const r = lcg(3);
      const members = Array.from({ length: 20 }, (_, i) => ({ personId: i + 1, reportsTo: i === 0 ? null : 1 + Math.floor(r() * i), weeks: 40 }));
      staffSeason(store, ctx({ fitOf: (a, b) => ((a * 31 + b * 17) % 100) / 100 - 0.5 }), members, { eventId: 1, date: day(2030, 1), memoryStrength: 30 });
      return JSON.stringify(store.all().flatMap(toEdgeRows));
    };
    expect(build()).toBe(build());
  });
});
