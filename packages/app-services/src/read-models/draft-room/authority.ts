// Who decides a front office field for the user's club (L5.2.1 `power`, ruling 2026-11-25: the user
// controls exactly what a real head coach controls in that job). Shared by the draft room and the free
// agency screens. With final say the user's choice is the decision; delegated, the personnel man decides
// and the user owns the result; without final say the user's action is a request to whoever holds it.
import { gm } from '@gm/front-office';

export type Authority =
  /** The user holds the field and decides himself. */
  | 'decide'
  /** The user holds the field and handed it to his personnel man for now (L5.2.1: he owns the result). */
  | 'delegated'
  /** Someone else holds the field: the user mentions, recommends, insists or stays silent (M3.6.2). */
  | 'advise';

export interface AuthorityView {
  readonly field: gm.PowerField;
  readonly authority: Authority;
  /** Who holds the field (L5.2.1 arrangement). */
  readonly holder: gm.Holder;
}

/** Reads the L5.2.1 `power` record for one field, the way `gm.route` files decisions. */
export function authorityFor(power: gm.Power, field: gm.PowerField): AuthorityView {
  const holder = power.holders[field];
  const users = power.userIsHeadCoach && holder === 'head_coach';
  const authority: Authority = !users ? 'advise' : power.delegated.has(field) ? 'delegated' : 'decide';
  return { field, authority, holder };
}
