// G-44 news wire (C10, X12.2). Acceptance: news items are generated from log rows only. The log rows are
// built as G-22's EventLog emits them (WorldEvent from @gm/schema), so the module needs no unmerged code.
import { describe, expect, it } from 'vitest';
import { ParamFile, WorldEvent, type EventTypeDef, type RelationshipEdge, type WitnessRule } from '@gm/schema';
import { DMATH, stream, seedFromNumber } from '@gm/engine-core';
import {
  PARAMS, RULE_KEYS, param, newsFromEvents, newsTraceProblems, missingCarouselItems, wireFromEvents, wireVisibleAt, filterWire,
  wireCountMatches, publicDeliveries, spreadNonPublic, contactTip, passChance, unsourcedDeliveries, rumorAllowed, resolveRumors,
  selectForInbox, inactivesPublicAt, staffNote, transactionDeadline, type Rumor,
} from '../../src/news/index.ts';
import { MINUTES_PER_DAY } from '../../src/calendar/date.ts';

void DMATH;
const SEED = seedFromNumber(4404);
const S = (name: string, ...scope: (string | number)[]) => stream(SEED, name, scope);

const def = (id: string, family: EventTypeDef['family'], extra: Partial<EventTypeDef> = {}): EventTypeDef => ({
  id, family, payloadSchema: {}, witnessRule: 'public', lineTemplate: `history.${id}`, harmClass: 'none', importedAllowed: true, minTier: 3,
  consumers: ['league.news'], compactable: false, ...extra,
});
const TYPES = new Map<string, EventTypeDef>([
  ['player_signed', def('player_signed', 'roster')],
  ['player_released', def('player_released', 'roster')],
  ['head_coach_hired', def('head_coach_hired', 'career')],
  ['head_coach_fired', def('head_coach_fired', 'career', { harmClass: 'professional_negative' })],
  ['locker_room_dispute', def('locker_room_dispute', 'personal', { witnessRule: 'room', harmClass: 'personal', importedAllowed: false })],
  ['game_result', def('game_result', 'game')],
]);

let nid = 1;
function ev(type: string, day: number, o: { witnesses?: WitnessRule; team?: number | null; actors?: number[]; notability?: number | null; payload?: WorldEvent['payload']; competitionId?: number | null } = {}): WorldEvent {
  return WorldEvent.parse({
    id: nid++, type, when: { date: { seasonYear: 2030, dayIndex: day }, period: null, clockTenths: null }, competitionId: o.competitionId ?? 1,
    where: { teamId: o.team ?? null, venueId: null }, actors: (o.actors ?? []).map((personId) => ({ personId, role: 'subject' })), subjects: [],
    payload: o.payload ?? {}, witnesses: o.witnesses ?? { kind: 'public' }, causeId: null, notability: o.notability === undefined ? 40 : o.notability, tier: 1, source: 'sim',
  });
}
const dayOf = (e: WorldEvent) => e.when.date.dayIndex;
const isHc = (e: WorldEvent) => e.type.startsWith('head_coach_');

describe('parameters and rule keys', () => {
  it('the parameter file is valid and keys are named per B13.1.2', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    for (const k of RULE_KEYS) expect(k.key).toMatch(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/);
    expect(transactionDeadline()).toBe(param('transactionDeadlineMinute'));
    expect(transactionDeadline((k) => (k === 'news.transaction_deadline_minute' ? 900 : undefined))).toBe(900);
  });
});

