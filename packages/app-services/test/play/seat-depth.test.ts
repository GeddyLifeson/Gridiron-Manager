// The user's depth chart in the seat's game: chart units for each call (personnel packages, defensive
// packages by trigger, punt, field goal and kickoff units), the starters placed in the engine's slot order,
// injured or inactive players skipped, each person's own ratings when a source is given, the placeholder
// eleven where the chart has no unit, and a refusal when a unit cannot field eleven.
import { describe, it, expect } from 'vitest';
import type { depth } from '@gm/league';
import { ATTRIBUTE_IDS } from '@gm/schema';
import { season as seasons } from '@gm/world';
import { engineUnits, seatTeamFromDepth, simPlayerFromPerson } from '../../src/play/index.ts';
import { DEFS, chart, input } from '../read-models/depth-chart/fixture.ts';

const base = seasons.placeholderTeam(0, 50);
const j = (job: string, group: depth.PositionGroup): depth.JobDef => ({ job, group });
const FG: depth.UnitDef = { unitId: 'st:field_goal', core: true, load: 'kicking', jobs: [j('LS', 'ls'), j('LG', 'ol'), j('RG', 'ol'), j('LT', 'ol'), j('RT', 'ol'), j('LE', 'te'), j('RE', 'te'), j('LW', 'ol'), j('RW', 'ol'), j('H', 'p'), j('K', 'k')] };
const withFg = () => {
  const d = input({ defs: [...DEFS, FG] });
  const c = chart();
  return { ...d, chart: { ...c, units: { ...c.units, 'st:field_goal': { LS: [92], LG: [41], RG: [43], LT: [40], RT: [44], LE: [30], RE: [31], LW: [45], RW: [46], H: [91], K: [90] } } } };
};

describe('seat team from the depth chart', () => {
  it('maps the chart units to the engine units and kinds', () => {
    const u = engineUnits([...DEFS, FG]);
    expect(u.base).toEqual({ offense: 'off:11', defense: 'def:base', kick: 'st:kickoff', return: null });
    expect(u.kinds).toMatchObject({ punt: 'st:punt', field_goal: 'st:field_goal', try_kick: 'st:field_goal', kickoff: 'st:kickoff', onside_kick: 'st:kickoff' });
    expect(Object.keys(u.kinds).some((k) => k.includes('return') || k.includes('block'))).toBe(false);
    expect(u.offense).toEqual({ '11': 'off:11', '12': 'off:12' });
    expect(u.defense).toEqual({ '11': 'def:nickel', '10': 'def:nickel' });
  });

  it('places the chart starters in the engine slot order for every call', () => {
    const t = seatTeamFromDepth(base, withFg());
    // LT LG C RG RT Q R X Z Y H
    expect(t.team.depth['offense']).toEqual([40, 41, 42, 43, 44, 1, 10, 20, 21, 30, 22]);
    // 12 personnel: F (maps to SLOT) from its own list at H.
    expect(t.lineup('offense', '12').map((p) => p.playerId)).toEqual([40, 41, 42, 43, 44, 1, 10, 20, 21, 30, 31]);
    // LDE LDT RDT RDE MIKE WILL SAM LCB RCB SS FS
    expect(t.team.depth['defense']).toEqual([50, 51, 52, 53, 61, 62, 60, 70, 71, 73, 72]);
    // Against 11 personnel the nickel: NB (maps to SAM) at SAM.
    expect(t.lineup('defense', '11').map((p) => p.playerId)).toEqual([50, 51, 52, 53, 61, 62, 74, 70, 71, 73, 72]);
    expect(t.lineup('defense', '22').map((p) => p.playerId)).toEqual(t.team.depth['defense']);
    // LS LG RG LT RT LE RE LW RW H K: punt (PP protector at H, punter at K) and field goal (holder at H, kicker at K).
    expect(t.lineup('kick', null, 'punt').map((p) => p.playerId)).toEqual([92, 45, 46, 31, 32, 76, 23, 64, 65, 63, 91]);
    expect(t.lineup('kick', null, 'field_goal').map((p) => p.playerId)).toEqual([92, 41, 43, 40, 44, 30, 31, 45, 46, 91, 90]);
    expect(t.lineup('kick', null, 'try_kick').map((p) => p.playerId)).toEqual(t.lineup('kick', null, 'field_goal').map((p) => p.playerId));
    const kickoff = t.lineup('kick', null, 'kickoff').map((p) => p.playerId);
    expect(kickoff.at(-1)).toBe(90);
    expect([...kickoff].sort((a, b) => a - b)).toEqual([12, 24, 32, 63, 66, 67, 76, 77, 78, 79, 90]);
    expect(t.lineup('kick', null, null).map((p) => p.playerId)).toEqual(kickoff);
    // No return unit in this chart: the placeholder eleven.
    expect(t.lineup('return', null, 'punt_return').map((p) => p.playerId)).toEqual(base.depth['return']);
    expect(t.team.depth['kick:punt']).toEqual(t.lineup('kick', null, 'punt').map((p) => p.playerId));
    const ids = new Set(t.team.players.map((p) => p.playerId));
    for (const list of Object.values(t.team.depth)) for (const id of list) expect(ids.has(id)).toBe(true);
  });

  it('skips players ruled out', () => {
    const d = input();
    const hurt = seatTeamFromDepth(base, { ...d, people: d.people.map((p) => (p.personId === 1 ? { ...p, out: true } : p)) });
    expect(hurt.team.depth['offense']![5]).toBe(2);
  });

  it('plays each person with his own ratings when a source is given, the placeholder values otherwise', () => {
    const d = input();
    const own = (id: number) => ({ ...base.players[0]!, playerId: id, attributes: Object.fromEntries(ATTRIBUTE_IDS.map((a) => [a, id === 1 ? 77 : 41])) });
    const t = seatTeamFromDepth(base, { ...d, playerOf: own });
    expect(t.team.players.find((p) => p.playerId === 1)!.attributes[ATTRIBUTE_IDS[0]!]).toBe(77);
    expect(t.team.players.find((p) => p.playerId === 40)!.attributes[ATTRIBUTE_IDS[0]!]).toBe(41);
    const plain = seatTeamFromDepth(base, d);
    expect(plain.team.players.find((p) => p.playerId === 1)!.attributes[ATTRIBUTE_IDS[0]!]).toBe(50);
  });

  it('reads a world person: attributes, size, age on the season, long-term load', () => {
    const p = {
      id: 5, birthDate: { seasonYear: 2001 },
      playing: { position: 'QB', lastJersey: 12, heightIn: 75, weightLb: 221, attributes: { [ATTRIBUTE_IDS[0]!]: 63 }, tests: base.players[0]!.tests, freshnessLongTerm: 0.9, conditioning: 70 },
    } as never;
    const s = simPlayerFromPerson(p, 2026)!;
    expect(s).toMatchObject({ playerId: 5, position: 'QB', jersey: 12, heightIn: 75, weightLb: 221, ageYears: 25 });
    expect(s.attributes[ATTRIBUTE_IDS[0]!]).toBe(63);
    expect(s.attributes[ATTRIBUTE_IDS[1]!]).toBe(0);
    expect(s.gameDay).toMatchObject({ freshness: 1, freshnessLongTerm: 0.9, conditioning: 70 });
    expect(simPlayerFromPerson({ id: 6, birthDate: { seasonYear: 2001 }, playing: null } as never, 2026)).toBeNull();
  });

  it('refuses a unit that cannot field eleven', () => {
    expect(() => seatTeamFromDepth(base, { ...input(), actives: [1, 10, 20] })).toThrow(/fields 3 of 11/);
  });
});
