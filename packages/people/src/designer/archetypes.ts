// Archetype table (D13.1.1 start 1; config, owner D13). An archetype is a position plus a lean: body
// shifts in standard deviations of the position profile (D13.2.2) and technique-group shifts in ISS.
// Every lean is an Assumption: no source defines "possession receiver" in numbers. The table is written
// as relative leans and then centred per position, so a class drawn evenly across a position's archetypes
// keeps the position profile's means. That is what lets designed classes pass the same drift guards as
// generated ones (D13.4.5; G-92 acceptance).
import { GROUPS, profileOf, type ProfilePosition } from '../generator/catalogue.ts';
import { PROFILE_VARS, type ProfileVar } from '../generator/profiles.ts';
import { param } from './params.ts';

export interface Archetype {
  readonly id: string;
  /** Profile position the archetype belongs to. */
  readonly position: ProfilePosition;
  /** Text id of the label the screen shows (`pd.arch.<id>`). */
  readonly labelId: string;
  /** Body shift per profile variable in profile sd, after centring. Times: + is slower. */
  readonly bodyShiftSd: Readonly<Partial<Record<ProfileVar, number>>>;
  /** Technique-group ceiling and current shift in ISS, after centring. */
  readonly groupShiftIss: Readonly<Record<string, number>>;
}

type Lean = { id: string; body?: Partial<Record<ProfileVar, number>>; groups?: Record<string, number> };

/** Relative leans as written. `standard` rows carry no lean of their own. */
const LEANS: Readonly<Record<ProfilePosition, readonly Lean[]>> = {
  QB: [
    { id: 'qb_pocket_passer', body: { heightIn: 0.5, weightLb: 0.3, fortyS: 0.5, verticalIn: -0.3 }, groups: { qb: 3, signal_caller: 3 } },
    { id: 'qb_dual_threat', body: { heightIn: -0.3, weightLb: -0.2, fortyS: -0.7, verticalIn: 0.5, broadIn: 0.5 }, groups: { qb: -2, carrier_universal: 6 } },
    { id: 'qb_game_manager', groups: { signal_caller: 5, qb: -1, mental: 3 } },
  ],
  RB: [
    { id: 'rb_power_back', body: { weightLb: 0.8, benchReps: 0.6, fortyS: 0.4 }, groups: { rb: 2, carrier_universal: 2 } },
    { id: 'rb_scat_back', body: { weightLb: -0.8, fortyS: -0.6, threeConeS: -0.6, shuttleS: -0.5 }, groups: { receiver: 6, returner: 6 } },
    { id: 'rb_three_down_back', groups: { rb: 2, receiver: 2 } },
  ],
  WR: [
    { id: 'wr_possession', body: { heightIn: 0.5, weightLb: 0.5, fortyS: 0.4 }, groups: { receiver: 3, carrier_universal: 3 } },
    { id: 'wr_deep_threat', body: { heightIn: -0.1, weightLb: -0.4, fortyS: -0.8, verticalIn: 0.4, broadIn: 0.4 }, groups: { receiver: 1 } },
    { id: 'wr_slot', body: { heightIn: -0.6, weightLb: -0.4, threeConeS: -0.6, shuttleS: -0.6 }, groups: { receiver: 2, returner: 5 } },
  ],
  TE: [
    { id: 'te_inline_blocker', body: { weightLb: 0.7, benchReps: 0.6, fortyS: 0.5 }, groups: { te: 5, ol_run: 5 } },
    { id: 'te_move_receiver', body: { weightLb: -0.6, fortyS: -0.6, verticalIn: 0.4 }, groups: { receiver: 8 } },
  ],
  OT: [
    { id: 'ot_pass_protector', body: { heightIn: 0.4, fortyS: -0.2, threeConeS: -0.4 }, groups: { ol_pass: 4 } },
    { id: 'ot_road_grader', body: { weightLb: 0.6, benchReps: 0.6 }, groups: { ol_run: 4 } },
  ],
  IOL: [
    { id: 'iol_zone_mover', body: { weightLb: -0.5, fortyS: -0.5, threeConeS: -0.5 }, groups: { ol_run: 2 } },
    { id: 'iol_power_anchor', body: { weightLb: 0.5, benchReps: 0.7 }, groups: { ol_pass: 2 } },
    { id: 'iol_center', groups: { snapping: 15, signal_caller: 8 } },
  ],
  DT: [
    { id: 'dt_nose_tackle', body: { weightLb: 0.9, benchReps: 0.6, fortyS: 0.5 }, groups: { idl: 2 } },
    { id: 'dt_three_technique', body: { weightLb: -0.5, fortyS: -0.5, verticalIn: 0.4 }, groups: { idl: 2, edge: 4 } },
  ],
  EDGE: [
    { id: 'edge_wide_nine_speed', body: { weightLb: -0.6, fortyS: -0.7, threeConeS: -0.5, verticalIn: 0.4 }, groups: { edge: 3 } },
    { id: 'edge_power_end', body: { weightLb: 0.6, benchReps: 0.6, fortyS: 0.3 }, groups: { edge: 1, idl: 5 } },
    { id: 'edge_stand_up_backer', body: { weightLb: -0.3, fortyS: -0.3 }, groups: { lb: 6, coverage: 4 } },
  ],
  LB: [
    { id: 'lb_downhill_thumper', body: { weightLb: 0.6, benchReps: 0.5, fortyS: 0.3 }, groups: { lb: 3, defender_universal: 2 } },
    { id: 'lb_coverage_backer', body: { weightLb: -0.5, fortyS: -0.5, threeConeS: -0.4 }, groups: { coverage: 8 } },
    { id: 'lb_signal_caller', groups: { signal_caller: 8, mental: 3 } },
  ],
  CB: [
    { id: 'cb_press_man', body: { heightIn: 0.6, weightLb: 0.4 }, groups: { coverage: 3 } },
    { id: 'cb_zone', body: { heightIn: 0, fortyS: 0.2 }, groups: { coverage: 2, mental: 3 } },
    { id: 'cb_nickel', body: { heightIn: -0.6, weightLb: -0.3, threeConeS: -0.6, shuttleS: -0.6 }, groups: { coverage: 2, defender_universal: 4 } },
  ],
  S: [
    { id: 's_single_high', body: { fortyS: -0.5, heightIn: 0.2 }, groups: { coverage: 3 } },
    { id: 's_box_safety', body: { weightLb: 0.6, benchReps: 0.4, fortyS: 0.3 }, groups: { defender_universal: 4, lb: 5 } },
  ],
  FB: [{ id: 'fb_standard' }],
  K: [{ id: 'k_standard' }],
  P: [{ id: 'p_standard' }],
  LS: [{ id: 'ls_standard' }],
};

