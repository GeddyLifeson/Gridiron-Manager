// The starter content port and the real game on the tick resolver (WP-23 owed item: real content port).
import { describe, expect, it } from 'vitest';
import { NEUTRAL_ENVIRONMENT, SLOT_COUNT, SLOTS_PER_TEAM, type Environment, type PlayCalls, type PlayInput } from '@gm/schema';
import { legality } from '@gm/football-lang';
import { field } from '@gm/engine-core';
import { resolveRuleSet } from '@gm/rules-data';
import {
  DEFENSE_ROLES, OFFENSE_ROLES, UNIT_JERSEYS, createRealGameCore, createStarterContentPort, tickParamTable,
} from '../../src/season/index.ts';
import { READ_STEP_S } from '../../src/season/tick-content.ts';

const params = tickParamTable();
const pro = resolveRuleSet('pro_2026');

function offenseCalls(kind: string, runDirection: 'left' | 'right' | 'middle' | null, coverageFamily = 'cover3'): PlayCalls {
  return {
    snapping: { unit: 'offense', playContentId: null, contentHash: null, kind, personnelCode: '11', formationId: null, strength: null, motionId: null, protectionId: null, tags: [], runDirection, shotgun: true, tempo: 'huddle', players: [] },
    opposing: { unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null, coverageFamily, rushers: 4, boxCount: 7, players: [] },
  } as unknown as PlayCalls;
}
const inputOf = (calls: PlayCalls, rules = pro, o: { environment?: Environment; offense?: 0 | 1; down?: number | null } = {}): PlayInput => ({
  calls, rules, params, geometry: field.fieldGeometry(rules), environment: o.environment ?? NEUTRAL_ENVIRONMENT,
  situation: { period: 1, attackDir: 1, ballX: 45, ballY: 26.65, offense: o.offense ?? 0, down: o.down === undefined ? 1 : o.down, score: [0, 0] },
} as unknown as PlayInput);

