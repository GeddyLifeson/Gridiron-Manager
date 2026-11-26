// The zod schema of the practice desk read model (`practiceDesk`, CR-3A-1), with a visibility class on every
// field. It belongs in @gm/schema (READ_MODELS) because app-services may not import zod (P1.2.2). Moved here
// from app-services/test/read-models/practice/data-schema.ts unchanged but for the field import. Classes:
//  own_team          the club's plans, their checks, the padded counter, reps taken, participation, injuries
//  observer_estimate what the period leaders wrote: errors, standouts, poor performers, competition grades
//  public            person names and ids
// Nothing is truth: the film (the true error list) never reaches this view (H3.5.2, D6).
import { z } from 'zod';
import { pub, own, est } from '../field.ts';

const int = () => z.number().int();
const count = () => own(int().min(0), 'count');
const text = () => own(z.string());
const By = own(z.enum(['user', 'staff']));
const Person = z.object({ personId: pub(z.string()), name: pub(z.string()).nullable() }).strict();
const EstPerson = est(Person);
const OwnPerson = own(Person);

const Problem = z.object({ code: text(), period: own(int(), 'index').nullable(), plain: text() }).strict();
const Finding = z.object({
  hard: own(z.boolean()), plain: text(), penalty: text(), leaf: text(), period: own(int(), 'index').nullable(), status: text().nullable(),
}).strict();

const Plan = z.object({
  practiceId: text(), by: By, day: own(int(), 'day_index'), pads: text(), mockGame: own(z.boolean()), periods: count(),
  minutes: own(z.object({ planned: own(z.number(), 'min'), block: own(z.number(), 'min'), remaining: own(z.number(), 'min') }).strict()),
  expectedReps: count(),
  coverage: own(z.object({ zero: count(), one: count(), more: count() }).strict()),
  ok: own(z.boolean()), problems: own(z.array(Problem)), findings: own(z.array(Finding)),
}).strict();

const Report = z.object({
  seasonYear: own(int(), 'season_year'), week: own(int(), 'index'), practiceId: text(), by: By, padded: own(z.boolean()), repsCompleted: count(),
  errors: est(z.array(z.object({ period: est(int(), 'index'), rep: est(int(), 'index'), person: EstPerson }).strict())),
  standouts: est(z.array(EstPerson)),
  poor: est(z.array(EstPerson)),
  competition: est(z.array(z.object({ person: EstPerson, position: est(z.string()), wins: est(int().min(0), 'count'), reps: est(int().min(0), 'count') }).strict())),
  injuries: own(z.array(z.object({ period: own(int(), 'index'), rep: own(int(), 'index'), person: OwnPerson }).strict())),
  participation: own(z.array(z.object({ person: OwnPerson, label: own(z.enum(['full', 'limited', 'did_not_participate'])) }).strict())),
  reps: own(z.array(z.object({ person: OwnPerson, reps: count(), fullSpeed: count() }).strict())),
}).strict();

const DeskView = z.object({
  teamId: pub(int(), 'id'), seasonYear: own(int(), 'season_year'), week: own(int(), 'index'), plannedBy: By,
  plans: own(z.array(Plan)),
  padded: own(z.object({ used: count(), left: own(int(), 'count').nullable() }).strict()),
  reportSeason: own(int(), 'season_year'),
  reports: own(z.array(Report)),
  seasons: own(z.array(own(int(), 'season_year'))),
}).strict();

/** The view, or null for a club whose desk the host does not hold. */
export const PracticeDeskData = DeskView.nullable();
