// Applies one depth chart edit (M2.1.1 to M2.1.4, M2.5). Returns the new chart, or a refusal with the
// rule that stops it. Every edit is a keyboard action on the screen (Q1.5.2), so no drag is needed.
import { depth } from '@gm/league';
import { availability, EMERGENCY_NEEDS, type DepthChartInput } from './model.ts';
import type { DepthEdit } from './types.ts';

export type EditResult =
  | { readonly ok: true; readonly chart: depth.DepthChart }
  | { readonly ok: false; readonly rule: string; readonly message: string };

type Context = Pick<DepthChartInput, 'defs' | 'people' | 'actives' | 'locked' | 'battles'>;

const refuse = (rule: string, message: string): EditResult => ({ ok: false, rule, message });

function withList(chart: depth.DepthChart, unitId: string, job: string, list: readonly number[]): depth.DepthChart {
  const lists = { ...(chart.units[unitId] ?? {}) } as Record<string, readonly number[]>;
  if (list.length === 0) delete lists[job];
  else lists[job] = list;
  return { ...chart, units: { ...chart.units, [unitId]: lists } };
}

export function applyDepthEdit(chart: depth.DepthChart, edit: DepthEdit, ctx: Context): EditResult {
  const onRoster = new Set(ctx.people.map((p) => p.personId));
  if (edit.kind === 'emergency') {
    if (!(EMERGENCY_NEEDS as readonly string[]).includes(edit.need)) return refuse('M2.1.3', `no emergency need ${edit.need}`);
    if (edit.personId !== null && !onRoster.has(edit.personId)) return refuse('M2.1.1', `person ${edit.personId} is not on the roster`);
    const emergency = { ...chart.emergency } as Partial<Record<depth.EmergencyNeed, number>>;
    if (edit.personId === null) delete emergency[edit.need as depth.EmergencyNeed];
    else emergency[edit.need as depth.EmergencyNeed] = edit.personId;
    return { ok: true, chart: { ...chart, emergency } };
  }
  const def = ctx.defs.find((d) => d.unitId === edit.unitId);
  if (!def) return refuse('M2.1.1', `no unit ${edit.unitId}`);
  const jobDef = def.jobs.find((j) => j.job === edit.job);
  if (!jobDef) return refuse('M2.1.1', `unit ${edit.unitId} has no job ${edit.job}`);
  const before = depth.resolveUnit(chart, ctx.defs, edit.unitId).lists;
  const current = [...(before[edit.job] ?? [])];

  let next: depth.DepthChart;
  switch (edit.kind) {
    case 'move': {
      if (!current.includes(edit.personId)) return refuse('M2.1.1', `person ${edit.personId} is not listed at ${edit.job}`);
      const rest = current.filter((id) => id !== edit.personId);
      const at = Math.max(0, Math.min(rest.length, edit.toIndex));
      next = withList(chart, edit.unitId, edit.job, [...rest.slice(0, at), edit.personId, ...rest.slice(at)]);
      break;
    }
    case 'add': {
      if (!onRoster.has(edit.personId)) return refuse('M2.1.1', `person ${edit.personId} is not on the roster`);
      if (current.includes(edit.personId)) return refuse('M2.1.1', `person ${edit.personId} is already listed at ${edit.job}`);
      next = withList(chart, edit.unitId, edit.job, [...current, edit.personId]);
      break;
    }
    case 'remove': {
      if (!current.includes(edit.personId)) return refuse('M2.1.1', `person ${edit.personId} is not listed at ${edit.job}`);
      next = withList(chart, edit.unitId, edit.job, current.filter((id) => id !== edit.personId));
      break;
    }
    case 'inherit': {
      if (def.base === undefined) return refuse('M2.2.1', `${edit.unitId} is a base unit; only a package job inherits`);
      next = withList(chart, edit.unitId, edit.job, []);
      break;
    }
    case 'decide_battle': {
      const b = ctx.battles.find((x) => x.battle.unitId === edit.unitId && x.battle.job === edit.job);
      if (!b) return refuse('M2.5', `no open battle at ${edit.unitId} ${edit.job}`);
      if (!b.battle.competitors.includes(edit.winner)) return refuse('M2.5', `person ${edit.winner} is not in the battle`);
      next = depth.decideBattle(chart, b.battle, edit.winner);
      break;
    }
  }
  if (ctx.locked) {
    const after = depth.resolveUnit(next, ctx.defs, edit.unitId).lists;
    if (!depth.changeAllowedAfterLock(before, after, availability(ctx))) {
      return refuse('M2.1.1', 'the game-day list is locked: only active players may enter a list');
    }
  }
  return { ok: true, chart: next };
}
