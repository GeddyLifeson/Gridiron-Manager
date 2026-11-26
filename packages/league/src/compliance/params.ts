// Numbers of the rule-breaking pipeline (L8.2.5): tuning constants (PARAMS, from params.json) and the
// league-rule keys this module reads (RULE_KEYS). Penalty amounts are rule values, never constants:
// G-10 supplies them with fact rows. An absent penalty key means "no published amount" and the
// pipeline falls back to the default tier ladder, which never invents a dollar figure (L8.2.5).
import type { ParamFile, RuleKeyDef, RuleKeyManifest, TuningParam } from '@gm/schema';
import paramsJson from './params.json' with { type: 'json' };
import { CLASSES } from './catalogue.ts';

export const MODULE = 'league.compliance';

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
  if (v === undefined) throw new Error(`unknown compliance parameter ${name}`);
  return v;
}

/** Fine groups: the role of the person fined picks the column (I11.8.1 fines head coaches, assistants and players differently). */
export const FINE_GROUPS = ['head_coach', 'assistant', 'player', 'executive'] as const;
export type FineGroup = (typeof FINE_GROUPS)[number];

/** Practice taken away (C11.2.4 rules 2 and 3). */
export const PRACTICE_CANCEL = ['none', 'ota_week', 'padded_practice'] as const;

/** Per-class penalty fields. Key `compliance.<class>.<field>`. Every one is optional in a rule set. */
export const PENALTY_FIELDS: readonly { field: string; def: Omit<RuleKeyDef, 'key' | 'ownerLeaf' | 'readBy'> }[] = [
  { field: 'applies', def: { type: 'boolean', meaning: 'the violation class exists under this rule set (absent means it does)' } },
  ...FINE_GROUPS.flatMap((g) => (['first', 'repeat'] as const).map((n) => ({
    field: `fine_${g}_${n}_cents`, def: { type: 'number' as const, unit: 'cents', meaning: `fine on a ${g.replace('_', ' ')} for a ${n} finding of this class` },
  }))),
  { field: 'club_fine_first_cents', def: { type: 'number', unit: 'cents', meaning: 'fine on the club or program for a first finding' } },
  { field: 'club_fine_repeat_cents', def: { type: 'number', unit: 'cents', meaning: 'fine on the club or program for a repeat finding' } },
  { field: 'pick_round_first', def: { type: 'number', unit: 'count', meaning: 'draft round forfeited on a first finding (0 = none)' } },
  { field: 'pick_round_repeat', def: { type: 'number', unit: 'count', meaning: 'draft round forfeited on a repeat finding (0 = none)' } },
  { field: 'suspension_games_first', def: { type: 'number', unit: 'count', meaning: 'games the responsible person is suspended on a first finding' } },
  { field: 'suspension_games_repeat', def: { type: 'number', unit: 'count', meaning: 'games the responsible person is suspended on a repeat finding' } },
  { field: 'practice_cancel', def: { type: 'option', options: [...PRACTICE_CANCEL], meaning: 'practice taken from the club on a finding' } },
  { field: 'probation_years', def: { type: 'number', unit: 'count', meaning: 'years of program probation on a major finding' } },
  { field: 'show_cause_years', def: { type: 'number', unit: 'count', meaning: 'years of show-cause order on the responsible person on a major finding' } },
];

/** Default tier ladder for classes whose penalty keys are empty (L8.2.5). */
export const TIERS = ['warning', 'fine_tier_1', 'fine_tier_2', 'fine_tier_3', 'suspension', 'pick'] as const;
export type Tier = (typeof TIERS)[number];

export const K = {
  detectWindowYears: 'compliance.detect_window_years',
  unionVisitsPerYear: 'compliance.union_visits_per_year',
  cooperationReducesTier: 'compliance.cooperation_reduces_tier',
  headCoachResponsible: 'compliance.head_coach_responsible',
  tierCents: (t: Tier) => `compliance.default_tier.${t}_cents`,
  classField: (classId: string, field: string) => `compliance.${classId}.${field}`,
} as const;

function def(key: string, d: Omit<RuleKeyDef, 'key' | 'ownerLeaf' | 'readBy'>, ownerLeaf: string): RuleKeyDef {
  return { key, ...d, ownerLeaf, readBy: [MODULE] };
}

function build(): RuleKeyDef[] {
  const out: RuleKeyDef[] = [
    def(K.detectWindowYears, { type: 'number', unit: 'count', meaning: 'years a violation stays detectable (L8.2.5 starting 5; T9.5.1 rule 4 college 4)' }, 'L8.2.5'),
    def(K.unionVisitsPerYear, { type: 'number', unit: 'count', meaning: 'unannounced union facility visits per club per year; a visit in the week of a work-rule violation finds it (C11.2.4 rule 1)' }, 'C11.2.4'),
    def(K.cooperationReducesTier, { type: 'boolean', meaning: 'cooperation and self-reporting lower the penalty one tier (L8.2.5)' }, 'L8.2.5'),
    def(K.headCoachResponsible, { type: 'boolean', meaning: 'the head coach is charged for violations by staff who report to him, known or not (T9.5.1 rule 5, Bylaw 11.1.1.1)' }, 'T9.5.1'),
  ];
  for (const t of TIERS) if (t.startsWith('fine')) out.push(def(K.tierCents(t), { type: 'number', unit: 'cents', meaning: `amount of default ${t.replace(/_/g, ' ')}; absent shows "league default"` }, 'L8.2.5'));
  for (const c of CLASSES) for (const f of PENALTY_FIELDS) out.push(def(K.classField(c.id, f.field), f.def, c.ownerLeaf));
  return out;
}

/** Every rule key the compliance module reads (D-19). G-10 supplies the values and their fact rows. */
export const RULE_KEYS: RuleKeyManifest = build();
