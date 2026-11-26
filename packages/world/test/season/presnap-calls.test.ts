// The defense's pre-snap checks and disguise on the tick engine (J5.5, G2.5.1): taken from the designer call of the
// coverage family and resolved against the offense's real formation.
import { describe, expect, it } from 'vitest';
import { NEUTRAL_ENVIRONMENT, type PlayCalls, type PlayInput } from '@gm/schema';
import { field } from '@gm/engine-core';
import { lang } from '@gm/football-lang';
import { resolveRuleSet } from '@gm/rules-data';
import { DEFENSE_ROLES, createStarterContentPort, tickParamTable } from '../../src/season/index.ts';

const params = tickParamTable();
const pro = resolveRuleSet('pro_2026');
const calls = (playContentId: string | null, coverageFamily: string): PlayCalls => ({
  snapping: { unit: 'offense', playContentId, contentHash: null, kind: 'quick_pass', personnelCode: '11', formationId: null, strength: null, motionId: null, protectionId: null, tags: [], runDirection: null, shotgun: true, tempo: 'huddle', players: [] },
  opposing: { unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null, coverageFamily, rushers: 4, boxCount: 6, players: [] },
} as unknown as PlayCalls);
const inputOf = (c: PlayCalls): PlayInput => ({
  calls: c, rules: pro, params, geometry: field.fieldGeometry(pro), environment: NEUTRAL_ENVIRONMENT,
  situation: { period: 1, attackDir: 1, ballX: 45, ballY: 26.65, offense: 0, down: 1, score: [0, 0] },
} as unknown as PlayInput);

describe('defense checks and disguise through the starter content port', () => {
  const port = createStarterContentPort();
  const compiler = lang.createFootballLang();
  it('cover 3 against an empty set carries the walk-out check: the Sam over number 2, a compiled zone on the passing side', () => {
    const d = port.setup(inputOf(calls('quick_empty_stick', 'cover3')))!.presnap.defense;
    expect(d.checks.map((c) => c.name)).toEqual(['empty_walk_out']);
    const c = d.checks[0]!;
    expect(c.trigger).toBe('empty');
    expect(c.patch!.map((x) => DEFENSE_ROLES[x.teamSlot])).toEqual(['SAM']);
    const a = c.patch![0]!.assignment;
    expect(a.role).toBe('SAM');
    expect(a.behavior.type).toBe('zoneDrop');
    expect(a.behavior.path.length + a.rules.length).toBeGreaterThan(0);
    expect(compiler.compile(a).findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(Math.abs(a.preSnap.align.py)).toBeGreaterThan(4);
    expect(c.patch![0]!.perception?.keys?.length).toBeGreaterThan(0);
  });
  it('cover 1 shows two high and stems (the designer robber disguise); against trips the robber checks to number 3', () => {
    const d = port.setup(inputOf(calls('quick_stick', 'cover1')))!.presnap.defense;
    expect(d.disguise.map((x) => DEFENSE_ROLES[x.teamSlot]).sort()).toEqual(['FS', 'SS']);
    for (const x of d.disguise) expect(x.shown.px).toBeGreaterThanOrEqual(10);
    expect(d.checks.map((c) => [c.name, c.trigger])).toEqual([['trips_robber_on_3', 'formation']]);
    const a = d.checks[0]!.patch![0]!.assignment;
    expect([a.role, a.behavior.type]).toEqual(['SS', 'manCover']);
    // Bound to a man: the selector became an offensive slot.
    expect(String(a.behavior.params['man'])).toMatch(/^slot:\d+$/);
    const plain = port.setup(inputOf(calls('dropback_four_verticals', 'cover1')))!.presnap.defense;
    expect(plain.checks).toEqual([]);
  });
  it('a family no designer call covers gets neither, and the same play gives the same objects (cached)', () => {
    const d = port.setup(inputOf(calls('quick_empty_stick', 'cover2')))!.presnap.defense;
    expect(d.checks).toEqual([]);
    expect(d.disguise).toEqual([]);
    const a = port.setup(inputOf(calls('quick_empty_stick', 'cover3')))!.presnap.defense.checks;
    const b = port.setup(inputOf(calls('quick_empty_stick', 'cover3')))!.presnap.defense.checks;
    expect(a).toBe(b);
  });
});
