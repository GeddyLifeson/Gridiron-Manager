// Foul catalogue loader (B8.1.2, B13.12, contract decision D-06). The catalogue is rule data: field `f` of foul
// `id` is the rule key `foul.<id>.<f>`. This module lists the foul ids found in the key dictionary, checks that each
// has every catalogue field with the right type, and reads typed rows from a resolved rule set.
// It reads the dictionary file directly and does not import the package entry point.
import { FOUL_FIELDS, FoulClass, FoulDq, foulKey, type FoulCatalogueRow, type FoulField, type FoulId, type RuleKeyDef, type RuleSet } from '@gm/schema';
import keysJson from '../../data/keys.json' with { type: 'json' };

const DICT: readonly RuleKeyDef[] = keysJson.keys as RuleKeyDef[];

/** Expected type of each catalogue field (contract `FoulCatalogueRow`). */
export const FOUL_FIELD_TYPES: Readonly<Record<FoulField, RuleKeyDef['type']>> = {
  exists: 'boolean', yards: 'number', afd: 'boolean', lod: 'boolean', spot_foul: 'boolean',
  dead_ball: 'boolean', runoff_eligible: 'boolean', class: 'option', dq: 'option',
};

/** Foul ids, sorted: every dictionary key of the form `foul.<id>.exists`. */
export function foulIds(dict: readonly RuleKeyDef[] = DICT): FoulId[] {
  const ids: FoulId[] = [];
  for (const d of dict) {
    const m = /^foul\.([a-z0-9_]+)\.exists$/.exec(d.key);
    if (m) ids.push(m[1]!);
  }
  return ids.sort();
}

export const FOUL_IDS: readonly FoulId[] = Object.freeze(foulIds());

/**
 * Manifest check: each foul has all nine catalogue fields in the dictionary, with the contract's types and
 * option lists. Returns the problems found; an empty list means the catalogue is complete.
 */
export function checkFoulCatalogue(dict: readonly RuleKeyDef[] = DICT): string[] {
  const errors: string[] = [];
  const byKey = new Map(dict.map((d) => [d.key, d]));
  const options: Partial<Record<FoulField, readonly string[]>> = { class: FoulClass.options, dq: FoulDq.options };
  for (const id of foulIds(dict)) {
    for (const f of FOUL_FIELDS) {
      const def = byKey.get(foulKey(id, f));
      if (!def) { errors.push(`foul ${id}: missing key ${foulKey(id, f)}`); continue; }
      if (def.type !== FOUL_FIELD_TYPES[f]) errors.push(`foul ${id}: ${f} is ${def.type}, expected ${FOUL_FIELD_TYPES[f]}`);
      const want = options[f];
      if (want && (def.options?.length !== want.length || want.some((o) => !def.options?.includes(o)))) {
        errors.push(`foul ${id}: ${f} options ${def.options?.join(', ')} differ from ${want.join(', ')}`);
      }
      if (f === 'yards' && def.unit !== 'yd') errors.push(`foul ${id}: yards unit must be yd`);
    }
  }
  return errors;
}

/** One typed catalogue row from a resolved rule set. Throws (through the rule set) on a missing key. */
export function foulRow(rules: RuleSet, id: FoulId): FoulCatalogueRow {
  return Object.freeze({
    id,
    exists: rules.bool(foulKey(id, 'exists')),
    yards: rules.num(foulKey(id, 'yards')),
    afd: rules.bool(foulKey(id, 'afd')),
    lod: rules.bool(foulKey(id, 'lod')),
    spotFoul: rules.bool(foulKey(id, 'spot_foul')),
    deadBall: rules.bool(foulKey(id, 'dead_ball')),
    runoffEligible: rules.bool(foulKey(id, 'runoff_eligible')),
    foulClass: FoulClass.parse(rules.opt(foulKey(id, 'class'))),
    dq: FoulDq.parse(rules.opt(foulKey(id, 'dq'))),
  });
}

/** Every catalogue row of a rule set, in foul-id order. Rows of fouls this level does not have carry `exists` false. */
export function foulCatalogue(rules: RuleSet, ids: readonly FoulId[] = FOUL_IDS): FoulCatalogueRow[] {
  return ids.map((id) => foulRow(rules, id));
}
