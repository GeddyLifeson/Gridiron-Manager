import { describe, expect, it } from 'vitest';
import { compliance } from '@gm/league';
import {
  drawWarnings, passOnChance, offeredActs, takeAct, ruleBreakingOffered, commitRuleBreaking, crisisWeek, closeCrisis, emptyCrisisState, proposeTriggers,
  portalTrigger, announcementDays, academicTrigger, investigationTrigger, emptyInvestigationIndex, noteInvestigation, investigationLengthDays,
  boosterRevoltDue, boosterTrigger, grantBoosterDemand, bossFiredTrigger, interimRecord, witnessedItem, resolveWitness, transferWindow, coachChangeWindow, staffMustReport,
  CRISIS_EVENT, type Channel, type PendingTrigger, type WitnessedMatter,
} from '../../src/crisis/index.ts';
import { ACTS, CATALOGUE, MemorySink, cause, day, fixture, person, ruleSet, streams } from './fixtures.ts';

describe('L9.1.3 early warning', () => {
  const pending = (i: number): PendingTrigger => ({ key: `p${i}`, teamId: 1, aboutId: i, health: false, fires: day(40) });
  const rate = (channels: (i: number) => Channel[]) => {
    let warned = 0;
    let falseAlarms = 0;
    let total = 0;
    for (let i = 1; i <= 4000; i++) {
      const w = drawWarnings(CATALOGUE, pending(i), channels(i), () => 50, [9001, 9002, 9003], day(30), streams(17));
      if (w.some((x) => !x.falseAlarm)) warned++;
      falseAlarms += w.filter((x) => x.falseAlarm).length;
      total += w.length;
    }
    return { share: warned / 4000, falseShare: total ? falseAlarms / total : 0 };
  };
  it('with every trust at 20 and no council, fewer than 10 percent of triggers produce a warning', () => {
    const r = rate((i) => [{ kind: 'open_door', personId: i, trust: 20, openDoorThisWeek: true }, { kind: 'council', personId: 5000 + i, trust: 20, councilMetOn: null }]);
    expect(r.share).toBeLessThan(0.1);
  });
  it('with trust at 80 and a council that met, more than half do; about 10 percent of warnings are false alarms', () => {
    const r = rate((i) => [{ kind: 'council', personId: 5000 + i, trust: 80, councilMetOn: day(25) }, { kind: 'open_door', personId: i, trust: 80, openDoorThisWeek: true }]);
    expect(r.share).toBeGreaterThan(0.5);
    expect(r.falseShare).toBeGreaterThan(0.06);
    expect(r.falseShare).toBeLessThan(0.14);
  });
  it('reads each channel by its own rule', () => {
    expect(passOnChance({ kind: 'council', personId: 1, trust: 80, councilMetOn: day(0) }, { health: false }, day(30))).toBe(0);
    expect(passOnChance({ kind: 'open_door', personId: 1, trust: 70, openDoorThisWeek: true }, { health: false }, day(30))).toBeCloseTo(0.5);
    expect(passOnChance({ kind: 'medical', personId: 1 }, { health: true }, day(30))).toBe(0.9);
    expect(passOnChance({ kind: 'medical', personId: 1 }, { health: false }, day(30))).toBe(0);
    expect(passOnChance({ kind: 'position_coach', personId: 1, reportUp: 1 }, { health: false }, day(30))).toBe(0.95);
    expect(passOnChance({ kind: 'reporter', personId: 1, goodwillBand: 3 }, { health: false }, day(30))).toBe(0);
  });
  it('no warning exists without a pending trigger: no channels, no warnings', () => {
    expect(drawWarnings(CATALOGUE, pending(1), [], () => 50, [2, 3], day(30), streams(1))).toEqual([]);
  });
});

