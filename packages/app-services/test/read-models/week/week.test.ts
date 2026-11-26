import { z } from 'zod';
import { own } from '@gm/schema';
import { ReadModelRegistry } from '../../../src/observer/index.ts';
// Week screens' read models (item 9): meetings (H4), travel (H8), documents (H9), the press conference
// (H7.2, O4.5.2) and the schedule and practice sources. Built on real weeks from the G-69 builder and the
// G-10 league-rules files; nothing hidden (attention, document quality, seeded errors, reporter trust)
// may reach a view.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calendar, practice as pr, week as wk } from '@gm/league';
import { press } from '@gm/front-office';
import { stream, seedFromNumber } from '@gm/engine-core';
import { ParamFile, type RandomStream } from '@gm/schema';
import {
  PARAMS, buildDocumentsView, buildMeetingsView, buildPressView, buildTravelView, choicesFor, docActions, meetingType,
  sessionKindFor, weekSpecs, weekSessions, type AgendaInput, type WeekSchemas,
} from '../../../src/read-models/week/index.ts';
import { answerPress, blandAll, startPress } from '../../../src/commands/week/index.ts';

const leagueFile = (name: string): { values: { key: string; value: unknown }[] } =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../rules-data/data/league/${name}`, import.meta.url)), 'utf8'));
const proLeague = calendar.calendarLookup(calendar.lookupFromValues(leagueFile('proleague_2026.json').values));
const collegeLeague = calendar.lookupFromValues(leagueFile('collegeleague_2026.json').values);
const proRules = wk.weekLookup(proLeague, 'pro');
const collegeRules = wk.weekLookup(collegeLeague, 'college');

const SUN = calendar.dayNumber({ y: 2026, m: 9, d: 13 });
const at = (day: number, hh: number, mm = 0): calendar.Instant => ({ day, minute: hh * 60 + mm });
const rng = (n: number): RandomStream => stream(seedFromNumber(n), 'week-screens.test', [n]);

function proWeek(over: Partial<wk.WeekInput> = {}): wk.Week {
  return wk.buildWeek({
    teamId: 1, weekId: 'w1', previousGameDay: SUN - 7, kickoff: at(SUN, 13), home: true, bye: false, playoff: false,
    set: wk.defaultSet(proRules), countable: false, ...over,
  });
}

describe('parameters', () => {
  it('parse', () => { expect(() => ParamFile.parse(PARAMS)).not.toThrow(); });
});

describe('meetings (H4)', () => {
  const week = proWeek();
  const blocks = wk.allBlocks(week);
  const team = blocks.find((b) => b.type === 'team_meeting')!;
  const unit = blocks.find((b) => b.type === 'unit_meeting' && b.leader !== 'head_coach');
  const agenda: AgendaInput[] = [
    { kind: 'install', label: 'Base runs', minutes: 30, plays: 6, newItem: true, unit: 'offense' },
    { kind: 'install', label: 'Third down', minutes: 15, plays: 12, newItem: true, unit: 'offense' },
    { kind: 'break', label: '', minutes: 5 },
    { kind: 'film_corrections', label: 'Last game', minutes: 20 },
  ];
  const v = buildMeetingsView({ week, agendas: { [team.id]: agenda }, userRoles: ['head_coach'], reports: { [team.id]: 'Two questions on the motion; the back row drifted late.' } });
  const all = v.days.flatMap((d) => d.meetings);

  it('lists every meeting block of the week with its type', () => {
    const n = blocks.filter((b) => ['staff_meeting', 'team_meeting', 'unit_meeting', 'position_meeting'].includes(b.type)).length;
    expect(all.length).toBe(n);
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) expect(m.type.length).toBeGreaterThan(0);
    expect(all.some((m) => m.type === 'game_planning')).toBe(false);
  });
  it('the user edits meetings he leads and reviews the others (H4.1.1)', () => {
    expect(all.find((m) => m.blockId === team.id)!.editable).toBe(team.leader === 'head_coach');
    if (unit) expect(all.find((m) => m.blockId === unit.id)!.editable).toBe(false);
    const coord = buildMeetingsView({ week, agendas: {}, userRoles: ['off_coordinator'] }).days.flatMap((d) => d.meetings);
    expect(coord.filter((m) => m.editable).every((m) => m.leader === 'off_coordinator')).toBe(true);
  });
  it('marks a long stretch without a break, a play only mentioned, and resets after a break (H4.1.2)', () => {
    const m = all.find((x) => x.blockId === team.id)!;
    expect(m.defaultAgenda).toBe(false);
    expect(m.agenda[1]!.warnings).toContain('long_stretch');
    expect(m.agenda[1]!.warnings).toContain('mentioned_only');
    expect(m.agenda[3]!.runMinutes).toBe(20);
    expect(m.agenda[3]!.warnings).not.toContain('long_stretch');
    expect(m.planned).toBe(70);
    expect(m.left).toBe(team.minutes - 70);
    expect(m.report).toContain('drifted');
  });
  it('flags installs past the daily new-item limit', () => {
    const many: AgendaInput[] = Array.from({ length: wk.P('meeting_daily_new_items') + 1 }, (_, i) => ({ kind: 'install', label: `p${i}`, minutes: 2, plays: 1, newItem: true, unit: 'defense' }));
    const m = buildMeetingsView({ week, agendas: { [team.id]: many }, userRoles: ['head_coach'] }).days.flatMap((d) => d.meetings).find((x) => x.blockId === team.id)!;
    expect(m.agenda.at(-1)!.warnings).toContain('over_install_limit');
    expect(m.agenda[0]!.warnings).not.toContain('over_install_limit');
  });
  it('day totals count player meetings against the daily cap; no attention value is shown', () => {
    for (const d of v.days) { expect(d.capMinutes).toBe(wk.P('meeting_day_cap_minutes')); expect(d.overCap).toBe(d.totalMinutes > d.capMinutes); }
    expect(JSON.stringify(v)).not.toMatch(/attention|factor/i);
  });
  it('a G-1 evening team meeting is the night-before meeting with the four tones (H4.2.3)', () => {
    const g1 = week.days.find((d) => d.gMinus === 1)!;
    const b: wk.Block = { id: 'nb', type: 'team_meeting', start: { day: g1.day, minute: 20 * 60 }, minutes: 30, attendees: ['team'], leader: 'head_coach', location: 'hotel', contentRef: null, mandatory: true };
    expect(meetingType(b, 1)).toBe('night_before');
    expect(meetingType({ ...b, start: { day: g1.day, minute: 9 * 60 } }, 1)).toBe('team');
    const w2 = wk.withBlocks(week, [...wk.allBlocks(week), b]);
    const nb = buildMeetingsView({ week: w2, agendas: {}, userRoles: ['head_coach'], tones: { nb: 'calm' } }).days.flatMap((d) => d.meetings).find((m) => m.blockId === 'nb')!;
    expect(nb.tones).toEqual(['calm', 'urgent', 'confident', 'challenging']);
    expect(nb.tone).toBe('calm');
    expect(nb.itemKinds).toContain('keys');
  });
});

describe('travel (H8)', () => {
  const away = proWeek({ home: false });
  const trip: wk.Trip = { zonesCrossed: 3, flightHours: 5, roadHours: 40, international: false, thursdayGame: false, tier: null };
  it('a home week has no plans', () => {
    const v = buildTravelView({ week: proWeek(), gameId: 'g1', trip, zoneShift: 0, homeAltitudeM: 0, siteAltitudeM: 0 });
    expect(v.home).toBe(true);
    expect(v.options).toEqual([]);
  });
  it('lists the offered plans, each from applyTravel, with the default and lost time (H8.1.1)', () => {
    const v = buildTravelView({ week: away, gameId: 'g1', trip, zoneShift: 3, homeAltitudeM: 10, siteAltitudeM: 1600 });
    expect(v.options.map((o) => o.plan)).toEqual(wk.travelOptions(trip));
    expect(v.options.filter((o) => o.isDefault).map((o) => o.plan)).toEqual([wk.defaultPlan(trip)]);
    for (const o of v.options) {
      const r = wk.applyTravel(away, 'g1', trip, o.plan as wk.PlanType);
      expect(o.nightsAway).toBe(r.plan.nightsAway);
      expect(o.blocksMoved).toBe(r.moved.length);
      expect(o.mode).toBe('air');
    }
    expect(v.altitude).toBe(true);
    expect(v.travelDay?.blocks.some((b) => b.type === 'travel')).toBe(true);
  });
  it('states body time of kickoff only when the gap is at least two hours (H8.2.1)', () => {
    const east = buildTravelView({ week: away, gameId: 'g1', trip, zoneShift: 3, homeAltitudeM: 0, siteAltitudeM: 0, chosen: 'standard' });
    const std = east.options.find((o) => o.plan === 'standard')!;
    expect(std.bodyKickoff).toBe('11:00');
    expect(std.earlyBodyTime).toBe(false);
    const near = buildTravelView({ week: away, gameId: 'g1', trip: { ...trip, zonesCrossed: 1 }, zoneShift: 1, homeAltitudeM: 0, siteAltitudeM: 0 });
    expect(near.options.every((o) => o.bodyKickoff === null)).toBe(true);
  });
  it('a Thursday away game offers Standard only', () => {
    const v = buildTravelView({ week: away, gameId: 'g1', trip: { ...trip, thursdayGame: true }, zoneShift: 0, homeAltitudeM: 0, siteAltitudeM: 0 });
    expect(v.options.map((o) => o.plan)).toEqual(['standard']);
    expect(v.thursdayOnlyStandard).toBe(true);
  });
});

describe('documents (H9)', () => {
  const week = proWeek();
  const docs = wk.createWeekDocuments(week, { groups: 8, planScale: 1, countable: false, selfScoutDue: false })
    .map((d, i) => ({ ...d, quality: 0.123456, errors: ['secret-error'], state: (i === 0 ? 'in_review' : d.state) as wk.DocState }));
  const late = { day: SUN + 1, minute: 0 };
  it('lists every document with state, author, due time and recipients, and never quality or errors (H9.1.1, K9)', () => {
    const v = buildDocumentsView({ weekId: 'w1', docs, now: late, detail: 'all' });
    expect(v.rows.length).toBe(docs.length);
    expect(v.rows.every((r) => r.recipients.length > 0 && /\d\d:\d\d$/.test(r.due))).toBe(true);
    const s = JSON.stringify(v);
    expect(s).not.toContain('0.123456');
    expect(s).not.toContain('secret-error');
    expect(v.rows.find((r) => r.state === 'in_review')!.actions).toEqual(['review', 'approve', 'send_back']);
  });
  it('the exceptions detail shows only late or sent-back documents', () => {
    const early = { day: SUN - 10, minute: 0 };
    const v = buildDocumentsView({ weekId: 'w1', docs, now: early, detail: 'exceptions', sentBack: new Set([docs[1]!.id]) });
    expect(v.rows.map((r) => r.id)).toEqual([docs[1]!.id]);
    expect(v.rows[0]!.sentBack).toBe(true);
    expect(v.hidden).toBe(docs.length - 1);
  });
  it('workload bars add open hours per author against hours available (H9.1.2)', () => {
    const v = buildDocumentsView({ weekId: 'w1', docs, now: late, detail: 'all', available: { quality_control: 1 } });
    const qc = v.workload.find((w) => w.author === 'quality_control')!;
    expect(qc.assigned).toBeGreaterThan(1);
    expect(qc.over).toBe(true);
    expect(v.workload.find((w) => w.author !== 'quality_control')?.available ?? null).toBeNull();
  });
  it('every state has its actions', () => { for (const s of wk.DOC_STATES) expect(docActions(s).length).toBeGreaterThan(0); });
});

const REPORTERS: press.ReporterView[] = [
  { id: 1, outlet: 'local_paper', reach: 3, beat: {}, trust: 50, controversy: 0.4 },
  { id: 2, outlet: 'national', reach: 5, beat: { job_security: 2 }, trust: 40, controversy: 0.7 },
  { id: 3, outlet: 'team_site', reach: 2, beat: {}, trust: 70, controversy: 0.1 },
];
function session(level: 'pro' | 'college', events: press.PressEvent[] = []): press.PressSession {
  return {
    kind: 'midweek', speaker: 'head_coach', reporters: REPORTERS, events, statements: [], settings: { personalTopics: true },
    world: { level, teamId: 1, coachId: 99, market: 3, wins: 3, losses: 5, streak: -3, hotSeat: true, goodwill: 30, nextOpponent: 2, rivalryWeek: false, origins: {}, names: { 1: 'Home', 2: 'Visitors', 11: 'Smith' } },
  };
}
const ev = (id: number, type: string): press.PressEvent => ({ id, type, daysAgo: 1, notability: 70, harm: 'none', personIds: [11], teamIds: [1], public: true, fromLeak: false });

describe('press conference (H7.2, O4.5.2)', () => {
  const week = proWeek();
  it('offers two to four stance answers for every kind of question a reporter asks, never a number', () => {
    for (const code of press.QUESTION_CODES) {
      for (const person of [true, false]) {
        const c = choicesFor(code, person, proRules, week);
        expect(c.length).toBeGreaterThanOrEqual(2);
        expect(c.length).toBeLessThanOrEqual(4);
        expect(new Set(c.map((x) => x.id)).size).toBe(c.length);
      }
    }
    expect(choicesFor('injury_status', true, proRules, week).map((c) => c.id)).not.toContain('mental_health');
  });
  it('a college recruiting answer that names the recruit is marked as a violation (H7.4.1 rule 4)', () => {
    const cw = wk.buildWeek({ teamId: 2, weekId: 'c1', previousGameDay: SUN - 8, kickoff: at(SUN - 1, 15, 30), home: true, bye: false, playoff: false, set: wk.defaultSet(collegeRules), countable: true });
    const c = choicesFor('recruiting', false, collegeRules, cw);
    expect(c.find((x) => x.id === 'name_recruit')!.violation).toBe(wk.recruitComment(collegeRules, cw).violation);
  });
  it('runs a whole session one question at a time; table stances write statements and events', () => {
    const s = session('pro', [ev(1, 'qb_change'), ev(2, 'loss'), ev(3, 'injury')]);
    let pc = startPress('media1', s, rng(7));
    expect(pc.current?.topicId).toBe('qb_starter');
    const target = pc.state.target;
    let n = 0;
    while (pc.current) {
      const choices = choicesFor(pc.current.code, pc.current.personId !== null, proRules, week);
      pc = answerPress(pc, choices[0]!.id, rng(100 + n), at(SUN - 4, 12), proRules, week);
      n++;
    }
    expect(pc.answers.length).toBe(n);
    expect(n).toBe(target);
    expect(pc.statements.length).toBeGreaterThan(0);
    const v = buildPressView(week, pc, proRules);
    expect(v.live!.done).toBe(true);
    expect(v.live!.headline).not.toBeNull();
    expect(v.live!.history.length).toBe(n);
  });
  it('refuses an answer that is not offered', () => {
    const pc = startPress('m', session('pro', [ev(1, 'qb_change')]), rng(3));
    expect(() => answerPress(pc, 'not_a_choice', rng(4), at(SUN, 15), proRules, week)).toThrow();
  });
  it('the one-click bland default answers everything and produces no relationship events', () => {
    const pc = blandAll(startPress('m', session('pro', [ev(1, 'loss')]), rng(11)), rng(12), at(SUN, 16), proRules, week);
    expect(pc.current).toBeNull();
    expect(pc.events.every((e) => e.kind === 'bland_answer')).toBe(true);
  });
  it('the view never carries reporter trust, controversy or goodwill', () => {
    const pc = startPress('m', session('pro', [ev(1, 'loss')]), rng(5));
    const v = buildPressView(week, pc, proRules);
    const s = JSON.stringify(v);
    for (const k of ['trust', 'controversy', 'goodwill', 'reach', 'tone']) expect(s).not.toContain(`"${k}"`);
    expect(v.live!.current!.text.length).toBeGreaterThan(0);
    expect(v.live!.timeLimitSeconds).toBe(30);
  });
  it('lists this week\'s head-coach sessions and maps them to generator kinds', () => {
    const rows = weekSessions(week);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(press.SESSION_KINDS).toContain(sessionKindFor(r.session));
    expect(buildPressView(week, null, proRules).live).toBeNull();
  });
});

describe('specs: schedule and practice route sources', () => {
  const schemas = { schedule: {}, practice: {}, meetings: {}, travel: {}, documents: {}, press: {} } as unknown as WeekSchemas;
  const world = {} as never;
  it('the schedule spec wraps the week module view; a missing source answers null', () => {
    const week = proWeek();
    const specs = weekSpecs(schemas, { schedule: () => ({ week, findings: [], documents: [] }) });
    const d = specs.schedule.build(world, { teamId: 1 }).data;
    expect(d?.weekId).toBe('w1');
    expect(specs.meetings.build(world, { teamId: 1 }).data).toBeNull();
    expect(specs.practice.name).toBe('practicePlanner');
  });
  it('every week spec registers with the observer registry (lowerCamelCase names)', () => {
    const r = new ReadModelRegistry();
    const one = z.object({ weekId: own(z.string()) });
    const real = { schedule: one, practice: one, meetings: one, travel: one, documents: one, press: one } as unknown as WeekSchemas;
    for (const spec of Object.values(weekSpecs(real, {}))) r.register(spec as never);
    expect(r.names()).toEqual(["practicePlanner", "pressConference", "weekDocuments", "weekMeetings", "weekSchedule", "weekTravel"]);
  });
  it('the practice spec builds the planner view from the G-65 module', () => {
    const input = practiceInput();
    const specs = weekSpecs(schemas, { practice: (_t, id) => (id === input.practice.id ? input : null) });
    const d = specs.practice.build(world, { teamId: 1, practiceId: input.practice.id }).data;
    expect(d).toEqual(pr.practiceView(input));
    expect(specs.practice.build(world, { teamId: 1, practiceId: 'nope' }).data).toBeNull();
  });
});

function practiceInput(): pr.PracticeViewInput {
  const practice: pr.Practice = {
    id: 'p1', blockId: 'b1', teamId: 1, pads: 'shells', blockMinutes: 120,
    periods: [{ number: 1, minutes: 10, type: 'warmup', tempo: 'walk', groups: ['offense', 'defense'], leader: { role: 'head_coach', user: true } }],
  } as unknown as pr.Practice;
  return { practice, rules: proRules, coverage: { zero: [], one: [], more: [] } as unknown as pr.Coverage, findings: [], participation: [], paddedUsed: 0 };
}
