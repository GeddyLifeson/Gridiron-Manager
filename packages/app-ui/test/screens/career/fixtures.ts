// Fixture read models for the career screens. Numbers are made-up test values, not game data.
import type { AssignmentsView, CareerView, ContractView, FinanceView, JobMarketView, LifeView, RecordView } from '../../../src/screens/career/index.ts';

export const SELF = ['market.apply', 'market.answer_offer', 'market.year_out', 'career.export', 'finance.plan', 'finance.answer_offer', 'life.template'];

export const careerView = (rights = SELF): CareerView => ({
  rights, name: 'Sam Doyle', level: 'College', jobTitle: 'Graduate assistant',
  ladder: {
    college: [{ rung: 1, title: 'Student assistant', current: false, held: true }, { rung: 2, title: 'Graduate assistant', current: true, held: true }, { rung: 9, title: 'Head coach', current: false, held: false }],
    pro: [{ rung: 9, title: 'Head coach', current: false, held: false }],
  },
  history: [{ season: 2026, endSeason: 2027, jobTitle: 'Student assistant', team: 'Rivertown', level: 'College', how: 'hired_by_contact' }, { season: 2028, endSeason: null, jobTitle: 'Graduate assistant', team: 'Rivertown', level: 'College', how: 'promoted_within' }],
  network: [{ name: 'Ada Price', together: 'Rivertown 2026-2027', nowJob: 'Quality control', nowTeam: 'Lakeport', imported: false }],
  reputation: [{ group: 'coaches', word: 'known as a hard worker', reasons: ['every assignment on time in 2027'] }],
  enrolment: { line: 'Graduate term: one year left, 9 credit hours this term.' },
});

export const jobMarketView = (rights = SELF, out = false): JobMarketView => ({
  rights, windowOpen: true, windowLine: 'open until 14 February',
  openings: [
    { id: 7, level: 'College', team: 'Lakeport', rung: 3, title: 'Quality control (offense)', side: 'offense', region: 'Midwest', party: 'head_coach', reason: 'promoted', stage: 'open', payCents: 4_500_000, fit: 'step_up', applied: false },
    { id: 8, level: 'Pro', team: 'Harbor City', rung: 2, title: 'Coaching assistant', side: 'support', region: 'East', party: 'head_coach', reason: 'left', stage: 'interviewing', payCents: null, fit: 'step_down_title_up_level', applied: true },
  ],
  applications: [{ openingId: 8, route: 'letter', date: '2 January', response: null }],
  interviews: [],
  offers: [{ offerId: 3, team: 'Lakeport', level: 'College', title: 'Quality control (offense)', rung: 3, salaryCents: 4_500_000, years: 1, callsPlays: false, bossReportKeys: ['former_assistants_promoted'], staffSecurityKey: 'uncertain', whatChanges: [], offsetNote: false, deadline: '9 January', state: 'live' }],
  signs: [{ sign: 'owner_attends', date: '3 November', source: 'local paper' }],
  yearOut: out ? [{ id: 'visit_staffs', weeklyHours: 15, onField: false }, { id: 'lower_job', weeklyHours: 70, onField: true }] : null,
});

export const contractView = (rights = SELF): ContractView => ({ rights, team: 'Rivertown', jobTitle: 'Graduate assistant', terms: [{ label: 'Stipend', value: '$1,500 a month' }], yearsLeft: 1, clauses: ['Tuition paid'] });
export const recordView = (rights = SELF): RecordView => ({
  rights,
  seasons: [{ season: 2026, team: 'Rivertown', jobTitle: 'Student assistant', wins: 8, losses: 4, ties: 0, finish: 'Bowl win' }, { season: 2027, team: 'Rivertown', jobTitle: 'Student assistant', wins: 6, losses: 6, ties: 0, finish: 'No bowl' }],
  families: [{ family: 'teaching', lines: [] }, { family: 'evaluation', lines: ['Film tags matched the staff key on 9 of 10 assignments'] }],
  certified: [],
});
export const financeView = (rights = SELF): FinanceView => ({
  rights, currency: '$',
  netWorth: [{ date: '2026', cents: 200_000 }, { date: '2027', cents: 350_000 }],
  income: [{ source: 'stipend', cents: 1_800_000 }], taxes: [{ place: 'State', cents: 90_000 }], spending: [{ item: 'rent', cents: 960_000 }],
  holdings: [{ name: 'Savings account', risk: 'low', valueCents: 350_000, returnPct: 1.5 }], advisers: [],
  offers: [{ id: 'o1', kind: 'speaking', terms: '$300 for a clinic talk', deadline: '20 March' }],
  plan: { savingRatePct: 10, risk: 'low' }, projection: { years: 10, range: { lowCents: 1_000_000, midCents: 3_000_000, highCents: 6_000_000 } },
});
export const lifeView = (rights = SELF): LifeView => ({
  rights, week: 'Week 4', hours: [{ task: 'film', hours: 22 }, { task: 'practice', hours: 18 }], hoursAvailable: 100,
  sleep: { word: 'short', trend: 'worse' }, energy: { word: 'worn', trend: 'same' }, health: [], family: [{ event: 'Sister’s wedding', date: '12 October', owed: 'a weekend' }],
  template: [{ task: 'film', hours: 20 }], effects: [{ id: 'tired_takes_in_less', line: 'Tired: takes in fewer staff reports a day' }],
});
export const assignmentsView = (rows: AssignmentsView['rows'], rights: readonly string[]): AssignmentsView => ({ rights, jobTitle: 'Graduate assistant', bossName: 'Coach Reyes', freeHours: 6, rows });

export const loaders = (rights: readonly string[] = SELF) => ({
  career: () => careerView([...rights]), jobMarket: () => jobMarketView([...rights]), contract: () => contractView([...rights]),
  record: () => recordView([...rights]), finance: () => financeView([...rights]), life: () => lifeView([...rights]),
});
