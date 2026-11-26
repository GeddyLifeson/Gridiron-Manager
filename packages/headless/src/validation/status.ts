// Deferral state of the Q5 studies (Marlon, 2026-11-25 22:23 UTC: no coach reviewer for now). Every
// report in this folder prints it, so no output can be read as a coach-backed result while it holds.
// Marlon restarts the search by saying so (Q5.6.1 rule 3); flipping `coachReviewersAvailable` is that
// restart's code side and is the only switch.

export type StudyId = 'football_review' | 'blind_film' | 'skill_separation' | 'learning_test';

export interface StudyStatus {
  readonly study: StudyId;
  readonly leaf: string;
  /** 'deferred': the whole study needs a coach. 'partly_deferred': part runs without one. */
  readonly state: 'deferred' | 'partly_deferred' | 'active';
  /** What runs while the coach part waits (Q5 file header, Q5.6.1 rule 2). */
  readonly standIn: string;
  /** Line the release notes must carry while the coach part has not run. */
  readonly releaseNote: string;
}

export const DEFERRAL_RULING = 'Marlon, 2026-11-25 22:23 UTC: no coach reviewer for now (Q5 header, Q5.6.1).';

export function studyStatuses(coachReviewersAvailable: boolean): readonly StudyStatus[] {
  const on = coachReviewersAvailable;
  return [
    {
      study: 'football_review', leaf: 'Q5.1.1', state: on ? 'active' : 'deferred',
      standIn: 'published clinic, book and playbook checks into the fact register; project-staff film comparisons filed as "project staff, not a coach" (Q5.6.1 rule 2a, 2b)',
      releaseNote: on ? '' : 'Every F and G4 file: not reviewed.',
    },
    {
      study: 'blind_film', leaf: 'Q5.2.1', state: on ? 'active' : 'deferred',
      standIn: 'none proves the same thing; the play explainer check (Q2.6.1) still runs',
      releaseNote: on ? '' : 'Blind film test not run.',
    },
    {
      study: 'skill_separation', leaf: 'Q5.3.1', state: on ? 'active' : 'partly_deferred',
      standIn: 'knowledgeable fans against newcomers; supports no claim above evidence level 0',
      releaseNote: on ? '' : 'Skill separation: coach group not run.',
    },
    {
      study: 'learning_test', leaf: 'Q5.4.1', state: on ? 'active' : 'partly_deferred',
      standIn: 'every question traces to a rule-book section or a fact-register row; results say "test not reviewed by a coach"',
      releaseNote: on ? '' : 'Learning test: test not reviewed by a coach.',
    },
  ];
}
