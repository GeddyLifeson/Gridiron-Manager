import { describe, expect, it } from 'vitest';
import { EventTypeDef, RuleKeyDef } from '@gm/schema';
import {
  CLASSES, COMPLIANCE_EVENT_TYPES, EVENT, P, PARAMS, RULE_KEYS, K, aiResponse, certifiedViolations, classProblems, commitAct,
  complianceWeek, decideViolation, detectionChance, detectionSources, ladderTier, openCase, resolveDueCases, selfReport,
  staffRequest, violationScore, warningFor, addWeeks, type ComplianceState, type Disposition, type Opportunity,
} from '../../src/compliance/index.ts';
import {
  COLLEGE_VALUES, D, DOLLAR, META, MemorySink, PRO_VALUES, act, ctx, emptyCompliance, party, realStreams, ruleSet, scripted,
} from './fixtures.ts';
import { ComplianceStateSchema, PenaltyOrderSchema } from './proposed-schemas.ts';
import classesJson from '../../src/compliance/classes.json' with { type: 'json' };

const pro = ruleSet(PRO_VALUES);
const college = ruleSet(COLLEGE_VALUES, 'college_fixture');
const never = scripted(() => false);
const always = scripted(() => true);

function commit(state: ComplianceState, a: Parameters<typeof act>[0], sink = new MemorySink(), rules = pro) {
  const r = commitAct(state, act(a), rules, sink);
  if (!r.ok) throw new Error(r.reason);
  return { state: r.state, row: r.row, sink };
}

