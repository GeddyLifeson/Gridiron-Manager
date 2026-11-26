// Player contracts for every club whose league has a cap (C6, C8.3.1), the yearly player payroll charged to
// the club's books (C6.2.3 rule 1), and the minimum team cash spending floor checked at the end of each
// period, with any shortfall paid to the period's players and logged (C6.2.3 rule 2, CBA Art. 12 s.9).
// Every figure comes from a rule key (cap, minimums, rookie lengths, the floor percent) or from the owner's
// budget the money module already draws (C6.2.3 rule 3); see README decisions PC-01 to PC-10.
import { stream } from '@gm/engine-core';
import { cap as capRules, market } from '@gm/league';
import type { ContractRecord, RuleSet } from '@gm/schema';
import type { LiveWorld, StepContext, StepDigest, StepHandler } from '../loop/types.ts';
import { isActive } from '../loop/lifecycle.ts';
import { cashBudget, chargeClub, clubMoneyOf, capFromRules, type CapCents } from '../money/club.ts';
import { ageIn, gradeContext, levelOfTeam, rosteredSet, type GradeContext, type Level, type RuleRead } from '../turnover/binding.ts';
import { PLAYER_DRAFTED, PLAYER_SIGNED } from '../turnover/events.ts';
import { ageCurve } from '../turnover/front-office.ts';
import { param as turnoverParam } from '../turnover/params.ts';
import { KNOWN_FLOOR_PERIODS, param, type FloorPeriod } from './params.ts';
import { contractsOf, lastYear, salaryIn, setContracts, type ContractsState, type FloorCheck, type PlayerContract } from './state.ts';

/** Reason on a club's yearly player pay entry (C6.2.3 rule 1). The floor counts these only (MO-10). */
export const PLAYER_PAY_REASON = 'player_pay';
/** Reason prefix on a floor shortfall payment, `floor_shortfall:<from>-<to>`. */
export const FLOOR_SHORTFALL_REASON = 'floor_shortfall';
/** J13 stream of a founding contract's remaining years (PC-03). */
export const STREAM_FOUNDING = 'world.contracts.founding';

export interface ContractsBinding {
  readonly rule: RuleRead;
  /** Names of the rule keys a level holds: the cap module reads the minimum salary bands from key names. */
  readonly keys: (level: Level) => readonly string[];
  /** The rules year every league year reads (MO-02: today's rules throughout). */
  readonly rulesYear: number;
  /** A club the world must not write contracts for (for example the user's club once the career module owns it). */
  readonly skipTeam?: (world: LiveWorld, teamId: number) => boolean;
}

/** A RuleSet over the binding's reader for one level, with its key names, for the league cap module. */
export function ruleSetFor(b: ContractsBinding, level: Level): RuleSet {
  const num = (k: string): number => {
    const v = b.rule(level, k);
    if (v === undefined) throw new Error(`league ${level} holds no rule ${k}`);
    return v;
  };
  return { id: `world:${level}`, level: level as RuleSet['level'], seasonYear: b.rulesYear, num, bool: (k) => num(k) !== 0, opt: (k) => String(num(k)), keys: () => [...b.keys(level)] };
}

/** The floor period holding a league year: a CBA period, else four-year periods on either side (PC-04). */
export function floorPeriodOf(year: number): FloorPeriod {
  const known = KNOWN_FLOOR_PERIODS.find((p) => year >= p.from && year <= p.to);
  if (known) return known;
  const len = param('floor.periodYears');
  const first = KNOWN_FLOOR_PERIODS[0]!, last = KNOWN_FLOOR_PERIODS[KNOWN_FLOOR_PERIODS.length - 1]!;
  if (year > last.to) {
    const from = last.to + 1 + Math.floor((year - last.to - 1) / len) * len;
    return { from, to: from + len - 1 };
  }
  const to = first.from - 1 - Math.floor((first.from - 1 - year) / len) * len;
  return { from: to - len + 1, to };
}

const NONE = { skill: false, cap: false, injury: false };
const FULL = { skill: true, cap: true, injury: true };
const FIRST_ROUND = 1;

type Signing = { readonly kind: 'drafted'; readonly round: number } | { readonly kind: 'undrafted' } | { readonly kind: 'veteran' };

interface Run {
  readonly world: LiveWorld;
  readonly b: ContractsBinding;
  readonly year: number;
  readonly cap: CapCents;
  readonly grades: GradeContext;
  readonly signings: ReadonlyMap<number, Signing>;
  readonly founding: boolean;
  state: ContractsState;
  signed: number;
  ended: number;
  releasedGuaranteeCents: number;
}

