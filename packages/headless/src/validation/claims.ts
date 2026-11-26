// Q5.5.1 What may be claimed: evidence level 0 to 3 and its allowed wording. The exported coaching
// record (N4, P5.7.2) and the store page carry the wording this returns. Marlon decides final wording.

export type EvidenceLevel = 0 | 1 | 2 | 3;

export const WORDING: Readonly<Record<EvidenceLevel, string>> = {
  0: 'Designed to model real coaching decisions.',
  1: 'Reviewed by coaches. Its film can be read like real film.',
  2: 'People with coaching experience score higher.',
  3: 'Players improved on an independent football knowledge test.',
};
/** Level 0 names the record "an in-game assessment" (Q5.5.1 table). */
export const RECORD_NAME_LEVEL0 = 'an in-game assessment';

export interface EvidenceInputs {
  /** Every written F and G4 file has a completed coach review round (Q5.1.1). */
  readonly footballReviewComplete: boolean;
  /** Blind film test passed at every level, with coach reviewers (Q5.2.1). */
  readonly blindFilmPassed: boolean;
  /** Skill separation showed coaches above fans above newcomers (Q5.3.1). */
  readonly orderingShown: boolean;
  /** Learning test showed a gain over control (Q5.4.1). */
  readonly learningGainShown: boolean;
  /** Level already earned by an earlier release: a failed study lowers nothing (edge case). */
  readonly earned: EvidenceLevel;
}

export function evidenceLevel(e: EvidenceInputs): EvidenceLevel {
  let lvl: EvidenceLevel = 0;
  if (e.footballReviewComplete && e.blindFilmPassed) {
    lvl = 1;
    if (e.orderingShown) {
      lvl = 2;
      if (e.learningGainShown) lvl = 3;
    }
  }
  return (lvl > e.earned ? lvl : e.earned) as EvidenceLevel;
}

/** Wording no level allows (Q5.5.1): no promise of a job, no credential, no real league or body named. */
const FORBIDDEN: readonly RegExp[] = [/\bhired\b/i, /\bget you (a )?job\b/i, /\bcertified coach\b/i, /\bcredential\b/i, /\bcertificat(e|ion)\b/i, /\bNFL\b/, /\bNCAA\b/];

/** Problems with a claim text at a level: wording above the level, or wording no level allows. */
export function checkClaim(text: string, level: EvidenceLevel): string[] {
  const out: string[] = [];
  for (const re of FORBIDDEN) if (re.test(text)) out.push(`"${text}" uses wording no level allows (${re.source})`);
  for (const l of [1, 2, 3] as const) if (l > level && text.includes(WORDING[l])) out.push(`"${WORDING[l]}" needs evidence level ${l}; current level is ${level}`);
  return out;
}
