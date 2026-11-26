// Outcomes at each band, release and repeat spacing (X5.2.3, X5.2.4 rules 1 and 2, X5.5.1).
// The act matches the need and what is legal now. Legality belongs to the owning rule areas (C6, T6, K7):
// the caller passes the acts that are legal this week, so this module never bypasses a window (rule 4).
// Level-neutral: which act a need produces is data, never a branch on a level (P1.1.2).
import { possible } from '@gm/schema';
import { np, type Draw } from './params.ts';
import type { NeedId } from './registry.ts';
import type { Contribution, StressBand, StressMemo } from './stress.ts';

/** Formal acts (X5.2.3 outputs). `meeting_requested` is the warning step, not a formal act. */
export const FORMAL_ACTS = ['trade_requested', 'portal_entry', 'holdout_started', 'effort_dropped', 'resigned', 'job_search_started'] as const;
export type FormalAct = (typeof FORMAL_ACTS)[number];

/** Acts a protected (imported real) person may take: football-ordinary, neutral wording (X5.5.1, D12.6.1). */
export const PROTECTED_ALLOWED_ACTS: readonly FormalAct[] = ['trade_requested', 'portal_entry', 'job_search_started'];

/**
 * Need to preferred acts, in order (X5.2.3 rule 1). The first legal one is taken. Starting content,
 * Assumption. A pro player with pay unmet may hold out; a college player may enter the portal in a window;
 * a coach with autonomy or recognition unmet starts a job search or resigns. Which of these is legal for a
 * person is decided by the caller from the rule areas, so the same table serves both levels.
 */
export const NEED_ACTS: Readonly<Record<NeedId, readonly FormalAct[]>> = {
  playing_time: ['trade_requested', 'portal_entry', 'effort_dropped'],
  role_and_respect: ['trade_requested', 'portal_entry', 'job_search_started', 'effort_dropped'],
  pay: ['holdout_started', 'trade_requested', 'portal_entry', 'job_search_started'],
  winning: ['trade_requested', 'portal_entry', 'job_search_started'],
  security: ['holdout_started', 'job_search_started', 'trade_requested'],
  development: ['portal_entry', 'trade_requested', 'job_search_started'],
  home_and_family: ['trade_requested', 'portal_entry', 'job_search_started', 'resigned'],
  autonomy: ['job_search_started', 'resigned'],
  recognition: ['job_search_started', 'trade_requested', 'resigned'],
};

/** Legal next steps after a formal act that the 8-week rule does not block (X5.2.4 rule 2). */
export const NEXT_STEPS: Readonly<Record<FormalAct, readonly FormalAct[]>> = {
  effort_dropped: ['trade_requested', 'portal_entry', 'holdout_started'],
  job_search_started: ['resigned'],
  holdout_started: ['trade_requested'],
  trade_requested: [],
  portal_entry: [],
  resigned: [],
};

export interface LastAct { readonly week: number; readonly kind: string }

export interface ActCandidate {
  readonly personId: number;
  readonly stress: number;
  readonly band: StressBand;
  readonly memo: StressMemo;
  readonly needLevels: Readonly<Record<NeedId, number>>;
  readonly weights: Readonly<Record<NeedId, number>>;
  readonly loyalty: number;
  readonly candor: number;
  readonly isProtected: boolean;
  readonly isUser: boolean;
  /** Acts legal for this person this week (C6, T6, K7 windows and contract rules). */
  readonly legalActs: readonly FormalAct[];
  readonly lastAct: LastAct | null;
  /** Prior acts by kind to their week, for the same-act spacing. */
  readonly actHistory: readonly LastAct[];
  /** True if a warning (meeting request or staff observation) was logged since the band was entered. */
  readonly warned: boolean;
}

export type Outcome =
  | { readonly personId: number; readonly kind: 'meeting_requested'; readonly needId: NeedId }
  | { readonly personId: number; readonly kind: FormalAct; readonly needId: NeedId; readonly finalStraw: string; readonly release: number };

export interface WeekOutcomes {
  readonly outcomes: readonly Outcome[];
  /** Acts drawn but held back by the team cap, highest stress first (X5.2.3 rule 6). */
  readonly deferred: readonly number[];
}

/** Largest weighted unmet need, ties to the lower id so the choice is the same on every platform. */
export function largestUnmetNeed(levels: Readonly<Record<NeedId, number>>, weights: Readonly<Record<NeedId, number>>): NeedId | null {
  let best: NeedId | null = null;
  let bestV = 0;
  for (const id of Object.keys(levels).sort()) {
    const v = (levels[id] ?? 0) * (weights[id] ?? 0);
    if (v > bestV) { best = id; bestV = v; }
  }
  return best;
}

