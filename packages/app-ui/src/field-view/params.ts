// Tuning constants of the field view (plans/game-build-plan.md section 2: `PARAMS` with basis
// `bible` and the leaf, or `assumption`). The object has the shape of `ParamFile` in @gm/schema;
// app-ui cannot import the schema (P1.2.1), so the tests parse it with the schema's validator.

export interface FieldViewParam {
  readonly name: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly unit: string;
  readonly belongsTo: string;
  readonly basis: 'bible' | 'assumption';
  readonly leaf: string;
  readonly constrainedBy: string;
  readonly status: 'starting' | 'fitted' | 'frozen';
}

const row = (name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string, constrainedBy = 'app-ui/test/field-view'): FieldViewParam =>
  ({ name: `fieldView.${name}`, value, min, max, unit, belongsTo: 'app-ui.field-view', basis, leaf, constrainedBy, status: 'starting' });

export const PARAMS = {
  module: 'app-ui.field-view',
  version: 'pv04.1',
  params: [
    row('markerDiameterYd', 1.0, 0.5, 2, 'yd', 'bible', 'I9.1.1'),
    row('markerMinPx', 14, 8, 32, 'px', 'bible', 'O2.3.2'),
    row('overlayLabelPx', 14, 10, 24, 'px', 'assumption', 'O2.3.2'),
    row('cueSeconds', 0.4, 0.1, 2, 's', 'bible', 'I9.1.2'),
    row('wideHalfLengthYd', 25, 10, 60, 'yd', 'bible', 'I9.1.1'),
    row('tightWidthYd', 30, 10, 54, 'yd', 'bible', 'I9.1.1'),
    row('tightDepthYd', 20, 10, 60, 'yd', 'bible', 'I9.1.1'),
    row('fullLengthYd', 60, 30, 100, 'yd', 'bible', 'O2.3.1'),
    row('kickEaseS', 0.3, 0, 2, 's', 'bible', 'O2.3.1'),
    row('cameraDeadZoneFrac', 0.3, 0, 0.9, 'ratio', 'assumption', 'O2.3.1'),
    row('frameMarginYd', 2, 0, 10, 'yd', 'assumption', 'I9.1.1'),
    row('minContrast', 3, 1, 21, 'ratio', 'bible', 'I9.1.1'),
    row('engageContactYd', 1.5, 0.5, 3, 'yd', 'assumption', 'O2.3.2'),
    row('downFlatten', 0.5, 0.1, 1, 'ratio', 'assumption', 'O2.3.2'),
    row('motionTrailMinYd', 0.05, 0, 1, 'yd', 'assumption', 'O2.3.2'),
    row('ballDiameterYd', 0.5, 0.2, 1, 'yd', 'assumption', 'O2.3.2'),
    row('ballGrowPerYd', 0.1, 0, 1, 'ratio', 'assumption', 'O2.3.2'),
    row('ballShadowPerYd', 0.3, 0, 2, 'ratio', 'assumption', 'O2.3.2'),
    row('facingTickYd', 0.8, 0.2, 2, 'yd', 'assumption', 'O2.3.2'),
    row('replaysPerPlay', 1, 0, 3, 'count', 'bible', 'I9.3.1'),
    // PV-03 field art (plans/presentation-build-plan.md 2.1, 3.1; MB-3, MB-4).
    row('stripeMix', 0.05, 0, 0.2, 'ratio', 'assumption', 'O2.3.1'),
    row('fieldTextPx', 16, 10, 32, 'px', 'assumption', 'O2.3.5'),
    row('fieldTextGapPx', 3, 0, 12, 'px', 'assumption', 'O2.3.5'),
    row('endZoneTextFrac', 0.55, 0.2, 1, 'ratio', 'assumption', 'O2.3.1'),
    row('rainLightCount', 60, 0, 400, 'count', 'assumption', 'J12.2'),
    row('rainCount', 125, 0, 400, 'count', 'assumption', 'J12.2'),
    row('rainHeavyCount', 200, 0, 400, 'count', 'assumption', 'J12.2'),
    row('snowCount', 80, 0, 400, 'count', 'assumption', 'J12.2'),
    row('snowHeavyCount', 150, 0, 400, 'count', 'assumption', 'J12.2'),
    row('wetTintLight', 0.05, 0, 0.3, 'ratio', 'assumption', 'J12.2'),
    row('wetTint', 0.08, 0, 0.3, 'ratio', 'assumption', 'J12.2'),
    row('wetTintHeavy', 0.12, 0, 0.3, 'ratio', 'assumption', 'J12.2'),
    row('weatherAlpha', 0.3, 0.05, 1, 'ratio', 'assumption', 'J12.2'),
    row('rainFallPerS', 0.9, 0, 5, 'ratio', 'assumption', 'J12.2'),
    row('snowFallPerS', 0.12, 0, 5, 'ratio', 'assumption', 'J12.2'),
    row('windDriftPerMph', 0.02, 0, 0.2, 'ratio', 'assumption', 'J12.3'),
    row('streakPx', 9, 2, 30, 'px', 'assumption', 'J12.2'),
    // PV-04 cues by contact tier (MB-2).
    row('contactBarPerTier', 0.18, 0.05, 0.5, 'ratio', 'assumption', 'O6.4.1'),
  ],
} as const;

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name, p.value]));

/** Reads a field-view constant by its short name. Throws on an unknown name, like `ParamTable.num`. */
export function param(short: string): number {
  const v = BY_NAME.get(`fieldView.${short}`);
  if (v === undefined) throw new Error(`unknown field-view parameter ${short}`);
  return v;
}
