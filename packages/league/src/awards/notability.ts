// X4 notability pass: score per event (X4.1.1), expectation (X4.1.2), bands and keep line (X4.2.1),
// consumer thresholds (X4.3.1), inbox pacing (X4.3.2) and the protected-person cap (X4.4.1). The score is
// computed once at emit and never changed (X4.1.1 rule 4); G-22's EventLog takes `notabilityFor` as its
// `notabilityOf` hook. No term reads X1 traits or hidden attributes (X4.1.1 rule 5).
import type { EventTypeDef, WorldEvent } from '@gm/schema';
import content from './notability.json' with { type: 'json' };
import { param } from './params.ts';
import type { Band } from './types.ts';

export interface NotabilityContent {
  readonly familyDefault: Readonly<Record<string, number>>;
  readonly types: Readonly<Record<string, number>>;
  readonly stakes: Readonly<Record<string, number>>;
  readonly careerTypes: readonly string[];
  readonly rungBase: Readonly<Record<string, number>>;
}
export const NOTABILITY_CONTENT: NotabilityContent = content;

export type EdgeKind = 'worked_under' | 'teammate' | 'rival';

/** Everything the score reads about one event besides its type. All public or log-derived. */
export interface NotabilityContext {
  /** X4.1.2: pre-event expectation of the outcome, frozen at kickoff (0 to 1). Null: no model output. */
  readonly expectation?: number | null;
  /** Outcome on the same scale (1 win, 0 loss, 0.5 tie). */
  readonly outcome?: number | null;
  /** Stakes keys from the content table (playoff, title, rivalry...). */
  readonly stakes?: readonly string[];
  /** Length of the streak this event extends. */
  readonly streak?: number;
  readonly record?: 'team' | 'level' | null;
  /** An edge between actors on opposite sides (X7). */
  readonly edge?: { readonly kind: EdgeKind; readonly formedInSave: boolean; readonly prior: boolean } | null;
  readonly firstOrLast?: boolean;
  /** Rung of the job for career events (X4.1.1 rule 3). */
  readonly rung?: string | null;
  /** Protected (imported) people on each side of the edge, for X4.4.1. */
  readonly protectedSides?: { readonly a: boolean; readonly b: boolean };
  /** True when any actor of the event is a protected person (X4.4.1 rule 4). */
  readonly protectedActor?: boolean;
}

export interface ScoreParts {
  readonly base: number; readonly surprise: number; readonly stakes: number; readonly streak: number;
  readonly record: number; readonly relationship: number; readonly firstOrLast: number;
  readonly capped: boolean; readonly score: number;
}

/** X4.4.1: may the relationship term use this edge? */
export function edgeCounts(ctx: NotabilityContext): boolean {
  const e = ctx.edge;
  if (!e) return false;
  const p = ctx.protectedSides ?? { a: false, b: false };
  if (p.a && p.b) return e.kind !== 'rival' || e.prior || e.formedInSave;
  if (p.a || p.b) return e.formedInSave;
  return true;
}

/** X4.1.1 base for a type: the content row, else the career rung base, else the family default (0 for play events). */
export function baseFor(type: string, family: string, rung: string | null | undefined, c: NotabilityContent = NOTABILITY_CONTENT): number {
  if (c.careerTypes.includes(type) && rung && c.rungBase[rung] !== undefined) return c.rungBase[rung]!;
  if (c.types[type] !== undefined) return c.types[type]!;
  return c.familyDefault[family] ?? 0;
}

export function scoreParts(type: string, family: string, ctx: NotabilityContext, c: NotabilityContent = NOTABILITY_CONTENT): ScoreParts {
  const cap = param('notability.cap');
  const base = baseFor(type, family, ctx.rung, c);
  const surprise = ctx.expectation === null || ctx.expectation === undefined || ctx.outcome === null || ctx.outcome === undefined
    ? 0 : param('notability.surpriseWeight') * Math.abs(ctx.outcome - ctx.expectation);
  const stakes = Math.min(param('notability.stakesMax'), (ctx.stakes ?? []).reduce((m, k) => Math.max(m, c.stakes[k] ?? 0), 0));
  const start = param('notability.streakStartLength');
  const streak = Math.min(param('notability.streakCap'), Math.max(0, (ctx.streak ?? 0) - start) * param('notability.streakPerStep'));
  const record = ctx.record === 'level' ? param('notability.recordLevel') : ctx.record === 'team' ? param('notability.recordTeam') : 0;
  const relationship = edgeCounts(ctx) ? param('notability.relationship') : 0;
  const firstOrLast = ctx.firstOrLast ? param('notability.firstOrLast') : 0;
  let score = Math.min(cap, base + surprise + stakes + streak + record + relationship + firstOrLast);
  let capped = false;
  // X4.4.1 rule 4: a protected person's event does not reach `historic` on the relationship and
  // first-or-last terms alone.
  const historic = param('notability.band.historic');
  if (ctx.protectedActor && score >= historic) {
    const without = Math.min(cap, base + surprise + stakes + streak + record);
    if (without < historic) { score = param('notability.protectedHistoricCap'); capped = true; }
  }
  return { base, surprise, stakes, streak, record, relationship, firstOrLast, capped, score: Math.round(score) };
}

