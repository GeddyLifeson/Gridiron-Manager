// Rows and inputs of the rule-breaking pipeline (L8.2.5). Persisted rows (log, cases, league record)
// are plain data; their zod twins with visibility classes are proposed for schema/src/world
// (CR-G28-1, test/compliance/proposed-schemas.ts). Visibility: the log is truth (hidden from everyone
// but the actor, L8.2.5 outputs); cases and the league record are public once opened.
import type { PersonOrigin, RandomStream, RuleSet, WorldDate, WorldEvent, WorldTier } from '@gm/schema';
import type { ActorRole, EnforcingBody, Severity } from './catalogue.ts';
import type { Tier } from './params.ts';

/** A person taking part: who, in which role, for which club or program, and where the person came from. */
export interface PartyRef {
  readonly personId: number;
  readonly role: ActorRole;
  readonly teamId: number;
  readonly origin: PersonOrigin;
}

/** One rule-breaking act as the owning leaf hands it over. Same shape for the user and for AI (K2.8.2 rule 6). */
export interface Act {
  readonly classId: string;
  readonly actor: PartyRef;
  /** A boss who ordered the act; both are in the log (L8.2.5 edge case). */
  readonly orderedBy: PartyRef | null;
  /** Person ids who knew (holder list, L6.3.1). The actor and orderer may appear; they never count as leakers. */
  readonly knew: readonly number[];
  readonly date: WorldDate;
  readonly competitionId: number | null;
  /** The real gain on the owning leaf's 0 to 1 desirability scale (K2.8.2 inputs). The leaf applies the effect itself. */
  readonly gain: number;
  /** Major or minor (T9.5.1 rule 2). Defaults to the class's severity. */
  readonly severity?: Severity;
  /** A written record (a medical objection, L8.2.2) makes detection certain. */
  readonly certainTrace?: boolean;
  readonly tier: WorldTier;
  readonly source: 'sim' | 'history_run' | 'user';
}

/** `violation_log{rule, actor, ordered_by, knew[], date, gain}` (L8.2.5 outputs), plus pipeline bookkeeping. */
export interface ViolationLogRow {
  readonly id: number;
  readonly classId: string;
  readonly actor: PartyRef;
  readonly orderedBy: PartyRef | null;
  readonly knew: readonly number[];
  readonly date: WorldDate;
  readonly competitionId: number | null;
  readonly gain: number;
  readonly severity: Severity;
  readonly certainTrace: boolean;
  /** True once the once-per-act inspection (per 'act', union visit) has been drawn. */
  readonly actSourcesDrawn: boolean;
  readonly caseId: number | null;
  /** Id of the hidden `violation_committed` event. */
  readonly eventId: number;
}

export type CaseResponse = 'cooperate' | 'self_report' | 'fight';

export interface CaseRow {
  readonly id: number;
  readonly teamId: number;
  readonly body: EnforcingBody;
  readonly rowIds: readonly number[];
  readonly opened: WorldDate;
  readonly resolveBy: WorldDate;
  readonly response: CaseResponse;
  /** Raised with no act behind it (L8.2.5 false accusations): ends with no finding. */
  readonly falseAccusation: boolean;
  readonly status: 'open' | 'closed';
  readonly outcome: 'finding' | 'no_finding' | null;
}

export type PartyKey = { readonly kind: 'person' | 'team'; readonly id: number };

/** An entry in a party's `league_record` (L8.2.3). Public. Persists across job changes. */
export interface LeagueRecordEntry {
  readonly caseId: number;
  readonly rowId: number;
  readonly party: PartyKey;
  readonly classId: string;
  readonly severity: Severity;
  readonly date: WorldDate;
  readonly repeat: boolean;
}

/**
 * What the owning systems must apply (L8.2.5 "Penalties are applied through the owning systems"):
 * fines to E6, picks to C7, practice to H3/C4, suspensions and show-cause to E2/E3/E4.
 * `cents`, `games` and `round` are null when no published amount exists: the text then says "league default".
 */
export type PenaltyOrder =
  | { readonly kind: 'warning'; readonly party: PartyKey }
  | { readonly kind: 'fine'; readonly party: PartyKey; readonly cents: number | null; readonly tier: Tier | null; readonly mayBeRepaidByClub: boolean }
  | { readonly kind: 'suspension'; readonly personId: number; readonly games: number | null }
  | { readonly kind: 'pick_forfeit'; readonly teamId: number; readonly round: number | null }
  | { readonly kind: 'practice_cancelled'; readonly teamId: number; readonly what: string }
  | { readonly kind: 'probation'; readonly teamId: number; readonly years: number }
  | { readonly kind: 'show_cause'; readonly personId: number; readonly years: number }
  | { readonly kind: 'rules_education'; readonly teamId: number };

export interface ComplianceState {
  readonly log: readonly ViolationLogRow[];
  readonly cases: readonly CaseRow[];
  readonly record: readonly LeagueRecordEntry[];
  readonly orders: readonly { readonly caseId: number; readonly order: PenaltyOrder }[];
  readonly nextLogId: number;
  readonly nextCaseId: number;
}

export function emptyCompliance(): ComplianceState {
  return { log: [], cases: [], record: [], orders: [], nextLogId: 1, nextCaseId: 1 };
}

/** A world event before the history log gives it an id (G-22 owns append, notability and hashing). */
export type EventDraft = Omit<WorldEvent, 'id' | 'notability'>;
/** The history log's append (G-22). Returns the new event id. */
export interface EventSink { append(draft: EventDraft): number }

/** Keyed stream factory for the `enforcement` and `conduct` scope streams (J13; CR-G28-2). */
export type StreamFor = (scope: readonly (string | number)[]) => RandomStream;

/** Everything the weekly detection draw and the penalty step read besides the state. */
export interface ComplianceContext {
  readonly rules: RuleSet;
  /** Stream `enforcement` (L8.2.5): detection draws, sweeps, commissioner discretion. */
  readonly enforcement: StreamFor;
  /** X7: does this knower hold a grievance against this actor now. */
  grievance(knowerId: number, actorId: number): boolean;
  /** L5.4.5 compliance office strictness, 0 to 100. */
  complianceStrictness(teamId: number): number;
  /** K8.7.1 media leak, a weekly chance per team (0 where no reporter covers it). */
  mediaLeakWeekly(teamId: number): number;
  /** The enforcing body's strictness and resources: multiplies its own inspection only (L8.2.5). 1 is neutral. */
  bodyStrictness(body: EnforcingBody): number;
  /** The head coach of a team on a date, or null (T9.5.1 rule 5). */
  headCoachOf(teamId: number, date: WorldDate): PartyRef | null;
  /** T9.5.1 rule 5 monitoring record of the head coach, 0 to 100. */
  monitoring(teamId: number): number;
  /** How the program answers an inquiry. AI parties use `aiResponse` (candor); the user chooses. */
  respond(c: { readonly teamId: number; readonly rowIds: readonly number[] }): CaseResponse;
}
