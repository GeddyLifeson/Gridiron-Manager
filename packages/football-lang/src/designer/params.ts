// Play designer (G-90; bible G1, O3.1, O3.7): the rule keys it reads and its starting values.
// Rule values are read from the rule set by key (P1.1.2). Thresholds below are design starting values
// the bible puts "in config" (G1.5.3, G1.6.2, O3.1.3, O3.1.4, O3.7.1), never rule values.
import type { ParamFile, RuleKeyManifest } from '@gm/schema';

const READ_BY = ['football-lang.designer'];

/** Keys the designer needs that the dictionary lacks. A check whose key is absent is skipped, never guessed. */
export const PROPOSED_RULE_KEYS: RuleKeyManifest = [
  { key: 'field.numbers_from_sideline_yd', type: 'number', unit: 'yd', meaning: 'Distance from the sideline to the near edge of the field numbers (alignment readout landmark)', ownerLeaf: 'B2.1.1', readBy: READ_BY },
  { key: 'pass.offensive_pi_contact_beyond_yd', type: 'number', unit: 'yd', meaning: 'Contact by the offense beyond this distance past the line during a forward pass can be offensive pass interference', ownerLeaf: 'B5.4.1', readBy: READ_BY },
];

/** Keys the designer reads (the legality checker reads its own, see legality/params.ts). */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'field.hash_from_sideline_ft', type: 'number', unit: 'ft', meaning: 'Distance from each sideline to the inbounds lines (hash marks)', ownerLeaf: 'B2.1.1', readBy: READ_BY },
  { key: 'pass.ineligible_downfield_limit_yd', type: 'number', unit: 'yd', meaning: 'How far past the line an ineligible player may be before a forward pass is thrown', ownerLeaf: 'B5.2.3', readBy: READ_BY },
  ...PROPOSED_RULE_KEYS,
];

const p = (name: string, value: number, min: number, max: number, unit: string, leaf: string, basis: 'bible' | 'assumption' = 'bible') => ({
  name, value, min, max, unit, belongsTo: 'football-lang.designer', basis, leaf, constrainedBy: 'Q1.1.3', status: 'starting' as const,
});

export const PARAMS: ParamFile = {
  module: 'football-lang.designer',
  version: '1',
  params: [
    // G1.5.3 starting warning set.
    p('designer.spacing.minYd', 5, 2, 10, 'yd', 'G1.5.3'),
    p('designer.timing.toleranceS', 0.4, 0.1, 1.5, 's', 'G1.5.3'),
    /** Average route-running speed used only to time route breaks on the board (not an engine speed). */
    p('designer.timing.routeSpeedYps', 7, 4, 10, 'yd_per_s', 'G1.5.3', 'assumption'),
    /** Drop length in steps above which a five-man protection is called short (G1.5.3 "seven-step drop behind a five-man protection"). */
    p('designer.protection.longDropSteps', 7, 5, 9, 'count', 'G1.5.3'),
    p('designer.protection.shortProtectors', 5, 5, 7, 'count', 'G1.5.3'),
    /** Personnel fit gap (0 to 1) above which the fit warning fires. */
    p('designer.fit.maxGap', 0.35, 0.1, 0.9, 'ratio', 'G1.5.3', 'assumption'),
    // O3.1.2 snapping.
    p('designer.snap.lateralYd', 0.5, 0.25, 1, 'yd', 'O3.1.2', 'assumption'),
    p('designer.snap.depthYd', 1, 0.5, 1, 'yd', 'O3.1.2'),
    p('designer.snap.breakAngleDeg', 45, 15, 90, 'deg', 'O3.1.2', 'assumption'),
    p('designer.route.matchToleranceYd', 1.5, 0.5, 3, 'yd', 'O3.1.2', 'assumption'),
    // O3.7.1 and O3.1.4.
    p('designer.undo.minSteps', 200, 200, 2000, 'count', 'O3.7.1'),
    p('bench.runs.default', 200, 20, 2000, 'count', 'G1.6.2'),
    p('bench.hours.perSession', 0.5, 0, 4, 'h', 'G1.6.2'),
    p('bench.confidence.z', 1.96, 1, 3, 'ratio', 'O3.1.4', 'assumption'),
  ],
};
