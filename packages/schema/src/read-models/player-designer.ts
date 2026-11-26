// The zod schema of the player designer screen model (G-92, bible D13.1), with a visibility class on every
// field. The designer is an authoring tool: it opens only outside a certified career and, in a career, only
// before the world starts or in a sandbox world (D13.1.1). The sheet holds what the user typed or drew from
// an archetype (own_team); the staff grade is the position coach's estimate (observer_estimate), never the
// true rating (MA-48). Built by app-services read-models/player-designer.
import { z } from 'zod';
import { own, est } from '../field.ts';

const text = () => own(z.string());
const flag = () => own(z.boolean());
const Arch = own(z.object({ id: text(), labelId: text() }).strict());

const Field = z.object({
  path: text(), value: own(z.union([own(z.number(), 'scale'), z.string()])).nullable(), kind: own(z.enum(['number', 'text', 'side'])),
  locked: flag(), missing: flag(), warned: flag(), ceilingPath: text().optional(), ceiling: own(z.number(), 'scale').nullable().optional(),
}).strict();

const Result = own(z.union([
  z.object({ ok: own(z.literal(true)), personId: own(z.number().int(), 'id') }).strict(),
  z.object({ ok: own(z.literal(false)), rule: text(), message: text(), problems: own(z.array(z.string())) }).strict(),
]));

export const PlayerDesignerData = z.object({
  open: flag(), refusal: own(z.object({ rule: text(), message: text() }).strict()).nullable(), hasSheet: flag(), entry: text().nullable(),
  personId: own(z.number().int(), 'id').nullable(), position: text().nullable(), positions: own(z.array(z.string())),
  archetypes: own(z.array(Arch)), archetypeCatalog: own(z.record(z.string(), own(z.array(Arch)))), archetypeId: text().nullable(),
  realPerson: flag(), sandbox: flag(), marksWorldEdited: flag(),
  sections: own(z.array(z.object({ id: text(), fields: own(z.array(Field)) }).strict())),
  derived: own(z.array(z.object({ attribute: text(), value: own(z.number(), 'scale') }).strict())),
  staffGrade: est(z.object({ text: est(z.string()), sourceText: est(z.string()) }).strict()).nullable(),
  warnings: own(z.array(z.object({
    fields: own(z.array(z.string())), kind: own(z.enum(['record', 'z', 'joint'])), value: own(z.number(), 'scale'), oneIn: own(z.number().min(0), 'count').nullable(),
  }).strict())),
  missing: own(z.array(z.string())), blockers: own(z.array(z.string())), canCommit: flag(), result: Result.nullable(),
}).strict();
