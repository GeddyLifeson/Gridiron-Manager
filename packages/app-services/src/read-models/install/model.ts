// Builds the install board view (O3.3.2) from the club's install units, their placement on the week's or
// camp's days, the slated players and the staff's estimates. All football logic is G-64's
// (league/knowledge): the daily limit split, prerequisites, the installed test, G5.4.1 readiness and the
// D9.4.1 error chance. This file only arranges the results for the screen.
import { knowledge } from '@gm/league';
import { playbook as pb } from '@gm/football-content';
import type { DayColumn, GroupLoad, GroupReadiness, InstallCard, InstallLock, InstallView, Lagger, PeriodRow, UnitReadiness } from './types.ts';

export interface InstallUnitInput {
  readonly id: string;
  readonly label: string;
  readonly kind: 'part' | 'play';
  /** Learning units by position group (G5.1.1, from G1.7.1). */
  readonly items: Readonly<Record<string, readonly string[]>>;
  readonly requires: readonly string[];
}

export interface SlatedPlayer { readonly id: number; readonly name: string; readonly group: string; readonly position: string }

export interface InstallInput {
  readonly teamId: number;
  readonly side: InstallView['side'];
  readonly mode: InstallView['mode'];
  readonly holder: pb.Holder;
  /** The days of the week (H1) or of camp (G5.2.1); a short week marks days removed. */
  readonly days: readonly { readonly id: string; readonly label: string; readonly removed?: boolean }[];
  readonly units: readonly InstallUnitInput[];
  /** Unit id to day id; null or absent is the unscheduled tray. */
  readonly placed: Readonly<Record<string, string | null>>;
  readonly periods?: (unitId: string) => readonly PeriodRow[];
  readonly players: readonly SlatedPlayer[];
  /** The staff's estimate (0 to 100) of a player's knowledge of items, min over the items; null when unjudged. */
  readonly estimate: (player: number, items: readonly string[]) => number | null;
  /** D9.4.1 difficulty 1 to 5 of an item for a position (G-64 item catalogue). */
  readonly difficulty: (item: string, position: string) => number;
  readonly alwaysUp: readonly string[];
  readonly numbers?: knowledge.KnowledgeNumbers;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 10000) / 10000;

export function installLock(holder: pb.Holder, side: pb.Book): InstallLock {
  // G5.3.1: coordinators decide their side's install, the head coach any side; lower rungs recommend. This is
  // the G3.4.3 plan-building right, so the same table decides it.
  const a = pb.access(holder, 'build_plan_and_sheet', side);
  return a.allowed ? { allowed: true, heldBy: null, suggest: false } : { allowed: false, heldBy: a.heldBy, suggest: a.suggest };
}

