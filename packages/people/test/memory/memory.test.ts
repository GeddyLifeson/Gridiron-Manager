import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR } from '@gm/league';
import { EventTypeDef, MemoryRow, ParamFile, type WorldDate } from '@gm/schema';
import {
  PARAMS, createMemoryRow, insertShort, pruneShort, stackedStrength, shortStrength, permanentStrength, promoteAtSeasonEnd,
  refeel, demote, outlookChange, impression, toMemoryRow, OUTLOOK_EVENT_TYPE, kindId,
  type HeldMemory, type KindTable, type MemoryEventInput, type HolderInput, type WitnessInput,
} from '../../src/memory/index.ts';
import { lcg } from '../needs/helpers.ts';

const day = (y: number, d: number): WorldDate => ({ seasonYear: y, dayIndex: d });
const MONTH = DAYS_PER_YEAR / 12;
const at = (months: number): WorldDate => { const days = Math.round(months * MONTH); return day(2030 + Math.floor(days / DAYS_PER_YEAR), days % DAYS_PER_YEAR); };

let nextId = 1;
const ev = (over: Partial<MemoryEventInput> = {}): MemoryEventInput => ({
  id: nextId++, type: 'benched', family: 'roster', date: day(2030, 0), notability: 80, aboutPersonId: 9, aboutTeamId: null,
  importedAllowed: true, involvesTier1: true, ...over,
});
const holder = (over: Partial<HolderInput> = {}): HolderInput => ({ id: 1, origin: 'generated', tier: 1, ...over });
const wit = (over: Partial<WitnessInput> = {}): WitnessInput => ({ stake: 'subject', role: 'subject', sign: -1, witnessed: true, newsDelivered: false, ...over });
const KINDS: KindTable = {
  [kindId('benched', 'subject')]: { negativeWeight: 1.5 },
  [kindId('named_starter', 'subject')]: {},
  [kindId('promise_kept', 'subject')]: { erases: [kindId('promise_doubted', 'subject')] },
  [kindId('first_start', 'subject')]: { first: true },
};
const row = (over: Partial<MemoryEventInput> = {}, w: Partial<WitnessInput> = {}, h: Partial<HolderInput> = {}) => createMemoryRow(ev(over), holder(h), wit(w), KINDS)!;

describe('params and types', () => {
  it('parameter file validates', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    expect(() => EventTypeDef.parse(OUTLOOK_EVENT_TYPE)).not.toThrow();
    expect(OUTLOOK_EVENT_TYPE.importedAllowed).toBe(false);
  });
  it('rows store in the G-00 MemoryRow shape', () => {
    expect(() => MemoryRow.parse(toMemoryRow(row()))).not.toThrow();
  });
});

describe('X6.1.1 memory rows', () => {
  it('strength is notability times stake: 1.0 subject, 0.6 room, 0.3 onlooker; second hand at half', () => {
    expect(row({}, { sign: 1 }).strength).toBe(80);
    expect(row({}, { stake: 'room', sign: 0 }).strength).toBe(48);
    expect(row({}, { stake: 'onlooker', sign: 1 }).strength).toBe(24);
    const sh = row({}, { sign: 1, witnessed: false, newsDelivered: true });
    expect(sh.strength).toBe(40);
    expect(sh.secondHand).toBe(true);
  });
  it('losses weigh more than gains for role events (X6.1.3 rule 4), capped at 100', () => {
    expect(row({ notability: 40 }).strength).toBe(60);
    expect(row({ notability: 90 }).strength).toBe(100);
  });
  it('no row for a non-witness without news, for the user, at tier 3, at tier 2 without a tier 1 person, or a protected holder on a personal type', () => {
    expect(createMemoryRow(ev(), holder(), wit({ witnessed: false }), KINDS)).toBeNull();
    expect(createMemoryRow(ev(), holder({ origin: 'user' }), wit(), KINDS)).toBeNull();
    expect(createMemoryRow(ev(), holder({ tier: 3 }), wit(), KINDS)).toBeNull();
    expect(createMemoryRow(ev({ involvesTier1: false }), holder({ tier: 2 }), wit(), KINDS)).toBeNull();
    expect(createMemoryRow(ev({ involvesTier1: true }), holder({ tier: 2 }), wit(), KINDS)).not.toBeNull();
    expect(createMemoryRow(ev({ importedAllowed: false }), holder({ origin: 'imported' }), wit(), KINDS)).toBeNull();
    expect(createMemoryRow(ev({ importedAllowed: true }), holder({ origin: 'imported' }), wit(), KINDS)).not.toBeNull();
  });
});

