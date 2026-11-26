// The user's depth chart in the seat's game: engine units from the chart's units, the starters by job order,
// injured or inactive players skipped, a personnel package for the offense, the placeholder eleven where the
// chart has no unit, and a refusal when a unit cannot field eleven.
import { describe, it, expect } from 'vitest';
import { season as seasons } from '@gm/world';
import { engineUnits, seatTeamFromDepth } from '../../src/play/index.ts';
import { DEFS, input } from '../read-models/depth-chart/fixture.ts';

const base = seasons.placeholderTeam(0, 50);

describe('seat team from the depth chart', () => {
  it('maps the chart units to the engine units', () => {
    expect(engineUnits(DEFS)).toEqual({ offense: 'off:11', defense: 'def:base', kick: 'st:kickoff', return: null });
  });

  it('fields the chart starters, skips players ruled out, and keeps the placeholder return unit', () => {
    const d = input();
    const t = seatTeamFromDepth(base, d);
    expect(t.team.depth['offense']).toEqual([1, 10, 20, 21, 22, 30, 40, 41, 42, 43, 44]);
    expect(t.team.depth['defense']).toEqual([50, 51, 52, 53, 60, 61, 62, 70, 71, 72, 73]);
    expect(t.team.depth['kick']).toEqual([90, 63, 66, 76, 77, 24, 67, 78, 79, 12, 32]);
    expect(t.team.depth['return']).toEqual(base.depth['return']);
    expect(t.team.depth['QB']).toEqual([1, 2]); // the role-label map the engine reads (simDepthFor)
    const ids = new Set(t.team.players.map((p) => p.playerId));
    for (const u of ['offense', 'defense', 'kick', 'return']) for (const id of t.team.depth[u]!) expect(ids.has(id)).toBe(true);
    expect(t.team.players.find((p) => p.playerId === 1)!.position).toBe('qb');
    expect(t.lineup('offense', '11').map((p) => p.playerId)).toEqual(t.team.depth['offense']);
    // 12 personnel: the off:12 package, F from its own list, the rest inherited from 11 personnel.
    expect(t.lineup('offense', '12').map((p) => p.playerId)).toEqual([1, 10, 20, 21, 31, 30, 40, 41, 42, 43, 44]);
    // The starting quarterback ruled out: the backup plays.
    const hurt = seatTeamFromDepth(base, { ...d, people: d.people.map((p) => (p.personId === 1 ? { ...p, out: true } : p)) });
    expect(hurt.team.depth['offense']![0]).toBe(2);
    expect(hurt.team.players.some((p) => p.playerId === 1 && hurt.team.depth['offense']!.includes(1))).toBe(false);
  });

  it('refuses a unit that cannot field eleven', () => {
    const d = input();
    expect(() => seatTeamFromDepth(base, { ...d, actives: [1, 10, 20] })).toThrow(/off:11 fields 3 of 11/);
  });
});
