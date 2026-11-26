// E8.3.1, E8.3.2, E8.3.3, E8.4.1, S9.3.1 acceptance.
import { describe, expect, it } from 'vitest';
import {
  newHousehold, weekSatisfaction, schoolStage, ageOf, strongTie, tierDrop, breakTogether, generateYearEvents, resolveEvent,
  eventSatisfactionChange, acceptOffer, relocate, completeMove, apartHomeCapHours, moveAllChange, DEFAULT_LIFE_REALISM,
  type Household, type Member, type YearCalendar,
} from '../../src/life/index.ts';
import { rng } from './rng.ts';

const s = { personId: 1, imported: false };
const partner: Member = { id: 10, role: 'partner', birthYear: 1990, occupation: 'placeTied', tieRegion: 'southeast' };
const kid = (id: number, birthYear: number): Member => ({ id, role: 'child', birthYear, occupation: 'none', tieRegion: null });
const family = (): Household => newHousehold(s, [partner, kid(11, 2010), kid(12, 2018)]);
const cal = (year: number): YearCalendar => ({ year, firstWeek: (year - 2026) * 52, weeks: 52, inSeasonOffsets: Array.from({ length: 22 }, (_, i) => 30 + i) });

describe('E8.3.1 the household object', () => {
  it('an empty household runs with no prompts: no events, no satisfaction movement', () => {
    const h = newHousehold(s, []);
    expect(generateYearEvents(h, cal(2026), rng(1))).toEqual([]);
    expect(weekSatisfaction(h, { week: 1, homeHours: 0, inSeason: true, livingApart: false }, DEFAULT_LIFE_REALISM).household).toBe(h);
  });
  it('children age one year per calendar year and move through school stages', () => {
    const k = kid(11, 2010);
    expect([2014, 2015, 2024, 2028].map((y) => schoolStage(ageOf(k, y)))).toEqual(['notYet', 'primary', 'secondary', 'grown']);
    expect(strongTie(k, 2026)).toBe(true);
    expect(strongTie(k, 2025)).toBe(false);
    expect(strongTie(partner, 2026)).toBe(true);
  });
  it('never for an imported person', () => {
    expect(() => newHousehold({ personId: 5, imported: true }, [])).toThrow(/imported/);
  });
});

describe('E8.3.2 time at home and satisfaction', () => {
  it('holding home hours at target keeps satisfaction steady at its level', () => {
    let h: Household = { ...family(), satisfaction: 100 / 1.2 };
    for (let w = 0; w < 104; w++) h = weekSatisfaction(h, { week: w, homeHours: w % 52 < 20 ? 14 : 30, inSeason: w % 52 < 20, livingApart: false }, DEFAULT_LIFE_REALISM).household;
    expect(h.satisfaction).toBeCloseTo(100 / 1.2, 6);
  });
  it('the season counts at half strength, and living apart caps the ratio at 0.5', () => {
    const h = { ...family(), satisfaction: 80 };
    const inS = weekSatisfaction(h, { week: 1, homeHours: 0, inSeason: true, livingApart: false }, DEFAULT_LIFE_REALISM).household.satisfaction;
    const outS = weekSatisfaction(h, { week: 1, homeHours: 0, inSeason: false, livingApart: false }, DEFAULT_LIFE_REALISM).household.satisfaction;
    expect(80 - inS).toBeCloseTo((80 - outS) / 2, 9);
    const apart = weekSatisfaction({ ...h, satisfaction: 50 }, { week: 1, homeHours: 60, inSeason: false, livingApart: true }, DEFAULT_LIFE_REALISM).household.satisfaction;
    expect(apart).toBeCloseTo(50 + 0.05 * (100 * 0.5 / 1.2 - 50), 9);
  });
  it('separation never occurs without two prior conversation events; the switch removes it', () => {
    let h = { ...family(), satisfaction: 10 };
    const notices: string[] = [];
    for (let w = 0; w < 52 * 6; w++) {
      const r = weekSatisfaction(h, { week: w, homeHours: 0, inSeason: false, livingApart: false }, DEFAULT_LIFE_REALISM);
      h = r.household;
      if (r.notice) notices.push(r.notice.kind);
    }
    expect(notices).toEqual(['conversation', 'conversation', 'separation']);
    let g = { ...family(), satisfaction: 10 };
    const off: string[] = [];
    for (let w = 0; w < 52 * 6; w++) {
      const r = weekSatisfaction(g, { week: w, homeHours: 0, inSeason: false, livingApart: false }, { ...DEFAULT_LIFE_REALISM, separation: false });
      g = r.household;
      if (r.notice) off.push(r.notice.kind);
    }
    expect(off).not.toContain('separation');
    expect(g.separated).toBe(false);
  });
  it('money: a two-tier drop costs 5 for a year; wealth adds nothing; the break gives +5 once a year', () => {
    const h = tierDrop({ ...family(), satisfaction: 100 / 1.2 }, 2, 0);
    const next = weekSatisfaction(h, { week: 1, homeHours: 30, inSeason: false, livingApart: false }, DEFAULT_LIFE_REALISM).household;
    expect(next.satisfaction).toBeLessThan(100 / 1.2);
    expect(tierDrop(family(), 1, 0).offsets).toEqual([]);
    const b = breakTogether(family(), 2027);
    expect(b.satisfaction).toBe(65);
    expect(breakTogether(b, 2027).satisfaction).toBe(65);
  });
});

