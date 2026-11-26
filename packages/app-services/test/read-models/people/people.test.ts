// G-72 acceptance for the people screens: the player card, roster, staff, locker room and owner models show
// estimates and words only (O4.1.1 to O4.5.1), pass the observer filter (G-27) and the Q1.4.2 crawler.
import { describe, expect, it } from 'vitest';
import {
  ReadModelRegistry, buildReadModel, crawlReadModels, crawlPassed, observerFor, tablesOf, pathsOfClass, walkSchema, PUBLIC_OBSERVER, ObservedWorld,
} from '../../../src/observer/index.ts';
import {
  buildCoachCard, buildLockerRoom, buildOwnerView, buildPlayerCard, buildRosterTable, buildStaff, peopleSpecs, PEOPLE_MODELS,
  type PeopleSources, type PlayerCardView, type IssueInput,
} from '../../../src/read-models/people/index.ts';
import { gmRequest, requestMeeting, writeNote } from '../../../src/commands/people/index.ts';
import { fixtureTables, HOME, AWAY, USER, ASSISTANT, AWAY_COACH, OWNER, HOME_PLAYERS, TRUE_ARM } from '../../observer/fixture-world.ts';
import { metaOf } from '@gm/schema';
import { PEOPLE_SCHEMAS, PlayerCardData, OwnerViewData, CoachCardData } from './data-schema.ts';

const worldFor = (tables: Record<string, unknown[]>, person: number) => {
  const src = tablesOf(tables);
  return new ObservedWorld(src, observerFor(src, person));
};

const sources: PeopleSources = {
  cardReads: (_c, personId) => ({
    knowledge: [{ conceptId: 'core:mesh', word: 'learning', lastPractised: { seasonYear: 2030, dayIndex: 9 }, mentalErrors: [], readyThisWeek: true }],
    person: {
      morale: { textKey: 'morale.unsettled', trend: 'down', reasons: [{ textKey: 'reason.lost_role', eventId: 500 }, { textKey: 'reason.private', eventId: 502 }] },
      personality: [{ traitKey: 'competitiveness', readKey: 'read.high', confidenceKey: 'conf.fair' }],
      offField: [{ eventId: 500, textKey: 'offfield.x' }],
      closestTeammates: personId === 101 ? [102] : [],
    },
  }),
  roster: (clubId) => (clubId === HOME ? { limits: { active: 5, practice_squad: 16 }, plan: { QB: 3, RB: 4 } } : null),
  owner: () => ({ goalKeys: ['goal.playoffs'], confidence: { textKey: 'confidence.uneasy', trend: 'down', reasons: [] }, gmPersonId: ASSISTANT }),
};
const registryFor = () => {
  const r = new ReadModelRegistry();
  for (const s of peopleSpecs(PEOPLE_SCHEMAS, sources)) r.register(s);
  return r;
};

describe('people read models register (P1.3.2)', () => {
  it('every field is classed and none is truth', () => {
    expect(registryFor().names().sort()).toEqual(Object.values(PEOPLE_MODELS).sort());
  });
  it('the card schema has no field from the true-attribute schema (O4.1.1 acceptance 1)', () => {
    expect(pathsOfClass(PlayerCardData, 'truth')).toEqual([]);
    const keys: string[] = [];
    walkSchema(PlayerCardData, (n) => { if (n.key) keys.push(n.key); });
    const banned = ['attributes', 'ceilings', 'hidden', 'conditioning', 'freshnessLongTerm', 'tests', 'severity', 'trueDaysToMilestone', 'lastingLoss'];
    expect(keys.filter((k) => banned.includes(k))).toEqual([]);
  });
  it('the coach card has no skill value and no K2 binding (O4.3.1 acceptance)', () => {
    const paths: string[] = [];
    walkSchema(CoachCardData, (n) => { paths.push(n.path); });
    expect(paths.filter((p) => /hidden|skill|aggression|rating/i.test(p))).toEqual([]);
  });
  it('the owner view holds no hot-seat number (O4.5.1 acceptance)', () => {
    const units = new Set<string>();
    const keys: string[] = [];
    walkSchema(OwnerViewData, (n) => { const u = metaOf(n.schema as never)?.unit; if (u) units.add(u); if (n.key) keys.push(n.key); });
    expect([...units].sort()).toEqual(['day_index', 'id', 'season_year']);
    const numeric = keys.filter((k) => /secur|hot|seat|score|rating|value/i.test(k));
    expect(numeric).toEqual([]);
  });
});

