// The consistency ledger (E10.4.1): what the coach said against what he did, commitment by commitment.
// It reads logged decisions only, never note text and never truth the coach could not see (rule 2).
// It changes nothing on the field (rule 7): its outputs are counts, examples, a consistency share,
// trust events for area L (sizes are L1's), and the measure N2.8 reads ("does what he says").
// Discipline consistency is computed once in L3.3.1; this ledger shows that value under the matching
// commitment and emits no second event (rule 5).
import { param } from './params.ts';
import { catalogueEntry, dayOrder, type Commitment, type MeasureKind, type Philosophy, type WitnessRule, type WorldDay } from './philosophy.ts';

interface DecisionBase {
  /** Decision-log id (N3) of the record this row links to. */
  readonly id: number;
  readonly date: WorldDay;
  /** Who made the decision. A commitment is tested only on decisions that were his (E10.5.2 acceptance). */
  readonly deciderId: number;
  /**
   * Whether the facts that make it a break were visible to him at the time (N3 information rule).
   * When false the decision is never recorded as a break (E10.4.1 rule 2, acceptance 3).
   */
  readonly factsKnown: boolean;
}

/** One logged decision, by the measure that reads it. Fields are what the owner leaf logs. */
export type LedgerDecision =
  | (DecisionBase & { readonly kind: 'depth_change'; readonly promotedId: number; readonly demotedId: number; readonly promotedGrade: number; readonly demotedGrade: number; readonly demotedIsStarOrHighPick: boolean })
  | (DecisionBase & { readonly kind: 'discipline_case'; readonly playerId: number; readonly consistent: boolean; readonly l3EventId: number })
  | (DecisionBase & { readonly kind: 'fourth_down'; readonly went: boolean; readonly goAdvantageEp: number })
  | (DecisionBase & { readonly kind: 'two_point'; readonly went: boolean; readonly goAdvantageEp: number })
  | (DecisionBase & { readonly kind: 'young_snaps'; readonly gameId: number; readonly youngSnapShare: number })
  | (DecisionBase & { readonly kind: 'game_penalties'; readonly gameId: number; readonly penaltyYards: number })
  | (DecisionBase & { readonly kind: 'late_game_calls'; readonly gameId: number; readonly leadingLate: boolean; readonly runShare: number })
  | (DecisionBase & { readonly kind: 'roster_notice'; readonly playerId: number; readonly toldFirst: boolean })
  | (DecisionBase & { readonly kind: 'injury_return'; readonly playerId: number; readonly cleared: boolean; readonly played: boolean });

export type Verdict = 'honoured' | 'broken' | null;

/** The test of each measure (E10.4.1 rule 1). Null means the decision does not bear on it. */
export function verdict(catalogueId: string, d: LedgerDecision): Verdict {
  const e = catalogueEntry(catalogueId);
  if (e.measure !== d.kind) return null;
  switch (d.kind) {
    case 'depth_change': return d.promotedGrade >= d.demotedGrade ? 'honoured' : 'broken';
    case 'discipline_case': return d.consistent ? 'honoured' : 'broken';
    case 'fourth_down':
    case 'two_point': {
      // Only decisions where the model rated going better by the margin test the commitment.
      if (d.goAdvantageEp < param('fourthDownGoMarginEp')) return null;
      return d.went ? 'honoured' : 'broken';
    }
    case 'young_snaps': return d.youngSnapShare >= param('youngPlayerMinSnapShare') ? 'honoured' : 'broken';
    case 'game_penalties': return d.penaltyYards <= param('penaltyGameMaxYards') ? 'honoured' : 'broken';
    case 'late_game_calls': return d.leadingLate ? (d.runShare >= param('lateGameRunShareMin') ? 'honoured' : 'broken') : null;
    case 'roster_notice': return d.toldFirst ? 'honoured' : 'broken';
    case 'injury_return': return d.played ? (d.cleared ? null : 'broken') : (d.cleared ? null : 'honoured');
  }
}

/** Whether keeping the commitment cost something (rule 4): benching a star or a high pick for it. */
function costly(d: LedgerDecision): boolean {
  return d.kind === 'depth_change' && d.demotedIsStarOrHighPick;
}

function inForce(c: Commitment, d: LedgerDecision): boolean {
  return dayOrder(d.date, c.dateStated) >= 0 && (c.dropped === null || dayOrder(d.date, c.dropped) < 0);
}

/** Decisions that count against a commitment: his own, made while it stood, with the facts visible. */
function counted(p: Philosophy, c: Commitment, decisions: readonly LedgerDecision[]): { d: LedgerDecision; v: 'honoured' | 'broken' }[] {
  const out: { d: LedgerDecision; v: 'honoured' | 'broken' }[] = [];
  for (const d of decisions) {
    if (d.deciderId !== p.personId || !inForce(c, d)) continue;
    const v = verdict(c.catalogueId, d);
    if (v === null) continue;
    if (v === 'broken' && !d.factsKnown) continue;
    out.push({ d, v });
  }
  return out;
}

