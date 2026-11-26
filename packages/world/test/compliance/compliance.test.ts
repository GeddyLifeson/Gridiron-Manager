import { describe, expect, it } from 'vitest';
import { compliance as league } from '@gm/league';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import * as compliance from '../../src/compliance/index.ts';

const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);
const binding: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy() };
const cb = compliance.complianceBindingFrom(binding, 'pro');

const proTeams = (w: loop.LiveWorld) => w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').map((t) => t.id);

function build(over: { facets?: Record<string, number> } = {}) {
  const w = loop.createWorld({ setup: setup({}), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
  if (over.facets) {
    for (const teamId of proTeams(w)) {
      const id = compliance.generalManagerOf(w, teamId)!;
      const p = w.people.get(id)!;
      w.people.set(id, { ...p, traitBlock: { ...p.traitBlock, facets: { ...p.traitBlock.facets, ...over.facets } } });
    }
  }
  const pro = proTeams(w).length;
  const col = w.teams.length - pro;
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(),
    cohorts: loop.cohortStep({
      scale: () => ({ topCollegeTeams: col, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 }),
      names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
    }),
    development: turnover.developmentStep(binding), moves: turnover.rosterMovesStep(binding), compliance: compliance.complianceStep(cb),
  }, 'test: not bound');
  return { w, sys };
}

describe('general managers in the world (K7.1.1, CR-G25-1 stand-in)', () => {
  const { w } = build();
  it('gives every pro club one general manager person, held in an off-ladder seat and employed', () => {
    const employed = loop.employedIds(w);
    for (const teamId of proTeams(w)) {
      const seats = [...w.offLadder.values()].filter((s) => s.teamId === teamId && s.positionId === compliance.GENERAL_MANAGER);
      expect(seats.length).toBe(1);
      const id = compliance.generalManagerOf(w, teamId)!;
      expect(id).toBe(seats[0]!.holderPersonId);
      expect(w.people.get(id)?.origin).toBe('generated');
      expect(w.status.get(id)).toBe('active');
      expect(employed.has(id)).toBe(true);
    }
  });

  it('has no pro general manager seat at a college program', () => {
    for (const t of w.teams.filter((x) => !proTeams(w).includes(x.id))) expect(compliance.generalManagerOf(w, t.id)).toBeNull();
  });

  it('keeps every off-ladder seat off the job rows, and every seat id once', () => {
    for (const id of w.offLadder.keys()) expect(w.jobs.has(id)).toBe(false);
  });
});

describe('compliance state in the live world (L8.2.5)', () => {
  it('starts empty and is folded into the world hash', () => {
    const { w } = build();
    expect(compliance.complianceOf(w)).toEqual(league.emptyCompliance());
    const h = loop.worldHash(w, false);
    compliance.setCompliance(w, { ...league.emptyCompliance(), nextLogId: 2 });
    expect(loop.worldHash(w, false)).not.toBe(h);
  });

  it('detects a logged act in the weekly step, opens a case and resolves it, with public events at tier 1', () => {
    const { w } = build();
    const teamId = proTeams(w)[0]!;
    w.tiers.set(teamId, 1);
    const gmId = compliance.generalManagerOf(w, teamId)!;
    // A written trace makes detection certain (L8.2.2), so the case must open in the first week.
    const act: league.Act = {
      classId: 'tampering_players', actor: compliance.partyOf(w, gmId, 'general_manager', teamId), orderedBy: null, knew: [gmId], date: w.date,
      competitionId: w.teams.find((t) => t.id === teamId)!.competitionId, gain: 0.5, tier: 1, source: 'sim', certainTrace: true,
    };
    const sink: league.EventSink = { append: (d) => w.log.emit({ type: d.type, date: d.when.date, teamId: d.where.teamId, actors: d.actors, subjects: d.subjects, payload: d.payload, witnesses: d.witnesses, tier: d.tier, source: 'sim' }).ok ? w.log.nextId - 1 : 0 };
    const done = league.commitAct(league.emptyCompliance(), act, cb.rules(w), sink);
    expect(done.ok).toBe(true);
    if (done.ok) compliance.setCompliance(w, done.state);
    const sys = loop.systemsFrom({ compliance: compliance.complianceStep(cb) }, 'test: not bound');
    // A major case takes the league `case_weeks_major` to resolve (L8.2.5).
    for (let i = 0; i <= league.P('case_weeks_major') + 1; i++) loop.runWeek(w, sys);
    const s = compliance.complianceOf(w);
    expect(s.cases.length).toBe(1);
    expect(s.cases[0]!.status).toBe('closed');
    const types = new Set(w.log.rows().map((e) => e.type));
    expect(types.has(league.EVENT.inquiry)).toBe(true);
    expect(types.has(league.EVENT.detected)).toBe(true);
  });

  it('keeps the act but records no event for a far (tier 3) team (MA-66)', () => {
    const { w } = build();
    const teamId = proTeams(w)[1]!;
    const gmId = compliance.generalManagerOf(w, teamId)!;
    const sys = loop.systemsFrom({ compliance: compliance.complianceStep(cb) }, 'test: not bound');
    let ctxSink: league.EventSink | null = null;
    const grab = loop.systemsFrom({ moves: (ctx) => { ctxSink = compliance.sinkFor(ctx); }, compliance: compliance.complianceStep(cb) }, 'test: not bound');
    loop.runWeek(w, grab);
    const done = league.commitAct(league.emptyCompliance(), {
      classId: 'tampering_players', actor: compliance.partyOf(w, gmId, 'general_manager', teamId), orderedBy: null, knew: [gmId], date: w.date,
      competitionId: null, gain: 0.5, tier: 3, source: 'sim', certainTrace: true,
    }, cb.rules(w), ctxSink!);
    expect(done.ok).toBe(true);
    if (done.ok) { expect(done.row.eventId).toBe(0); compliance.setCompliance(w, done.state); }
    for (let i = 0; i < 30; i++) loop.runWeek(w, sys);
    expect(compliance.complianceOf(w).cases.length).toBe(1);
    expect(w.log.rows().some((e) => e.type === league.EVENT.detected)).toBe(false);
  });
});

