// G-25 acceptance part 1: every rung 0 to 9 and every staff chart slot is data (S1.1, S1.2, X8.1, L4.1).
import { describe, expect, it } from 'vitest';
import { ParamFile, PositionDefinition, RuleKeyManifest, scanForbiddenJson } from '@gm/schema';
import catalogueJson from '../../src/positions/catalogue.json' with { type: 'json' };
import positionsJson from '../../src/positions/positions.json' with { type: 'json' };
import {
  CATALOGUE, PARAMS, POSITION_EVENT_TYPES, RULE_KEYS, RUNGS_BY_LEVEL, buildCatalogue, callsPlays, defaultCallers, limitBreaches, limitsFrom,
  positionDefinitions, staffChart, staffLimits, staffProblems, toJobRecord, fillSeat,
} from '../../src/positions/index.ts';
import { COLLEGE_LIMITS, D0, emptyStaff, filledStaff, seatOf } from './fixtures.ts';

describe('job catalogue (S1.1.1 to S1.1.3, E2.1.1)', () => {
  it('offers every rung at each level: college 0 to 9, pro 0 to 7 and 9 (no rung 8)', () => {
    for (const level of ['college', 'pro'] as const) {
      const rungs = new Set(CATALOGUE.jobsAt(level).filter((j) => j.onLadder).map((j) => j.rung));
      expect([...rungs].sort((a, b) => a! - b!)).toEqual([...RUNGS_BY_LEVEL[level]]);
    }
  });
  it('every staff seat names a known position, and every ladder seat has a rung and a duty set', () => {
    for (const j of CATALOGUE.jobs) {
      if (j.onStaff) expect(CATALOGUE.hasPosition(j.positionId!), j.id).toBe(true);
      if (j.onLadder && j.onStaff) { expect(j.rung, j.id).not.toBeNull(); expect(j.dutyIds.length, j.id).toBeGreaterThan(0); }
    }
  });
  it('X8.1.1 definitions parse as contract rows and every game-required chair has a rule ending in the appointer pick', () => {
    for (const d of positionDefinitions()) {
      PositionDefinition.parse(d);
      if (d.requiredForGame) expect(d.successionRule.at(-1)?.kind, d.id).toBe('appointer_pick');
    }
    const required = positionDefinitions().filter((d) => d.requiredForGame).map((d) => d.id).sort();
    expect(required).toEqual(['pos:defensive_coordinator', 'pos:head_coach', 'pos:offensive_coordinator', 'pos:special_teams_coordinator']);
  });
  it('rejects a broken file at load (content build)', () => {
    const noRung8 = { ...catalogueJson, jobs: catalogueJson.jobs.filter((j) => j.rung !== 8) };
    expect(() => buildCatalogue(noRung8, positionsJson)).toThrow(/college: no job at rung 8/);
    const badRule = JSON.parse(JSON.stringify(positionsJson)) as typeof positionsJson;
    badRule.positions[0]!.definition.successionRule = [{ kind: 'named_deputy' }] as never;
    expect(() => buildCatalogue(catalogueJson, badRule)).toThrow(/must end with appointer_pick/);
    const loop = JSON.parse(JSON.stringify(positionsJson)) as typeof positionsJson;
    const hc = loop.positions.find((p) => p.definition.id === 'pos:head_coach')!;
    hc.definition.reportsTo = 'pos:offensive_coordinator' as never;
    expect(() => buildCatalogue(catalogueJson, loop)).toThrow(/loops/);
  });
  it('holds no forbidden key (Q1.2.1) and the param, key and event files parse', () => {
    expect(scanForbiddenJson('catalogue.json', catalogueJson)).toEqual([]);
    expect(scanForbiddenJson('positions.json', positionsJson)).toEqual([]);
    ParamFile.parse(PARAMS);
    RuleKeyManifest.parse(RULE_KEYS);
    expect(POSITION_EVENT_TYPES.length).toBe(7);
  });
});

