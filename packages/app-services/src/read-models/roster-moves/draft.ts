// The staff's recommended active list (H6.2.1 "staff recommend a list first", M2.1.4 rule 2). Fill
// order: (a) the healthy starter at every job of the plan's packages; (b) the first healthy man at each
// special teams job, so no unit is short when a full side of healthy candidates exists (H6.2.1
// acceptance 3); (c) the next healthy man at every job (the backup of H6.2.1 rule 2); (e) the rest by
// special teams units first or second on, then by best chart rank. Players ruled out on the report are
// left inactive first. Step (d), the position-group minimums, is an Assumption table owned by the AI
// preparation package (K3) and is not applied here.
import { roster } from '@gm/league';
import { isSpecialTeamsUnit, unitNamed, type DepthUnit } from './coverage.ts';
import { param } from './params.ts';

export interface DraftInput {
  readonly candidates: readonly number[];
  readonly out: ReadonlySet<number>;
  readonly linemen: ReadonlySet<number>;
  readonly depth: readonly DepthUnit[];
  readonly rules: roster.RosterRules;
}

export interface Draft { readonly actives: number[]; readonly reasons: Record<string, string> }

const byUnit = (a: DepthUnit, b: DepthUnit) => (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0);

export function staffDraft(input: DraftInput): Draft {
  const healthy = new Set(input.candidates.filter((id) => !input.out.has(id)));
  const order: number[] = [];
  const reasons: Record<string, string> = {};
  const add = (id: number | undefined, reason: string) => {
    if (id === undefined || !healthy.has(id) || reasons[String(id)]) return;
    order.push(id);
    reasons[String(id)] = reason;
  };
  const units = [...input.depth].sort(byUnit);
  const scrimmage = units.filter((u) => !isSpecialTeamsUnit(u.unitId));
  const special = units.filter((u) => isSpecialTeamsUnit(u.unitId));
  const roles = (u: DepthUnit) => Object.keys(u.roles).sort().map((r) => (u.roles[r] ?? []).filter((id) => healthy.has(id)));

  for (const u of scrimmage) for (const list of roles(u)) add(list[0], 'draft.starter');
  for (const u of special) for (const id of unitNamed(u, healthy)) add(id, 'draft.special_teams');
  for (const u of scrimmage) for (const list of roles(u)) add(list[1], 'draft.backup');

  const stRanks = param('roster_moves.draft_special_teams_ranks');
  const stCount = new Map<number, number>(), bestRank = new Map<number, number>();
  for (const u of units) for (const list of roles(u)) list.forEach((id, i) => {
    if (isSpecialTeamsUnit(u.unitId) && i < stRanks) stCount.set(id, (stCount.get(id) ?? 0) + 1);
    bestRank.set(id, Math.min(bestRank.get(id) ?? Number.MAX_SAFE_INTEGER, i));
  });
  const rest = [...healthy].filter((id) => !reasons[String(id)]).sort((a, b) =>
    (stCount.get(b) ?? 0) - (stCount.get(a) ?? 0)
    || (bestRank.get(a) ?? Number.MAX_SAFE_INTEGER) - (bestRank.get(b) ?? Number.MAX_SAFE_INTEGER)
    || a - b);
  for (const id of rest) add(id, 'draft.depth');

  const g = input.rules.gameDay;
  if (!g) return { actives: order, reasons };
  // Dress the required linemen when the roster has them, taking the place of the last depth picks.
  let picked = order.slice(0, g.activeLimit);
  const olIn = () => picked.filter((id) => input.linemen.has(id)).length;
  const spareOl = order.slice(g.activeLimit).filter((id) => input.linemen.has(id));
  while (olIn() < g.minLinemen && spareOl.length) {
    let drop = -1;
    for (let i = picked.length - 1; i >= 0; i--) {
      const id = picked[i]!;
      if (!input.linemen.has(id) && reasons[String(id)] === 'draft.depth') { drop = i; break; }
    }
    if (drop < 0) break;
    const ol = spareOl.shift()!;
    picked = [...picked.slice(0, drop), ...picked.slice(drop + 1), ol];
    reasons[String(ol)] = 'draft.linemen';
  }
  const limit = roster.activeLimitFor(olIn(), input.rules);
  picked = picked.slice(0, limit);
  const kept = new Set(picked);
  for (const k of Object.keys(reasons)) if (!kept.has(Number(k))) delete reasons[k];
  return { actives: picked, reasons };
}
