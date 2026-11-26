// One valid sample row per world schema, for the round-trip test. Fixture values are test data, not
// facts: no number here is a real-world claim.
import { ATTRIBUTE_IDS } from '../../src/index.ts';

const d = (dayIndex = 10, seasonYear = 2030) => ({ seasonYear, dayIndex });
const g = { skill: true, cap: true, injury: false };
const attrs = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 50]));
const tests = { fortyS: 4.6, tenSplitS: 1.6, threeConeS: 7.1, shuttleS: 4.3, verticalIn: 33, broadIn: 118, changeOfDirectionZ: 0 };

export const traitBlock = {
  facets: { competitiveness: 70, coachability: 55 }, values: { winning: 20, money: -5 },
  goals: [{ goalId: 'become_coordinator', target: 'core:rung_7', byYear: 2034, intensity: 60, status: 'active' }],
  schemaVersion: 1, source: 'generated',
};

export const generatedPlayer = {
  id: 101, origin: 'generated', externalRef: null,
  provenance: { generatorVersion: 'gen-1', seedHex: '0123456789abcdef' },
  name: { first: 'Avery', last: 'Testman', suffix: null, nickname: null },
  birthDate: d(40, 2008), hometown: 'Generated Town', appearanceSeed: 77, roles: ['player'], agentId: null, diedYear: null,
  playing: {
    position: 'QB', lastJersey: 12, heightIn: 75, weightLb: 220, attributes: attrs, tests, ceilings: attrs,
    hidden: { growthRate: 0.4 }, conditioning: 60, freshnessLongTerm: 0.9,
    eligibility: { college: { seasonsOfCompetitionUsed: 2, clockStartYear: 2028, redshirtUsed: false }, pro: { seasonsOnRoster: 0, accruedSeasons: 0, creditedSeasons: 0 } },
  },
  history: { honourEventIds: [] },
  traitBlock,
};

export const userCoach = {
  id: 1, origin: 'user', externalRef: null, provenance: null,
  name: { first: 'Sam', last: 'User', suffix: null, nickname: null },
  birthDate: d(100, 1995), hometown: null, appearanceSeed: 5, roles: ['coach'], agentId: null, diedYear: null,
  coaching: {
    side: 'offense', positionGroupTaught: 'QB', offensiveFamily: 'core:west_coast', defensiveFamily: null,
    systemFamilies: { 'core:west_coast': 2 }, philosophyId: null, demonstratedRecord: {}, historyFacts: [],
  },
  life: { householdId: null, homeRegion: 'Generated Region' },
  history: { honourEventIds: [] },
  traitBlock: { facets: {}, values: {}, goals: [], schemaVersion: 1, source: 'user' },
};

