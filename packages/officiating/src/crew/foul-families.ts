// Which detection family a foul belongs to and whether it is an objective foul (B11.3.1 rules 1 and 2,
// B11.4.1 rule 1). The foul catalogue of the contract has no field for either, and foul ids are named
// by the rule set (WP-01), so the class is read off the foul record itself. The small table by id
// holds only ids the bible already names in rule keys (B13.1.1) where the record alone would
// mislead. A request to carry both as catalogue fields is in the WP-05 report.
import type { FoulId, FoulRecord, Side } from '@gm/schema';
import type { DetectionFamily } from './params.ts';

export interface DetectionClass {
  readonly family: DetectionFamily;
  /** Detected by geometry and counting (B11.3.1 rule 1), as opposed to judgment (rule 2). */
  readonly objective: boolean;
}

export const FOUL_DETECTION_BY_ID: Readonly<Record<FoulId, DetectionClass>> = {
  dpi: { family: 'defensive_coverage', objective: false },
  def_holding: { family: 'defensive_coverage', objective: false },
  illegal_contact: { family: 'defensive_coverage', objective: false },
  opi: { family: 'other', objective: false },
  ineligible_downfield_pass: { family: 'other', objective: false },
  intentional_grounding: { family: 'other', objective: false },
  targeting: { family: 'roughing_and_safety', objective: false },
  block_below_waist: { family: 'roughing_and_safety', objective: false },
};

/**
 * The class of a candidate foul. Order of the tests: the table by id; a foul at or before the snap
 * is a counting or alignment foul (false start, offside, formation, motion, too many players, delay);
 * then conduct and personal fouls by their catalogue class; then the phase of the play.
 */
export function detectionClass(foul: Pick<FoulRecord, 'foulId' | 'timing' | 'phase' | 'foulClass' | 'side' | 't'>, snappingSide: Side): DetectionClass {
  const byId = FOUL_DETECTION_BY_ID[foul.foulId];
  if (byId) return byId;
  if (foul.timing === 'before_snap' || (foul.timing === 'live' && foul.t <= 0)) return { family: 'pre_snap', objective: true };
  if (foul.foulClass === 'unsportsmanlike') return { family: 'conduct', objective: false };
  if (foul.foulClass === 'personal') return { family: 'roughing_and_safety', objective: false };
  if (foul.phase === 'free_kick' || foul.phase === 'scrimmage_kick') return { family: 'special_teams_blocks', objective: false };
  const byOffense = foul.side === snappingSide;
  if (foul.phase === 'pass_play') return { family: byOffense ? 'offensive_holding' : 'defensive_coverage', objective: false };
  if (foul.phase === 'running_play' && byOffense) return { family: 'offensive_holding', objective: false };
  return { family: 'other', objective: false };
}
