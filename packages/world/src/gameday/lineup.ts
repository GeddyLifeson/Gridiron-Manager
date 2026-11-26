// Off-screen game-day lineups (M2 depth chart, I1.2 dress list) for the world's games: which of a club's
// own people stand in each unit slot of the real game. The real game's content port (season/tick-content.ts)
// fixes each unit's eleven role slots in order (OFFENSE_ROLES, DEFENSE_ROLES, KICK_ROLES, RETURN_ROLES); this
// file fills them from the club's roster.
//
// The coach picks from what his staff sees (K9 rule 2): the order inside a position is his staff's observed
// grade (turnover gradeContext, D6.4.2), passed in as `gradeOf`, never the truth. Who may stand in a slot is
// the position table below.
//
// Every table here is an ASSUMPTION (A5.2.1): F1 position families as a coach would fill a base 4-3 / 11
// personnel depth chart, with the usual special-teams habit of using backups on coverage units. Listed in
// README.md. Pure: a function of the roster, the grades and the out list.
import type { KickKind } from '@gm/schema';

/** Positions that may fill a slot, best fit first. A position not listed may not stand there. */
export type SlotFit = readonly string[];

const OT = ['T', 'G', 'C'], OG = ['G', 'T', 'C'], OC = ['C', 'G', 'T'];
const QB = ['QB'], RB = ['RB', 'FB', 'WR'], FB = ['FB', 'RB', 'TE'], WR = ['WR', 'TE', 'RB'], TE = ['TE', 'FB', 'T'];
const DE = ['DE', 'OLB', 'DT'], DT = ['DT', 'NT', 'DE'], MIKE = ['MLB', 'ILB', 'OLB'], WILL = ['ILB', 'OLB', 'MLB'], SAM = ['OLB', 'ILB', 'DE'];
const CB = ['CB', 'FS', 'SS'], SS = ['SS', 'FS', 'CB'], FS = ['FS', 'SS', 'CB'];
/** Coverage and blocking bodies on kick units: backups of the run-and-hit positions. */
const CORE = ['OLB', 'ILB', 'MLB', 'SS', 'FS', 'CB', 'RB', 'FB', 'TE', 'WR'];
/** Kick-unit linemen wear ineligible numbers (B2.3.1 bands, the placeholder's 67, 68, 77, 78): linemen of either side. */
const KICK_LINE = ['G', 'T', 'C', 'DE', 'DT', 'NT'];
const RETURNER = ['WR', 'CB', 'RB', 'FS', 'SS'];
/**
 * Kick-unit ends and backs stand where the numbering rule wants eligible numbers (B4.2.1 item 4, 0-49 and
 * 80-89): positions whose band hands such numbers (team.ts JERSEY_BANDS), never linemen or linebackers.
 */
const KICK_END = ['TE', 'WR', 'FB', 'RB', 'SS', 'FS', 'CB'];
const KICK_BACK = ['FB', 'RB', 'TE', 'SS', 'FS', 'CB', 'WR'];

/** One unit's eleven slots in the content port's role order. `bench` prefers players who do not start on offense or defense. */
export interface UnitPlan { readonly slots: readonly SlotFit[]; readonly bench: readonly boolean[] }

const plan = (slots: readonly SlotFit[], bench: readonly boolean[] = slots.map(() => false)): UnitPlan => ({ slots, bench });

/** Defense in DEFENSE_ROLES order: LDE LDT RDT RDE MIKE WILL SAM LCB RCB SS FS. */
export const DEFENSE_PLAN = plan([DE, DT, DT, DE, MIKE, WILL, SAM, CB, CB, SS, FS]);

/**
 * Offense in OFFENSE_ROLES order (LT LG C RG RT Q R X Z Y H) for a personnel code: first digit backs, second
 * tight ends, the rest wide receivers (F1.1.1). The eligible slots X, Z, Y and H take the grouping's men.
 */
export function offensePlan(personnelCode: string): UnitPlan {
  const backs = Math.max(1, Number(personnelCode[0] ?? 1)), ends = Number(personnelCode[1] ?? 1);
  const wides = Math.max(0, 5 - backs - ends);
  // Who fills the four non-back eligible slots, in slot preference per kind.
  const want: { fit: SlotFit; prefer: readonly string[] }[] = [];
  for (let i = 0; i < ends; i++) want.push({ fit: TE, prefer: ['Y', 'H', 'Z', 'X'] });
  for (let i = 0; i < wides; i++) want.push({ fit: WR, prefer: ['X', 'Z', 'H', 'Y'] });
  for (let i = 1; i < backs; i++) want.push({ fit: FB, prefer: ['H', 'Z', 'Y', 'X'] });
  const fill: Record<string, SlotFit> = {};
  // The first man of each kind takes his best slot first, so 12 personnel puts TE1 at Y and WR1 at X.
  const order = [...want.filter((_, i) => i === 0 || want[i - 1]!.fit !== want[i]!.fit), ...want.filter((_, i) => !(i === 0 || want[i - 1]!.fit !== want[i]!.fit))];
  for (const w of order.slice(0, 4)) {
    const slot = w.prefer.find((s) => fill[s] === undefined);
    if (slot) fill[slot] = w.fit;
  }
  for (const s of ['X', 'Z', 'Y', 'H']) fill[s] ??= WR;
  return plan([OT, OG, OC, OG, OT, QB, RB, fill.X!, fill.Z!, fill.Y!, fill.H!]);
}

