// Legality validator: the rule keys it reads and its tuning constants (plans/engine-build-plan.md,
// section 2 "Rule keys" and "Tuning constants"). No rule number is written in the checker: every
// rule value is read from the rule set by key (P1.1.2, B4.6.1 item 5). WP-01 owns the values and
// their fact rows; this file only names the keys.
import type { ParamFile, ParamTable, RuleKeyManifest } from '@gm/schema';

const READ_BY = ['football-lang.legality'];

/** Keys the legality validator reads. `substitution.max_players` exists already; the rest are new. */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'substitution.max_players', type: 'number', unit: 'count', meaning: 'Players per team on the field', ownerLeaf: 'B2.3.1', readBy: READ_BY },
  { key: 'formation.line_min', type: 'number', unit: 'count', meaning: 'Fewest offensive players on the line of scrimmage at the snap (0 when the rule set has no such minimum)', ownerLeaf: 'B4.2.1', readBy: READ_BY },
  { key: 'formation.backfield_max', type: 'number', unit: 'count', meaning: 'Most offensive players who may be off the line at the snap', ownerLeaf: 'B13.2.2', readBy: READ_BY },
  { key: 'formation.line_ineligible_numbers_min', type: 'number', unit: 'count', meaning: 'Fewest players on the line who must wear a number outside the eligible bands (0 when not required)', ownerLeaf: 'B13.2.2', readBy: READ_BY },
  { key: 'formation.neither_behind_snapper_max', type: 'number', unit: 'count', meaning: 'Players allowed neither on nor off the line when directly behind the snapper', ownerLeaf: 'B4.2.2', readBy: READ_BY },
  { key: 'formation.t_quarterback_depth_yd', type: 'number', unit: 'yd', meaning: 'A player this close or closer behind the snapper is the player under center', ownerLeaf: 'B4.1.2', readBy: READ_BY },
  { key: 'formation.in_bounds_required', type: 'boolean', meaning: 'Every offensive player must be in bounds at the snap', ownerLeaf: 'B4.2.1', readBy: READ_BY },
  { key: 'formation.motion_max_at_snap', type: 'number', unit: 'count', meaning: 'Most offensive players who may be moving at the snap', ownerLeaf: 'B4.3.3', readBy: READ_BY },
  { key: 'formation.motion_rule', type: 'option', options: ['not_toward_line', 'any_direction'], meaning: 'Which way the motion man may be moving at the snap', ownerLeaf: 'B4.3.3', readBy: READ_BY },
  { key: 'formation.motion_from_backfield_only', type: 'boolean', meaning: 'The motion man must have been lined up off the line', ownerLeaf: 'B4.3.3', readBy: READ_BY },
  { key: 'formation.shift_set_seconds', type: 'number', unit: 's', meaning: 'How long all offensive players must be set after a shift before the snap', ownerLeaf: 'B4.3.1', readBy: READ_BY },
  { key: 'numbering.eligible_low_max', type: 'number', unit: 'index', meaning: 'Top of the lower band of eligible jersey numbers (the band starts at 0)', ownerLeaf: 'B2.3.2', readBy: READ_BY },
  { key: 'numbering.eligible_high_min', type: 'number', unit: 'index', meaning: 'Bottom of the upper band of eligible jersey numbers', ownerLeaf: 'B2.3.2', readBy: READ_BY },
  { key: 'numbering.eligible_high_max', type: 'number', unit: 'index', meaning: 'Top of the upper band of eligible jersey numbers', ownerLeaf: 'B2.3.2', readBy: READ_BY },
  { key: 'numbering.eligible_position_needs_number', type: 'boolean', meaning: 'A player in an eligible position must wear an eligible number or have reported', ownerLeaf: 'B4.2.1', readBy: READ_BY },
  { key: 'numbering.report_eligible_allowed', type: 'boolean', meaning: 'A player may report to the referee to change his eligibility for a down', ownerLeaf: 'B2.3.3', readBy: READ_BY },
  { key: 'numbering.qb_under_center_eligible', type: 'boolean', meaning: 'The player under center is an eligible receiver by position', ownerLeaf: 'B13.2.2', readBy: READ_BY },
];

/** Tuning constants of the legality validator. Each is a design tolerance, never a rule value. */
export const PARAMS: ParamFile = {
  module: 'football-lang.legality',
  version: '1',
  params: [
    { name: 'legality.line.clearlyOffYd', value: 1.0, min: 0.5, max: 2, unit: 'yd', belongsTo: 'football-lang.legality', basis: 'bible', leaf: 'B4.1.2', constrainedBy: 'Q1.1.3', status: 'starting' },
    { name: 'legality.snapper.maxLateralYd', value: 1.0, min: 0.25, max: 3, unit: 'yd', belongsTo: 'football-lang.legality', basis: 'assumption', leaf: 'B4.1.2', constrainedBy: 'Q1.1.3', status: 'starting' },
    { name: 'legality.snapper.behindLateralYd', value: 0.5, min: 0.1, max: 1.5, unit: 'yd', belongsTo: 'football-lang.legality', basis: 'assumption', leaf: 'B4.2.2', constrainedBy: 'Q1.1.3', status: 'starting' },
    { name: 'legality.motion.stationaryYps', value: 0.3, min: 0.05, max: 1, unit: 'yd_per_s', belongsTo: 'football-lang.legality', basis: 'bible', leaf: 'B4.3.3', constrainedBy: 'Q1.1.3', status: 'starting' },
    { name: 'legality.motion.towardLineTolYps', value: 0.3, min: 0, max: 1, unit: 'yd_per_s', belongsTo: 'football-lang.legality', basis: 'bible', leaf: 'B4.3.3', constrainedBy: 'Q1.1.3', status: 'starting' },
  ],
};

/** A read-only table over one or more parameter files. The integrator's merged table replaces it. */
export function paramTableOf(files: readonly ParamFile[]): ParamTable {
  const values = new Map<string, number>();
  const versions: string[] = [];
  for (const f of files) {
    versions.push(`${f.module}@${f.version}`);
    for (const p of f.params) values.set(p.name, p.value);
  }
  return {
    version: versions.join('+'),
    num(name: string): number {
      const v = values.get(name);
      if (v === undefined) throw new Error(`unknown parameter ${name}`);
      return v;
    },
    has(name: string): boolean { return values.has(name); },
  };
}
