// ISO day arithmetic with integers only (core code reads no platform clock or Date, P1.1.1).
// Days-from-civil and its inverse for the proleptic Gregorian calendar (H. Hinnant, "chrono-Compatible
// Low-Level Date Algorithms"). Checked against known dates in test/decisions/dates.test.ts.

const ISO = /^(-?\d{4,})-(\d{2})-(\d{2})$/;

function fdiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function daysFromIso(iso: string): number {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`not an ISO day: ${iso}`);
  let y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new Error(`not an ISO day: ${iso}`);
  y -= mo <= 2 ? 1 : 0;
  const era = fdiv(y, 400);
  const yoe = y - era * 400;
  const doy = fdiv(153 * (mo + (mo > 2 ? -3 : 9)) + 2, 5) + d - 1;
  const doe = yoe * 365 + fdiv(yoe, 4) - fdiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

export function isoFromDays(z0: number): string {
  const z = z0 + 719468;
  const era = fdiv(z, 146097);
  const doe = z - era * 146097;
  const yoe = fdiv(doe - fdiv(doe, 1460) + fdiv(doe, 36524) - fdiv(doe, 146096), 365);
  const doy = doe - (365 * yoe + fdiv(yoe, 4) - fdiv(yoe, 100));
  const mp = fdiv(5 * doy + 2, 153);
  const d = doy - fdiv(153 * mp + 2, 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  return `${y < 0 ? '-' : ''}${pad(Math.abs(y), 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

export function addDays(iso: string, days: number): string {
  return isoFromDays(daysFromIso(iso) + days);
}

/** Negative, zero or positive as a is before, on or after b. */
export function compareIso(a: string, b: string): number {
  return daysFromIso(a) - daysFromIso(b);
}
