// Rule keys and tuning constants of the foul module (plans/engine-build-plan.md section 2).
// Values are owned by WP-01 (rules-data and the fact register). This file only names what is read.
import { FOUL_FIELDS, foulKey, type FoulField, type ParamFile, type RuleKeyDef, type RuleKeyManifest } from '@gm/schema';
import { ENFORCEMENT_PROFILES, FOUL_IDS, type ExtField } from './ids.ts';

const READER = 'officiating.fouls';

type KeyShape = Pick<RuleKeyDef, 'type' | 'unit' | 'options'> & { meaning: string };

const FIELD_SHAPE: Record<FoulField, KeyShape> = {
  exists: { type: 'boolean', meaning: 'the foul exists at this level (J10.1.1)' },
  yards: { type: 'number', unit: 'yd', meaning: 'distance penalty in yards' },
  afd: { type: 'boolean', meaning: 'automatic first down when the defense commits it' },
  lod: { type: 'boolean', meaning: 'loss of down' },
  spot_foul: { type: 'boolean', meaning: 'enforced from the spot of the foul' },
  dead_ball: { type: 'boolean', meaning: 'always a dead-ball foul, whenever it occurs' },
  runoff_eligible: { type: 'boolean', meaning: 'can bring the ten-second runoff (B1.6.1)' },
  class: { type: 'option', options: ['personal', 'unsportsmanlike', 'other'], meaning: 'foul class' },
  dq: { type: 'option', options: ['none', 'if_flagrant', 'automatic'], meaning: 'disqualification' },
};

const EXT_SHAPE: Record<ExtField, KeyShape> = {
  enforcement: { type: 'option', options: [...ENFORCEMENT_PROFILES], meaning: 'enforcement procedure of B8.5 used for this foul' },
  kick_block_attempt: { type: 'boolean', meaning: 'a foul in an attempt to block a scrimmage kick, so never a post-possession foul (B6.6.1 rule 8)' },
  separate: { type: 'boolean', meaning: 'always a foul between downs, enforced on its own (B8.5.1 step 2)' },
};

export function extKey(id: string, field: ExtField): string { return `foul.${id}.${field}`; }

const def = (key: string, shape: KeyShape, ownerLeaf: string): RuleKeyDef => ({
  key, type: shape.type, meaning: shape.meaning, ownerLeaf, readBy: [READER],
  ...(shape.unit ? { unit: shape.unit } : {}), ...(shape.options ? { options: shape.options } : {}),
});

/** Keys that are not per foul. `K` holds the names so no key string is typed twice. */
export const K = {
  downs: 'series.downs',
  yardsToGain: 'series.yards_to_gain',
  safetyPoints: 'score.safety',
  trySafetyPoints: 'try.safety_points',
  periodsPerHalf: 'clock.periods_per_half',
  halfApplies: 'enforce.half_distance.applies',
  halfFraction: 'enforce.half_distance.fraction',
  fiveFifteenApplies: 'enforce.five_fifteen.applies',
  minorYards: 'enforce.five_fifteen.minor_yards',
  majorYards: 'enforce.five_fifteen.major_yards',
  interferenceCapped: 'enforce.interference.capped',
  interferenceMaxYards: 'enforce.interference.max_yards',
  interferenceFloorYardline: 'enforce.interference.floor_yardline',
  interferenceFloorRule: 'enforce.interference.floor_rule',
  interferenceHalfInside: 'enforce.interference.half_inside_yardline',
  interferenceHalfInclusive: 'enforce.interference.half_inclusive',
  endZoneFoulYardline: 'enforce.end_zone_foul_yardline',
  doubleFoulSafetyYardline: 'enforce.double_foul_safety_yardline',
  cleanHandsPersonalOffsets: 'enforce.clean_hands.personal_offsets',
  spikeDelayFoul: 'enforce.spike_delay_foul',
  defensiveFoulExtends: 'enforce.defensive_foul_extends_period',
  touchdownCarryToKickoff: 'enforce.touchdown_foul_to_kickoff',
} as const;

