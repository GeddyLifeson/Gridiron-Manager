// Press conference question generator: anything a reporter could realistically ask has a chance of being
// asked (Marlon 2026-11-26), weighted by recency, salience, market, outlet and beat, and nothing private
// or about an imported person's personal life is ever asked (H7.2.1, H7.2.2, L6.1, K8.7.1, X14, G-27).
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import { FactRow, ParamFile, computeStatus, type RandomStream } from '@gm/schema';
import {
  PARAMS, PRESS_FACTS, QUESTION_CODES, RESEARCH, SESSIONS, SESSION_KINDS, TOPICS, TRIGGER_TYPES,
  ask, catalogueProblems, questionCount, runSession, startSession, toneShares,
  type AnswerKind, type PressEvent, type PressQuestion, type PressSession, type ReporterView, type SessionKind,
} from '../../src/press/index.ts';

const rng = (seed: number): RandomStream => stream(seedFromNumber(seed), 'press.test', []);

const REPORTERS: ReporterView[] = [
  { id: 1, outlet: 'local_paper', reach: 3, beat: {}, trust: 50, controversy: 0.4 },
  { id: 2, outlet: 'local_broadcast', reach: 4, beat: {}, trust: 55, controversy: 0.5 },
  { id: 3, outlet: 'national', reach: 5, beat: { job_security: 2, contract: 2, trade: 2 }, trust: 40, controversy: 0.7 },
  { id: 4, outlet: 'team_site', reach: 2, beat: { player_performance: 1.5 }, trust: 70, controversy: 0.1 },
  { id: 5, outlet: 'analytics', reach: 2, beat: { decision_call: 3, analytics_stats: 3 }, trust: 50, controversy: 0.3 },
];

let nextId = 1000;
function ev(type: string, over: Partial<PressEvent> = {}): PressEvent {
  return { id: nextId++, type, daysAgo: 1, notability: 60, harm: 'none', personIds: [11], teamIds: [1], public: true, fromLeak: false, ...over };
}

function session(over: Partial<PressSession> = {}, world: Partial<PressSession['world']> = {}): PressSession {
  return {
    kind: 'midweek', speaker: 'head_coach', reporters: REPORTERS, events: [], statements: [],
    settings: { personalTopics: true },
    world: {
      level: 'pro', teamId: 1, coachId: 99, market: 3, wins: 4, losses: 4, streak: 0, hotSeat: false, goodwill: 50,
      nextOpponent: 2, rivalryWeek: false, origins: {}, names: { 1: 'Home', 2: 'Visitors', 11: 'Smith', 12: 'Jones' }, ...world,
    },
    ...over,
  };
}

const direct = (): AnswerKind => 'direct';
function many(s: PressSession, n: number, seed = 1, answer: (q: PressQuestion) => AnswerKind = direct): PressQuestion[] {
  const out: PressQuestion[] = [];
  for (let i = 0; i < n; i++) out.push(...runSession(s, rng(seed * 100_003 + i), answer));
  return out;
}
const share = (qs: readonly PressQuestion[], f: (q: PressQuestion) => boolean) => qs.filter(f).length / Math.max(1, qs.length);

describe('catalogue and data', () => {
  it('has no content problems and a topic for every research code', () => {
    expect(catalogueProblems()).toEqual([]);
    for (const c of QUESTION_CODES) expect(TOPICS.some((t) => t.code === c)).toBe(true);
    for (const k of SESSION_KINDS) expect(SESSIONS[k]).toBeDefined();
  });
  it('params parse and every fact status is computed from its sources', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    for (const r of PRESS_FACTS) { expect(() => FactRow.parse(r)).not.toThrow(); expect(r.status).toBe(computeStatus(r)); }
    expect(PRESS_FACTS.filter((r) => r.status === 'Verified').length).toBeGreaterThan(10);
  });
  it('measured shares and tones are distributions', () => {
    for (const lv of ['pro', 'college'] as const) {
      const s = Object.values(RESEARCH[lv].share).reduce((a, b) => a + b, 0);
      expect(s).toBeGreaterThan(0.97); expect(s).toBeLessThan(1.03);
      const t = Object.values(RESEARCH[lv].tone).reduce((a, b) => a + b, 0);
      expect(t).toBeCloseTo(1, 2);
    }
  });
});

describe('every topic reachable', () => {
  it('each topic is asked at least once when its event exists (pro and college)', () => {
    for (const level of ['pro', 'college'] as const) {
      const events = TRIGGER_TYPES.map((t) => ev(t, { notability: 30 }));
      const statements = [{ id: 1, topicId: 'qb_starter', subjectKey: 'person:11', daysAgo: 10, contradictedBy: events[0]!.id }];
      const seen = new Set<string>();
      for (const kind of ['midweek', 'postgame', 'end_of_season', 'crisis', 'coach_show', 'training_camp'] as SessionKind[]) {
        for (const q of many(session({ kind, events, statements }, { level }), 120, level === 'pro' ? 3 : 4)) seen.add(q.topicId);
      }
      const expected = TOPICS.filter((t) => t.level === 'both' || t.level === level).map((t) => t.id);
      expect(expected.filter((id) => !seen.has(id))).toEqual([]);
    }
  });
  it('pro-only and college-only topics stay on their level', () => {
    const events = TRIGGER_TYPES.map((t) => ev(t));
    expect(many(session({ events }, { level: 'college' }), 40).some((q) => q.code === 'trade' || q.topicId === 'holdout')).toBe(false);
    expect(many(session({ events }, { level: 'pro' }), 40).some((q) => q.code === 'recruiting' || q.code === 'transfer_nil')).toBe(false);
  });
});

