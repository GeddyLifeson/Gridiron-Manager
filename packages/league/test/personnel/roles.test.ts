import { describe, expect, it } from 'vitest';
import {
  CHARACTER_FLAGS, FLAG_TYPES, flagRule, labelsInForce, proposeLabels, seasonEnd, severityFor, tell, updateFlags, userFlag,
  type FlagEvidence, type LabelPlayer, type UnitRole,
} from '../../src/personnel/index.ts';
import { g, rng } from './helpers.ts';

const roles: UnitRole[] = [
  { id: 'CB_base', unit: 'defense', kind: 'base', slots: 2 },
  { id: 'nickel', unit: 'defense', kind: 'package', slots: 1 },
  { id: 'gunner', unit: 'special_teams', kind: 'base', slots: 2 },
];
const lp = (personId: number, age: number, grades: Record<string, number>, units: LabelPlayer['units'] = ['defense', 'special_teams'], projection: number | null = null): LabelPlayer =>
  ({ personId, age, units, roleGrades: Object.fromEntries(Object.entries(grades).map(([k, v]) => [k, g(v)])), projection: projection === null ? null : g(projection) });

describe('D6.3.1 role labels', () => {
  const players = [
    lp(1, 27, { CB_base: 70, gunner: 40 }),
    lp(2, 26, { CB_base: 66, gunner: 41 }),
    lp(3, 25, { CB_base: 60, nickel: 68, gunner: 44 }),
    lp(4, 22, { CB_base: 50, nickel: 50, gunner: 62 }, ['defense', 'special_teams'], 58),
    lp(5, 28, { CB_base: 52, nickel: 49, gunner: 60 }),
  ];
  const labels = proposeLabels(players, roles);
  const at = (id: number, unit: string) => labels.find((l) => l.personId === id && l.unit === unit)!.label.kind;
  it('every rostered player has exactly one label per unit he belongs to', () => {
    for (const p of players) for (const u of p.units) expect(labels.filter((l) => l.personId === p.personId && l.unit === u)).toHaveLength(1);
  });
  it('starter, situational starter, developmental, special teams only', () => {
    expect(at(1, 'defense')).toBe('starter');
    expect(at(3, 'defense')).toBe('situational_starter');
    expect(at(4, 'defense')).toBe('developmental');
    expect(at(5, 'defense')).toBe('special_teams_only');
  });
  it('a player can start on special teams and back up on defense', () => {
    expect(at(5, 'special_teams')).toBe('starter');
    expect(['backup', 'special_teams_only']).toContain(at(5, 'defense'));
  });
  it('a user override is kept until he clears it; telling the player marks it', () => {
    const over = [{ personId: 2, unit: 'defense' as const, label: { kind: 'backup' as const }, setBy: 'user' as const, toldToPlayer: false }];
    const inForce = labelsInForce(proposeLabels(players, roles), over);
    expect(inForce.find((l) => l.personId === 2 && l.unit === 'defense')!.label.kind).toBe('backup');
    expect(inForce.find((l) => l.personId === 2 && l.unit === 'defense')!.setBy).toBe('user');
    expect(labelsInForce(proposeLabels(players, roles), []).find((l) => l.personId === 2 && l.unit === 'defense')!.label.kind).toBe('starter');
    expect(tell(inForce[0]!).toldToPlayer).toBe(true);
  });
});

describe('D6.3.2 flags', () => {
  it('each flag type has a raise rule and a clear rule in config', () => {
    for (const t of FLAG_TYPES) {
      expect(flagRule(t).raise.measure).toBeTruthy();
      expect(['below_threshold', 'healthy_seasons', 'quiet_days']).toContain(flagRule(t).clear.rule);
    }
  });
  it('effort: 3 or more loafs per 100 snaps over 4 games raises the flag', () => {
    expect(severityFor('effort', 2.9)).toBe(0);
    expect(severityFor('effort', 3)).toBe(1);
    expect(severityFor('effort', 30)).toBe(3);
    const f = updateFlags(1, 9, false, [], [{ type: 'effort', value: 3.5, source: 'position coach', note: 'loafs on the back side' }], 10);
    expect(f).toHaveLength(1);
    const cleared = updateFlags(1, 9, false, f, [{ type: 'effort', value: 1, source: 'position coach', note: '' }], 40);
    expect(cleared[0]!.archived).toBe(true);
  });
  it('no character flag exists on any real person after a 20-year run', () => {
    const r = rng(42);
    let flags = [] as ReturnType<typeof updateFlags>;
    for (let year = 0; year < 20; year++) {
      for (let pid = 1; pid <= 40; pid++) {
        const ev: FlagEvidence[] = CHARACTER_FLAGS.map((type) => ({ type, value: r() * 4, source: 'security', note: 'observed' }));
        ev.push({ type: 'medical', value: r() * 4, source: 'trainer', note: 'strain', fromSimulation: r() < 0.5 });
        flags = updateFlags(1, pid, pid % 2 === 0, flags, ev, year * 365);
      }
      flags = seasonEnd(flags, () => (r() < 0.5 ? 2 : 0), year * 365 + 300);
    }
    expect(flags.some((f) => f.personId % 2 === 0 && CHARACTER_FLAGS.includes(f.type))).toBe(false);
    expect(flags.some((f) => f.personId % 2 === 1 && CHARACTER_FLAGS.includes(f.type))).toBe(true);
  });
  it('a real person\'s medical flag comes only from injuries inside the simulation', () => {
    expect(updateFlags(1, 2, true, [], [{ type: 'medical', value: 2, source: 'trainer', note: 'imported history' }], 1)).toHaveLength(0);
    expect(updateFlags(1, 2, true, [], [{ type: 'medical', value: 2, source: 'trainer', note: 'second hamstring strain in 10 months', fromSimulation: true }], 1)).toHaveLength(1);
  });
  it('a flag whose cause has passed drops a step per healthy season, then is archived', () => {
    const f = updateFlags(1, 3, false, [], [{ type: 'medical', value: 3, source: 'trainer', note: 'x' }], 1);
    expect(f[0]!.severity).toBe(2);
    const y1 = seasonEnd(f, () => 2, 400);
    expect(y1[0]!.severity).toBe(1);
    expect(seasonEnd(y1, () => 3, 800)[0]!.archived).toBe(true);
  });
  it('the user can add his own flag and passes leave it alone', () => {
    const mine = userFlag(1, 3, 'learning', 2, 5, 'slow on the install');
    expect(updateFlags(1, 3, false, [mine], [{ type: 'learning', value: 0, source: 'staff', note: '' }], 9)).toContainEqual(mine);
  });
});
