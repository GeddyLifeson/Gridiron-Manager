// The zod schema of the gameplan read model (G-68), with a visibility class on every field. Moved here
// from app-services/test/read-models/gameplan/data-schema.ts (CR-G68-S1; units added on seven plain numbers); registered in
// READ_MODELS as `gameplan`. The plan and sheet are the club's own (own_team); readiness is the staff's
// estimate (observer_estimate), never truth (MA-48).
import { z } from 'zod';
import { own, est } from '../field.ts';

const text = () => own(z.string());
const count = () => own(z.number().int().min(0), 'count');
const flag = () => own(z.boolean());
const strs = () => own(z.array(z.string()));
const nul = <T extends z.ZodType>(t: T) => t.nullable();
const tally = () => own(z.record(z.string(), z.number()));
const readiness = () => est(z.number().min(0).max(1), 'ratio').nullable();
const Lock = own(z.object({ allowed: flag(), heldBy: nul(text()), suggest: flag() }).strict());
const Warning = own(z.object({ leaf: text(), code: text(), subject: text(), text: text(), severity: own(z.enum(['warning', 'note'])) }).strict());
const arr = <T extends z.ZodType>(t: T) => own(z.array(t));

const Plan = own(z.object({
  looks: arr(z.object({ bucket: text(), look: text(), count: count(), n: count(), rate: nul(own(z.number(), 'ratio')), lo: nul(own(z.number(), 'ratio')), hi: nul(own(z.number(), 'ratio')) }).strict()),
  looksStale: flag(), callerChanged: flag(),
  situations: arr(z.object({ id: text(), label: text(), entries: arr(z.object({
    entryId: text(), playId: text(), call: text(), readinessEstimate: readiness(), repsAssigned: count(), targetReps: count(), isNew: flag(), broken: flag(),
  }).strict()) }).strict()),
  selected: nul(text()),
  book: arr(z.object({ playId: text(), call: text(), section: text(), status: text(), inPlan: flag() }).strict()),
  summary: own(z.object({
    total: count(), newThisWeek: count(), unitsUsed: own(z.number(), 'count'), capacity: own(z.number(), 'count'), repsAssigned: count(), repsAvailable: count(),
    runPass: own(z.object({ run: count(), pass: count(), other: count() }).strict()),
  }).strict()),
  matchups: arr(z.object({ id: text(), ours: text(), theirs: text(), rule: own(z.enum(['target', 'avoid', 'double'])) }).strict()),
  approval: own(z.object({ state: own(z.enum(['draft', 'submitted', 'approved', 'sent_back'])), at: nul(own(z.number(), 'index')), by: nul(text()), notes: nul(text()) }).strict()),
  proposal: nul(own(z.object({ id: text(), from: text(), entries: count(), added: strs(), removed: strs() }).strict())),
  warnings: arr(Warning),
}).strict());

const Entry = z.object({
  id: text(), call: text(), playId: text(), key: text(), readinessEstimate: readiness(), timesCalled: count(),
  notInPlan: flag(), broken: flag(), overLimit: flag(), note: nul(text()), rank: nul(count()), bandNumber: nul(text()),
}).strict();
const Box = z.object({
  id: text(), title: text(), side: own(z.union([z.literal(0), z.literal(1)])), col: count(), row: count(), w: count(), h: count(),
  situationId: nul(text()), category: nul(text()), colour: text(), key: text(), priority: own(z.number(), 'index'),
  expectedSnaps: nul(own(z.number(), 'count')), expectedSource: nul(text()), expectedGames: nul(count()), depthMark: nul(own(z.enum(['deep', 'thin']))),
  entries: arr(Entry),
}).strict();
const Sheet = own(z.object({
  unit: text(), gameId: text(), version: own(z.number().int(), 'version'), lockedAt: nul(own(z.number(), 'index')),
  page: own(z.object({ orientation: own(z.enum(['landscape', 'portrait'])), cols: count(), rows: count() }).strict()),
  situations: arr(z.object({ id: text(), label: text() }).strict()),
  boxes: arr(Box),
  layoutProblems: arr(z.object({ kind: own(z.enum(['overlap', 'outside'])), boxes: strs() }).strict()),
  coverage: arr(z.object({ down: count(), distance: text(), zone: text(), boxId: nul(text()) }).strict()),
  unmatchedStates: count(), shadowedStates: count(),
  catalogue: arr(z.object({ id: text(), label: text(), status: own(z.enum(['has_box', 'covered', 'partly', 'missing'])), tier: count(), expectedSnaps: nul(own(z.number(), 'count')), severity: nul(own(z.enum(['warning', 'note', 'info']))) }).strict()),
  density: own(z.object({ entriesBySide: own(z.array(z.number())), bandBySide: strs(), smallestTextPt: own(z.number(), 'pt'), overflow: strs() }).strict()),
  size: own(z.object({ unique: count(), repsAvailable: count(), overReps: flag() }).strict()),
  tooLongKeys: strs(),
  warnings: arr(Warning),
}).strict());

