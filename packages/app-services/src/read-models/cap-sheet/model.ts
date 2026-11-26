// Builds the cap sheet (team.cap): every contract's charge this year and in the years ahead, its
// proration, what a release, a designated release or a trade would leave behind, and the club's room
// (C6.1 to C6.4). All arithmetic is the G-16 cap module's; this file only arranges it for the screen.
// Pure: same input, same view.
import type { RuleSet } from '@gm/schema';
import { cap } from '@gm/league';
import { capKey, param } from './params.ts';
import type {
  ChargeParts, ContractRow, MoveKind, MovePreview, OtherRow, ProCapView, Provenance, ProvenanceLookup, RookieRow, TrancheRow, YearColumn,
} from './types.ts';

export interface PlayerCard { readonly personId: number; readonly name: string; readonly position: string }

export interface SheetContract {
  readonly personId: number;
  readonly contract: cap.CapContract;
  readonly player: cap.PlayerCapFacts;
  /** Rookie contracts: the draft round (null for undrafted). Leave out for veteran contracts. */
  readonly rookieRound?: number | null;
  /** Paragraph 5 salary already paid and bonuses already earned this league year (C6.3.2). */
  readonly basePaidCents?: number;
  readonly earnedThisYearCents?: number;
}

export interface ProCapInput {
  readonly clubId: number;
  readonly leagueYear: number;
  readonly phase: cap.CapPhase;
  readonly timing: cap.LeaveTiming;
  readonly rules: RuleSet;
  readonly contracts: readonly SheetContract[];
  readonly other: readonly cap.OtherCharge[];
  readonly adjustmentCents: number;
  /** Dead money already booked for later years, by league year (from earlier moves). */
  readonly futureDead?: Readonly<Record<string, number>>;
  readonly june1Used: number;
  readonly cards: readonly PlayerCard[];
  readonly provenance: ProvenanceLookup;
  /** A cap the world generated for a year the rule set does not cover (P3, history runs). */
  readonly generatedCapCents?: number;
}

export function provenanceOf(lookup: ProvenanceLookup, key: string): Provenance {
  const p = lookup(key);
  return { key, factId: p?.factId ?? null, status: p?.status ?? null };
}

function parts(b: cap.ChargeBreakdown): ChargeParts {
  return {
    baseCents: b.baseCents, prorationCents: b.prorationCents, rosterBonusCents: b.rosterBonusCents,
    workoutBonusCents: b.workoutBonusCents, likelyIncentivesCents: b.likelyIncentivesCents, totalCents: b.totalCents,
  };
}

const hasKey = (rules: RuleSet, key: string) => rules.keys().includes(key);

function teamInput(input: ProCapInput, contracts: readonly SheetContract[], other: readonly cap.OtherCharge[]): cap.TeamCapInput {
  return {
    leagueYear: input.leagueYear, phase: input.phase, adjustmentCents: input.adjustmentCents,
    contracts: contracts.map((c) => ({ contract: c.contract, player: c.player })), other,
    ...(input.generatedCapCents !== undefined ? { generatedCapCents: input.generatedCapCents } : {}),
  };
}

function preview(input: ProCapInput, sc: SheetContract, kind: MoveKind): MovePreview {
  const { rules, leagueYear } = input;
  const leave: cap.LeaveInput = {
    leagueYear, timing: input.timing, basePaidCents: sc.basePaidCents ?? 0, earnedThisYearCents: sc.earnedThisYearCents ?? 0,
  };
  let dead: cap.DeadMoney;
  if (kind === 'trade') {
    dead = cap.tradeCharges(sc.contract, leave, rules).oldClub;
  } else {
    const r = cap.releaseCharges(sc.contract, {
      ...leave, reason: 'skill', june1Designation: kind === 'release_june1', designationsUsed: input.june1Used,
    }, rules);
    if (!r.ok) {
      return { kind, refused: r.reason, deadThisYearCents: 0, deadNextYearCents: 0, guaranteedOwedCents: 0, savingCents: 0, roomAfterCents: 0, chargeUntilJune2Cents: null };
    }
    dead = r;
  }
  const deadNow = dead.byYear.get(leagueYear) ?? 0;
  const rest = input.contracts.filter((c) => c !== sc);
  const after = cap.teamCapPosition(teamInput(input, rest, [...input.other, { label: `dead ${sc.contract.id}`, amountCents: deadNow, kind: 'dead' }]), rules);
  return {
    kind, refused: null, deadThisYearCents: deadNow, deadNextYearCents: dead.byYear.get(leagueYear + 1) ?? 0,
    guaranteedOwedCents: dead.guaranteedOwedCents, savingCents: dead.savingCents, roomAfterCents: after.roomCents,
    chargeUntilJune2Cents: dead.chargeUntilJune2Cents,
  };
}

