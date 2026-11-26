// Numbers of practice planning (H3): tuning constants (PARAMS, from params.json) and the rule keys this
// module reads (RULE_KEYS). Real-world rule values are keys, never constants. The padded-practice
// budget, prohibited drills and pro field time are read by the G-12 work-rule checker; college hours by
// the week's keys; data/practice-keys.json carries what G-10 does not have yet (CR-G65-1).
import type { FactStatus, ParamFile, RuleKeyDef, RuleKeyManifest, TuningParam } from '@gm/schema';
import paramsJson from './params.json' with { type: 'json' };
import keysJson from './data/practice-keys.json' with { type: 'json' };
import type { RuleLookup } from '../calendar/types.ts';

export const MODULE = 'league.practice';

type Row = readonly [string, number, number, number, string, string, string, string];

const params: TuningParam[] = (paramsJson.rows as unknown as Row[]).map(([name, value, min, max, unit, basis, leaf, constrainedBy]) => ({
  name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE,
  basis: basis === 'bible' ? 'bible' : 'assumption', leaf, constrainedBy, status: 'starting',
}));

/** Tuning constants (plans/game-build-plan.md section 2): basis `bible` with the leaf, or `assumption`. */
export const PARAMS: ParamFile = { module: MODULE, version: paramsJson.version, params };

const byName = new Map(params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));
/** Read one constant by its short name. Throws on an unknown name, so a typo cannot read as zero. */
export function P(name: string): number {
  const v = byName.get(name);
  if (v === undefined) throw new Error(`unknown practice parameter ${name}`);
  return v;
}

export interface PracticeKeyRow {
  readonly key: string;
  readonly value: number;
  readonly unit: string;
  readonly status: FactStatus;
  readonly leaf: string;
  readonly levels: readonly string[];
  readonly source: string;
}

export const PRACTICE_KEYS: readonly PracticeKeyRow[] = keysJson.keys as PracticeKeyRow[];

/** Keys read directly by this module (the checker reads its own). */
export const KEYS = {
  seasonPadded: 'work.season_padded_practices_max',
  dayHours: 'college.cara_day_hours',
  weekHours: 'college.cara_week_hours',
  anyStaffMayCoach: 'college.any_staff_may_coach',
  /** H3.6.1 rule 2: no researched value; absent means no padded budget at that level. */
  collegePadded: 'college.in_season_padded_limit',
} as const;

/** League rules first, then this module's own rows for the level; a disagreement throws. */
export function practiceLookup(leagueRules: RuleLookup, level: string): RuleLookup {
  const own = new Map(PRACTICE_KEYS.filter((r) => r.levels.includes(level)).map((r) => [r.key, r.value] as const));
  return (k) => {
    const a = leagueRules(k);
    const b = own.get(k);
    if (a !== undefined && b !== undefined && a !== b) throw new Error(`rule key ${k}: league rules say ${a}, practice rows say ${b}`);
    return a ?? b;
  };
}

function def(key: string, unit: string, meaning: string, ownerLeaf: string): RuleKeyDef {
  const isFlag = unit === 'flag';
  return { key, type: isFlag ? 'boolean' : 'number', ...(isFlag ? {} : { unit }), meaning, ownerLeaf, readBy: [MODULE] } as RuleKeyDef;
}

/** Every rule key this module reads itself (D-19). */
export const RULE_KEYS: RuleKeyManifest = [
  def(KEYS.collegePadded, 'practices', 'in-season padded practice limit at this level; absent = no padded budget shown or enforced (H3.6.1 rule 2)', 'H3.6.1'),
  ...PRACTICE_KEYS.map((k) => def(k.key, k.unit, k.source, k.leaf)),
];