const ScriptRow = z.object({ id: text(), call: text(), purpose: text(), purposeText: nul(text()), watchingFor: nul(text()) }).strict();
const Script = own(z.object({
  mode: text(), opening: arr(ScriptRow), secondHalf: arr(ScriptRow),
  variety: own(z.object({ personnel: tally(), formation: tally(), runPass: tally(), direction: tally() }).strict()),
  reveals: strs(),
  mustCalls: arr(z.object({ id: text(), call: text(), target: text() }).strict()),
  notes: arr(z.object({ id: text(), boxId: nul(text()), kind: text(), text: text() }).strict()),
  warnings: arr(Warning),
}).strict());

const Wristband = own(z.object({
  cells: arr(z.object({ label: text(), call: text() }).strict()), problems: strs(),
  audibles: arr(z.object({ name: text(), call: text() }).strict()), relay: text(), qbFreedom: text(), warnings: arr(Warning),
}).strict());

const Card = own(z.object({
  fourth: arr(z.object({ distanceYd: own(z.number(), 'yd'), yardsToGoalYd: own(z.number(), 'yd'), call: text(), edited: flag() }).strict()),
  twoPoint: arr(z.object({ scoreDiff: own(z.number().int(), 'points'), goForTwo: flag(), edited: flag() }).strict()),
  kneel: arr(z.object({ opponentTimeouts: count(), kneels: count(), secondsKilled: own(z.number(), 's') }).strict()),
  fieldGoalLine: own(z.object({ withWind: nul(own(z.number(), 'yd')), intoWind: nul(own(z.number(), 'yd')) }).strict()),
  inBoundsPlayS: own(z.number(), 's'),
  timeoutRules: strs(), crewTendencies: strs(), trickHistory: strs(), depthCard: strs(), standingInstructions: strs(),
  edits: arr(z.object({ block: text(), cell: text(), from: text(), to: text(), at: own(z.number(), 'index') }).strict()),
  stale: strs(),
}).strict());

const Review = own(z.object({ items: arr(z.object({ code: text(), subject: text(), text: text(), blocks: flag() }).strict()), canLock: flag(), locked: flag() }).strict());

const Print = own(z.object({
  paper: own(z.enum(['letter', 'legal', 'tabloid'])), keyHints: flag(), widthIn: own(z.number(), 'in'), heightIn: own(z.number(), 'in'),
  boxes: arr(z.object({
    id: text(), side: own(z.union([z.literal(0), z.literal(1)])), xIn: own(z.number(), 'in'), yIn: own(z.number(), 'in'), wIn: own(z.number(), 'in'), hIn: own(z.number(), 'in'),
    textPt: own(z.number(), 'pt'), lines: strs(), overflow: flag(),
  }).strict()),
  overflow: count(),
}).strict());

export const GameplanData = z.object({
  teamId: own(z.number().int(), 'id'), unit: own(z.enum(['offense', 'defense', 'special_teams'])),
  locks: own(z.object({ build: Lock, approve: Lock, card: Lock }).strict()),
  plan: Plan, sheet: Sheet, script: Script, wristband: Wristband, card: Card.nullable(), review: Review, print: Print,
}).strict().nullable();
