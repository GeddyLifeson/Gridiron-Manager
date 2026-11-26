// World staff pay (E3.2.1, S9, C6.2.3 rule 1). Each league year every held, paid ladder seat is paid the
// median of its E3.2.1 pay band (career `contract.payBand`), once, at the first weekly pass of the year. The
// club's total goes on its books through `chargeClub`, so cash committed is staff pay plus fines; each
// person's gross pay is kept as personal income, the prior pay that an E6.1.2 opening sheet reads.
// Seats with no sourced band are left unpaid and counted, never given a made-up figure (MO-03, MO-08, MO-09).
// The second college level and off-ladder seats read world bands (bands.json, MO-11) where facts exist.
import { contract } from '@gm/career';
import bandsJson from './bands.json' with { type: 'json' };
import type { JobRecord } from '@gm/schema';
import type { LiveWorld, StepContext, StepDigest, StepHandler } from '../loop/types.ts';
import { isActive } from '../loop/lifecycle.ts';
import { chargeClub } from './club.ts';

/** `LiveWorld.systemState` key of personal income (gross pay received). */
export const PERSON_INCOME_KEY = 'person_income';
/** `LiveWorld.systemState` key of the league years whose staff pay has been charged. */
export const PAYROLL_KEY = 'payroll';
/** Reason on a club's yearly staff pay entry. */
export const STAFF_PAY_REASON = 'staff_pay';

/** One person's gross pay from one club in a league year (E6 entry category "wages"). */
export interface PersonIncome {
  readonly personId: number;
  readonly seasonYear: number;
  readonly teamId: number;
  /** Seat paid: a job row id, or an off-ladder seat id (founding issues both from one counter). */
  readonly jobId: number;
  readonly cents: number;
}
export interface PersonIncomeState { readonly income: readonly PersonIncome[] }
export interface PayrollState { readonly years: readonly number[] }

/** A band table: the three E3.2.1 tiers, or a world tier of bands.json (MO-11). */
export type PayTier = contract.ContractTier | 'college_second';

/**
 * Which band table a club's seats read, or null where no sourced band covers its competition.
 * MO-06 (Assumption): the generated world names no "power four"; a top-level college program in the top
 * resource band (X9.1.1) reads the power four bands, other top-level programs the group of six bands. The
 * second college level reads its own bands (MO-11).
 */
export type PayTierRead = (world: LiveWorld, teamId: number) => PayTier | null;

export const TOP_COLLEGE_COMPETITION = 'college_top';
export const SECOND_COLLEGE_COMPETITION = 'college_second';

type Band = 'low' | 'middle' | 'top';
/**
 * MO-06 band table, read by competition name and then by competition level. A table, not a branch, so no
 * code tests a level word (P1.3.3). A competition found under neither key has no band.
 */
const PAY_TIERS: Readonly<Record<string, Readonly<Record<Band, PayTier>>>> = {
  pro: { low: 'pro', middle: 'pro', top: 'pro' },
  [TOP_COLLEGE_COMPETITION]: { low: 'group_of_six', middle: 'group_of_six', top: 'power_four' },
  [SECOND_COLLEGE_COMPETITION]: { low: 'college_second', middle: 'college_second', top: 'college_second' },
};

/** One world band row, USD per year (bands.json). Status lives in the cited fact rows. */
export interface WorldBand { readonly low: number; readonly median: number; readonly high: number; readonly facts: readonly string[]; readonly note?: string }
interface BandsFile {
  readonly ladder: Readonly<Record<string, Readonly<Record<string, WorldBand>>>>;
  readonly offLadder: Readonly<Record<string, Readonly<Record<string, WorldBand>>>>;
}
export const WORLD_BANDS = bandsJson as unknown as BandsFile;

/** Every world band row with its path, for the citation test. */
export function worldBandRows(file: BandsFile = WORLD_BANDS): { path: string; band: WorldBand }[] {
  const out: { path: string; band: WorldBand }[] = [];
  for (const [t, rows] of Object.entries(file.ladder)) for (const [r, band] of Object.entries(rows)) out.push({ path: `ladder.${t}.${r}`, band });
  for (const [pos, rows] of Object.entries(file.offLadder)) for (const [t, band] of Object.entries(rows)) out.push({ path: `offLadder.${pos}.${t}`, band });
  return out;
}