/** The score alone (0 to 100, whole number). */
export function scoreEvent(type: string, family: string, ctx: NotabilityContext, c?: NotabilityContent): number {
  return scoreParts(type, family, ctx, c).score;
}

/**
 * Builds G-22's `notabilityOf` hook. `contextOf` supplies what the row cannot say by itself (expectation,
 * streak, record state, edges); it must read only state frozen before the event.
 */
export function notabilityFor(contextOf: (draft: WorldEvent) => NotabilityContext, c?: NotabilityContent) {
  return (draft: WorldEvent, def: EventTypeDef): number => scoreEvent(draft.type, def.family, contextOf(draft), c);
}

/** X4.2.1 band; each edge belongs to the higher band (rule 1). */
export function bandOf(score: number): Band {
  if (score >= param('notability.band.historic')) return 'historic';
  if (score >= param('notability.band.notable')) return 'notable';
  if (score >= param('notability.band.noted')) return 'noted';
  return 'routine';
}

export const BANDS: readonly Band[] = ['routine', 'noted', 'notable', 'historic'];

/** X4.2.1: the keep line used by compaction, kept inside its limits (rule 4). */
export function keepLine(override?: number): number {
  const v = override ?? param('notability.keepLine');
  return Math.min(param('notability.keepLineMax'), Math.max(param('notability.keepLineMin'), v));
}

/** X2.4.1 rule 4: events at or over the keep line are never compacted. Feed to G-22 compaction. */
export function isKept(e: Pick<WorldEvent, 'notability'>, line: number = keepLine()): boolean {
  return e.notability !== null && e.notability >= line;
}

export type Consumer = 'chronicle' | 'localMedia' | 'nationalMedia' | 'recruiting' | 'interview';

export function consumerThreshold(c: Consumer): number { return param(`notability.consumer.${c}`); }

/**
 * X4.3.1: events a consumer reacts to, highest score first (ties by time then id). `visible` applies the
 * X3.1.3 visibility check. Interviewers look only at the candidate's own events in the last seasons.
 */
export function forConsumer(rows: readonly WorldEvent[], c: Consumer, visible: (e: WorldEvent) => boolean = () => true,
  interview?: { readonly candidateId: number; readonly season: number }): WorldEvent[] {
  const t = consumerThreshold(c);
  const limit = param('notability.consumer.interviewSeasons');
  return rows.filter((e) => e.notability !== null && e.notability >= t && visible(e) && (!interview || (
    e.actors.some((a) => a.personId === interview.candidateId) && interview.season - e.when.date.seasonYear < limit)))
    .sort(byScore);
}

/** Score, then event time, then id: the X4.2.2 ordering used everywhere a list of events is cut. */
export function byScore(a: WorldEvent, b: WorldEvent): number {
  return (b.notability ?? 0) - (a.notability ?? 0)
    || a.when.date.seasonYear - b.when.date.seasonYear || a.when.date.dayIndex - b.when.date.dayIndex || a.id - b.id;
}

export interface Closeness { readonly ownTeam: boolean; readonly edge: boolean; readonly conference: boolean }

/** X4.3.2: one week's inbox. Single items reach the line with the closeness bonus; the rest at 60+ go to a capped digest. */
export function inboxWeek(rows: readonly WorldEvent[], closeness: (e: WorldEvent) => Closeness): { single: WorldEvent[]; digest: WorldEvent[] } {
  const single: WorldEvent[] = [];
  const rest: WorldEvent[] = [];
  for (const e of [...rows].sort(byScore)) {
    const s = e.notability ?? 0;
    const c = closeness(e);
    const bonus = c.ownTeam ? param('notability.inbox.closeTeam') : c.edge ? param('notability.inbox.closeEdge') : c.conference ? param('notability.inbox.closeConference') : 0;
    if (s + bonus >= param('notability.inbox.singleItem')) single.push(e);
    else if (s >= keepLine()) rest.push(e);
  }
  return { single, digest: rest.slice(0, param('notability.inbox.digestCap')) };
}
