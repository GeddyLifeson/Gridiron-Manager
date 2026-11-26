// The starter content port and the real game on the tick resolver (WP-23 owed item: real content port).
import { describe, expect, it } from 'vitest';
import { SLOT_COUNT, SLOTS_PER_TEAM, type PlayCalls, type PlayInput } from '@gm/schema';
import { legality } from '@gm/football-lang';
import { field } from '@gm/engine-core';
import { resolveRuleSet } from '@gm/rules-data';
import {
  DEFENSE_ROLES, OFFENSE_ROLES, UNIT_JERSEYS, createRealGameCore, createStarterContentPort, tickParamTable,
} from '../../src/season/index.ts';

const params = tickParamTable();
const pro = resolveRuleSet('pro_2026');

function offenseCalls(kind: string, runDirection: 'left' | 'right' | 'middle' | null, coverageFamily = 'cover3'): PlayCalls {
  return {
    snapping: { unit: 'offense', playContentId: null, contentHash: null, kind, personnelCode: '11', formationId: null, strength: null, motionId: null, protectionId: null, tags: [], runDirection, shotgun: true, tempo: 'huddle', players: [] },
    opposing: { unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null, coverageFamily, rushers: 4, boxCount: 7, players: [] },
  } as unknown as PlayCalls;
}
const inputOf = (calls: PlayCalls, rules = pro): PlayInput => ({
  calls, rules, params, geometry: field.fieldGeometry(rules),
  situation: { period: 1, attackDir: 1, ballX: 45, ballY: 26.65, offense: 0 },
} as unknown as PlayInput);

describe('starter content port', () => {
  const port = createStarterContentPort();
  it('gives every chart kind a play with eleven a side in the fixed role order', () => {
    for (const kind of ['run', 'dropback_pass', 'quick_pass', 'play_action', 'screen', 'rpo', 'kneel']) {
      const s = port.setup(inputOf(offenseCalls(kind, kind === 'run' ? 'left' : null)))!;
      expect(s, kind).not.toBeNull();
      expect(s.slots).toHaveLength(SLOT_COUNT);
      expect(s.perception).toHaveLength(SLOT_COUNT);
      expect(s.presnap.offense.assignments.map((a) => a.role).slice(0, 10)).toEqual(OFFENSE_ROLES.slice(0, 10));
      expect(s.presnap.defense.assignments.map((a) => a.role)).toEqual([...DEFENSE_ROLES]);
    }
  });
  it('hands the same assignment objects back for the same call (the resolver caches compiled forms by object)', () => {
    const a = port.setup(inputOf(offenseCalls('dropback_pass', null)))!, b = port.setup(inputOf(offenseCalls('dropback_pass', null)))!;
    expect(a.presnap.offense.assignments[7]).toBe(b.presnap.offense.assignments[7]);
  });
  it('mirrors a run to the left and hands off at the back\'s mesh point', () => {
    const r = port.setup(inputOf(offenseCalls('run', 'right')))!, l = port.setup(inputOf(offenseCalls('run', 'left')))!;
    const back = OFFENSE_ROLES.indexOf('R');
    expect(l.presnap.offense.assignments[back]!.preSnap.align.py).toBe(-r.presnap.offense.assignments[back]!.preSnap.align.py || 0);
    expect(r.qb!.kind).toBe('handoff');
    expect(r.qb!.handoff!.meet).not.toBeNull();
    expect(r.carrier!.designed!.slot).toBe(back);
  });
  it('lines up legally under pro rules with the placeholder jerseys', () => {
    for (const kind of ['run', 'dropback_pass', 'quick_pass', 'play_action', 'screen', 'rpo', 'kneel']) {
      const O = port.setup(inputOf(offenseCalls(kind, 'right')))!.presnap.offense.assignments;
      const players = O.map((a, i) => ({ role: a.role, px: a.preSnap.align.px, py: a.preSnap.align.py, onLine: a.preSnap.onLine, jersey: UNIT_JERSEYS.offense[i]!, inMotion: false }));
      expect(legality.checkAlignment(players, pro, params).filter((f) => f.ruleKey !== null), kind).toEqual([]);
    }
  });
  it('sets no offensive player inside the neither band except the quarterback', () => {
    const clearlyOff = params.num('legality.line.clearlyOffYd');
    for (const kind of ['run', 'dropback_pass', 'quick_pass', 'play_action', 'screen']) {
      for (const a of port.setup(inputOf(offenseCalls(kind, 'right')))!.presnap.offense.assignments) {
        if (a.preSnap.onLine || a.behavior.type === 'quarterback') continue;
        expect(-a.preSnap.align.px, `${kind} ${a.role}`).toBeGreaterThan(clearlyOff);
      }
    }
  });
  it('builds kicking units from the rule set: dynamic kickoff lines for pro, traditional for college', () => {
    const kick = (k: string) => ({ snapping: { unit: 'kick', kickKind: k, callContentId: null, contentHash: null, direction: null, players: [] }, opposing: { unit: 'return', returnKind: 'kick_return', callContentId: null, contentHash: null, players: [] } }) as unknown as PlayCalls;
    const proKo = port.setup({ ...inputOf(kick('kickoff')), situation: { period: 1, attackDir: 1, ballX: 45, ballY: 26.65, offense: 0 } } as unknown as PlayInput)!;
    const own = 45 - field.fieldGeometry(pro).goalLineWestX;
    expect(proKo.presnap.offense.assignments[0]!.preSnap.align.px).toBeCloseTo(100 - own - pro.num('kickoff.kicking_team_line_yardline'));
    const college = resolveRuleSet('college_2026');
    const colKo = port.setup(inputOf(kick('kickoff'), college))!;
    expect(colKo.presnap.offense.assignments[0]!.preSnap.align.px).toBe(-1);
    for (const k of ['punt', 'field_goal', 'try_kick', 'onside_kick', 'safety_kick', 'fair_catch_kick']) {
      const s = port.setup(inputOf(kick(k)))!;
      expect(s.presnap.offense.assignments, k).toHaveLength(SLOTS_PER_TEAM);
      expect(s.presnap.defense.assignments, k).toHaveLength(SLOTS_PER_TEAM);
    }
  });
});

describe('real game on the tick resolver', () => {
  it('is the default and runs on all three real modules with no stand-ins', () => {
    const g = createRealGameCore('pro_2026');
    expect(g.resolverId).toBe('tick');
    const r = g.deps(g.input(0, '00000000000000aa')).resolver;
    expect(r.id).toBe('tick');
    expect(r.mayProduceSavedResults).toBe(true);
  });
  it('plays a pro game end to end, the same twice from the same seed', () => {
    const g = createRealGameCore('pro_2026');
    const a = g.simulate(g.input(0, '00000000000000aa'));
    const b = createRealGameCore('pro_2026').simulate(g.input(0, '00000000000000aa'));
    expect(a.records.length).toBeGreaterThan(100);
    expect(a.records.every((rec) => rec.truth.resolverId === 'tick')).toBe(true);
    expect(b.records[b.records.length - 1]!.stateHash).toBe(a.records[a.records.length - 1]!.stateHash);
    expect(b.final.score).toEqual(a.final.score);
  });
  it('still runs the reference resolver when asked', () => {
    const g = createRealGameCore('pro_2026', { resolver: 'reference' });
    expect(g.deps(g.input(0, '00000000000000aa')).resolver.id).not.toBe('tick');
  });
});
