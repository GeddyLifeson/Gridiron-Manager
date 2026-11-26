// The zod schema of the playbook library read model, with a visibility class on every field. It belongs in
// @gm/schema (READ_MODELS) because app-services may not import zod. Moved here from app-services/test/read-models/playbook/data-schema.ts unchanged but for the field import.
// The book is the club's own (own_team); readiness is the staff's estimate.
import { z } from 'zod';
import { own, est } from '../field.ts';

const text = () => own(z.string());
const count = () => own(z.number().int().min(0), 'count');
const flag = () => own(z.boolean());
const secs = () => own(z.number().min(0), 's');

const Filter = own(z.object({
  text: text().optional(), formation: text().optional(), concept: text().optional(), personnel: text().optional(), role: text().optional(),
  situation: text().optional(), status: text().optional(), readinessAtLeast: own(z.number().min(0).max(1), 'ratio').optional(), includeRetired: flag().optional(),
  folder: text().optional(),
}).strict());

const Row = z.object({
  id: text(), call: text(), family: text(), section: text(), personnel: text(), formation: text(), concept: text(), protection: text(),
  tags: own(z.array(z.string())), status: text(), role: text(), readinessEstimate: est(z.number().min(0).max(1), 'ratio').nullable(),
  called: count(), lastCalledWeek: own(z.number().int(), 'index').nullable(), avgResult: own(z.number(), 'points').nullable(), sample: count(),
  lengthS: secs(), words: count(), overLimit: flag(), latestStartS: own(z.number(), 's').nullable(),
}).strict();

const Family = z.object({ key: text(), plays: own(z.array(z.string())), gaps: own(z.array(z.string())) }).strict();
const Word = z.object({ partId: text(), type: text(), word: text(), syllables: count(), usedBy: count(), duplicate: flag(), soundsLike: own(z.array(z.string())) }).strict();
const Option = own(z.object({ id: text(), word: text() }).strict());
const Lock = own(z.object({ allowed: flag(), heldBy: text().nullable(), suggest: flag() }).strict());
const Size = own(z.object({
  readinessCeiling: own(z.number(), 'ratio'), upkeep: own(z.number(), 'count'), capacity: own(z.number(), 'count'), warning: own(z.enum(['none', 'amber', 'red'])),
  warnings: own(z.array(z.string())), sectionUpkeep: own(z.array(z.object({ section: text(), units: own(z.number(), 'count'), share: own(z.number(), 'ratio') }).strict())),
}).strict());

export const PlaybookData = z.object({
  teamId: own(z.number().int(), 'id'), side: own(z.enum(['offense', 'defense', 'special_teams'])),
  sections: own(z.array(z.object({ key: text(), count: count() }).strict())), rows: own(z.array(Row)), total: count(), families: own(z.array(Family)), words: own(z.array(Word)),
  size: Size.nullable(),
  locks: own(z.object({
    view: Lock, draft_play: Lock, edit_group_coaching_points: Lock, edit_side_playbook: Lock, build_plan_and_sheet: Lock, approve: Lock, draw_scout_cards: Lock,
  }).strict()),
  filter: Filter,
  folders: own(z.array(z.object({ id: text(), name: text(), playIds: own(z.array(z.string())) }).strict())),
  options: own(z.object({ formation: own(z.array(Option)), concept: own(z.array(Option)), personnel: own(z.array(Option)) }).strict()),
}).strict().nullable();
