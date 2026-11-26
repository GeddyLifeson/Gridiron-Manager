// The decision record score (N4.2.1): one score per component (N4.1.1) on a 0 to 100 scale with a
// bootstrap range, where 50 is the reference coach (N4.2.3). Outcomes never enter a component score
// (N4.2.1 rule 4): this file reads model views and attribution only, never `outcome`.
import type { DecisionView, GameManagementView, PlayCallView } from '../decisions/types.ts';
import { COMPONENTS, componentForType, type ComponentDef, type ComponentId } from './components.ts';
import { param } from './params.ts';
import { bootstrap, clamp, effectiveCount, seedOf, shrunkMean, type Sample } from './stats.ts';

/** A sample from a system with no N3 model view (film, follow-ups, teaching, plans, drawn plays). */
export interface ExternalSample {
  readonly component: ComponentId;
  /** Value minus the reference value for the same task, in the component's unit. Higher is better. */
  readonly diff: number;
  readonly weight?: number;
  /** The logged record it comes from (N4.1.1 acceptance: every input can be opened). */
  readonly recordId: string;
  readonly seasonYear: number;
  readonly worldDate: string;
}

export interface ScoreVersions {
  readonly gameVersion: string;
  readonly epModel: string;
  readonly wpModel: string;
  readonly reference: string;
}

export interface ProfileInput {
  /** The person whose decisions are scored (the user, or an AI coach for comparison, N4.1.1 AI use). */
  readonly personId: number;
  /** Joined decisions from the log (`DecisionLog.views()`). */
  readonly views: readonly DecisionView[];
  /** Expected WP the reference coach gives up in the same situation (`referenceFourthDownLoss` and friends). */
  readonly referenceLoss: (d: DecisionView, view: GameManagementView) => number;
  /** The reference caller's foresight and predictability on the same situation (N4.2.1 rule 2), or null when not run. */
  readonly referenceCall: (d: DecisionView, view: PlayCallView) => { readonly foresight: number; readonly predictability: number } | null;
  /** Reference coach's share of late calls, for operation speed from the log. Omitted: only external samples count. */
  readonly referenceLateShare?: number;
  readonly external?: readonly ExternalSample[];
  /** N4.1.1 edge case: below coordinator only the components the rung owns accumulate (S3). Default: all. */
  readonly ownsComponent?: (rung: string, id: ComponentId) => boolean;
  /** People and program: descriptor keys from the label engine (shown as a description, not a score). */
  readonly peopleLabels?: readonly string[];
  /** Only records on or before this ISO day count (the page updates at most weekly). */
  readonly asOf?: string;
  /** Held-out calibration errors of the EP and WP models (N4.2.1 rule 6). Omitted: not checked yet. */
  readonly calibration?: { readonly ep: number; readonly wp: number };
  readonly versions: ScoreVersions;
  /** N4.1.1 open question (Marlon): a single headline number, off unless turned on. */
  readonly showHeadline?: boolean;
}

export type ComponentStatus = 'scored' | 'not_enough_evidence' | 'described' | 'model_not_calibrated';

export interface SeasonAggregate { readonly seasonYear: number; readonly n: number; readonly meanDiff: number }

export interface ComponentScore {
  readonly id: ComponentId;
  readonly status: ComponentStatus;
  readonly score: number | null;
  readonly low: number | null;
  readonly high: number | null;
  /** Credited decisions (weighted: an accepted suggestion counts at the suggestion weight). */
  readonly n: number;
  /** Records behind it. */
  readonly records: number;
  /** Under the shrinkage constant: the score is mostly the prior (N4.5.1 limit 1). */
  readonly mostlyPrior: boolean;
  /** Record ids that open as evidence. Empty for components scored against hidden truth (audit Part 17). */
  readonly evidence: readonly string[];
  /** Season aggregates, the only detail shown for truth-scored components. */
  readonly seasons: readonly SeasonAggregate[];
  /** Decisions of this component made by a delegate (not his, N4.2.1 edge case). */
  readonly delegated: number;
  /** False when the whole component was delegated: not certified for the user (N4.3.1 rule 6). */
  readonly certifiedForUser: boolean;
  /** Descriptor keys, for the people and program row only. */
  readonly labels: readonly string[];
}

