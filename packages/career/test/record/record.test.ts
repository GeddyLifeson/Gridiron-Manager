import { describe, expect, it, beforeEach } from 'vitest';
import { EventTypeDef } from '@gm/schema';
import {
  FAMILIES, RECORD_EVENT_TYPES, DEFAULT_EVIDENCE_MAP, evidenceMapProblems, buildRecord, sampleEventIds, hasNoRecord,
  familiesForSeat, familiesForDuties, recordTab, teachingView, gameManagementView, communicationView, evaluationView,
  sampleLines, PARAMS,
  type FamilyId,
} from '../../src/record/index.ts';
import { COACH, conduct, constantSeat, decision, everyFamily, ev, resetIds, seat, teach, work } from './fixture.ts';

beforeEach(() => resetIds());

const families = (r: ReturnType<typeof buildRecord>) => FAMILIES.filter((f) => r.eventIds[f].length > 0);

describe('event types and map', () => {
  it('every evidence type parses and the default map has no duplicate', () => {
    for (const t of RECORD_EVENT_TYPES) expect(EventTypeDef.safeParse(t).success).toBe(true);
    expect(evidenceMapProblems(DEFAULT_EVIDENCE_MAP)).toEqual([]);
    expect(evidenceMapProblems([...DEFAULT_EVIDENCE_MAP, DEFAULT_EVIDENCE_MAP[0]!])).toHaveLength(1);
  });
  it('params are all bible or assumption with a leaf', () => {
    for (const p of PARAMS.params) { expect(['bible', 'assumption']).toContain(p.basis); expect(p.leaf).toMatch(/^E9|^S8/); }
  });
});

describe('E9.5.1 / S8.1.1 acceptance 1: only the families a rung lists gain events', () => {
  const expected: Record<number, FamilyId[]> = {
    0: ['work_products', 'evaluations'],
    1: ['work_products', 'evaluations'],
    2: ['work_products', 'evaluations'],
    3: ['work_products', 'evaluations'],
    4: ['teaching', 'work_products', 'evaluations', 'conduct'],
    5: ['teaching', 'work_products', 'evaluations', 'conduct'],
    6: ['teaching', 'work_products', 'evaluations', 'conduct'],
    7: ['unit_results', 'teaching', 'work_products', 'evaluations', 'conduct'],
    8: [...FAMILIES],
    9: [...FAMILIES],
  };
  for (const [rung, fams] of Object.entries(expected)) {
    it(`rung ${rung}`, () => {
      const r = buildRecord(everyFamily(2030), COACH, constantSeat(seat(Number(rung))));
      expect(families(r)).toEqual(FAMILIES.filter((f) => fams.includes(f)));
      // Everything else is refused with a reason, not silently dropped.
      expect(r.refused.length).toBe(6 - fams.length);
    });
  }
  it('a college general manager seat gets family 5 only', () => {
    const r = buildRecord(everyFamily(2030), COACH, constantSeat(seat(7, { collegeGm: true })));
    expect(families(r)).toEqual(['evaluations']);
  });
  it('no seat, no evidence', () => {
    const r = buildRecord(everyFamily(2030), COACH, { seatAt: () => null });
    expect(families(r)).toEqual([]);
    expect(r.refused.every((x) => x.reason === 'no_seat')).toBe(true);
  });
});

describe('family 1 scope (E9.5.1 rule 4, E9.4.3 rule 2, S8.1.1 rule 4)', () => {
  const log = () => [
    decision(2030, 1, 'fourth_down', true),
    decision(2030, 2, 'play_call', true),
    decision(2030, 3, 'fourth_down', false, { recommendation: true }),
  ];
  it('a graduate assistant has no fourth-down record', () => {
    const r = buildRecord(log(), COACH, constantSeat(seat(2)));
    expect(r.eventIds.decisions).toEqual([]);
  });
  it('a quality control coach logs recommendations only', () => {
    const r = buildRecord(log(), COACH, constantSeat(seat(3)));
    expect(r.eventIds.decisions).toEqual([3]);
  });
  it('a coordinator who calls plays adds the play-calling part; one who does not adds none', () => {
    expect(buildRecord(log(), COACH, constantSeat(seat(7, { callsPlays: true }))).eventIds.decisions).toEqual([2, 3]);
    resetIds();
    expect(buildRecord(log(), COACH, constantSeat(seat(7))).eventIds.decisions).toEqual([3]);
  });
  it('a head coach logs all of them', () => {
    expect(buildRecord(log(), COACH, constantSeat(seat(8))).eventIds.decisions).toEqual([1, 2, 3]);
  });
});

