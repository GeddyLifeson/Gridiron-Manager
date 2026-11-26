// Vouching (X7.4.2): a trusted third person stands in for knowledge the decider lacks.
import type { WorldDate } from '@gm/schema';
import { sideOf, type Tie } from './edges.ts';
import type { TieStore } from './create.ts';
import { rp } from './params.ts';

export interface VouchInput {
  readonly voucherId: number;
  readonly deciderId: number;
  readonly candidateId: number;
  /** The voucher's own opinion of the candidate (his X2.3.1 view), -1 to +1. */
  readonly opinion: number;
  /** True when the voucher is protected: he vouches only in the neutral "worked together at" form. */
  readonly voucherProtected: boolean;
  readonly date: WorldDate;
}

/** A request for the history log to emit `vouched_for`, and the impression it leaves in the decider's view. */
export interface VouchResult {
  readonly event: { readonly type: 'vouched_for'; readonly voucherId: number; readonly deciderId: number; readonly candidateId: number; readonly form: 'opinion' | 'neutral'; readonly date: WorldDate };
  /** Weight of the impression added to the decider's view of the candidate. Negative when the voucher is cold to the decider. */
  readonly impression: number;
}

/** The decider's strongest side toward the voucher, across every tie the two share. */
export function deciderSide(store: TieStore, deciderId: number, voucherId: number): { strength: number; cold: boolean } {
  let strength = 0;
  let cold = false;
  for (const t of store.between(deciderId, voucherId)) {
    const s = sideOf(t, deciderId);
    if (!s) continue;
    if (s.sign === 'cold') cold = true;
    if (s.strength > strength) strength = s.strength;
  }
  return { strength, cold };
}

/**
 * Vouch (X7.4.2): impression weight = decider's edge strength to the voucher times 0.01 times the voucher's
 * opinion. A voucher the decider is cold to lowers the candidate's standing whatever he says (edge case).
 * A protected voucher gives only the neutral form, which carries no opinion.
 */
export function vouch(store: TieStore, v: VouchInput): VouchResult {
  const form = v.voucherProtected ? 'neutral' : 'opinion';
  const side = deciderSide(store, v.deciderId, v.voucherId);
  const opinion = v.voucherProtected ? 0 : Math.max(-1, Math.min(1, v.opinion));
  const base = side.strength * rp('vouch.weightPerPoint');
  const impression = side.cold ? -base * (v.voucherProtected ? 0 : Math.abs(opinion)) : base * opinion;
  return {
    event: { type: 'vouched_for', voucherId: v.voucherId, deciderId: v.deciderId, candidateId: v.candidateId, form, date: v.date },
    impression,
  };
}

/**
 * Settle a vouch when the candidate's fate is known (X7.4.2): fired within 2 seasons costs the decider's
 * ties to the voucher 10; promoted adds 5. Returns the change applied to the decider's side.
 */
export function settleVouch(store: TieStore, deciderId: number, voucherId: number, outcome: 'fired' | 'promoted', seasonsAfter: number): number {
  if (outcome === 'fired' && seasonsAfter > rp('vouch.firedWithinSeasons')) return 0;
  const amount = outcome === 'fired' ? -rp('vouch.firedCost') : rp('vouch.promotedGain');
  let moved = 0;
  const ties: Tie[] = store.between(deciderId, voucherId);
  for (const t of ties) {
    const s = sideOf(t, deciderId);
    if (!s) continue;
    const before = s.strength;
    s.strength = Math.max(0, Math.min(rp('edge.strength.max'), s.strength + amount));
    if (s.strength > s.peak) s.peak = s.strength;
    moved += s.strength - before;
  }
  return moved;
}
