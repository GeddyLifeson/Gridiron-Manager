// Engine-owned transcendental math (J13.3.1, P1.1.5). Built only from IEEE 754 double add, subtract,
// multiply, divide, square root, and exact bit manipulation, which are identical on every conforming
// engine. The platform's own sin, cos, exp, log, pow, atan are not used anywhere in core code,
// because the language standard lets engines approximate them differently.
// Range reduction constants are the split constants of fdlibm (Sun Microsystems, freely
// redistributable), chosen so that k * constant is exact for the ranges used.

export const PI = 3.141592653589793;
export const TWO_PI = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

const LN2_HI = 6.93147180369123816490e-01; // high bits of ln 2, trailing zeros make k*LN2_HI exact
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700e+00;
const SQRT2 = 1.4142135623730951;

const PIO2_1 = 1.57079632673412561417e+00; // first 33 bits of pi/2
const PIO2_2 = 6.07710050630396597660e-11; // second 33 bits
const PIO2_3 = 2.02226624871116645580e-21; // third 33 bits
const PIO2_3T = 8.47842766036889956997e-32; // remainder
const INV_PIO2 = 6.36619772367581382433e-01;

const PIO2_HI = 1.57079632679489655800e+00;
const PIO2_LO = 6.12323399573676603587e-17;
const PIO6 = 0.5235987755982989; // nearest double to pi/6
const PIO6_LO = -5.3604088322554549741e-17; // pi/6 - PIO6, from a 50-digit reference (mpmath)
const SQRT3 = 1.7320508075688772;
const TAN_PI_12 = 0.2679491924311227; // 2 - sqrt(3)

const scratch = new DataView(new ArrayBuffer(8));

/** Exact 2^k for integer k in [-1022, 1023], built from bits. */
function pow2(k: number): number {
  scratch.setUint32(0, ((k + 1023) << 20) >>> 0, false);
  scratch.setUint32(4, 0, false);
  return scratch.getFloat64(0, false);
}

/** Multiply by 2^k for any integer k, staying exact except when the result is subnormal. */
function scaleB(x: number, k: number): number {
  while (k > 1023) { x *= pow2(1023); k -= 1023; }
  while (k < -1022) { x *= pow2(-1022); k += 1022; }
  return x * pow2(k);
}

export function dSqrt(x: number): number {
  // Square root is correctly rounded by IEEE 754, so the platform function is safe.
  return Math.sqrt(x);
}

export function dExp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019412) return 0;
  const k = Math.round(x * INV_LN2);
  const r = (x - k * LN2_HI) - k * LN2_LO; // |r| <= ~0.347
  // Taylor series to r^20 / 20!, Horner form.
  let p = 1 / 2432902008176640000; // 1/20!
  const inv = [
    1 / 121645100408832000, 1 / 6402373705728000, 1 / 355687428096000, 1 / 20922789888000,
    1 / 1307674368000, 1 / 87178291200, 1 / 6227020800, 1 / 479001600, 1 / 39916800, 1 / 3628800,
    1 / 362880, 1 / 40320, 1 / 5040, 1 / 720, 1 / 120, 1 / 24, 1 / 6, 1 / 2, 1, 1,
  ];
  for (let i = 0; i < inv.length; i++) p = p * r + inv[i]!;
  return scaleB(p, k);
}

/** Splits a positive finite x into m * 2^e with m in [sqrt(1/2), sqrt(2)). */
function frexpLog(x: number): [number, number] {
  let e = 0;
  if (x < 2.2250738585072014e-308) { x *= 18014398509481984; e = -54; } // subnormal: scale by 2^54
  scratch.setFloat64(0, x, false);
  const hi = scratch.getUint32(0, false);
  const exp = ((hi >>> 20) & 0x7ff) - 1023;
  scratch.setUint32(0, ((hi & 0x800fffff) | (1023 << 20)) >>> 0, false);
  let m = scratch.getFloat64(0, false); // [1, 2)
  e += exp;
  if (m > SQRT2) { m *= 0.5; e += 1; }
  return [m, e];
}

export function dLog(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  const [m, e] = frexpLog(x);
  const s = (m - 1) / (m + 1);
  const z = s * s;
  // 2s * (1 + z/3 + z^2/5 + ... + z^13/27)
  let p = 1 / 27;
  for (let n = 25; n >= 1; n -= 2) p = p * z + 1 / n;
  const logm = 2 * s * p;
  return e * LN2_HI + (logm + e * LN2_LO);
}

