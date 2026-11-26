// Authoring helpers for the full content set. Same shapes and conventions as the starter set (WP-15): authored
// lateral values are right-positive, depth is yards past the line, backs are negative, `toAssignment` flips once.
import { FORMATIONS as STARTER_FORMATIONS } from '../starter/index.ts';
import { act, clause, cut, not, settle, test, through } from '../starter/build.ts';
import type { Basis, FormationDef, Slot } from '../starter/types.ts';
import { FULL_FORMATIONS } from './formations.ts';

export { act, clause, cut, not, settle, test, through };
export type { Basis, Slot };

export const ALL_FORMATIONS: readonly FormationDef[] = [...STARTER_FORMATIONS, ...FULL_FORMATIONS];
export const FORMATION_BY_ID: ReadonlyMap<string, FormationDef> = new Map(ALL_FORMATIONS.map((f) => [f.id, f]));

export type Rest = Omit<Slot, 'role' | 'at' | 'onLine'> & { at?: Slot['at'] };

/** A slot placed where the formation puts the role. */
export function slot(fid: string, role: string, rest: Rest): Slot {
  const f = FORMATION_BY_ID.get(fid);
  if (f === undefined) throw new Error(`unknown formation ${fid}`);
  const p = f.players.find((x) => x.role === role);
  if (p === undefined) throw new Error(`formation ${fid} has no ${role}`);
  return { ...rest, role, at: rest.at ?? [p.px, p.py], onLine: p.onLine, stance: rest.stance ?? (role === 'Q' ? (f.shotgun ? 'shotgun' : 'underCenter') : p.onLine ? 'threePoint' : 'twoPoint') };
}

export const OL = ['LT', 'LG', 'C', 'RG', 'RT'] as const;
export type OLRole = (typeof OL)[number];
/** The neighbour to the right of each lineman (play side when the play goes right). */
export const RIGHT_OF: Readonly<Record<string, string>> = { LT: 'LG', LG: 'C', C: 'RG', RG: 'RT', RT: 'Y' };

/** Claims every play shares. */
export const DESIGN_VALUES: Basis = { claim: 'Splits, backfield depths and path end points that no source states are design values', status: 'Assumption', sources: [] };
export const ROUTE_DEPTH: Basis = { claim: 'A route is a stem and a break described by depth and angle; the tree numbers are labels (odd out, even in is the common default, not universal)', status: 'Verified', sources: ['bowen-route-tree', 'haddad-routes', 'campbell-routes', 'lieberman'] };
export const ZONE_RULE: Basis = { claim: 'Zone rule: a covered lineman blocks the man on him, an uncovered one works with a neighbour to the linebacker', status: 'Verified', sources: ['gibbs-zone', 'hovorka-iz', 'hk-iz'] };
export const NUMBERED_FROM_SIDELINE: Basis = { claim: 'Receivers are numbered 1, 2, 3 from the sideline in', status: 'Verified', sources: ['campbell-routes', 'haddad-routes', 'drinkall', 'lieberman'] };

/** Pass protection for a dropback: the line sets, the back stays in or releases as the play says. */
export const protect = (concept: string): Rest => ({ behavior: 'passSet', params: { type: 'full' }, concept, technique: { passSet: 'setBase' }, gaze: 'key', rules: [clause('Block the man on me; pick up the nearest rusher who comes free', test('defenderOn', { where: 'me' }), [act('block', { target: 'nearestRusher', type: 'base' })])] });

/** A route slot: path from the formation spot, read by the quarterback. */
export const route = (concept: string, path: Slot['path'], extra: Partial<Rest> = {}): Rest => ({ behavior: 'route', path, concept, keys: ['qb'], gaze: 'quarterback', ...extra });
