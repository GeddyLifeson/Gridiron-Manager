// G-92 player designer (D13.1): entry points, plausibility and sandbox, career gate, real-person locks,
// and the acceptance check that designed players pass the same drift guards as generated ones.
import { describe, expect, it } from 'vitest';
import { DMATH, stream, seedFromNumber, streamSource } from '@gm/engine-core';
import { resolver } from '@gm/resolver-reference';
import {
  ATTRIBUTE_IDS, NEUTRAL_ENVIRONMENT, PersonRecord, PlayTruth, playTruthProblems, simPlayerProblems,
  type FieldGeometry, type FieldedPlayer, type PlayInput, type RuleSet, type SimPlayer, type SimTeam,
} from '@gm/schema';
import {
  ARCHETYPES, archetypesFor, blankSheet, commitSheet, designerAccess, designerWarnings, derivedPhysical, fromArchetype, fromMeasurables,
  inSharedRankings, mayEnterCertifiedCareer, missingFields, sheetFromRecord, staffGrade, primaryAttributes,
  type DesignedPlayer, type DesignerWorld, type Sheet, type StartRequest,
} from '../../src/designer/index.ts';
import {
  MAIN_POSITIONS, PROFILE_VARS, neutralTraitBlock, bodyDriftAlarms, classStats, generatePlayer, plausibilityWarnings, proProfile, profileOf, validateClass,
} from '../../src/generator/index.ts';
import { req as genReq, rng } from '../generator/helpers.ts';

const R = rng();
const NONE: DesignerWorld = { kind: 'none' };
const ON = { seasonYear: 2030, dayIndex: 200 };

function start(position: string, slot: number, over: Partial<StartRequest> = {}): StartRequest {
  return {
    personId: 5000 + slot, position, ageYears: 23, seasonYear: 2030, talent: { kind: 'pro_entrant' }, group: 'pro_player',
    homeRegion: 'Generated Region', hometown: null, classKey: { classYear: 2030, classType: 'designer-test', slotIndex: slot }, ...over,
  };
}

function commit(sheet: Sheet, world: DesignerWorld = NONE): DesignedPlayer {
  const r = commitSheet({ sheet, world, editorId: 1, at: ON, rnd: R });
  if (!r.ok) throw new Error(`${r.rule} ${r.message}: ${r.problems.slice(0, 5).join('; ')}`);
  return r.player;
}

