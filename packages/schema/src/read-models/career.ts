// The zod schemas of the coach's own screens and the assignment list (O4.6, O7.6.1, O7.2.1), with a
// visibility class on every field. Mirrors app-services read-models/career/types.ts. These models build only
// for the coach himself (app-services career spec), so his own career, contract, money and life are own_team.
// Public: what anyone can read about an opening (team, level, title, side, region, stage) and the ladder.
// Estimate: his reputation words, which are his reading of how audiences see him (E5, X2.3.1). No skill value,
// level number, market value, prestige or hidden health state appears here (A3 ruling 21, MA-48, E8.2.1).
import { z } from 'zod';
import { pub, own, est } from '../field.ts';

const int = () => z.number().int();
const text = () => own(z.string());
const ptext = () => pub(z.string());
const flag = () => own(z.boolean());
const cents = () => own(int(), 'cents');
const hours = () => own(z.number().min(0), 'count');
const rights = () => own(z.array(z.string()));
const STATE = ['yours', 'assigned', 'suggest', 'read'] as const;
const TREND = ['better', 'same', 'worse'] as const;

const AssignmentRow = z.object({
  dutyId: text(), title: text(), leaf: text(), assignedBy: own(z.enum(['boss', 'self'])),
  due: own(z.object({ day: text(), time: text() }).strict()).nullable(),
  hoursEst: own(z.number().min(0), 'count'), state: own(z.enum(STATE)), status: own(z.enum(['open', 'submitted', 'graded', 'late'])),
  screenId: text(), command: text().nullable(),
  grade: own(z.object({ mark: text(), feedback: text() }).strict()).nullable().optional(),
}).strict();
export const CoachAssignmentsData = z.object({
  rights: rights(), jobTitle: text(), bossName: text().nullable(), freeHours: own(z.number().min(0), 'count'), rows: own(z.array(AssignmentRow)),
}).strict().nullable();

const Rung = z.object({ rung: pub(int().min(0).max(9), 'index'), title: ptext(), current: flag(), held: flag() }).strict();
export const CoachCareerData = z.object({
  rights: rights(), name: text(), level: text(), jobTitle: text(),
  ladder: pub(z.object({ college: pub(z.array(Rung)), pro: pub(z.array(Rung)) }).strict()),
  history: own(z.array(z.object({ season: own(int(), 'season_year'), endSeason: own(int(), 'season_year').nullable(), jobTitle: text(), team: text(), level: text(), how: text() }).strict())),
  network: own(z.array(z.object({ name: text(), together: text(), nowJob: text(), nowTeam: text(), imported: flag() }).strict())),
  reputation: est(z.array(est(z.object({ group: est(z.enum(['players', 'coaches', 'owners', 'media', 'fans'])), word: est(z.string()), reasons: est(z.array(z.string())) }).strict()))),
  enrolment: own(z.object({ line: text() }).strict()).nullable(),
}).strict().nullable();

const FIT = ['step_up', 'lateral', 'step_down', 'step_down_title_up_level', 'well_above'] as const;
const Opening = z.object({
  id: pub(int(), 'id'), level: ptext(), team: ptext(), rung: pub(int().min(0).max(9), 'index'), title: ptext(), side: ptext(), region: ptext(),
  party: ptext(), reason: ptext(), stage: ptext(), payCents: pub(int(), 'cents').nullable(), fit: own(z.enum(FIT)), applied: flag(),
}).strict();
const OfferCard = z.object({
  offerId: own(int(), 'id'), team: text(), level: text(), title: text(), rung: own(int().min(0).max(9), 'index'),
  salaryCents: cents(), years: own(int().min(0), 'count'), callsPlays: flag(), bossReportKeys: own(z.array(z.string())),
  staffSecurityKey: own(z.enum(['stable', 'uncertain', 'likely_purge'])), whatChanges: own(z.array(z.string())), offsetNote: flag(),
  deadline: text(), state: text(),
}).strict();
export const CoachJobMarketData = z.object({
  rights: rights(), windowOpen: pub(z.boolean()), windowLine: ptext(),
  openings: own(z.array(Opening)),
  applications: own(z.array(z.object({ openingId: own(int(), 'id'), route: text(), date: text(), response: text().nullable() }).strict())),
  interviews: own(z.array(z.object({ openingId: own(int(), 'id'), date: text(), with: text(), stage: text() }).strict())),
  offers: own(z.array(OfferCard)),
  signs: own(z.array(z.object({ sign: text(), date: text(), source: text() }).strict())),
  yearOut: own(z.array(z.object({ id: text(), weeklyHours: own(z.number().min(0), 'count'), onField: flag() }).strict())).nullable(),
}).strict().nullable();

export const CoachContractData = z.object({
  rights: rights(), team: text().nullable(), jobTitle: text().nullable(),
  terms: own(z.array(z.object({ label: text(), value: text() }).strict())),
  yearsLeft: own(int().min(0), 'count').nullable(), clauses: own(z.array(z.string())),
}).strict().nullable();

export const CoachRecordData = z.object({
  rights: rights(),
  seasons: own(z.array(z.object({
    season: own(int(), 'season_year'), team: text(), jobTitle: text(),
    wins: own(int().min(0), 'count'), losses: own(int().min(0), 'count'), ties: own(int().min(0), 'count'), finish: text(),
  }).strict())),
  families: own(z.array(z.object({ family: text(), lines: own(z.array(z.string())) }).strict())),
  certified: own(z.array(z.object({ season: own(int(), 'season_year'), result: text() }).strict())),
}).strict().nullable();

const Range = own(z.object({ lowCents: cents(), midCents: cents(), highCents: cents() }).strict());
export const CoachFinanceData = z.object({
  rights: rights(), currency: text(),
  netWorth: own(z.array(z.object({ date: text(), cents: cents() }).strict())),
  income: own(z.array(z.object({ source: text(), cents: cents() }).strict())),
  taxes: own(z.array(z.object({ place: text(), cents: cents() }).strict())),
  spending: own(z.array(z.object({ item: text(), cents: cents() }).strict())),
  holdings: own(z.array(z.object({ name: text(), risk: text(), valueCents: cents(), returnPct: own(z.number(), 'ratio') }).strict())),
  advisers: own(z.array(z.object({ name: text(), feeLine: text() }).strict())),
  offers: own(z.array(z.object({ id: text(), kind: text(), terms: text(), deadline: text() }).strict())),
  plan: own(z.object({ savingRatePct: own(z.number().min(0).max(100), 'ratio'), risk: text() }).strict()),
  projection: own(z.object({ years: own(int().min(1), 'count'), range: Range }).strict()).nullable(),
}).strict().nullable();

const Word = own(z.object({ word: text(), trend: own(z.enum(TREND)) }).strict());
const TaskHours = own(z.array(z.object({ task: text(), hours: hours() }).strict()));
export const CoachLifeData = z.object({
  rights: rights(), week: text(), hours: TaskHours, hoursAvailable: hours(),
  sleep: Word, energy: Word, health: own(z.array(z.string())),
  family: own(z.array(z.object({ event: text(), date: text(), owed: text().nullable() }).strict())),
  template: TaskHours,
  effects: own(z.array(z.object({ id: text(), line: text() }).strict())),
}).strict().nullable();

/** By app-services spec name (CAREER_MODELS). */
export const CAREER_SCREEN_SCHEMAS = {
  career: CoachCareerData, jobMarket: CoachJobMarketData, contract: CoachContractData, record: CoachRecordData,
  finance: CoachFinanceData, life: CoachLifeData, assignments: CoachAssignmentsData,
} as const;
