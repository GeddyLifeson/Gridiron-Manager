// Deterministic powers for the decode and dummy formulas (G4.4.3, G4.4.4). Core purity (P1.1.1) bans
// platform transcendental math, and this package may import only @gm/schema (P1.2.1), so the engine's
// dPow is out of reach. These use only + - * / on doubles, which IEEE 754 makes identical on every
// platform. Accuracy: relative error under 1e-12 on the ranges used (base in (0, 1], exponent 0 to 1e4).

const LN2 = 0.6931471805599453;

/** x^n for a whole n >= 0 by squaring. */
export function powInt(x: number, n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new Error(`powInt needs a whole exponent >= 0, got ${n}`);
  let result = 1;
  let b = x;
  let e = n;
  while (e > 0) {
    if (e % 2 === 1) result *= b;
    b *= b;
    e = Math.floor(e / 2);
  }
  return result;
}

/** Natural log for x > 0: reduce to m in [0.5, 1) times 2^k, then the atanh series. */
export function lnDet(x: number): number {
  if (!(x > 0)) throw new Error(`lnDet needs x > 0, got ${x}`);
  let k = 0;
  let m = x;
  while (m >= 1) { m /= 2; k++; }
  while (m < 0.5) { m *= 2; k--; }
  const z = (m - 1) / (m + 1);
  const z2 = z * z;
  let term = z;
  let sum = 0;
  for (let i = 1; i < 80; i += 2) {
    const add = term / i;
    sum += add;
    if (add < 1e-18 && add > -1e-18) break;
    term *= z2;
  }
  return 2 * sum + k * LN2;
}

/** e^y: split y = k ln2 + r with |r| <= ln2 / 2, Taylor on r, scale by 2^k. */
export function expDet(y: number): number {
  if (y === 0) return 1;
  const k = Math.round(y / LN2);
  const r = y - k * LN2;
  let term = 1;
  let sum = 1;
  for (let i = 1; i < 40; i++) {
    term = (term * r) / i;
    sum += term;
    if (term < 1e-18 && term > -1e-18) break;
  }
  return k >= 0 ? sum * powInt(2, k) : sum / powInt(2, -k);
}

/** x^y for x >= 0 and any real y. */
export function powReal(x: number, y: number): number {
  if (y === 0) return 1;
  if (x === 0) return 0;
  if (Number.isInteger(y) && y > 0) return powInt(x, y);
  return expDet(y * lnDet(x));
}
