// Evidence event types (X2.1.2 content) and the evidence map from event type to family (E9.1.1).
//
// The six families are fed by events other modules write: N3 decisions, N2 unit results, N1 and D7
// teaching outcomes, S4.3.1 duty grades, H6.6.2 and T4 evaluations, L1 promises. Those writers do not exist
// yet, so this module declares one event type per family with the payload it reads (contract below). A
// writer either emits these types or adds a row to its own evidence map; `promise_kept` and
// `promise_broken` (career/players, L1.3.1) are mapped already. A type that is not in the map never enters
// the record (E9.1.1: "Nothing else is measured").
import { EventTypeDef, type WorldDate, type WorldEvent, type WorldTier } from '@gm/schema';
import type { FamilyId } from './families.ts';
import { MODULE } from './params.ts';

export const RECORD_EVENT = {
  decision: 'record_decision',
  unitResult: 'record_unit_result',
  teaching: 'record_teaching',
  workProduct: 'record_work_product',
  evaluation: 'record_evaluation',
  conduct: 'record_conduct',
  fact: 'record_history_fact',
} as const;

/** Actor role the record reads on its own types: the coach whose evidence the row is. */
export const COACH_ROLE = 'coach';

const base = { family: 'career', importedAllowed: true, minTier: 1, harmClass: 'none', compactable: false } as const;
const common = { dutyFamily: 'string', simulated: 'boolean' } as const;
const READERS = [MODULE, 'models.labels', 'career.reputation', 'career.market'];

/**
 * Payload contract (all fields scalar, X2.1.1):
 * - every type: `dutyFamily` (S3.1.1 duty family id, or '' when not from a duty), `simulated` (S8.1.1 edge
 *   case: a simulated week's event is shown with the flag and counts toward no label sample).
 * - decision: `decisionKind` (fourth_down, two_point, timeout, challenge, clock, play_call), `matchedModel`
 *   (N3 grade at the time, E9.4.3 rule 1), `recommendation` (true when he advised and someone else decided,
 *   E9.4.3 rule 2), `rulesError` (E9.4.3 rule 3).
 * - unit result: `unit`, `aboveExpectation` (against the preseason expectation for that personnel, N2, E4.1.1).
 * - teaching: `measure` (development, assignment_errors, backup_readiness), `playerId`, `positionGroup`,
 *   `seasonYear`, `delta` (outcome minus the player's own projection, positive is better, E9.4.1 rule 1).
 * - work product: `product`, `checked`, `matched` (claims or tags checked against truth), `onTime`.
 * - evaluation: `kind` (grade, recommendation, prospect, recruit), `subjectPersonId`, `matched` (scored
 *   once when the outcome window closes, E9.4.5 rule 1).
 * - conduct: `kind` (promise, own_rule, staff, delegation), `kept`.
 * - history fact: `factType` (E9.1.2 rule 3 list), `refId`, `systemFamily`, `levelKey`, `hours`.
 */
export const RECORD_EVENT_TYPES: readonly EventTypeDef[] = [
  { ...base, id: RECORD_EVENT.decision, payloadSchema: { ...common, decisionKind: 'string', matchedModel: 'boolean', recommendation: 'boolean', rulesError: 'boolean' }, witnessRule: 'team', lineTemplate: 'record.line.decision', consumers: READERS },
  { ...base, id: RECORD_EVENT.unitResult, payloadSchema: { ...common, unit: 'string', aboveExpectation: 'boolean' }, witnessRule: 'public', lineTemplate: 'record.line.unit_result', consumers: READERS },
  { ...base, id: RECORD_EVENT.teaching, payloadSchema: { ...common, measure: 'string', playerId: 'id', positionGroup: 'string', seasonYear: 'number', delta: 'number' }, witnessRule: 'team', lineTemplate: 'record.line.teaching', consumers: READERS },
  { ...base, id: RECORD_EVENT.workProduct, payloadSchema: { ...common, product: 'string', checked: 'number', matched: 'number', onTime: 'boolean' }, witnessRule: 'team', lineTemplate: 'record.line.work_product', consumers: READERS },
  { ...base, id: RECORD_EVENT.evaluation, payloadSchema: { ...common, kind: 'string', subjectPersonId: 'id', matched: 'boolean' }, witnessRule: 'team', lineTemplate: 'record.line.evaluation', consumers: READERS },
  { ...base, id: RECORD_EVENT.conduct, payloadSchema: { ...common, kind: 'string', kept: 'boolean' }, witnessRule: 'team', lineTemplate: 'record.line.conduct', consumers: READERS },
  { ...base, id: RECORD_EVENT.fact, payloadSchema: { ...common, factType: 'string', refId: 'id', systemFamily: 'string', levelKey: 'string', hours: 'number' }, witnessRule: 'people', lineTemplate: 'record.line.fact', consumers: [MODULE] },
].map((t) => EventTypeDef.parse(t));

/** How one event type's outcome is read: a boolean payload field, counts, or a fixed outcome. */
export type OutcomeRule =
  | { readonly kind: 'flag'; readonly field: string }
  | { readonly kind: 'counts'; readonly checked: string; readonly matched: string }
  | { readonly kind: 'fixed'; readonly matched: boolean }
  | { readonly kind: 'sign'; readonly field: string };

