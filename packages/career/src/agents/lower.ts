// L7.4.1 agents and families below head coach. A statement by an assistant is a promise in his own name and,
// in the player's eyes, by the staff. The records toward an assistant are his and travel with him.
import { ap } from './params.ts';
import { mem, type MemoryWrite, type PromiseEntry } from './shared.ts';

export interface AssistantStatement {
  readonly assistantId: number;
  readonly headCoachId: number;
  readonly playerId: number;
  readonly statedRole: string;
  readonly byWeek: number | null;
  /** An AI assistant answering because the head coach set "assistants take first calls". */
  readonly aiUnderDelegation: boolean;
}

/** Ledger entries: the assistant's own at full strength; the head coach's share (bound at half). */
export function assistantPromises(s: AssistantStatement): PromiseEntry[] {
  const base = { holderId: s.playerId, about: 'role' as const, statedRole: s.statedRole, byWeek: s.byWeek, keptAtOnce: false, unfunded: false, cause: 'assistant_statement' };
  const hcShare = s.aiUnderDelegation ? ap('lower.aiAssistantBindShare') : ap('lower.headCoachBreakShare');
  return [
    { ...base, promiserId: s.assistantId, strength: ap('lower.assistantBreakShare') },
    { ...base, promiserId: s.headCoachId, strength: hcShare },
  ];
}

/** Speaking past his authority costs standing with the boss only if the boss learns of it (report_up, L4.4.3). */
export function pastAuthorityStanding(bossLearns: boolean): number {
  return bossLearns ? ap('lower.pastAuthorityStanding') : 0;
}

export interface RecruiterLeaves {
  readonly recruiterId: number;
  readonly playerId: number;
  readonly parentIds: readonly number[];
  /** The delta a full break writes (L1.3.1 owns the size). */
  readonly brokenDelta: number;
}

/**
 * A recruiter leaves for another job: the promise breaks at full strength for the parents and at half for
 * the player (he blames the profession). T6 reads `transferTrigger`.
 */
export function recruiterLeaves(r: RecruiterLeaves): { memories: MemoryWrite[]; transferTrigger: boolean } {
  return {
    memories: [
      ...r.parentIds.map((id) => mem(id, r.recruiterId, r.brokenDelta, 'recruiter_left')),
      mem(r.playerId, r.recruiterId, r.brokenDelta, 'recruiter_left', ap('lower.recruiterLeavesPlayerShare')),
    ],
    transferTrigger: true,
  };
}

/** Which seat a call goes to below head coach (L7.4.1): a graduate assistant or QC coach takes none. */
export function takesOutsideCalls(seat: 'position_coach' | 'coordinator' | 'graduate_assistant' | 'quality_control' | 'head_coach'): boolean {
  return seat !== 'graduate_assistant' && seat !== 'quality_control';
}
