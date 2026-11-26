// Who decides (L5.2.1 `power`, Marlon 2026-11-25 22:23: authority follows the job). The same procedures run
// for every club. Where the user holds the field and has not delegated it, their output is a proposal with
// its reason, and nothing is filed without his decision (K7.3.1, K7.4.5 acceptance). Where an AI head coach
// holds the field he decides with these procedures and his own record (K7.1.1 rule 3).
import { P } from './params.ts';
import type { PowerField } from './types.ts';

export type Holder = 'general_manager' | 'head_coach' | 'owner' | 'executive';

export interface Power { readonly holders: Readonly<Record<PowerField, Holder>>; readonly userIsHeadCoach: boolean; readonly delegated: ReadonlySet<PowerField> }

export type Routed<T> =
  | { readonly mode: 'act'; readonly decision: T; readonly decidedBy: Holder; readonly delegatedByUser: boolean }
  | { readonly mode: 'propose'; readonly option: T; readonly reason: string };

/** A decision is filed, or handed to the user as his personnel man's proposal. `reason` is a text key. */
export function route<T>(field: PowerField, power: Power, decision: T, reason: string): Routed<T> {
  const holder = power.holders[field];
  const usersCall = power.userIsHeadCoach && holder === 'head_coach';
  if (usersCall && !power.delegated.has(field)) return { mode: 'propose', option: decision, reason };
  return { mode: 'act', decision, decidedBy: holder, delegatedByUser: usersCall };
}

/** L5.2.1: the personnel man objects when the user's choice is worth clearly less than his own, by his valuation. */
export function objects(ownChoiceWorth: number, userChoiceWorth: number): boolean {
  return ownChoiceWorth - userChoiceWorth > P('authority.objectMargin') * Math.max(Math.abs(ownChoiceWorth), P('authority.objectFloor'));
}
