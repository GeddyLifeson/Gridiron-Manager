// The merged tick-path parameter table (integrator-owned): one row per name across the game modules and the
// tick path, and the rows each tick module's recent requests added are present.
import { describe, expect, it } from 'vitest';
import { ALL_ENGINE_PARAM_FILES, ENGINE_PARAM_FILES, TICK_PARAM_FILES, tickParamTable } from '../../src/real-game/index.ts';

describe('merged tick-path parameter table', () => {
  it('holds every game and tick file with no name defined twice', () => {
    expect(ALL_ENGINE_PARAM_FILES).toHaveLength(ENGINE_PARAM_FILES.length + TICK_PARAM_FILES.length);
    const t = tickParamTable();
    let rows = 0;
    for (const f of ALL_ENGINE_PARAM_FILES) for (const p of f.params) { rows++; expect(t.num(p.name)).toBe(p.value); }
    expect(new Set(ALL_ENGINE_PARAM_FILES.flatMap((f) => f.params.map((p) => p.name))).size).toBe(rows);
  });
  it('carries the carrier, fouls-and-injuries, kick-look and quarterback rows', () => {
    const t = tickParamTable();
    for (const name of ['tickResolver.kickLook.check.reppedChance', 'tickResolver.kickLook.check.installedChance', 'tickResolver.kickLook.check.perZ']) expect(t.has(name), name).toBe(true);
    const modules = TICK_PARAM_FILES.map((f) => f.module).join(' ');
    for (const m of ['carrier', 'qb', 'player']) expect(modules).toMatch(new RegExp(m, 'i'));
    expect(TICK_PARAM_FILES.some((f) => /foul|injur/i.test(f.module))).toBe(true);
  });
  it('takes overrides by name and refuses an unknown one', () => {
    expect(tickParamTable({ 'tickResolver.kickLook.check.perZ': 0.5 }).num('tickResolver.kickLook.check.perZ')).toBe(0.5);
    expect(() => tickParamTable({ 'no.such.param': 1 })).toThrow(/unknown parameter/);
  });
});