describe('weights: events, recency, beat', () => {
  it('a live holdout pushes contract questions far up', () => {
    const without = share(many(session(), 60), (q) => q.code === 'contract');
    const withIt = share(many(session({ events: [ev('holdout', { notability: 80 })] }), 60), (q) => q.code === 'contract');
    expect(without).toBe(0);
    expect(withIt).toBeGreaterThan(0.05);
  });
  it('a fresh event is asked about more than the same event a week old', () => {
    const fresh = share(many(session({ events: [ev('suspension', { daysAgo: 0 })] }), 80), (q) => q.code === 'discipline_conduct');
    const stale = share(many(session({ events: [ev('suspension', { daysAgo: 10 })] }), 80), (q) => q.code === 'discipline_conduct');
    expect(fresh).toBeGreaterThan(stale);
  });
  it("a reporter's beat tilts what he asks", () => {
    const events = [ev('fourth_down_decision', { notability: 40 })];
    const qs = many(session({ events }), 100);
    const analytics = qs.filter((q) => q.reporterId === 5);
    const paper = qs.filter((q) => q.reporterId === 1);
    expect(share(analytics, (q) => q.code === 'decision_call')).toBeGreaterThan(share(paper, (q) => q.code === 'decision_call'));
  });
  it('a postgame leans to the game; a midweek leans to the opponent', () => {
    const events = [ev('game_result', { daysAgo: 0 }), ev('fourth_down_decision', { daysAgo: 0 })];
    const post = many(session({ kind: 'postgame', events }), 60);
    const mid = many(session({ kind: 'midweek', events: events.map((e) => ({ ...e, daysAgo: 3 })) }), 60);
    const game = (q: PressQuestion) => ['result_overall', 'specific_play', 'decision_call'].includes(q.code);
    const opp = (q: PressQuestion) => ['opponent_team', 'opponent_player', 'game_plan'].includes(q.code);
    expect(share(post, game)).toBeGreaterThan(share(mid, game));
    expect(share(mid, opp)).toBeGreaterThan(share(post, opp));
  });
  it('a coordinator session asks only about his side of the job', () => {
    const only = SESSIONS.coordinator.only!;
    const qs = many(session({ kind: 'coordinator', speaker: 'coordinator', events: TRIGGER_TYPES.map((t) => ev(t)) }), 40);
    expect(qs.every((q) => only.includes(q.code))).toBe(true);
  });
});

describe('privacy (G-27, X14)', () => {
  it('never asks about a private event, but a leak reaches the room', () => {
    const hidden = ev('trade_request', { public: false, notability: 95 });
    expect(many(session({ events: [hidden] }), 60).some((q) => q.eventId === hidden.id)).toBe(false);
    const leaked = { ...hidden, id: nextId++, fromLeak: true };
    expect(many(session({ events: [leaked] }), 60).some((q) => q.eventId === leaked.id)).toBe(true);
  });
  it('never asks a personal or harmful question about an imported person', () => {
    const events = [ev('arrest', { harm: 'harmful', personIds: [12], notability: 95 }), ev('player_personal_public', { harm: 'personal', personIds: [12], notability: 95 })];
    const qs = many(session({ events }, { origins: { 12: 'imported' } }), 80);
    expect(qs.some((q) => q.personId === 12 && (q.harm === 'personal' || q.harm === 'harmful'))).toBe(false);
    const gen = many(session({ events }, { origins: { 12: 'generated' } }), 80);
    expect(gen.some((q) => q.topicId === 'player_legal')).toBe(true);
  });
  it('the personal-topics setting off removes personal questions', () => {
    const events = [ev('family_event_public', { harm: 'personal', personIds: [99], notability: 90 })];
    expect(many(session({ events }), 60).some((q) => q.topicId === 'coach_family')).toBe(true);
    expect(many(session({ events, settings: { personalTopics: false } }), 60).some((q) => q.harm === 'personal')).toBe(false);
  });
  it('after a serious injury no fault question about that game is pointed', () => {
    const events = [ev('game_result', { daysAgo: 0, seriousInjury: true, judgedPoor: true }), ev('fourth_down_decision', { daysAgo: 0, judgedPoor: true })];
    const qs = many(session({ kind: 'postgame', events }, { streak: -4, hotSeat: true, goodwill: 10 }), 60);
    const fault = qs.filter((q) => ['result_overall', 'specific_play', 'decision_call'].includes(q.code));
    expect(fault.length).toBeGreaterThan(0);
    expect(fault.every((q) => q.tone === 'soft' || q.tone === 'neutral')).toBe(true);
  });
});

