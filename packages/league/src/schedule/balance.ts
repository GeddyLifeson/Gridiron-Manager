// Home-and-away orientation with preferences (T3.1.1 rule 5: hosts alternate within a pairing; each
// team's conference homes stay within one of half its games). Start from each edge's preferred host,
// then move one home at a time along a directed path, preferring paths that break no preference
// (0-1 breadth-first search). Every step keeps all other teams' home counts unchanged.

export interface OrientEdge {
  readonly a: number;
  readonly b: number;
  /** Preferred host (a or b), or -1 for none. */
  readonly pref: number;
}

export function orientBalanced(
  n: number,
  edges: readonly OrientEdge[],
  lo: readonly number[],
  hi: readonly number[],
  coin: () => boolean,
): number[] | null {
  const host = edges.map((e) => (e.pref >= 0 ? e.pref : coin() ? e.a : e.b));
  const homes = new Array<number>(n).fill(0);
  host.forEach((h) => { homes[h]!++; });
  const adj: number[][] = Array.from({ length: n }, () => []);
  edges.forEach((e, k) => { adj[e.a]!.push(k); adj[e.b]!.push(k); });
  const flipCost = (k: number) => (edges[k]!.pref >= 0 && host[k] === edges[k]!.pref ? 1 : 0);

  /**
   * Find a path from `start` and flip it. forward = true: start gives up a home (follow edges start
   * hosts); the end gains one and must satisfy `canEnd`. forward = false: start gains a home (follow
   * edges hosted against it); the end loses one.
   */
  const shift = (start: number, forward: boolean, canEnd: (v: number) => boolean): boolean => {
    const dist = new Array<number>(n).fill(Number.MAX_SAFE_INTEGER);
    const via = new Array<number>(n).fill(-1);
    const prev = new Array<number>(n).fill(-1);
    dist[start] = 0;
    const deque: number[] = [start];
    let best = -1;
    while (deque.length) {
      const u = deque.shift()!;
      if (u !== start && canEnd(u)) { if (best < 0 || dist[u]! < dist[best]!) best = u; continue; }
      for (const k of adj[u]!) {
        const e = edges[k]!;
        const v = e.a === u ? e.b : e.a;
        const ok = forward ? host[k] === u : host[k] === v;
        if (!ok) continue;
        const d = dist[u]! + flipCost(k);
        if (d < dist[v]!) {
          dist[v] = d;
          via[v] = k;
          prev[v] = u;
          if (flipCost(k) === 0) deque.unshift(v);
          else deque.push(v);
        }
      }
    }
    if (best < 0) return false;
    for (let v = best; v !== start; v = prev[v]!) {
      const k = via[v]!;
      const e = edges[k]!;
      host[k] = host[k] === e.a ? e.b : e.a;
    }
    if (forward) { homes[start]!--; homes[best]!++; } else { homes[start]!++; homes[best]!--; }
    return true;
  };

  const guard = edges.length * (n + 1);
  for (let step = 0; step < guard; step++) {
    const over = homes.findIndex((h, i) => h > hi[i]!);
    if (over >= 0) { if (!shift(over, true, (v) => homes[v]! < hi[v]!)) return null; continue; }
    const under = homes.findIndex((h, i) => h < lo[i]!);
    if (under >= 0) { if (!shift(under, false, (v) => homes[v]! > lo[v]!)) return null; continue; }
    return host;
  }
  return null;
}
