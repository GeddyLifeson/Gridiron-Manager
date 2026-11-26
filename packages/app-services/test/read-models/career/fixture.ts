// A graduate assistant's own screens for the career read-model tests: his seat from the ladder core, a drafted
// contract, a run week, a health record with one open warning, a household with one family event, two balance
// sheets and a log of record events. Names, money and hours are made-up test values, not game data.
import { contract, ladder, life, market, positions, record, wealth } from '@gm/career';
import type { WorldDate, WorldEvent } from '@gm/schema';
import type {
  AssignmentsInput, CareerInput, CareerSources, ContractInput, FinanceInput, JobMarketInput, LifeInput, RecordInput,
} from '../../../src/read-models/career/index.ts';

export const COACH = 1;
export const GA_JOB = 'job:college.graduate_assistant';
const D = (seasonYear: number, dayIndex: number): WorldDate => ({ seasonYear, dayIndex });
export const dateText = (d: WorldDate): string => `${d.seasonYear} day ${d.dayIndex}`;

/** A fixed draw stream (contract drafting needs one). */
function draws(seed: number): { next(): number } {
  let a = seed >>> 0;
  return { next: () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; } };
}

export const seat = (jobId = GA_JOB, level: positions.CatalogueLevel = 'college'): ladder.SeatView =>
  ladder.seatView({ job: positions.CATALOGUE.job(jobId), level, flags: { callsPlays: false, hasRosterSay: false } });

export function careerInput(over: Partial<CareerInput> = {}): CareerInput {
  return {
    name: 'Sam Doyle', seat: seat(), jobId: GA_JOB, team: 'Rivertown',
    stints: [
      { startSeason: 2026, endSeason: 2027, jobId: 'job:college.student_assistant', team: 'Rivertown', level: 'college', how: 'hired_by_contact' },
      { startSeason: 2028, endSeason: null, jobId: GA_JOB, team: 'Rivertown', level: 'college', how: 'promoted_within' },
    ],
    network: [{ name: 'Ada Price', team: 'Rivertown', fromSeason: 2026, toSeason: 2027, nowJobId: 'job:college.quality_control.offense', nowTeam: 'Lakeport', imported: false }],
    audiences: [
      { audience: 'peers', regard: 80, known: 0.6, reasons: ['Every assignment in on time in 2027'] },
      { audience: 'media', regard: 70, known: 0, reasons: ['Quoted once in the student paper'] },
      { audience: 'recruits', regard: 60, known: 0.5, reasons: [] },
    ],
    enrolment: { state: { termsServed: 1, creditsCompleted: 9, yearsGranted: 2, status: 'active' }, rules: { degreeWindowYears: 7, minLoadShare: 0.5, termYears: 2, extensionSemesterHours: 24, maxYears: 3 } },
    ...over,
  };
}

const opening = (id: number, rung: number, prestige: number, stage: market.SearchStage = 'open'): market.Opening => ({
  id, teamId: 40 + id, seatId: 900 + id, level: 'college', rung, prestige, side: 'offense', region: 'Midwest', isHeadCoach: false,
  reason: 'promoted', posted: D(2028, 30), party: 'head_coach', stage, causeOpeningId: null, firmId: null,
});