describe('player card (O4.1)', () => {
  const card = (tables = fixtureTables(), person = USER, clubId = HOME, pid = 101): PlayerCardView =>
    buildPlayerCard(worldFor(tables, person), clubId, pid, sources.cardReads!(clubId, pid)!, { coachId: USER })!;

  it('shows the grade the staff assigned, with grader and sample, never the true value', () => {
    const c = card();
    const g = c.grades.find((x) => x.attribute === 'arm_strength')!;
    expect(g.state).toBe('graded');
    if (g.state === 'graded') {
      expect(g.n).toBe(6);
      expect(g.grader).toBe('your staff');
      expect(g.text).toContain('your staff');
    }
    expect(JSON.stringify(c)).not.toContain(String(TRUE_ARM[101]));
    expect(c.measured).toContainEqual({ key: 'fortyS', value: 4.62, unit: 's' });
    expect(c.measured).toContainEqual({ key: 'heightIn', value: 74, unit: 'in' });
  });
  it('two players with different true values and the same view give identical cards', () => {
    const a = fixtureTables();
    const b = fixtureTables();
    const p = (b.people as { id: number; playing?: { attributes: Record<string, number> } }[]).find((x) => x.id === 101)!;
    for (const k of Object.keys(p.playing!.attributes)) p.playing!.attributes[k] = 99.5;
    expect(card(b)).toEqual(card(a));
  });
  it('header: own player has status and contract line; another club\'s player has neither', () => {
    const own = card();
    expect(own.ownPlayer).toBe(true);
    expect(own.header).toMatchObject({ name: 'First101 Last101', position: 'QB', status: 'active', jersey: 1, age: 21, heightIn: 74, weightLb: 215, experience: 0 });
    expect(own.header.contract).toEqual({ years: 1, throughYear: 2030, thisYearCents: 90000000 });
    const other = card(fixtureTables(), USER, HOME, 107);
    expect(other.ownPlayer).toBe(false);
    expect(other.header.contract).toBeNull();
    expect(other.header.status).toBeNull();
  });
  it('health: the staff\'s return range has two bounds; severity and true course never appear (O4.1.4)', () => {
    const c = card();
    expect(c.health.current).toHaveLength(1);
    expect(c.health.current[0]).toMatchObject({ designation: 'questionable', returnDays: [7, 21], typeId: 'core:hamstring' });
    expect(JSON.stringify(c.health)).not.toMatch(/grade 1|trueDays|lastingLoss/);
  });
  it('person tab: reasons the coach never saw are dropped (O4.1.5 acceptance)', () => {
    const c = card();
    expect(c.person!.morale!.reasons.map((r) => r.eventId)).toEqual([500]);
    expect(c.person!.personality).toHaveLength(1);
    expect(c.knowledge![0]!.word).toBe('learning');
  });
  it('an imported real-roster player has no off-field fields in his read model (A6)', () => {
    const t = fixtureTables();
    (t.people as { id: number; origin: string }[]).find((x) => x.id === 102)!.origin = 'imported';
    const c = card(t, USER, HOME, 102);
    expect(c.header.imported).toBe(true);
    expect(c.person).not.toHaveProperty('offField');
    expect(c.person).not.toHaveProperty('personality');
  });
  it('a designed player shows the designed mark; a rookie with no pro film says so', () => {
    const t = fixtureTables();
    (t.people as { id: number; origin: string }[]).find((x) => x.id === 103)!.origin = 'designed';
    const c = buildPlayerCard(worldFor(t, USER), HOME, 103, { noProFilm: true })!;
    expect(c.header.designed).toBe(true);
    expect(c.gradesNoteKey).toBe('card.grades.collegeAndCampOnly');
  });
  it('notes written by the club appear; a note command needs text', () => {
    const c = card();
    expect(c.notes.map((n) => n.textKey)).toEqual([`note.team${HOME}.p101`]);
    expect(writeNote(c, '  ').ok).toBe(false);
    expect(writeNote(c, 'Watch his footwork')).toEqual({ ok: true, type: 'WriteNote', payload: { personId: 101, text: 'Watch his footwork' } });
  });
});