/** Personnel codes the chart caller sends (chart params `chart.personnel.p*`). */
export const PERSONNEL_CODES = ['10', '11', '12', '13', '21', '22'] as const;

/** Kicking units in KICK_ROLES order: LS LG RG LT RT LE RE LW RW H K. */
export function kickPlan(kind: KickKind | 'kick'): UnitPlan {
  const K = ['K', 'P'], P = ['P', 'K'], LS = ['LS', 'TE', 'C'];
  switch (kind) {
    case 'punt':
      // H is the personal protector, K the punter.
      return plan([LS, KICK_LINE, KICK_LINE, KICK_LINE, KICK_LINE, KICK_END, KICK_END, KICK_BACK, KICK_BACK, KICK_BACK, P], [false, true, true, true, true, true, true, true, true, true, false]);
    case 'field_goal': case 'try_kick':
      // The front line is the offensive line; the holder is the punter (F12 habit).
      return plan([LS, OG, OG, OT, OT, KICK_END, KICK_END, KICK_BACK, KICK_BACK, ['P', 'QB', 'K'], K]);
    default:
      // Kickoff, onside, safety and fair-catch kicks: ten coverage men and the kicker.
      return plan([CORE, CORE, CORE, CORE, CORE, CORE, CORE, CORE, CORE, CORE, K], [true, true, true, true, true, true, true, true, true, true, false]);
  }
}

/** Return and kick-defending units in RETURN_ROLES order: R1 to R10 and KR. */
export function returnPlan(kind: 'kick_return' | 'punt_return' | 'hands_team' | 'field_goal_block' | 'try_block' | 'punt_block'): UnitPlan {
  switch (kind) {
    case 'field_goal_block': case 'try_block':
      return plan([DE, DT, DT, DE, DT, MIKE, WILL, SAM, CB, CB, SS]);
    case 'hands_team':
      return plan([WR, WR, WR, TE, TE, RB, CB, CB, SS, FS, RETURNER]);
    case 'punt_return': case 'punt_block':
      return plan([DE, DE, CORE, CORE, CORE, CORE, CB, CB, CORE, CORE, RETURNER], [false, false, true, true, true, true, true, true, true, true, true]);
    default:
      return plan([CORE, CORE, CORE, CORE, CORE, ['TE', 'FB', 'ILB', 'OLB'], ['TE', 'FB', 'ILB', 'OLB'], CORE, CORE, ['RB', 'WR', 'CB'], RETURNER], [true, true, true, true, true, true, true, true, true, true, true]);
  }
}

/** Every depth key the real game's roster source reads (chart depthRoster: `unit:detail`, `unit:personnel`, then `unit`). */
export function unitPlans(): readonly (readonly [string, UnitPlan])[] {
  const out: [string, UnitPlan][] = [['offense', offensePlan('11')], ['defense', DEFENSE_PLAN]];
  for (const p of PERSONNEL_CODES) if (p !== '11') out.push([`offense:${p}`, offensePlan(p)]);
  out.push(['kick', kickPlan('kick')], ['kick:punt', kickPlan('punt')], ['kick:field_goal', kickPlan('field_goal')], ['kick:try_kick', kickPlan('try_kick')]);
  out.push(['return', returnPlan('kick_return')], ['return:punt_return', returnPlan('punt_return')], ['return:punt_block', returnPlan('punt_block')],
    ['return:hands_team', returnPlan('hands_team')], ['return:field_goal_block', returnPlan('field_goal_block')], ['return:try_block', returnPlan('try_block')]);
  return out;
}

export interface Candidate { readonly id: number; readonly position: string; readonly grade: number }

/**
 * Fill one unit: slot by slot in role order, the best-fitting position first, then the staff's grade, then the
 * lower id. A player stands in one slot per unit. A slot no healthy player fits is filled by the best player
 * left (the club must field eleven: a real coach would play someone out of position).
 */
export function fillUnit(unit: UnitPlan, candidates: readonly Candidate[], starters: ReadonlySet<number>): number[] {
  const used = new Set<number>();
  const out: number[] = [];
  unit.slots.forEach((fit, s) => {
    let best: Candidate | undefined, bestKey = Infinity;
    for (const c of candidates) {
      if (used.has(c.id)) continue;
      const rank = fit.indexOf(c.position);
      const fitRank = rank < 0 ? fit.length + 1 : rank;
      // A benched-preferred slot puts non-starters ahead at the same fit.
      const key = (fitRank * 2 + (unit.bench[s] && starters.has(c.id) ? 1 : 0)) * 1000 - c.grade;
      if (key < bestKey || (key === bestKey && best !== undefined && c.id < best.id)) { best = c; bestKey = key; }
    }
    if (best) { used.add(best.id); out.push(best.id); }
  });
  return out;
}