describe('staff from the catalogue (S1.1.2, S1.1.3, S1.2.1, S1.2.2, X8.1.2)', () => {
  it('a top college staff has exactly 4 graduate assistants and at most 11 off-campus recruiters (S1.1.2 acceptance)', () => {
    const s = emptyStaff('college', 'top');
    expect(s.seats.filter((x) => x.positionId === 'pos:graduate_assistant')).toHaveLength(4);
    expect(s.seats.filter((x) => x.recruitsOffCampus).length).toBeLessThanOrEqual(11);
    expect(s.seats.find((x) => x.positionId === 'pos:head_coach')!.recruitsOffCampus).toBe(true);
    expect(s.seats.filter((x) => x.positionId.startsWith('pos:strength')).length).toBeLessThanOrEqual(5);
    expect(staffProblems(s)).toEqual([]);
  });
  it('bands scale pooled seats and keep the floors: a low band still has a graduate assistant and a strength coach', () => {
    const low = emptyStaff('college', 'low');
    const mid = emptyStaff('college', 'middle');
    const top = emptyStaff('college', 'top');
    expect(low.seats.length).toBeLessThan(mid.seats.length);
    expect(mid.seats.length).toBeLessThan(top.seats.length);
    expect(low.seats.filter((x) => x.positionId === 'pos:graduate_assistant').length).toBe(2);
    expect(low.seats.filter((x) => x.positionId === 'pos:strength_head').length).toBe(1);
    for (const s of [low, mid]) expect(staffProblems(s)).toEqual([]);
  });
  it('a pro staff has one seat per coordinator and one quality control seat per side, and no league limits (S1.1.3 acceptance)', () => {
    const s = emptyStaff('pro', 'top');
    for (const side of ['offense', 'defense', 'special_teams']) {
      expect(s.seats.filter((x) => x.positionId.endsWith('_coordinator') && x.side === side && x.rung === 7), side).toHaveLength(1);
      expect(s.seats.filter((x) => x.positionId === `pos:quality_control.${side}`), side).toHaveLength(1);
    }
    expect(s.seats.some((x) => x.rung === 8)).toBe(false);
    expect(s.seats.some((x) => x.recruitsOffCampus)).toBe(false);
    expect(staffProblems(s)).toEqual([]);
    // Scouts report to the general manager, not the head coach (S1.1.3 edge case).
    const gm = seatOf(s, 'pos:general_manager');
    expect(s.seats.filter((x) => x.positionId === 'pos:scouting_assistant').every((x) => x.reportsToSeatId === gm)).toBe(true);
  });
  it('college head coach chair is rung 9 by default and rung 8 on request', () => {
    expect(emptyStaff().seats.find((x) => x.positionId === 'pos:head_coach')!.rung).toBe(9);
  });
  it('every seat but the top of the chart has exactly one evaluating boss, coordinators report to the head coach and rooms to their coordinator (S1.2.1)', () => {
    const s = emptyStaff();
    const hc = seatOf(s, 'pos:head_coach');
    const oc = seatOf(s, 'pos:offensive_coordinator');
    expect(s.seats.find((x) => x.seatId === oc)!.reportsToSeatId).toBe(hc);
    expect(s.seats.find((x) => x.positionId === 'pos:position_coach.qb')!.reportsToSeatId).toBe(oc);
    expect(s.seats.find((x) => x.seatId === hc)!.reportsToSeatId).toBe(seatOf(s, 'pos:athletic_director'));
  });
  it('limits come from rule keys; a missing key is no limit; a breach is reported, not blocked (S1.2.2)', () => {
    const rules = { keys: () => ['staff.grad_assistants_max'], num: (k: string) => (k === 'staff.grad_assistants_max' ? 4 : NaN) };
    const l = staffLimits(rules);
    expect(l.get('staff.grad_assistants_max')).toBe(4);
    expect(l.get('staff.offcampus_recruiters_max')).toBeNull();
    const { staff } = filledStaff();
    expect(limitBreaches(staff, COLLEGE_LIMITS)).toEqual([]);
    expect(limitBreaches(staff, limitsFrom({ 'staff.grad_assistants_max': 3 }))).toEqual([{ key: 'staff.grad_assistants_max', count: 4, limit: 3 }]);
  });
  it('ladder seats convert to contract JobRecords; callers carry the calls_plays flag', () => {
    const { staff } = filledStaff();
    for (const s of staff.seats.filter((x) => x.rung !== null)) toJobRecord(staff, s);
    const oc = seatOf(staff, 'pos:offensive_coordinator');
    expect(callsPlays(staff, oc)).toBe(true);
    expect(toJobRecord(staff, staff.seats.find((x) => x.seatId === oc)!).callsPlays).toBe(true);
    expect(defaultCallers(staff.seats).offense).toBe(oc);
  });
});

describe('staff chart (X8.1.2)', () => {
  it('renders college and pro staffs with no orphan chair; open chair count equals open boxes', () => {
    for (const s of [emptyStaff('college'), emptyStaff('pro')]) {
      const c = staffChart(s, D0);
      const boxes = Object.values(c.columns).flat();
      expect(boxes).toHaveLength(s.seats.length);
      expect(c.openChairs).toBe(boxes.filter((b) => b.holderPersonId === null).length);
      const ids = new Set(boxes.map((b) => b.seatId));
      for (const [from, to] of c.edges) { expect(ids.has(from)).toBe(true); expect(ids.has(to)).toBe(true); }
      expect(c.columns.head).toHaveLength(1);
    }
  });
  it('an all-interim staff still labels every chair', () => {
    let s = emptyStaff('pro');
    for (const x of s.seats) s = fillSeat(s, x.seatId, 5000 + x.seatId, D0, 'interim');
    const boxes = Object.values(staffChart(s, D0).columns).flat();
    expect(boxes.every((b) => b.badges.includes('Interim'))).toBe(true);
    expect(staffChart(s, D0).openChairs).toBe(0);
  });
});