// ---- one play through the reference resolver with a designed player in the offence (D13.1.1 acceptance 1)
const FIELD: FieldGeometry = {
  lengthYd: 120, widthYd: 160 / 3, goalLineWestX: 10, goalLineEastX: 110, hashSouthY: 70.75 / 3, hashNorthY: 160 / 3 - 70.75 / 3, centreY: 80 / 3,
  uprightSouthY: 80 / 3 - 18.5 / 6, uprightNorthY: 80 / 3 + 18.5 / 6, crossbarHeightYd: 10 / 3,
};
const RULES: RuleSet = {
  id: 'fixture_2026', level: 'pro', seasonYear: 2026,
  num: (k) => { throw new Error(`no ${k}`); }, bool: (k) => { throw new Error(`no ${k}`); }, opt: (k) => { throw new Error(`no ${k}`); }, keys: () => [],
};
const GAME_DAY = { freshness: 1, freshnessLongTerm: 1, conditioning: 50, playingHurt: [], knowledge: {}, snapsThisGame: 0, requiredAbsenceDowns: 0, ejected: false, unavailable: false };
function simOf(p: PersonRecord, id: number, age: number): SimPlayer {
  const pl = p.playing!;
  return { playerId: id, position: pl.position, jersey: id % 100, heightIn: pl.heightIn, weightLb: pl.weightLb, ageYears: age, attributes: pl.attributes, tests: pl.tests, gameDay: GAME_DAY };
}
function filler(id: number): SimPlayer {
  const attributes: Record<string, number> = {};
  for (const a of ATTRIBUTE_IDS) attributes[a] = 50;
  return { playerId: id, position: 'XX', jersey: id % 100, heightIn: 74, weightLb: 220, ageYears: 25, attributes,
    tests: { fortyS: 4.6, tenSplitS: 1.6, threeConeS: null, shuttleS: null, verticalIn: null, broadIn: null, changeOfDirectionZ: 0 }, gameDay: GAME_DAY };
}
function playWith(designed: SimPlayer, kind: 'run' | 'dropback_pass') {
  const team = (side: 0 | 1): SimTeam => {
    const base = side === 0 ? 100 : 200;
    const players = Array.from({ length: 44 }, (_, i) => (side === 0 && i === 1 ? { ...designed, playerId: base + 2 } : filler(base + i + 1)));
    return { teamId: side + 1, side, players, depth: {}, teamDiscipline: { defCoverage: 1, postPlay: 1 } };
  };
  const unit = (base: number, roles: string[]): FieldedPlayer[] => roles.map((role, i) => ({ playerId: base + i + 1, role }));
  const input: PlayInput = {
    situation: {
      gameId: 1, playNumber: 1, driveNumber: 1, playKind: 'scrimmage', period: 1, overtime: false, clockTenths: 9000, clockStatus: 'running',
      playClockAtSnapTenths: 50, offense: 0, attackDir: 1, down: 1, distanceYd: 10, goalToGo: false, ballX: 35, ballY: FIELD.centreY, lineToGainX: 45,
      score: [0, 0], timeoutsLeft: [3, 3], insideTwoMinute: false, untimedDown: false,
    },
    calls: {
      snapping: { unit: 'offense', playContentId: null, contentHash: null, kind, personnelCode: '11', formationId: null, strength: null, motionId: null,
        protectionId: null, tags: [], runDirection: null, shotgun: false, tempo: 'huddle', players: unit(100, ['QB', 'RB', 'X', 'Z', 'Y', 'H', 'LT', 'LG', 'C', 'RG', 'RT']) },
      opposing: { unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null,
        coverageFamily: 'cover3', rushers: 4, boxCount: 7, players: unit(211, ['LE', 'DT', 'NT', 'RE', 'SAM', 'MIKE', 'WILL', 'LCB', 'RCB', 'FS', 'SS']) },
    },
    teams: [team(0), team(1)], environment: NEUTRAL_ENVIRONMENT, geometry: FIELD, streams: streamSource(seedFromNumber(7)), math: DMATH,
    rules: RULES, params: resolver.referenceParamTable(), options: { detail: 'summary' },
  } as PlayInput;
  return resolver.simulateReferencePlay(input);
}

describe('archetype table (D13.1.1 start 1)', () => {
  it('offers at least two archetypes at every main position and one at every other profile position, with unique ids', () => {
    for (const p of MAIN_POSITIONS) expect(archetypesFor(p).length, p).toBeGreaterThanOrEqual(2);
    for (const p of ['FB', 'K', 'P', 'LS']) expect(archetypesFor(p).length, p).toBeGreaterThanOrEqual(1);
    expect(new Set(ARCHETYPES.map((a) => a.id)).size).toBe(ARCHETYPES.length);
    expect(archetypesFor('LT')).toEqual(archetypesFor('OT'));
  });
  it('is centred per position, so an even mix of archetypes keeps the position profile', () => {
    for (const p of MAIN_POSITIONS) {
      const list = archetypesFor(p);
      for (const v of PROFILE_VARS) expect(Math.abs(list.reduce((a, x) => a + (x.bodyShiftSd[v] ?? 0), 0)), `${p} ${v}`).toBeLessThan(1e-9);
      const groups = new Set(list.flatMap((x) => Object.keys(x.groupShiftIss)));
      for (const g of groups) expect(Math.abs(list.reduce((a, x) => a + (x.groupShiftIss[g] ?? 0), 0)), `${p} ${g}`).toBeLessThan(1e-9);
    }
  });
});