export function marketInput(over: Partial<JobMarketInput> = {}): JobMarketInput {
  const card: market.OfferCard = {
    rung: 3, level: 'college', programStrength: 77, bossReportKeys: ['former_assistants_promoted'], salaryCents: 4_500_000, years: 1,
    callsPlays: false, staffSecurityKey: 'uncertain', whatChanges: market.whatChanges('college', 'college', true), offsetNote: false,
  };
  return {
    rights: seat().rights, current: { rung: 2, prestige: 5 },
    window: { open: true, until: D(2028, 60), next: null },
    openings: [opening(7, 3, 5), opening(8, 9, 9), opening(9, 3, 5, 'filled')],
    label: (o) => ({ team: `Team ${o.teamId}`, level: 'College', title: o.rung === 9 ? 'Head coach' : 'Quality control coach (offense)', payCents: o.rung === 3 ? 4_500_000 : null }),
    applications: [{ openingId: 7, personId: COACH, route: 'letter', date: D(2028, 31), bossLearned: false, response: 'pending' }],
    interviews: [],
    offers: [
      { offer: { id: 3, openingId: 7, personId: COACH, made: D(2028, 40), deadlineDay: 2028 * 1000 + 47, state: 'live', evidenceEventIds: [] }, card, team: 'Team 47', title: 'Quality control coach (offense)' },
      { offer: { id: 4, openingId: 8, personId: COACH, made: D(2028, 10), deadlineDay: 2028 * 1000 + 17, state: 'live', evidenceEventIds: [] }, card, team: 'Team 48', title: 'Head coach' },
    ],
    signs: [{ sign: 'owner_attends', date: D(2028, 20), source: 'news' }, { sign: 'leaks', date: D(2028, 35), source: 'inbox' }],
    today: D(2028, 41), dateText,
    ...over,
  };
}

export const contractOf = (): contract.CoachContract => ({
  ...contract.draftContract({ id: 1, coachId: COACH, employerId: 20, jobId: 30, seatId: 'head_coach', tier: 'pro', seat: 'head_coach', rung: 9, startYear: 2030, firstYearPayCents: 600_000_000 }, draws(7)),
  state: 'active',
});

export function contractInput(over: Partial<ContractInput> = {}): ContractInput {
  return { rights: seat().rights, contract: contractOf(), team: 'Harbor City', jobTitle: 'Head coach', leagueYear: 2031, ...over };
}

const LOG_TEAM = 3;
function ev(type: string, season: number, day: number, payload: WorldEvent['payload'], id: number): WorldEvent {
  const d = record.draftEvidence(type, { date: D(season, day), competitionId: 1, teamId: LOG_TEAM, tier: 1, source: 'user' }, COACH, payload);
  return { ...d, id, notability: null };
}
export function logEvents(): WorldEvent[] {
  return [
    ev(record.RECORD_EVENT.workProduct, 2027, 13, { product: 'film_tags', checked: 10, matched: 9, onTime: true }, 1),
    ev(record.RECORD_EVENT.workProduct, 2027, 20, { product: 'scout_cards', checked: 0, matched: 0, onTime: true }, 2),
    ev(record.RECORD_EVENT.evaluation, 2027, 14, { kind: 'grade', subjectPersonId: 50, matched: true }, 3),
  ];
}
export function recordInput(over: Partial<RecordInput> = {}): RecordInput {
  const events = logEvents();
  const rec = record.buildRecord(events, COACH, { seatAt: () => ({ rung: 2, callsPlays: false, duties: null }) });
  return {
    rights: seat().rights,
    seasons: [
      { season: 2027, team: 'Rivertown', jobTitle: 'Student assistant coach', wins: 6, losses: 6, ties: 0, finish: null },
      { season: 2026, team: 'Rivertown', jobTitle: 'Student assistant coach', wins: 8, losses: 4, ties: 0, finish: 'Bowl win' },
    ],
    record: rec, events, window: { fromSeason: 2026, toSeason: 2028 }, certified: [],
    ...over,
  };
}

