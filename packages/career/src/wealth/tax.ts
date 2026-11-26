// E6.2 Taxes: federal income tax, payroll tax, state tax by location, take-home pay.
// Tables come from tables.json + facts.json; nothing here is a hard-coded tax number.
import tablesJson from './tables.json' with { type: 'json' };
import { factNumber, factString, parseSchedule, isShippable, isProvisional } from './facts.ts';
import { roundCents, dollars, type Cents } from './money.ts';

export type FilingStatus = 'single' | 'married_joint';

export interface Bracket { readonly fromCents: Cents; readonly rate: number }

export interface FederalTable {
  readonly brackets: readonly Bracket[];
  readonly standardDeductionCents: Cents;
  /** Long-term gains schedule: 0% from 0, 15% from the max zero amount, 20% from the max 15% amount. */
  readonly ltcg: readonly Bracket[];
  readonly additionalMedicareThresholdCents: Cents;
}

export interface TaxTable {
  readonly year: number;
  readonly federal: Readonly<Record<FilingStatus, FederalTable>>;
  readonly oasdiWageBaseCents: Cents;
  readonly oasdiRate: number;
  readonly medicareRate: number;
  readonly additionalMedicareRate: number;
  readonly electiveDeferralLimitCents: Cents;
  readonly catchUpLimitCents: Cents;
  /** Fact ids used, so screens can mark provisional figures. */
  readonly factIds: readonly string[];
}

export type StateProfile =
  | { readonly id: string; readonly kind: 'none'; readonly factId: string }
  | { readonly id: string; readonly kind: 'flat'; readonly rate: number; readonly factId: string }
  | { readonly id: string; readonly kind: 'brackets'; readonly brackets: readonly Bracket[]; readonly factId: string };

type TablesFile = typeof tablesJson;

function schedule(id: string): Bracket[] {
  return parseSchedule(factString(id)).map((b) => ({ fromCents: dollars(b.from), rate: b.rate }));
}

/** Build the tax table from a tables file (default: the shipped one). Replacing the file changes results. */
export function loadTaxTable(file: TablesFile = tablesJson): TaxTable {
  const fed = (s: FilingStatus): FederalTable => {
    const f = file.federal[s];
    return {
      brackets: schedule(f.brackets),
      standardDeductionCents: dollars(factNumber(f.standardDeduction)),
      ltcg: schedule(f.ltcg),
      additionalMedicareThresholdCents: dollars(factNumber(f.additionalMedicareThreshold)),
    };
  };
  const ids = [
    ...Object.values(file.federal).flatMap((f) => Object.values(f)),
    ...Object.values(file.payroll), ...Object.values(file.retirement),
  ];
  return {
    year: file.taxYear,
    federal: { single: fed('single'), married_joint: fed('married_joint') },
    oasdiWageBaseCents: dollars(factNumber(file.payroll.oasdiWageBase)),
    oasdiRate: factNumber(file.payroll.oasdiRate),
    medicareRate: factNumber(file.payroll.medicareRate),
    additionalMedicareRate: factNumber(file.payroll.additionalMedicareRate),
    electiveDeferralLimitCents: dollars(factNumber(file.retirement.electiveDeferralLimit)),
    catchUpLimitCents: dollars(factNumber(file.retirement.catchUpLimit)),
    factIds: ids,
  };
}

export function loadStateProfiles(file: TablesFile = tablesJson): ReadonlyMap<string, StateProfile> {
  const out = new Map<string, StateProfile>();
  for (const s of file.states) {
    if (s.kind === 'none') out.set(s.id, { id: s.id, kind: 'none', factId: s.fact });
    else out.set(s.id, { id: s.id, kind: 'flat', rate: factNumber(s.fact), factId: s.fact });
  }
  return out;
}

/** E6.2.2 rule 5: rows without a usable source cannot ship; a release build check lists them. */
export function stateProfileWarnings(profiles: ReadonlyMap<string, StateProfile>): string[] {
  const out: string[] = [];
  for (const p of profiles.values()) {
    if (!isShippable(p.factId)) out.push(`${p.id}: ${p.factId} cannot ship (conflict or unverified)`);
    else if (isProvisional(p.factId)) out.push(`${p.id}: ${p.factId} PROVISIONAL`);
  }
  return out;
}

/** E6.2.1 rule 1: thresholds indexed by inflation for later save years (rounded to whole dollars). */
export function indexTaxTable(t: TaxTable, years: number, inflation: number): TaxTable {
  let f = 1;
  for (let i = 0; i < years; i++) f *= 1 + inflation;
  const ix = (c: Cents) => dollars(Math.round((c / 100) * f));
  const ixb = (bs: readonly Bracket[]) => bs.map((b) => ({ fromCents: ix(b.fromCents), rate: b.rate }));
  const fed = (x: FederalTable): FederalTable => ({
    brackets: ixb(x.brackets), standardDeductionCents: ix(x.standardDeductionCents), ltcg: ixb(x.ltcg),
    // The additional Medicare threshold is fixed in law, not indexed.
    additionalMedicareThresholdCents: x.additionalMedicareThresholdCents,
  });
  return {
    ...t, year: t.year + years,
    federal: { single: fed(t.federal.single), married_joint: fed(t.federal.married_joint) },
    oasdiWageBaseCents: ix(t.oasdiWageBaseCents),
    electiveDeferralLimitCents: ix(t.electiveDeferralLimitCents),
    catchUpLimitCents: ix(t.catchUpLimitCents),
  };
}