describe('entry points (D13.1.1)', () => {
  it('archetype: every archetype builds a plausible player that commits as origin designed and loads in a game', () => {
    for (const a of ARCHETYPES) {
      const res = fromArchetype(a.id, start(a.position, 1), R);
      expect(res.warnings, a.id).toEqual([]);
      const p = commit(res.sheet);
      expect(p.record.origin).toBe('designed');
      expect(p.sandbox).toBe(false);
      expect(p.log.archetypeId).toBe(a.id);
      expect(plausibilityWarnings(proProfile(a.position), p.adult, DMATH), a.id).toEqual([]);
      const sim = simOf(p.record, 102, 23);
      expect(simPlayerProblems(sim)).toEqual([]);
      for (const id of ATTRIBUTE_IDS) expect(p.record.playing!.ceilings[id]!).toBeGreaterThanOrEqual(p.record.playing!.attributes[id]!);
    }
  });
  it('every entry point produces a player whose play record is valid (acceptance 1)', () => {
    const arch = commit(fromArchetype('rb_power_back', start('RB', 2), R).sheet);
    const meas = commit(fromMeasurables({ heightIn: 71, weightLb: 214, tests: { fortyS: 4.5, verticalIn: 35, broadIn: 120 } }, 'generate', start('RB', 3), R));
    // Blank sheet: every field by hand (copied here from another player, field by field).
    const donor = commit(fromArchetype('rb_scat_back', start('RB', 4), R).sheet).record.playing!;
    const blank: Sheet = { ...blankSheet(5099, 2030), position: 'RB', ageYears: 24, firstName: 'Hand', lastName: 'Made', homeRegion: 'Generated Region',
      heightIn: donor.heightIn, weightLb: donor.weightLb, tests: { fortyS: donor.tests.fortyS, tenSplitS: null, threeConeS: null, shuttleS: null, verticalIn: null, broadIn: null, benchReps: null },
      attributes: { ...donor.attributes }, ceilings: { ...donor.ceilings } };
    const hand = commit(blank);
    for (const p of [arch, meas, hand]) {
      for (const kind of ['run', 'dropback_pass'] as const) {
        const r = playWith(simOf(p.record, 102, 24), kind);
        expect(playTruthProblems(r.truth)).toEqual([]);
        expect(PlayTruth.safeParse(r.truth).success).toBe(true);
      }
    }
    expect(hand.log.entry).toBe('blank');
  });
  it('measurables: physical values are computed from the body; technique and mental are generated or left to the user', () => {
    const m = { heightIn: 75, weightLb: 252, tests: { fortyS: 4.62, verticalIn: 34, broadIn: 118, benchReps: 22 } };
    const gen = fromMeasurables(m, 'generate', start('EDGE', 5), R);
    const phys = derivedPhysical(gen)!;
    for (const k of ['play_strength', 'explosiveness', 'stamina', 'durability'] as const) expect(gen.attributes[k]).toBe(phys[k]);
    expect(missingFields(gen)).toEqual([]);
    const hand = fromMeasurables(m, 'hand', start('EDGE', 5), R);
    const miss = missingFields(hand);
    expect(miss).toContain('attributes.speed_rush_and_bend');
    expect(miss).toContain('firstName');
    expect(miss.some((f) => f === 'attributes.play_strength')).toBe(false);
    expect(hand.tests.tenSplitS).toBeGreaterThan(1.4);
  });
  it('a blank sheet with nothing set is refused with the list of missing required fields (acceptance 3)', () => {
    const r = commitSheet({ sheet: blankSheet(6000, 2030), world: NONE, editorId: null, at: null, rnd: R });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rule).toBe('D13.1.1');
    for (const f of ['position', 'ageYears', 'firstName', 'lastName', 'homeRegion', 'heightIn', 'weightLb', 'tests.fortyS']) expect(r.problems).toContain(f);
    expect(r.problems.filter((p) => p.startsWith('attributes.')).length).toBe(ATTRIBUTE_IDS.length);
  });
  it('is deterministic: the same request gives the same record', () => {
    const a = commit(fromArchetype('wr_slot', start('WR', 7), R).sheet);
    const b = commit(fromArchetype('wr_slot', start('WR', 7), R).sheet);
    expect(JSON.stringify(b.record)).toBe(JSON.stringify(a.record));
  });
});

