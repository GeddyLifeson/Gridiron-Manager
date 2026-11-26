// Drafting a contract from the defaults block (E3.1.1, E3.2, E3.3, E3.8.1), the record checks, and the
// mapping to the world contract's CoachContractTerms.
import { roundCents, type Cents } from './money.ts';
import { defaultsBlock, ladder, type DefaultsBlock } from './defaults.ts';
import { cparam } from './params.ts';
import {
  DEFAULT_CAUSE_GROUNDS, type BuyoutForm, type BuyoutTerms, type CoachContract, type ContractRandom, type ContractTier,
  type Incentive, type OtherClause, type RosterAuthority, type SalaryYear, type SeatClass, type StaffTerms,
} from './types.ts';

export interface DraftInput {
  readonly id: number;
  readonly coachId: number;
  readonly employerId: number;
  readonly jobId: number;
  readonly seatId: string;
  readonly tier: ContractTier;
  readonly seat: SeatClass;
  readonly rung: number;
  readonly startYear: number;
  /** Calendar month each contract year begins; default 1. */
  readonly startMonth?: number;
  /** Total first-year pay (base plus supplemental). */
  readonly firstYearPayCents: Cents;
  /** Share of pay written as media and endorsement pay (college head coach structure, E3.8.1). Default 0. */
  readonly supplementalShare?: number;
  /** Term in years; default the block's default. */
  readonly years?: number;
  readonly rosterAuthority?: RosterAuthority;
  readonly otherClauses?: readonly OtherClause[];
  readonly staff?: StaffTerms;
  readonly agentId?: number | null;
  readonly signingBonusCents?: Cents;
}

const NO_STAFF: StaffTerms = { poolCents: 0, sizeCap: 0, mayReplaceAll: false, requiredKeepIds: [], assistantsMayBring: 0 };

/** Draw from [min, max] with the median as the mode of a two-sided uniform split (half the mass each side). */
export function drawAroundMedian(rng: ContractRandom, min: number, median: number, max: number): number {
  const u = rng.next();
  return u < 0.5 ? min + (median - min) * (u / 0.5) : median + (max - median) * ((u - 0.5) / 0.5);
}

export function drawWeighted<K extends string>(rng: ContractRandom, weights: Partial<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let u = rng.next() * total;
  for (const [k, w] of entries) { if (u < w) return k; u -= w; }
  const last = entries[entries.length - 1];
  if (!last) throw new Error('contract: empty weight table');
  return last[0];
}

function salarySchedule(inp: DraftInput, years: number, raise: number): SalaryYear[] {
  const sup = inp.supplementalShare ?? 0;
  const out: SalaryYear[] = [];
  let pay = inp.firstYearPayCents;
  for (let i = 0; i < years; i++) {
    const total = roundCents(pay);
    const supplementalCents = roundCents(total * sup);
    out.push({ leagueYear: inp.startYear + i, baseCents: total - supplementalCents, supplementalCents });
    pay *= 1 + raise;
  }
  return out;
}

export function yearPay(y: SalaryYear): Cents {
  return y.baseCents + y.supplementalCents;
}

function incentivesFor(block: DefaultsBlock, firstYearPay: Cents): { list: Incentive[]; cap: Cents } {
  const b = block.bonus.v;
  if (b.form === 'none' || !b.ladder) return { list: [], cap: 0 };
  const l = ladder(b.ladder);
  const list: Incentive[] = [];
  for (const [trigger, x] of Object.entries(l.triggers) as [Incentive['trigger'], number][]) {
    const amountCents = l.unit === 'usd' ? roundCents(x * 100) : roundCents(x * firstYearPay);
    list.push({ trigger, amountCents, fromWins: trigger === 'win_threshold' ? (l.winThresholdFrom ?? null) : null });
  }
  const cap = b.capUsd > 0 ? roundCents(b.capUsd * 100) : roundCents(b.capShare * firstYearPay);
  return { list, cap };
}

