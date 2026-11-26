import { describe, expect, it } from 'vitest';
import { compliance } from '@gm/league';
import {
  CRISIS_EVENT, catalogueProblems, crisisType, crisisWeek, closeCrisis, advanceCrisis, emptyCrisisState, proposeTriggers, linkOutcome,
  drawOutsideTriggers, offFieldWeekly, guardCheck, eligibleSubjects, quoteAllowed, labelAllowed, mayHoldFamily, openLimit,
  type CrisisCatalogue, type HazardPerson, type Trigger,
} from '../../src/crisis/index.ts';
import { ACTS, CATALOGUE, cause, day, fixture, person, streams, triggerKey } from './fixtures.ts';

describe('catalogue (G-32 rows as the engine reads them)', () => {
  it('loads with no problems', () => {
    expect(catalogueProblems(CATALOGUE, ACTS)).toEqual([]);
  });
  it('fails a row without a guard class, a personal row open to imported people, and a causeless non-outside row', () => {
    const bad = JSON.parse(JSON.stringify(CATALOGUE)) as { crises: Record<string, unknown>[] };
    delete bad.crises[0]!.guard;
    (bad.crises[1]!.subjects as Record<string, boolean>).generatedOnly = false;
    bad.crises[2]!.causeEvents = [];
    const p = catalogueProblems(bad as unknown as CrisisCatalogue, ACTS);
    expect(p.some((x) => x.includes('guard class'))).toBe(true);
    expect(p.some((x) => x.includes('personal class must be generated'))).toBe(true);
    expect(p.some((x) => x.includes('lists no cause event'))).toBe(true);
  });
});

describe('L9.1.2 real-person guard', () => {
  const imported = person(1, 'imported');
  const minor = person(2, 'generated', true);
  const gen = person(3);
  it('refuses personal events naming an imported person in any role, or a minor', () => {
    for (const role of ['subject', 'actor', 'victim', 'witness'] as const) {
      expect(guardCheck('x', 'personal', [{ person: imported, role }]).ok).toBe(false);
      expect(guardCheck('x', 'personal', [{ person: minor, role }]).ok).toBe(false);
    }
    expect(guardCheck('x', 'personal', [{ person: gen, role: 'subject' }]).ok).toBe(true);
  });
  it('lets football events land on everyone', () => {
    expect(guardCheck('x', 'football', [{ person: imported, role: 'subject' }, { person: minor, role: 'subject' }]).ok).toBe(true);
  });
  it('needs a family object where the row says so, and imported people hold none', () => {
    expect(guardCheck('x', 'personal', [{ person: person(4, 'generated', false, false), role: 'subject' }], { requiresFamily: true }).ok).toBe(false);
    expect(mayHoldFamily(imported)).toBe(false);
    expect(quoteAllowed(imported)).toBe(false);
    expect(labelAllowed(imported, 'character')).toBe(false);
    expect(labelAllowed(imported, 'football')).toBe(true);
  });
  it('fuzz: one million proposed events on a fully imported league give zero personal events; all-minor gives zero too', () => {
    const s = streams(11)(['fuzz']);
    const roles = ['subject', 'actor', 'victim', 'witness'] as const;
    let personalImported = 0;
    let personalMinor = 0;
    for (let i = 0; i < 1_000_000; i++) {
      const cls = s.chance(0.5) ? 'personal' : 'football';
      const role = roles[s.int(0, 3)]!;
      if (cls === 'personal' && guardCheck('fuzz', cls, [{ person: person(i + 1, 'imported'), role }]).ok) personalImported++;
      if (cls === 'personal' && guardCheck('fuzz', cls, [{ person: person(i + 1, 'generated', true), role }]).ok) personalMinor++;
    }
    expect(personalImported).toBe(0);
    expect(personalMinor).toBe(0);
  });
  it('outside draws on a fully imported roster produce nothing, ever', () => {
    const roster: HazardPerson[] = Array.from({ length: 53 }, (_, i) => ({ ...person(i + 1, 'imported'), stress: 1000, offFieldRisk: 50 }));
    let n = 0;
    for (let w = 0; w < 520; w++) n += drawOutsideTriggers(CATALOGUE, 1, roster, day(w * 7 % 364, 2026 + Math.floor(w / 52)), streams(3)).length;
    expect(n).toBe(0);
    expect(eligibleSubjects('personal', roster)).toEqual([]);
  });
  it('the engine refuses a personal trigger on an imported subject and logs the denial', () => {
    const f = fixture({ people: [person(1, 'imported'), person(2)] });
    const st = emptyCrisisState();
    proposeTriggers(st, [{ typeId: 'off_field_incident', teamId: 1, subjectIds: [1], causeEventIds: [], date: day(10) }], f.ctx);
    expect(st.queue).toHaveLength(0);
    expect(st.denials).toEqual([{ what: 'off_field_incident', personId: 1, role: 'subject', reason: 'imported' }]);
    // A football crisis (injury to a star) still lands on him.
    proposeTriggers(st, [{ typeId: 'injury_to_star', teamId: 1, subjectIds: [1], causeEventIds: [cause(f)], date: day(10) }], f.ctx);
    expect(st.queue).toHaveLength(1);
  });
});