describe('plausibility and the sandbox switch (D13.1.2)', () => {
  const big = (): Sheet => ({ ...fromArchetype('ot_road_grader', start('OT', 8), R).sheet, weightLb: 330, tests: { ...fromArchetype('ot_road_grader', start('OT', 8), R).sheet.tests, fortyS: 4.3 } });
  it('flags the 330 lb, 4.30 player and refuses him without the switch', () => {
    const w = designerWarnings(big(), DMATH);
    expect(w.some((x) => x.fields.includes('tests.fortyS'))).toBe(true);
    const r = commitSheet({ sheet: big(), world: NONE, editorId: 1, at: ON, rnd: R });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rule).toBe('D13.1.2');
  });
  it('the switch removes the limit, marks him sandbox, logs the override, and keeps him out of rankings and certified careers', () => {
    const p = commit({ ...big(), sandbox: true });
    expect(p.sandbox).toBe(true);
    expect(p.record.playing!.hidden.designed_sandbox).toBe(1);
    expect(p.log.overridden.length).toBeGreaterThan(0);
    expect(inSharedRankings(p.record)).toBe(false);
    expect(mayEnterCertifiedCareer(p.record)).toBe(false);
    const ok = commit(fromArchetype('ot_road_grader', start('OT', 9), R).sheet);
    expect(inSharedRankings(ok.record)).toBe(true);
  });
  it('judges a young prospect on his adult-equivalent body, as the generator does', () => {
    const young = generatePlayer(genReq('WR', 11, { ageYears: 17, talent: { kind: 'tier', tier: 3 }, group: 'recruit' }), R);
    const s = sheetFromRecord(young.record, 7000, 2030);
    expect(designerWarnings({ ...s, source: null, entry: 'blank' }, DMATH)).toEqual([]);
  });
  it('refuses a ceiling below the current value even in sandbox', () => {
    const s = fromArchetype('cb_zone', start('CB', 12), R).sheet;
    const r = commitSheet({ sheet: { ...s, sandbox: true, ceilings: { ...s.ceilings, zone_coverage: 0 } }, world: NONE, editorId: 1, at: ON, rnd: R });
    expect(r.ok).toBe(false);
  });
});

describe('career gate (D13.1.1 rules, N4)', () => {
  it('opens before a world starts and in sandbox worlds, never in a started or certified career', () => {
    expect(designerAccess({ kind: 'career', started: false, sandboxWorld: false, certified: false }).ok).toBe(true);
    expect(designerAccess({ kind: 'career', started: true, sandboxWorld: true, certified: false }).ok).toBe(true);
    expect(designerAccess({ kind: 'career', started: true, sandboxWorld: false, certified: false }).ok).toBe(false);
    expect(designerAccess({ kind: 'career', started: false, sandboxWorld: false, certified: true }).ok).toBe(false);
  });
  it('a designed player in a career world sets the edited flag (acceptance 2)', () => {
    const s = fromArchetype('lb_coverage_backer', start('LB', 13), R).sheet;
    expect(commit(s, { kind: 'career', started: false, sandboxWorld: false, certified: false }).marksWorldEdited).toBe(true);
    expect(commit(s).marksWorldEdited).toBe(false);
  });
});

