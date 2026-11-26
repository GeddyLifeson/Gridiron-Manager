import { describe, expect, it } from 'vitest';
import { classGrid, countedPlayers, declarationCheck, eligibilityDepartures, type PlanPlayer } from '../../src/college/index.ts';
import { RULES, day, rec, season } from './helpers.ts';

const player = (id: number, over: Partial<PlanPlayer> = {}): PlanPlayer => ({ personId: id, position: 'WR', record: rec({ personId: id }), countExempt: false, medicallyRetired: false, ...over });

describe('the count on the declaration date (T5.1.1, T5.1.2 acceptance)', () => {
  it('under the 2026 values a roster with 106 non-exempt players is refused; 105 is accepted', () => {
    const r106 = Array.from({ length: 106 }, (_, i) => player(i + 1));
    expect(declarationCheck(r106, RULES, true)).toEqual({ ok: false, counted: 106, over: 1 });
    expect(declarationCheck(r106.slice(0, 105), RULES, true)).toEqual({ ok: true, counted: 105 });
  });
  it('exempt players and medically retired players (where the switch says so) do not count', () => {
    const list = [...Array.from({ length: 105 }, (_, i) => player(i + 1)), player(200, { countExempt: true }), player(201, { medicallyRetired: true })];
    expect(declarationCheck(list, RULES, true).ok).toBe(true);
    expect(declarationCheck(list, RULES, false).ok).toBe(false);
    expect(countedPlayers(list, true)).toHaveLength(105);
  });
});

describe('the class grid (T8.4.1)', () => {
  it('groups players by position and expected last season, and lists who runs out this year', () => {
    const born = day(2004, 3, 1);
    const players = [
      player(1, { record: rec({ personId: 1, birthDay: born, firstEnrollYear: 2022, seasons: [2022, 2023, 2024].map((y) => season(y, 12)) }) }),
      player(2, { record: rec({ personId: 2, birthDay: day(2007, 3, 1), firstEnrollYear: 2026 }) }),
      player(3, { position: 'QB', record: rec({ personId: 3, birthDay: day(2007, 3, 1), firstEnrollYear: 2026 }) }),
    ];
    const grid = classGrid(players, 2026, RULES);
    expect(grid).toEqual([
      { position: 'QB', lastSeason: 2030, count: 1 },
      { position: 'WR', lastSeason: 2026, count: 1 },
      { position: 'WR', lastSeason: 2030, count: 1 },
    ]);
    expect(eligibilityDepartures(players, 2026, RULES)).toEqual([1]);
  });
});
