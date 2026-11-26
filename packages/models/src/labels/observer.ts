// Reputation held by observers (X2.3.1, N2.8.1 rule 5). A view is computed on demand and never stored: the
// public record as this observer receives it, plus first-hand impressions from rows he witnessed. The
// view carries labels and their basis; what the observer thinks of them is the consumer's leaf (rule 3).
import type { WorldDate, WorldEvent } from '@gm/schema';
import type { LabelDef } from './define.ts';
import { evaluateLabel, seasonTime, type Baseline, type EvalContext, type LabelResult } from './evaluate.ts';
import { LABEL_PARAMS as P } from './params.ts';

export interface Observer {
  readonly personId: number;
  /** The level the observer works at (a level key as `levelOf` returns). */
  readonly level: string;
  /** Teams the observer belonged to, by season year. */
  readonly teamsByYear: ReadonlyMap<number, ReadonlySet<number>>;
}

/** Rows anyone may know: public witnesses (X2.1.2 witness rule). */
export function isPublicRow(e: WorldEvent): boolean { return e.witnesses.kind === 'public'; }

/** Rows the observer saw himself: he acted, was named, was in the team or room, or it was his team's game. */
export function witnessedBy(o: Observer): (e: WorldEvent) => boolean {
  return (e) => {
    if (e.actors.some((a) => a.personId === o.personId)) return true;
    const w = e.witnesses;
    const teams = o.teamsByYear.get(e.when.date.seasonYear);
    if (w.kind === 'people') return w.personIds.includes(o.personId);
    if (w.kind === 'team' || w.kind === 'room') return !!teams?.has(w.teamId);
    if (w.kind === 'public') return e.where.teamId !== null && !!teams?.has(e.where.teamId);
    return false;
  };
}

export interface ViewEntry {
  readonly labelId: string;
  readonly basis: 'record' | 'observer';
  readonly held: boolean;
  /** Weight for formula consumers (X2.2.3 rule 5), after the level discount and the first-hand split. */
  readonly weight: number;
  readonly result: LabelResult;
}

export interface ViewContext extends Omit<EvalContext, 'asOf' | 'baseline' | 'visible' | 'minSampleScale'> {
  readonly asOf: WorldDate;
  readonly baselines: ReadonlyMap<string, Baseline>;
  /** Level the subject's record is at, as `levelOf` returns. */
  readonly subjectLevel: string;
}

function shiftBack(d: WorldDate, seasons: number): WorldDate {
  return { seasonYear: d.seasonYear - seasons, dayIndex: d.dayIndex };
}

/** One observer's view of a subject (X2.3.1 rules 1, 2 and 4). */
export function observerView(defs: readonly LabelDef[], subjectId: number, rows: readonly WorldEvent[], o: Observer, ctx: ViewContext): ViewEntry[] {
  const out: ViewEntry[] = [];
  const otherLevel = ctx.subjectLevel !== o.level;
  const seen = witnessedBy(o);
  for (const def of defs) {
    const baseline = ctx.baselines.get(def.id);
    if (!baseline) throw new Error(`no baseline for label ${def.id}`);
    const pubAsOf = otherLevel ? shiftBack(ctx.asOf, P.otherLevelDelaySeasons) : ctx.asOf;
    const pub = evaluateLabel(def, subjectId, rows, { ...ctx, asOf: pubAsOf, baseline, visible: isPublicRow });
    const first = evaluateLabel(def, subjectId, rows, { ...ctx, baseline, visible: seen, minSampleScale: P.impressionSampleShare });
    const pubWeight = pub.weight * (otherLevel ? P.otherLevelDiscount : 1);
    const hasFirst = first.evidenceIds.length > 0 && (first.state === 'held' || pub.state === 'held');
    const share = hasFirst && pub.state === 'held' ? P.firstHandRatio / (P.firstHandRatio + 1) : 1;
    if (pub.state === 'held') out.push({ labelId: def.id, basis: 'record', held: true, weight: pubWeight * (hasFirst ? 1 - share : 1), result: pub });
    if (hasFirst) out.push({ labelId: def.id, basis: 'observer', held: first.state === 'held', weight: first.weight * share, result: first });
  }
  return out;
}

/** Whether a public label's time is still in the future for an observer at the other level. */
export function delayedFor(o: Observer, subjectLevel: string, asOf: WorldDate, result: LabelResult): boolean {
  if (subjectLevel === o.level || !result.since) return false;
  return seasonTime(result.since) > seasonTime(shiftBack(asOf, P.otherLevelDelaySeasons));
}
