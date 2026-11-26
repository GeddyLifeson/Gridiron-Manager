// WP-24 batch runner parameters. The batch runner holds no tuning constant: game seeds come from the
// master seed and the index (calibration gameSeedHex), worker count from the caller. Exported empty so
// the integrator's merge of parameter files sees the module.
import type { ParamFile } from '@gm/schema';

export const PARAMS: ParamFile = { module: 'headless.batch', version: '1', params: [] };