describe('news items from log rows only (G-44 acceptance)', () => {
  const rows = [
    ev('player_signed', 10, { team: 3, actors: [100] }),
    ev('head_coach_fired', 11, { team: 4, actors: [200], notability: 5 }),
    ev('head_coach_hired', 12, { team: 4, actors: [201], notability: 0 }),
    ev('locker_room_dispute', 12, { witnesses: { kind: 'room', teamId: 3, roomKey: 'lockers' }, actors: [100, 101], notability: 90 }),
    ev('game_result', 13, { team: 3, notability: 3 }),
    ev('mystery_type', 13, {}),
  ];
  const built = newsFromEvents(rows, { types: TYPES, firstId: 1, alwaysNews: isHc });
  it('every item cites public log rows and nothing else', () => {
    expect(built.items.length).toBeGreaterThan(0);
    expect(newsTraceProblems(built.items, rows)).toEqual([]);
    for (const it of built.items) expect(it.templateKey).toBe(TYPES.get(it.kind)!.lineTemplate);
  });
  it('a room-only event never becomes news; unknown types and low notability are skipped', () => {
    const reasons = Object.fromEntries(built.skipped.map((s) => [s.eventId, s.reason]));
    expect(reasons[rows[3]!.id]).toBe('not_public');
    expect(reasons[rows[5]!.id]).toBe('unknown_type');
    expect(reasons[rows[4]!.id]).toBe('below_floor');
  });
  it('every head coach change has an item whatever its notability (C10.3.1)', () => {
    expect(missingCarouselItems(rows, built.items, isHc)).toEqual([]);
    expect(missingCarouselItems(rows, newsFromEvents(rows, { types: TYPES, firstId: 1 }).items, isHc)).toHaveLength(2);
  });
  it('a news item invented without a log row fails the trace', () => {
    const fake = { ...built.items[0]!, id: 999, sourceEventIds: [12345] };
    expect(newsTraceProblems([fake], rows)).toEqual(['news 999: source 12345 is not in the log']);
  });
  it('a personal event touching an imported person is never news, even if public', () => {
    const bad = ev('locker_room_dispute', 14, { actors: [300], notability: 99 });
    const b = newsFromEvents([bad], { types: TYPES, firstId: 1, originOf: (id) => (id === 300 ? 'imported' : 'generated') });
    expect(b.items).toEqual([]);
    expect(b.skipped[0]!.reason).toBe('protected');
  });
});

describe('C10.1.1 the daily wire', () => {
  const deadline = param('transactionDeadlineMinute');
  const rows = [
    ev('player_signed', 20, { team: 3, actors: [1], payload: { minute: deadline - 60, money_cents: 100 } }),
    ev('player_released', 20, { team: 5, actors: [2], payload: { minute: deadline + 30 } }),
    ev('player_signed', 20, { team: 3, actors: [3], payload: { minute: 600 } }),
    ev('player_released', 20, { team: 3, actors: [3], payload: { minute: 700 } }),
    ev('head_coach_hired', 20, { team: 3, actors: [9] }),
    ev('player_signed', 21, { team: 7, actors: [4], witnesses: { kind: 'team', teamId: 7 } }),
  ];
  const wire = wireFromEvents(rows, { types: TYPES, dayOf, stream: S('wire') });
  it('one item per public roster move; a same-day reversal is two items', () => {
    expect(wire).toHaveLength(4);
    expect(wireCountMatches(wire, rows, TYPES, dayOf, 20)).toBe(true);
    expect(wireCountMatches(wire, rows, TYPES, dayOf, 21)).toBe(true);
  });
  it('moves by the deadline appear that evening, later ones the next evening, money a day after', () => {
    expect(wire[0]!.publicDay).toBe(20);
    expect(wire[0]!.publicMinute).toBe(param('wirePublishMinute'));
    expect(wire[0]!.money!.day).toBe(20 + param('moneyDelayDays'));
    expect(wire[1]!.publicDay).toBe(21);
    expect(wire[1]!.money).toBeNull();
  });
  it('no item is visible before its public time', () => {
    expect(wireVisibleAt(wire, 20, deadline)).toHaveLength(0);
    expect(wireVisibleAt(wire, 20, param('wirePublishMinute'))).toHaveLength(3);
    expect(wireVisibleAt(wire, 21, param('wirePublishMinute'))).toHaveLength(4);
    for (const i of wire) expect(i.publicDay * MINUTES_PER_DAY + i.publicMinute).toBeGreaterThanOrEqual(i.madeDay * MINUTES_PER_DAY + i.madeMinute);
  });
  it('filters to club, opponent, division and needs, and flags the ready list', () => {
    const f = filterWire(wire, { clubId: 3, opponentId: null, divisionTeamIds: [], needPositions: ['CB'], positionOf: (p) => (p === 2 ? 'CB' : 'WR'), readyList: new Set([3]) });
    expect(f.map((i) => i.eventId).sort()).toEqual(wire.map((i) => i.eventId).sort());
    expect(f.filter((i) => i.readyListFlag)).toHaveLength(2);
    expect(filterWire(wire, { clubId: 9, opponentId: 5, divisionTeamIds: [], needPositions: [], positionOf: () => undefined, readyList: new Set() })).toHaveLength(1);
  });
  it('money terms are misreported at about the starting rate', () => {
    const many = Array.from({ length: 4000 }, (_, i) => ev('player_signed', 30, { team: 1, actors: [i + 1], payload: { money_cents: 1 } }));
    const w = wireFromEvents(many, { types: TYPES, dayOf, stream: S('money') });
    const share = w.filter((i) => i.money!.misreported).length / w.length;
    expect(Math.abs(share - param('moneyErrorChance'))).toBeLessThan(0.015);
  });
});