describe('X6.1.3 hold, fade and repeats', () => {
  it('a benching is felt at full strength through 70 percent of its life and is gone at the end', () => {
    const r = row({ date: at(0) });
    expect(shortStrength(r, KINDS, at(0.7 * 6 - 0.05))).toBe(r.strength);
    expect(shortStrength(r, KINDS, at(5))).toBeLessThan(r.strength);
    expect(shortStrength(r, KINDS, at(6))).toBe(0);
  });
  it('a kind with no life loses 10 percent a month', () => {
    const r = row({ family: 'discipline', type: 'fined', date: at(0) }, { sign: -1, role: 'x' });
    expect(shortStrength(r, KINDS, at(1))).toBeCloseTo(r.strength * 0.9, 0);
  });
  it('ten praises in a month move the impression by no more than 1/(1 - stack factor) of one', () => {
    let rows: HeldMemory[] = [];
    for (let i = 0; i < 10; i++) rows = [...insertShort(rows, row({ type: 'praised', family: 'relationship', date: day(2030, i * 3), notability: 50 }, { sign: 1, role: 'subject' }), KINDS, day(2030, 30)).rows];
    const praise = rows.filter((r) => r.kind === kindId('praised', 'subject'));
    expect(praise.length).toBe(5); // stack cap: further rows are not stored
    const one = impression({ origin: 'generated' }, [praise[0]!], { aboutPersonId: 9, aboutTeamId: null }, KINDS, day(2030, 30)).weight;
    const all = impression({ origin: 'generated' }, rows, { aboutPersonId: 9, aboutTeamId: null }, KINDS, day(2030, 30)).weight;
    expect(all / one).toBeLessThanOrEqual(1 / (1 - 0.75));
    expect(all / one).toBeCloseTo(1 + 0.75 + 0.5625 + 0.421875 + 0.31640625, 2);
    expect(stackedStrength(praise, KINDS, day(2030, 30)) / 50).toBeCloseTo(3.05, 1);
  });
  it('an equal and opposite pair of role events leaves a net negative impression', () => {
    const rows = [row({ type: 'named_starter', notability: 50 }, { sign: 1 }), row({ type: 'benched', notability: 50 }, { sign: -1 })];
    expect(impression({ origin: 'generated' }, rows, { aboutPersonId: 9, aboutTeamId: null }, KINDS, day(2030, 1)).weight).toBeLessThan(0);
  });
  it('a kept promise erases the matching doubt', () => {
    let rows = [...insertShort([], row({ type: 'promise_doubted', family: 'relationship' }, { sign: -1 }), KINDS, day(2030, 1)).rows];
    const r = insertShort(rows, row({ type: 'promise_kept', family: 'relationship' }, { sign: 1 }), KINDS, day(2030, 2));
    rows = [...r.rows];
    expect(rows.map((x) => x.kind)).toEqual([kindId('promise_kept', 'subject')]);
  });
});

describe('X6.1.2 the short layer', () => {
  it('no holder exceeds 8 rows per group in a soak, and the strongest stay', () => {
    const d = lcg(42);
    let rows: HeldMemory[] = [];
    for (let i = 0; i < 400; i++) {
      const fam = ['game', 'career', 'roster', 'relationship', 'discipline', 'media'][i % 6]!;
      const r = row({ family: fam, type: `t${i % 13}`, aboutPersonId: 1 + (i % 7), notability: Math.floor(d() * 100), date: day(2030, i % 300) }, { sign: 1, role: 'r' });
      rows = pruneShort(insertShort(rows, r, KINDS, day(2030, i % 300)).rows, KINDS, day(2030, i % 300));
      const counts = new Map<string, number>();
      for (const x of rows) counts.set(x.category, (counts.get(x.category) ?? 0) + 1);
      for (const c of counts.values()) expect(c).toBeLessThanOrEqual(8);
    }
  });
  it('a weaker row does not enter a full group; at equal strength the later one stays', () => {
    let rows: HeldMemory[] = [];
    for (let i = 0; i < 8; i++) rows = [...insertShort(rows, row({ type: `g${i}`, family: 'game', notability: 50 }, { sign: 1, role: 'r' }), KINDS, day(2030, 1)).rows];
    expect(insertShort(rows, row({ type: 'weak', family: 'game', notability: 10 }, { sign: 1, role: 'r' }), KINDS, day(2030, 1)).inserted).toBe(false);
    const eq = insertShort(rows, row({ type: 'eq', family: 'game', notability: 50 }, { sign: 1, role: 'r' }), KINDS, day(2030, 1));
    expect(eq.inserted).toBe(true);
    expect(eq.rows.filter((r) => r.category === 'game')).toHaveLength(8);
  });
  it('rows under strength 5 are deleted', () => {
    const r = row({ date: at(0) });
    expect(pruneShort([r], KINDS, at(5.95))).toHaveLength(0);
  });
});

