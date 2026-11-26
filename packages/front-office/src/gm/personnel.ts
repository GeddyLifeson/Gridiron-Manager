// The one file that knows both sides of the G-57 hookup: it turns the output of `league.personnel` (needs
// board M1.4.1, needs memo M1.5.1, ready list M3.2.1, wire review M3.4.1, practice squad targets M3.5.1,
// cutdown board M6.4.1, claim risk M6.4.4) into the plain inputs the K7 decisions take, and turns a K7
// cutdown back into a board the roster engine can check and file. It copies no personnel logic.
//
// The shapes below are structural: they name only the fields read here, and the real `league.personnel`
// values are assignable to them (`test/gm/hookup.test.ts` passes real ones through). When the integrator
// adds the `personnel` barrel line to `@gm/league`, these can become `import type` aliases.
import type { GmProfile } from './profile.ts';
import { blendOwn, type CoachAsk, type Need, type OwnNeed, type TimeFrame } from './needs.ts';
import { P } from './params.ts';
import { claimDecision, fillGap, hideFromWaivers, practiceSquad, type Claim, type Cutdown, type CutdownInput } from './roster.ts';
import { costWins, playerWorth } from './value.ts';
import { clamp, type Belief, type PersonId, type PlayerView, type ValueContext } from './types.ts';

/** A job in the installed system to the position the contribution table and `positionValues` are keyed by. */
export type PositionOf = (job: string) => string;

// ---------- K7.2.1 needs from the M1.4.1 board ----------

/** `personnel.NeedRow`, the fields read. Gaps are in ISS against the target fit. */
export interface BoardNeedRow {
  readonly job: string;
  readonly starterGap: number;
  readonly depthGap: number;
  readonly shortfall: number;
  readonly futureFlags: readonly unknown[];
}

/**
 * K7.2.1 rule 1 from the needs board: the row's gaps (not its score, which carries the head coach's tier
 * weights) weighted by the general manager's own `positionValues`. A position's need is its neediest job.
 * A future flag (a starter whose contract or eligibility ends, M1.4.3) raises the later need.
 */
export function needsFromBoard(gm: GmProfile, rows: readonly BoardNeedRow[], positionOf: PositionOf): OwnNeed[] {
  const by = new Map<string, { now: number; later: number }>();
  for (const r of rows) {
    const position = positionOf(r.job);
    const pv = gm.philosophy.positionValues[position] ?? 1;
    const raw = (r.starterGap + P('needs.depthGapWeight') * r.depthGap + P('needs.shortfallIss') * r.shortfall) / P('needs.issScale');
    const now = clamp(raw * pv, 0, 1);
    const later = clamp((raw * (1 + P('needs.expiryTerm')) + (r.futureFlags.length > 0 ? P('needs.futureFlagNeed') : 0)) * pv, 0, 1);
    const old = by.get(position);
    by.set(position, { now: Math.max(old?.now ?? 0, now), later: Math.max(old?.later ?? 0, later) });
  }
  return [...by.keys()].sort().map((position) => {
    const { now, later } = by.get(position)!;
    const frame: TimeFrame = now >= P('needs.nowThreshold') ? 'now' : later > now ? 'this_offseason' : 'next_year';
    return { position, need: Math.max(now, later), frame };
  });
}

/** The head coach's M1.5.1 memo (jobs, most wanted first) as K7.2.1 asks: one ask per position at its best rank. */
export function asksFromMemo(memoJobs: readonly string[], positionOf: PositionOf): CoachAsk[] {
  const seen = new Set<string>();
  const out: CoachAsk[] = [];
  for (const job of memoJobs) {
    const position = positionOf(job);
    if (seen.has(position)) continue;
    seen.add(position);
    out.push({ position, rank: out.length + 1 });
  }
  return out;
}

/** K7.2.1 rules 1 to 3 on the real needs board: his own reading of the gaps, blended with the coach's memo. */
export function blendBoardNeeds(gm: GmProfile, rows: readonly BoardNeedRow[], memoJobs: readonly string[], positionOf: PositionOf, w: number = gm.coachVoiceWeight): Need[] {
  return blendOwn(needsFromBoard(gm, rows, positionOf), asksFromMemo(memoJobs, positionOf), w);
}

// ---------- K7.3.1 rule 1: the ready list ----------

/** `personnel.ReadyCandidate`, the fields read. The grade is the club's own fit grade at the job. */
export interface ReadyName { readonly personId: PersonId; readonly job: string; readonly grade: Belief; readonly age: number }
/** `personnel.ReadyColumn`, the fields read. */
export interface ReadyColumnLike { readonly job: string; readonly names: readonly ReadyName[] }

/**
 * The ready list as player views. `costOf` is the contract a signing would carry (the minimum salary by
 * credited seasons, read by key by the caller, plus `signingCost` guaranteed weeks for a poached player).
 */
export function readyViews(columns: readonly ReadyColumnLike[], positionOf: PositionOf, costOf: (personId: PersonId) => readonly number[]): PlayerView[] {
  const seen = new Set<PersonId>();
  const out: PlayerView[] = [];
  for (const col of columns) for (const n of col.names) {
    if (seen.has(n.personId)) continue;
    seen.add(n.personId);
    out.push({ personId: n.personId, position: positionOf(n.job), age: n.age, grade: n.grade, projected: null, fit: 1, flags: 0, costCentsByYear: costOf(n.personId) });
  }
  return out;
}