const edge = (a: number, b: number, strength: number, sign: 'warm' | 'neutral' | 'cold' = 'warm'): RelationshipEdge =>
  ({ a, b, bTeamId: null, kind: 'worked_with', strength, sign, since: { seasonYear: 2029, dayIndex: 0 }, lastContact: { seasonYear: 2030, dayIndex: 0 }, basisEventIds: [1] });
const open = () => ({ candor: 100, discipline: 0 });

describe('X12.2.1 news reaches people through people and media', () => {
  it('public events reach the same competition at once and the other level only at X4 60+', () => {
    const recips = [{ personId: 1, competitionId: 1 }, { personId: 2, competitionId: 2 }];
    expect(publicDeliveries(ev('game_result', 5, { notability: 40 }), 5, 0, recips).map((d) => d.to)).toEqual([1]);
    const big = publicDeliveries(ev('game_result', 5, { notability: 60 }), 5, 0, recips, 77);
    expect(big.map((d) => [d.to, d.via])).toEqual([[1, 'official'], [2, 'media']]);
    expect(publicDeliveries(ev('game_result', 5, { witnesses: { kind: 'team', teamId: 1 } }), 5, 0, recips)).toEqual([]);
  });
  it('a room-only event reaches the user only through a warm chain, and no sooner than the hop delay (acceptance)', () => {
    const room = ev('locker_room_dispute', 50, { witnesses: { kind: 'room', teamId: 3, roomKey: 'r' } });
    const user = 99;
    const chain = [edge(10, 11, 100), edge(11, user, 100)];
    const d = spreadNonPublic(room, 50, [10], chain, open, S('spread', 1));
    const toUser = d.find((x) => x.to === user)!;
    expect(toUser.day).toBe(50 + 2 * param('hopDelayDays'));
    expect(toUser.viaPersonId).toBe(11);
    expect(spreadNonPublic(room, 50, [10], [edge(10, 11, 100), edge(11, user, 100, 'cold')], open, S('spread', 2)).some((x) => x.to === user)).toBe(false);
    expect(spreadNonPublic(room, 50, [10], [], open, S('spread', 3))).toEqual([]);
  });
  it('each hop degrades a detail at about the starting rate, and degraded stays degraded', () => {
    const room = ev('locker_room_dispute', 1, { witnesses: { kind: 'room', teamId: 3, roomKey: 'r' } });
    let deg = 0, n = 0, chainOk = true;
    for (let t = 0; t < 3000; t++) {
      const d = spreadNonPublic(room, 1, [1], [edge(1, 2, 100), edge(2, 3, 100)], open, S('deg', t));
      const h1 = d.find((x) => x.to === 2)!, h2 = d.find((x) => x.to === 3)!;
      n++; if (h1.accuracy === 'degraded') { deg++; if (h2.accuracy !== 'degraded') chainOk = false; }
    }
    expect(Math.abs(deg / n - param('hopDegradeChance'))).toBeLessThan(0.02);
    expect(chainOk).toBe(true);
  });
  it('a disciplined, guarded passer passes less often', () => {
    expect(passChance(100, 100, 0)).toBe(1);
    expect(passChance(100, 0, 100)).toBeLessThan(passChance(100, 100, 0));
    expect(passChance(0, 100, 0)).toBe(0);
  });
});

