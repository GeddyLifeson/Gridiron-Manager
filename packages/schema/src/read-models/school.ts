// The zod schema of the coaching school read model (G-94, bible N5: lessons, drills, my development), with
// a visibility class on every field. Everything here is the user's own record (own_team): lesson attempts,
// drill answers and the decision patterns of his own games. Nothing is a world person's rating. Built by
// app-services read-models/school.
import { z } from 'zod';
import { own } from '../field.ts';

const text = () => own(z.string());
const count = () => own(z.number().int().min(0), 'count');
const share = () => own(z.number().min(0).max(1), 'ratio');
const flag = () => own(z.boolean());

const LEVEL = own(z.enum(['pro', 'college', 'both']));
const DRILL = own(z.enum(['call_speed', 'recognition', 'clock', 'protection']));

const Lesson = z.object({
  id: text(), title: text(), minutes: own(z.number().min(0), 'min'), level: LEVEL,
  state: own(z.enum(['not_started', 'attempted', 'passed', 'mastered'])), prerequisites: own(z.array(z.string())), gradable: flag(),
  flaggedTerms: own(z.array(z.object({ id: text(), status: text() }).strict())), otherLevel: flag(),
}).strict();
const Course = z.object({ id: text(), order: own(z.number().int(), 'index'), title: text(), state: own(z.enum(['not_started', 'in_progress', 'passed'])), lessons: own(z.array(Lesson)) }).strict();
const Accuracy = z.object({ key: text(), n: count(), correct: count(), share: share() }).strict();
const Card = z.object({
  bucket: text(), decisionType: text(), games: count(), decisions: count(),
  chosen: own(z.record(z.string(), own(z.number().min(0), 'count'))), modelFavoured: own(z.record(z.string(), own(z.number().min(0), 'count'))),
  costPerGame: own(z.number(), 'ratio'), lesson: text().nullable(), drill: DRILL.nullable(),
}).strict();

export const SchoolData = z.object({
  personId: own(z.number().int(), 'id'), level: own(z.enum(['pro', 'college'])),
  map: own(z.object({ courses: own(z.array(Course)), passed: count(), mastered: count(), total: count() }).strict()),
  drills: own(z.object({
    callSpeed: own(z.array(z.object({ session: own(z.number().int().min(1), 'index'), median: own(z.number().min(0), 's'), worst: own(z.number().min(0), 's') }).strict())),
    recognition: own(z.object({ byFamily: own(z.array(Accuracy)), mostMissed: text().nullable() }).strict()),
    protection: own(z.array(Accuracy)), clock: own(z.array(Accuracy)),
  }).strict()),
  development: own(z.object({
    patterns: own(z.array(z.object({ card: own(Card), shownAfterGame: own(z.number().int(), 'id'), status: own(z.enum(['pending', 'improved', 'not_yet'])) }).strict())),
    offers: own(z.array(z.object({ duty: text(), lessons: own(z.array(z.string())), drills: own(z.array(DRILL)) }).strict())),
  }).strict()),
  current: own(Card).nullable(),
}).strict().nullable();