describe('order, follow-ups and gotchas', () => {
  it('a quarterback change is the first question (H7.2.2 acceptance 1)', () => {
    for (let i = 0; i < 20; i++) {
      const qs = runSession(session({ events: [ev('injury'), ev('qb_change', { notability: 70 }), ev('holdout', { notability: 99 })] }), rng(i), direct);
      expect(qs[0]!.topicId).toBe('qb_starter');
    }
  });
  it('evasive answers draw more follow-ups than direct ones, capped per subject', () => {
    const s = session({ events: [ev('hot_seat', { notability: 80 }), ev('injury')] });
    const ev1 = many(s, 80, 7, () => 'evasive');
    const dir = many(s, 80, 7, direct);
    expect(share(ev1, (q) => q.followUpOf !== null)).toBeGreaterThan(share(dir, (q) => q.followUpOf !== null) * 1.5);
    for (let i = 0; i < 30; i++) {
      const qs = runSession(s, rng(500 + i), () => 'evasive');
      const per = new Map<string, number>();
      for (const q of qs) if (q.followUpOf !== null) per.set(q.subjectKey, (per.get(q.subjectKey) ?? 0) + 1);
      for (const v of per.values()) expect(v).toBeLessThanOrEqual(2);
    }
  });
  it('a contradicted statement becomes a gotcha question', () => {
    const benched = ev('benching', { notability: 70 });
    const qs = many(session({ events: [benched], statements: [{ id: 5, topicId: 'qb_starter', subjectKey: 'person:11', daysAgo: 4, contradictedBy: benched.id }] }), 30);
    const g = qs.filter((q) => q.gotcha && q.followUpOf === null);
    expect(g.length).toBeGreaterThan(0);
    expect(g.every((q) => q.tone === 'probing' || q.tone === 'hostile')).toBe(true);
  });
  it('the session API takes answers one at a time', () => {
    let st = startSession(session({ events: [ev('injury')] }));
    const r1 = ask(st, rng(1), null); st = r1.state;
    expect(r1.question?.n).toBe(1);
    const r2 = ask(st, rng(2), 'decline');
    expect(r2.question?.n).toBe(2);
  });
});

describe('tone', () => {
  it('losses, hot seat and low goodwill make the room harsher; hostile stays possible', () => {
    const r = REPORTERS[0]!;
    const calm = toneShares(session({}, { streak: 3, goodwill: 70 }), r, null, false);
    const hot = toneShares(session({}, { streak: -4, hotSeat: true, goodwill: 20, market: 5 }), r, null, false);
    expect(hot.probing + hot.hostile).toBeGreaterThan(calm.probing + calm.hostile);
    expect(calm.hostile).toBeGreaterThan(0);
    const qs = many(session({ events: [ev('hot_seat')] }, { streak: -5, hotSeat: true, goodwill: 10, market: 5 }), 60);
    expect(qs.some((q) => q.tone === 'hostile')).toBe(true);
    expect(qs.filter((q) => q.tone === 'hostile').every((q) => q.text.length > 0)).toBe(true);
  });
  it('college rooms are softer than pro rooms at the same state (measured)', () => {
    const r = REPORTERS[0]!;
    expect(toneShares(session({}, { level: 'college' }), r, null, false).soft).toBeGreaterThan(toneShares(session({}, { level: 'pro' }), r, null, false).soft);
  });
});

describe('count, text, determinism', () => {
  it('question counts follow the measured means, market and minutes', () => {
    expect(questionCount(session({ kind: 'postgame' }))).toBe(Math.round(RESEARCH.pro.perSession.postgame!));
    expect(questionCount(session({ kind: 'midweek' }, { market: 5 }))).toBeGreaterThan(questionCount(session({ kind: 'midweek' }, { market: 1 })));
    expect(questionCount(session({ kind: 'midweek', minutes: 6 }))).toBe(4);
    expect(questionCount(session({ settings: { personalTopics: true, questionCount: 3 } }))).toBe(3);
    expect(runSession(session({ kind: 'halftime_interview', events: [ev('game_result', { daysAgo: 0 })] }), rng(1), direct).length).toBeLessThanOrEqual(2);
  });
  it('no question text keeps an unfilled placeholder', () => {
    const qs = many(session({ events: TRIGGER_TYPES.map((t) => ev(t, { words: { detail: 'the fourth quarter' } })) }), 30);
    expect(qs.every((q) => !/\{\w+\}/.test(q.text))).toBe(true);
  });
  it('the same seed gives the same session', () => {
    const s = session({ events: TRIGGER_TYPES.slice(0, 20).map((t) => ev(t)) });
    expect(runSession(s, rng(42), direct)).toEqual(runSession(s, rng(42), direct));
  });
  it('with no events, a pro midweek still asks a realistic spread', () => {
    const qs = many(session(), 100);
    const codes = new Set(qs.map((q) => q.code));
    expect(codes.size).toBeGreaterThanOrEqual(12);
    expect(qs.every((q) => q.eventId === null)).toBe(true);
    expect(qs.some((q) => /that player|that situation|those numbers/.test(q.text))).toBe(false);
  });
});
