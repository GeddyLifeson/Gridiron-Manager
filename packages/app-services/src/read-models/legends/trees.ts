// X3.3.1 coaching trees: who learned under whom, as a query over staff stints, never stored. An assistant
// appears under a head coach after one full season on his staff (starting value). The view shows each
// branch with years and roles on the root's staff, the chairs that person later held, and the head
// coaches produced. Depth is the longest chain of head coaches each of whom worked under the one above;
// "head coaches produced" counts each person once. Filters: level, side of the ball, years. The default
// view expands two levels. A coach who worked under three head coaches appears in all three trees.
import { param } from './params.ts';
import { DEFAULT_TYPES, type EventRow, type LegendsTypes, type PersonId, type TeamId } from './types.ts';

export type Side = 'offense' | 'defense' | 'special_teams' | 'none';

/** One season one person spent in one chair on one team, with the hire event that started the stint. */
export interface StaffSeason {
  readonly personId: PersonId;
  readonly teamId: TeamId;
  readonly seasonYear: number;
  readonly role: string;
  readonly level: string;
  readonly side: Side;
  readonly hireEventId: number;
}

/**
 * Staff stints from hire and departure events (X3.3.1 acceptance: every node traces to a hire event and
 * season rows on a shared staff). A stint covers the hire season up to the season before the departure.
 * `lastSeason` closes stints still open.
 */
export function staffSeasonsFrom(rows: readonly EventRow[], lastSeason: number, types: LegendsTypes = DEFAULT_TYPES): StaffSeason[] {
  const open = new Map<string, { e: EventRow; personId: number; teamId: number }>();
  const out: StaffSeason[] = [];
  const close = (k: string, endExclusive: number) => {
    const s = open.get(k);
    if (!s) return;
    open.delete(k);
    const p = s.e.payload;
    for (let y = s.e.when.date.seasonYear; y < endExclusive; y++) {
      out.push({
        personId: s.personId, teamId: s.teamId, seasonYear: y, role: String(p['role'] ?? ''), level: String(p['level'] ?? ''),
        side: (['offense', 'defense', 'special_teams'].includes(String(p['side'])) ? p['side'] : 'none') as Side, hireEventId: s.e.id,
      });
    }
  };
  const sorted = [...rows].filter((e) => types.coachChanges.includes(e.type) && e.where.teamId !== null)
    .sort((a, b) => a.when.date.seasonYear - b.when.date.seasonYear || a.when.date.dayIndex - b.when.date.dayIndex || a.id - b.id);
  for (const e of sorted) {
    for (const a of e.actors) {
      const k = `${a.personId}:${e.where.teamId}`;
      if (e.type === types.coachHired) {
        close(k, e.when.date.seasonYear);
        open.set(k, { e, personId: a.personId, teamId: e.where.teamId! });
      } else close(k, e.when.date.seasonYear);
    }
  }
  for (const k of [...open.keys()]) close(k, lastSeason + 1);
  return out.sort((a, b) => a.seasonYear - b.seasonYear || a.teamId - b.teamId || a.personId - b.personId);
}

export interface TreeFilter { readonly level?: string; readonly side?: Side; readonly fromSeason?: number; readonly toSeason?: number }

export interface Chair { readonly teamId: TeamId; readonly role: string; readonly level: string; readonly firstSeason: number; readonly lastSeason: number }

export interface TreeNode {
  readonly personId: PersonId;
  /** Years and roles on the parent's staff. */
  readonly underParent: readonly { readonly teamId: TeamId; readonly role: string; readonly firstSeason: number; readonly lastSeason: number; readonly hireEventIds: readonly number[] }[];
  /** Chairs held after leaving the parent's staff. */
  readonly laterChairs: readonly Chair[];
  readonly becameHeadCoach: boolean;
  /** Shown open in the default view (depth below the root within `legends.tree.default_depth`). */
  readonly expanded: boolean;
  readonly children: readonly TreeNode[];
}

export interface CoachingTree {
  readonly rootId: PersonId;
  readonly branches: readonly TreeNode[];
  readonly depth: number;
  readonly headCoachesProduced: number;
  /** Head coaches produced per level, each person once. */
  readonly producedByLevel: Readonly<Record<string, number>>;
}

function chairsOf(rows: readonly StaffSeason[]): Chair[] {
  const by = new Map<string, Chair>();
  for (const r of rows) {
    const k = `${r.teamId}:${r.role}:${r.level}`;
    const c = by.get(k);
    by.set(k, c ? { ...c, firstSeason: Math.min(c.firstSeason, r.seasonYear), lastSeason: Math.max(c.lastSeason, r.seasonYear) } : { teamId: r.teamId, role: r.role, level: r.level, firstSeason: r.seasonYear, lastSeason: r.seasonYear });
  }
  return [...by.values()].sort((a, b) => a.firstSeason - b.firstSeason || a.teamId - b.teamId);
}