describe('L9.3.1 response choices', () => {
  const open = (typeId = 'off_field_incident', severity = 2) => {
    const f = fixture();
    const st = emptyCrisisState();
    const causeIds = typeId === 'off_field_incident' ? [] : [cause(f)];
    proposeTriggers(st, [{ typeId, teamId: 1, subjectIds: [5], causeEventIds: causeIds, date: day(0), severity }], f.ctx);
    crisisWeek(st, 1, day(0), f.ctx);
    return { f, st, c: st.open[0]! };
  };
  it('offers the row acts; an act above his authority becomes an ask', () => {
    const { f, c } = open();
    const all = offeredActs(c, f.ctx, ACTS, new Set(['discipline', 'roster', 'staff']));
    expect(all.every((o) => o.mode === 'do')).toBe(true);
    const assistant = offeredActs(c, f.ctx, ACTS, new Set());
    expect(assistant.find((o) => o.act.id === 'apply_discipline')!.mode).toBe('ask');
    expect(assistant.find((o) => o.act.id === 'talk_private')!.mode).toBe('do');
  });
  it('each act maps to exactly one owning-system event and spends nothing', () => {
    const { f, st, c } = open();
    for (const o of offeredActs(c, f.ctx, ACTS, new Set(['discipline', 'roster', 'staff']))) {
      const orders = takeAct(st, c.id, { actId: o.act.id, targetIds: [5] }, day(0), f.ctx, ACTS, new Set(['discipline', 'roster', 'staff']));
      expect(orders.filter((x) => x.kind === 'owner_event')).toHaveLength(1);
      expect(JSON.stringify(orders)).not.toMatch(/currency|points|score/);
    }
  });
  it('telling the boss before the stage reaches him is remembered; letting him find out is too', () => {
    const told = open();
    const o1 = takeAct(told.st, told.c.id, { actId: 'inform_upstairs', targetIds: [] }, day(0), told.f.ctx, ACTS, new Set());
    expect(o1.some((x) => x.kind === 'group_memory' && x.group === 'upstairs' && x.memoryClass === 'told_before_found_out')).toBe(true);
    const r1 = crisisWeek(told.st, 1, day(7), told.f.ctx);
    expect(r1.orders.some((x) => x.kind === 'group_memory' && x.group === 'upstairs' && x.memoryClass === 'found_out_elsewhere')).toBe(false);

    const silent = open();
    const r2 = crisisWeek(silent.st, 1, day(7), silent.f.ctx);
    expect(r2.orders.some((x) => x.kind === 'group_memory' && x.group === 'upstairs' && x.memoryClass === 'found_out_elsewhere')).toBe(true);
  });
  it('a statement the truth record contradicts becomes "lied to and found out" when the crisis closes', () => {
    const { f, st, c } = open('public_dispute');
    takeAct(st, c.id, { actId: 'address_team', targetIds: [], truthful: false }, day(0), f.ctx, ACTS, new Set());
    const orders = closeCrisis(st, c.id, day(2), f.ctx);
    expect(orders.some((x) => x.kind === 'group_memory' && x.memoryClass === 'lied_to_found_out' && x.group === 'team')).toBe(true);
  });
  it('refuses an act the crisis does not offer', () => {
    const { f, st, c } = open('public_dispute');
    expect(() => takeAct(st, c.id, { actId: 'give_time_off', targetIds: [] }, day(0), f.ctx, ACTS, new Set())).toThrow(/not offered/);
  });
  it('rule-breaking responses are offered with a warning and run through the G-28 pipeline; imported actors are refused there', () => {
    const { f, st, c } = open('injury_to_star', 3);
    const rb = ruleBreakingOffered(ACTS, 'injury_to_star');
    expect(rb.map((r) => r.id)).toEqual(['shade_report']);
    expect(rb.every((r) => r.warned)).toBe(true);
    const sink = new MemorySink();
    const act = (origin: 'generated' | 'imported'): compliance.Act => ({
      classId: 'injury_report_shading', actor: { personId: 900, role: 'head_coach', teamId: 1, origin }, orderedBy: null, knew: [], date: day(1),
      competitionId: null, gain: 0.5, tier: 1, source: 'user',
    });
    const ok = commitRuleBreaking(st, c.id, 'shade_report', act('generated'), compliance.emptyCompliance(), ruleSet({}), sink, ACTS);
    expect(ok.ok).toBe(true);
    const no = commitRuleBreaking(st, c.id, 'shade_report', act('imported'), compliance.emptyCompliance(), ruleSet({}), sink, ACTS);
    expect(no.ok).toBe(false);
    expect(() => commitRuleBreaking(st, c.id, 'shade_report', { ...act('generated'), classId: 'pay_rules' }, compliance.emptyCompliance(), ruleSet({}), sink, ACTS)).toThrow();
    void f;
  });
});

