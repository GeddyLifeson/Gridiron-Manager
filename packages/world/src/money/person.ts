// E6 personal money in the off-screen world, the part the world can ground today: what a person actually paid
// out of his own pocket (a fine the club may not repay, C11.2.4 rule 2). MO-03: no opening balance sheet is
// drawn yet. Gross pay is kept by pay.ts (`priorPay`); the sheet also needs a tax profile and cost of living
// per place and K2 money settings, which are not wired. `personalPaid` is the debit side that sheet carries.
import type { LiveWorld } from '../loop/types.ts';

/** `LiveWorld.systemState` key of personal payments. */
export const PERSON_MONEY_KEY = 'person_money';

/** One payment by a person in a league year. Positive cents leave him (E6 entry category "fine"). */
export interface PersonPayment {
  readonly personId: number;
  readonly seasonYear: number;
  readonly cents: number;
  readonly reason: string;
}

export interface PersonMoney { readonly payments: readonly PersonPayment[] }

export function personMoneyOf(world: LiveWorld): PersonMoney {
  return (world.systemState.get(PERSON_MONEY_KEY) as PersonMoney | undefined) ?? { payments: [] };
}

export function chargePerson(world: LiveWorld, p: PersonPayment): void {
  const m = personMoneyOf(world);
  world.systemState.set(PERSON_MONEY_KEY, { payments: [...m.payments, p] });
}

/** What a person has paid out of pocket, in one league year or (no year) over his life. */
export function personalPaid(world: LiveWorld, personId: number, seasonYear?: number): number {
  return personMoneyOf(world).payments
    .filter((p) => p.personId === personId && (seasonYear === undefined || p.seasonYear === seasonYear))
    .reduce((a, p) => a + p.cents, 0);
}