const CENTS = 100;

/** Median in cents of a world ladder tier at a rung: the nearest row at or below it, as career `payBand` reads. Null below every row. */
function worldLadderCents(tier: string, rung: number, file: BandsFile): number | null {
  const rows = file.ladder[tier];
  if (!rows) return null;
  const keys = Object.keys(rows).map(Number).filter((k) => k <= rung).sort((a, b) => b - a);
  const row = keys.length ? rows[String(keys[0])] : undefined;
  return row ? row.median * CENTS : null;
}

/**
 * MO-11: an off-ladder seat's yearly pay, the median of its world band for the club's tier, in cents. Null
 * where no row exists: the owner seat (an owner is not on payroll), team and university presidents (no
 * team-president figure found; university presidents are a proxy only), strength and game-management staff,
 * and power four athletic directors (the typical-pay row is a Conflict).
 */
export function offLadderPay(world: LiveWorld, seat: { readonly teamId: number; readonly positionId: string }, tier: PayTierRead = defaultPayTier, file: BandsFile = WORLD_BANDS): number | null {
  const t = tier(world, seat.teamId);
  const row = t === null ? undefined : file.offLadder[seat.positionId]?.[t];
  return row ? row.median * CENTS : null;
}

export const defaultPayTier: PayTierRead = (world, teamId) => {
  const t = world.teams.find((x) => x.id === teamId);
  const c = t && world.competitions.find((x) => x.id === t.competitionId);
  if (!t || !c) return null;
  const row = PAY_TIERS[c.name] ?? PAY_TIERS[c.level];
  return row ? row[t.resourceBand] : null;
};

/**
 * MO-05: a seat's yearly pay is its band median at revenue index 1. E3.2.1 sets an offer at the band median
 * times a leverage multiplier (E3.5.2); the off-screen world runs no negotiation, so the multiplier is 1.
 * The bands are in 2025 dollars and every league year reads them unchanged (MO-02: today's rules throughout).
 * A seat marked unpaid pays nothing. Null where the club's competition has no band.
 */
export function seatPay(world: LiveWorld, job: JobRecord, tier: PayTierRead = defaultPayTier, file: BandsFile = WORLD_BANDS): number | null {
  const t = tier(world, job.teamId);
  if (t === null) return null;
  if (t in file.ladder) {
    const cents = worldLadderCents(t, job.rung, file);
    if (cents === null) return null;
    return job.paid === 'none' ? 0 : cents;
  }
  if (job.paid === 'none') return 0;
  return contract.payBand(t as contract.ContractTier, job.rung).medianCents;
}

export function personIncomeOf(world: LiveWorld): PersonIncomeState {
  return (world.systemState.get(PERSON_INCOME_KEY) as PersonIncomeState | undefined) ?? { income: [] };
}

export function payrollOf(world: LiveWorld): PayrollState {
  return (world.systemState.get(PAYROLL_KEY) as PayrollState | undefined) ?? { years: [] };
}

/** What one league year's payroll did. */
export interface PayrollRun {
  readonly seasonYear: number;
  /** People paid, and the cents paid in all. */
  readonly paid: number;
  readonly cents: number;
  /** Held seats left unpaid because their competition has no sourced band (MO-09). */
  readonly noBand: number;
  /** Held off-ladder seats with no world band (owner seat, presidents, strength staff, power four AD): not paid (MO-08, MO-11). */
  readonly offLadderUnpaid: number;
  /** Already run for this year: nothing charged again. */
  readonly already: boolean;
}

/**
 * Charge a league year's staff pay, once. Seats are read in id order. MO-07: a person is paid once per club
 * per year, for his best-paid seat there (S1.1.1 lets one person hold two seats); an acting holder keeps his
 * own seat's pay and is not paid for the seat he covers; an interim holder is paid as the holder. Folded
 * clubs pay nothing.
 */
