// Deterministic math for the label engine. Core packages may not call platform transcendental functions
// (P1.1.1), so 2^x is built from a fixed series: the same bits on every platform.

const LN2 = 0.6931471805599453;
const SERIES_TERMS = 24;

/** 2^f for f in [0, 1), by the exponential series of f*ln2. */
function pow2Frac(f: number): number {
  const x = f * LN2;
  let term = 1;
  let sum = 1;
  for (let k = 1; k <= SERIES_TERMS; k++) { term = (term * x) / k; sum += term; }
  return sum;
}

/** 2^x for any finite x. */
export function pow2(x: number): number {
  const k = Math.floor(x);
  let r = pow2Frac(x - k);
  if (k >= 0) for (let i = 0; i < k; i++) r *= 2;
  else for (let i = 0; i < -k; i++) r /= 2;
  return r;
}

/** 0.5^(age/halfLife): N2.8.1 rule 2 evidence weight. */
export function decayWeight(ageSeasons: number, halfLifeSeasons: number): number {
  return pow2(-ageSeasons / halfLifeSeasons);
}