describe('gm.raise from the offseason: early contact before free agency (K7.7.1)', () => {
  // General managers with no regard for the rule and no fear of risk: the K2.8.2 score is positive whenever there is a gain.
  const loose = build({ facets: { rule_respect: 0, risk_tolerance: 100 } });
  for (let i = 0; i < 3; i++) loop.runSeason(loose.w, loose.sys, testSchedule);

  it('logs early contact as tampering by the club general manager, and the club signs that player ahead of the order', () => {
    const rows = compliance.complianceOf(loose.w).log.filter((r) => r.classId === 'tampering_players');
    expect(rows.length).toBeGreaterThan(0);
    const signed = loose.w.log.rows().filter((e) => e.type === turnover.PLAYER_SIGNED && e.payload.kind === 'free_agent');
    for (const r of rows) {
      expect(r.actor.role).toBe('general_manager');
      expect(r.actor.personId).toBe(compliance.generalManagerOf(loose.w, r.actor.teamId));
      const player = r.knew.find((id) => id !== r.actor.personId)!;
      const first = signed.find((e) => e.subjects[0]!.id === player && e.when.date.seasonYear === r.date.seasonYear);
      expect(first?.payload.team).toBe(r.actor.teamId);
    }
  });

  it('ties every case the weekly step opened to logged acts of its own club', () => {
    const s = compliance.complianceOf(loose.w);
    console.log('early contact acts', s.log.length, 'cases', s.cases.length, 'orders', s.orders.length);
    for (const c of s.cases.filter((x) => !x.falseAccusation)) {
      for (const id of c.rowIds) expect(s.log.find((r) => r.id === id)?.actor.teamId).toBe(c.teamId);
    }
  });

  it('leaves most general managers with default character honest in a short run', () => {
    const plain = build();
    for (let i = 0; i < 3; i++) loop.runSeason(plain.w, plain.sys, testSchedule);
    const n = compliance.complianceOf(plain.w).log.length;
    console.log('early contact acts with default character', n);
    expect(n).toBeLessThan(compliance.complianceOf(loose.w).log.length);
  });

  it('is deterministic with the step and the raise bound', () => {
    const again = build({ facets: { rule_respect: 0, risk_tolerance: 100 } });
    for (let i = 0; i < 3; i++) loop.runSeason(again.w, again.sys, testSchedule);
    expect(loop.worldHash(again.w)).toBe(loop.worldHash(loose.w));
  });
});