function tranches(c: cap.CapContract, rules: RuleSet): TrancheRow[] {
  return c.tranches.map((t) => ({
    source: t.source, amountCents: t.amountCents, paidLeagueYear: t.paidLeagueYear,
    byYear: [...cap.prorateTranche(c, t, rules)].map(([leagueYear, cents]) => ({ leagueYear, cents })).sort((a, b) => a.leagueYear - b.leagueYear),
  }));
}

function rookie(sc: SheetContract, rules: RuleSet, lookup: ProvenanceLookup): RookieRow | null {
  if (sc.rookieRound === undefined) return null;
  const round = sc.rookieRound;
  const key = round === null ? 'rookie.length_undrafted' : round === 1 ? 'rookie.length_round_1' : 'rookie.length_later_rounds';
  return {
    round, length: cap.rookieLength(round, rules), lengthSource: provenanceOf(lookup, key),
    increaseBreachYear: cap.increaseRuleBreach(sc.contract, rules),
  };
}

export function buildProCapView(input: ProCapInput): ProCapView {
  const { rules, leagueYear, provenance } = input;
  const position = cap.teamCapPosition(teamInput(input, input.contracts, input.other), rules);
  const lineOf = new Map(position.lines.filter((l) => l.contractId !== null).map((l) => [l.contractId!, l]));
  const cards = new Map(input.cards.map((c) => [c.personId, c]));
  const horizon = Array.from({ length: param('cap_sheet.horizon_years') }, (_, i) => leagueYear + i);
  const moves: MoveKind[] = input.timing === 'on_or_before_june1' ? ['release', 'release_june1', 'trade'] : ['release', 'trade'];

  const rows: ContractRow[] = input.contracts.map((sc) => {
    const c = sc.contract;
    const line = lineOf.get(c.id);
    const card = cards.get(sc.personId);
    const last = c.years.reduce((m, y) => Math.max(m, y.leagueYear), leagueYear);
    return {
      contractId: c.id, personId: sc.personId, name: card?.name ?? `#${sc.personId}`, position: card?.position ?? '', form: c.form,
      thisYear: parts(cap.yearCharge(c, leagueYear, rules)), countedInFull: line?.countedInFull ?? true, countsCents: line?.chargeCents ?? 0,
      byYear: horizon.map((y) => ({ leagueYear: y, chargeCents: cap.yearCharge(c, y, rules).totalCents })),
      lastLeagueYear: last, remainingProrationCents: cap.remainingProration(c, leagueYear, rules),
      tranches: tranches(c, rules), rookie: rookie(sc, rules, provenance),
      minimumSalaryCents: cap.minimumSalary(rules, leagueYear, sc.player.creditedSeasons),
      moves: moves.map((k) => preview(input, sc, k)),
    };
  }).sort((a, b) => b.countsCents - a.countsCents || a.contractId - b.contractId);

  const deadNow = input.other.filter((o) => o.kind === 'dead').reduce((s, o) => s + o.amountCents, 0);
  const years: YearColumn[] = horizon.map((y) => {
    const key = capKey(y);
    const capCents = y === leagueYear ? position.capCents : hasKey(rules, key) ? cap.capAmount(rules, y) : null;
    const committedCents = y === leagueYear ? position.teamSalaryCents : rows.reduce((s, r) => s + (r.byYear.find((b) => b.leagueYear === y)?.chargeCents ?? 0), 0);
    const deadCents = y === leagueYear ? deadNow : input.futureDead?.[String(y)] ?? 0;
    const total = y === leagueYear ? committedCents : committedCents + deadCents;
    return {
      leagueYear: y, capCents, capSource: provenanceOf(provenance, key), committedCents: total, deadCents,
      roomCents: capCents === null ? null : capCents + (y === leagueYear ? input.adjustmentCents : 0) - total,
    };
  });

  const other: OtherRow[] = input.other.map((o) => ({ label: o.label, amountCents: o.amountCents, kind: o.kind }));
  return {
    level: 'pro', clubId: input.clubId, leagueYear, phase: input.phase, timing: input.timing,
    capCents: position.capCents, capSource: provenanceOf(provenance, capKey(leagueYear)), adjustmentCents: position.adjustmentCents,
    teamSalaryCents: position.teamSalaryCents, roomCents: position.roomCents, countedInFull: position.countedInFull,
    topN: rules.num('cap.top_n_contracts'), topNSource: provenanceOf(provenance, 'cap.top_n_contracts'),
    june1: { allowed: rules.num('cap.june1_designations'), used: input.june1Used, source: provenanceOf(provenance, 'cap.june1_designations') },
    prorationMaxYears: rules.num('cap.proration_max_years'), prorationSource: provenanceOf(provenance, 'cap.proration_max_years'),
    years, rows, other,
  };
}