describe('L9.4 college crises', () => {
  it('portal exodus opens only past the catalogue share, from each player\'s own leaning', () => {
    const lean = (n: number, p: number) => Array.from({ length: n }, (_, i) => ({ personId: i + 1, leave: p }));
    expect(portalTrigger(CATALOGUE, 1, lean(85, 0.1), 85, [1], day(0))).toBeNull();
    const t = portalTrigger(CATALOGUE, 1, lean(85, 0.2), 85, [1], day(0))!;
    expect(t.typeId).toBe('portal_exodus');
  });
  it('spreads announcements: no day carries more than the configured share', () => {
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    const days = announcementDays(ids, 15, 1, streams(4));
    const perDay = new Map<number, number>();
    for (const d of days.values()) perDay.set(d, (perDay.get(d) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(5);
    expect(days.size).toBe(20);
  });
  it('reads window dates from rule data only', () => {
    expect(transferWindow(ruleSet({}))).toBeNull();
    expect(transferWindow(ruleSet({ 'transfer.window_start_day': 120, 'transfer.window_days': 15 }))).toEqual({ startDay: 120, days: 15 });
    expect(coachChangeWindow(ruleSet({ 'transfer.coach_change_window_days': 15, 'transfer.coach_change_window_delay_days': 5 }), 300)).toEqual({ startDay: 305, days: 15 });
    expect(staffMustReport(ruleSet({}))).toBe(false);
  });
  it('an imported player is never ruled academically ineligible', () => {
    expect(academicTrigger(1, person(1, 'imported'), [1], day(0))).toBeNull();
    expect(academicTrigger(1, person(2), [1], day(0))!.typeId).toBe('academic_ineligibility');
  });
  it('exactly one investigation per major case, none for minor, imported-only or false cases', () => {
    const comp: compliance.ComplianceState = {
      ...compliance.emptyCompliance(),
      log: [
        { id: 1, classId: 'pay_rules', actor: { personId: 50, role: 'recruiter', teamId: 1, origin: 'generated' }, orderedBy: null, knew: [], date: day(0), competitionId: null, gain: 0.3, severity: 'major', certainTrace: false, actSourcesDrawn: true, caseId: 1, eventId: 1 },
        { id: 2, classId: 'recruiting_contact', actor: { personId: 51, role: 'recruiter', teamId: 1, origin: 'generated' }, orderedBy: null, knew: [], date: day(0), competitionId: null, gain: 0.3, severity: 'minor', certainTrace: false, actSourcesDrawn: true, caseId: 2, eventId: 2 },
        { id: 3, classId: 'pay_rules', actor: { personId: 52, role: 'recruiter', teamId: 1, origin: 'imported' }, orderedBy: null, knew: [], date: day(0), competitionId: null, gain: 0.3, severity: 'major', certainTrace: false, actSourcesDrawn: true, caseId: 3, eventId: 3 },
      ],
      cases: [1, 2, 3].map((id) => ({ id, teamId: 1, body: 'national_body' as const, rowIds: [id], opened: day(10), resolveBy: day(300), response: 'cooperate' as const, falseAccusation: false, status: 'open' as const, outcome: null })),
    };
    const idx = emptyInvestigationIndex();
    const t1 = investigationTrigger(idx, comp, 1, 99, day(10))!;
    expect(t1.subjectIds).toEqual([50]);
    noteInvestigation(idx, 1, 1);
    expect(investigationTrigger(idx, comp, 1, 99, day(11))).toBeNull();
    expect(investigationTrigger(idx, comp, 2, 99, day(11))).toBeNull();
    expect(investigationTrigger(idx, comp, 3, 99, day(11))).toBeNull();
    expect(investigationLengthDays(CATALOGUE)).toBeGreaterThan(330);
  });
  it('booster revolt opens only from four weeks below the floor; a granted demand always writes the precedent', () => {
    expect(boosterRevoltDue(CATALOGUE, [30, 20, 20, 20])).toBe(false);
    expect(boosterRevoltDue(CATALOGUE, [20, 20, 20, 20])).toBe(true);
    const f = fixture({ level: 'college' });
    const st = emptyCrisisState();
    proposeTriggers(st, [boosterTrigger(CATALOGUE, 1, [10, 10, 10, 10], 7, [cause(f)], day(0))!], f.ctx);
    crisisWeek(st, 1, day(0), f.ctx);
    const orders = grantBoosterDemand(st, st.open[0]!.id, 900, day(1));
    expect(orders.some((o) => o.kind === 'group_memory' && o.memoryClass === 'took_orders_from_donors' && o.amount === -8)).toBe(true);
    expect(orders.some((o) => o.kind === 'booster_mood' && o.delta === 10)).toBe(true);
  });
});

describe('L9.5 lower rungs', () => {
  it('a boss-fired event always opens for the lower-rung user, ahead of every queued crisis', () => {
    const f = fixture();
    const st = emptyCrisisState();
    proposeTriggers(st, [
      { typeId: 'losing_streak', teamId: 1, subjectIds: [10], causeEventIds: [cause(f)], date: day(0), severity: 4 },
      bossFiredTrigger(5, 1, cause(f), day(0)),
    ], f.ctx);
    crisisWeek(st, 1, day(0), f.ctx);
    expect(st.open.map((c) => c.typeId)).toEqual(['boss_fired']);
  });
  it('an interim stint writes results and never promotes by itself', () => {
    expect(interimRecord({ personId: 5, teamId: 1, from: day(0), to: day(60), wins: 5, losses: 1, ties: 0 }).automaticPromotion).toBe(false);
  });
  const matter = (over: Partial<WitnessedMatter> = {}): WitnessedMatter => ({
    key: 'm1', kind: 'boss_violation', teamId: 1, actorId: 20, victimId: null, grave: false, confidence: 0.8, logRowId: 3, bossId: 20, happened: true, ...over,
  });
  it('the item is visible to the user only, and never names an imported actor', () => {
    const sink = new MemorySink();
    const item = witnessedItem(5, matter(), { actor: person(20), victim: null }, day(0), true, sink, 1, 'sim')!;
    expect(sink.ofType(CRISIS_EVENT.witnessed)[0]!.witnesses).toEqual({ kind: 'people', personIds: [5] });
    expect(item.mustReport).toBe(true);
    expect(witnessedItem(5, matter(), { actor: person(20, 'imported'), victim: null }, day(0), true, sink, 1, 'sim')).toBeNull();
    expect(witnessedItem(5, matter({ kind: 'hazing', victimId: 21 }), { actor: person(20), victim: person(21, 'generated', true) }, day(0), true, sink, 1, 'sim')).toBeNull();
  });
  it('silence about a logged boss violation makes him a party; going over the boss protects him at a cost', () => {
    const sink = new MemorySink();
    const item = witnessedItem(5, matter(), { actor: person(20), victim: null }, day(0), true, sink, 1, 'sim')!;
    expect(resolveWitness(item, 'silent', false).partyIfSurfaces).toBe(true);
    const over = resolveWitness(item, 'over_head', false);
    expect(over.protectedInFinding).toBe(true);
    expect(over.orders.some((o) => o.kind === 'standing_with_boss' && o.delta < 0)).toBe(true);
    expect(resolveWitness(item, 'raise_with_person', false).orders).toEqual([{ kind: 'standing_with_boss', personId: 5, bossId: 20, delta: -10 }]);
    const unlogged = witnessedItem(5, matter({ logRowId: null }), { actor: person(20), victim: null }, day(0), true, sink, 1, 'sim')!;
    expect(resolveWitness(unlogged, 'silent', false).partyIfSurfaces).toBe(false);
  });
  it('the victim remembers who spoke up; a wrong report costs with the accused', () => {
    const sink = new MemorySink();
    const hz = witnessedItem(5, matter({ kind: 'hazing', actorId: 30, victimId: 31, grave: true, bossId: 40 }), { actor: person(30), victim: person(31) }, day(0), false, sink, 1, 'sim')!;
    const spoke = resolveWitness(hz, 'tell_boss', true);
    expect(spoke.orders.some((o) => o.kind === 'memory' && o.holderId === 31 && o.amount === 25 && o.memoryClass === 'spoke_up_touchstone')).toBe(true);
    expect(spoke.orders.some((o) => o.kind === 'standing_with_boss' && o.delta === 1)).toBe(true);
    const wrong = witnessedItem(5, matter({ kind: 'hazing', actorId: 30, victimId: 31, happened: false, bossId: 40 }), { actor: person(30), victim: person(31) }, day(0), false, sink, 1, 'sim')!;
    const w = resolveWitness(wrong, 'tell_boss', false);
    expect(w.orders.some((o) => o.kind === 'memory' && o.holderId === 30 && o.memoryClass === 'falsely_reported')).toBe(true);
    expect(w.orders.some((o) => o.kind === 'memory' && o.holderId === 40 && o.memoryClass === 'reported_wrongly')).toBe(true);
  });
});