describe('duty gate (S8.1.1 rules 2 and 4)', () => {
  it('a duty outside his seat produces no evidence; a duty in it does', () => {
    const log = [work(2030, 1, 10, 9, { dutyFamily: 'film_tagging' }), work(2030, 2, 10, 9, { dutyFamily: 'tendency_reports' })];
    const r = buildRecord(log, COACH, constantSeat(seat(2, { duties: ['film_tagging', 'charting'] })));
    expect(r.eventIds.work_products).toEqual([1]);
    expect(r.refused).toEqual([{ eventId: 2, family: 'work_products', reason: 'duty_not_held' }]);
  });
  it('an event whose family the duty cannot feed is refused', () => {
    const log = [teach(2030, 1, 40, 1)].map((e) => ({ ...e, payload: { ...e.payload, dutyFamily: 'film_tagging' } }));
    const r = buildRecord(log, COACH, constantSeat(seat(5)));
    expect(r.refused[0]!.reason).toBe('duty_family_mismatch');
  });
  it('plan sections add unit results only from coordinator up', () => {
    expect(familiesForDuties(['plan_slice'], 6)).toEqual(['work_products']);
    expect(familiesForDuties(['plan_slice'], 7)).toEqual(['unit_results', 'work_products']);
    expect(familiesForSeat(seat(6)).families.has('unit_results')).toBe(false);
  });
});

describe('E9.1.2 record object', () => {
  it('ignores other people and types outside the map', () => {
    const log = [work(2030, 1, 5, 5), work(2030, 2, 5, 5, {}), ev('job_opened', 2030, 3, {}), work(2030, 4, 5, 4)];
    log[1] = { ...log[1]!, actors: [{ personId: 99, role: 'coach' }] };
    const r = buildRecord(log, COACH, constantSeat(seat(3)));
    expect(r.eventIds.work_products).toEqual([1, 4]);
  });
  it('acceptance 2 and 3: rebuilding from a shuffled log, or for a second user with the same log, gives the same record and tab', () => {
    const log = [...everyFamily(2030), ...everyFamily(2031), work(2031, 200, 30, 12)];
    const a = buildRecord(log, COACH, constantSeat(seat(9)));
    const b = buildRecord([...log].reverse(), COACH, constantSeat(seat(9)));
    expect(b).toEqual(a);
    const w = { fromSeason: 2030, toSeason: 2031 };
    expect(recordTab(b, [...log].reverse(), w)).toEqual(recordTab(a, log, w));
  });
  it('event ids are in date order', () => {
    const log = [work(2031, 5, 1, 1), work(2030, 300, 1, 1), work(2030, 2, 1, 1)];
    expect(buildRecord(log, COACH, constantSeat(seat(3))).eventIds.work_products).toEqual([3, 2, 1]);
  });
  it('simulated events are kept with the flag and left out of label samples (S8.1.1 edge case)', () => {
    const log = [work(2030, 1, 10, 9), work(2030, 2, 10, 9, { simulated: true })];
    const r = buildRecord(log, COACH, constantSeat(seat(3)));
    expect(r.eventIds.work_products).toEqual([1, 2]);
    expect(r.simulatedEventIds.work_products).toEqual([2]);
    expect(sampleEventIds(r, 'work_products')).toEqual([1]);
    expect(recordTab(r, log, { fromSeason: 2030, toSeason: 2030 }).find((l) => l.family === 'work_products')!.simulated).toBe(1);
  });
  it('an empty family reads "no record", never a low value (E9.1.1 edge case)', () => {
    const log = [work(2030, 1, 3, 3)];
    const r = buildRecord(log, COACH, constantSeat(seat(8)));
    expect(hasNoRecord(r, 'decisions')).toBe(true);
    const tab = recordTab(r, log, { fromSeason: 2030, toSeason: 2030 });
    expect(tab.map((l) => l.status)).toEqual(['no_record', 'no_record', 'no_record', 'record', 'no_record', 'no_record']);
  });
});

