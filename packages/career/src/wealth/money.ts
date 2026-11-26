// Money is held in integer cents everywhere in the wealth module, so balances add up to the cent (E6.1.1 acceptance 1).
export type Cents = number;

const CENTS_PER_DOLLAR = 100;

/** Round half away from zero to a whole cent. */
export function roundCents(x: number): Cents {
  const r = Math.round(Math.abs(x));
  return x < 0 ? -r : r;
}

export function dollars(usd: number): Cents {
  return roundCents(usd * CENTS_PER_DOLLAR);
}

export function toDollars(c: Cents): number {
  return c / CENTS_PER_DOLLAR;
}

/** (1 + r)^n for a whole n by repeated multiplication (core purity bans platform pow). */
export function compound(r: number, n: number): number {
  let out = 1;
  for (let i = 0; i < n; i++) out *= 1 + r;
  return out;
}