describe('E8.3.3 life events', () => {
  it('every event traces to a household member and a table row; at least a third in season', () => {
    const h = newHousehold(s, [partner, kid(11, 2014), kid(12, 2017), { id: 13, role: 'parent', birthYear: 1945, occupation: 'none', tieRegion: null }]);
    let all = 0, inSeason = 0;
    for (let y = 2026; y < 2046; y++) {
      for (const e of generateYearEvents(h, cal(y), rng(y))) {
        all++;
        if (e.inSeason) inSeason++;
        expect(h.members.some((m) => m.id === e.memberId)).toBe(true);
      }
    }
    expect(all).toBeGreaterThan(50);
    expect(inSeason / all).toBeGreaterThanOrEqual(1 / 3 - 0.05);
  });
  it('deaths only for an ageing parent; no child or partner dies', () => {
    for (let y = 2026; y < 2060; y++) for (const e of generateYearEvents(family(), cal(y), rng(y))) expect(e.kind).not.toBe('parentDeath');
  });
  it('generation is deterministic for the same household, year and stream', () => {
    expect(generateYearEvents(family(), cal(2030), rng(9))).toEqual(generateYearEvents(family(), cal(2030), rng(9)));
  });
  it('attended +2 to +5, missed -3 to -8 by weight', () => {
    const e = { kind: 'school' as const, memberId: 11, week: 3, hours: 3, periodWeeks: 1, weight: 1, noticeDays: 5, inSeason: true };
    expect(eventSatisfactionChange(e, 'attend')).toBe(5);
    expect(eventSatisfactionChange(e, 'miss')).toBe(-8);
    expect(eventSatisfactionChange({ ...e, weight: 0 }, 'attend')).toBe(2);
    expect(resolveEvent(family(), e, 'miss').satisfaction).toBe(52);
  });
  it('births happen only when the user accepts the offer', () => {
    const r = acceptOffer(family(), 'haveChild', kid(14, 2027), rng(1));
    expect(r.household.members).toHaveLength(4);
    expect(r.blockedHours).toBeGreaterThanOrEqual(24);
    expect(r.blockedHours).toBeLessThanOrEqual(72);
  });
});

describe('E8.4.1 moving for a job', () => {
  const move = { year: 2026, week: 10, sameCity: false, toRegion: 'midwest' } as const;
  it('moving everyone: -6, -4 per strongly tied member, -5 for a third move in five years', () => {
    // partner place-tied and the 2010 child in the last two years of school in 2026
    expect(moveAllChange(family(), 2026, 'midwest')).toBe(-14);
    const twice = { ...family(), moveYears: [2023, 2025] };
    expect(moveAllChange(twice, 2026, 'midwest')).toBe(-19);
    expect(moveAllChange(family(), 2026, 'southeast')).toBe(-9);
  });
  it('each mode produces its stated effects and no others', () => {
    const all = relocate(family(), { ...move, mode: 'moveAll' });
    expect(all.record).toMatchObject({ livingApart: false, satisfactionChange: -14, partnerIncomeInterrupted: true });
    expect(all.household.moveYears).toEqual([2026]);
    const apart = relocate(family(), { ...move, mode: 'liveApart' });
    expect(apart.record).toMatchObject({ livingApart: true, satisfactionChange: 0, partnerIncomeInterrupted: false });
    expect(apart.household).toEqual(family());
    const later = relocate(family(), { ...move, mode: 'moveAtSchoolYearEnd' });
    expect(later.record.livingApart).toBe(true);
    expect(completeMove(later.household, { ...move, mode: 'moveAtSchoolYearEnd', year: 2028 }).record.satisfactionChange).toBe(-10);
    expect(relocate(family(), { ...move, mode: 'moveAll', sameCity: true }).record.satisfactionChange).toBe(0);
    expect(relocate(newHousehold(s, []), { ...move, mode: 'moveAll' }).record.moved).toEqual([]);
  });
  it('a coach 1,500 miles apart in season cannot log more home hours than travel allows', () => {
    expect(apartHomeCapHours(5, true)).toBe(0);
    expect(apartHomeCapHours(1, true)).toBe(6);
    expect(apartHomeCapHours(5, false)).toBe(26);
  });
});