/** K7.3.1 rule 1 and K7.4.5 rule 2 on the real ready list. */
export function fillGapFromReady(gm: GmProfile, position: string, columns: readonly ReadyColumnLike[], positionOf: PositionOf, costOf: (personId: PersonId) => readonly number[], roomCents: number, ctx: ValueContext): PlayerView | null {
  return fillGap(gm, position, readyViews(columns, positionOf, costOf), roomCents, ctx);
}

// ---------- K7.3.1 rule 3: the waiver wire ----------

/** `personnel.WireItemView`, the fields read. */
export interface WireFacts { readonly capCheck: { readonly ok: boolean }; readonly injured: boolean }

export type WireClaim = Claim & { readonly blockedBy: 'cap' | null };

/**
 * One decision rule for claims: `claimDecision` decides, the personnel review reports to the user. A claim
 * the C6 cap check rejects is never filed (the roster engine would refuse it; this saves the attempt). An
 * injured player's view must already carry the injury in its grade and cost, as the club estimates it.
 */
export function claimFromWire(gm: GmProfile, roster: readonly PlayerView[], waived: PlayerView, facts: WireFacts, rosterFull: boolean, ctx: ValueContext): WireClaim {
  if (!facts.capCheck.ok) return { claim: false, dropId: null, gain: 0, blockedBy: 'cap' };
  return { ...claimDecision(gm, roster, waived, rosterFull, ctx), blockedBy: null };
}

// ---------- K7.3.1 rule 4: practice squad targets ----------

/** K7.3.1 rule 4 over the M3.5.1 target list (`practiceSquadTargets`): the ones he asks, best surplus first. */
export function squadTargets(gm: GmProfile, targets: readonly { readonly personId: PersonId }[], views: readonly PlayerView[], size: number, ctx: ValueContext): PersonId[] {
  const allowed = new Set(targets.map((t) => t.personId));
  return practiceSquad(gm, views.filter((v) => allowed.has(v.personId)), size, ctx);
}

// ---------- K7.4.5 rules 3 and 4: the cutdown board ----------

/** `personnel.Column`. */
export type BoardColumn = 'locks' | 'likely' | 'bubble' | 'practice_squad' | 'release';
/** `personnel.Board`: person id to column. */
export type CutBoard = Record<string, BoardColumn>;

const COLUMN_ORDER: readonly BoardColumn[] = ['locks', 'likely', 'bubble', 'practice_squad', 'release'];

/**
 * M6.4.1 "K7 marks it": a contract whose release costs too much cap. True when the dead money is at least
 * a set share of what he costs if kept, and cutting him would save less than he is worth to this general manager.
 */
export function highGuarantee(gm: GmProfile, v: PlayerView, deadCentsByYear: readonly number[], ctx: ValueContext): boolean {
  const dead = costWins(gm, deadCentsByYear, ctx);
  const worth = playerWorth(gm, v, ctx);
  return dead > 0 && dead >= P('roster.highGuaranteeShare') * worth.cost && worth.value > worth.cost - dead;
}

/** The head coach's board (his columns, then his grades) as the ranking `cutdown` blends at `coachVoiceWeight`. */
export function coachRankFromBoard(board: Readonly<CutBoard>, coachGrade: ReadonlyMap<PersonId, number>): Map<PersonId, number> {
  const ids = Object.keys(board).map(Number).sort((a, b) =>
    COLUMN_ORDER.indexOf(board[String(a)]!) - COLUMN_ORDER.indexOf(board[String(b)]!) || (coachGrade.get(b) ?? 0) - (coachGrade.get(a) ?? 0) || a - b);
  return new Map(ids.map((id, i) => [id, i + 1]));
}

/** `CutdownInput` with the coach's ranking read from his board. */
export function cutdownInputFrom(base: Omit<CutdownInput, 'coachRank'>, coachBoard: Readonly<CutBoard>, coachGrade: ReadonlyMap<PersonId, number>): CutdownInput {
  return { ...base, coachRank: coachRankFromBoard(coachBoard, coachGrade) };
}

export interface BoardMarks {
  readonly starters: ReadonlySet<PersonId>;
  readonly highGuarantee: ReadonlySet<PersonId>;
  /** Cut players he wants back on the practice squad (K7.3.1 rule 4), eligibility already checked by C5.3.1. */
  readonly practiceSquad: ReadonlySet<PersonId>;
}

/**
 * The general manager's cutdown as an M6.4.1 board, ready for `personnel.checkBoard` and
 * `personnel.cutdownTransaction` (which files it through the roster engine). The last few kept players are
 * the bubble.
 */
export function cutdownBoard(result: Cutdown, marks: BoardMarks): CutBoard {
  const board: CutBoard = {};
  const bubbleFrom = result.keep.length - P('roster.bubbleSize');
  result.keep.forEach((id, i) => {
    board[String(id)] = marks.starters.has(id) || marks.highGuarantee.has(id) ? 'locks' : i >= bubbleFrom ? 'bubble' : 'likely';
  });
  for (const id of result.cut) board[String(id)] = marks.practiceSquad.has(id) ? 'practice_squad' : 'release';
  return board;
}

/**
 * K7.4.5 rule 4 with the M6.4.4 claim risk (`personnel.claimRisk(...).score`) as the public risk: the cut
 * players he wants on the practice squad whom he keeps on the roster instead, because he thinks they would
 * be claimed.
 */
export function hideList(gm: GmProfile, wanted: readonly PlayerView[], claimRiskScore: (personId: PersonId) => number, ctx: ValueContext): PersonId[] {
  return wanted.filter((v) => hideFromWaivers(gm, v, claimRiskScore(v.personId), ctx).hide).map((v) => v.personId).sort((a, b) => a - b);
}
