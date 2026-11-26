// Simulation contract, part 4: where numbers come from. Two sources only (P1.1.2, Q6, B12.1.2 rule 3):
//   1. Rule values: the `RuleSet` of ../rules.ts, by key. Every value cites a fact row.
//   2. Tuning constants: named parameters in a parameter file (J6.8.1, Q2.4.1). A parameter with no
//      real-world source is an Assumption and says so. It is never presented as a fact.
import { z } from 'zod';
import { pub } from '../field.ts';
import { RuleKeyDef, type RuleSet } from '../rules.ts';

/**
 * Rule-key manifest: the keys one module reads. Each officiating or engine module exports one
 * (`RULE_KEYS` in its own index). The integrator checks every manifest key against the dictionary
 * in @gm/rules-data (B12.1.2), so two modules cannot invent two names for one rule.
 * Naming (B13.1.2): `<group>.<name>` or `<group>.<subgroup>.<name>`, lower case, underscores.
 */
export const RuleKeyManifest = z.array(RuleKeyDef);
export type RuleKeyManifest = z.infer<typeof RuleKeyManifest>;

/** A foul is identified by its catalogue key, a string from the rule set (B8.1.2). Never an enum in code. */
export type FoulId = string;

/**
 * Catalogue fields of one foul (B8.1.1 "From the catalogue"). The catalogue is rule data: field `f` of
 * foul `id` is the rule key `foul.<id>.<f>` (the existing key `foul.ineligible_downfield.yards` set the
 * pattern). A foul that does not exist at a level has `foul.<id>.exists = false` (J10.1.1).
 */
export const FOUL_FIELDS = ['exists', 'yards', 'afd', 'lod', 'spot_foul', 'dead_ball', 'runoff_eligible', 'class', 'dq'] as const;
export type FoulField = (typeof FOUL_FIELDS)[number];
export function foulKey(id: FoulId, field: FoulField): string { return `foul.${id}.${field}`; }

export const FoulClass = z.enum(['personal', 'unsportsmanlike', 'other']);
export const FoulDq = z.enum(['none', 'if_flagrant', 'automatic']);

/** One resolved catalogue row. Built by the foul module from the rule set, never typed in code. */
export interface FoulCatalogueRow {
  readonly id: FoulId;
  readonly exists: boolean;
  /** Distance in yards; `spotFoul` true means enforcement at the spot of the foul (B8.5.2). */
  readonly yards: number;
  readonly afd: boolean;
  readonly lod: boolean;
  readonly spotFoul: boolean;
  readonly deadBall: boolean;
  readonly runoffEligible: boolean;
  readonly foulClass: z.infer<typeof FoulClass>;
  readonly dq: z.infer<typeof FoulDq>;
}

/** Status of a tuning parameter (J6.8.1). */
export const ParamStatus = z.enum(['starting', 'fitted', 'frozen']);

/**
 * One tuning constant (J6.8.1). `basis` says where the number came from: a bible leaf that states it
 * as a starting value, or `assumption` when the module's author chose it. `constrainedBy` names the
 * J15 target row or Q suite that will fit it; a parameter no test constrains is removed (J6.8.1).
 */
export const TuningParam = z.object({
  name: pub(z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/)),
  value: pub(z.number(), 'ratio'),
  min: pub(z.number(), 'ratio'),
  max: pub(z.number(), 'ratio'),
  unit: pub(z.string()),
  belongsTo: pub(z.string()),
  basis: pub(z.enum(['bible', 'assumption'])),
  /** Bible leaf id that states the value, or the leaf the assumption serves. */
  leaf: pub(z.string()),
  constrainedBy: pub(z.string()),
  status: pub(ParamStatus),
}).strict();
export type TuningParam = z.infer<typeof TuningParam>;

export const ParamFile = z.object({
  /** Module that owns the file, for example `officiating.detection` or `resolver.reference`. */
  module: pub(z.string()),
  version: pub(z.string()),
  params: pub(z.array(TuningParam)),
}).strict();
export type ParamFile = z.infer<typeof ParamFile>;

/** Read-only parameter access handed to every resolver and officiating call. Throws on an unknown name. */
export interface ParamTable {
  readonly version: string;
  num(name: string): number;
  has(name: string): boolean;
}

/** Everything a core function may read numbers from. */
export interface NumberSources {
  readonly rules: RuleSet;
  readonly params: ParamTable;
}