/** X5.2.3 rule 2: 15 percent a week, reduced by loyalty. */
export function actChance(loyalty: number): number {
  const l = Math.min(100, Math.max(0, loyalty)) / 100;
  return possible(np('needs.act.weeklyChance') * (1 - np('needs.act.loyaltyReductionMax') * l));
}

/** X5.2.4 rule 2: is this act blocked by repeat spacing? */
export function spacingBlocks(act: FormalAct, week: number, last: LastAct | null, history: readonly LastAct[]): boolean {
  if (history.some((h) => h.kind === act && week - h.week < np('needs.spacing.sameActWeeks'))) return true;
  if (last && (FORMAL_ACTS as readonly string[]).includes(last.kind) && week - last.week < np('needs.spacing.anyActWeeks')) {
    return !NEXT_STEPS[last.kind as FormalAct].includes(act);
  }
  return false;
}

/**
 * X5.2.3 rule 7: the final straw is one of the three largest contributors over the last 4 weeks, drawn by
 * weight. Contributions with the same source are summed first.
 */
export function finalStraw(recent: readonly Contribution[], week: number, draw: Draw): string {
  const from = week - np('needs.act.finalStrawWeeks');
  const sums = new Map<string, number>();
  for (const c of recent) if (c.week > from) sums.set(c.source, (sums.get(c.source) ?? 0) + c.amount);
  const top = [...sums.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, np('needs.act.finalStrawPool'));
  if (top.length === 0) return 'none';
  const total = top.reduce((s, [, v]) => s + v, 0);
  let r = draw() * total;
  for (const [src, v] of top) { r -= v; if (r < 0) return src; }
  return top[top.length - 1]![0];
}

/**
 * One week of outcomes for one team (X5.2.3 rules 1, 2, 6, 7; X5.2.4 rules 1, 2; X5.5.1). People are visited
 * in id order and each draws from the same stream in that order, so the result is deterministic.
 * `windowOpen` true means a legal window is releasing a group (portal opening): the team cap does not apply.
 * `carried` is last week's `deferred`: a deferred person still at the band and with a legal act takes it
 * without a new draw; one whose stress fell below the band is simply not at the band and is dropped.
 */
export function weekOutcomes(candidates: readonly ActCandidate[], draw: Draw, windowOpen = false, carried: readonly number[] = []): WeekOutcomes {
  const carriedSet = new Set(carried);
  const drawn: { c: ActCandidate; act: FormalAct; needId: NeedId; straw: string }[] = [];
  const meetings: Outcome[] = [];
  for (const c of [...candidates].sort((a, b) => a.personId - b.personId)) {
    if (c.isUser) continue; // the user's coach has no stress number (GF-1)
    const needId = largestUnmetNeed(c.needLevels, c.weights);
    if (!needId) continue;
    const warns = c.candor >= np('needs.act.candorWarnMin');
    if (c.band === 'unhappy' || (c.band === 'at_breaking_point' && warns && !c.warned)) {
      // An unhappy person asks for a meeting first if candor is mild or higher (rule 2).
      if (warns && !c.warned) meetings.push({ personId: c.personId, kind: 'meeting_requested', needId });
      continue;
    }
    if (c.band !== 'at_breaking_point') continue;
    if (c.memo.bandWeeks < np('needs.act.dwellWeeks')) continue; // rule 7 dwell
    const allowed = NEED_ACTS[needId] ?? [];
    const act = allowed.find((a) => c.legalActs.includes(a)
      && (!c.isProtected || PROTECTED_ALLOWED_ACTS.includes(a))
      && !spacingBlocks(a, c.memo.week, c.lastAct, c.actHistory));
    // Draw for everyone at the band so one person's legality never shifts another's draw.
    const roll = draw();
    const strawRoll = draw();
    if (!act || (roll >= actChance(c.loyalty) && !carriedSet.has(c.personId))) continue; // no legal act: he stays and acts at the next legal point
    drawn.push({ c, act, needId, straw: finalStraw(c.memo.recent, c.memo.week, () => strawRoll) });
  }
  const order = [...drawn].sort((a, b) => b.c.stress - a.c.stress || a.c.personId - b.c.personId);
  const cap = windowOpen ? order.length : np('needs.act.teamCapPerWeek');
  const acts: Outcome[] = order.slice(0, cap).map((d) => ({
    personId: d.c.personId, kind: d.act, needId: d.needId, finalStraw: d.straw, release: np('needs.release.points'),
  }));
  return { outcomes: [...meetings, ...acts], deferred: order.slice(cap).map((d) => d.c.personId) };
}

/** X5.2.4 rule 1: a formal act lowers stress at once by the release points. */
export function applyRelease(stress: number): number {
  return Math.max(0, stress - np('needs.release.points'));
}
