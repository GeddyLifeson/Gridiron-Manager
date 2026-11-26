// Rule keys the defensive call designer reads (G2 header: hash marks are wider in college, read from the
// rule set; B13.2.1). The field/boundary declaration (G2.1.2) and the divider (G2.4.2) need the hash
// distance, the field width and the numbers. field.hash_from_sideline_ft is in the dictionary;
// field.width_ft is added by the field-keys research branch; the two numbers keys are NEW and requested from
// the integrator. An absent numbers key turns the divider off (no rule fires on it); absent hash or width
// keys are an error, since the declaration cannot be made without them. No level is tested (P1.1.2).
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['content.defenseDesigner'];

export const RULE_KEYS: RuleKeyManifest = [
  { key: 'field.hash_from_sideline_ft', type: 'number', unit: 'ft', meaning: 'Distance of the inbounds lines (hash marks) from the sideline', ownerLeaf: 'B13.2.1', readBy: READ_BY },
  { key: 'field.width_ft', type: 'number', unit: 'ft', meaning: 'Field width between the sidelines', ownerLeaf: 'B2.1.1', readBy: READ_BY },
  { key: 'field.numbers_top_from_sideline_ft', type: 'number', unit: 'ft', meaning: 'Distance of the top of the yard-line numbers from the sideline (NEW: G2.4.2 divider)', ownerLeaf: 'G2.4.2', readBy: READ_BY },
  { key: 'field.numbers_bottom_from_sideline_ft', type: 'number', unit: 'ft', meaning: 'Distance of the bottom of the yard-line numbers from the sideline (NEW: G2.4.2 divider)', ownerLeaf: 'G2.4.2', readBy: READ_BY },
];

/** Field geometry in yards, lateral measured from the midline, right-positive as authored (G1.1.1). */
export interface FieldGeometry {
  readonly halfWidthYd: number;
  /** Lateral of the right hash; the left hash is its negative. */
  readonly hashYd: number;
  /** Distance of the top and bottom of the numbers from the sideline, or null when the rule set has none. */
  readonly numbersTopYd: number | null;
  readonly numbersBottomYd: number | null;
}

export function fieldGeometry(rules: Pick<RuleSet, 'keys' | 'num'>): FieldGeometry {
  const present = new Set(rules.keys());
  for (const k of ['field.hash_from_sideline_ft', 'field.width_ft']) if (!present.has(k)) throw new Error(`defense-designer: rule set lacks ${k}`);
  const halfWidthYd = rules.num('field.width_ft') / 6;
  const hashFromSideYd = rules.num('field.hash_from_sideline_ft') / 3;
  const opt = (k: string): number | null => (present.has(k) ? rules.num(k) / 3 : null);
  return { halfWidthYd, hashYd: halfWidthYd - hashFromSideYd, numbersTopYd: opt('field.numbers_top_from_sideline_ft'), numbersBottomYd: opt('field.numbers_bottom_from_sideline_ft') };
}
