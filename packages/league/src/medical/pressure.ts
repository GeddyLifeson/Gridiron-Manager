// Pressure and its cost (D11.3.3, H5.3.1 rule 3): asking the trainer "can he go?", asking the player
// "can you give me a quarter?", overriding a snap cap. Always available to the user and AI, with no
// switch. Pressure never changes a concussion state or a structural "not cleared"; playing him anyway is
// the separate breakable act in authority.ts.
import { possible, type RandomStream } from '@gm/schema';
import { P } from './params.ts';
import type { MedicalCase } from './types.ts';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export type PressureKind = 'ask_trainer' | 'ask_player' | 'override_snap_cap' | 'ask_injection' | 'ask_delay_surgery';

/** Hidden log row (never a counter shown to the user, audit Part 17); N3 records the decision. */
export interface PressureLogRow { readonly caseId: number; readonly personId: number; readonly kind: PressureKind; readonly day: number }

export interface TrustChange { readonly medicalStaff: number; readonly player: number; readonly room: number }

/** Chance the player agrees to play before full recovery: toughness, trust in the coach, contract year. */
export function agreeChance(toughness: number, trust: number, contractYear: boolean): number {
  return possible(P('agreeBase') + P('agreeToughnessWeight') * clamp01(toughness) + P('agreeTrustWeight') * clamp01(trust) + (contractYear ? P('agreeContractYearBonus') : 0));
}

export interface PressureResult {
  readonly case: MedicalCase;
  readonly log: PressureLogRow;
  /** Did the pressure move anything (the player agreed, or the doctors' bar moved)? */
  readonly effective: boolean;
  readonly trust: TrustChange;
}

/**
 * Apply one use of pressure. Leaning on the trainer or doctors marks the case so the physician's bar for
 * "cleared with limits" drops a little (authority.physicianState), never for a concussion or a structural
 * injury. Asking the player succeeds by `agreeChance`. Every use costs medical-staff trust.
 */
export function applyPressure(c: MedicalCase, kind: PressureKind, day: number, who: { toughness: number; trust: number; contractYear: boolean }, s: RandomStream): PressureResult {
  const agrees = s.chance(possible(agreeChance(who.toughness, who.trust, who.contractYear)));
  const doctorsMovable = !c.protocol && !c.structural;
  const effective = kind === 'ask_trainer' ? doctorsMovable : kind === 'ask_player' ? agrees : kind === 'override_snap_cap';
  const next: MedicalCase = {
    ...c,
    pressureUses: c.pressureUses + 1,
    doctorsPressed: c.doctorsPressed || (kind === 'ask_trainer' && doctorsMovable),
  };
  return { case: next, log: { caseId: c.id, personId: c.personId, kind, day }, effective, trust: { medicalStaff: -P('medicalTrustCost'), player: 0, room: 0 } };
}

/** After a pressured return goes wrong: trust falls for the player and, at lower weight, for the room. */
export function badOutcomeTrust(c: MedicalCase): TrustChange {
  if (c.pressureUses === 0) return { medicalStaff: 0, player: 0, room: 0 };
  return { medicalStaff: 0, player: -P('playerTrustCostBadOutcome'), room: -P('roomTrustCostBadOutcome') };
}
