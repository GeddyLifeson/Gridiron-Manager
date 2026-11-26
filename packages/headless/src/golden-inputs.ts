import { bytesHash, canonicalBytes } from '@gm/engine-core';
import { RULE_SET_FILES, resolveRuleSet } from '@gm/rules-data';
import type { GoldenInputs } from '@gm/engine-game';

export function goldenInputs(): GoldenInputs {
  return { resolveRuleSet, ruleSetFilesHash: bytesHash(canonicalBytes(RULE_SET_FILES)) };
}
