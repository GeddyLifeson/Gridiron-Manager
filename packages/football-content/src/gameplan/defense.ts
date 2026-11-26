// The defensive plan (G6.4.1) and the week's emphasis dials (G6.4.2). Same stages and meters as offense;
// the structure checks use the leaf's starting sizes (all Assumptions within the sourced practice).
import { param } from './params.ts';
import type { MenuEntry, PlanWarning } from './plan.ts';

export type BestPlayerPlan = 'double' | 'bracket' | 'shade_help' | 'travel_corner' | 'straight';
export interface QuarterbackPlan { readonly containRules: boolean; readonly spy: string | null }

export interface DefensiveRules {
  /** Offensive personnel to package (the week's matching table, G2.2.1). */
  readonly matching: Readonly<Record<string, string>>;
  readonly matchupRules: readonly string[];
  readonly checks: readonly string[];
  /** Pressure plan by down: planned share of calls with pressure. */
  readonly pressureByDown: Readonly<Record<number, number>>;
  readonly quarterback: QuarterbackPlan;
  readonly bestPlayer: { readonly playerId: string | null; readonly plan: BestPlayerPlan };
  /** One default call per package for looks they have not shown (menu entry id). */
  readonly unscoutedDefault: Readonly<Record<string, string>>;
}

const THIRD_BUCKETS = ['d_third_1_3', 'd_third_4_6', 'd_third_7_9', 'd_third_10'] as const;

/** G6.4.1 checks: every personnel group they used maps to a package and at least one call; third-down buckets; unscouted defaults. */
export function checkDefense(menu: readonly MenuEntry[], rules: DefensiveRules, personnelUsed: readonly string[]): PlanWarning[] {
  const d = menu.filter((m) => m.side === 'defense' && m.defense);
  const w: PlanWarning[] = [];
  for (const p of personnelUsed) {
    const pkg = rules.matching[p];
    if (!pkg) { w.push({ leaf: 'G6.4.1', code: 'defense.no_package', subject: p, text: `${p} personnel has no package`, severity: 'warning' }); continue; }
    if (!d.some((m) => m.defense!.package === pkg && m.defense!.personnelFaced.includes(p))) w.push({ leaf: 'G6.4.1', code: 'defense.no_call', subject: p, text: `${p} personnel has no call`, severity: 'warning' });
  }
  for (const b of THIRD_BUCKETS) {
    const calls = d.filter((m) => m.situationIds.includes(b));
    if (calls.length === 0) continue;
    if (calls.length < param('defense.thirdDownPerBucket') || !calls.some((m) => m.defense!.pressure) || !calls.some((m) => !m.defense!.pressure)) {
      w.push({ leaf: 'G6.4.1', code: 'defense.third_mix', subject: b, text: `${b} needs ${param('defense.thirdDownPerBucket')} calls with at least one pressure and one coverage`, severity: 'note' });
    }
  }
  for (const pkg of new Set(Object.values(rules.matching))) {
    const id = rules.unscoutedDefault[pkg];
    if (!id || !d.some((m) => m.id === id)) w.push({ leaf: 'G6.4.1', code: 'defense.unscouted_default', subject: pkg, text: `${pkg} has no default call for unscouted looks`, severity: 'warning' });
  }
  return w;
}

/** G6.4.1 balance meters: pressure rate by down and the one-high / two-high split (the defense's own self-scout reads these). */
export function defenseBalance(menu: readonly MenuEntry[], downOf: (situationId: string) => number | null): { pressureByDown: Record<number, number>; shells: Record<string, number> } {
  const d = menu.filter((m) => m.side === 'defense' && m.defense);
  const byDown: Record<number, { p: number; n: number }> = {};
  const shells: Record<string, number> = {};
  for (const m of d) {
    shells[m.defense!.shell] = (shells[m.defense!.shell] ?? 0) + 1;
    for (const down of new Set(m.situationIds.map(downOf).filter((x): x is number => x !== null))) {
      const c = (byDown[down] ??= { p: 0, n: 0 });
      c.n++; if (m.defense!.pressure) c.p++;
    }
  }
  const pressureByDown: Record<number, number> = {};
  for (const [k, v] of Object.entries(byDown)) pressureByDown[Number(k)] = v.p / v.n;
  return { pressureByDown, shells };
}

/** Each box's calls in set, stress, break order (G6.4.1, G7.7.1). */
export function setStressBreakOrder<T extends { readonly defense?: { readonly role: 'set' | 'stress' | 'break' } }>(calls: readonly T[]): T[] {
  const rank = { set: 0, stress: 1, break: 2 } as const;
  return [...calls].sort((a, b) => rank[a.defense?.role ?? 'set'] - rank[b.defense?.role ?? 'set']);
}

// ---- G6.4.2 Emphasis dials -------------------------------------------------------------------------------

export type Dial = 'takeaway' | 'tackling' | 'rushDiscipline' | 'cornerJump';
export const DIALS: readonly Dial[] = ['takeaway', 'tackling', 'rushDiscipline', 'cornerJump'];
/** Five positions from "much less" (-2) to "much more" (+2), neutral 0. */
export interface DialSetting { readonly dial: Dial; readonly position: number; readonly practicePeriod: boolean }

/** Effect handed to J6 and K1: the position, halved when no practice period stands behind it. J6 owns what it does. */
export function dialEffect(s: DialSetting): number {
  const steps = param('emphasis.steps');
  const pos = Math.max(-steps, Math.min(steps, Math.round(s.position)));
  return (pos / steps) * (pos === 0 || s.practicePeriod ? 1 : param('emphasis.unpracticedShare'));
}

export function checkDials(settings: readonly DialSetting[]): PlanWarning[] {
  return settings.filter((s) => Math.abs(s.position) >= param('emphasis.steps') && !s.practicePeriod).map((s) => ({
    leaf: 'G6.4.2', code: 'emphasis.unpracticed', subject: s.dial, text: `${s.dial} set to the end with no practice period: half effect`, severity: 'warning' as const,
  }));
}