export function buildInstallView(inp: InstallInput): InstallView {
  const n = inp.numbers ?? knowledge.knowledgeNumbers();
  const threshold = knowledge.num(n, 'install.threshold');
  const dailyLimit = knowledge.num(n, 'install.dailyLimit');
  const overLimitYield = knowledge.num(n, 'install.overLimitYield');
  const liveDays = inp.days.filter((d) => !d.removed);
  const dayIndex = new Map(liveDays.map((d, i) => [d.id, i]));
  const removed = new Set(inp.days.filter((d) => d.removed).map((d) => d.id));
  const unitById = new Map(inp.units.map((u) => [u.id, u]));
  const scheduled = new Map<string, number>();
  for (const u of inp.units) { const d = inp.placed[u.id]; const i = d ? dayIndex.get(d) : undefined; if (i !== undefined) scheduled.set(u.id, i); }
  const byGroup = new Map<string, SlatedPlayer[]>();
  for (const p of inp.players) { const g = byGroup.get(p.group) ?? []; g.push(p); byGroup.set(p.group, g); }
  const groupIds = Object.fromEntries([...byGroup].map(([g, ps]) => [g, ps.map((p) => p.id)]));
  const est0 = (pl: number, items: readonly string[]) => inp.estimate(pl, items) ?? 0;
  const always = new Set(inp.alwaysUp);

  const installed = (u: InstallUnitInput) => knowledge.isInstalled(n, u, groupIds, est0);
  const card = (u: InstallUnitInput, tray: InstallCard['tray']): InstallCard => {
    const groups = Object.keys(u.items).sort().map((g) => ({ group: g, units: u.items[g]!.length }));
    const day = scheduled.get(u.id);
    const missing = day === undefined ? [] : u.requires.filter((r) => { const d = scheduled.get(r); return d === undefined || d > day; });
    return {
      unitId: u.id, label: u.label, kind: u.kind, groups, load: groups.reduce((s, g) => s + g.units, 0),
      periods: inp.periods?.(u.id) ?? [], missing, installed: installed(u), alwaysUp: always.has(u.id), tray,
    };
  };

  const days: DayColumn[] = liveDays.map((d) => {
    const units = inp.units.filter((u) => inp.placed[u.id] === d.id);
    const items = new Map<string, string[]>();
    for (const u of units) for (const [g, list] of Object.entries(u.items)) {
      const have = items.get(g) ?? [];
      for (const it of list) if (!have.includes(it)) have.push(it);
      items.set(g, have);
    }
    const load: GroupLoad[] = [...items.keys()].sort().map((g) => {
      const split = knowledge.dailyLimitSplit(n, items.get(g)!);
      return { group: g, units: items.get(g)!.length, limit: dailyLimit, over: split.over.length, lostShare: split.over.length ? r2(1 - overLimitYield) : 0 };
    });
    return { id: d.id, label: d.label, cards: units.map((u) => card(u, null)), load, overloaded: load.some((l) => l.over > 0) };
  });

  const tray = inp.units.filter((u) => !scheduled.has(u.id)).map((u) => card(u, removed.has(inp.placed[u.id] ?? '') ? 'day_removed' : 'unplaced'));

  const readiness: UnitReadiness[] = inp.units.map((u) => ({
    unitId: u.id, label: u.label, installed: installed(u),
    groups: Object.keys(u.items).sort().map((g): GroupReadiness => {
      const items = u.items[g]!;
      const ps = byGroup.get(g) ?? [];
      const judged = ps.map((p) => ({ p, e: inp.estimate(p.id, items) })).filter((x): x is { p: SlatedPlayer; e: number } => x.e !== null);
      const vals = judged.map((x) => x.e);
      const laggers: Lagger[] = judged.filter((x) => x.e < threshold).sort((a, b) => a.e - b.e || a.p.id - b.p.id).map(({ p, e }) => {
        const difficulty = items.reduce((m, it) => Math.max(m, inp.difficulty(it, p.position)), 1);
        return {
          player: p.id, name: p.name, position: p.position, estimate: r2(e),
          errorChance: r4(knowledge.errorChance(n, { knowledge: e, difficulty, changedAtLine: false, noise: 1 })),
          delayS: r2(knowledge.processingDelay(n, e)),
        };
      });
      return {
        group: g, players: ps.length, unjudged: vals.length === 0,
        readiness: vals.length ? r2(knowledge.playReadiness(n, vals)) : 0,
        weakest: vals.length ? r2(Math.min(...vals)) : 0,
        laggers,
      };
    }),
  }));

  let order: string[] = [];
  let orderProblem: string | null = null;
  try { order = knowledge.installOrder(inp.units.map((u) => ({ id: u.id, items: u.items, requires: u.requires.filter((r) => unitById.has(r)) }))); } catch (e) { orderProblem = (e as Error).message; }

  const allCards = [...days.flatMap((d) => d.cards), ...tray];
  return {
    teamId: inp.teamId, side: inp.side, mode: inp.mode, days, tray, readiness, order, orderProblem,
    numbers: { threshold, dailyLimit, overLimitYield, shortWeek: removed.size > 0 },
    totals: { placed: allCards.length - tray.length, unplaced: tray.length, installed: allCards.filter((c) => c.installed).length },
    locks: { edit: installLock(inp.holder, inp.side) },
  };
}
