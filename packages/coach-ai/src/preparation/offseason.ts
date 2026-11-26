// K3.7.1 offseason and long-range preparation: the order a system is installed in, the depth chart from
// the staff's grades, and the needs list handed to the front office (K7.2.1). The install builder
// (G5.2.1, G-64) and the camp plans (M6, H3) own their objects; this file produces the AI's choices for
// them. A new head coach gets no bonus: install cost is paid through the same readiness as anyone's (E4.3.5).
import type { StaffGrade } from './matchups.ts';
import { param } from './params.ts';

export interface InstallUnit {
  readonly id: string;
  /** Part of the system's core (G5.2.1): taught first. */
  readonly core: boolean;
  readonly dependsOn: readonly string[];
  /** Share of snaps the coach's system gives the unit's calls, for ordering what comes after the core. */
  readonly plannedUse: number;
}

/** Rule 1: the system's core first, then by planned use, never before something it depends on. */
export function installOrder(units: readonly InstallUnit[]): string[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const ranked = [...units].sort((a, b) => Number(b.core) - Number(a.core) || b.plannedUse - a.plannedUse || (a.id < b.id ? -1 : 1));
  const out: string[] = [];
  const state = new Map<string, 1 | 2>();
  const visit = (u: InstallUnit) => {
    if (state.get(u.id)) return;
    state.set(u.id, 1);
    for (const d of [...u.dependsOn].sort()) { const du = byId.get(d); if (du && state.get(d) !== 1) visit(du); }
    state.set(u.id, 2);
    out.push(u.id);
  };
  for (const u of ranked) visit(u);
  return out;
}

export interface DepthCandidate {
  readonly playerId: number;
  /** Slots he can play, each with the role graded there. */
  readonly slots: readonly { readonly slot: string; readonly role: string }[];
  /** Years of pro experience, or years of eligibility used in college, for the veteran bias. */
  readonly years: number;
}

/** K2.1.3 rule 4 states the bias per five pro years and per two college years: a unit of the profile field, not a rule. */
const VETERAN_YEARS_KEY = { pro: 'offseason.veteranYearsPro', college: 'offseason.veteranYearsCollege' } as const;

export interface DepthChartRow { readonly slot: string; readonly order: readonly number[] }

/**
 * Rule 2: depth chart from the staff's grades (K3.2.1) with the coach's veteran bias
 * (`tendencies.veteranBias`, K2.1.3 rule 4: ISS per five years of pro experience, per two years of
 * eligibility used in college; it can be negative). A player is listed at every slot he can play, best
 * first; the same man may be first at one slot and a backup at another.
 */
export function depthChart(candidates: readonly DepthCandidate[], grades: readonly StaffGrade[], veteranBias: number, league: 'pro' | 'college'): DepthChartRow[] {
  const grade = new Map(grades.map((g) => [`${g.playerId}|${g.role}`, g.mean]));
  const perYear = veteranBias / param(VETERAN_YEARS_KEY[league]);
  const slots = new Map<string, { playerId: number; score: number }[]>();
  for (const c of candidates) for (const s of c.slots) {
    const g = grade.get(`${c.playerId}|${s.role}`);
    if (g === undefined) continue;
    const list = slots.get(s.slot) ?? [];
    list.push({ playerId: c.playerId, score: g + perYear * Math.max(0, c.years) });
    slots.set(s.slot, list);
  }
  return [...slots.keys()].sort().map((slot) => ({
    slot, order: slots.get(slot)!.sort((a, b) => b.score - a.score || a.playerId - b.playerId).map((x) => x.playerId),
  }));
}

export interface SlotRequirement {
  readonly slot: string;
  readonly role: string;
  /** Estimated grade the system needs from its starter and from its first backup (M1). */
  readonly starter: number;
  readonly depth: number;
  /** The coach's position value (M1): how much a shortfall here matters to him. */
  readonly value: number;
}

export interface NeedRow { readonly slot: string; readonly what: 'starter' | 'depth'; readonly shortBy: number; readonly weight: number }

/** Rule 3: positions where the estimated starter or depth falls below the system's requirement, ranked by position value. */
export function needsList(chart: readonly DepthChartRow[], grades: readonly StaffGrade[], requirements: readonly SlotRequirement[]): NeedRow[] {
  const grade = new Map(grades.map((g) => [`${g.playerId}|${g.role}`, g.mean]));
  const rowOf = new Map(chart.map((r) => [r.slot, r]));
  const out: NeedRow[] = [];
  for (const req of requirements) {
    const order = rowOf.get(req.slot)?.order ?? [];
    const at = (i: number): number | null => { const id = order[i]; return id === undefined ? null : grade.get(`${id}|${req.role}`) ?? null; };
    const starter = at(0);
    const backup = at(1);
    const sShort = starter === null ? req.starter : req.starter - starter;
    const dShort = backup === null ? req.depth : req.depth - backup;
    if (sShort > 0) out.push({ slot: req.slot, what: 'starter', shortBy: sShort, weight: sShort * req.value });
    if (dShort > 0) out.push({ slot: req.slot, what: 'depth', shortBy: dShort, weight: dShort * req.value });
  }
  return out.sort((a, b) => b.weight - a.weight || (a.slot + a.what < b.slot + b.what ? -1 : 1));
}