/** A game-management or special-teams decision that counted as a loss (for the export's forced evidence). */
export interface ScoredLoss { readonly decisionId: string; readonly component: ComponentId; readonly lossWp: number }

/** `DecisionRecordProfile` (N4.1.1 output). */
export interface DecisionRecordProfile {
  readonly personId: number;
  readonly components: readonly ComponentScore[];
  readonly scoredDecisions: number;
  readonly games: number;
  readonly losses: readonly ScoredLoss[];
  readonly versions: ScoreVersions;
  /** Null unless `showHeadline` (N4.1.1: no single headline number unless the user turns one on). */
  readonly headline: number | null;
}

interface Bucket { samples: (Sample & { id: string; season: number })[]; delegated: number }

/**
 * N4.2.1 rule 7: a game-management decision is a loss only when the best option's edge over the chosen one
 * is at least the band and its interval excludes zero (the N3.3.1 class "clearly_wrong"); otherwise it is a
 * close call and scores zero whichever option was chosen.
 */
export function gameManagementLoss(view: GameManagementView, band = param('lossBandWp')): number {
  return view.class === 'clearly_wrong' && view.cost >= band ? view.cost : 0;
}

/** Credit weight of a decision for `personId`, or null when it is not his (N4.2.1 edge case, N3.2.1). */
export function creditWeight(d: DecisionView, personId: number): number | 'delegated' | null {
  const a = d.record.attribution;
  switch (a.basis) {
    case 'own_decision': return a.creditedPersonId === personId ? 1 : null;
    case 'suggestion_taken':
      // Half to the owner who accepted, the rest to the coordinator who suggested (N4.2.1 edge case).
      if (a.creditedPersonId === personId) return param('suggestionWeight');
      if (a.viaPersonId === personId) return 1 - param('suggestionWeight');
      return null;
    case 'delegated': return a.creditedPersonId === personId || a.viaPersonId === personId ? 'delegated' : null;
    case 'logged_under_boss': return null;
  }
}

function seasonOf(iso: string): number { return Number(iso.slice(0, 4)); }

function scale(def: ComponentDef): number {
  return def.unit === 'wp' ? param('scaleWp') : def.unit === 'ep' ? param('scaleEp') : param('scaleShare');
}

function toScore(def: ComponentDef, s: readonly Sample[]): number {
  return clamp(50 + scale(def) * shrunkMean(s), 0, 100);
}

