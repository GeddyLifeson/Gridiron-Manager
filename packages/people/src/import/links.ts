// Real links between people (U2.2.2, X14.2.1 rule 4): `prior` edges between two imported people who are both in
// the world. No memory rows, no events. A family link is a flag the pack states, never an edge and never derived.
import { param } from './params.ts';
import type { PackData } from '../pack/index.ts';
import { groupOfPosition } from './place.ts';

export type PriorEdgeKind = 'coached' | 'teammate' | 'worked_under';
export type EdgeStrength = 'weak' | 'medium' | 'strong';

export interface PriorEdge {
  /** World person ids; for `coached` and `worked_under`, `a` is the coach or senior. */
  a: number;
  b: number;
  kind: PriorEdgeKind;
  seasonsShared: number;
  strength: EdgeStrength;
  source: 'derived' | 'stated';
}

export interface LinkResult {
  edges: PriorEdge[];
  /** Pairs of people the pack states are family (X14.1.1 rule 7). A flag only: no event, no edge. */
  familyFlags: [number, number][];
  /** Links to people not in the world, kept as plain text on the page only (rule 3). */
  offWorld: { personId: number; otherKey: string; kind: string }[];
  /** True when the edge cap cut derived teammate edges (rule 2 bound). */
  capped: boolean;
}

/** Strength from seasons shared (rule 1: 1 season weak, 3 or more strong). */
export function strengthOf(seasons: number): EdgeStrength {
  if (seasons >= param('links.strongSeasons')) return 'strong';
  return seasons <= 1 ? 'weak' : 'medium';
}

/**
 * Derives and collects prior edges. `idOf` maps a source key to a world id for people placed in the world.
 * Derived `coached`: a head coach and a player share an organisation and season (two head coaches in one
 * season each get edges). Derived `teammate`: at least two seasons on one organisation in the same position
 * group. Stated links from the pack's links table are added when both people are present.
 */
export function deriveLinks(pack: PackData, idOf: (key: string) => number | undefined, worldStartYear: number): LinkResult {
  const coachesAt = new Map<string, string[]>();
  for (const r of pack.tables['coaching_seasons']?.rows ?? []) {
    if (r['role'] !== 'head coach' || !r['organisation'] || Number(r['season']) >= worldStartYear) continue;
    const k = `${r['level']}|${r['organisation']}|${r['season']}`;
    (coachesAt.get(k) ?? coachesAt.set(k, []).get(k)!).push(r['source_key']!);
  }
  const position = new Map((pack.tables['playing']?.rows ?? []).map((r) => [r['source_key']!, r['position'] ?? ''] as const));
  const coached = new Map<string, number>();
  const together = new Map<string, number>();
  const rosterAt = new Map<string, string[]>();
  for (const r of pack.tables['player_seasons']?.rows ?? []) {
    if (!r['organisation'] || Number(r['season']) >= worldStartYear) continue;
    const k = `${r['level']}|${r['organisation']}|${r['season']}`;
    for (const c of coachesAt.get(k) ?? []) {
      const pair = `${c}\u0001${r['source_key']}`;
      coached.set(pair, (coached.get(pair) ?? 0) + 1);
    }
    (rosterAt.get(k) ?? rosterAt.set(k, []).get(k)!).push(r['source_key']!);
  }
  for (const [k, keys] of rosterAt) {
    const org = k.slice(0, k.lastIndexOf('|'));
    const byGroup = new Map<string, string[]>();
    for (const key of [...new Set(keys)].filter((x) => idOf(x) !== undefined).sort()) {
      const g = groupOfPosition(position.get(key) ?? '');
      (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(key);
    }
    for (const list of byGroup.values()) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const pair = `${org}\u0001${list[i]}\u0001${list[j]}`;
        together.set(pair, (together.get(pair) ?? 0) + 1);
      }
    }
  }

  const edges: PriorEdge[] = [];
  const seen = new Map<string, PriorEdge>();
  const push = (e: PriorEdge) => {
    const key = `${e.kind}|${Math.min(e.a, e.b)}|${Math.max(e.a, e.b)}`;
    const ex = seen.get(key);
    if (ex) {
      if (e.seasonsShared > ex.seasonsShared) { ex.seasonsShared = e.seasonsShared; ex.strength = strengthOf(e.seasonsShared); }
      return;
    }
    seen.set(key, e); edges.push(e);
  };
  for (const [pair, n] of [...coached.entries()].sort()) {
    const [c, p] = pair.split('\u0001') as [string, string];
    const a = idOf(c), b = idOf(p);
    if (a === undefined || b === undefined || a === b) continue;
    push({ a, b, kind: 'coached', seasonsShared: n, strength: strengthOf(n), source: 'derived' });
  }
  // Teammates: seasons summed per pair across organisations, but each organisation must reach the minimum.
  const teamPairs = new Map<string, number>();
  for (const [k, n] of together) {
    if (n < param('links.teammateMinSeasons')) continue;
    const [, x, y] = k.split('\u0001') as [string, string, string];
    const pk = `${x}\u0001${y}`;
    teamPairs.set(pk, (teamPairs.get(pk) ?? 0) + n);
  }
  const maxEdges = param('links.maxEdges');
  let capped = false;
  for (const [pair, n] of [...teamPairs.entries()].sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1))) {
    if (edges.length >= maxEdges) { capped = true; break; }
    const [x, y] = pair.split('\u0001') as [string, string];
    push({ a: idOf(x)!, b: idOf(y)!, kind: 'teammate', seasonsShared: n, strength: strengthOf(n), source: 'derived' });
  }

  const familyFlags: [number, number][] = [];
  const offWorld: LinkResult['offWorld'] = [];
  for (const r of pack.tables['links']?.rows ?? []) {
    const a = idOf(r['source_key_a']!), b = idOf(r['source_key_b']!);
    const kind = r['kind']!;
    if (a === undefined || b === undefined) {
      if (a !== undefined) offWorld.push({ personId: a, otherKey: r['source_key_b']!, kind });
      if (b !== undefined) offWorld.push({ personId: b, otherKey: r['source_key_a']!, kind });
      continue;
    }
    if (kind === 'family') { familyFlags.push([Math.min(a, b), Math.max(a, b)]); continue; }
    const seasons = (r['seasons'] ?? '').split(/[|;, ]+/).filter((x) => x.length > 0).length || 1;
    if (edges.length >= maxEdges) { capped = true; continue; }
    push({ a, b, kind: kind as PriorEdgeKind, seasonsShared: seasons, strength: strengthOf(seasons), source: 'stated' });
  }
  return { edges, familyFlags, offWorld, capped };
}
