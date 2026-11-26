// A small test world: two teams, their staffs and players, and one row or more in every table that
// has private or hidden fields. Fixture values are test data, not facts: no number here is a
// real-world claim. True attributes are decimals so the sentinel search can mark them.
import { ATTRIBUTE_IDS } from '@gm/schema';
import { tablesOf, type TableSource } from '../../src/observer/index.ts';

const d = (dayIndex = 10, seasonYear = 2030) => ({ seasonYear, dayIndex });
export const HOME = 3;
export const AWAY = 5;
export const USER = 1;          // head coach of HOME
export const ASSISTANT = 2;     // position coach of HOME
export const AWAY_COACH = 10;   // head coach of AWAY
export const OWNER = 50;
export const AGENT = 60;
export const HOME_PLAYERS = [101, 102, 103, 104, 105, 106];
export const AWAY_PLAYERS = [107, 108, 109, 110, 111, 112];

/** True overall-like value per player, used by the toy AI tests. Not in rank order of id. */
export const TRUE_ARM: Record<number, number> = {
  101: 61.37, 102: 74.12, 103: 48.55, 104: 82.91, 105: 55.08, 106: 67.43, 107: 79.26, 108: 44.61, 109: 88.17, 110: 58.74, 111: 71.39, 112: 52.83,
};
/** What HOME's staff believes (their estimate): close to the truth but not in the same order. */
export const HOME_ESTIMATE: Record<number, number> = {
  101: 66, 102: 70, 103: 52, 104: 77, 105: 59, 106: 63, 107: 72, 108: 50, 109: 80, 110: 64, 111: 62, 112: 57,
};

const trait = (i: number) => ({
  facets: { competitiveness: 40 + (i % 50), coachability: 30 + ((i * 7) % 60) }, values: { winning: (i % 40) - 20 },
  goals: [{ goalId: 'start', target: `goal text ${i}`, byYear: 2032, intensity: 50 + (i % 40), status: 'active' }],
  schemaVersion: 1, source: 'generated',
});

function player(id: number) {
  const attrs = Object.fromEntries(ATTRIBUTE_IDS.map((a, k) => [a, Math.round((TRUE_ARM[id]! - 10 + ((k * 3.7 + id) % 20)) * 100) / 100 + 0.005]));
  return {
    id, origin: 'generated', externalRef: null, provenance: { generatorVersion: 'gen-1', seedHex: (id * 1000003).toString(16).padStart(16, '0') },
    name: { first: `First${id}`, last: `Last${id}`, suffix: null, nickname: null },
    birthDate: d(40, 2008), hometown: 'Generated Town', appearanceSeed: id, roles: ['player'], agentId: AGENT, diedYear: null,
    playing: {
      position: 'QB', lastJersey: id % 100, heightIn: 74, weightLb: 215, attributes: attrs,
      tests: { fortyS: 4.5 + (id % 7) / 31, tenSplitS: 1.55 + (id % 5) / 97, threeConeS: 7.01 + (id % 3) / 13, shuttleS: 4.21 + (id % 4) / 17, verticalIn: 30.5 + (id % 6) / 7, broadIn: 115.5 + (id % 9) / 11, changeOfDirectionZ: 0.11 + (id % 5) / 23 },
      ceilings: Object.fromEntries(ATTRIBUTE_IDS.map((a) => [a, Math.min(99.5, attrs[a]! + 6.25)])),
      hidden: { growthRate: 0.31 + (id % 9) / 41 }, conditioning: 60.5 + (id % 10) / 3, freshnessLongTerm: 0.71 + (id % 8) / 37,
      eligibility: { college: { seasonsOfCompetitionUsed: 2, clockStartYear: 2028, redshirtUsed: false }, pro: { seasonsOnRoster: 0, accruedSeasons: 0, creditedSeasons: 0 } },
    },
    history: { honourEventIds: [] }, traitBlock: trait(id),
  };
}