function sinPoly(r: number): number {
  const z = r * r;
  // r - r^3/3! + ... - r^23/23!
  let p = -1 / 25852016738884976640000; // -1/23!
  const c = [
    1 / 51090942171709440000, -1 / 121645100408832000, 1 / 355687428096000, -1 / 1307674368000,
    1 / 6227020800, -1 / 39916800, 1 / 362880, -1 / 5040, 1 / 120, -1 / 6,
  ];
  for (let i = 0; i < c.length; i++) p = p * z + c[i]!;
  return r + r * z * p;
}

function cosPoly(r: number): number {
  const z = r * r;
  // 1 - r^2/2! + r^4/4! - ... + r^22/22!, Horner form in z.
  let p = 1 / 1124000727777607680000; // 1/22!
  const c = [
    -1 / 2432902008176640000, 1 / 6402373705728000, -1 / 20922789888000, 1 / 87178291200,
    -1 / 479001600, 1 / 3628800, -1 / 40320, 1 / 720, -1 / 24, 1 / 2,
  ];
  for (let i = 0; i < c.length; i++) p = p * z + c[i]!;
  // p = 1/2 - z/4! + z^2/6! - ... , so cos r = 1 - z * p.
  return 1 - z * p;
}

/** Reduces x to r in [-pi/4, pi/4] and quadrant q in {0,1,2,3}. Accurate for |x| up to about 2^19 * pi/2. */
function reduce(x: number): [number, number] {
  const k = Math.round(x * INV_PIO2);
  const r = (((x - k * PIO2_1) - k * PIO2_2) - k * PIO2_3) - k * PIO2_3T;
  const q = ((k % 4) + 4) % 4;
  return [r, q];
}

export function dSin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [r, q] = reduce(x);
  switch (q) {
    case 0: return sinPoly(r);
    case 1: return cosPoly(r);
    case 2: return -sinPoly(r);
    default: return -cosPoly(r);
  }
}

export function dCos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [r, q] = reduce(x);
  switch (q) {
    case 0: return cosPoly(r);
    case 1: return -sinPoly(r);
    case 2: return -cosPoly(r);
    default: return sinPoly(r);
  }
}

/** atan for 0 <= t <= tan(pi/12), odd Taylor series to t^35. */
function atanSmall(t: number): number {
  const z = t * t;
  let p = -1 / 35;
  for (let n = 33; n >= 3; n -= 2) p = p * z + ((n - 1) / 2 % 2 === 0 ? 1 / n : -1 / n);
  return t + t * z * p;
}

export function dAtan(x: number): number {
  if (x !== x) return NaN;
  if (x < 0) return -dAtan(-x);
  if (x === Infinity) return PIO2_HI;
  if (x > 1) return (PIO2_HI - atanPos(1 / x)) + PIO2_LO;
  return atanPos(x);
}

function atanPos(t: number): number {
  // t in [0, 1]
  if (t <= TAN_PI_12) return atanSmall(t);
  const u = (t * SQRT3 - 1) / (SQRT3 + t);
  return PIO6 + (u >= 0 ? atanSmall(u) : -atanSmall(-u)) + PIO6_LO;
}

export function dAtan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (x === 0 && y === 0) return 0;
  if (x === 0) return y > 0 ? HALF_PI : -HALF_PI;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    if (Number.isFinite(x)) return y > 0 ? HALF_PI : -HALF_PI;
    if (Number.isFinite(y)) return x > 0 ? 0 : (y >= 0 ? PI : -PI);
    // both infinite
    const a = x > 0 ? PI / 4 : 3 * PI / 4;
    return y > 0 ? a : -a;
  }
  const a = dAtan(y / x);
  if (x > 0) return a;
  return y >= 0 ? (a + PIO2_HI * 2) + PIO2_LO * 2 : (a - PIO2_HI * 2) - PIO2_LO * 2;
}

export function dPow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  if (Number.isInteger(y) && Math.abs(y) <= 2147483647) {
    let n = Math.abs(y);
    let base = x;
    let acc = 1;
    while (n > 0) {
      if (n % 2 === 1) acc *= base;
      base *= base;
      n = Math.floor(n / 2);
    }
    return y < 0 ? 1 / acc : acc;
  }
  if (x < 0) return NaN;
  if (x === 0) return y > 0 ? 0 : Infinity;
  return dExp(y * dLog(x));
}

/** 1 / (1 + e^-x), clamped at plus and minus 30 (J13.3.1). */
export function logistic(x: number): number {
  const c = x > 30 ? 30 : x < -30 ? -30 : x;
  return 1 / (1 + dExp(-c));
}