/** Progressive tax of `amount` over a bracket schedule. */
export function progressive(amount: Cents, brackets: readonly Bracket[]): Cents {
  if (amount <= 0) return 0;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i]!;
    const top = i + 1 < brackets.length ? brackets[i + 1]!.fromCents : Number.POSITIVE_INFINITY;
    if (amount <= b.fromCents) break;
    tax += (Math.min(amount, top) - b.fromCents) * b.rate;
  }
  return roundCents(tax);
}

/** Tax on long-term gains stacked on top of ordinary taxable income. */
export function ltcgTax(ordinaryTaxable: Cents, gains: Cents, schedule: readonly Bracket[]): Cents {
  if (gains <= 0) return 0;
  const base = Math.max(0, ordinaryTaxable);
  return roundCents(progressive(base + gains, schedule) - progressive(base, schedule));
}

export interface YearIncome {
  /** Wages: salary, incentives, termination pay. */
  readonly wagesCents: Cents;
  /** Other ordinary income with no withholding: speaking, camps, interest, rent (E6.2.1 rule 3). */
  readonly otherOrdinaryCents?: Cents;
  readonly longTermGainsCents?: Cents;
  /** Employee contributions to a qualifying retirement plan (E6.9.1 rule 2). Capped at the table limit. */
  readonly retirementContribCents?: Cents;
  readonly age?: number;
}

export interface TaxBreakdown {
  readonly taxableOrdinaryCents: Cents;
  readonly federalIncomeCents: Cents;
  readonly oasdiCents: Cents;
  readonly medicareCents: Cents;
  readonly additionalMedicareCents: Cents;
  readonly stateCents: Cents;
  readonly totalCents: Cents;
  readonly retirementContribCents: Cents;
}

const CATCH_UP_AGE = 50;

export function contributionLimit(t: TaxTable, age = 0): Cents {
  return t.electiveDeferralLimitCents + (age >= CATCH_UP_AGE ? t.catchUpLimitCents : 0);
}

export function stateTax(profile: StateProfile, income: Cents): Cents {
  if (income <= 0) return 0;
  switch (profile.kind) {
    case 'none': return 0;
    case 'flat': return roundCents(income * profile.rate);
    case 'brackets': return progressive(income, profile.brackets);
  }
}

/** E6.2.2 rule 2: work state and a different residence state, the higher of the two applies. */
export function stateTaxWorkAndResidence(work: StateProfile, residence: StateProfile | undefined, income: Cents): Cents {
  const w = stateTax(work, income);
  return residence ? Math.max(w, stateTax(residence, income)) : w;
}

/** E6.2.2 rule 4: a move in mid-year splits the year by days. */
export function stateTaxByDays(segments: readonly { readonly profile: StateProfile; readonly days: number }[], income: Cents): Cents {
  const total = segments.reduce((a, s) => a + s.days, 0);
  if (total <= 0) return 0;
  return segments.reduce((a, s) => a + stateTax(s.profile, roundCents((income * s.days) / total)), 0);
}

/** E6.2.1 yearly tax. Simplifications stated by the leaf: standard deduction only, no AMT, no credits. */
export function yearTax(t: TaxTable, status: FilingStatus, inc: YearIncome, state?: { work: StateProfile; residence?: StateProfile }): TaxBreakdown {
  const fed = t.federal[status];
  const contrib = Math.min(Math.max(0, inc.retirementContribCents ?? 0), contributionLimit(t, inc.age), Math.max(0, inc.wagesCents));
  const ordinary = inc.wagesCents + (inc.otherOrdinaryCents ?? 0) - contrib;
  const gains = Math.max(0, inc.longTermGainsCents ?? 0);
  const afterDeduction = ordinary - fed.standardDeductionCents;
  const taxableOrdinary = Math.max(0, afterDeduction);
  // Unused deduction reduces gains.
  const taxableGains = Math.max(0, gains + Math.min(0, afterDeduction));
  const federalIncome = progressive(taxableOrdinary, fed.brackets) + ltcgTax(taxableOrdinary, taxableGains, fed.ltcg);
  const wages = Math.max(0, inc.wagesCents);
  const oasdi = roundCents(Math.min(wages, t.oasdiWageBaseCents) * t.oasdiRate);
  const medicare = roundCents(wages * t.medicareRate);
  const addl = roundCents(Math.max(0, wages - fed.additionalMedicareThresholdCents) * t.additionalMedicareRate);
  // State: flat or bracketed tax on income less qualifying contributions (no state deductions modelled yet).
  const stateBase = Math.max(0, ordinary + gains);
  const st = state ? stateTaxWorkAndResidence(state.work, state.residence, stateBase) : 0;
  return {
    taxableOrdinaryCents: taxableOrdinary,
    federalIncomeCents: federalIncome,
    oasdiCents: oasdi, medicareCents: medicare, additionalMedicareCents: addl,
    stateCents: st,
    totalCents: federalIncome + oasdi + medicare + addl + st,
    retirementContribCents: contrib,
  };
}

/** E6.2.1 output: the take-home figure shown beside a salary (E2.5.1), after tax and before contributions. */
export function takeHome(t: TaxTable, status: FilingStatus, salaryCents: Cents, work: StateProfile, residence?: StateProfile): Cents {
  return salaryCents - yearTax(t, status, { wagesCents: salaryCents }, { work, residence }).totalCents;
}

/** E6.2.1 rule 3: monthly withholding is the yearly estimate on withheld income divided by twelve. */
export function monthlyWithholding(t: TaxTable, status: FilingStatus, yearlyWagesCents: Cents, yearlyContribCents: Cents, work: StateProfile, residence?: StateProfile, age?: number): Cents {
  const y = yearTax(t, status, { wagesCents: yearlyWagesCents, retirementContribCents: yearlyContribCents, age }, { work, residence });
  return roundCents(y.totalCents / 12);
}
