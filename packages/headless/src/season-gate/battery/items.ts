// The decision-response battery items (Q3.2). The list is data transcribed from the bible tables
// (items.json); nothing here decides football. Items are never deleted: a retired or suspended item
// keeps its id and its row in the report (Q3.3.1).
import raw from './items.json' with { type: 'json' };

export type AssertionKind = 'sign' | 'ordering' | 'band';
export type ItemState = 'active' | 'pending_measurement' | 'suspended' | 'retired';

export interface BatteryItem {
  readonly id: string;
  /** Bible leaf that lists the item (Q3.2.1 to Q3.2.6). */
  readonly leaf: string;
  readonly topic: string;
  readonly claim: string;
  readonly kind: AssertionKind;
  /** Q3.1.2: data-based or convention-based. */
  readonly basis: 'data' | 'convention';
  /** Register status of the basis as the bible row states it, or `convention`, or `rule arithmetic`. */
  readonly basisStatus: string;
  readonly basisText: string;
  /** A coach reviewer has signed a convention-based item (Q5.1.1). None exist yet (Q5.6.1). */
  readonly coachReviewed: boolean;
  readonly state: ItemState;
  readonly stateReason?: string;
  readonly ruleSets: readonly string[];
}

export const BATTERY_ITEMS: readonly BatteryItem[] = raw.items as BatteryItem[];

export function itemProblems(items: readonly BatteryItem[] = BATTERY_ITEMS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) out.push(`${it.id}: id used twice`);
    seen.add(it.id);
    // Q3.1.2 acceptance: every item has a basis, a basis status and a kind.
    if (!it.basisText) out.push(`${it.id}: no basis`);
    if (!it.basisStatus) out.push(`${it.id}: no basis status`);
    if (!['sign', 'ordering', 'band'].includes(it.kind)) out.push(`${it.id}: kind ${String(it.kind)}`);
    if (it.basis === 'convention' && it.kind === 'band') out.push(`${it.id}: a convention-based item may only assert a sign or an ordering (Q3.1.2)`);
    if (it.state !== 'active' && !it.stateReason) out.push(`${it.id}: state ${it.state} needs a reason`);
    if (it.ruleSets.length === 0) out.push(`${it.id}: names no rule set`);
  }
  return out;
}