export function sheets(): { date: string; sheet: wealth.BalanceSheet }[] {
  const a = wealth.openingSheet({ kind: 'graduate_assistant', studentDebtCents: 2_000_000 });
  const b: wealth.BalanceSheet = { ...a, cash: a.cash + 150_000, taxable: { index: 300_000, bonds: 100_000 } };
  return [{ date: '2027', sheet: a }, { date: '2028', sheet: b }];
}
export function financeInput(over: Partial<FinanceInput> = {}): FinanceInput {
  const e = (category: wealth.EntryCategory, amountCents: number, source: string): wealth.LedgerEntry => ({ month: 1, account: 'cash', category, amountCents, source });
  return {
    rights: seat().rights, currency: '$', sheets: sheets(),
    entries: [e('pay', 150_000, 'stipend'), e('pay', 150_000, 'stipend'), e('other_income', 30_000, 'camp'), e('withholding', -20_000, 'Federal'),
      e('withholding', -5_000, 'State'), e('rent', -80_000, 'landlord'), e('living', -40_000, 'living'), e('savings_transfer', -10_000, 'plan')],
    lastYear: { cash: 0.03, bonds: 0.04, index: 0.1, singleStocks: 0.2, realEstate: 0.05 },
    advisers: [{ name: 'Lee Morgan', feeShare: 0.01 }],
    offers: [{ id: 'o1', kind: 'speaking', terms: '$300 for a clinic talk', deadline: '20 March' }],
    settings: { riskLevel: 3, savingsRate: 0.1 }, yearlyTakeHomeCents: 1_800_000,
    ...over,
  };
}

const item = (taskId: string, category: string, hours: number, delegateId: number | null = null): life.WorkItem =>
  ({ taskId, category: category as life.WorkItem['category'], hours, priority: 1, delegateId });
export function weekResult(workPerDay = 10, sleep = 7): life.WeekResult {
  const days: life.DayPlan[] = Array.from({ length: 7 }, (_, i) => ({
    work: [item('film.opponentAll', 'film', workPerDay - 2), item('cards.scout', 'practice', 2), ...(i === 0 ? [item('cards.extra', 'practice', 1, 77)] : [])],
    travelHours: i === 5 ? 2 : 0, sleepHours: sleep, homeHours: 3, facilityNight: false,
  }));
  return life.runWeek({ days }, 4);
}
export function lifeInput(over: Partial<LifeInput> = {}): LifeInput {
  const subject = { personId: COACH, imported: false };
  const household = life.newHousehold(subject, [{ id: 501, role: 'parent', birthYear: 1960, occupation: 'none', tieRegion: 'Midwest' }]);
  const health: life.HealthRecord = {
    ...life.newHealthRecord(subject), state: 'atRisk',
    warnings: [{ created: 10, delivered: 11, route: 'teamPhysician', reviewWeek: 19, sleepTargetHours: 7, workTargetHours: 70, outcome: 'open' }],
    checkups: [{ week: 2, state: 'well', line: 'All clear.' }, { week: 11, state: 'watch', line: 'Blood pressure is up.' }],
  };
  return {
    rights: seat().rights, week: 12, result: weekResult(),
    history: Array.from({ length: 12 }, (_, i) => ({ week: i + 1, workHours: 60 + i * 3, meanSleepHours: 6.5 })),
    health, household,
    events: [{ event: { kind: 'parentCare', memberId: 501, week: 14, hours: 6, periodWeeks: 3, weight: 0.5, noticeDays: 7, inSeason: true }, date: 'week 14' }],
    template: [{ task: 'film', hours: 40 }, { task: 'practice', hours: 20 }],
    realism: life.DEFAULT_LIFE_REALISM,
    ...over,
  };
}

export function assignmentsInput(over: Partial<AssignmentsInput> = {}): AssignmentsInput {
  return { seat: seat(), week: 'game', jobTitle: 'Graduate assistant', bossName: 'Coach Reyes', freeHours: 6, ...over };
}

/** Sources for the spec: only the coach has inputs. */
export const sources = (): CareerSources => ({
  career: (id) => (id === COACH ? careerInput() : null),
  jobMarket: (id) => (id === COACH ? marketInput() : null),
  contract: (id) => (id === COACH ? contractInput() : null),
  record: (id) => (id === COACH ? recordInput() : null),
  finance: (id) => (id === COACH ? financeInput() : null),
  life: (id) => (id === COACH ? lifeInput() : null),
  assignments: (id) => (id === COACH ? assignmentsInput() : null),
});
