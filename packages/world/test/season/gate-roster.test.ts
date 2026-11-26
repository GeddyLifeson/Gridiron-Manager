import { describe, expect, it } from 'vitest';
import { createRealGameCore } from '../../src/season/real-game.ts';

const levelOf = (t: { players: readonly { attributes: Readonly<Record<string, number>> }[] }): number => Object.values(t.players[0]!.attributes)[0]!;

describe('gate roster level (D13.4.1 census)', () => {
  it('the gate plays equal teams at 50 by default, for both levels', () => {
    for (const id of ['pro_2026', 'college_2026']) {
      const inp = createRealGameCore(id, { resolver: 'reference' }).input(3, '00000000000000aa');
      expect(inp.teams.map(levelOf)).toEqual([50, 50]);
    }
  });
  it('the college census plays each team at its own level, drawn the same way every time', () => {
    const g = createRealGameCore('college_2026', { resolver: 'reference', census: true });
    const levels = Array.from({ length: 40 }, (_, i) => g.input(i, '00000000000000aa').teams.map(levelOf)).flat();
    expect(levels.some((v, i) => i % 2 === 1 && v !== levels[i - 1])).toBe(true);
    const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
    expect(Math.abs(mean - 25)).toBeLessThan(1);
    expect(createRealGameCore('college_2026', { resolver: 'reference', census: true }).input(7, '00000000000000aa').teams.map(levelOf))
      .toEqual(g.input(7, '00000000000000aa').teams.map(levelOf));
  });
  it('an explicit level replaces the census and plays equal teams unless a spread is given', () => {
    const g = createRealGameCore('college_2026', { resolver: 'reference', iss: 40 });
    expect(g.input(0, '00000000000000aa').teams.map(levelOf)).toEqual([40, 40]);
  });
});
