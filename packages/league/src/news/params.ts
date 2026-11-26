// Tuning constants and rule keys of the news module (G-44; X12.2, C10). Source in this package holds
// no number other than 0 and 1 (P1.1.2): every number is in ./params.json with its leaf and basis.
import { ParamFile, type RuleKeyManifest } from '@gm/schema';
import file from './params.json' with { type: 'json' };

export const PARAMS: ParamFile = ParamFile.parse(file);
const PREFIX = `${PARAMS.module}.`;
const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(PREFIX.length), p.value]));

/** Reads a news constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown news parameter ${name}`);
  return v;
}

const READ_BY = ['league.news'];
/**
 * League-rules keys this module reads (C10 header: `league_rules.news`). Neither is in the G-10 rule set
 * yet; until they are, the wire uses the param `transactionDeadlineMinute` and treats a missing injury
 * report key as "no league-wide report". Requested from the integrator and G-10.
 */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'news.transaction_deadline_minute', type: 'number', unit: 'minutes', meaning: 'Daily transaction deadline, minutes after midnight New York time; moves made by it appear on that evening\'s wire (C10.1.1 rule 3).', ownerLeaf: 'C10.1.1', readBy: READ_BY },
  { key: 'injury_report.league_wide', type: 'boolean', meaning: 'The competition requires a league-wide practice and game status report (C10.2.1 rules 1 and 5; college default off).', ownerLeaf: 'C10.2.1', readBy: READ_BY },
];

/** Rule lookup handed in by the caller (league-rules files, G-10). */
export type NewsRuleLookup = (key: string) => number | boolean | undefined;

/** Minute of the daily transaction deadline: the rule key when the competition has it, else the param. */
export function transactionDeadline(rules?: NewsRuleLookup): number {
  const v = rules?.('news.transaction_deadline_minute');
  return typeof v === 'number' ? v : param('transactionDeadlineMinute');
}
