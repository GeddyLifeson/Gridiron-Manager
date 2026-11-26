// League rules the market reads. None is in the dictionary yet (CR-G80-2 to the integrator). A key absent
// from a level's rule set means the rule does not exist there (G-47 convention). Interview windows,
// permission and the diverse-interview counts are G-47's `hiring.*` keys and are not repeated here.
import type { RuleKeyManifest, RuleSet } from '@gm/schema';

const READ_BY = ['career.market'];

export const K = {
  coachTradeMode: 'hiring.coach_trade.mode',
  searchFirmShare: 'hiring.search_firm_share',
} as const;

export const COACH_TRADE_MODES = ['club_consent', 'contract_buyout'] as const;
export type CoachTradeMode = (typeof COACH_TRADE_MODES)[number];

export const RULE_KEYS: RuleKeyManifest = [
  { key: K.coachTradeMode, type: 'option', options: [...COACH_TRADE_MODES], meaning: 'How a coach under contract moves to another employer: the holding club consents for a price, or the contract buyout is paid (NEW: pro club_consent, college contract_buyout; E2.5.3, F-market-0004).', ownerLeaf: 'E2.5.3', readBy: READ_BY },
  { key: K.searchFirmShare, type: 'number', unit: 'ratio', meaning: 'Share of head coach searches run through a hired search firm (NEW: college "a little over half", F-market-0005 1 of 3; pro low, Assumption; E2.3.5).', ownerLeaf: 'E2.3.5', readBy: READ_BY },
];

export interface MarketRules {
  /** null: no rule, a coach under contract cannot be pried loose at all except by release. */
  readonly coachTradeMode: CoachTradeMode | null;
  /** null: no firm use in this world. */
  readonly searchFirmShare: number | null;
}

export function marketRules(rules: Pick<RuleSet, 'keys' | 'num' | 'opt'>): MarketRules {
  const has = new Set(rules.keys());
  const mode = has.has(K.coachTradeMode) ? rules.opt(K.coachTradeMode) : null;
  return {
    coachTradeMode: mode === null ? null : (COACH_TRADE_MODES as readonly string[]).includes(mode) ? (mode as CoachTradeMode) : null,
    searchFirmShare: has.has(K.searchFirmShare) ? rules.num(K.searchFirmShare) : null,
  };
}

export function marketRulesFrom(values: Readonly<Record<string, number | string>>): MarketRules {
  return marketRules({ keys: () => Object.keys(values), num: (k) => Number(values[k]), opt: (k) => String(values[k]) });
}
