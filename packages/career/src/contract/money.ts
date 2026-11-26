// Integer cents for contract money. Kept local: the E6.12.1 firewall bars career modules other than wealth,
// reputation and life from importing the wealth module, and the contract feeds job security (E4).
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
