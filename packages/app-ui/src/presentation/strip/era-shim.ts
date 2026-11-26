// The strip and banners take their period faces from PV-18's era package. This file keeps the names PV-05
// was built against: `eraVar(name)` here is `var(--gm-era-...)` (era's `ev`), not the bare variable name.
import { ev, type EraKey } from '../era/index.ts';

export { LampText, SegmentClock, LowerThird } from '../era/index.ts';
export type EraColour = EraKey;
/** `var(--gm-era-lamp-on)` for a style. Every theme defines the era group, so no fallback is needed. */
export const eraVar = (name: EraColour): string => ev(name);