function coach(id: number, origin: 'user' | 'generated') {
  return {
    id, origin, externalRef: null, provenance: origin === 'user' ? null : { generatorVersion: 'gen-1', seedHex: (id * 999983).toString(16).padStart(16, '0') },
    name: { first: `Coach${id}`, last: `Last${id}`, suffix: null, nickname: null },
    birthDate: d(100, 1985), hometown: null, appearanceSeed: id, roles: ['coach'], agentId: null, diedYear: null,
    coaching: {
      side: 'offense', positionGroupTaught: 'QB', offensiveFamily: 'core:west_coast', defensiveFamily: null, systemFamilies: { 'core:west_coast': 2 },
      philosophyId: null, demonstratedRecord: { fourth_down: [900 + id] }, historyFacts: [],
      ...(origin === 'user' ? {} : { hidden: { aggression: 0.41 + id / 97, blitzRate: 0.27 + id / 89 } }),
    },
    life: { householdId: id === USER ? 1 : null, homeRegion: 'Generated Region' },
    history: { honourEventIds: [] },
    traitBlock: origin === 'user' ? { facets: {}, values: {}, goals: [], schemaVersion: 1, source: 'user' } : trait(id),
  };
}

const other = (id: number, role: string) => ({
  id, origin: 'generated', externalRef: null, provenance: { generatorVersion: 'gen-1', seedHex: (id * 7919).toString(16).padStart(16, '0') },
  name: { first: `P${id}`, last: `L${id}`, suffix: null, nickname: null }, birthDate: d(1, 1970), hometown: null, appearanceSeed: id, roles: [role],
  agentId: null, diedYear: null, history: { honourEventIds: [] }, traitBlock: trait(id),
});

const team = (id: number, owner: number | null, hcJob: number) => ({
  id, competitionId: 1, conferenceId: 1,
  identity: { name: `Town ${id}`, nickname: 'Testers', place: `Town ${id}`, abbreviation: `T${id}X`, colours: ['#112233'] },
  homeVenueId: 4, ownerPersonId: owner, athleticDirectorPersonId: null, presidentPersonId: null,
  finalSay: { roster: hcJob, contracts: null, draft: null, staffHiring: hcJob },
  resourceBand: 'middle', facilities: { training: 'core:band_b' }, rivalTeamIds: [], prestige: 0.37 + id / 53,
});

const job = (id: number, teamId: number, holder: number, rung: number) => ({
  id, teamId, catalogueId: rung === 9 ? 'core:pro_hc' : 'core:pro_qb_coach', positionId: rung === 9 ? 'core:head_coach' : 'core:qb_coach', rung,
  side: rung === 9 ? 'whole_team' : 'offense', positionGroup: rung === 9 ? 'none' : 'QB', dutyIds: rung === 9 ? ['duty.call_plays'] : ['duty.coach_position'],
  callsPlays: rung === 9, recruitsOffCampus: false, gamedaySeat: 'sideline', paid: 'salary', termLimitYears: null, reportsToJobId: rung === 9 ? null : 20,
  holderPersonId: holder, namedDeputyPersonId: null, holderSince: d(), vacantSince: null, holding: 'permanent',
});

const view = (observerTeamId: number, personId: number, estimate: number) => ({
  observerTeamId, observerPersonId: null, personId,
  perAttribute: { arm_strength: { estimate, confidence: 0.4, evidenceCount: 6, lastUpdated: d() } },
  publicMeasurements: { fortyS: 4.62 }, notes: [{ date: d(), staffId: 9, textKey: `note.team${observerTeamId}.p${personId}` }], sourceStaffIds: [9],
});

const event = (id: number, type: string, witnesses: unknown, actor: number, payload: Record<string, string | number | boolean | null>) => ({
  id, type, when: { date: d(), period: null, clockTenths: null }, competitionId: 1, where: { teamId: null, venueId: null },
  actors: [{ personId: actor, role: 'actor' }], subjects: [{ kind: 'person', id: actor }], payload, witnesses, causeId: null, notability: 10, tier: 1, source: 'sim',
});

const playerContract = (id: number, personId: number, teamId: number) => ({
  id, personId, teamId, signed: d(), agentId: AGENT, state: 'active', summaryKey: null,
  terms: {
    kind: 'player', form: 'veteran', signingBonusCents: 100000, signingBonusPaidOn: d(), offset: false, noTrade: false,
    years: [{ leagueYear: 2030, baseSalary: { amountCents: 90000000, guarantee: { skill: true, cap: true, injury: false } }, optionBonus: null, rosterBonuses: [], workoutBonusCents: 0, incentives: [], voidable: false, option: 'none' }],
  },
});

