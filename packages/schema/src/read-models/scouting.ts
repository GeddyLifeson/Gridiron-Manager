// The zod schemas of the scouting read models (item 3b, app-services read-models/scouting), with a
// visibility class on every field; registered in READ_MODELS as scoutingTable and scoutingPersonnel.
// Classes:
//  own_team          the tendency table: the club's own call log (self-scout) or its staff's charting of an
//                    opponent (H2.1.2, with tagging error); built only for a club the observer works inside
//  public            names, positions, depth chart lists, team names
//  observer_estimate grades the club's staff assigned (D6, MA-48), group grades, strengths and weak links
// Nothing is truth: the registry refuses a schema with a truth field.
import { z } from 'zod';
import { pub, own, est } from '../field.ts';

const otext = () => own(z.string());
const ocount = () => own(z.number().int().min(0), 'count');
const oflag = () => own(z.boolean());
const ratio = () => own(z.number(), 'ratio').nullable();
const Band = own(z.enum(['strong', 'watch', 'lean']));
const Subject = pub(z.enum(['self', 'opponent']));

const Outcome = own(z.object({ outcome: otext(), count: ocount(), rate: ratio(), low: ratio(), high: ratio(), leagueRate: ratio() }).strict());
const Cell = own(z.object({
  key: otext(), cuts: own(z.record(z.string(), z.string())), calls: ocount(), nEff: own(z.number().min(0), 'count'), thin: oflag(), countsOnly: oflag(),
  outcomes: own(z.array(Outcome)), band: Band.nullable(), bandOutcome: otext().nullable(), refs: own(z.array(z.string())),
}).strict());
const Exposure = own(z.object({ key: otext(), label: otext(), band: Band, calls: ocount(), shareInWindow: own(z.number().min(0).max(1), 'ratio'), top: oflag() }).strict());
const Tell = own(z.object({ feature: otext(), value: otext(), givesAway: otext(), count: ocount(), snaps: ocount(), kept: oflag() }).strict());

export const ScoutingTableData = z.object({
  subject: Subject, teamId: pub(z.number().int(), 'id'), teamName: pub(z.string()),
  windowLabel: otext(), windowGames: ocount(), measure: otext(), cuts: own(z.array(z.string())),
  cells: own(z.array(Cell)), exposure: own(z.array(Exposure)), tells: own(z.array(Tell)),
  predictability: own(z.object({ index: own(z.number(), 'ratio'), calls: ocount(), words: otext().nullable() }).strict()).nullable(),
  taggerLine: otext().nullable(), partial: oflag(),
}).strict().nullable();
export type ScoutingTableData = z.infer<typeof ScoutingTableData>;

const etext = () => est(z.string());
// Same classes as the graded option for the shared keys: the observer walk reads a key's class from the
// first option (as the people read model's Grade union does).
const Grade = z.union([
  z.object({ state: est(z.literal('graded')), attribute: pub(z.string()), label: etext(), confidence: etext(), bandText: etext(), n: est(z.number().int().min(0), 'count') }).strict(),
  z.object({ state: est(z.literal('unwatched')), attribute: pub(z.string()) }).strict(),
]);
const GroupGrade = est(z.object({ group: pub(z.string()), label: etext(), bandText: etext(), confidence: etext(), attributes: est(z.number().int().min(0), 'count') }).strict());
const Side = pub(z.enum(['offense', 'defense', 'special_teams']));
const Usage = own(z.object({ snaps: ocount(), alignments: own(z.record(z.string(), z.number().int().min(0)), 'count') }).strict());
const optId = () => est(z.number().int(), 'id').nullable();

const Card = z.object({
  personId: pub(z.number().int(), 'id'), name: pub(z.string()), position: pub(z.string()), side: Side,
  starter: pub(z.boolean()), roles: pub(z.array(z.string())),
  overall: GroupGrade.nullable(), groups: est(z.array(GroupGrade)), grades: est(z.array(Grade)),
  strengths: est(z.array(z.string())), weaknesses: est(z.array(z.string())),
  usage: Usage.nullable(), unscouted: est(z.boolean()),
}).strict();

export const ScoutingPersonnelData = z.object({
  subject: Subject, teamId: pub(z.number().int(), 'id'), teamName: pub(z.string()), scaleId: pub(z.string()),
  depth: pub(z.array(z.object({
    unitId: pub(z.string()), side: Side,
    roles: pub(z.array(z.object({ role: pub(z.string()), personIds: pub(z.array(z.number().int()), 'id') }).strict())),
  }).strict())),
  cards: pub(z.array(Card)),
  summary: est(z.object({ bestOffense: optId(), bestDefense: optId(), weakestPassProtector: optId(), weakestCoverageDefender: optId() }).strict()),
}).strict().nullable();
export type ScoutingPersonnelData = z.infer<typeof ScoutingPersonnelData>;