describe('penalties cost clubs in the world (L8.2.5 orders)', () => {
  it('carries each order once: fines on the books, suspensions counted down by games, forfeits waiting for the draft', () => {
    const { w } = build();
    const teamId = proTeams(w)[0]!;
    const gmId = compliance.generalManagerOf(w, teamId)!;
    compliance.setCompliance(w, {
      ...league.emptyCompliance(), orders: [
        { caseId: 1, order: { kind: 'fine', party: { kind: 'person', id: gmId }, cents: 150000000, tier: null, mayBeRepaidByClub: false } },
        { caseId: 1, order: { kind: 'fine', party: { kind: 'team', id: teamId }, cents: null, tier: 'fine_tier_2', mayBeRepaidByClub: true } },
        { caseId: 1, order: { kind: 'pick_forfeit', teamId, round: 1 } },
        { caseId: 1, order: { kind: 'suspension', personId: gmId, games: 2 } },
        { caseId: 1, order: { kind: 'probation', teamId, years: 2 } },
      ],
    });
    const sys = loop.systemsFrom({ games: loop.gamesStep(testSchedule, testGamePort()), compliance: compliance.complianceStep(cb) }, 'test: not bound');
    loop.runWeek(w, sys);
    let s = compliance.penaltiesOf(w);
    expect(s.applied).toBe(5);
    expect(compliance.finesOf(w, { kind: 'person', id: gmId })).toBe(150000000);
    expect(compliance.finesOf(w, { kind: 'team', id: teamId })).toBe(0);
    expect(s.forfeits).toEqual([{ caseId: 1, teamId, round: 1 }]);
    expect(s.recorded.map((r) => r.order.kind)).toEqual(['probation']);
    expect(compliance.isSuspended(w, gmId)).toBe(true);
    // Running more weeks never applies an order twice; the suspension ends after two of his club's games.
    for (let i = 0; i < 6; i++) loop.runWeek(w, sys);
    s = compliance.penaltiesOf(w);
    expect(s.fines.length).toBe(2);
    const games = w.results.filter((g) => g.week > 0 && (g.homeTeamId === teamId || g.awayTeamId === teamId)).length;
    expect(compliance.isSuspended(w, gmId)).toBe(games < 2);
  });

  it('takes a detected tampering case from the act to a lost first-round pick at the next draft', () => {
    const { w, sys } = build();
    const teamId = proTeams(w)[0]!;
    w.tiers.set(teamId, 1);
    loop.runSeason(w, sys, testSchedule);
    const gmId = compliance.generalManagerOf(w, teamId)!;
    let ctxSink: league.EventSink | null = null;
    loop.runWeek(w, { ...sys, labels: (ctx) => { ctxSink = compliance.sinkFor(ctx); } });
    const done = league.commitAct(compliance.complianceOf(w), {
      classId: 'tampering_players', actor: compliance.partyOf(w, gmId, 'general_manager', teamId), orderedBy: null, knew: [gmId], date: w.date,
      competitionId: w.teams.find((t) => t.id === teamId)!.competitionId, gain: 0.5, tier: 1, source: 'sim', certainTrace: true,
    }, cb.rules(w), ctxSink!);
    expect(done.ok).toBe(true);
    if (done.ok) compliance.setCompliance(w, done.state);
    // A major case runs the league `case_weeks_major`; then one more offseason holds the draft.
    // runWeek never turns the season; a season point is run when the schedule's weeks are used up.
    for (let i = 0; i < 200 && !compliance.complianceOf(w).cases.some((c) => c.status === 'closed'); i++) {
      if (w.week >= testSchedule.weeksInSeason(w)) loop.runSeasonPoint(w, sys); else loop.runWeek(w, sys);
    }
    console.log('cases', JSON.stringify(compliance.complianceOf(w).cases), 'log', compliance.complianceOf(w).log.length);
    const orders = compliance.complianceOf(w).orders.map((o) => o.order);
    console.log('orders from the pro rule set', JSON.stringify(orders));
    // Pro rule set values: compliance.tampering_players.pick_round_first and fine_executive_first_cents.
    expect(orders).toContainEqual({ kind: 'pick_forfeit', teamId, round: PRO_LOOKUP('compliance.tampering_players.pick_round_first') });
    expect(compliance.finesOf(w, { kind: 'person', id: gmId })).toBe(PRO_LOOKUP('compliance.tampering_players.fine_executive_first_cents'));
    const draftYear = w.date.seasonYear + 1;
    loop.runSeason(w, sys, testSchedule);
    loop.runWeek(w, sys);
    const firstRound = w.log.rows().filter((e) => e.type === turnover.PLAYER_DRAFTED && e.when.date.seasonYear === draftYear && e.payload.round === 1);
    expect(firstRound.length).toBe(proTeams(w).length - 1);
    expect(firstRound.some((e) => e.payload.team === teamId)).toBe(false);
    expect(compliance.penaltiesOf(w).forfeited).toEqual([draft(draftYear, teamId)]);
    expect(compliance.penaltiesOf(w).forfeits).toEqual([]);
  });
});

const draft = (year: number, teamId: number) => `${year}-r1-c${teamId}`;