describe('L9.1.1 causes, merging and pacing', () => {
  it('needs an existing cause event for every class but the two outside classes', () => {
    const f = fixture();
    const st = emptyCrisisState();
    proposeTriggers(st, [
      { typeId: 'public_dispute', teamId: 1, subjectIds: [5], causeEventIds: [], date: day(10) },
      { typeId: 'public_dispute', teamId: 1, subjectIds: [6], causeEventIds: [424242], date: day(10) },
      { typeId: 'family_emergency', teamId: 1, subjectIds: [7], causeEventIds: [], date: day(10) },
    ], f.ctx);
    expect(st.rejections.map((r) => r.reason)).toEqual(['no_cause', 'missing_cause']);
    expect(st.queue.map((q) => q.trigger.typeId)).toEqual(['family_emergency']);
  });
  it('merges two triggers about the same person in one week into one crisis', () => {
    const f = fixture();
    const st = emptyCrisisState();
    proposeTriggers(st, [
      { typeId: 'public_dispute', teamId: 1, subjectIds: [5, 6], causeEventIds: [cause(f)], date: day(10), severity: 2 },
      { typeId: 'losing_streak', teamId: 1, subjectIds: [6], causeEventIds: [cause(f)], date: day(11), severity: 3 },
    ], f.ctx);
    expect(st.queue).toHaveLength(1);
    expect(st.queue[0]!.trigger.subjectIds).toEqual([5, 6]);
    expect(st.queue[0]!.trigger.causeEventIds).toHaveLength(2);
  });
  it('does not merge when the merged subject list would break the guard', () => {
    const f = fixture({ people: [person(1, 'imported'), person(2)] });
    const st = emptyCrisisState();
    proposeTriggers(st, [
      { typeId: 'off_field_incident', teamId: 1, subjectIds: [2], causeEventIds: [], date: day(10), severity: 4 },
      { typeId: 'public_dispute', teamId: 1, subjectIds: [1, 2], causeEventIds: [cause(f)], date: day(10), severity: 1 },
    ], f.ctx);
    expect(st.queue).toHaveLength(2);
  });
  it('drops a queued trigger after the queue weeks unless its cause still holds', () => {
    const f = fixture();
    // No room to open anything, so only the queue rule acts.
    const shut = JSON.parse(JSON.stringify(CATALOGUE)) as CrisisCatalogue;
    (shut.pacing.maxOpen as { value: number }).value = 0;
    const ctx = { ...f.ctx, catalogue: shut };
    const st = emptyCrisisState();
    const a: Trigger = { typeId: 'public_dispute', teamId: 1, subjectIds: [5], causeEventIds: [cause(f)], date: day(0), severity: 1 };
    const b: Trigger = { typeId: 'public_dispute', teamId: 1, subjectIds: [6], causeEventIds: [cause(f)], date: day(0), severity: 1 };
    proposeTriggers(st, [a, b], ctx);
    f.holding.add(triggerKey(b));
    crisisWeek(st, 1, day(28), ctx);
    expect(st.queue).toHaveLength(2);
    crisisWeek(st, 1, day(35), ctx);
    expect(st.queue.map((q) => q.trigger.subjectIds[0])).toEqual([6]);
  });
  it('1,000 seasons: never more than two open per team (three when the room is lost), never two new in a week', () => {
    for (const lost of [false, true]) {
      const f = fixture({ seed: lost ? 99 : 98 });
      f.roomLost = lost;
      const st = emptyCrisisState();
      const s = streams(5)(['soak', lost ? 1 : 0]);
      let maxOpen = 0;
      let opened = 0;
      for (let season = 0; season < 1000; season++) {
        for (let w = 0; w < 26; w++) {
          const d = day(w * 7, 2000 + season);
          const triggers: Trigger[] = [];
          const n = s.int(0, 3);
          for (let k = 0; k < n; k++) triggers.push({ typeId: s.chance(0.5) ? 'public_dispute' : 'losing_streak', teamId: 1, subjectIds: [s.int(1, 60)], causeEventIds: [cause(f)], date: d });
          if (s.chance(0.1)) triggers.push({ typeId: 'off_field_incident', teamId: 1, subjectIds: [s.int(1, 60)], causeEventIds: [], date: d });
          proposeTriggers(st, triggers, f.ctx);
          const r = crisisWeek(st, 1, d, f.ctx);
          expect(r.opened.length).toBeLessThanOrEqual(CATALOGUE.pacing.newPerTeamPerWeek.value);
          opened += r.opened.length;
          maxOpen = Math.max(maxOpen, st.open.length);
        }
      }
      expect(maxOpen).toBeLessThanOrEqual(openLimit(CATALOGUE, lost));
      expect(maxOpen).toBe(openLimit(CATALOGUE, lost));
      expect(opened).toBeGreaterThan(1000);
    }
  });
});