const GLOBAL: readonly RuleKeyDef[] = [
  def(K.downs, { type: 'number', unit: 'count', meaning: 'downs in a series' }, 'B3.1'),
  def(K.yardsToGain, { type: 'number', unit: 'yd', meaning: 'yards to gain for a first down' }, 'B3.1'),
  def(K.safetyPoints, { type: 'number', unit: 'points', meaning: 'points for a safety' }, 'B7'),
  def(K.trySafetyPoints, { type: 'number', unit: 'points', meaning: 'points for a safety on a try, including one that results from a foul' }, 'B7.3.3'),
  def(K.periodsPerHalf, { type: 'number', unit: 'count', meaning: 'periods in a half, to tell the last period of a half' }, 'B8.5.6'),
  def(K.halfApplies, { type: 'boolean', meaning: 'a distance penalty is limited to a fraction of the distance to the offender\'s goal line' }, 'B8.5.3'),
  def(K.halfFraction, { type: 'number', unit: 'ratio', meaning: 'the fraction of the distance to the goal line that limits a penalty' }, 'B8.5.3'),
  def(K.fiveFifteenApplies, { type: 'boolean', meaning: 'a major foul against a simple minor foul is enforced instead of offsetting' }, 'B8.5.5'),
  def(K.minorYards, { type: 'number', unit: 'yd', meaning: 'yardage of the minor foul in the major against minor rule' }, 'B8.5.5'),
  def(K.majorYards, { type: 'number', unit: 'yd', meaning: 'yardage of the major foul in the major against minor rule' }, 'B8.5.5'),
  def(K.interferenceCapped, { type: 'boolean', meaning: 'defensive pass interference is limited to a distance from the previous spot' }, 'B13.5.1'),
  def(K.interferenceMaxYards, { type: 'number', unit: 'yd', meaning: 'the limit, read only when capped' }, 'B13.5.1'),
  def(K.interferenceFloorYardline, { type: 'number', unit: 'yd', meaning: 'yard line the ball is placed on when the floor rule applies' }, 'B8.1.2'),
  def(K.interferenceFloorRule, { type: 'option', options: ['end_zone_only', 'inside_floor'], meaning: 'when the floor yard line applies: a foul in the end zone, or any result inside the floor' }, 'B13.5.1'),
  def(K.interferenceHalfInside, { type: 'number', unit: 'yd', meaning: 'a previous spot inside this yard line gives half the distance instead of the floor' }, 'B8.1.2'),
  def(K.interferenceHalfInclusive, { type: 'boolean', meaning: 'a previous spot exactly on that yard line counts as inside it' }, 'B13.5.1'),
  def(K.endZoneFoulYardline, { type: 'number', unit: 'yd', meaning: 'yard line a post-possession foul in the end zone is treated as being on' }, 'B6.6.1'),
  def(K.doubleFoulSafetyYardline, { type: 'number', unit: 'yd', meaning: 'yard line the ball goes to when an offsetting foul after a change would have been a safety' }, 'B8.5.5'),
  def(K.cleanHandsPersonalOffsets, { type: 'boolean', meaning: 'a personal or unsportsmanlike foul before the change offsets a foul after it' }, 'B8.5.5'),
  def(K.spikeDelayFoul, { type: 'option', options: ['none', ...FOUL_IDS.map((f) => f.id)], meaning: 'id of the dead-ball delay foul for spiking that the spiking team may take instead of an offset' }, 'B8.5.5'),
  def(K.defensiveFoulExtends, { type: 'boolean', meaning: 'an accepted live-ball defensive foul on the last timed down lets the offense extend the period' }, 'B1.7.2'),
  def(K.touchdownCarryToKickoff, { type: 'boolean', meaning: 'the scoring team may carry an opponent\'s foul on a touchdown to the kickoff instead of the try' }, 'B8.5.7'),
];

function build(): RuleKeyDef[] {
  const out: RuleKeyDef[] = [...GLOBAL];
  for (const f of FOUL_IDS) {
    for (const field of FOUL_FIELDS) out.push(def(foulKey(f.id, field), FIELD_SHAPE[field], f.leaf));
    for (const field of f.ext ?? []) out.push(def(extKey(f.id, field), EXT_SHAPE[field], f.leaf));
  }
  return out;
}

/** Every rule key the foul module reads (D-19). WP-01 supplies the values and their fact rows. */
export const RULE_KEYS: RuleKeyManifest = build();

/** The foul module holds no tuning constant: every number it uses is a rule value. */
export const PARAMS: ParamFile = { module: READER, version: '1', params: [] };
