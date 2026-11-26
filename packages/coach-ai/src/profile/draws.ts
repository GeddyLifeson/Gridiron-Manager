// Random draws come from the caller as a `Draws` source. An `@gm/engine-core` Stream satisfies it
// structurally: the world package passes `stream(seed, 'worldgen', [...])` for generation (J13.4.1)
// and `stream(seed, 'careerDrift', [season, personId])` for between-season change. coach-ai may not
// import engine-core directly (P1.2.1), and it never uses platform random (P1.1.1).
export interface Draws {
  /** Uniform in [0, 1). */
  uniform(): number;
  /** Standard normal. */
  normal(): number;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** A standard normal correlated at `r` with a given standard score `zIn` (K2.2.1 rule 4). */
export function correlatedNormal(d: Draws, zIn: number, r: number): number {
  return r * zIn + Math.sqrt(1 - r * r) * d.normal();
}

/** Index drawn from non-negative weights, in the order given. */
export function pickWeighted(d: Draws, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (total <= 0) throw new Error('pickWeighted: no positive weight');
  let u = d.uniform() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i]! > 0 ? weights[i]! : 0;
    if (u < w) return i;
    u -= w;
  }
  return weights.length - 1;
}

/** Keys of a weight record in sorted order, so the draw never depends on insertion order. */
export function pickKey(d: Draws, weights: Readonly<Record<string, number>>): string {
  const keys = Object.keys(weights).sort();
  return keys[pickWeighted(d, keys.map((k) => weights[k]!))]!;
}
