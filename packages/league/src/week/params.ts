// Numbers of the coaching week (H1, H4, H7, H8, H9): tuning constants (PARAMS, from params.json) and
// the league-rule keys this module reads (RULE_KEYS). Real-world rule values are keys, never
// constants; data/week-keys.json carries the ones G-10 does not have yet (CR-G69-1).
import type { ParamFile, RuleKeyDef, RuleKeyManifest, TuningParam } from '@gm/schema';
import paramsJson from './params.json' with { type: 'json' };
import keysJson from './data/week-keys.json' with { type: 'json' };

export const MODULE = 'league.week';

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
  if (v === undefined) throw new Error(`unknown week parameter ${name}`);
  return v;
}

/** Calendar week-work rule keys already in the G-10 league-rules files. */
export const LEAGUE_KEYS = {
  dayOffPerWeek: 'work.season_day_off_per_week',
  byeDaysOff: 'work.bye_days_off',
  seasonPadded: 'work.season_padded_practices_max',
} as const;

function def(key: string, unit: string, meaning: string, ownerLeaf: string): RuleKeyDef {
  const isFlag = unit === 'flag';
  return { key, type: isFlag ? 'boolean' : 'number', ...(isFlag ? {} : { unit }), meaning, ownerLeaf, readBy: [MODULE] } as RuleKeyDef;
}

/** Every rule key the week module reads (D-19). The week-keys rows are the values until G-10 carries them. */
export const RULE_KEYS: RuleKeyManifest = [
  def(LEAGUE_KEYS.dayOffPerWeek, 'days', 'players get at least this many full days off per regular-season calendar week (Sunday to Saturday)', 'H1.1.2'),
  def(LEAGUE_KEYS.byeDaysOff, 'days', 'consecutive days off in the bye week, including a Saturday and Sunday', 'H1.1.2'),
  ...keysJson.keys.map((k) => def(k.key, k.unit, k.source, k.leaf)),
];