describe('X6.2 the permanent layer', () => {
  it('promotes strong rows, the strongest row about an edge person, and first events; caps at 12', () => {
    const rows: HeldMemory[] = [
      row({ notability: 75, type: 'named_starter' }, { sign: 1 }),
      row({ notability: 20, type: 'praised', family: 'relationship', aboutPersonId: 5 }, { sign: 1, role: 'subject' }),
      row({ notability: 10, type: 'praised', family: 'relationship', aboutPersonId: 5 }, { sign: 1, role: 'subject' }),
      row({ notability: 10, type: 'first_start', family: 'game' }, { sign: 1 }),
      row({ notability: 10, type: 'second_start', family: 'game' }, { sign: 1 }),
    ];
    const p = promoteAtSeasonEnd(rows, KINDS, day(2031, 0), { edgePersonIds: new Set([5]) });
    expect(p.promoted.map((r) => r.strength).sort((a, b) => a - b)).toEqual([10, 20, 75]);
    expect(p.compactionExempt).toHaveLength(3);
    let many: HeldMemory[] = [];
    for (let i = 0; i < 30; i++) many.push(row({ notability: 70 + (i % 30), type: `big${i}` }, { sign: 1, role: 'r' }));
    const full = promoteAtSeasonEnd(many, KINDS, day(2031, 0), { edgePersonIds: new Set() });
    expect(full.rows.filter((r) => r.layer === 'permanent')).toHaveLength(12);
    expect(Math.min(...full.rows.filter((r) => r.layer === 'permanent').map((r) => r.strength))).toBeGreaterThanOrEqual(88);
  });
  it('softens 5 percent a season to a floor of 40 percent, faster after later positive events', () => {
    const p: HeldMemory = { ...row({ date: day(2030, 0), notability: 60 }), layer: 'permanent' };
    expect(permanentStrength(p, day(2034, 0), false)).toBeCloseTo(p.strength * 0.8);
    expect(permanentStrength(p, day(2060, 0), false)).toBeCloseTo(p.strength * 0.4);
    expect(permanentStrength(p, day(2034, 0), true)).toBeCloseTo(p.strength * 0.7);
  });
  it('a rematch re-feels the row once per meeting, never for a retired subject', () => {
    const p: HeldMemory = { ...row({ date: day(2030, 0) }), layer: 'permanent' };
    const first = refeel([p], { aboutPersonId: 9, aboutTeamId: null }, day(2032, 100), false);
    expect(first.hits).toHaveLength(1);
    expect(first.hits[0]!.stress).toBeGreaterThan(0); // a negative memory is a stress hit
    expect(refeel(first.rows, { aboutPersonId: 9, aboutTeamId: null }, day(2032, 100), false).hits).toHaveLength(0);
    expect(refeel(first.rows, { aboutPersonId: 9, aboutTeamId: null }, day(2033, 100), false).hits).toHaveLength(1);
    expect(refeel([p], { aboutPersonId: 9, aboutTeamId: null }, day(2032, 100), true).hits).toHaveLength(0);
  });
  it('demotion promotes what qualifies and keeps only what the new tier stores', () => {
    const rows = [row({ notability: 90, type: 'named_starter' }, { sign: 1 }), row({ notability: 20, type: 'x' }, { sign: 1, role: 'r' })];
    expect(demote(rows, KINDS, day(2031, 0), { edgePersonIds: new Set() }, 3, () => true).rows.every((r) => r.layer === 'permanent')).toBe(true);
    expect(demote(rows, KINDS, day(2031, 0), { edgePersonIds: new Set() }, 2, () => true).rows).toHaveLength(2);
  });
});

