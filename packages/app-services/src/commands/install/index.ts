// @gm/app-services, install board commands (O3.3.2 over G5). Each checks the user's job first (G5.3.1: the
// coordinator decides his side, the head coach any side, lower rungs recommend): a control he does not hold
// becomes a suggestion to its holder, never an edit. Placement obeys G5.1.1 (no unit before its
// prerequisites). The default fill is G-64's install order packed day by day under the G5.2.1 daily limit.
// Commands return the new state; the host stores it and logs the command (P5).
import { knowledge } from '@gm/league';
import { playbook as pb } from '@gm/football-content';
import type { InstallUnitInput } from '../../read-models/install/index.ts';

export interface InstallState {
  /** Unit id to day id; null is the unscheduled tray. */
  readonly placed: Readonly<Record<string, string | null>>;
  readonly alwaysUp: readonly string[];
  /** Plays handed over from the playbook's "add to install list" (O3.3.1); the host turns them into units. */
  readonly listed: readonly string[];
}

export interface InstallContext {
  readonly holder: pb.Holder;
  readonly side: pb.Book;
  readonly units: readonly InstallUnitInput[];
  /** Live days in order (a short week's removed days are left out). */
  readonly days: readonly string[];
  readonly newId: string;
  readonly userId: string;
  readonly numbers?: knowledge.KnowledgeNumbers;
}

export type InstallCommand =
  | { readonly kind: 'place'; readonly unitId: string; readonly dayId: string | null }
  | { readonly kind: 'fill' }
  | { readonly kind: 'always_up'; readonly unitId: string; readonly on: boolean }
  | { readonly kind: 'add_plays'; readonly playIds: readonly string[] };

export type InstallResult =
  | { readonly ok: true; readonly state: InstallState; readonly notes: readonly string[] }
  | { readonly ok: false; readonly refusal: string; readonly suggestion?: pb.Suggestion };

const dayMap = (ctx: InstallContext, placed: InstallState['placed']): Map<string, number> => {
  const idx = new Map(ctx.days.map((d, i) => [d, i]));
  const out = new Map<string, number>();
  for (const [u, d] of Object.entries(placed)) { const i = d ? idx.get(d) : undefined; if (i !== undefined) out.set(u, i); }
  return out;
};

/** Distinct learning units a group already has on a day. */
function dayItems(ctx: InstallContext, placed: InstallState['placed'], dayId: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const u of ctx.units) if (placed[u.id] === dayId) for (const [g, list] of Object.entries(u.items)) {
    const s = out.get(g) ?? new Set<string>();
    list.forEach((i) => s.add(i));
    out.set(g, s);
  }
  return out;
}

/** G5.2.1 default fill: install order, earliest day that holds the prerequisites and stays inside the limit. */
export function defaultFill(ctx: InstallContext, s: InstallState): { placed: Record<string, string | null>; notFitting: string[] } {
  const n = ctx.numbers ?? knowledge.knowledgeNumbers();
  const limit = knowledge.num(n, 'install.dailyLimit');
  const ids = new Set(ctx.units.map((u) => u.id));
  const order = knowledge.installOrder(ctx.units.map((u) => ({ id: u.id, items: u.items, requires: u.requires.filter((r) => ids.has(r)) })));
  const byId = new Map(ctx.units.map((u) => [u.id, u]));
  const placed: Record<string, string | null> = {};
  for (const u of ctx.units) placed[u.id] = null;
  const notFitting: string[] = [];
  for (const id of order) {
    const u = byId.get(id)!;
    const sched = dayMap(ctx, placed);
    let put = false;
    for (let d = 0; d < ctx.days.length && !put; d++) {
      if (!knowledge.canSchedule({ ...u, requires: u.requires.filter((r) => ids.has(r)) }, d, sched)) continue;
      const have = dayItems(ctx, placed, ctx.days[d]!);
      const fits = Object.entries(u.items).every(([g, list]) => {
        const s2 = new Set(have.get(g) ?? []);
        list.forEach((i) => s2.add(i));
        return s2.size <= limit;
      });
      if (fits) { placed[id] = ctx.days[d]!; put = true; }
    }
    if (!put) notFitting.push(id);
  }
  return { placed, notFitting };
}

