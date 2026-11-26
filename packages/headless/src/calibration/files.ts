// File access for the calibration harness (headless is a tool package, so it may read files).
// Target files live in content/calibration/targets.<ruleSetId>.json; the register in facts/measured-rate.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FactFile, type FactRow } from '@gm/schema';
import { checkTargets, type LoadedTargets } from './targets.ts';

export function targetFilePath(root: string, ruleSetId: string): string {
  return join(root, 'content', 'calibration', `targets.${ruleSetId}.json`);
}

export function readMeasuredRateFacts(root: string): FactRow[] {
  return FactFile.parse(JSON.parse(readFileSync(join(root, 'facts', 'measured-rate.json'), 'utf8'))).rows;
}

/** Reads and checks one rule set's target file against the register. */
export function loadTargets(root: string, ruleSetId: string): LoadedTargets {
  const raw: unknown = JSON.parse(readFileSync(targetFilePath(root, ruleSetId), 'utf8'));
  return checkTargets(raw, readMeasuredRateFacts(root));
}