/** One evidence map row: which family a type feeds and which actor's evidence it is. */
export interface EvidenceRow {
  readonly type: string;
  readonly family: FamilyId;
  /** Actor role whose record the row enters; null takes every actor. */
  readonly actorRole: string | null;
  readonly outcome: OutcomeRule;
}

export const DEFAULT_EVIDENCE_MAP: readonly EvidenceRow[] = [
  { type: RECORD_EVENT.decision, family: 'decisions', actorRole: COACH_ROLE, outcome: { kind: 'flag', field: 'matchedModel' } },
  { type: RECORD_EVENT.unitResult, family: 'unit_results', actorRole: COACH_ROLE, outcome: { kind: 'flag', field: 'aboveExpectation' } },
  { type: RECORD_EVENT.teaching, family: 'teaching', actorRole: COACH_ROLE, outcome: { kind: 'sign', field: 'delta' } },
  { type: RECORD_EVENT.workProduct, family: 'work_products', actorRole: COACH_ROLE, outcome: { kind: 'counts', checked: 'checked', matched: 'matched' } },
  { type: RECORD_EVENT.evaluation, family: 'evaluations', actorRole: COACH_ROLE, outcome: { kind: 'flag', field: 'matched' } },
  { type: RECORD_EVENT.conduct, family: 'conduct', actorRole: COACH_ROLE, outcome: { kind: 'flag', field: 'kept' } },
  // L1.3.1 promise rows written by career/players: the promiser's conduct (E9.1.1 family 6).
  { type: 'promise_kept', family: 'conduct', actorRole: 'promiser', outcome: { kind: 'fixed', matched: true } },
  { type: 'promise_broken', family: 'conduct', actorRole: 'promiser', outcome: { kind: 'fixed', matched: false } },
];

export type EvidenceMap = readonly EvidenceRow[];

/** Index a map by type; a type listed twice is a content error. */
export function indexMap(map: EvidenceMap): Map<string, EvidenceRow[]> {
  const out = new Map<string, EvidenceRow[]>();
  for (const r of map) {
    const list = out.get(r.type) ?? [];
    list.push(r);
    out.set(r.type, list);
  }
  return out;
}

/** Problems with an evidence map (content build check). */
export function evidenceMapProblems(map: EvidenceMap): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of map) {
    const k = `${r.type}|${r.actorRole ?? '*'}`;
    if (seen.has(k)) out.push(`evidence map: ${k} listed twice`);
    seen.add(k);
  }
  return out;
}

/** checked and matched for one row: a flag row counts one check. */
export interface Outcome { readonly checked: number; readonly matched: number }

function num(v: unknown): number | null { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

export function outcomeOf(e: WorldEvent, rule: OutcomeRule): Outcome {
  switch (rule.kind) {
    case 'fixed': return { checked: 1, matched: rule.matched ? 1 : 0 };
    case 'flag': {
      const v = e.payload[rule.field];
      return typeof v === 'boolean' ? { checked: 1, matched: v ? 1 : 0 } : { checked: 0, matched: 0 };
    }
    case 'sign': {
      const v = num(e.payload[rule.field]);
      return v === null ? { checked: 0, matched: 0 } : { checked: 1, matched: v > 0 ? 1 : 0 };
    }
    case 'counts': {
      const c = num(e.payload[rule.checked]);
      const m = num(e.payload[rule.matched]);
      if (c === null || m === null || c < 0) return { checked: 0, matched: 0 };
      return { checked: Math.trunc(c), matched: Math.max(0, Math.min(Math.trunc(m), Math.trunc(c))) };
    }
  }
}

export function isSimulated(e: WorldEvent): boolean { return e.payload['simulated'] === true; }

export type EventDraft = Omit<WorldEvent, 'id' | 'notability'>;

export interface DraftMeta {
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly teamId: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

/** A draft of one of this module's types for the coach `personId`, witnessed by his team. */
export function draftEvidence(type: string, meta: DraftMeta, personId: number, payload: EventDraft['payload']): EventDraft {
  const def = RECORD_EVENT_TYPES.find((t) => t.id === type);
  if (!def) throw new Error(`record: unknown evidence type ${type}`);
  const witnesses: WorldEvent['witnesses'] = def.witnessRule === 'public' || meta.teamId === null
    ? (def.witnessRule === 'people' ? { kind: 'people', personIds: [personId] } : { kind: 'public' })
    : def.witnessRule === 'people' ? { kind: 'people', personIds: [personId] } : { kind: 'team', teamId: meta.teamId };
  return {
    type,
    when: { date: meta.date, period: null, clockTenths: null },
    competitionId: meta.competitionId,
    where: { teamId: meta.teamId, venueId: null },
    actors: [{ personId, role: COACH_ROLE }],
    subjects: [],
    payload: { dutyFamily: '', simulated: false, ...payload },
    witnesses,
    causeId: null,
    tier: meta.tier,
    source: meta.source,
  };
}
