// The week as a bill (plans/head-coach-nuance.md item 4; E7 ledger, L5.3.1, H7, L7). Every week the head coach
// has more work than hours. Asks arrive uninvited from the owner, the media, an agent, the community, his staff:
// each yes costs hours, each no costs standing with someone, sending someone in his place costs part of it.
// Work he neither does nor hands to someone leaves a dated debt that falls due weeks later: a room he never met
// slips, a plan he did not review has a hole on game day. Work he hands to staff is done at their level, and
// checking it costs him a share of the hours (E7.3.2). Work he does himself is done at his level, worn down by
// overwork past the heavy band (E7.4.2, E8.1.1).
//
// Pure core: the caller passes what the week holds; nothing here draws.
import { param } from './params.ts';

export type AskFrom = 'owner' | 'media' | 'agent' | 'community' | 'staff' | 'player';
export type AskAnswer = 'yes' | 'no' | 'send_someone';

export interface Ask {
  readonly id: string;
  readonly from: AskFrom;
  /** The person asking (standing moves with him). */
  readonly personId: number;
  readonly hours: number;
  /** Standing with the asker that a no puts at stake, points. */
  readonly atStake: number;
}

export interface AskResult {
  readonly askId: string;
  readonly coachHours: number;
  readonly sentHours: number;
  /** Change in standing with the asker, points. */
  readonly standing: number;
}

/** What one answer costs: hours for a yes, standing for a no, part of each for sending someone. */
export function answerAsk(a: Ask, answer: AskAnswer): AskResult {
  const scale = a.from === 'owner' ? param('ask.ownerScale') : 1;
  if (answer === 'yes') return { askId: a.id, coachHours: a.hours, sentHours: 0, standing: param('ask.yesStanding') };
  if (answer === 'no') return { askId: a.id, coachHours: 0, sentHours: 0, standing: -a.atStake * param('ask.noShare') * scale };
  return { askId: a.id, coachHours: 0, sentHours: a.hours, standing: -a.atStake * param('ask.delegateShare') * scale };
}

export type BlockKind = 'room' | 'plan' | 'people';

/** A block of the week's work: meeting a position room, reviewing the plan, a one-on-one. */
export interface WorkBlock {
  readonly id: string;
  readonly kind: BlockKind;
  /** The room, plan or person the block is about. */
  readonly aboutId: number;
  readonly hours: number;
}

export type BlockChoice = { readonly by: 'self' } | { readonly by: 'staff'; readonly quality: number } | { readonly by: 'skip' };

export interface Debt {
  readonly blockId: string;
  readonly kind: BlockKind;
  readonly aboutId: number;
  readonly incurredWeek: number;
  readonly dueWeek: number;
  readonly size: number;
}

/** The dated debt a skipped block leaves (or a block staff did below full quality leaves in part). */
export function debtOf(b: WorkBlock, week: number, shortfall = 1): Debt {
  return { blockId: b.id, kind: b.kind, aboutId: b.aboutId, incurredWeek: week, dueWeek: week + param(`debt.lagWeeks.${b.kind}`), size: b.hours * param('debt.perHour') * shortfall };
}

/** Debts that fall due in a week, and the ones still waiting. */
export function dueIn(debts: readonly Debt[], week: number): { due: Debt[]; waiting: Debt[] } {
  const due: Debt[] = [], waiting: Debt[] = [];
  for (const d of debts) (d.dueWeek <= week ? due : waiting).push(d);
  return { due, waiting };
}

/** Quality left after overwork: everything he does himself is worse past the heavy band (E7.4.2, E8.1.1). */
export function overloadFactor(workHours: number): number {
  const over = workHours - param('loadBand.heavy');
  return over > 0 ? Math.max(0, 1 - over * param('bill.overloadPerHour')) : 1;
}

export interface WeekBill {
  /** Hours the head coach worked: base hours, blocks he did, checking delegated blocks, asks he said yes to. */
  readonly workHours: number;
  /** Quality of each block done, 0 to 1 (skipped blocks are 0). */
  readonly quality: Readonly<Record<string, number>>;
  readonly debts: readonly Debt[];
  readonly standing: readonly AskResult[];
}

/**
 * The bill for a week: what he chose for each block and each ask. `strength` is his own level at each kind of
 * block (0 to 1, from his demonstrated record, never a stored skill), `baseHours` the fixed work of the week.
 */
export function billWeek(o: {
  readonly week: number;
  readonly baseHours: number;
  readonly blocks: readonly WorkBlock[];
  readonly choices: Readonly<Record<string, BlockChoice>>;
  readonly strength: Readonly<Record<BlockKind, number>>;
  readonly asks?: readonly Ask[];
  readonly answers?: Readonly<Record<string, AskAnswer>>;
}): WeekBill {
  const standing = (o.asks ?? []).map((a) => answerAsk(a, o.answers?.[a.id] ?? 'no'));
  let hours = o.baseHours;
  for (const s of standing) hours += s.coachHours;
  for (const b of o.blocks) {
    const c = o.choices[b.id] ?? { by: 'skip' };
    if (c.by === 'self') hours += b.hours;
    else if (c.by === 'staff') hours += b.hours * param('bill.reviewShare');
  }
  const worn = overloadFactor(hours);
  const quality: Record<string, number> = {};
  const debts: Debt[] = [];
  for (const b of o.blocks) {
    const c = o.choices[b.id] ?? { by: 'skip' };
    const q = c.by === 'self' ? o.strength[b.kind] * worn : c.by === 'staff' ? Math.min(1, Math.max(0, c.quality)) : 0;
    quality[b.id] = q;
    if (q < 1) debts.push(debtOf(b, o.week, 1 - q));
  }
  return { workHours: hours, quality, debts, standing };
}