describe('record tab and views', () => {
  it('tab lines count events and matches over the window, split by kind, and open to their events', () => {
    const log = [decision(2029, 1, 'fourth_down', true), decision(2030, 1, 'fourth_down', true), decision(2030, 2, 'fourth_down', false), decision(2030, 3, 'timeout', true), work(2030, 4, 212, 191)];
    const r = buildRecord(log, COACH, constantSeat(seat(8)));
    const tab = recordTab(r, log, { fromSeason: 2030, toSeason: 2030 });
    const d = tab[0]!;
    expect(d).toMatchObject({ family: 'decisions', number: 1, events: 3, checked: 3, matched: 2 });
    expect(d.kinds.map((k) => [k.key, k.events, k.matched])).toEqual([['fourth_down', 2, 1], ['timeout', 1, 1]]);
    expect(d.eventIds).toEqual([2, 3, 4]);
    expect(tab[3]).toMatchObject({ checked: 212, matched: 191 });
  });
  it('teaching view compares with projection by player season and position', () => {
    const log = [teach(2030, 1, 40, 2), teach(2030, 2, 41, -1), teach(2030, 3, 42, 0.5, 'assignment_errors')];
    const r = buildRecord(log, COACH, constantSeat(seat(5)));
    const v = teachingView(r, log, { fromSeason: 2030, toSeason: 2030 });
    expect(v.development.map((p) => p.playerId)).toEqual([40, 41]);
    expect(v.byPosition).toEqual([{ positionGroup: 'wr', players: 2, meanDelta: 0.5 }]);
    expect(v.assignmentErrors).toHaveLength(1);
  });
  it('game management view keeps recommendations apart and counts rule errors', () => {
    const log = [decision(2030, 1, 'challenge', false, { rulesError: true }), decision(2030, 2, 'fourth_down', true, { recommendation: true })];
    const r = buildRecord(log, COACH, constantSeat(seat(8)));
    const v = gameManagementView(r, log, { fromSeason: 2030, toSeason: 2030 });
    expect(v.decisions).toEqual([{ decisionKind: 'challenge', decisions: 1, matchedModel: 0, rulesErrors: 1 }]);
    expect(v.recommendations).toEqual([{ decisionKind: 'fourth_down', decisions: 1, matchedModel: 1, rulesErrors: 0 }]);
  });
  it('communication view reads L1 promise rows by the promiser role', () => {
    const kept = { ...ev('promise_kept', 2030, 1, {}), actors: [{ personId: COACH, role: 'promiser' }, { personId: 40, role: 'promisee' }] };
    const broken = { ...ev('promise_broken', 2030, 2, {}), actors: [{ personId: COACH, role: 'promiser' }] };
    const theirs = { ...ev('promise_broken', 2030, 3, {}), actors: [{ personId: COACH, role: 'promisee' }] };
    const log = [kept, broken, theirs, conduct(2030, 4, true)];
    const r = buildRecord(log, COACH, constantSeat(seat(5)));
    const v = communicationView(r, log, { fromSeason: 2030, toSeason: 2030 });
    expect(v.map((l) => [l.kind, l.kept, l.broken])).toEqual([['own_rule', 1, 0], ['promise', 1, 1]]);
    expect(evaluationView(r, log, { fromSeason: 2030, toSeason: 2030 })).toEqual([]);
  });
  it('sample lines show how far a descriptor is from its minimum (E9.2.1)', () => {
    const lines = sampleLines([
      { labelId: 'aggressive_fourth', held: false, sample: 13, minSample: 20, strength: null },
      { labelId: 'keeps_word', held: true, sample: 30, minSample: 20, strength: 'clear' },
    ]);
    expect(lines[0]).toMatchObject({ labelId: 'aggressive_fourth', stillNeeded: 7, held: false });
    expect(lines[1]).toMatchObject({ stillNeeded: 0, held: true, strength: 'clear' });
  });
});
