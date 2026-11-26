// Tuning constants of browser storage (P5.6.1). None is a football fact; each is a technical choice.
import type { ParamFile } from '@gm/schema';

/** Share of the reported quota at which a write still goes ahead but the user is warned. */
export const QUOTA_WARN_RATIO = 0.8;
/** Share of the reported quota a write may never pass: P5.6.1 stops before exceeding the quota. */
export const QUOTA_STOP_RATIO = 1;
/** Milliseconds in a day, for "days since the last export". A definition, not a tuning value. */
export const MS_PER_DAY = 86_400_000;

export const PARAMS: ParamFile = {
  module: 'store.browser',
  version: '0.1.0',
  params: [
    {
      name: 'store.browser.quotaWarnRatio', value: QUOTA_WARN_RATIO, min: 0.5, max: 0.95, unit: 'share of reported quota',
      belongsTo: 'quota warning', basis: 'assumption', leaf: 'P5.6.1',
      constrainedBy: 'test/browser vault quota tests', status: 'starting',
    },
    {
      name: 'store.browser.quotaStopRatio', value: QUOTA_STOP_RATIO, min: 1, max: 1, unit: 'share of reported quota',
      belongsTo: 'quota stop', basis: 'bible', leaf: 'P5.6.1',
      constrainedBy: 'test/browser vault quota tests', status: 'frozen',
    },
  ],
};

/**
 * Retention profiles of P5.4.1. The browser build defaults to `compact` (P5.6.1). The save schema's
 * enum holds only `standard` and `full` today; adding `compact` is a contract request to the
 * integrator, so this local alias carries all three until then (engine-build-plan section 6 step 2).
 */
export type RetentionProfile = 'full' | 'standard' | 'compact';
export const BROWSER_DEFAULT_RETENTION_PROFILE: RetentionProfile = 'compact';
