// Route tags (I2.3.2, G4.1.1 "tag" slot): a tag sends one receiver on a different route, "Z post". No new route
// is drawn here: every route shape is taken from a play already in the content (its stem and break as authored
// and sourced there, ROUTE_DEPTH basis), stored relative to the receiver's side, and re-laid from the tagged
// receiver's own alignment. Depth stays as authored (yards past the line); the lateral part is measured outward
// from the receiver, so an outside break stays outside on either side. A tag is "installed" when the team
// runs that route in an installed play: the caller combines pieces the players know.
import type { PlayDef, Pt, Slot } from '../starter/types.ts';
import { FULL_PLAYS } from './offense.ts';

/** Receivers a route tag can move (numbered from the sideline in; backs keep their play's job). */
export const TAG_RECEIVERS = ['X', 'Z', 'Y', 'H'] as const;
/** Keep a re-laid route this far inside the sideline: the field is 53 1/3 yd wide, so 26.67 yd each side. */
const SIDELINE_LIMIT_YD = 25;

export interface RouteShape {
  readonly name: string;
  /** Points: depth as authored, `out` yards outward from the receiver's alignment (inward negative). */
  readonly points: readonly { readonly px: number; readonly out: number; readonly kind?: Pt['kind'] }[];
  /** The play the shape was taken from. */
  readonly from: string;
}

const routeName = (s: Slot): string | null => (s.behavior === 'route' && typeof s.params?.route === 'string' && s.path?.length ? s.params.route : null);
const side = (py: number): number => (py < 0 ? -1 : 1);

function buildTree(plays: readonly PlayDef[]): ReadonlyMap<string, RouteShape> {
  const out = new Map<string, RouteShape>();
  for (const p of plays) for (const s of p.slots) {
    const name = routeName(s);
    if (!name || out.has(name) || !(TAG_RECEIVERS as readonly string[]).includes(s.role)) continue;
    const sg = side(s.at[1]);
    out.set(name, { name, from: p.id, points: s.path!.map((q) => ({ px: q.px, out: (q.py - s.at[1]) * sg, ...(q.kind ? { kind: q.kind } : {}) })) });
  }
  return out;
}

/** Every receiver route in the content, by name, first authored occurrence. */
export const ROUTE_TREE: ReadonlyMap<string, RouteShape> = buildTree(FULL_PLAYS);

export const routeTagId = (role: string, route: string): string => `route:${role}:${route}`;
export function parseRouteTag(id: string): { role: string; route: string } | null {
  const m = /^route:([A-Z]+):([A-Za-z]+)$/.exec(id);
  return m ? { role: m[1]!, route: m[2]! } : null;
}

export interface RouteTag { readonly id: string; readonly role: string; readonly route: string; readonly label: string }

/** Tags a play can take: each receiver running a route, any route in the tree other than the one he has. */
export function routeTagsFor(play: PlayDef): RouteTag[] {
  const out: RouteTag[] = [];
  for (const s of play.slots) {
    if (!(TAG_RECEIVERS as readonly string[]).includes(s.role) || s.behavior !== 'route') continue;
    const now = routeName(s);
    for (const name of ROUTE_TREE.keys()) if (name !== now) out.push({ id: routeTagId(s.role, name), role: s.role, route: name, label: `${s.role} ${name}` });
  }
  return out;
}

/** Routes a set of plays runs (receivers only): what "installed" means for a route tag. */
export function routesRun(plays: Iterable<PlayDef>): Set<string> {
  const out = new Set<string>();
  for (const p of plays) for (const s of p.slots) { const n = routeName(s); if (n && (TAG_RECEIVERS as readonly string[]).includes(s.role)) out.add(n); }
  return out;
}

function relay(s: Slot, shape: RouteShape): Slot {
  const sg = side(s.at[1]);
  const path = shape.points.map((q) => {
    const py = Math.max(-SIDELINE_LIMIT_YD, Math.min(SIDELINE_LIMIT_YD, s.at[1] + q.out * sg));
    return q.kind ? { px: q.px, py, kind: q.kind } : { px: q.px, py };
  });
  return { ...s, path, params: { ...(s.params ?? {}), route: shape.name } };
}

/**
 * The play with its route tags applied (unknown or non-route tags are ignored). The id carries the tags so a
 * cache keyed on the id keeps tagged and untagged versions apart. With no route tag the play is returned as is.
 */
export function withRouteTags(play: PlayDef, tags: readonly string[]): PlayDef {
  const byRole = new Map<string, RouteShape>();
  for (const t of tags) {
    const r = parseRouteTag(t);
    const shape = r ? ROUTE_TREE.get(r.route) : undefined;
    if (r && shape) byRole.set(r.role, shape);
  }
  let changed = false;
  const slots = play.slots.map((s) => {
    const shape = byRole.get(s.role);
    if (!shape || s.behavior !== 'route') return s;
    changed = true;
    return relay(s, shape);
  });
  if (!changed) return play;
  const used = [...byRole.entries()].filter(([role]) => play.slots.some((s) => s.role === role && s.behavior === 'route')).map(([role, sh]) => routeTagId(role, sh.name)).sort();
  return { ...play, id: `${play.id}+${used.join('+')}`, slots };
}