function buyoutFor(block: DefaultsBlock, rng: ContractRandom, salary: readonly SalaryYear[], guaranteeShare: number): BuyoutTerms {
  const bv = block.buyout.v;
  const form: BuyoutForm = drawWeighted(rng, bv.forms);
  const s = bv.shareOfFiredAmount.min + (bv.shareOfFiredAmount.max - bv.shareOfFiredAmount.min) * rng.next();
  const base: BuyoutTerms = { form, fixedByYearCents: [], perRemainingYearCents: 0, share: 0, ladder: null, promotionWaiver: false };
  const remainingFrom = (i: number) => salary.slice(i).reduce((x, y) => x + yearPay(y), 0);
  switch (form) {
    case 'none': return base;
    case 'pct_remaining': return { ...base, share: s * guaranteeShare };
    case 'fixed_by_year': return { ...base, fixedByYearCents: salary.map((_, i) => roundCents(s * guaranteeShare * remainingFrom(i))) };
    case 'per_remaining_year': return { ...base, perRemainingYearCents: roundCents(s * guaranteeShare * remainingFrom(0) / Math.max(1, salary.length)) };
    case 'assistant_ladder': return { ...base, ladder: [1, 0.5, 0.25], promotionWaiver: true };
  }
}

/** Draft a contract from the tier and seat defaults. Every draw uses the caller's stream, in a fixed order. */
export function draftContract(inp: DraftInput, rng: ContractRandom): CoachContract {
  const block = defaultsBlock(inp.tier, inp.seat);
  const t = block.termYears.v;
  const years = Math.min(t.max, Math.max(t.min, inp.years ?? t.default));
  const raise = cparam('salaryRaiseMin') + (cparam('salaryRaiseMax') - cparam('salaryRaiseMin')) * rng.next();
  const salary = salarySchedule(inp, years, raise);
  const g = block.guarantee.v;
  const gShare = g.form === 'share_of_remaining' ? drawAroundMedian(rng, g.min, g.median, g.max) : g.max;
  const o = block.offset.v;
  const offsetOn = rng.next() < o.onShare;
  const income = rng.next() < o.footballRelatedShare ? 'football_related' as const : 'coaching_only' as const;
  const buyout = buyoutFor(block, rng, salary, gShare);
  const periods = block.payPeriods.v;
  const payPeriods = periods[Math.min(periods.length - 1, Math.floor(rng.next() * periods.length))] ?? periods[0] ?? 1;
  const inc = incentivesFor(block, yearPay(salary[0]!));
  const endYear = inp.startYear + years - 1;
  return {
    id: inp.id, coachId: inp.coachId, employerId: inp.employerId, jobId: inp.jobId, seatId: inp.seatId, tier: inp.tier, seat: inp.seat, rung: inp.rung,
    startYear: inp.startYear, startMonth: inp.startMonth ?? 1, endYear, salary, signingBonusCents: inp.signingBonusCents ?? 0,
    incentives: inc.list, incentiveCapCents: inc.cap,
    bonusRequiresEmploymentOnEventDate: true, bonusRequiresEmploymentOnPayDate: false,
    bonusComplianceCondition: inp.seat === 'head_coach',
    guarantee: { form: g.form, share: gShare, months: g.months, guaranteedThroughYear: endYear },
    offset: { on: offsetOn, income, marketFloor: o.marketFloor },
    causeGrounds: DEFAULT_CAUSE_GROUNDS, cureDays: block.cureDays.v, maxUnpaidSuspensionDays: block.maxUnpaidSuspensionDays.v,
    reportNewJobDays: block.reportNewJobDays.v, buyout, releaseHeldByClub: block.buyout.v.releaseHeldByClub,
    resignationWindow: block.resignationWindow.v, clubOptionYear: null, coachOptionYear: null,
    rosterAuthority: inp.rosterAuthority ?? 'gm_final', otherClauses: inp.otherClauses ?? [], staff: inp.staff ?? NO_STAFF,
    perquisites: [], payPeriods, agentId: inp.agentId ?? null, agentFeeShare: inp.agentId ? block.agentFeeShare.v.default : 0,
    rollover: { trigger: 'none', winTotal: null, maxUnexpiredYears: block.maxUnexpiredYears.v }, termCapYears: null, state: 'offered',
  };
}