function credited(world: LiveWorld, id: number): number {
  return world.people.get(id)?.playing?.eligibility.pro.creditedSeasons ?? 0;
}

function contractYear(leagueYear: number, cents: number, guarantee: typeof NONE): PlayerContract['terms']['years'][number] {
  return {
    leagueYear, baseSalary: { amountCents: cents, guarantee }, optionBonus: null, rosterBonuses: [], workoutBonusCents: 0,
    incentives: [], voidable: false, option: 'none',
  };
}

function newContract(r: Run, personId: number, teamId: number, form: PlayerContract['terms']['form'], years: PlayerContract['terms']['years']): PlayerContract {
  const id = r.state.nextId;
  r.state = { ...r.state, nextId: id + 1 };
  r.signed++;
  const c: ContractRecord = {
    id, personId, teamId, signed: r.world.date, agentId: null, state: 'active', summaryKey: null,
    terms: { kind: 'player', form, signingBonusCents: 0, signingBonusPaidOn: r.world.date, years: [...years], offset: false, noTrade: false },
  };
  return c as PlayerContract;
}

/** Quantile of a list, linear between ranks (the turnover front office reads replacement level the same way). */
function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/**
 * Contracts for one club's rostered players who hold none (PC-01 to PC-03). Rookies sign the fixed rookie
 * length at the minimum for each year's credited seasons; veterans are paid their minimum plus the club's
 * rate times their observed grade above the club's replacement level, the rate spreading the owner's budget
 * (capped at the cap) over the whole roster. New veteran money is cut back to fit under the cap.
 */
function openClub(r: Run, teamId: number, rules: RuleSet, capCents: number, keep: readonly PlayerContract[]): PlayerContract[] {
  const { world, year } = r;
  const roster = [...(world.rosters.get(teamId) ?? [])].sort((a, b) => a - b);
  const held = new Set(keep.map((c) => c.personId));
  const fresh = roster.filter((id) => !held.has(id) && world.people.get(id)?.playing);
  if (fresh.length === 0) return [];
  const minimum = (id: number, k = 0) => capRules.minimumSalary(rules, r.b.rulesYear, credited(world, id) + k);
  const budget = cashBudget(world, teamId, year, r.cap) ?? capCents;
  const target = Math.min(budget, capCents);

  // PC-02: the club's rate per point of observed grade above its replacement level at the position.
  const byPos = new Map<string, number[]>();
  for (const id of roster) {
    const pos = world.people.get(id)?.playing?.position;
    if (pos) byPos.set(pos, [...(byPos.get(pos) ?? []), r.grades.grade(teamId, id)]);
  }
  const all = [...byPos.values()].flat();
  const repl = new Map<string, number>();
  const surplus = (id: number): number => {
    const pos = world.people.get(id)!.playing!.position;
    let q = repl.get(pos);
    if (q === undefined) { q = quantile(byPos.get(pos) ?? all, turnoverParam('gm.replacementQuantile')); repl.set(pos, q); }
    return Math.max(0, r.grades.grade(teamId, id) - q);
  };
  const sumMin = roster.reduce((s, id) => s + (world.people.get(id)?.playing ? minimum(id) : 0), 0);
  const sumW = roster.reduce((s, id) => s + (world.people.get(id)?.playing ? surplus(id) : 0), 0);
  const rate = sumW > 0 ? Math.max(0, target - sumMin) / sumW : 0;

  const out: PlayerContract[] = [];
  let committed = keep.reduce((s, c) => s + salaryIn(c, year), 0);
  // Rookies first: their pay is fixed by rule (C6.4.2 rule 1, PC-05).
  const vets: number[] = [];
  for (const id of fresh) {
    const sg = r.signings.get(id);
    if (!sg || sg.kind === 'veteran') { vets.push(id); continue; }
    const round = sg.kind === 'drafted' ? sg.round : null;
    const n = capRules.rookieLength(round, rules);
    const g = round === FIRST_ROUND ? FULL : NONE;
    const years = Array.from({ length: n }, (_, k) => contractYear(year + k, minimum(id, k), g));
    committed += years[0]!.baseSalary.amountCents;
    out.push(newContract(r, id, teamId, 'rookie', years));
  }
  // PC-02: veterans' money above the minimum, scaled down so the year's payroll fits under the cap.
  const extra = vets.map((id) => rate * surplus(id));
  const extraSum = extra.reduce((s, x) => s + x, 0);
  const room = capCents - committed - vets.reduce((s, id) => s + minimum(id), 0);
  const scale = extraSum > room ? Math.max(0, room) / extraSum : 1;
  const curve = ageCurve();
  vets.forEach((id, i) => {
    const p = world.people.get(id)!;
    const apy = minimum(id) + Math.floor(extra[i]! * scale);
    // PC-03: C8.3.1 rule 3, years shrink with age: productive years left to the D8 prime end, 1 to the market ceiling.
    let n = Math.min(market.P.maxContractYears, Math.max(1, curve.primeEndAge(p.playing!.position) - ageIn(p, year)));
    if (r.founding) n = stream(world.seed, STREAM_FOUNDING, [teamId, id]).int(1, n);
    const years = Array.from({ length: n }, (_, k) => contractYear(year + k, Math.max(apy, minimum(id, k)), NONE));
    out.push(newContract(r, id, teamId, apy === minimum(id) ? 'minimum' : 'veteran', years));
  });
  return out;
}