export function profile(input: ProfileInput): DecisionRecordProfile {
  const buckets = new Map<ComponentId, Bucket>(COMPONENTS.map((c) => [c.id, { samples: [], delegated: 0 }]));
  const owns = input.ownsComponent ?? (() => true);
  const losses: ScoredLoss[] = [];
  const games = new Set<number>();
  const counted = new Set<string>();
  const adjust = new Map<number, { early: number[]; late: number[]; season: number; ids: string[] }>();
  const push = (id: ComponentId, diff: number, weight: number, recordId: string, season: number): void => {
    buckets.get(id)!.samples.push({ diff, weight, id: recordId, season });
    counted.add(recordId);
  };

  for (const d of input.views) {
    const r = d.record;
    if (input.asOf && r.time.worldDate > input.asOf) continue;
    if (d.supersededBy.length) continue; // replaced before it took effect (N3.1.1 edge case)
    const id = componentForType(r.type);
    const w = creditWeight(d, input.personId);
    if (w === null) continue;
    if (id && !owns(r.rung, id)) continue;
    if (w === 'delegated') { if (id) buckets.get(id)!.delegated++; continue; }
    const season = seasonOf(r.time.worldDate);
    if (r.time.gameId !== null) games.add(r.time.gameId);

    // Operation speed from the log: a confirmed call with the play clock running (N4.1.1).
    if (input.referenceLateShare !== undefined && r.timeTaken.playClockLeftTenths !== null && owns(r.rung, 'operation_speed')) {
      const onTime = r.timeTaken.playClockLeftTenths >= param('lateCallTenths') ? 1 : 0;
      push('operation_speed', onTime - (1 - input.referenceLateShare), w, r.id, season);
    }
    if (!id || !d.modelView) continue;
    const v = d.modelView;
    if (v.kind === 'game_management') {
      const loss = gameManagementLoss(v);
      if (loss > 0) losses.push({ decisionId: r.id, component: id, lossWp: loss });
      push(id, input.referenceLoss(d, v) - loss, w, r.id, season);
    } else if (v.kind === 'play_call') {
      const ref = input.referenceCall(d, v);
      if (!ref) continue;
      const diff = (v.foresight - ref.foresight) - param('predictabilityPenaltyEp') * (v.predictability - ref.predictability);
      push(id, diff, w, r.id, season);
      if (r.time.gameId !== null && r.time.period !== null && owns(r.rung, 'in_game_adjustment')) {
        const g = adjust.get(r.time.gameId) ?? { early: [], late: [], season, ids: [] };
        (r.time.period <= 1 ? g.early : g.late).push(diff);
        g.ids.push(r.id);
        adjust.set(r.time.gameId, g);
      }
    }
  }

  // In-game adjustment: per game, the call value (against the reference caller) after the first quarter
  // minus the value in it. One sample per game with calls in both windows (README "Readings").
  for (const [gameId, g] of adjust) {
    if (!g.early.length || !g.late.length) continue;
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    push('in_game_adjustment', mean(g.late) - mean(g.early), 1, `game:${gameId}`, g.season);
  }

  for (const e of input.external ?? []) {
    if (input.asOf && e.worldDate > input.asOf) continue;
    push(e.component, e.diff, e.weight ?? 1, e.recordId, e.seasonYear);
  }

  const components = COMPONENTS.map((def) => scoreComponent(def, buckets.get(def.id)!, input));
  const scored = components.filter((c) => c.status === 'scored');
  const headline = input.showHeadline && scored.length ? scored.reduce((a, c) => a + c.score!, 0) / scored.length : null;
  losses.sort((a, b) => b.lossWp - a.lossWp || (a.decisionId < b.decisionId ? -1 : 1));
  return { personId: input.personId, components, scoredDecisions: counted.size, games: games.size, losses, versions: input.versions, headline };
}

function uncalibrated(def: ComponentDef, input: ProfileInput): boolean {
  if (!input.calibration) return false;
  const max = param('calibrationMax');
  if (def.unit === 'wp') return input.calibration.wp > max;
  if (def.unit === 'ep') return input.calibration.ep > max;
  return false;
}

function scoreComponent(def: ComponentDef, b: Bucket, input: ProfileInput): ComponentScore {
  const n = effectiveCount(b.samples);
  const records = b.samples.length;
  const base = {
    id: def.id, n, records, mostlyPrior: n < param('shrinkageK'), delegated: b.delegated,
    certifiedForUser: !(records === 0 && b.delegated > 0),
    evidence: def.aggregateOnly ? [] : b.samples.map((s) => s.id),
    seasons: seasons(b),
    labels: [] as readonly string[],
  };
  if (def.unit === 'description') {
    return { ...base, status: 'described', score: null, low: null, high: null, evidence: [], labels: input.peopleLabels ?? [] };
  }
  if (uncalibrated(def, input)) return { ...base, status: 'model_not_calibrated', score: null, low: null, high: null };
  if (n < param('minEvidence')) return { ...base, status: 'not_enough_evidence', score: null, low: null, high: null };
  const seed = seedOf(`${def.id}|${b.samples.map((s) => s.id).join(',')}`);
  const range = bootstrap(b.samples, (xs) => toScore(def, xs), seed);
  return { ...base, status: 'scored', score: toScore(def, b.samples), low: range.low, high: range.high };
}

function seasons(b: Bucket): SeasonAggregate[] {
  const by = new Map<number, { n: number; sum: number }>();
  for (const s of b.samples) {
    const a = by.get(s.season) ?? { n: 0, sum: 0 };
    a.n += s.weight; a.sum += s.weight * s.diff;
    by.set(s.season, a);
  }
  return [...by.entries()].sort((x, y) => x[0] - y[0]).map(([seasonYear, a]) => ({ seasonYear, n: a.n, meanDiff: a.n ? a.sum / a.n : 0 }));
}