describe('copies, edits and real people (D13.1.1 edge cases, D13.6.2)', () => {
  const base = () => commit(fromArchetype('s_box_safety', start('S', 14), R).sheet).record;
  it('editing in place keeps history; a copy is a new person with none; a position change keeps every attribute', () => {
    const rec = PersonRecord.parse({ ...base(), history: { honourEventIds: [42] } });
    const inPlace = commit({ ...sheetFromRecord(rec, rec.id, 2030), position: 'LB' });
    expect(inPlace.record.history.honourEventIds).toEqual([42]);
    expect(inPlace.record.playing!.attributes).toEqual(rec.playing!.attributes);
    expect(inPlace.record.playing!.position).toBe('LB');
    const copy = commit(sheetFromRecord(rec, 9001, 2030));
    expect(copy.record.id).toBe(9001);
    expect(copy.record.history.honourEventIds).toEqual([]);
    expect(copy.log.sourcePersonId).toBe(rec.id);
  });
  it('a real person stays real, keeps his locked fields, may have measurables and ratings changed, and his own outliers are never flagged', () => {
    const b = base();
    const real = PersonRecord.parse({ ...b, origin: 'imported', externalRef: { source: 'pack', key: 'x1' }, traitBlock: neutralTraitBlock(), playing: { ...b.playing!, weightLb: 330, tests: { ...b.playing!.tests, fortyS: 4.25 } } });
    const s = sheetFromRecord(real, real.id, 2030);
    expect(designerWarnings(s, DMATH)).toEqual([]);
    const renamed = commitSheet({ sheet: { ...s, lastName: 'Other' }, world: NONE, editorId: 1, at: ON, rnd: R });
    expect(renamed.ok).toBe(false);
    if (!renamed.ok) expect(renamed.rule).toBe('D13.6.2');
    const edited = commit({ ...s, weightLb: 215, tests: { ...s.tests, fortyS: 4.5 }, attributes: { ...s.attributes, tackling: 60 }, ceilings: { ...s.ceilings, tackling: 70 } });
    expect(edited.record.origin).toBe('imported');
    expect(edited.record.traitBlock).toEqual(real.traitBlock);
    const copy = commit(sheetFromRecord(real, 9100, 2030));
    expect(copy.record.origin).toBe('imported');
    // A change the user makes to a real person is a design and is checked.
    expect(designerWarnings({ ...s, tests: { ...s.tests, fortyS: 4.0 } }, DMATH).length).toBeGreaterThan(0);
  });
});

describe('staff grade in the side panel (D13.1.1, D6)', () => {
  it('is an estimate from one standard look: near the primary attributes, with a band, and repeatable', () => {
    const p = commit(fromArchetype('qb_pocket_passer', start('QB', 15), R).sheet).record.playing!;
    const attrs = primaryAttributes('QB');
    const truth = attrs.reduce((a, k) => a + p.attributes[k]!, 0) / attrs.length;
    const g = staffGrade('QB', p.attributes, ON, 23, stream(seedFromNumber(3), 'person.design', [1]))!;
    expect(Math.abs(g.mean - truth)).toBeLessThan(6);
    expect(g.variance).toBeGreaterThan(0);
    const again = staffGrade('QB', p.attributes, ON, 23, stream(seedFromNumber(3), 'person.design', [1]))!;
    expect(again.mean).toBe(g.mean);
    expect(staffGrade('QB', {}, ON, 23, stream(seedFromNumber(3), 'person.design', [1]))).toBeNull();
  });
});

describe('drift guards (G-92 acceptance: designed players pass the same guards as generated ones)', () => {
  it('a class designed evenly across each position\'s archetypes passes the D13.4.5 class validator and raises no body drift alarm', () => {
    const cls: DesignedPlayer[] = [];
    const counts: Record<string, number> = {};
    for (const pos of MAIN_POSITIONS) {
      const list = archetypesFor(pos);
      const n = 240;
      counts[pos] = n;
      for (let i = 0; i < n; i++) cls.push(commit(fromArchetype(list[i % list.length]!.id, start(pos, 100000 + MAIN_POSITIONS.indexOf(pos) * 1000 + i), R).sheet));
    }
    const stats = classStats(cls, (p) => profileOf(p.record.playing!.position));
    expect(validateClass(stats, { counts })).toEqual([]);
    expect(bodyDriftAlarms(stats)).toEqual([]);
  }, 120000);
  it('a single archetype is a real lean: its class mean moves away from the profile in the stated direction', () => {
    const cls: DesignedPlayer[] = [];
    for (let i = 0; i < 120; i++) cls.push(commit(fromArchetype('wr_deep_threat', start('WR', 200000 + i), R).sheet));
    const stats = classStats(cls, () => 'WR');
    expect(stats.measurables.WR!.fortyS!.mean).toBeLessThan(proProfile('WR').mean('fortyS'));
  });
});