describe('roster table (O4.2.1)', () => {
  it('counters equal direct counts of the roster lists; limits are shown, not enforced', () => {
    const t = fixtureTables();
    const v = buildRosterTable(worldFor(t, USER), HOME, sources.roster!(HOME)!);
    const direct = (t.rosterSlots as { teamId: number; list: string }[]).filter((s) => s.teamId === HOME && s.list === 'active').length;
    expect(v.limits.find((l) => l.list === 'active')).toEqual({ list: 'active', limit: 5, count: direct, over: direct > 5 });
    expect(v.rows.map((r) => r.personId).sort()).toEqual(HOME_PLAYERS);
    expect(v.rows.find((r) => r.personId === 101)!.designation).toBe('questionable');
    expect(v.subtotals).toEqual([{ position: 'QB', count: 6, planned: 3 }, { position: 'RB', count: 0, planned: 4 }]);
  });
});

describe('staff and coach card (O4.3.1)', () => {
  it('lists the club\'s seats by rung; a vacant seat names who covers it', () => {
    const t = fixtureTables();
    const jobs = t.jobs as Record<string, unknown>[];
    jobs.push({ ...jobs[1]!, id: 22, holderPersonId: null, holderSince: null, vacantSince: { seasonYear: 2030, dayIndex: 5 }, namedDeputyPersonId: ASSISTANT });
    const v = buildStaff(worldFor(t, USER), HOME, { coverCost: { '22': 'cover.cost.hours' } });
    expect(v.seats.map((s) => s.jobId)).toEqual([20, 21, 22]);
    expect(v.seats[2]).toMatchObject({ holderPersonId: null, coveringPersonId: ASSISTANT, coverCostKey: 'cover.cost.hours' });
    expect(v.seats[0]!.holderName).toBe(`Coach${USER} Last${USER}`);
  });
  it('the coach card shows the record with its sample and never a hidden parameter', () => {
    const c = buildCoachCard(worldFor(fixtureTables(), USER), HOME, ASSISTANT, { labels: { fourth_down: 'label.aggressive' } })!;
    expect(JSON.stringify(c)).not.toMatch(/aggression|blitzRate|hidden/);
    expect(c.systems).toEqual([{ familyId: 'core:west_coast', seasons: 2 }]);
    expect(c.contract).not.toBeNull();
    expect(c.record).toEqual([{ key: 'fourth_down', eventIds: [900 + ASSISTANT], labelKey: 'label.aggressive' }]);
    expect(c.noBook).toBe(false);
  });
  it('a coach with no record shows no book on him yet', () => {
    const t = fixtureTables();
    (t.people as { id: number; coaching?: { demonstratedRecord: unknown } }[]).find((x) => x.id === ASSISTANT)!.coaching!.demonstratedRecord = {};
    expect(buildCoachCard(worldFor(t, USER), HOME, ASSISTANT)!.noBook).toBe(true);
  });
  it('another club\'s coach: no relationship read and no contract line', () => {
    const c = buildCoachCard(worldFor(fixtureTables(), USER), HOME, AWAY_COACH)!;
    expect(c.relationship).toBeNull();
    expect(c.contract).toBeNull();
  });
});