export function coachingTree(rootId: PersonId, staff: readonly StaffSeason[], filter: TreeFilter = {}, types: LegendsTypes = DEFAULT_TYPES): CoachingTree {
  const minSeasons = param('legends.tree.min_seasons');
  const open = param('legends.tree.default_depth');
  const hc = types.headCoachRole;
  const inYears = (y: number) => (filter.fromSeason === undefined || y >= filter.fromSeason) && (filter.toSeason === undefined || y <= filter.toSeason);
  const headSeasons = staff.filter((s) => s.role === hc);
  const byPerson = new Map<number, StaffSeason[]>();
  for (const s of staff) (byPerson.get(s.personId) ?? byPerson.set(s.personId, []).get(s.personId)!).push(s);

  const assistantsOf = (head: number) => {
    const mine = headSeasons.filter((h) => h.personId === head && inYears(h.seasonYear) && (filter.level === undefined || h.level === filter.level));
    const shared = new Map<number, StaffSeason[]>();
    for (const h of mine) {
      for (const s of staff) {
        if (s.teamId !== h.teamId || s.seasonYear !== h.seasonYear || s.personId === head || s.role === hc) continue;
        if (filter.side !== undefined && s.side !== filter.side) continue;
        (shared.get(s.personId) ?? shared.set(s.personId, []).get(s.personId)!).push(s);
      }
    }
    return [...shared].filter(([, ss]) => new Set(ss.map((s) => s.seasonYear)).size >= minSeasons).sort((a, b) => a[0] - b[0]);
  };

  const produced = new Map<number, string>();
  let depth = 0;
  const build = (head: number, level: number, path: Set<number>): TreeNode[] => assistantsOf(head).filter(([p]) => !path.has(p)).map(([personId, ss]) => {
    const lastUnder = Math.max(...ss.map((s) => s.seasonYear));
    const later = (byPerson.get(personId) ?? []).filter((s) => s.seasonYear > lastUnder);
    const laterHead = later.filter((s) => s.role === hc);
    const became = laterHead.length > 0;
    const stints = new Map<string, { teamId: number; role: string; firstSeason: number; lastSeason: number; hireEventIds: Set<number> }>();
    for (const s of ss) {
      const k = `${s.teamId}:${s.role}`;
      const c = stints.get(k) ?? stints.set(k, { teamId: s.teamId, role: s.role, firstSeason: s.seasonYear, lastSeason: s.seasonYear, hireEventIds: new Set() }).get(k)!;
      c.firstSeason = Math.min(c.firstSeason, s.seasonYear); c.lastSeason = Math.max(c.lastSeason, s.seasonYear); c.hireEventIds.add(s.hireEventId);
    }
    if (became && !produced.has(personId)) produced.set(personId, laterHead[0]!.level);
    const children = build(personId, level + 1, new Set([...path, personId]));
    return {
      personId,
      underParent: [...stints.values()].map((c) => ({ teamId: c.teamId, role: c.role, firstSeason: c.firstSeason, lastSeason: c.lastSeason, hireEventIds: [...c.hireEventIds].sort((a, b) => a - b) })),
      laterChairs: chairsOf(later), becameHeadCoach: became, expanded: level <= open, children,
    };
  });

  const branches = build(rootId, 1, new Set([rootId]));
  const chain = (nodes: readonly TreeNode[]): number => Math.max(0, ...nodes.map((n) => (n.becameHeadCoach ? 1 + chain(n.children) : 0)));
  depth = chain(branches);
  const producedByLevel: Record<string, number> = {};
  for (const lvl of produced.values()) producedByLevel[lvl] = (producedByLevel[lvl] ?? 0) + 1;
  return { rootId, branches, depth, headCoachesProduced: produced.size, producedByLevel };
}

/** One node of a flattened tree, in depth-first order. Read models carry trees flat (schemas cannot recurse). */
export interface FlatTreeNode extends Omit<TreeNode, 'children'> { readonly parentId: PersonId; readonly level: number }
export interface FlatCoachingTree extends Omit<CoachingTree, 'branches'> { readonly nodes: readonly FlatTreeNode[] }

export function flattenTree(t: CoachingTree): FlatCoachingTree {
  const nodes: FlatTreeNode[] = [];
  const walk = (list: readonly TreeNode[], parentId: PersonId, level: number) => {
    for (const { children, ...n } of list) { nodes.push({ ...n, parentId, level }); walk(children, n.personId, level + 1); }
  };
  walk(t.branches, t.rootId, 1);
  const { branches: _b, ...rest } = t;
  return { ...rest, nodes };
}
