// @gm/app-services, cap sheet read model (team.cap): contracts, proration, dead money and the cost of
// every release or trade for a pro club (C6), and the player-pay budget for a college program (T7).
export { PARAMS, RULE_KEYS, capKey } from './params.ts';
export * from './types.ts';
export { buildProCapView, provenanceOf, type ProCapInput, type SheetContract, type PlayerCard } from './model.ts';
export { buildCollegeBudgetView, type CollegeBudgetInput } from './college.ts';
