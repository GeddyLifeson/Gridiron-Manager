// L5.3.3 standing upstairs. No pool of points: a one-line read in words of what the records already say,
// reproducible from the record and never stored. Its sharpness depends on familiarity (L1.1.3).
import type { BossRecord } from './events.ts';
import { param } from './params.ts';

export interface RecentDealings {
  /** Asks of his the boss granted that have not shown a return yet. */
  readonly unreturnedGrants: number;
  /** The boss's answers to the coach's last asks, newest first. */
  readonly lastAnswers: readonly ('yes' | 'no' | 'later')[];
  /** Times the coach refused this boss lately. */
  readonly coachRefusals: number;
  readonly resultsVsExpectation: number;
}

export const STANDING_LINES = [
  'Hard to read him yet.',
  'He has said no to the last two.',
  'He is likely to back you on this.',
  'This will cost you with him.',
  'He might go either way.',
] as const;
export type StandingLine = (typeof STANDING_LINES)[number];

/** The read shown before any ask or refusal upstairs. Pure: same record, same line. */
export function readStanding(rec: BossRecord, recent: RecentDealings): StandingLine {
  if (rec.familiarity < param('standing.vagueBelowFamiliarity')) return 'Hard to read him yet.';
  if (recent.lastAnswers.length >= 2 && recent.lastAnswers[0] === 'no' && recent.lastAnswers[1] === 'no') return 'He has said no to the last two.';
  const lean = param('standing.wTrust') * (rec.trust - 50) / 50 + param('standing.wRespect') * (rec.respect - 50) / 50
    + param('standing.wResults') * recent.resultsVsExpectation - param('standing.wUnreturned') * recent.unreturnedGrants - param('standing.wRefusals') * recent.coachRefusals;
  const t = param('standing.threshold');
  if (lean >= t) return 'He is likely to back you on this.';
  if (lean <= -t) return 'This will cost you with him.';
  return 'He might go either way.';
}