export interface LedgerRow {
  readonly catalogueId: string;
  readonly wording: string | null;
  readonly textKey: string;
  readonly audience: Commitment['audience'];
  readonly dateStated: WorldDay;
  readonly dropped: WorldDay | null;
  readonly measure: MeasureKind;
  readonly honoured: number;
  readonly broken: number;
  /** Honoured share over the window, or null when not yet tested in it. */
  readonly consistency: number | null;
  readonly recentHonoured: readonly number[];
  readonly recentBroken: readonly number[];
  readonly status: 'not_yet_tested' | 'tested';
  /** Discipline rows show L3.3.1's value and emit nothing of their own (rule 5). */
  readonly fromL3: boolean;
}

/**
 * The ledger page (E10.4.1 "What the user sees"). One row per commitment ever made, dropped ones kept.
 * Counts equal the number of linked decision records (acceptance 1).
 */
export function buildLedger(p: Philosophy, decisions: readonly LedgerDecision[], now: WorldDay): LedgerRow[] {
  const sorted = [...decisions].sort((a, b) => dayOrder(a.date, b.date) || a.id - b.id);
  const windowStart = now.seasonYear - param('ledgerWindowSeasons') + 1;
  const n = param('ledgerRecentExamples');
  return p.commitments.map((c) => {
    const rows = counted(p, c, sorted);
    const win = rows.filter((r) => r.d.date.seasonYear >= windowStart);
    const h = rows.filter((r) => r.v === 'honoured');
    const b = rows.filter((r) => r.v === 'broken');
    const wh = win.filter((r) => r.v === 'honoured').length;
    const e = catalogueEntry(c.catalogueId);
    return {
      catalogueId: c.catalogueId, wording: c.wording, textKey: e.textKey, audience: c.audience,
      dateStated: c.dateStated, dropped: c.dropped, measure: e.measure,
      honoured: h.length, broken: b.length,
      consistency: win.length === 0 ? null : wh / win.length,
      recentHonoured: h.slice(-n).map((r) => r.d.id).reverse(),
      recentBroken: b.slice(-n).map((r) => r.d.id).reverse(),
      status: rows.length === 0 ? 'not_yet_tested' : 'tested',
      fromL3: e.measure === 'discipline_case',
    };
  });
}

/** A trust event for area L. Sizes are L1's; this says only what happened and who saw it. */
export interface LedgerEvent {
  readonly kind: 'commitment_broken' | 'commitment_honoured_at_cost';
  readonly catalogueId: string;
  readonly decisionId: number;
  readonly witnesses: WitnessRule;
  /** Players directly involved (the demoted player, the player not told, the player who played hurt). */
  readonly involvedPersonIds: readonly number[];
  /** The commitment was made to this person in person (larger effect, rule 3). */
  readonly madeInPerson: boolean;
}

function involved(d: LedgerDecision): number[] {
  switch (d.kind) {
    case 'depth_change': return [d.demotedId, d.promotedId];
    case 'discipline_case':
    case 'roster_notice':
    case 'injury_return': return [d.playerId];
    default: return [];
  }
}

/**
 * Events one new decision emits (rules 3 to 5). A break is emitted only when the facts were visible;
 * a discipline case emits nothing here because L3.3.1 already emitted its one event.
 */
export function ledgerEvents(p: Philosophy, d: LedgerDecision): LedgerEvent[] {
  if (p.draft || d.deciderId !== p.personId) return [];
  const out: LedgerEvent[] = [];
  const seen = new Set<string>();
  for (const c of p.commitments) {
    if (!inForce(c, d) || seen.has(c.catalogueId)) continue;
    const e = catalogueEntry(c.catalogueId);
    if (e.measure === 'discipline_case') continue;
    const v = verdict(c.catalogueId, d);
    if (v === null || (v === 'broken' && !d.factsKnown)) continue;
    if (v === 'honoured' && !costly(d)) continue;
    seen.add(c.catalogueId);
    const people = involved(d);
    out.push({
      kind: v === 'broken' ? 'commitment_broken' : 'commitment_honoured_at_cost',
      catalogueId: c.catalogueId, decisionId: d.id, witnesses: e.witnesses, involvedPersonIds: people,
      madeInPerson: p.commitments.some((x) => x.catalogueId === c.catalogueId && x.toPersonId !== null && people.includes(x.toPersonId) && inForce(x, d)),
    });
  }
  return out;
}

/** The one line shown before a decision that would break a stated commitment. It never blocks. */
export interface Warning { readonly catalogueId: string; readonly key: string; readonly wording: string | null }

export function warnBeforeDecision(p: Philosophy, pending: LedgerDecision): Warning[] {
  if (p.draft) return [];
  const out: Warning[] = [];
  for (const c of p.commitments) {
    if (!inForce(c, pending) || out.some((w) => w.catalogueId === c.catalogueId)) continue;
    if (verdict(c.catalogueId, pending) === 'broken' && pending.factsKnown) {
      out.push({ catalogueId: c.catalogueId, key: `ledger.warning.${c.catalogueId}`, wording: c.wording });
    }
  }
  return out;
}

/** The measure N2.8 reads for "does what he says" / "says one thing and does another". */
export function consistencyMeasure(rows: readonly LedgerRow[]): { readonly honoured: number; readonly broken: number; readonly share: number | null } {
  const honoured = rows.reduce((s, r) => s + r.honoured, 0);
  const broken = rows.reduce((s, r) => s + r.broken, 0);
  return { honoured, broken, share: honoured + broken === 0 ? null : honoured / (honoured + broken) };
}