export function runInstallCommand(s: InstallState, ctx: InstallContext, cmd: InstallCommand): InstallResult {
  const access = pb.access(ctx.holder, 'build_plan_and_sheet', ctx.side);
  if (!access.allowed) {
    const suggestion = access.suggest ? pb.suggest(ctx.newId, ctx.userId, ctx.holder, 'build_plan_and_sheet', ctx.side, JSON.stringify(cmd)) : undefined;
    return { ok: false, refusal: `held by ${access.heldBy}`, suggestion };
  }
  const unit = (id: string) => ctx.units.find((u) => u.id === id);
  switch (cmd.kind) {
    case 'place': {
      const u = unit(cmd.unitId);
      if (!u) return { ok: false, refusal: `no install unit ${cmd.unitId}` };
      if (cmd.dayId === null) {
        // Its dependants stay where they are; the board flags them as missing a prerequisite.
        return { ok: true, state: { ...s, placed: { ...s.placed, [u.id]: null } }, notes: [] };
      }
      const day = ctx.days.indexOf(cmd.dayId);
      if (day < 0) return { ok: false, refusal: `no day ${cmd.dayId} this week` };
      const ids = new Set(ctx.units.map((x) => x.id));
      const sched = dayMap(ctx, s.placed);
      sched.delete(u.id);
      if (!knowledge.canSchedule({ ...u, requires: u.requires.filter((r) => ids.has(r)) }, day, sched)) {
        const need = u.requires.filter((r) => ids.has(r) && !(sched.has(r) && sched.get(r)! <= day));
        return { ok: false, refusal: `needs ${need.join(', ')} on or before that day (G5.1.1)` };
      }
      const later = ctx.units.filter((x) => x.requires.includes(u.id) && sched.has(x.id) && sched.get(x.id)! < day).map((x) => x.id);
      if (later.length) return { ok: false, refusal: `${later.join(', ')} need it first and are on earlier days (G5.1.1)` };
      const n = ctx.numbers ?? knowledge.knowledgeNumbers();
      const limit = knowledge.num(n, 'install.dailyLimit');
      const have = dayItems(ctx, s.placed, cmd.dayId);
      const notes: string[] = [];
      for (const [g, list] of Object.entries(u.items)) {
        const all = new Set(have.get(g) ?? []);
        list.forEach((i) => all.add(i));
        if (all.size > limit) notes.push(`${g} goes ${all.size - limit} learning unit(s) over the daily limit of ${limit} (G5.2.1)`);
      }
      return { ok: true, state: { ...s, placed: { ...s.placed, [u.id]: cmd.dayId } }, notes };
    }
    case 'fill': {
      try {
        const f = defaultFill(ctx, s);
        return { ok: true, state: { ...s, placed: f.placed }, notes: f.notFitting.map((id) => `${id} does not fit this week (G5.2.1)`) };
      } catch (e) {
        return { ok: false, refusal: (e as Error).message };
      }
    }
    case 'always_up': {
      if (!unit(cmd.unitId)) return { ok: false, refusal: `no install unit ${cmd.unitId}` };
      const rest = s.alwaysUp.filter((x) => x !== cmd.unitId);
      return { ok: true, state: { ...s, alwaysUp: cmd.on ? [...rest, cmd.unitId] : rest }, notes: [] };
    }
    case 'add_plays': {
      const listed = [...s.listed];
      for (const id of cmd.playIds) if (!listed.includes(id)) listed.push(id);
      return { ok: true, state: { ...s, listed }, notes: [] };
    }
  }
}