export const samples: Record<string, unknown> = {
  'world:TraitBlock': traitBlock,
  'world:GoalRecord': traitBlock.goals[0],
  'world:PersonRecord': generatedPlayer,
  'world:PersonView': {
    observerTeamId: 3, observerPersonId: null, personId: 101,
    perAttribute: { accuracy_deep: { estimate: 55, confidence: 0.4, evidenceCount: 6, lastUpdated: d() } },
    publicMeasurements: { fortyS: 4.62 }, notes: [{ date: d(), staffId: 9, textKey: 'note.quick_release' }], sourceStaffIds: [9],
  },
  'world:WorldRecord': {
    formatVersion: 1, masterSeedHex: '00000000000000aa', generatorOptions: { worldSize: 'standard' }, calendar: d(0),
    engineVersion: '0.0.0', parameterSetVersion: 'p0', contentManifest: [{ packId: 'core', version: '1', hash: 'abc' }],
    settings: { worldSize: 'standard', retentionProfile: 'standard' }, certified: false, userPersonId: 1, nextIds: { people: 102 },
  },
  'world:CompetitionRecord': { id: 1, name: 'Generated League', level: 'pro', ruleSetId: 'pro', leagueRulesId: 'pro', conferenceIds: [1], teamIds: [3], seasonFormat: 'core:pro_regular', postseasonFormat: 'core:pro_playoffs' },
  'world:ConferenceRecord': { id: 1, competitionId: 1, parentId: null, name: 'East', kind: 'conference', teamIds: [3] },
  'world:VenueRecord': { id: 4, name: 'Generated Field', place: 'Generated Town', surfaceType: 'core:grass', roof: 'open', altitudeFt: 500, capacity: 60000, noiseBase: 0.5, climateId: null },
  'world:TeamRecord': {
    id: 3, competitionId: 1, conferenceId: 1,
    identity: { name: 'Generated Town', nickname: 'Testers', place: 'Generated Town', abbreviation: 'GTT', colours: ['#112233'] },
    homeVenueId: 4, ownerPersonId: 50, athleticDirectorPersonId: null, presidentPersonId: null,
    finalSay: { roster: null, contracts: null, draft: null, staffHiring: null },
    resourceBand: 'middle', facilities: { training: 'core:band_b' }, rivalTeamIds: [], prestige: 0.5,
  },
  'world:SeasonRecord': { competitionId: 1, year: 2030, gameIds: [7], awardEventIds: [], archive: 'live' },
  'world:CultureRecord': {
    teamId: 3, labelPreferences: { tough: 0.5 }, conductTolerance: { minor: 40 }, patienceSeasons: 2, needWeightOverrides: {},
    expectation: { year: 2030, winsLow: 6, winsHigh: 9, postseasonTarget: 'core:make_playoffs' }, traditionStrength: 50,
  },
  'world:TierRow': { subjectKind: 'team', subjectId: 3, tier: 1, since: d() },
  'world:JobRecord': {
    id: 20, teamId: 3, catalogueId: 'core:pro_hc', positionId: 'core:head_coach', rung: 9, side: 'whole_team', positionGroup: 'none',
    dutyIds: ['duty.call_plays'], callsPlays: true, recruitsOffCampus: false, gamedaySeat: 'sideline', paid: 'salary', termLimitYears: null,
    reportsToJobId: null, holderPersonId: 1, namedDeputyPersonId: null, holderSince: d(), vacantSince: null, holding: 'permanent',
  },
  'world:PositionDefinition': {
    id: 'core:head_coach', appointer: 'owner', reportsTo: null, requiredForGame: true,
    successionRule: [{ kind: 'named_deputy' }, { kind: 'role', positionId: 'core:assistant_head_coach' },
      { kind: 'role_group', group: 'coordinators', side: null, order: 'years_in_chair' }, { kind: 'appointer_pick', outsideAllowed: true }],
    interimAllowed: 'yes', maxCountKey: null,
  },
  'world:RosterSlot': { teamId: 3, personId: 101, list: 'active', jersey: 12, gameDayStatus: 'active', since: d() },
  'world:DepthChartRecord': { teamId: 3, unitId: 'core:11_personnel', roles: { QB: [101] }, rotation: [{ role: 'QB', personIds: [101], ruleKey: 'starter', share: null }], updated: d() },
  'world:KnowledgeRow': { personId: 101, elementId: 'core:mesh', value: 40, lastPractised: d() },
  'world:InjuryRecord': {
    id: 30, personId: 101, typeId: 'core:ankle_sprain', bodyRegion: 'ankle', occurred: d(), play: { gameId: 7, playIndex: 14 },
    mechanism: 'tackle', severity: 'moderate', trueDaysToMilestone: { return_to_play: 18 }, estimatedDays: [14, 28],
    designation: 'questionable', lastingLoss: {}, status: 'active',
  },
  'world:ProspectRecord': {
    personId: 101, kind: 'recruit', classYear: 2028, publicRating: 4, committedTeamId: null,
    teams: [{ teamId: 3, interest: 55, offered: true, visits: [d(200, 2027)], boardPosition: 2 }],
  },
  'world:ContractRecord': {
    id: 40, personId: 101, teamId: 3, signed: d(), agentId: null, state: 'active', summaryKey: null,
    terms: {
      kind: 'player', form: 'veteran', signingBonusCents: 500_000_00, signingBonusPaidOn: d(), offset: false, noTrade: false,
      years: [{
        leagueYear: 2030, baseSalary: { amountCents: 1_000_000_00, guarantee: g }, optionBonus: null,
        rosterBonuses: [{ basis: 'per_game', date: null, amountCents: 10_000_00, guarantee: { skill: false, cap: false, injury: false } }],
        workoutBonusCents: 0, incentives: [{ id: 'i1', triggerKey: 'stat.passing_yards', threshold: 4000, amountCents: 250_000_00, likelyToBeEarned: false }],
        voidable: false, option: 'none',
      }],
    },
  },
  'world:WorldEvent': {
    id: 1000, type: 'fourth_down_decision', when: { date: d(), period: 4, clockTenths: 1200 }, competitionId: 1,
    where: { teamId: 3, venueId: 4 }, actors: [{ personId: 1, role: 'caller' }], subjects: [{ kind: 'game', id: 7 }],
    payload: { yardsToGo: 2, choice: 'go', converted: true }, witnesses: { kind: 'public' }, causeId: null, notability: null, tier: 1, source: 'sim',
  },
  'world:EventTypeDef': {
    id: 'fourth_down_decision', family: 'game', payloadSchema: { yardsToGo: 'number', choice: 'string', converted: 'boolean' },
    witnessRule: 'public', lineTemplate: 'event.fourth_down_decision', harmClass: 'none', importedAllowed: true, minTier: 2,
    consumers: ['models/decisions'], compactable: true,
  },
  'world:SeasonLogHash': { year: 2030, eventCount: 1, lastEventId: 1000, hashHex: 'deadbeef' },
  'world:GameRecord': {
    id: 7, competitionId: 1, seasonYear: 2030, week: 3, kickoff: d(), teamIds: [3, 5], venueId: 4, neutralSite: false, phase: 'regular',
    status: 'final', environment: null, seedHex: 'fedcba9876543210', crewId: null, finalScore: [24, 17], stateHash: 'h', tier: 1,
  },
  'world:GameDriveRow': {
    gameId: 7, drive: { driveNumber: 1, side: 0, startPeriod: 1, startClockTenths: 9000, startX: 25, plays: 8, yards: 75, clockUsedTenths: 2700, result: 'touchdown' },
  },
  'world:TrajectoryRef': { gameId: 7, playIndex: 14, formatVersion: 1, state: 'stored', byteLength: 4096 },
  'world:TendencyCell': { teamId: 3, seasonYear: 2030, situationBucket: '1st_10', callKey: 'run|11', count: 12, results: { successRate: 0.5 } },
  'world:PlayerPlayGrade': {
    gameId: 7, playIndex: 14, personId: 101, graderPersonId: 9, graderTeamId: 3, assignmentCorrect: true, technique: 'plus',
    effort: 'normal', mentalError: false, reasonCodes: [], note: null,
  },
  'world:DecisionGrade': {
    gameId: 7, playIndex: 40, actorPersonId: 1, decisionType: 'fourth_down', optionTaken: 'go',
    options: [{ optionId: 'go', value: 0.61, uncertainty: 0.03 }, { optionId: 'punt', value: 0.55, uncertainty: 0.02 }], modelId: 'wp-1',
  },
  'world:SuggestionRecord': { id: 2, actorPersonId: 1, ownerPersonId: 60, wrappedCommandId: 55, submitted: d(), response: 'pending', outcomeEventIds: [] },
  'world:SeasonStatSummary': { personId: 101, teamId: 3, competitionId: 1, seasonYear: 2030, totals: { passing_yards: 3800 }, gamesPlayed: 17, writtenAt: d(360) },
  'world:JobHistoryRow': {
    personId: 1, jobId: 20, teamId: 3, catalogueId: 'core:pro_hc', started: d(), ended: null, seasons: 0, wins: 0, losses: 0, ties: 0,
    exitReason: 'current', exitEventId: null,
  },
  'world:RelationshipEdge': {
    a: 1, b: 101, bTeamId: null, kind: 'coached', strength: 30, sign: 'warm', since: d(), lastContact: d(), basisEventIds: [1000],
  },
  'world:CohesionRow': { teamId: 3, seasonYear: 2030, unitKey: 'offensive_line', a: 110, b: 111, snapsTogether: 300 },
  'world:MemoryRow': {
    holderId: 101, eventId: 1000, aboutPersonId: 1, aboutTeamId: null, category: 'game', sign: 1, strength: 40, layer: 'short', formed: d(), lastFelt: d(),
  },
  'world:PersonState': { personId: 101, needs: { playing_time: 10 }, stress: 120, stressBand: 'calm', lastAct: null, coping: null },
  'world:PromiseRecord': { id: 3, fromPersonId: 1, toPersonId: 101, subjectKey: 'promise.starting_role', made: d(), due: d(200), status: 'open', madeEventId: 1000 },
  'world:ReputationRow': { personId: 1, audience: 'fans', competitionId: 1, regard: 50, known: 0.2, trend: 3, evidenceEventIds: [1000] },
  'world:JobOpening': {
    id: 8, teamId: 3, jobId: 20, opened: d(), stage: 'interviews',
    candidates: [{ personId: 1, stage: 'interviewed', interviewEventIds: [1000] }], filledByPersonId: null,
  },
  'world:LedgerEntry': { personId: 1, date: d(), kind: 'salary', amountCents: 125_000_00, refId: 40 },
  'world:BalanceSheet': {
    personId: 1, asOf: d(), cashCents: -1000, assets: [{ id: 1, kind: 'real_estate', valueCents: 400_000_00 }],
    liabilities: [{ id: 2, kind: 'mortgage', balanceCents: 300_000_00 }], lifestyleTier: 'modest', creditStanding: 'good',
  },
  'world:HouseholdRecord': {
    id: 1, headPersonId: 1, homePlace: 'Generated Town',
    members: [{ personId: 70, relationship: 'spouse', satisfaction: 60, needs: { time_together: 30 } }],
  },
  'world:InboxItem': {
    id: 1, ownerPersonId: 1, kind: 'decision', senderPersonId: 50, subjectKey: 'inbox.owner_meeting.subject', bodyKey: 'inbox.owner_meeting.body',
    params: { week: 3 }, received: d(), deadline: d(12), priority: 'high', requiredCommand: 'AnswerMeeting', defaultCommand: 'DeclineMeeting',
    state: 'unread', links: ['/office'], sourceEventId: null,
  },
  'world:NewsItem': {
    id: 1, date: d(), kind: 'game_result', subjectPersonIds: [], subjectTeamIds: [3, 5], templateKey: 'news.game_result',
    params: { home: 24, away: 17 }, audience: 'fans', sourceEventIds: [1000],
  },
  'world:EvaluationRecord': {
    byPersonId: 60, aboutPersonId: 1, periodStart: d(0), periodEnd: d(120), criteria: { preparation: 'meets' }, textKey: 'eval.midseason', evidenceEventIds: [],
  },
  'world:PhilosophyRecord': {
    id: 1, personId: 1, written: d(), statements: [{ key: 'run_first', textKey: 'phil.run_first' }],
    teamRules: [{ ruleKey: 'on_time', consequenceKey: 'sit_first_series' }], standards: ['effort'],
  },
  'world:NotabilityRollup': { subjectKind: 'person', subjectId: 1, seasonYear: 2030, topEventIds: [1000], countsByBand: { notable: 1 }, honourCounters: {} },
  'world:ScreenRecord': {
    id: 'office', titleKey: 'screen.office', hub: 'office', route: '/office', readModelKeys: ['worldSummary'], taskIds: [], levels: ['college', 'pro'],
    rungs: [0, 9], shortcut: 'g o', helpKey: null, secondWindowAllowed: false,
  },
  'world:SettingRecord': {
    key: 'display.grade_scale', type: 'enum', default: 'percent', range: null, options: ['percent', 'zero_to_four'], scope: 'user', group: 'display',
    lockedInCertified: false, explanationKey: 'settings.grade_scale',
  },
  'world:KeyBinding': { actionId: 'advance_day', context: 'office', defaultKey: 'Space', userKey: null },
  'world:TemplateText': { key: 'news.game_result', text: '{home} to {away}', levelVariants: {}, rungVariants: {}, parameters: ['home', 'away'] },
};