export function payStaffYear(world: LiveWorld, seasonYear: number, tier: PayTierRead = defaultPayTier): PayrollRun {
  const done = payrollOf(world);
  if (done.years.includes(seasonYear)) return { seasonYear, paid: 0, cents: 0, noBand: 0, offLadderUnpaid: 0, already: true };
  const best = new Map<string, { teamId: number; personId: number; seatId: number; cents: number }>();
  const offer = (teamId: number, personId: number, seatId: number, cents: number): void => {
    const key = `${teamId}:${personId}`;
    const prev = best.get(key);
    if (!prev || cents > prev.cents) best.set(key, { teamId, personId, seatId, cents });
  };
  let noBand = 0;
  for (const job of [...world.jobs.values()].sort((a, b) => a.id - b.id)) {
    if (job.holderPersonId === null || job.holding === 'acting' || !isActive(world, job.teamId, seasonYear)) continue;
    const cents = seatPay(world, job, tier);
    if (cents === null) { noBand++; continue; }
    offer(job.teamId, job.holderPersonId, job.id, cents);
  }
  let offLadderUnpaid = 0;
  for (const seat of [...world.offLadder.values()].sort((a, b) => a.seatId - b.seatId)) {
    if (seat.holderPersonId === null || !isActive(world, seat.teamId, seasonYear)) continue;
    const cents = offLadderPay(world, seat, tier);
    if (cents === null) { offLadderUnpaid++; continue; }
    offer(seat.teamId, seat.holderPersonId, seat.seatId, cents);
  }
  const rows: PersonIncome[] = [...best.values()]
    .filter((b) => b.cents > 0)
    .map((b) => ({ personId: b.personId, seasonYear, teamId: b.teamId, jobId: b.seatId, cents: b.cents }))
    .sort((a, b) => a.teamId - b.teamId || a.personId - b.personId);
  const byTeam = new Map<number, number>();
  for (const r of rows) byTeam.set(r.teamId, (byTeam.get(r.teamId) ?? 0) + r.cents);
  for (const [teamId, cents] of [...byTeam].sort((a, b) => a[0] - b[0])) chargeClub(world, { teamId, seasonYear, cents, reason: STAFF_PAY_REASON });
  world.systemState.set(PERSON_INCOME_KEY, { income: [...personIncomeOf(world).income, ...rows] });
  world.systemState.set(PAYROLL_KEY, { years: [...done.years, seasonYear] });
  return { seasonYear, paid: rows.length, cents: rows.reduce((a, r) => a + r.cents, 0), noBand, offLadderUnpaid, already: false };
}

/** A person's gross pay in one league year, or (no year) over his life. */
export function grossPay(world: LiveWorld, personId: number, seasonYear?: number): number {
  return personIncomeOf(world).income
    .filter((r) => r.personId === personId && (seasonYear === undefined || r.seasonYear === seasonYear))
    .reduce((a, r) => a + r.cents, 0);
}

/**
 * A person's gross pay by league year, oldest first, years with no pay left out: the `priorPayCents` an
 * E6.1.2 head_coach opening sheet compounds.
 */
export function priorPay(world: LiveWorld, personId: number): number[] {
  const by = new Map<number, number>();
  for (const r of personIncomeOf(world).income) if (r.personId === personId) by.set(r.seasonYear, (by.get(r.seasonYear) ?? 0) + r.cents);
  return [...by].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
}

/** A club's staff pay charged in a league year. */
export function staffPayCommitted(world: LiveWorld, teamId: number, seasonYear: number): number {
  return personIncomeOf(world).income.filter((r) => r.teamId === teamId && r.seasonYear === seasonYear).reduce((a, r) => a + r.cents, 0);
}

/**
 * The weekly step with the league year's payroll run before it, the first time the step sees that year
 * (MO-07). Bind it around a weekly step, for example `payrollStep(complianceStep(cb))`, so pay is on the
 * books before any fine of the same week.
 */
export function payrollStep(inner: StepHandler, tier: PayTierRead = defaultPayTier): StepHandler {
  return (ctx: StepContext): StepDigest | void => {
    const run = payStaffYear(ctx.world, ctx.world.date.seasonYear, tier);
    const d = inner(ctx);
    if (run.already) return d;
    return { ...(d ?? {}), payrollPaid: run.paid, payrollCents: run.cents, payrollNoBand: run.noBand, payrollOffLadderUnpaid: run.offLadderUnpaid };
  };
}