describe('locker room (O4.4.1)', () => {
  const issue = (issueId: number, over: Partial<IssueInput>): IssueInput => ({
    issueId, kindKey: 'issue.role', personIds: [101], sourcePersonId: ASSISTANT, sourceKey: 'source.position_coach',
    reportedOn: { seasonYear: 2030, dayIndex: 0 }, responseLinks: ['people.meeting'], reachedPersonIds: [USER], ...over,
  });
  it('shows only issues reported to the coach, by a person he can see, on or before today', () => {
    const v = buildLockerRoom(worldFor(fixtureTables(), USER), HOME, USER, {
      issues: [
        issue(1, {}),
        issue(2, { reachedPersonIds: [ASSISTANT] }),
        issue(3, { reportedOn: { seasonYear: 2030, dayIndex: 5 } }), // after today (world day 0)
        issue(4, { sourcePersonId: 9999 }),
      ],
      lostRoom: { causeKeys: ['cause.broken_promises'] },
    });
    expect(v.issues.map((i) => i.issueId)).toEqual([1]);
    expect(v.issues[0]).not.toHaveProperty('reachedPersonIds');
    expect(v.lostRoom).toEqual({ causeKeys: ['cause.broken_promises'] });
  });
});

describe('owner and general manager (O4.5.1)', () => {
  it('names the owner, reads confidence in words, and shows a refusal reason only when refused', () => {
    const v = buildOwnerView(worldFor(fixtureTables(), USER), HOME, {
      ...sources.owner!(HOME)!,
      say: [{ moveKey: 'sign_free_agent', holderKey: 'general_manager' }, { moveKey: 'depth_chart', holderKey: 'coach' }],
      requests: [
        { requestId: 1, moveKey: 'sign_free_agent', phaseKey: 'in_season', state: 'refused', reasonKey: 'gm.reason.cap' },
        { requestId: 2, moveKey: 'trade', phaseKey: 'in_season', state: 'requested', reasonKey: 'leaked' },
      ],
    });
    expect(v.owner).toMatchObject({ personId: OWNER, name: `P${OWNER} L${OWNER}`, goalKeys: ['goal.playoffs'] });
    expect(v.owner.confidence!.textKey).toBe('confidence.uneasy');
    expect(v.gm.requests.map((r) => r.reasonKey)).toEqual(['gm.reason.cap', null]);
    expect(gmRequest(v, 'depth_chart', null).ok).toBe(false);
    expect(gmRequest(v, 'sign_free_agent', 101)).toEqual({ ok: true, type: 'GmRequest', payload: { moveKey: 'sign_free_agent', personId: 101, toPersonId: ASSISTANT } });
    expect(requestMeeting(v.owner.personId, 'meeting.owner').ok).toBe(true);
  });
});

describe('people read models through the filter (Q1.4.2)', () => {
  it('builds for the head coach from the world tables', () => {
    const world = tablesOf(fixtureTables());
    const b = buildReadModel<PlayerCardView | null>(registryFor(), world, observerFor(world, USER), PEOPLE_MODELS.playerCard, { clubId: HOME, personId: 101 });
    expect(b.model.data!.header.name).toBe('First101 Last101');
  });
  it('passes the crawler for every seat (no planted truth reaches any model)', () => {
    const world = tablesOf(fixtureTables());
    const observers = [USER, ASSISTANT, AWAY_COACH, 101].map((id) => ({ name: `person ${id}`, observer: observerFor(world, id) })).concat([{ name: 'public', observer: PUBLIC_OBSERVER }]);
    const r = crawlReadModels({
      registry: registryFor, source: world, observers,
      params: (name) => (name === PEOPLE_MODELS.playerCard || name === PEOPLE_MODELS.coachCard
        ? [{ clubId: HOME, personId: 101 }, { clubId: HOME, personId: 107 }, { clubId: AWAY, personId: 101 }, { clubId: HOME, personId: ASSISTANT }]
        : [{ clubId: HOME }, { clubId: AWAY }]),
    });
    expect(r.errors).toEqual([]);
    expect(r.schemaHits).toEqual([]);
    expect(r.sentinelHits).toEqual([]);
    expect(r.divergences).toEqual([]);
    expect(crawlPassed(r)).toBe(true);
  });
});