const coachContract = (id: number, personId: number, teamId: number, jobId: number, cents: number) => ({
  id, personId, teamId, signed: d(), agentId: null, state: 'active', summaryKey: null,
  terms: {
    kind: 'coach', jobId, salary: [{ leagueYear: 2030, amountCents: cents }], signingBonusCents: 0, incentives: [], guarantee: { type: 'full' }, offset: true,
    withCauseClauseKeys: [], buyout: [], clubOptionYear: null, coachOptionYear: null, authorityClauseKeys: [], staffTerms: { poolCents: 500000000, assistantsMayBring: 2 },
    perquisites: [], agentFeeShare: null,
  },
});

export function fixtureTables(): Record<string, unknown[]> {
  return {
    world: [{
      formatVersion: 1, masterSeedHex: '00000000000000aa', generatorOptions: { worldSize: 'small' }, calendar: d(0), engineVersion: '0.0.0', parameterSetVersion: 'p0',
      contentManifest: [{ packId: 'core', version: '1', hash: 'abc' }], settings: { worldSize: 'small', retentionProfile: 'standard' }, certified: true, userPersonId: USER,
      nextIds: { people: 200 },
    }],
    teams: [team(HOME, OWNER, 20), team(AWAY, null, 30)],
    cultures: [HOME, AWAY].map((teamId) => ({
      teamId, labelPreferences: { tough: 0.25 + teamId / 40 }, conductTolerance: { minor: 40 + teamId }, patienceSeasons: 2 + (teamId % 2), needWeightOverrides: {},
      expectation: { year: 2030, winsLow: 6, winsHigh: 9 + (teamId % 2), postseasonTarget: 'core:make_playoffs' }, traditionStrength: 50 + teamId,
    })),
    people: [coach(USER, 'user'), coach(ASSISTANT, 'generated'), coach(AWAY_COACH, 'generated'), other(OWNER, 'owner'), other(AGENT, 'agent'), ...[...HOME_PLAYERS, ...AWAY_PLAYERS].map(player)],
    personViews: [
      ...[...HOME_PLAYERS, ...AWAY_PLAYERS].map((p) => view(HOME, p, HOME_ESTIMATE[p]!)),
      ...[...HOME_PLAYERS, ...AWAY_PLAYERS].map((p) => view(AWAY, p, 100 - HOME_ESTIMATE[p]!)),
    ],
    personStates: [...HOME_PLAYERS, ...AWAY_PLAYERS].map((personId) => ({
      personId, needs: { belonging: 40 + (personId % 30) }, stress: 100 + personId, stressBand: 'calm', lastAct: null, coping: null,
    })),
    jobs: [job(20, HOME, USER, 9), job(21, HOME, ASSISTANT, 5), job(30, AWAY, AWAY_COACH, 9)],
    rosterSlots: [
      ...HOME_PLAYERS.map((personId) => ({ teamId: HOME, personId, list: 'active', jersey: personId % 100, gameDayStatus: 'active', since: d() })),
      ...AWAY_PLAYERS.map((personId) => ({ teamId: AWAY, personId, list: 'active', jersey: personId % 100, gameDayStatus: 'active', since: d() })),
    ],
    contracts: [playerContract(1, 101, HOME), coachContract(2, USER, HOME, 20, 400000000), coachContract(3, AWAY_COACH, AWAY, 30, 650000000), coachContract(4, ASSISTANT, HOME, 21, 30000000)],
    knowledge: [...HOME_PLAYERS, ...AWAY_PLAYERS].map((personId) => ({ personId, elementId: 'core:mesh', value: 40.25 + (personId % 17) * 2.5, lastPractised: d() })),
    injuries: [101, 107].map((personId, i) => ({
      id: i + 1, personId, typeId: 'core:hamstring', bodyRegion: 'leg', occurred: d(), play: null, mechanism: 'non_contact', severity: `grade ${i + 1}`,
      trueDaysToMilestone: { practice: 9 + i, game: 16 + i }, estimatedDays: [7 + i, 21 + i], designation: 'questionable', lastingLoss: { speed: 0.35 + i / 7 }, status: 'active',
    })),
    prospects: [{
      personId: 112, kind: 'draft', classYear: 2031, publicRating: 3, committedTeamId: null,
      teams: [
        { teamId: HOME, interest: 61, offered: true, visits: [d(3)], boardPosition: 4 },
        { teamId: AWAY, interest: 83, offered: false, visits: [], boardPosition: 1 },
      ],
    }],
    relationships: [{ a: USER, b: ASSISTANT, bTeamId: null, kind: 'worked_with', strength: 62, sign: 'warm', since: d(), lastContact: d(), basisEventIds: [] }],
    memories: [{ holderId: AWAY_COACH, eventId: 500, aboutPersonId: USER, aboutTeamId: null, category: 'slight', sign: -1, strength: 44, layer: 'short', formed: d(), lastFelt: d() }],
    reputations: [{ personId: USER, audience: 'peers', competitionId: null, regard: 55, known: 0.31, trend: 2, evidenceEventIds: [] }],
    openings: [{
      id: 1, teamId: AWAY, jobId: 31, opened: d(), stage: 'interviews', filledByPersonId: null,
      candidates: [{ personId: ASSISTANT, stage: 'interviewed', interviewEventIds: [501] }, { personId: 70, stage: 'considered', interviewEventIds: [] }],
    }],
    balanceSheets: [USER, AWAY_COACH].map((personId) => ({ personId, asOf: d(), cashCents: 1234500 + personId, assets: [], liabilities: [], lifestyleTier: 'modest', creditStanding: 'good' })),
    households: [{ id: 1, headPersonId: USER, homePlace: 'Generated Town', members: [{ personId: 80, relationship: 'spouse', satisfaction: 64, needs: { time: 55 } }] }],
    inbox: [USER, AWAY_COACH].map((ownerPersonId, i) => ({
      id: i + 1, ownerPersonId, kind: 'message', senderPersonId: null, subjectKey: `inbox.subject.${ownerPersonId}`, bodyKey: 'inbox.body', params: {}, received: d(), deadline: null,
      priority: 'normal', requiredCommand: null, defaultCommand: null, state: 'unread', links: [], sourceEventId: null,
    })),
    philosophies: [{ id: 1, personId: AWAY_COACH, written: d(), statements: [{ key: 'effort', textKey: 'phil.effort' }], teamRules: [{ ruleKey: 'late', consequenceKey: 'run' }], standards: ['finish'] }],
    events: [
      event(500, 'game.result', { kind: 'public' }, USER, { margin: 7 }),
      event(501, 'career.interview', { kind: 'people', personIds: [ASSISTANT] }, AWAY_COACH, { went: 'well' }),
      event(502, 'team.meeting', { kind: 'team', teamId: AWAY }, AWAY_COACH, { install: 'new blitz package' }),
      event(503, 'staff.meeting', { kind: 'room', teamId: HOME, roomKey: 'staff' }, USER, { plan: 'attack the boundary' }),
      event(504, 'private.thought', { kind: 'none' }, AWAY_COACH, { mood: 'angry' }),
    ],
    games: [{
      id: 7, competitionId: 1, seasonYear: 2030, week: 1, kickoff: d(20), teamIds: [HOME, AWAY], venueId: 4, neutralSite: false, phase: 'regular', status: 'scheduled',
      environment: null, seedHex: 'feedfacecafebeef', crewId: null, finalScore: null, stateHash: null, tier: 1,
    }],
    playGrades: [
      { gameId: 7, playIndex: 1, personId: 101, graderPersonId: ASSISTANT, graderTeamId: HOME, assignmentCorrect: true, technique: 'plus', effort: 'normal', mentalError: false, reasonCodes: [], note: 'home grade' },
      { gameId: 7, playIndex: 1, personId: 101, graderPersonId: AWAY_COACH, graderTeamId: AWAY, assignmentCorrect: false, technique: 'minus', effort: 'loaf', mentalError: true, reasonCodes: ['late'], note: 'away grade' },
    ],
    evaluations: [{ byPersonId: AWAY_COACH, aboutPersonId: 70, periodStart: d(0), periodEnd: d(9), criteria: { teaching: 'good' }, textKey: 'eval.text', evidenceEventIds: [] }],
    ledger: [{ personId: AWAY_COACH, date: d(), kind: 'salary', amountCents: 5000000, refId: null }],
    tiers: [{ subjectKind: 'team', subjectId: HOME, tier: 1, since: d() }],
    settings: [{ key: 'ui.text_size', type: 'number', default: 14, range: [10, 24], options: null, scope: 'user', group: 'display', lockedInCertified: false, explanationKey: 'settings.text_size' }],
  };
}

export const fixtureWorld = (): TableSource => tablesOf(fixtureTables());
