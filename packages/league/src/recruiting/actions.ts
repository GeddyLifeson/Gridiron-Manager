// One entry for every recruiting act, by the user or by AI (T4.2.1, L8.2.5, K2.8.2 rule 6).
// `previewAct` lists the rules the act breaks and builds the L8.2.5 warning (go back, or do it anyway);
// nothing is disabled or hidden. `takeAct` gives the act its normal effect, spends the days and
// contacts, and when it breaks a rule writes exactly one compliance log row through G-28 `commitAct`.
import type { RuleSet, WorldTier } from '@gm/schema';
import { toWorldDate } from '../calendar/date.ts';
import { commitAct, groupOf, warningFor, type ComplianceState, type EventSink, type PartyRef, type Warning } from '../compliance/index.ts';
import type { RecruitingContext } from './context.ts';
import { applyContact } from './interest.ts';
import { P } from './params.ts';
import { breachesOf, recordUsage, type ActRef } from './limits.ts';
import type { ActionKind, Breach, RecruitingState } from './types.ts';

/** How a staff member enters the compliance log (role, team, origin). */
export type PartyOf = (staffId: number, teamId: number) => PartyRef;

/** The compliance side of an act: G-28 state and event sink, owned by the world loop. */
export interface ComplianceHook {
  state: ComplianceState;
  readonly sink: EventSink;
  readonly party: PartyOf;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

export interface Preview {
  readonly breaches: readonly Breach[];
  /** The L8.2.5 warning for the first class broken, or null when the act breaks no rule. Both choices always offered. */
  readonly warning: Warning | null;
}

/** First compliance class among the breaches: one act, one log row (T4.2.1 acceptance 1). */
function primaryClass(breaches: readonly Breach[]): string | null {
  return breaches[0]?.classId ?? null;
}

export function warningOf(breaches: readonly Breach[], rules: RuleSet, party: PartyRef): Warning | null {
  const classId = primaryClass(breaches);
  return classId === null ? null : warningFor(classId, groupOf(party.role), rules);
}

export function previewAct(state: RecruitingState, ctx: RecruitingContext, act: ActRef, party: PartyRef): Preview {
  const breaches = breachesOf(state, ctx, act);
  return { breaches, warning: warningOf(breaches, ctx.rulesOn(act.day), party) };
}

/**
 * Log one rule-breaking act (L8.2.5 steps 2 and 3). Returns the log id, or null when no row was written
 * (no breach, or the compliance guard refused: an imported AI person never breaks a rule).
 */
export function logBreaches(
  state: RecruitingState, ctx: RecruitingContext, hook: ComplianceHook, breaches: readonly Breach[],
  who: { staffId: number; teamId: number; prospectId: number | null; day: number; knew: readonly number[]; gain: number },
): number | null {
  const classId = primaryClass(breaches);
  if (classId === null) return null;
  const res = commitAct(hook.state, {
    classId, actor: hook.party(who.staffId, who.teamId), orderedBy: null, knew: who.knew,
    date: toWorldDate(who.day), competitionId: null, gain: who.gain, tier: hook.tier, source: hook.source,
  }, ctx.rulesOn(who.day), hook.sink);
  hook.state = res.state;
  if (!res.ok) return null;
  state.violations.push({ logId: res.row.id, rules: breaches.map((b) => b.rule), teamId: who.teamId, actorId: who.staffId, prospectId: who.prospectId, day: who.day });
  return res.row.id;
}

export interface TakeResult {
  readonly breaches: readonly Breach[];
  readonly logId: number | null;
}

/**
 * A contact, call, message, evaluation or camp (T4.4.1, T4.2.1). The caller has shown the warning and the
 * actor chose to go ahead (the user), or K2.8.2 chose for an AI person. Witnesses who may report it are
 * the prospect, his circle and the high school coach (T4.2.1 detection sources).
 */
export function takeAct(
  state: RecruitingState, ctx: RecruitingContext, hook: ComplianceHook,
  act: ActRef & { readonly withMemberId?: number | undefined },
  opts: { readonly reach?: number; readonly aiJudgementError?: number; readonly gain?: number; /** The act's breaches when the caller has just listed them (nothing may have changed since). */ readonly breaches?: readonly Breach[] } = {},
): TakeResult {
  const breaches = opts.breaches ?? breachesOf(state, ctx, act);
  recordUsage(state, ctx, act);
  applyContact(state, ctx, act, { reach: opts.reach ?? 1, aiJudgementError: opts.aiJudgementError ?? 0 });
  const p = state.prospects[act.prospectId];
  const knew = p ? p.circle.map((m) => m.memberId) : [];
  const logId = logBreaches(state, ctx, hook, breaches, { staffId: act.staffId, teamId: act.teamId, prospectId: act.prospectId, day: act.day, knew, gain: opts.gain ?? 0 });
  return { breaches, logId };
}

/** Hours an action costs the person who takes it (E7 hour budget; T4.3.1 hours per look). */
export function hoursOf(kind: ActionKind | 'first_pass_film' | 'full_film'): number {
  return P(`hours.${kind}`);
}
