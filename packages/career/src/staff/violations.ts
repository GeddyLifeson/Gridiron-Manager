// Rule-breaking acts the staff system can produce. Nothing here blocks: the act happens and the caller
// passes the returned Act to the one L8.2.5 pipeline (league.compliance.commitAct), the same code for the
// user and for AI clubs (Marlon, 2026-11-25 22:23 UTC). `tampering_coaches` is in the G-28 class table;
// the other three classes are requested from the compliance owner and the integrator (README, CR-G47-3).
// Until they land commitAct answers `unknown_class` and logs nothing; no staff code depends on the row.
import type { WorldDate, WorldTier } from '@gm/schema';
import type { compliance } from '@gm/league';

type Act = compliance.Act;
type PartyRef = compliance.PartyRef;

export const STAFF_CLASSES = {
  tampering: 'tampering_coaches',
  /** Refusing an interview the league says may not be refused (L4.2.1 (1), L4.4.1). */
  interviewBlock: 'interview_block',
  /** Closing a search without the required diverse interviews, or a sham one (L4.2.1 (4), E2.3.1). */
  diverseInterview: 'diverse_interview',
  /** More off-campus recruiters than the cap, or recruiting off campus without a slot (L4.5.1, T9.5). */
  staffLimits: 'staff_limits',
} as const;

export interface ActContext {
  readonly actor: PartyRef;
  readonly orderedBy?: PartyRef | null;
  readonly knew?: readonly number[];
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

function act(classId: string, c: ActContext, gain: number): Act {
  return { classId, actor: c.actor, orderedBy: c.orderedBy ?? null, knew: c.knew ?? [], date: c.date, competitionId: c.competitionId, gain, tier: c.tier, source: c.source };
}

/** Contacting another club's coach without permission (C11.6.2). Gain: how much he wanted that candidate, 0 to 1. */
export const tamperingAct = (c: ActContext, gain: number): Act => act(STAFF_CLASSES.tampering, c, gain);
/** Refusing a protected interview request: gain is keeping the assistant, 0 to 1. */
export const interviewBlockAct = (c: ActContext, gain: number): Act => act(STAFF_CLASSES.interviewBlock, c, gain);
/** A search closed without the required interviews. */
export const diverseInterviewAct = (c: ActContext, gain: number): Act => act(STAFF_CLASSES.diverseInterview, c, gain);
/** A staff limit exceeded (one row per breach). */
export const staffLimitsAct = (c: ActContext, gain: number): Act => act(STAFF_CLASSES.staffLimits, c, gain);