describe('catalogue (L8.2.5 class table, T9.5.1, I11.8.1, K7.7.1)', () => {
  it('every row is valid and ids are unique', () => {
    expect(CLASSES.length).toBe(classesJson.classes.length);
    for (const r of classesJson.classes) expect(classProblems(r)).toEqual([]);
    expect(classProblems({ ...classesJson.classes[0], body: 'mars' })).not.toEqual([]);
    expect(classProblems({ ...classesJson.classes[0], extra: 1 })).not.toEqual([]);
  });
  it('covers every class the bible names', () => {
    const need = [
      'work_rules_practice', 'injury_report_shading', 'tampering_players', 'tampering_coaches', 'signal_recording', 'cap_circumvention',
      'media_policy', 'recruiting_contact', 'countable_hours', 'eligibility_academic', 'medical_clearance', 'union_retaliation', 'camp_fine_waiver',
      'feigned_injury', 'concussion_protocol', 'sideline_technology', 'ball_tampering', 'crowd_noise', 'sideline_interference',
      'transfer_tampering', 'pay_rules', 'roster_limit', 'failure_to_cooperate',
    ];
    expect(CLASSES.map((c) => c.id).sort()).toEqual([...need].sort());
  });
  it('K2.8.2: at z = never_z no class can pass for any gain or pressure', () => {
    const maxGainTerm = P('gain_cap') * (1 + P('pressure_cap'));
    for (const c of CLASSES) expect(c.threshold.t0 + c.threshold.t1 * P('never_z')).toBeGreaterThan(maxGainTerm);
  });
  it('rule keys and event types follow the contract', () => {
    for (const k of RULE_KEYS) RuleKeyDef.parse(k);
    expect(new Set(RULE_KEYS.map((k) => k.key)).size).toBe(RULE_KEYS.length);
    for (const t of COMPLIANCE_EVENT_TYPES) { EventTypeDef.parse(t); expect(t.importedAllowed).toBe(false); }
    expect(new Set(PARAMS.params.map((p) => p.name)).size).toBe(PARAMS.params.length);
    for (const p of PARAMS.params) { expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
  });
});

describe('warn and log (steps 1 to 3)', () => {
  it('the warning always offers both choices; known amounts, else league default', () => {
    const w = warningFor('signal_recording', 'head_coach', pro);
    expect(w.choices).toEqual(['go_back', 'do_it_anyway']);
    expect(w.personFineFirstCents).toBe(500_000 * DOLLAR);
    expect(w.pickRoundFirst).toBe(1);
    const e = warningFor('tampering_coaches', 'head_coach', pro);
    expect(e.penaltyText).toBe('league_default');
    expect(e.personFineFirstCents).toBeNull();
  });
  it('one act writes exactly one row and one hidden event', () => {
    const { state, sink } = commit(emptyCompliance(), { classId: 'work_rules_practice', knew: [20, 21] });
    expect(state.log).toHaveLength(1);
    expect(sink.events).toHaveLength(1);
    const e = sink.events[0]!;
    expect(e.type).toBe(EVENT.committed);
    expect(e.witnesses).toEqual({ kind: 'people', personIds: [10] });
    ComplianceStateSchema.parse(state);
  });
  it('the user, generated and designed people may act; an imported AI person never does', () => {
    for (const origin of ['user', 'generated', 'designed'] as const) {
      expect(commitAct(emptyCompliance(), act({ classId: 'signal_recording', actor: party(10, 'head_coach', 1, origin) }), pro, new MemorySink()).ok).toBe(true);
    }
    const r = commitAct(emptyCompliance(), act({ classId: 'signal_recording', actor: party(10, 'head_coach', 1, 'imported') }), pro, new MemorySink());
    expect(r).toMatchObject({ ok: false, reason: 'protected_person' });
  });
  it('a class absent from the rule set is not a violation there (by key, never a level word)', () => {
    const r = commitAct(emptyCompliance(), act({ classId: 'recruiting_contact' }), pro, new MemorySink());
    expect(r).toMatchObject({ ok: false, reason: 'class_not_in_rule_set' });
    expect(commitAct(emptyCompliance(), act({ classId: 'recruiting_contact' }), college, new MemorySink()).ok).toBe(true);
  });
  it('certified mode lists every act, detected or not', () => {
    const { state } = commit(emptyCompliance(), { classId: 'tampering_players', actor: party(5, 'head_coach', 1, 'user') });
    expect(certifiedViolations(state, 5)).toHaveLength(1);
  });
});

describe('detection (step 4)', () => {
  it('an empty knew list and no trace gives zero chance from people sources', () => {
    const { row } = commit(emptyCompliance(), { classId: 'cap_circumvention', knew: [] });
    const s = detectionSources(row, ctx({ rules: pro }));
    expect(s.filter((x) => x.source.startsWith('knower') || x.source === 'rival')).toEqual([]);
    expect(s.map((x) => x.source)).toEqual(['inspection']);
  });
  it('the user and an AI person with the same act get the same chance', () => {
    const c = ctx({ rules: pro, complianceStrictness: () => 40, mediaLeakWeekly: () => 0.01 });
    const a = commit(emptyCompliance(), { classId: 'signal_recording', knew: [20, 21], actor: party(10, 'head_coach', 1, 'user') }).row;
    const b = commit(emptyCompliance(), { classId: 'signal_recording', knew: [20, 21], actor: party(10, 'head_coach', 1, 'generated') }).row;
    expect(detectionChance(a, c)).toBe(detectionChance(b, c));
    expect(detectionChance(a, c)).toBeGreaterThan(0);
  });
  it('a knower with a grievance talks at double the base; actor and orderer never count', () => {
    const { row } = commit(emptyCompliance(), { classId: 'tampering_players', knew: [10, 30, 31], orderedBy: party(30, 'owner') });
    const plain = detectionSources(row, ctx({ rules: pro })).find((s) => s.source === 'knower:31')!;
    const grudge = detectionSources(row, ctx({ rules: pro, grievance: (k) => k === 31 })).find((s) => s.source === 'knower:31')!;
    expect(grudge.p).toBeCloseTo(plain.p * P('grievance_multiplier'));
    expect(detectionSources(row, ctx({ rules: pro })).some((s) => s.source === 'knower:10' || s.source === 'knower:30')).toBe(false);
  });
  it('a written record makes detection certain; per-act inspection and union visits draw once', () => {
    const { row } = commit(emptyCompliance(), { classId: 'medical_clearance', certainTrace: true });
    expect(detectionChance(row, ctx({ rules: pro }))).toBe(1);
    const w = commit(emptyCompliance(), { classId: 'work_rules_practice' }).row;
    const first = detectionSources(w, ctx({ rules: pro })).map((s) => s.source);
    expect(first).toEqual(expect.arrayContaining(['inspection', 'union_visit']));
    expect(detectionChance({ ...w, actSourcesDrawn: true }, ctx({ rules: pro }))).toBe(0);
  });
  it('rows outside the detection window are never drawn', () => {
    const sink = new MemorySink();
    let { state } = commit(emptyCompliance(), { classId: 'tampering_players', date: D(2020, 0) }, sink);
    state = complianceWeek(state, D(2026, 0), [], ctx({ rules: pro, enforcement: always }), sink, META);
    expect(state.cases).toHaveLength(0);
  });
});

describe('penalties (step 5)', () => {
  const found = (enf = never) => ctx({ rules: pro, enforcement: enf });
  function detectAndResolve(state: ComplianceState, rowId: number, date: ReturnType<typeof D>, c = found(), sink = new MemorySink()) {
    const o = openCase(state, state.log.find((r) => r.id === rowId)!.actor.teamId, [rowId], date, c, sink, META);
    return resolveDueCases(o.state, addWeeks(date, P('case_weeks_major')), c, sink, META);
  }

  it('C11.2.4 acceptance: a first spring finding fines the coach $100,000 and removes the next OTA week', () => {
    const { state, row } = commit(emptyCompliance(), { classId: 'work_rules_practice' });
    const s = detectAndResolve(state, row.id, D(2026, 110));
    const orders = s.orders.map((o) => o.order);
    for (const o of orders) PenaltyOrderSchema.parse(o);
    expect(orders).toContainEqual({ kind: 'fine', party: { kind: 'person', id: 10 }, cents: 100_000 * DOLLAR, tier: null, mayBeRepaidByClub: false });
    expect(orders).toContainEqual({ kind: 'fine', party: { kind: 'team', id: 1 }, cents: 250_000 * DOLLAR, tier: null, mayBeRepaidByClub: true });
    expect(orders).toContainEqual({ kind: 'practice_cancelled', teamId: 1, what: 'ota_week' });
    expect(orders.some((o) => o.kind === 'pick_forfeit')).toBe(false);
    ComplianceStateSchema.parse(s);
  });
  it('a second finding in the league year escalates and costs a fourth-round pick', () => {
    let { state, row } = commit(emptyCompliance(), { classId: 'work_rules_practice' });
    state = detectAndResolve(state, row.id, D(2026, 110));
    const second = commit(state, { classId: 'work_rules_practice', date: D(2026, 120) });
    const before = second.state.orders.length;
    const s = detectAndResolve(second.state, second.row.id, D(2026, 125));
    const orders = s.orders.slice(before).map((o) => o.order);
    expect(orders).toContainEqual(expect.objectContaining({ kind: 'fine', party: { kind: 'person', id: 10 }, cents: 250_000 * DOLLAR }));
    expect(orders).toContainEqual(expect.objectContaining({ kind: 'fine', party: { kind: 'team', id: 1 }, cents: 500_000 * DOLLAR }));
    expect(orders).toContainEqual({ kind: 'pick_forfeit', teamId: 1, round: 4 });
  });
  it('commissioner discretion halves a first-offence fine when its draw passes', () => {
    const { state, row } = commit(emptyCompliance(), { classId: 'work_rules_practice' });
    const s = detectAndResolve(state, row.id, D(2026, 110), found(scripted((sc) => sc[0] === 'commissioner')));
    expect(s.orders.map((o) => o.order)).toContainEqual(expect.objectContaining({ party: { kind: 'person', id: 10 }, cents: 50_000 * DOLLAR }));
  });
  it('the same act by the user and by an AI coach yields the same orders', () => {
    const run = (origin: 'user' | 'generated') => {
      const { state, row } = commit(emptyCompliance(), { classId: 'signal_recording', actor: party(10, 'head_coach', 1, origin) });
      return detectAndResolve(state, row.id, D(2026, 110), found(realStreams(9, 'enforcement'))).orders;
    };
    expect(run('user')).toEqual(run('generated'));
  });
  it('fines follow the role column (I11.8.1 feigned injury)', () => {
    const { state, row } = commit(emptyCompliance(), { classId: 'feigned_injury', actor: party(11, 'position_coach'), orderedBy: party(10, 'head_coach') });
    const orders = detectAndResolve(state, row.id, D(2026, 110)).orders.map((o) => o.order);
    expect(orders).toContainEqual(expect.objectContaining({ party: { kind: 'person', id: 11 }, cents: 50_000 * DOLLAR }));
    expect(orders).toContainEqual(expect.objectContaining({ party: { kind: 'person', id: 10 }, cents: 100_000 * DOLLAR }));
    expect(orders).toContainEqual(expect.objectContaining({ party: { kind: 'team', id: 1 }, cents: 350_000 * DOLLAR }));
  });
  it('empty penalty keys use the default ladder and never invent a dollar figure', () => {
    const { state, row } = commit(emptyCompliance(), { classId: 'tampering_coaches' });
    const orders = detectAndResolve(state, row.id, D(2026, 110)).orders.map((o) => o.order);
    expect(orders).toEqual([{ kind: 'fine', party: { kind: 'person', id: 10 }, cents: null, tier: 'fine_tier_2', mayBeRepaidByClub: false }]);
    expect(ladderTier('major', false, true)).toBe('fine_tier_1');
    expect(ladderTier('minor', false, true)).toBe('warning');
  });
  it('college: the head coach answers for an assistant; monitoring shortens his suspension', () => {
    const hc = party(10, 'head_coach');
    const run = (monitoring: number) => {
      const c = ctx({ rules: college, enforcement: never, headCoachOf: () => hc, monitoring: () => monitoring });
      const { state, row } = commit(emptyCompliance(), { classId: 'recruiting_contact', actor: party(12, 'recruiter'), severity: 'major' }, new MemorySink(), college);
      const o = openCase(state, 1, [row.id], D(2026, 110), c, new MemorySink(), META);
      return resolveDueCases(o.state, addWeeks(D(2026, 110), P('case_weeks_major')), c, new MemorySink(), META).orders.map((x) => x.order);
    };
    const poor = run(0);
    expect(poor).toContainEqual({ kind: 'suspension', personId: 10, games: 4 });
    expect(poor).toContainEqual({ kind: 'suspension', personId: 12, games: 4 });
    expect(poor).toContainEqual({ kind: 'show_cause', personId: 12, years: 6 });
    expect(poor).toContainEqual({ kind: 'probation', teamId: 1, years: 3 });
    expect(run(100)).toContainEqual({ kind: 'suspension', personId: 10, games: 2 });
  });
  it('an imported head coach is never named; the program still takes its penalty', () => {
    const c = ctx({ rules: college, enforcement: never, headCoachOf: () => party(10, 'head_coach', 1, 'imported') });
    const sink = new MemorySink();
    const { state, row } = commit(emptyCompliance(), { classId: 'recruiting_contact', actor: party(12, 'recruiter'), severity: 'major' }, sink, college);
    const o = openCase(state, 1, [row.id], D(2026, 110), c, sink, META);
    const s = resolveDueCases(o.state, addWeeks(D(2026, 110), P('case_weeks_major')), c, sink, META);
    expect(JSON.stringify(s.orders)).not.toContain('"personId":10');
    expect(s.record.some((e) => e.party.kind === 'person' && e.party.id === 10)).toBe(false);
    expect(s.orders.map((x) => x.order)).toContainEqual({ kind: 'probation', teamId: 1, years: 3 });
    for (const e of sink.events) expect(e.actors.some((a) => a.personId === 10)).toBe(false);
  });
  it('self-reporting lowers the tier and the events run inquiry, detected, penalty', () => {
    const sink = new MemorySink();
    const c = ctx({ rules: pro, enforcement: never });
    let { state, row } = commit(emptyCompliance(), { classId: 'tampering_coaches' }, sink);
    state = selfReport(state, row.id, D(2026, 110), c, sink, META).state;
    state = resolveDueCases(state, addWeeks(D(2026, 110), P('case_weeks_major')), c, sink, META);
    expect(state.orders.map((o) => o.order)).toContainEqual(expect.objectContaining({ kind: 'fine', tier: 'fine_tier_1' }));
    expect(sink.events.map((e) => e.type)).toEqual([EVENT.committed, EVENT.inquiry, EVENT.detected, EVENT.penalty]);
    expect(sink.ofType(EVENT.detected)[0]!.causeId).toBe(row.eventId);
  });
  it('an inquiry with nothing behind it closes with no finding and no penalty', () => {
    const sink = new MemorySink();
    const c = ctx({ rules: pro, enforcement: never });
    let s = openCase(emptyCompliance(), 3, [], D(2026, 10), c, sink, META).state;
    s = resolveDueCases(s, D(2027, 10), c, sink, META);
    expect(s.orders).toEqual([]);
    expect(s.cases[0]!.outcome).toBe('no_finding');
    expect(sink.ofType(EVENT.closed)).toHaveLength(1);
    expect(aiResponse(P('candor_cooperate_min'))).toBe('cooperate');
  });
});

describe('AI decision K2.8.2 and staff requests K6.6.1', () => {
  const opp = (gain: number): Opportunity => ({ classId: 'recruiting_contact', gain, pDetectPerceived: 0.1, penaltyPerceived: 0.5 });
  const disp = (z: number, pressure = 0, over: Partial<Disposition> = {}): Disposition => ({ personId: 7, origin: 'generated', ruleRespectZ: z, riskTolerance: 50, candor: 50, pressure, ...over });

  it('nothing passes at z of +1.5 or more, for any gain and pressure', () => {
    for (let g = 0; g <= 1; g += 0.05) for (let p = 0; p <= 1; p += 0.05) expect(violationScore(opp(g), disp(P('never_z'), p))).toBeLessThan(0);
  });
  it('commits fall with ruleRespect and rise with pressure, over a population', () => {
    const z = realStreams(4, 'population');
    const count = (pressure: number, zShift: number) => {
      let n = 0;
      for (let i = 0; i < 4000; i += 1) {
        const r = z(['p', i]);
        const d = disp(r.normal() + zShift, pressure, { personId: i + 1 });
        if (decideViolation(emptyCompliance(), opp(r.uniform()), d, D(2026, 1), realStreams(5, 'conduct')).commit) n += 1;
      }
      return n;
    };
    const base = count(0.2, 0);
    expect(count(0.2, 0.8)).toBeLessThan(base);
    expect(count(0.9, 0)).toBeGreaterThan(base);
    expect(base).toBeGreaterThan(0);
  });
  it('an imported person never decides to violate; the cooldown stops repeats except for the floor-chance slip', () => {
    expect(decideViolation(emptyCompliance(), opp(1), disp(-3, 1, { origin: 'imported' }), D(2026, 1), always)).toMatchObject({ commit: false, reason: 'protected_person' });
    const { state } = commit(emptyCompliance(), { classId: 'recruiting_contact', actor: party(7, 'recruiter'), date: D(2026, 1) }, new MemorySink(), college);
    // A3.1 ruling 22: inside the cooldown only the floor-chance slip draw remains, so a draw that misses it is a cooldown and one that hits it commits.
    expect(decideViolation(state, opp(1), disp(-3, 1), D(2026, 8), never).reason).toBe('cooldown');
    expect(decideViolation(state, opp(1), disp(-3, 1), D(2026, 8), always).reason).toBe('commit');
  });
  it('a request to a high-ruleRespect assistant is refused over 90 percent of the time', () => {
    let refused = 0;
    const N = 1000;
    const pop = realStreams(6, 'population');
    for (let i = 0; i < N; i += 1) {
      const d = disp(1.5 + Math.abs(pop(['s', i]).normal()) * 0.5, 0.5, { personId: i + 1, candor: 80 });
      const out = staffRequest(emptyCompliance(), opp(0.8), d, D(2026, 1), realStreams(7, 'conduct'));
      if (out.outcome !== 'complied') refused += 1;
    }
    expect(refused / N).toBeGreaterThan(0.9);
  });
  it('low-ruleRespect staff under pressure act without any request', () => {
    let n = 0;
    for (let i = 0; i < 200; i += 1) if (decideViolation(emptyCompliance(), opp(0.9), disp(-1.5, 0.8, { personId: i + 1 }), D(2026, 1), realStreams(8, 'conduct')).commit) n += 1;
    expect(n).toBeGreaterThan(0);
  });
});

describe('long run (T9.5.2 acceptance, determinism)', () => {
  function world(seed: number) {
    const sink = new MemorySink();
    const c = ctx({ rules: pro, enforcement: realStreams(seed, 'enforcement'), respond: () => aiResponse(40) });
    let s = emptyCompliance();
    const teams = Array.from({ length: 20 }, (_, i) => i + 1);
    for (let year = 2026; year < 2056; year += 1) {
      // Teams 1 to 4 cheat quietly each season: no knowers, no trace.
      for (const t of teams.slice(0, 4)) {
        const r = commitAct(s, act({ classId: 'tampering_players', actor: party(100 + t, 'general_manager', t), date: D(year, 40) }), pro, sink);
        if (r.ok) s = r.state;
      }
      for (let w = 0; w < 52; w += 1) s = complianceWeek(s, D(year, w * P('days_per_week')), teams, c, sink, META);
    }
    return { s, sink };
  }
  it('clean programs are never penalised; some cheating is never caught; runs are deterministic', () => {
    const { s } = world(11);
    const penalisedTeams = new Set(s.orders.map((o) => ('teamId' in o.order ? o.order.teamId : o.order.kind === 'fine' || o.order.kind === 'warning' ? (o.order.party.kind === 'team' ? o.order.party.id : -1) : -1)));
    const punishedPeople = new Set(s.record.filter((e) => e.party.kind === 'person').map((e) => e.party.id));
    for (const t of [5, 6, 7, 8, 9, 10]) expect(penalisedTeams.has(t)).toBe(false);
    expect([...punishedPeople].every((p) => p >= 101 && p <= 104)).toBe(true);
    const undetected = s.log.filter((r) => r.caseId === null).length;
    expect(undetected).toBeGreaterThan(0);
    expect(s.record.length).toBeGreaterThan(0);
    ComplianceStateSchema.parse(s);
    expect(JSON.stringify(world(11).s)).toBe(JSON.stringify(s));
  });
});
