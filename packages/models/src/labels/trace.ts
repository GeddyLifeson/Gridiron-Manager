// Tracing a label to its evidence (R1.2.9 gate rule 4, X2.2.1 "selecting one lists the events behind it").
// A trace re-checks a result against the log alone: every evidence id is a row in the log, matches the
// label's query for that subject, sits inside the window, was not reversed, and the rows by themselves
// give back the measure the result reports.
import type { WorldEvent } from '@gm/schema';
import { matchCount, type LabelDef } from './define.ts';
import { evidenceItems, measureOf, type EvalContext, type LabelResult, type ReversalRef } from './evaluate.ts';
import { LABEL_PARAMS } from './params.ts';

export interface TraceResult {
  readonly ok: boolean;
  readonly rows: readonly WorldEvent[];
  readonly problems: readonly string[];
}

const TOLERANCE = 1e-9;

function close(a: number, b: number): boolean { return Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b)); }

export function traceLabel(def: LabelDef, result: LabelResult, byId: ReadonlyMap<number, WorldEvent>, ctx: EvalContext): TraceResult {
  const problems: string[] = [];
  const rows: WorldEvent[] = [];
  const p = (m: string) => problems.push(`${def.id} on ${result.subjectId}: ${m}`);
  if (result.labelId !== def.id) p(`result is for label ${result.labelId}`);
  if (result.state === 'held' && result.evidenceIds.length === 0) p('held with no evidence');
  let prev = 0;
  for (const id of result.evidenceIds) {
    const e = byId.get(id);
    if (!e) { p(`evidence ${id} is not in the log`); continue; }
    if (id <= prev) p(`evidence ${id} is out of log order`);
    prev = id;
    rows.push(e);
    const pos = matchCount(def.positive, def.subjectBy, result.subjectId, e) ?? 0;
    const neg = matchCount(def.negative, def.subjectBy, result.subjectId, e) ?? 0;
    if (pos + neg === 0) p(`evidence ${id} (${e.type}) does not match the label's query for this subject`);
    const rev = ctx.reversedBy?.get(id);
    if (rev !== undefined && rev.id <= result.evidenceIds[result.evidenceIds.length - 1]!) p(`evidence ${id} was reversed by ${rev.id}`);
    if (ctx.visible && !ctx.visible(e)) p(`evidence ${id} is not visible to this reader`);
  }
  if (rows.length) {
    const { items } = evidenceItems(def, result.subjectId, rows, { ...ctx, reversedBy: undefined });
    for (const it of items) if (result.evaluatedDay - it.day >= def.windowSeasons * LABEL_PARAMS.daysPerSeasonYear) p(`evidence ${it.eventId} is outside the window`);
    const m = measureOf(def, items, result.evaluatedDay);
    if (!close(m.measure, result.measure)) p(`rows give measure ${m.measure}, result says ${result.measure}`);
    if (!close(m.sample, result.sample)) p(`rows give sample ${m.sample}, result says ${result.sample}`);
    if (!close(m.z, result.z)) p(`rows give z ${m.z}, result says ${result.z}`);
  }
  return { ok: problems.length === 0, rows, problems };
}

/** Original id to its reversing row, for reversal rows of the given types (X2.1.3). */
export function reversalMap(rows: readonly WorldEvent[], reversalTypes: readonly string[] = ['result_vacated', 'stat_corrected', 'award_rescinded']): Map<number, ReversalRef> {
  const out = new Map<number, ReversalRef>();
  for (const r of rows) if (r.causeId !== null && reversalTypes.includes(r.type) && !out.has(r.causeId)) out.set(r.causeId, { id: r.id, date: r.when.date });
  return out;
}