describe('stages, closing and the record (L9.1.1, L9.3.2)', () => {
  it('runs stages on clocks, closes at the last stage and writes a history entry with acts', () => {
    const f = fixture();
    const st = emptyCrisisState();
    const c1 = cause(f);
    proposeTriggers(st, [{ typeId: 'public_dispute', teamId: 1, subjectIds: [5], causeEventIds: [c1], date: day(0), severity: 2 }], f.ctx);
    crisisWeek(st, 1, day(0), f.ctx);
    expect(st.open).toHaveLength(1);
    const id = st.open[0]!.id;
    expect(st.open[0]!.stageId).toBe('seen');
    for (let w = 1; w < 4 && st.open.length > 0; w++) crisisWeek(st, 1, day(w * 7), f.ctx);
    expect(st.open).toHaveLength(0);
    const h = st.history.find((x) => x.crisisId === id)!;
    expect(h.timeline.map((e) => e.kind)).toEqual(['opened', 'stage', 'stage', 'stage', 'closed']);
    expect(f.sink.ofType(CRISIS_EVENT.closed)).toHaveLength(1);
    linkOutcome(st, id, 777);
    expect(st.history[0]!.linkedOutcomes).toEqual([777]);
  });
  it('closing with the cause still holding leaves the trigger armed (and does not grade anything)', () => {
    const f = fixture();
    const st = emptyCrisisState();
    const t: Trigger = { typeId: 'losing_streak', teamId: 1, subjectIds: [5], causeEventIds: [cause(f)], date: day(0), severity: 3 };
    f.holding.add(triggerKey(t));
    proposeTriggers(st, [t], f.ctx);
    crisisWeek(st, 1, day(0), f.ctx);
    const orders = closeCrisis(st, st.open[0]!.id, day(3), f.ctx);
    expect(orders.some((o) => o.kind === 'trigger_armed')).toBe(true);
    expect(orders.some((o) => o.kind === 'culture_precedent')).toBe(true);
    expect(JSON.stringify(st)).not.toMatch(/score"|grade|points|currency/);
  });
  it('a stage with no clock waits for its owner (portal before the window)', () => {
    const f = fixture({ level: 'college' });
    const st = emptyCrisisState();
    proposeTriggers(st, [{ typeId: 'portal_exodus', teamId: 1, subjectIds: [5, 6], causeEventIds: [cause(f)], date: day(0) }], f.ctx);
    crisisWeek(st, 1, day(0), f.ctx);
    crisisWeek(st, 1, day(70), f.ctx);
    expect(st.open[0]!.stageId).toBe('before_window');
    advanceCrisis(st, st.open[0]!.id, day(71), f.ctx);
    expect(st.open[0]!.stageId).toBe('window');
  });
  it('refuses a type whose levels do not include the team rule set', () => {
    const f = fixture({ level: 'pro' });
    const st = emptyCrisisState();
    proposeTriggers(st, [{ typeId: 'portal_exodus', teamId: 1, subjectIds: [5], causeEventIds: [cause(f)], date: day(0) }], f.ctx);
    expect(st.rejections[0]!.reason).toBe('level');
  });
  it('is deterministic for the same seed', () => {
    const run = () => {
      const f = fixture({ seed: 1234 });
      const st = emptyCrisisState();
      for (let w = 0; w < 40; w++) {
        proposeTriggers(st, [{ typeId: 'public_dispute', teamId: 1, subjectIds: [w % 7 + 1], causeEventIds: [cause(f)], date: day(w * 7) }], f.ctx);
        crisisWeek(st, 1, day(w * 7), f.ctx);
      }
      return JSON.stringify({ st, ev: f.sink.events });
    };
    expect(run()).toBe(run());
  });
});

describe('hazards from history (L9.2.1 through the G-32 row)', () => {
  it('uses the catalogue arrest rate and takes no win-loss input', () => {
    const t = crisisType(CATALOGUE, 'off_field_incident');
    expect(offFieldWeekly(t, { stress: 0, offFieldRisk: 1 })).toBeCloseTo(0.029 / compliance.weeksPerYear(), 10);
    expect(offFieldWeekly(t, { stress: 200, offFieldRisk: 1 })).toBeCloseTo(2 * 0.029 / compliance.weeksPerYear(), 10);
    // The input type has only stress and risk: a record or streak cannot reach it.
    expect(offFieldWeekly.length).toBe(2);
  });
  it('a 53-man generated roster at mean values averages about 1.5 incidents a club-season (the bible: about 1.6)', () => {
    const roster: HazardPerson[] = Array.from({ length: 53 }, (_, i) => ({ ...person(i + 1), stress: 0, offFieldRisk: 1 }));
    const seasons = 300;
    let n = 0;
    const weeks = Math.round(compliance.weeksPerYear());
    for (let y = 0; y < seasons; y++) for (let w = 0; w < weeks; w++) {
      n += drawOutsideTriggers(CATALOGUE, 1, roster, day(w * 7, 1900 + y), streams(21)).filter((x) => x.typeId === 'off_field_incident').length;
    }
    const perSeason = n / seasons;
    expect(perSeason).toBeGreaterThan(1.3);
    expect(perSeason).toBeLessThan(1.8);
  });
});