describe('starter content port', () => {
  const port = createStarterContentPort();
  it('carries the crowd into the play (J12.6.1): the visiting offense on third down hears it, goes silent, and is on the road', () => {
    const loud = { ...NEUTRAL_ENVIRONMENT, noiseBase: 0.9 };
    const road = port.setup(inputOf(offenseCalls('dropback_pass', null), pro, { environment: loud, offense: 1, down: 3 }))!;
    expect(road.presnap.venue).toBe('road');
    expect(road.presnap.offense.noise).toBeCloseTo(0.9, 12);
    expect(road.presnap.defense.noise).toBeLessThan(road.presnap.offense.noise);
    expect(road.presnap.silentCount).toBe(true);
    expect(road.context.noise).toEqual([road.presnap.offense.noise, road.presnap.defense.noise]);
    expect(road.context.familiarityZ![1]).toBeGreaterThan(0);
    const home = port.setup(inputOf(offenseCalls('dropback_pass', null), pro, { environment: loud, offense: 0, down: 3 }))!;
    expect(home.presnap.venue).toBe('home');
    expect(home.presnap.silentCount).toBe(false);
    const neutral = createStarterContentPort({ site: 'neutral' }).setup(inputOf(offenseCalls('dropback_pass', null), pro, { environment: loud, offense: 1, down: 3 }))!;
    expect(neutral.presnap.venue).toBe('neutral');
    const quiet = port.setup(inputOf(offenseCalls('dropback_pass', null), pro, { offense: 1, down: 3 }))!;
    expect([quiet.presnap.offense.noise, quiet.presnap.defense.noise]).toEqual([0, 0]);
  });
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
  it('gives every defender a key to read run or pass from: a box man a lineman then the quarterback, the rest the quarterback', () => {
    const s = port.setup(inputOf(offenseCalls('dropback_pass', null)))!;
    const qb = OFFENSE_ROLES.indexOf('Q');
    s.presnap.defense.assignments.forEach((a, i) => {
      const p = s.perception[SLOTS_PER_TEAM + i]!, keys = (p.keys ?? []).filter((k) => k >= 0);
      expect(p.readsKeys, a.role).toBe(true);
      expect(keys.length, a.role).toBeGreaterThan(0);
      for (const k of keys) expect(k, a.role).toBeLessThan(SLOTS_PER_TEAM);
      if (a.keys.length === 0) expect(keys[keys.length - 1], a.role).toBe(qb);
      if (a.keys.length === 0 && keys.length === 2) expect(keys[0], a.role).toBeLessThan(5);
    });
  });
  it('starts zone defenders and route runners with their eyes on the ball, and nobody else', () => {
    const s = port.setup(inputOf(offenseCalls('dropback_pass', null)))!;
    s.presnap.offense.assignments.forEach((a, i) => expect(s.perception[i]!.gaze, a.role).toBe(a.behavior.type === 'route' ? 'ball' : undefined));
    s.presnap.defense.assignments.forEach((a, i) => expect(s.perception[SLOTS_PER_TEAM + i]!.gaze, a.role).toBe(a.behavior.type === 'zoneDrop' || a.behavior.type === 'deepZone' ? 'ball' : undefined));
  });
  it('binds roles to slots, so a man or a key named by role resolves to a player', () => {
    for (const kind of ['run', 'dropback_pass', 'quick_pass', 'play_action', 'screen']) {
      const s = port.setup(inputOf(offenseCalls(kind, kind === 'run' ? 'right' : null, 'cover1')))!;
      for (const a of [...s.presnap.offense.assignments, ...s.presnap.defense.assignments]) {
        expect(JSON.stringify([a.keys, a.behavior.params]), `${kind} ${a.role}`).not.toMatch(/role:/);
      }
    }
  });
  it('orders the quarterback\'s reads: the receiver his keys name first, then from the shortest route to the deepest', () => {
    for (const kind of ['dropback_pass', 'quick_pass']) {
      const s = port.setup(inputOf(offenseCalls(kind, null)))!;
      const reads = s.qb!.reads.filter((r) => r.kind === 'receiver');
      expect(reads.length, kind).toBeGreaterThanOrEqual(3);
      const depth = reads.map((r) => Math.max(...r.target.route.map((p) => p.px)));
      const named = s.presnap.offense.assignments[OFFENSE_ROLES.indexOf('Q')]!.keys.some((k) => k === `slot:${reads[0]!.target.slot}`);
      const rest = named ? depth.slice(1) : depth;
      expect(rest, kind).toEqual([...rest].sort((a, b) => a - b));
      // Each read is valued a little less than the one before it.
      for (let i = 1; i < reads.length; i++) expect(reads[i]!.priorValue, kind).toBeLessThan(reads[i - 1]!.priorValue);
    }
  });
  it('gives a zone defender with no drawn path somewhere to drop, and holds an underneath man for the read step unless he reads pass', () => {
    const s = port.setup(inputOf(offenseCalls('dropback_pass', null)))!;
    for (const a of s.presnap.defense.assignments) {
      if (a.behavior.type === 'deepZone') expect(a.behavior.path.length, a.role).toBeGreaterThan(0);
      if (a.behavior.type !== 'zoneDrop') continue;
      const drop = a.rules.find((r) => r.then.some((t) => t.name === 'dropTo'));
      expect(drop, a.role).toBeDefined();
      expect(JSON.stringify(drop!.when), a.role).toContain(`"s":${READ_STEP_S}`);
      expect(JSON.stringify(drop!.guard), a.role).toContain('"kind":"run"');
    }
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
    const proKo = port.setup({ ...inputOf(kick('kickoff')), situation: { period: 1, attackDir: 1, ballX: 45, ballY: 26.65, offense: 0, down: null, score: [0, 0] } } as unknown as PlayInput)!;
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
  it('plays a game the same whatever the runner played before it (J13.3.2)', () => {
    const used = createRealGameCore('college_2026');
    used.simulate(used.input(0, '00000000000000c1'));
    const after = used.simulate(used.input(1, '00000000000000c2'));
    const fresh = createRealGameCore('college_2026');
    const alone = fresh.simulate(fresh.input(1, '00000000000000c2'));
    expect(after.records[after.records.length - 1]!.stateHash).toBe(alone.records[alone.records.length - 1]!.stateHash);
    expect(JSON.stringify(after.events)).toBe(JSON.stringify(alone.events));
  }, 60_000);
  it('still runs the reference resolver when asked', () => {
    const g = createRealGameCore('pro_2026', { resolver: 'reference' });
    expect(g.deps(g.input(0, '00000000000000aa')).resolver.id).not.toBe('tick');
  });
});
