// Storage codec between a profile and the person record. The world contract stores the K2 numbers in
// `coaching.hidden` (a truth map of string to number, P3.2.2, W-07), which is refused on the user's
// person (E9.5.2). Strings (families, playbook, side, role, league), memory and lineage do not fit a
// number map: they travel in `CoachProfileRest` until the integrator gives them a home (contract
// request CR-G26-1 in DECISIONS.md).
import { BEHAVIOR_KEYS, DEFENSE_RATE_KEYS, OFFENSE_RATE_KEYS, PERSONNEL_KEYS, TENDENCY_KEYS } from './keys.ts';
import type { BehaviorBlock, CoachProfile, DefenseRates, OffenseRates, PersonnelKey, TendencyBlock } from './types.ts';

export type CoachProfileRest = Omit<CoachProfile, 'tendencies' | 'behavior' | 'system'> & {
  system: Pick<CoachProfile['system'], 'primarySide' | 'offenseFamily' | 'defenseFamily' | 'specialTeamsFamily' | 'playbookId'>;
};

/** Numeric part of a profile as the `coaching.hidden` map. Keys are stable dotted paths. */
export function toHiddenMap(p: CoachProfile): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of OFFENSE_RATE_KEYS) out[`system.offenseRates.${k}`] = p.system.offenseRates[k];
  for (const k of DEFENSE_RATE_KEYS) out[`system.defenseRates.${k}`] = p.system.defenseRates[k];
  for (const k of PERSONNEL_KEYS) out[`system.personnelWeights.${k}`] = p.system.personnelWeights[k];
  out['system.tempoBase.noHuddleShare'] = p.system.tempoBase.noHuddleShare;
  out['system.tempoBase.snapAtPlayClockS'] = p.system.tempoBase.snapAtPlayClockS;
  out['system.sheetSize.offenseCalls'] = p.system.sheetSize.offenseCalls;
  out['system.sheetSize.defenseCalls'] = p.system.sheetSize.defenseCalls;
  for (const k of TENDENCY_KEYS) out[`tendencies.${k}`] = p.tendencies[k];
  for (const k of BEHAVIOR_KEYS) out[`behavior.${k}`] = p.behavior[k];
  return out;
}

export function restOf(p: CoachProfile): CoachProfileRest {
  const { tendencies: _t, behavior: _b, system, ...rest } = p;
  return { ...rest, system: { primarySide: system.primarySide, offenseFamily: system.offenseFamily, defenseFamily: system.defenseFamily, specialTeamsFamily: system.specialTeamsFamily, playbookId: system.playbookId } };
}

function need(m: Readonly<Record<string, number>>, k: string): number {
  const v = m[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`coaching.hidden lacks ${k}`);
  return v;
}

/** Inverse of `toHiddenMap` plus `restOf`. Lossless for any valid profile. */
export function fromHiddenMap(m: Readonly<Record<string, number>>, rest: CoachProfileRest): CoachProfile {
  const offenseRates = {} as OffenseRates;
  for (const k of OFFENSE_RATE_KEYS) offenseRates[k] = need(m, `system.offenseRates.${k}`);
  const defenseRates = {} as DefenseRates;
  for (const k of DEFENSE_RATE_KEYS) defenseRates[k] = need(m, `system.defenseRates.${k}`);
  const personnelWeights = {} as Record<PersonnelKey, number>;
  for (const k of PERSONNEL_KEYS) personnelWeights[k] = need(m, `system.personnelWeights.${k}`);
  const tendencies = {} as TendencyBlock;
  for (const k of TENDENCY_KEYS) tendencies[k] = need(m, `tendencies.${k}`);
  const behavior = {} as BehaviorBlock;
  for (const k of BEHAVIOR_KEYS) behavior[k] = need(m, `behavior.${k}`);
  const noHuddle = need(m, 'system.tempoBase.noHuddleShare');
  return {
    ...rest,
    system: {
      ...rest.system,
      personnelWeights,
      tempoBase: { huddleShare: 1 - noHuddle, noHuddleShare: noHuddle, snapAtPlayClockS: need(m, 'system.tempoBase.snapAtPlayClockS') },
      offenseRates,
      defenseRates,
      sheetSize: { offenseCalls: need(m, 'system.sheetSize.offenseCalls'), defenseCalls: need(m, 'system.sheetSize.defenseCalls') },
    },
    tendencies,
    behavior,
  };
}
