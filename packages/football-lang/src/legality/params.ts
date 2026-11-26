// Legality validator: the rule keys it reads and its tuning constants (plans/engine-build-plan.md,
// section 2 "Rule keys" and "Tuning constants"). No rule number is written in the checker: every
// rule value is read from the rule set by key (P1.1.2, B4.6.1 item 5). WP-01 owns the values and
// their fact rows; this file only names the keys.
import type { ParamFile, ParamTable, RuleKeyManifest } from '@gm/schema';

const READ_BY = ['football-lang.legality'];

/** Keys the legality validator reads. `substitution.max_players` exists already; the rest are new. */
/**
 * Keys the checker needs that the dictionary does not have yet. They are requested from WP-01 in the
 * WP-10 report. The band edges and the two snapper distances are rule values, so they cannot be
 * written in code; until the rule sets carry them, the checker runs on rule sets that do (the test fixtures).
 */
export const PROPOSED_RULE_KEYS: RuleKeyManifest = [
  { key: 'formation.neither_behind_snapper_max', type: 'number', unit: 'count', meaning: 'Players allowed neither on nor off the line when directly behind the snapper', ownerLeaf: 'B4.2.2', readBy: READ_BY },
  { key: 'formation.t_quarterback_depth_yd', type: 'number', unit: 'yd', meaning: 'A player this close or closer behind the snapper is the player under center', ownerLeaf: 'B4.1.2', readBy: READ_BY },
  { key: 'numbering.eligible_low_max', type: 'number', unit: 'index', meaning: 'Top of the lower band of eligible jersey numbers (the band starts at 0)', ownerLeaf: 'B2.3.2', readBy: READ_BY },
  { key: 'numbering.eligible_high_min', type: 'number', unit: 'index', meaning: 'Bottom of the upper band of eligible jersey numbers', ownerLeaf: 'B2.3.2', readBy: READ_BY },
  { key: 'numbering.eligible_high_max', type: 'number', unit: 'index', meaning: 'Top of the upper band of eligible jersey numbers', ownerLeaf: 'B2.3.2', readBy: READ_BY },
];

/** Keys the legality validator reads. */
export const RULE_KEYS: RuleKeyManifest = [
  // In the dictionary already (WP-01).
  { key: 'substitution.max_players', type: 'number', unit: 'count', meaning: 'Players per team on the field', ownerLeaf: 'B2.3.1', readBy: READ_BY },
  { key: 'formation.line_min', type: 'number', unit: 'count', meaning: 'Fewest offensive players who must be on the line at the snap (0 = the rule book states no such number)', ownerLeaf: 'B4.2.1', readBy: READ_BY },
  { key: 'formation.backfield_max', type: 'number', unit: 'count', meaning: 'Most offensive players who may be backs at the snap (0 = the rule book states no such number)', ownerLeaf: 'B13.2.2', readBy: READ_BY },
  { key: 'formation.numbered_linemen_min', type: 'number', unit: 'count', meaning: 'Fewest linemen who must wear a number in the ineligible band (0 = the rule book states no such number)', ownerLeaf: 'B13.2.2', readBy: READ_BY },
  { key: 'formation.motion_rule', type: 'option', options: ['one_back_not_forward'], meaning: 'Who may be in motion at the snap', ownerLeaf: 'B4.3.3', readBy: READ_BY },
  { key: 'formation.shift_set_seconds', type: 'number', unit: 's', meaning: 'Time all offensive players must be set after a shift', ownerLeaf: 'B4.3.1', readBy: READ_BY },
  { key: 'numbering.scheme', type: 'option', options: ['position_bands', 'free_0_99_five_50_79'], meaning: 'How jersey numbers decide who may be an eligible receiver', ownerLeaf: 'B13.2.2', readBy: READ_BY },
  { key: 'numbering.report_eligible_allowed', type: 'boolean', meaning: 'A player may change his eligibility by reporting to the referee', ownerLeaf: 'B2.3.3', readBy: READ_BY },
  { key: 'numbering.qb_under_center_eligible', type: 'boolean', meaning: 'A quarterback under center is an eligible receiver without moving', ownerLeaf: 'B13.2.2', readBy: READ_BY },
  ...PROPOSED_RULE_KEYS,
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
