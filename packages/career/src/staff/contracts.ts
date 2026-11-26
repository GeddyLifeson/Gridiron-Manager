// Assistant contracts and the staff budget (L4.2.5, L4.1.4). Contract terms are data with a rules block
// (StaffContractRules) that research can replace; L4.2.5 has no source for assistant terms, so every
// screen shows `ASSISTANT_TERMS_UNVERIFIED` (L4.2.5 acceptance). Defaults: one to three years, fully
// guaranteed, with offset when he takes another job (the head coach structure applied to assistants,
// Assumption). Pay is never compared to the player cap (coach pay is outside it, L4.1.4, 1 of 3).
import { param } from './params.ts';
import type { Offer } from './hiring.ts';

export const ASSISTANT_TERMS_UNVERIFIED = true as const;

export interface StaffContractRules {
  readonly minYears: number;
  readonly maxYears: number;
  readonly guaranteed: boolean;
  readonly offset: boolean;
}

export function defaultContractRules(): StaffContractRules {
  return { minYears: param('contract.minYears'), maxYears: param('contract.maxYears'), guaranteed: true, offset: true };
}

export interface AssistantContract {
  readonly personId: number;
  readonly seatId: number;
  readonly firstYear: number;
  readonly years: number;
  readonly salaryCents: number;
  readonly guaranteed: boolean;
  readonly offset: boolean;
  readonly titleKey: string;
  readonly promiseIds: readonly number[];
}

export const lastYear = (c: AssistantContract): number => c.firstYear + c.years - 1;

/** L4.2.5 power arrangement (L5.2.1): where the GM or owner signs staff, the head coach recommends. */
export type StaffSigner = 'head_coach' | 'general_manager' | 'owner';
export const offerMode = (signer: StaffSigner): 'offer' | 'recommend' => (signer === 'head_coach' ? 'offer' : 'recommend');

/** Salaries owed in a league year by active contracts. */
export function payroll(contracts: readonly AssistantContract[], year: number): number {
  return contracts.filter((c) => c.firstYear <= year && year <= lastYear(c)).reduce((s, c) => s + c.salaryCents, 0);
}

export interface BudgetLine { readonly budgetCents: number; readonly usedCents: number; readonly leftCents: number; readonly headcount: number }

export function budgetLine(contracts: readonly AssistantContract[], budgetCents: number, year: number): BudgetLine {
  const active = contracts.filter((c) => c.firstYear <= year && year <= lastYear(c));
  const used = payroll(active, year);
  return { budgetCents, usedCents: used, leftCents: budgetCents - used, headcount: active.length };
}

/** Problems with an offer before it goes out. Total salaries never exceed the budget (L4.1.4 acceptance). */
export function offerProblems(o: Offer, contracts: readonly AssistantContract[], budgetCents: number, year: number, rules: StaffContractRules = defaultContractRules()): string[] {
  const out: string[] = [];
  if (o.years < rules.minYears || o.years > rules.maxYears) out.push(`years ${o.years} outside ${rules.minYears} to ${rules.maxYears} (L4.2.5)`);
  if (o.salaryCents < 0) out.push('negative salary');
  for (let y = year; y < year + o.years; y += 1) if (payroll(contracts, y) + o.salaryCents > budgetCents) out.push(`league year ${y}: over the staff budget (L4.1.4)`);
  return out;
}

export function signContract(o: Offer, personId: number, year: number, promiseIds: readonly number[], rules: StaffContractRules = defaultContractRules()): AssistantContract {
  return { personId, seatId: o.seatId, firstYear: year, years: o.years, salaryCents: o.salaryCents, guaranteed: rules.guaranteed, offset: rules.offset, titleKey: o.titleKey, promiseIds };
}

/**
 * Dead staff money when a contract is cut in `year` (L4.4.2, to the owner's ledger L5.1.5): the guaranteed
 * remainder from `year` on, less what his next job pays in those years when offset applies.
 */
export function releaseCost(c: AssistantContract, year: number, newSalaryCentsPerYear = 0): number {
  if (!c.guaranteed) return 0;
  let owed = 0;
  for (let y = Math.max(year, c.firstYear); y <= lastYear(c); y += 1) owed += Math.max(0, c.salaryCents - (c.offset ? newSalaryCentsPerYear : 0));
  return owed;
}

/** An assistant whose contract has ended is free to leave with no permission needed (L4.2.5 edge case). */
export const underContract = (c: AssistantContract | undefined, year: number): boolean => c !== undefined && year <= lastYear(c);

/** The inherited staff a new head coach sees, contract ends first (L4.2.5). */
export function inheritedStaff(contracts: readonly AssistantContract[], year: number): readonly { personId: number; seatId: number; endsAfter: number; remainingCents: number }[] {
  return contracts.filter((c) => year <= lastYear(c))
    .map((c) => ({ personId: c.personId, seatId: c.seatId, endsAfter: lastYear(c), remainingCents: releaseCost(c, year) }))
    .sort((a, b) => a.endsAfter - b.endsAfter || a.seatId - b.seatId);
}