function centre(position: ProfilePosition, leans: readonly Lean[]): Archetype[] {
  const n = leans.length;
  const groups = Object.keys(GROUPS);
  const bodyMean: Partial<Record<ProfileVar, number>> = {};
  for (const v of PROFILE_VARS) bodyMean[v] = leans.reduce((a, l) => a + (l.body?.[v] ?? 0), 0) / n;
  const groupMean: Record<string, number> = {};
  for (const g of groups) groupMean[g] = leans.reduce((a, l) => a + (l.groups?.[g] ?? 0), 0) / n;
  const cap = param('archetypeMaxBodyShiftSd');
  return leans.map((l) => {
    const body: Partial<Record<ProfileVar, number>> = {};
    for (const v of PROFILE_VARS) {
      const s = (l.body?.[v] ?? 0) - bodyMean[v]!;
      if (Math.abs(s) > cap + 1e-9) throw new Error(`archetype ${l.id}: centred ${v} shift ${s} beyond ${cap} sd`);
      if (s !== 0) body[v] = s;
    }
    const g: Record<string, number> = {};
    for (const k of groups) {
      const s = (l.groups?.[k] ?? 0) - groupMean[k]!;
      if (s !== 0) g[k] = s;
    }
    return { id: l.id, position, labelId: `pd.arch.${l.id}`, bodyShiftSd: body, groupShiftIss: g };
  });
}

/** Every archetype, centred per position. */
export const ARCHETYPES: readonly Archetype[] = (Object.entries(LEANS) as [ProfilePosition, readonly Lean[]][])
  .flatMap(([pos, leans]) => centre(pos, leans));

const BY_ID = new Map(ARCHETYPES.map((a) => [a.id, a]));

export function archetypeById(id: string): Archetype {
  const a = BY_ID.get(id);
  if (!a) throw new Error(`unknown archetype ${id}`);
  return a;
}

/** Archetypes offered for a position code (any code the generator maps, e.g. LT or NT). */
export function archetypesFor(position: string): readonly Archetype[] {
  const p = profileOf(position);
  return ARCHETYPES.filter((a) => a.position === p);
}
