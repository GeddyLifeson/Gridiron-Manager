// Decision log screen (film.decision_log; N3.2 decisions, N3.3 the model's view, N3.4 review). Every
// logged decision with the model's view as it stood at the time and the outcome. Built from the decision
// log's joined views (models decisions `DecisionLog.views`). The truth view is never read here: it is
// stored apart and shown only in the coaching school (N3.1.2, N5); a career review shows the staff
// version of the model, with its range, and never a class for a single play call (N3.3.2).
import { decisions } from '@gm/models';

type LogView = decisions.DecisionView;

export type ModelLine =
  | { readonly kind: 'game_management'; readonly best: string; readonly bestLabelKey: string; readonly cost: number; readonly margin: number; readonly class: decisions.DecisionClass; readonly lacks: readonly string[]; readonly sparse: boolean;
      readonly options: readonly { readonly optionId: string; readonly labelKey: string; readonly value: number; readonly low: number; readonly high: number; readonly sparse: boolean }[] }
  | { readonly kind: 'play_call'; readonly foresight: number; readonly foresightSample: number; readonly predictability: number }
  | { readonly kind: 'follow_up'; readonly due: readonly string[]; readonly done: readonly { readonly dueDate: string; readonly bandsOverlapped: boolean; readonly people: number }[] }
  | { readonly kind: 'pending' };

export interface DecisionRow {
  readonly id: string;
  readonly worldDate: string;
  readonly gameId: number | null;
  readonly playIndex: number | null;
  readonly period: number | null;
  readonly clockTenths: number | null;
  readonly type: string;
  readonly scope: 'game' | 'week';
  readonly owner: string;
  readonly actor: decisions.DecisionActor['kind'];
  readonly actorId: number | null;
  readonly credited: number;
  readonly basis: decisions.Attribution['basis'];
  readonly viaId: number | null;
  readonly chosen: string;
  readonly chosenLabelKey: string;
  readonly notMade: boolean;
  /** Items the user had in front of him and whether he opened them (N3.1.2). */
  readonly information: readonly { readonly source: string; readonly viewed: boolean }[];
  readonly secondsToDecide: number;
  readonly model: ModelLine;
  /** What happened, by value, and the N1.3.1 luck split where it applies. */
  readonly outcome: decisions.DecisionOutcome | null;
  readonly supersededBy: readonly string[];
  readonly supersedes: string | null;
}

export interface DecisionLogFilter {
  readonly scope?: 'game' | 'week' | 'all';
  readonly type?: string | null;
  readonly gameId?: number | null;
  /** 'mine' = the user's own choices; 'staff' = delegated or staff calls; 'all'. */
  readonly who?: 'mine' | 'staff' | 'all';
  /** Only game-management decisions the model classed clearly wrong. */
  readonly clearlyWrongOnly?: boolean;
}

export interface DecisionLogView {
  readonly rows: readonly DecisionRow[];
  readonly total: number;
  /** Types present in the log, for the filter list (N3.2 catalogue order). */
  readonly types: readonly string[];
  readonly games: readonly number[];
  readonly summary: { readonly clearlyRight: number; readonly tossUp: number; readonly clearlyWrong: number; readonly costTotal: number; readonly pendingModel: number };
}

function modelLine(v: LogView): ModelLine {
  const m = v.modelView;
  if (!m) return { kind: 'pending' };
  if (m.kind === 'game_management') {
    const label = (id: string) => v.record.options.find((o) => o.optionId === id)?.labelKey ?? id;
    return {
      kind: 'game_management', best: m.best, bestLabelKey: label(m.best), cost: m.cost, margin: m.margin, class: m.class, lacks: m.lacks,
      sparse: m.options.some((o) => o.sparse),
      options: m.options.map((o) => ({ optionId: o.optionId, labelKey: label(o.optionId), value: o.value, low: o.low, high: o.high, sparse: o.sparse })),
    };
  }
  if (m.kind === 'play_call') return { kind: 'play_call', foresight: m.foresight, foresightSample: m.foresightSample, predictability: m.predictability };
  return { kind: 'follow_up', due: m.followUps, done: v.followUps.map((f) => ({ dueDate: f.dueDate, bandsOverlapped: f.bandsOverlapped, people: f.people.length })) };
}

const ORDER = new Map(decisions.DECISION_TYPES.map((d, i) => [d.type, i] as const));
const scopeOf = (type: string): 'game' | 'week' => (decisions.isDecisionType(type) ? decisions.decisionType(type).scope : 'week');

function row(v: LogView): DecisionRow {
  const r = v.record;
  return {
    id: r.id, worldDate: r.time.worldDate, gameId: r.time.gameId, playIndex: r.time.playIndex, period: r.time.period, clockTenths: r.time.gameClockTenths,
    type: r.type, scope: scopeOf(r.type), owner: r.owner, actor: r.actor.kind, actorId: r.actor.personId,
    credited: r.attribution.creditedPersonId, basis: r.attribution.basis, viaId: r.attribution.viaPersonId,
    chosen: r.chosen, chosenLabelKey: r.options.find((o) => o.optionId === r.chosen)?.labelKey ?? r.chosen, notMade: r.notMade,
    information: r.information.map((it) => ({ source: it.source, viewed: it.viewed })),
    secondsToDecide: r.timeTaken.tenthsFromPrompt / 10,
    model: modelLine(v), outcome: v.outcome, supersededBy: v.supersededBy, supersedes: r.supersedes,
  };
}

/** Newest first: by date, then game clock order inside a game (later play first). */
const newestFirst = (a: DecisionRow, b: DecisionRow): number =>
  (a.worldDate < b.worldDate ? 1 : a.worldDate > b.worldDate ? -1 : 0) || (b.playIndex ?? -1) - (a.playIndex ?? -1) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export function buildDecisionLog(views: readonly LogView[], teamId: number, f: DecisionLogFilter = {}): DecisionLogView {
  const all = views.filter((v) => v.record.teamId === teamId).map(row);
  const rows = all.filter((r) =>
    (f.scope === undefined || f.scope === 'all' || r.scope === f.scope)
    && (!f.type || r.type === f.type)
    && (f.gameId === undefined || f.gameId === null || r.gameId === f.gameId)
    && (f.who === undefined || f.who === 'all' || (f.who === 'mine' ? r.actor === 'user' : r.actor === 'staff' || r.basis === 'delegated'))
    && (!f.clearlyWrongOnly || (r.model.kind === 'game_management' && r.model.class === 'clearly_wrong')),
  ).sort(newestFirst);
  let clearlyRight = 0, tossUp = 0, clearlyWrong = 0, costQ = 0, pendingModel = 0;
  for (const r of rows) {
    if (r.model.kind === 'pending') pendingModel++;
    if (r.model.kind !== 'game_management') continue;
    if (r.model.class === 'clearly_right') clearlyRight++; else if (r.model.class === 'toss_up') tossUp++; else clearlyWrong++;
    costQ += Math.round(r.model.cost * 1e6);
  }
  return {
    rows, total: all.length,
    types: [...new Set(all.map((r) => r.type))].sort((a, b) => (ORDER.get(a) ?? 1e9) - (ORDER.get(b) ?? 1e9) || (a < b ? -1 : 1)),
    games: [...new Set(all.map((r) => r.gameId).filter((g): g is number => g !== null))].sort((a, b) => a - b),
    summary: { clearlyRight, tossUp, clearlyWrong, costTotal: costQ / 1e6, pendingModel },
  };
}
