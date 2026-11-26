// Commands of the roster moves screens (G-70). Every move passes the H6.1.2 decider check first: a move
// the coach holds is filed with the roster engine (C5.7.1, the same engine AI clubs use); a move he does
// not hold becomes a RosterRequest for whoever holds it (K7 answers; not built here). The game-day list
// is edited freely until it locks 90 minutes (rule key) before kickoff and never after (H6.2.3).
import { roster } from '@gm/league';
import { gapLabels, coverageRows, unitRows, type DepthUnit } from '../../read-models/roster-moves/coverage.ts';
import { decider, minutesToKickoff, type PowerInput } from '../../read-models/roster-moves/model.ts';
import { OUT_DESIGNATIONS, param } from '../../read-models/roster-moves/params.ts';

export interface MoveContext {
  readonly clubId: number;
  readonly state: roster.LeagueRosters;
  readonly rules: roster.RosterRules;
  readonly power: PowerInput;
  readonly week: roster.WeekInput | null;
}

export interface CommandRefusal { readonly ok: false; readonly rule: string; readonly message: string; readonly fix: string }
const refuse = (rule: string, message: string, fix: string): CommandRefusal => ({ ok: false, rule, message, fix });

/** H6.1.2 outputs: `move`, `asked_by`, `answer`, `reason`, `pressed`. */
export interface RosterRequest {
  readonly move: roster.Transaction;
  readonly decider: roster.Decider;
  readonly askedBy: number;
  readonly answer: 'pending' | 'approved' | 'refused';
  readonly reason: string | null;
  readonly pressed: boolean;
}

export type MoveOutcome =
  | { readonly ok: true; readonly kind: 'filed'; readonly result: roster.Accepted }
  | { readonly ok: true; readonly kind: 'request'; readonly request: RosterRequest }
  | CommandRefusal;

/** The list is locked from the rule key's minutes before kickoff (H6.2.3 rule 1). */
export function listLocked(ctx: MoveContext): boolean {
  return ctx.week !== null && roster.gameDayListLocked(minutesToKickoff(ctx.state, ctx.week), ctx.rules);
}

/**
 * Files a club move. The league office refusal comes back unchanged (rule leaf, message, fix), so the
 * screen can say what would fix it. No transaction is filed without the decider check (H6.1.2 acceptance 1).
 */
export function fileMove(ctx: MoveContext, tx: roster.Transaction, askedBy: number): MoveOutcome {
  if (tx.clubId !== ctx.clubId) return refuse('C5.7.1', 'the move is for another club', 'file moves for your own club');
  const d = decider(ctx.power, tx.type);
  if (d !== 'coach') return { ok: true, kind: 'request', request: { move: tx, decider: d, askedBy, answer: 'pending', reason: null, pressed: false } };
  const r = roster.applyTransaction(ctx.state, tx, ctx.rules);
  if (!r.ok) return refuse(r.rule, r.message, r.fix);
  return { ok: true, kind: 'filed', result: r };
}

/** H6.1.2 rule 3: the case may be pressed once per request, and only while it is open or refused. */
export function pressCase(req: RosterRequest): RosterRequest | CommandRefusal {
  if (req.pressed) return refuse('H6.1.2', 'the case was already pressed for this request', 'make a new request later');
  if (req.answer === 'approved') return refuse('H6.1.2', 'the request was approved', 'none needed');
  return { ...req, pressed: true, answer: 'pending' };
}

/** Moves a player to the active or inactive column of the working list. */
export function setActive(ctx: MoveContext, list: roster.GameDayList, personId: number, active: boolean): roster.GameDayList | CommandRefusal {
  if (listLocked(ctx)) return refuse('H6.2.3', 'the active list is locked', 'no change is possible after the lock');
  if (!roster.gameDayCandidates(ctx.state, ctx.clubId).includes(personId)) return refuse('C5.2.1', `player ${personId} is not on the roster or elevated for this game`, 'elevate or sign him first');
  const actives = list.actives.filter((id) => id !== personId);
  if (active) actives.push(personId);
  return { ...list, actives, emergencyQb: list.emergencyQb === personId && active ? null : list.emergencyQb };
}

/** Names the emergency third quarterback (H6.2.1 rule 5, C5.2.2), or clears him with null. */
export function setEmergencyQb(ctx: MoveContext, list: roster.GameDayList, personId: number | null): roster.GameDayList | CommandRefusal {
  if (listLocked(ctx)) return refuse('H6.2.3', 'the active list is locked', 'no change is possible after the lock');
  if (personId !== null && !ctx.state.players[String(personId)]?.quarterback) return refuse('C5.2.2', 'the emergency quarterback must be a bona fide quarterback', 'pick a quarterback');
  return { ...list, actives: list.actives.filter((id) => id !== personId), emergencyQb: personId };
}

/** H6.2.3: up to the starting number of "decide at warm-up" tags. */
export function tagForWarmup(tags: readonly number[], personId: number): number[] | CommandRefusal {
  if (tags.includes(personId)) return [...tags];
  const max = param('roster_moves.warmup_tags_max');
  if (tags.length >= max) return refuse('H6.2.3', `at most ${max} players may be decided at warm-up`, 'decide one of the tagged players now');
  return [...tags, personId];
}

export interface LockedList {
  readonly ok: true;
  readonly list: roster.GameDayList;
  readonly inactives: readonly number[];
  /** Players dressed against the club's injury report: allowed, warned and logged for L8.2.1 (H6.2.1 edge case). */
  readonly breakable: readonly roster.BreakableAct[];
}

export interface FinalInput {
  readonly depth: readonly DepthUnit[];
  readonly sideSize: number;
  readonly designations: Readonly<Record<string, string | null>>;
  /** Red gaps the coach confirmed by name (H6.2.1 acceptance 2). */
  readonly confirmedGaps: readonly string[];
}

/**
 * Submits the final list. Refuses a list that breaks the league limit (H6.2.1 acceptance 1), a list
 * with a red gap the coach has not confirmed by name (acceptance 2), and any change after the lock.
 * In a job where the list is not the coach's (a contract clause), it becomes a request.
 */
export function submitList(ctx: MoveContext, list: roster.GameDayList, final: FinalInput): LockedList | CommandRefusal {
  if (listLocked(ctx)) return refuse('H6.2.3', 'the active list is locked', 'no change is possible after the lock');
  if (decider(ctx.power, 'game_day_list') !== 'coach') return refuse('H6.1.2', 'the game-day list is not yours to set in this job', 'recommend it to the decider');
  const v = roster.validateGameDayList(ctx.state, list, ctx.rules);
  if (!v.ok) return refuse(v.rule, v.message, v.fix);
  const actives = new Set(list.actives);
  const red = gapLabels(coverageRows(final.depth, actives), unitRows(final.depth, actives, final.sideSize), 'red');
  const missing = red.filter((g) => !final.confirmedGaps.includes(g));
  if (missing.length) return refuse('H6.2.1', `uncovered: ${missing.join(', ')}`, 'cover the gap or confirm it by name');
  const breakable: roster.BreakableAct[] = list.actives
    .filter((id) => { const d = final.designations[String(id)]; return !!d && OUT_DESIGNATIONS.includes(d); })
    .map((personId) => ({ rule: 'L8.2.1', act: 'dressed_against_injury_report', clubId: ctx.clubId, personId }));
  return { ok: true, list, inactives: v.inactives, breakable };
}