describe('X6.3.1 rare permanent facet change', () => {
  const touch: HeldMemory = { ...row({ notability: 95, type: 'fired', family: 'career' }, { sign: -1, role: 'subject' }), layer: 'permanent', strength: 95 };
  it('never for a protected person or the user, at most twice, inside 0 to 100', () => {
    expect(outlookChange({ id: 1, origin: 'imported', facets: {}, outlookChanges: 0 }, touch, 'fired', () => 0)).toBeNull();
    expect(outlookChange({ id: 1, origin: 'user', facets: {}, outlookChanges: 0 }, touch, 'fired', () => 0)).toBeNull();
    expect(outlookChange({ id: 1, origin: 'generated', facets: {}, outlookChanges: 2 }, touch, 'fired', () => 0)).toBeNull();
    const c = outlookChange({ id: 1, origin: 'generated', facets: { risk_tolerance: 98 }, outlookChanges: 0 }, touch, 'fired', () => 0.99 * 0 + 0.6)
      ?? outlookChange({ id: 1, origin: 'generated', facets: { risk_tolerance: 98 }, outlookChanges: 0 }, touch, 'fired', () => 0.1);
    expect(c).not.toBeNull();
    expect(c!.to).toBeLessThanOrEqual(100);
    expect(Math.abs(c!.to - c!.from)).toBeLessThanOrEqual(10);
  });
  it('fires about 20 percent of the time', () => {
    const d = lcg(9);
    let n = 0;
    for (let i = 0; i < 5000; i++) if (outlookChange({ id: 1, origin: 'generated', facets: {}, outlookChanges: 0 }, touch, 'fired', d)) n++;
    expect(n / 5000).toBeGreaterThan(0.17);
    expect(n / 5000).toBeLessThan(0.23);
  });
  it('a weaker row never changes anyone', () => {
    expect(outlookChange({ id: 1, origin: 'generated', facets: {}, outlookChanges: 0 }, { ...touch, strength: 80 }, 'fired', () => 0)).toBeNull();
  });
});

describe('X6.4.1 impressions', () => {
  it('an owner who witnessed a blowout loss to a candidate\'s team ranks him differently, and cites that game', () => {
    const loss = row({ type: 'blowout_loss', family: 'game', aboutPersonId: 77, notability: 85 }, { sign: -1, role: 'owner', stake: 'room' });
    const withRow = impression({ origin: 'generated' }, [loss], { aboutPersonId: 77, aboutTeamId: null }, KINDS, day(2030, 10));
    const without = impression({ origin: 'generated' }, [], { aboutPersonId: 77, aboutTeamId: null }, KINDS, day(2030, 10));
    expect(withRow.weight).toBeLessThan(without.weight);
    expect(withRow.evidence[0]!.eventId).toBe(loss.eventId);
  });
  it('second-hand rows weigh half', () => {
    const first = row({ type: 'a', notability: 60 }, { sign: 1, role: 'r' });
    const second = row({ type: 'b', notability: 60 }, { sign: 1, role: 'r', witnessed: false, newsDelivered: true });
    const s = { aboutPersonId: 9, aboutTeamId: null };
    expect(impression({ origin: 'generated' }, [second], s, KINDS, day(2030, 1)).weight).toBeCloseTo(impression({ origin: 'generated' }, [first], s, KINDS, day(2030, 1)).weight / 4);
  });
  it('a protected holder\'s rows feed views with football matters only', () => {
    const grievance = row({ type: 'snubbed', family: 'relationship' }, { sign: -1, role: 'r' });
    const result = row({ type: 'won', family: 'game' }, { sign: 1, role: 'r' });
    const imp = impression({ origin: 'imported' }, [grievance, result], { aboutPersonId: 9, aboutTeamId: null }, KINDS, day(2030, 1));
    expect(imp.evidence.map((e) => e.eventId)).toEqual([result.eventId]);
  });
});
