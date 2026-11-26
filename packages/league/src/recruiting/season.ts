// The weekly recruiting step the world loop calls (T4 runs all year). Order is fixed so a week reaches the
// same state however it is entered: AI programs act in team-id order, then prospects decide, then
// impressions and relationships decay, then open negative-recruiting claims are checked.
import type { RecruitingContext } from './context.ts';
import { aiAcceptsCommitment, aiProgramWeek, type AiPeople } from './ai.ts';
import type { ComplianceHook } from './actions.ts';
import { prospectWeek, type CommitDecider, type WeekSummary } from './commitment.ts';
import { decayWeek } from './interest.ts';
import { settleClaims } from './offers.ts';
import type { ProgramInfo, RecruitingState } from './types.ts';

export interface WeekInput {
  readonly classYear: number;
  readonly day: number;
  /** Programs run by AI this week, any order (sorted here). */
  readonly aiPrograms: readonly ProgramInfo[];
  readonly people: AiPeople;
  /** The user's answer for his own program on a commitment to a non-committable offer. */
  readonly userDecide?: CommitDecider;
  readonly userTeamIds?: readonly number[];
  /** The world's answer: has a claim that was false when made come true (T4.4.3)? */
  readonly claimBecameTrue?: (claimId: number) => boolean;
}

export function recruitingWeek(state: RecruitingState, ctx: RecruitingContext, hook: ComplianceHook, w: WeekInput): WeekSummary {
  const programs = [...w.aiPrograms].sort((a, b) => a.teamId - b.teamId);
  for (const prog of programs) aiProgramWeek(state, ctx, hook, prog, w.people, w.classYear, w.day);
  const users = new Set(w.userTeamIds ?? []);
  const decide: CommitDecider = (teamId, prospectId, day) =>
    users.has(teamId) && w.userDecide ? w.userDecide(teamId, prospectId, day) : aiAcceptsCommitment(state, ctx, teamId, prospectId);
  const summary = prospectWeek(state, ctx, w.classYear, w.day, decide);
  decayWeek(state);
  settleClaims(state, ctx, w.day, w.claimBecameTrue ?? (() => false));
  return summary;
}