/** End contracts that ran out, of players gone from the club's roster, or of players out of football (PC-06). */
function closeContracts(r: Run): PlayerContract[] {
  const { world, year } = r;
  const keep: PlayerContract[] = [];
  for (const c of r.state.active) {
    const onRoster = (world.rosters.get(c.teamId) ?? []).includes(c.personId) && isActive(world, c.teamId, year);
    if (onRoster && lastYear(c) >= year && world.status.get(c.personId) === 'active') { keep.push(c); continue; }
    r.ended++;
    // PC-06: a release before the last year still owes the guaranteed salary of the years left, paid now.
    if (lastYear(c) >= year && world.status.get(c.personId) === 'active') {
      const owed = c.terms.years.filter((y) => y.leagueYear >= year && y.baseSalary.guarantee.skill).reduce((s, y) => s + y.baseSalary.amountCents, 0);
      if (owed > 0) {
        chargeClub(world, { teamId: c.teamId, seasonYear: year, cents: owed, reason: PLAYER_PAY_REASON });
        r.releasedGuaranteeCents += owed;
      }
    }
  }
  return keep;
}

/** C6.2.3 rule 2: check every floor period that ended last league year, once, and pay any shortfall to its players. */
function checkFloors(r: Run): number {
  const { world, b, year } = r;
  const period = floorPeriodOf(year - 1);
  const key = `${period.from}-${period.to}`;
  if (period.to !== year - 1 || r.state.checkedPeriods.includes(key)) return 0;
  const counted = r.state.paidYears.filter((y) => y >= period.from && y <= period.to);
  const checks: FloorCheck[] = [];
  let total = 0;
  for (const [teamKey, players] of Object.entries(r.state.periodRoster).sort((x, y) => Number(x[0]) - Number(y[0]))) {
    const teamId = Number(teamKey);
    if (counted.length === 0 || !isActive(world, teamId, year - 1)) continue;
    const caps = counted.map((y) => r.cap(world, teamId, y) ?? 0);
    const spent = counted.map((y) => clubMoneyOf(world).payments
      .filter((p) => p.teamId === teamId && p.seasonYear === y && p.reason === PLAYER_PAY_REASON).reduce((s, p) => s + p.cents, 0));
    const f = capRules.cashFloor(caps, spent, ruleSetFor(b, levelOfTeam(world, teamId)));
    const ids = [...players].sort((x, y) => x - y);
    let recipients: FloorCheck['recipients'] = [];
    if (f.shortfallCents > 0) {
      chargeClub(world, { teamId, seasonYear: year, cents: f.shortfallCents, reason: `${FLOOR_SHORTFALL_REASON}:${key}` });
      total += f.shortfallCents;
      // PC-08: equal shares; the CBA leaves the split to the NFLPA's allocation instructions.
      const share = ids.length > 0 ? Math.floor(f.shortfallCents / ids.length) : 0;
      let rest = f.shortfallCents - share * ids.length;
      recipients = ids.map((personId) => {
        const extra = rest > 0 ? 1 : 0;
        rest -= extra;
        return { personId, cents: share + extra };
      });
    }
    checks.push({ teamId, from: period.from, to: period.to, yearsCounted: counted.length, ...f, paidYear: year, recipients });
  }
  r.state = { ...r.state, periodRoster: {}, checkedPeriods: [...r.state.checkedPeriods, key], floorChecks: [...r.state.floorChecks, ...checks] };
  return total;
}

export interface ContractYearRun {
  readonly seasonYear: number;
  readonly signed: number;
  readonly ended: number;
  readonly active: number;
  readonly playerPayCents: number;
  readonly floorShortfallCents: number;
  readonly already: boolean;
}

/**
 * One league year's contract work, once: check a floor period that just closed, end and open contracts,
 * then charge each capped club the year's player salaries through `chargeClub` (C6.2.3 rule 1).
 * `signings` names this year's drafted (with round) and undrafted signings; anyone else new signs as a veteran.
 */