describe('C10.7.1 people you know', () => {
  it('a user with a strong edge to a general manager hears of a release before the wire at the configured rate', () => {
    const gm = 7, user = 1, N = 4000;
    let early = 0, wrong = 0;
    for (let t = 0; t < N; t++) {
      const rel = ev('player_released', 40, { team: 3, actors: [500] });
      const d = contactTip(rel, 40, param('wirePublishMinute'), user, [{ personId: gm, hasAccess: true, risk: 0 }], [edge(user, gm, 80)], S('tip', t));
      if (d) {
        early++;
        if (d.accuracy === 'degraded') wrong++;
        const lead = 40 * MINUTES_PER_DAY + param('wirePublishMinute') - (d.day * MINUTES_PER_DAY + d.minute);
        expect(lead).toBeGreaterThanOrEqual(param('contactLeadMinMinutes'));
        expect(lead).toBeLessThanOrEqual(param('contactLeadMaxMinutes'));
      }
    }
    expect(Math.abs(early / N - 0.8)).toBeLessThan(0.02);
    expect(Math.abs(wrong / early - param('contactErrorChance'))).toBeLessThan(0.02);
  });
  it('no access, no edge, or full risk: no tip; every delivery names a source', () => {
    const rel = ev('player_released', 40, {});
    expect(contactTip(rel, 40, 0, 1, [{ personId: 7, hasAccess: false, risk: 0 }], [edge(1, 7, 100)], S('t2'))).toBeNull();
    expect(contactTip(rel, 40, 0, 1, [{ personId: 7, hasAccess: true, risk: 0 }], [], S('t3'))).toBeNull();
    expect(contactTip(rel, 40, 0, 1, [{ personId: 7, hasAccess: true, risk: 1 }], [edge(1, 7, 100)], S('t4'))).toBeNull();
    const ds = spreadNonPublic(ev('locker_room_dispute', 1, { witnesses: { kind: 'none' } }), 1, [1], [edge(1, 2, 100)], open, S('t5'));
    expect(unsourcedDeliveries(ds)).toEqual([]);
  });
});

describe('X12.2.2 rumor against fact', () => {
  const base: Rumor = { id: 1, claim: 'hot_seat', aboutPersonIds: [200], aboutTeamIds: [4], outletId: 9, reportedDay: 10, confirmingType: 'head_coach_fired', status: 'reported', resolvedDay: null, confirmedByEventId: null };
  it('is confirmed by a later public event and marked "Did not happen" within one cycle otherwise', () => {
    const fired = ev('head_coach_fired', 12, { team: 4, actors: [200] });
    expect(resolveRumors([base], [fired], dayOf, 12)[0]!.status).toBe('confirmed');
    const open1 = resolveRumors([base], [], dayOf, 10 + param('rumorCycleDays') - 1)[0]!;
    expect(open1.status).toBe('reported');
    expect(resolveRumors([base], [], dayOf, 10 + param('rumorCycleDays'))[0]!.status).toBe('did_not_happen');
  });
  it('an event before the report does not confirm it', () => {
    expect(resolveRumors([base], [ev('head_coach_fired', 9, { actors: [200] })], dayOf, 12)[0]!.status).toBe('reported');
  });
  it('about an imported person only football results may be reported', () => {
    const origin = (id: number) => (id === 5 ? 'imported' as const : 'generated' as const);
    expect(rumorAllowed('hot_seat', [5], origin)).toBe(false);
    expect(rumorAllowed('football_result', [5], origin)).toBe(true);
    expect(rumorAllowed('hot_seat', [6], origin)).toBe(true);
  });
});

describe('C10.7.1 floor and C10.2.1 public injury view', () => {
  it('always shows club, opponent and linked people; the rest by notability', () => {
    const mk = (id: number, teams: number[], persons: number[]) => ({ id, date: { seasonYear: 2030, dayIndex: 1 }, kind: 'x', subjectPersonIds: persons, subjectTeamIds: teams, templateKey: 'k', params: {}, audience: 'media' as const, sourceEventIds: [id] });
    const items = [mk(1, [3], []), mk(2, [8], []), mk(3, [9], [42]), mk(4, [10], []), mk(5, [11], [])];
    const got = selectForInbox(items, { clubId: 3, opponentId: 8, linkedPersonIds: new Set([42]), notabilityOf: (i) => (i.id === 4 ? 70 : 10) });
    expect(got.map((i) => i.id)).toEqual([1, 2, 3, 4]);
  });
  it('inactives go public 90 minutes before kickoff and the staff note needs 10 filings', () => {
    expect(inactivesPublicAt(5, 60, MINUTES_PER_DAY)).toEqual([4, MINUTES_PER_DAY - 30]);
    const nine = Array.from({ length: 9 }, () => ({ status: 'questionable', played: true }));
    expect(staffNote(nine, 'questionable')).toBeNull();
    const eleven = [...nine, { status: 'questionable', played: true }, { status: 'out', played: false }];
    expect(staffNote(eleven, 'questionable')).toEqual({ status: 'questionable', listed: 10, playedAfter: 10, filings: 11 });
  });
});
