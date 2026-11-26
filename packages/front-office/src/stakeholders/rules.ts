// League and college rule values this module reads. K8 reads none directly: hiring windows and the
// interview rule (C11) are read by the compliance pipeline (G-28), contract terms by the cap and coach
// contract modules, and the review calendar dates (E4.7.2 rule 6) are handed in by the calendar (G-12).
import type { RuleKeyManifest } from '@gm/schema';

export const RULE_KEYS: RuleKeyManifest = [];