export function runContractYear(world: LiveWorld, b: ContractsBinding, signings: ReadonlyMap<number, Signing> = new Map()): ContractYearRun {
  const year = world.date.seasonYear;
  const start = contractsOf(world);
  if (start.paidYears.includes(year)) return { seasonYear: year, signed: 0, ended: 0, active: start.active.length, playerPayCents: 0, floorShortfallCents: 0, already: true };
  const cap = capFromRules(b.rule, b.rulesYear);
  const r: Run = {
    world, b, year, cap, grades: gradeContext(world, rosteredSet(world)), signings,
    founding: start.paidYears.length === 0, state: start, signed: 0, ended: 0, releasedGuaranteeCents: 0,
  };
  const floorShortfallCents = checkFloors(r);
  const keep = closeContracts(r);
  const opened: PlayerContract[] = [];
  const teams = world.teams.filter((t) => isActive(world, t.id, year) && !(b.skipTeam?.(world, t.id) ?? false)).map((t) => t.id).sort((x, y) => x - y);
  const paidBy = new Map<number, number>();
  const roster: Record<string, readonly number[]> = { ...r.state.periodRoster };
  for (const teamId of teams) {
    const capCents = cap(world, teamId, year);
    if (capCents === undefined) continue;
    const rules = ruleSetFor(b, levelOfTeam(world, teamId));
    const mine = keep.filter((c) => c.teamId === teamId);
    opened.push(...openClub(r, teamId, rules, capCents, mine));
  }
  const active = [...keep, ...opened].sort((x, y) => x.id - y.id);
  for (const c of active) {
    paidBy.set(c.teamId, (paidBy.get(c.teamId) ?? 0) + salaryIn(c, year));
    const k = String(c.teamId);
    if (!(roster[k] ?? []).includes(c.personId)) roster[k] = [...(roster[k] ?? []), c.personId];
  }
  let pay = 0;
  for (const [teamId, cents] of [...paidBy].sort((x, y) => x[0] - y[0])) {
    if (cents <= 0) continue;
    chargeClub(world, { teamId, seasonYear: year, cents, reason: PLAYER_PAY_REASON });
    pay += cents;
  }
  setContracts(world, { ...r.state, active, paidYears: [...r.state.paidYears, year], periodRoster: roster });
  return { seasonYear: year, signed: r.signed, ended: r.ended, active: active.length, playerPayCents: pay + r.releasedGuaranteeCents, floorShortfallCents, already: false };
}

/** Player cash a club paid in a league year: salaries and released guarantees, not staff pay or fines. */
export function playerCashPaid(world: LiveWorld, teamId: number, seasonYear: number): number {
  return clubMoneyOf(world).payments.filter((p) => p.teamId === teamId && p.seasonYear === seasonYear && p.reason === PLAYER_PAY_REASON).reduce((s, p) => s + p.cents, 0);
}

/**
 * The moves step with the league year's contract work run after it, the first time it sees the year.
 * Bind it around the roster cycle, `contractsStep(b, movesStep(tb, rosterMovesStep(tb)))`, so the year's
 * draft and signings are on rosters before contracts open. It reads the cycle's `player_drafted` and
 * undrafted `player_signed` events as they are emitted, and passes every event through unchanged.
 */
export function contractsStep(b: ContractsBinding, inner: StepHandler): StepHandler {
  return (ctx: StepContext): StepDigest | void => {
    const signings = new Map<number, Signing>();
    const spy: StepContext = {
      world: ctx.world, step: ctx.step, source: ctx.source,
      tierOfTeam: (t) => ctx.tierOfTeam(t),
      open: (name, scope) => ctx.open(name, scope),
      markOutOfFootball: (id) => ctx.markOutOfFootball(id),
      emit: (e) => {
        const subject = e.subjects?.[0];
        const payload = e.payload ?? {};
        if (subject && subject.kind === 'person') {
          if (e.type === PLAYER_DRAFTED && typeof payload.round === 'number') signings.set(subject.id, { kind: 'drafted', round: payload.round });
          if (e.type === PLAYER_SIGNED && payload.kind === 'undrafted') signings.set(subject.id, { kind: 'undrafted' });
        }
        return ctx.emit(e);
      },
    };
    const d = inner(spy);
    const run = runContractYear(ctx.world, b, signings);
    if (run.already) return d;
    return {
      ...(d ?? {}), contractsSigned: run.signed, contractsEnded: run.ended, contractsActive: run.active,
      playerPayCents: run.playerPayCents, floorShortfallCents: run.floorShortfallCents,
    };
  };
}
