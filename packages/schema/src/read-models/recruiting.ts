// The zod schema of the recruiting board read model (CR-RB-1, PR 257: O7.5.1, T4), with a visibility class
// on every field. Mirrors app-services read-models/recruiting/types.ts. Public: the prospect's public facts,
// stars, rank, status and offer list, the calendar. Own: the club's board, offers, visits, hours, numbers
// and its own logged violations. Estimate: every grade, read, circle, firmness and academics word the staff
// formed by watching (MA-48). No true rating, interest, firmness or commitment threshold reaches it (K9.1.1).
import { z } from 'zod';
import { pub, own, est } from '../field.ts';

const int = () => z.number().int();
const text = () => own(z.string());
const ptext = () => pub(z.string());
const etext = () => est(z.string());
const flag = () => own(z.boolean());
const arr = <T extends z.ZodType>(t: T) => own(z.array(t));
const day = () => pub(int().min(0), 'day_index');
const eday = () => est(int().min(0), 'day_index');
const count = () => own(int().min(0), 'count');

const VERB = ['evaluate', 'contact', 'visit', 'offer', 'plan'] as const;
const RIGHT = ['do_it', 'suggest', 'none'] as const;
const right = () => own(z.enum(RIGHT));

const Grade = est(z.object({
  value: est(z.number(), 'points'), scaleMax: est(z.number().positive(), 'points'),
  grader: est(z.enum(['first_pass', 'position_coach'])), lastLookDay: eday().nullable(),
  looks: est(z.array(est(z.object({ kind: etext(), count: est(int().min(0), 'count') }).strict()))),
  confidence: est(z.enum(['firm', 'fair', 'thin'])),
  band: est(z.record(z.string(), est(z.number().min(0), 'points'))),
  measured: est(z.object({ heightIn: est(z.number().positive(), 'in'), weightLb: est(z.number().positive(), 'lb'), fortyS: est(z.number().positive(), 's') }).strict()).nullable(),
  userGrade: own(z.number(), 'points').nullable(),
}).strict());
const Read = est(z.object({
  standing: etext(), basis: etext().nullable(), asOf: eday().nullable(),
  reasons: est(z.array(est(z.object({ key: etext(), positive: est(z.boolean()), basis: etext(), day: eday() }).strict()))),
  rivals: est(z.array(est(z.object({ team: etext(), basis: etext(), day: eday() }).strict()))),
}).strict());
const Circle = est(z.object({
  memberId: est(int().positive(), 'id'), name: etext(), relation: etext(), influence: etext(), caresAbout: est(z.array(z.string())), basis: etext(),
}).strict());
const Word = est(z.object({ word: etext(), basis: etext(), day: eday() }).strict());
const Action = own(z.object({
  kind: text(), verb: own(z.enum(VERB)), hours: own(z.number().min(0), 'count'), button: own(z.enum(['do_it', 'suggest'])),
  breaches: own(z.array(z.string())),
  warning: own(z.object({ classId: text(), ruleText: text(), body: text(), penaltyText: text() }).strict()).nullable(),
}).strict());

const Row = own(z.object({
  personId: pub(int().positive(), 'id'), name: ptext(), classYear: pub(int(), 'season_year'), position: ptext(), region: ptext(),
  heightIn: pub(z.number().positive(), 'in'), weightLb: pub(z.number().positive(), 'lb'), source: pub(z.enum(['high_school', 'juco'])),
  publicStars: pub(int().min(0).max(5), 'count'), publicRank: pub(int().min(1), 'index').nullable(),
  status: pub(z.object({ kind: pub(z.enum(['open', 'committed', 'signed'])), team: ptext().nullable(), ours: pub(z.boolean()) }).strict()),
  grade: Grade.nullable(), read: Read.nullable(), circle: est(z.array(Circle)), firmness: Word.nullable(), academics: Word.nullable(),
  ourOffer: own(z.object({ day: own(int().min(0), 'day_index'), committable: flag() }).strict()).nullable(),
  otherOffers: pub(z.array(z.string())),
  visits: own(z.object({ official: own(z.array(int().min(0)), 'day_index'), unofficial: own(z.array(int().min(0)), 'day_index') }).strict()),
  inQueue: flag(), nextContactDay: own(int().min(0), 'day_index').nullable(), actions: arr(Action),
}).strict());

const NumbersRow = own(z.object({
  position: text(), returning: count(), target: count(), committed: count(), signed: count(), offersOut: count(), open: own(int(), 'count'), heldForTransfer: count(),
}).strict());
const Numbers = own(z.object({
  rows: arr(NumbersRow), returning: count(), incoming: count(), total: count(),
  limit: pub(int().min(0), 'count').nullable(), signeeCap: pub(int().min(0), 'count').nullable(), placesOpen: own(int(), 'count').nullable(),
}).strict());
const Calendar = pub(z.object({
  from: day(), to: day(),
  stretches: pub(z.array(pub(z.object({ from: day(), to: day(), period: ptext().nullable() }).strict()))),
  signing: pub(z.object({ earlyOpen: day().nullable(), earlyClose: day().nullable(), february: day().nullable() }).strict()),
  visitsHosted: own(int().min(0), 'count'), visitCap: pub(int().min(0), 'count').nullable(),
}).strict());
const Area = own(z.object({ region: text(), prospects: count(), graded: count(), offered: count(), committedToUs: count() }).strict());
const Violation = own(z.object({ logId: own(int().positive(), 'id'), day: own(int().min(0), 'day_index'), actor: text(), prospect: text().nullable(), rules: own(z.array(z.string())) }).strict());
const Portal = pub(z.object({
  available: pub(z.boolean()), window: pub(z.object({ open: day(), close: day() }).strict()).nullable(), openNow: pub(z.boolean()),
  rows: pub(z.array(pub(z.object({ personId: pub(int().positive(), 'id'), name: ptext(), position: ptext(), fromTeam: ptext(), enteredDay: day() }).strict()))),
}).strict());

export const RecruitingBoardData = z.object({
  teamId: own(int().positive(), 'id'), day: day(), classYear: pub(int(), 'season_year'), period: ptext().nullable(), model: ptext().nullable(),
  hoursLeft: own(z.number().min(0), 'count').nullable(),
  rights: own(z.object({ evaluate: right(), contact: right(), visit: right(), offer: right(), plan: right() }).strict()),
  list: own(z.enum(['board', 'pool', 'offered', 'queue'])),
  filter: own(z.object({ position: text().nullable(), region: text().nullable(), source: text().nullable() }).strict()),
  rows: arr(Row), total: count(),
  counts: own(z.object({ onBoard: count(), watched: count(), offers: count(), committed: count(), signed: count() }).strict()),
  numbers: Numbers, calendar: Calendar, area: arr(Area), violations: arr(Violation), portal: Portal,
}).strict().nullable();
