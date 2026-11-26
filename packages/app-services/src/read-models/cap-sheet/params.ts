// Tuning constants and rule keys of the cap sheet (team.cap, C6, T7). No real-world number lives here:
// the cap, minimums, proration limit, June 1 designations, rookie lengths and the college revenue share
// cap all come from the league-rules file through the G-16 cap module and the college module, each
// value carrying its fact row. The values below are display choices.
import type { ParamFile, RuleKeyManifest } from '@gm/schema';

export const PARAMS: ParamFile = {
  module: 'app-services.cap-sheet',
  version: 'cap-sheet.1',
  params: [
    {
      name: 'cap_sheet.horizon_years', value: 5, min: 1, max: 10, unit: 'years', belongsTo: 'C6.2.1',
      basis: 'assumption', leaf: 'O4.2.2',
      constrainedBy: 'test cap-sheet/model: the year columns cover a five-year contract (the proration limit) from the current year',
      status: 'starting',
    },
  ],
};

export function param(name: string): number {
  const p = PARAMS.params.find((x) => x.name === name);
  if (!p) throw new Error(`cap-sheet: unknown parameter ${name}`);
  return p.value;
}

/** Rule keys this read model reads itself; the cap module's own RULE_KEYS cover the charges. */
export const RULE_KEYS: RuleKeyManifest = [
  {
    key: 'cap.june1_designations', type: 'number', unit: 'count',
    meaning: 'June 1 designations a club may make in a league year; the sheet shows how many are left (C6.3.2 rule 3).',
    ownerLeaf: 'C6.3.2', readBy: ['app-services.cap-sheet'],
  },
  {
    key: 'cap.top_n_contracts', type: 'number', unit: 'count',
    meaning: 'Contracts counted in full in the offseason; the sheet marks which ones count (C6.2.1 rule 2).',
    ownerLeaf: 'C6.2.1', readBy: ['app-services.cap-sheet'],
  },
];

/** The cap amount key of a league year (G-10 naming: `cap.amount_<year>`). */
export const capKey = (leagueYear: number): string => `cap.amount_${leagueYear}`;
