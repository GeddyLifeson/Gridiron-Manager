// The zod schema of the install board read model, with a visibility class on every field. It belongs in
// @gm/schema (READ_MODELS) because app-services may not import zod. Moved here from app-services/test/read-models/install/data-schema.ts unchanged but for the field import.
// The plan is the club's own (own_team); every
// knowledge figure and everything computed from it (installed, readiness, laggers, error chance, delay) is
// the staff's estimate (observer_estimate). Knowledge is in knowledge points on D9's 0 to 100 scale.
import { z } from 'zod';
import { own, est } from '../field.ts';

const text = () => own(z.string());
const count = () => own(z.number().int().min(0), 'count');
const kp = () => est(z.number().min(0).max(100), 'points');

const Period = z.object({ kind: own(z.enum(['meeting', 'film', 'walkthrough', 'practice'])), label: text(), minutes: own(z.number().min(0), 'min').nullable(), reps: own(z.number().int().min(0), 'count').nullable() }).strict();
const Card = z.object({
  unitId: text(), label: text(), kind: own(z.enum(['part', 'play'])),
  groups: own(z.array(z.object({ group: text(), units: count() }).strict())), load: count(),
  periods: own(z.array(Period)), missing: own(z.array(z.string())), installed: est(z.boolean()), alwaysUp: own(z.boolean()),
  tray: own(z.enum(['unplaced', 'day_removed'])).nullable(),
}).strict();
const Load = z.object({ group: text(), units: count(), limit: count(), over: count(), lostShare: own(z.number().min(0).max(1), 'ratio') }).strict();
const Day = z.object({ id: text(), label: text(), cards: own(z.array(Card)), load: own(z.array(Load)), overloaded: own(z.boolean()) }).strict();
const Lagger = z.object({
  player: own(z.number().int(), 'id'), name: text(), position: text(), estimate: kp(),
  errorChance: est(z.number().min(0).max(1), 'ratio'), delayS: est(z.number().min(0), 's'),
}).strict();
const Group = z.object({ group: text(), players: count(), readiness: kp(), weakest: kp(), unjudged: est(z.boolean()), laggers: est(z.array(Lagger)) }).strict();
const Lock = own(z.object({ allowed: own(z.boolean()), heldBy: text().nullable(), suggest: own(z.boolean()) }).strict());

export const InstallData = z.object({
  teamId: own(z.number().int(), 'id'), side: own(z.enum(['offense', 'defense', 'special_teams'])), mode: own(z.enum(['week', 'camp'])),
  days: own(z.array(Day)), tray: own(z.array(Card)),
  readiness: est(z.array(z.object({ unitId: text(), label: text(), installed: est(z.boolean()), groups: est(z.array(Group)) }).strict())),
  order: own(z.array(z.string())), orderProblem: text().nullable(),
  numbers: own(z.object({ threshold: own(z.number(), 'points'), dailyLimit: count(), overLimitYield: own(z.number().min(0).max(1), 'ratio'), shortWeek: own(z.boolean()) }).strict()),
  totals: own(z.object({ placed: count(), unplaced: count(), installed: est(z.number().int().min(0), 'count') }).strict()),
  locks: own(z.object({ edit: Lock }).strict()),
}).strict().nullable();