/** Record checks (E3.1.1 acceptance and field ranges). Empty when the contract is well formed. */
export function contractProblems(c: CoachContract): string[] {
  const p: string[] = [];
  if (c.endYear < c.startYear) p.push('end before start');
  if (c.salary.length !== c.endYear - c.startYear + 1) p.push('salary years do not cover the term');
  c.salary.forEach((y, i) => { if (y.leagueYear !== c.startYear + i) p.push(`salary year ${i} is ${y.leagueYear}`); if (y.baseCents < 0 || y.supplementalCents < 0) p.push(`negative pay in ${y.leagueYear}`); });
  const unit = (x: number, name: string) => { if (!(x >= 0 && x <= 1)) p.push(`${name} outside 0..1`); };
  unit(c.guarantee.share, 'guarantee share'); unit(c.agentFeeShare, 'agent fee'); unit(c.buyout.share, 'buyout share');
  if (c.guarantee.guaranteedThroughYear < c.startYear || c.guarantee.guaranteedThroughYear > c.endYear) p.push('guaranteed_through outside the term');
  if (c.payPeriods < 1) p.push('pay periods');
  if (c.termCapYears !== null && c.endYear - c.startYear + 1 > c.termCapYears) p.push('term over the state cap');
  if (c.staff.requiredKeepIds.length > c.staff.sizeCap && c.staff.sizeCap > 0) p.push('required keeps exceed staff size cap');
  return p;
}

/** Map to the world contract's CoachContractTerms. Lossy until CR-G51-1 adds the missing fields. */
export function toWorldTerms(c: CoachContract) {
  const guarantee = c.guarantee.share >= 1 && c.guarantee.form === 'share_of_remaining'
    ? { type: 'full' as const }
    : c.guarantee.share <= 0 && c.guarantee.months <= 0 ? { type: 'none' as const }
      : { type: 'partial' as const, amountCents: roundCents(c.salary.reduce((x, y) => x + yearPay(y), 0) * c.guarantee.share) };
  return {
    kind: 'coach' as const,
    jobId: c.jobId,
    salary: c.salary.map((y) => ({ leagueYear: y.leagueYear, amountCents: yearPay(y) })),
    signingBonusCents: c.signingBonusCents,
    incentives: c.incentives.map((i) => ({ triggerKey: i.trigger, amountCents: i.amountCents })),
    guarantee,
    offset: c.offset.on,
    withCauseClauseKeys: [...c.causeGrounds],
    buyout: c.salary.map((y, i) => ({ leagueYear: y.leagueYear, amountCents: buyoutAtYearStart(c, i) })),
    clubOptionYear: c.clubOptionYear,
    coachOptionYear: c.coachOptionYear,
    authorityClauseKeys: [c.rosterAuthority, ...c.otherClauses],
    staffTerms: { poolCents: c.staff.poolCents, assistantsMayBring: c.staff.assistantsMayBring },
    perquisites: c.perquisites.map((x) => ({ key: x.key, amountCents: x.amountCents })),
    agentFeeShare: c.agentId === null ? null : c.agentFeeShare,
  };
}

/** Buyout owed by the coach on the first day of contract year i (helper for the world mapping and the resign screen). */
export function buyoutAtYearStart(c: CoachContract, i: number): Cents {
  const remaining = c.salary.slice(i).reduce((x, y) => x + yearPay(y), 0);
  switch (c.buyout.form) {
    case 'none': return 0;
    case 'fixed_by_year': return c.buyout.fixedByYearCents[i] ?? 0;
    case 'per_remaining_year': return c.buyout.perRemainingYearCents * (c.salary.length - i);
    case 'pct_remaining': return roundCents(remaining * c.buyout.share);
    case 'assistant_ladder': return roundCents(remaining * c.guarantee.share * (c.buyout.ladder?.[i === 0 ? 0 : 2] ?? 0));
  }
}
