// The coach's own files in the save (CR-CS-2): his contract, his money, his life, what he has done on the
// jobs market and his boss's hours expectation, kept under one system-state key (`career.coach`). The world's
// system state is truth-classed, saved one row per key and folded into the world hash, so no schema change is
// needed. Only the coach's own host reads it (self screens, P1.3.2).
//
// The state is made the first time his screens open and the contract is drafted again when he holds a new
// seat. Every draw comes from a keyed stream of the world seed (J13), so the same save gives the same file.
// Rulings and assumptions (each flagged where it is used, CS-1 to CS-8, README of this folder):
//   CS-1 starting student debt and monthly costs are 0 (Assumption: no source for E6.1.2 values yet).
//   CS-2 he starts single; life events add family (E8 household with no members).
//   CS-3 the boss's hours expectation is a flagged mid-range default until people carry an hours facet (MA-82).
//   CS-4 level prestige (E2.2.2, 0 to 100 per level) has no source in the save: every level weighs 0, so the
//        board's fit line reads by rung alone.
//   CS-5 an opening's reason is not on the vacant job row; it reads "left" until turnover records it.
//   CS-6 risk level 3 and a savings rate of 0 until he sets them (E6.6.2 gives no default).
//   CS-7 take-home for the projection is gross seat pay until the tax tables are wired (E6.2).
//   CS-8 his planned week: the boss's required hours over six days, sleep at the sleep need, home hours at
//        the E8 home target; the world does not run his weeks yet, so the history is empty.
import { contract, life, market, positions, wealth } from '@gm/career';
import { stream } from '@gm/engine-core';
import type { JobRecord, PersonRecord, TeamRecord, WorldDate } from '@gm/schema';
import { money as wmoney, type loop } from '@gm/world';
import type { FinanceInput } from './finance.ts';
import type { LifeInput } from './life.ts';
import type { JobMarketInput } from './market.ts';
import { param } from './params.ts';
import { t } from './text.ts';
import { jobHistoryOf } from './live-tables.ts';

type LiveWorld = loop.LiveWorld;

/** Save key of the coach's own career file. */
export const COACH_KEY = 'career.coach';
const STREAM_CONTRACT = 'career.coach.contract';

export interface CoachBoss {
  /** The seat he reports to when the expectation was set, or null with no boss. */
  readonly jobId: number | null;
  /** S4.1.1 hours culture, 0 to 1 (coach-ai reads 0 to 100). */
  readonly hoursCulture: number;
  /** CS-3: a flagged default until the boss's person record carries the facet. */
  readonly basis: 'assumption';
}

export interface CoachMoney {
  readonly startKind: wealth.StartMode['kind'];
  readonly opened: WorldDate;
  readonly opening: wealth.BalanceSheet;
  readonly riskLevel: 1 | 2 | 3 | 4 | 5;
  readonly savingsRate: number;
}

export interface CoachLife {
  readonly health: life.HealthRecord;
  readonly household: life.Household;
  readonly history: readonly life.WeekSummary[];
}

export interface CoachState {
  readonly personId: number;
  /** The seat the contract below was drafted for, or null when he holds none. */
  readonly jobId: number | null;
  readonly contract: contract.CoachContract | null;
  readonly boss: CoachBoss;
  readonly money: CoachMoney;
  /** Null for a person imported from a real-people pack (E8 caution 3). */
  readonly life: CoachLife | null;
  readonly market: { readonly applications: readonly market.Application[] };
}

const CONTRACT_TIERS: ReadonlySet<string> = new Set<contract.ContractTier>(['pro', 'power_four', 'group_of_six']);
const HEAD_COACH = 'pos:head_coach';

/** Which hiring party runs a search, by the seat (E2.3.1). A table, so no code tests a level word (P1.3.3). */
const PARTY_FOR_HEAD: Readonly<Record<string, market.HiringParty>> = { pro: 'owner', college: 'athletic_director' };

export function coachStateOf(world: LiveWorld, personId: number): CoachState | null {
  const s = world.systemState.get(COACH_KEY) as CoachState | undefined;
  return s && s.personId === personId ? s : null;
}

const jobOf = (world: LiveWorld, personId: number): JobRecord | null => {
  let best: JobRecord | null = null;
  for (const j of world.jobs.values()) if (j.holderPersonId === personId && (!best || j.rung > best.rung)) best = j;
  return best;
};

const levelOf = (world: LiveWorld, teamId: number): string | null => {
  const team = world.teams.find((x) => x.id === teamId);
  return team ? (world.competitions.find((c) => c.id === team.competitionId)?.level ?? null) : null;
};

/** E6.1.2 start mode by the seat he holds when his file opens (CS-1 zeroes debt and costs). */
export function startModeFor(world: LiveWorld, personId: number, job: JobRecord | null): wealth.StartMode {
  const debt = param('careerScreens.startDebtCents');
  const costs = param('careerScreens.startMonthlyCostsCents');
  const rung = job?.rung ?? 0;
  if (rung <= 1) return { kind: 'student', studentDebtCents: debt };
  if (rung === 2) return { kind: 'graduate_assistant', studentDebtCents: debt };
  if (rung === 3) {
    const years = new Set(jobHistoryOf(world, personId).map((x) => x.row).flatMap((h) => {
      const end = h.ended?.seasonYear ?? world.date.seasonYear;
      return Array.from({ length: Math.max(0, end - h.started.seasonYear + 1) }, (_, i) => h.started.seasonYear + i);
    })).size;
    return { kind: 'quality_control', monthlyCostsCents: costs, yearsCoached: years, studentDebtCents: debt };
  }
  // E6.1.2 rows "position coach" to "head coach": savings from prior pay.
  return { kind: 'head_coach', monthlyCostsCents: costs, priorPayCents: wmoney.priorPay(world, personId) };
}

/** A contract for the seat he holds, drafted on the world's keyed stream; null where no pay band covers it. */
export function draftFor(world: LiveWorld, personId: number, job: JobRecord): contract.CoachContract | null {
  const tier = wmoney.defaultPayTier(world, job.teamId);
  if (tier === null || !CONTRACT_TIERS.has(tier)) return null;
  const pay = wmoney.seatPay(world, job);
  if (pay === null || pay <= 0) return null;
  const started = jobHistoryOf(world, personId).map((x) => x.row).filter((h) => h.jobId === job.id && h.ended === null)
    .reduce<number | null>((y, h) => (y === null || h.started.seasonYear > y ? h.started.seasonYear : y), null) ?? world.date.seasonYear;
  const end = world.staffContractEndYear.get(personId);
  const rng = stream(world.seed, STREAM_CONTRACT, [personId, job.id, started]);
  return contract.draftContract({
    id: job.id, coachId: personId, employerId: job.teamId, jobId: job.id, seatId: job.catalogueId,
    tier: tier as contract.ContractTier, seat: job.positionId === HEAD_COACH ? 'head_coach' : 'assistant', rung: job.rung,
    startYear: started, firstYearPayCents: pay, ...(end !== undefined && end >= started ? { years: end - started + 1 } : {}),
  }, { next: () => rng.uniform() });
}

/**
 * His file, made on first read and kept in the save; the contract is drafted again when his seat changes.
 * Returns null when the save has no such person.
 */
export function ensureCoachState(world: LiveWorld, personId: number): CoachState | null {
  const person: PersonRecord | undefined = world.people.get(personId);
  if (!person) return null;
  const job = jobOf(world, personId);
  const prior = coachStateOf(world, personId);
  if (prior && prior.jobId === (job?.id ?? null)) return prior;
  const subject: life.LifeSubject = { personId, imported: person.origin === 'imported' };
  const bossJobId = job?.reportsToJobId ?? null;
  const next: CoachState = {
    personId,
    jobId: job?.id ?? null,
    contract: job ? draftFor(world, personId, job) : null,
    boss: prior && prior.boss.jobId === bossJobId ? prior.boss : { jobId: bossJobId, hoursCulture: param('careerScreens.hoursCulture'), basis: 'assumption' },
    money: prior?.money ?? (() => {
      const mode = startModeFor(world, personId, job);
      return {
        startKind: mode.kind, opened: { seasonYear: world.date.seasonYear, dayIndex: world.date.dayIndex }, opening: wealth.openingSheet(mode),
        riskLevel: param('careerScreens.riskLevel') as CoachMoney['riskLevel'], savingsRate: param('careerScreens.savingsRate'),
      };
    })(),
    life: prior?.life ?? (subject.imported ? null : { health: life.newHealthRecord(subject), household: life.newHousehold(subject, []), history: [] }),
    market: prior?.market ?? { applications: [] },
  };
  world.systemState.set(COACH_KEY, next);
  return next;
}

export const dateText = (d: WorldDate): string => t('date.day', { season: d.seasonYear, day: d.dayIndex + 1 });

const teamName = (world: LiveWorld, teamId: number): string => (world.teams.find((x) => x.id === teamId) as TeamRecord | undefined)?.identity?.name ?? '';

/** Inputs of the four screens the file feeds, in the shapes the builders take (rights come from the caller). */
export interface CoachScreenInputs {
  contract(): contract.CoachContract | null;
  jobMarket(rights: readonly string[]): JobMarketInput;
  finance(rights: readonly string[]): FinanceInput;
  life(rights: readonly string[], inSeason: boolean): LifeInput | null;
}

export function coachScreenInputs(world: LiveWorld, state: CoachState, cat: positions.Catalogue = positions.CATALOGUE): CoachScreenInputs {
  const today: WorldDate = { seasonYear: world.date.seasonYear, dayIndex: world.date.dayIndex };
  const known = (id: string): boolean => cat.jobs.some((j) => j.id === id);
  const job = state.jobId === null ? null : world.jobs.get(state.jobId) ?? null;
  const spot = (rung: number): market.CareerSpot => ({ rung, prestige: 0 }); // CS-4
  const ownPay = job ? wmoney.seatPay(world, job) ?? 0 : 0;

  return {
    contract: () => state.contract,
    jobMarket: (rights) => {
      const openings: market.Opening[] = [];
      for (const j of world.jobs.values()) {
        if (j.holderPersonId !== null || !known(j.catalogueId)) continue;
        const row = cat.job(j.catalogueId);
        if (!row.userHoldable || !row.onLadder) continue;
        const level = levelOf(world, j.teamId);
        if (!level) continue;
        const team = world.teams.find((x) => x.id === j.teamId) as TeamRecord | undefined;
        const head = j.positionId === HEAD_COACH;
        openings.push({
          id: j.id, teamId: j.teamId, seatId: j.id, level, rung: j.rung, prestige: 0, side: j.side, region: team?.identity?.place ?? '',
          isHeadCoach: head, reason: 'left', posted: j.vacantSince ?? today, party: head ? (PARTY_FOR_HEAD[level] ?? 'owner') : 'head_coach',
          stage: 'open', causeOpeningId: null, firmId: null,
        });
      }
      openings.sort((a, b) => b.rung - a.rung || a.id - b.id);
      return {
        rights, current: job ? spot(job.rung) : null,
        window: { open: openings.length > 0, until: null, next: null },
        openings,
        label: (o) => {
          const j = world.jobs.get(o.seatId);
          return { team: teamName(world, o.teamId), level: t(`level.${o.level}`), title: j && known(j.catalogueId) ? cat.job(j.catalogueId).title : '', payCents: j ? wmoney.seatPay(world, j) : null };
        },
        applications: state.market.applications, interviews: [], offers: [], signs: [], today, dateText,
      };
    },
    finance: (rights) => {
      const entries: wealth.LedgerEntry[] = wmoney.personIncomeOf(world).income
        .filter((r) => r.personId === state.personId && r.seasonYear === world.date.seasonYear)
        .map((r) => ({ month: 1, account: 'cash', category: 'pay', amountCents: r.cents, source: teamName(world, r.teamId) }));
      return {
        rights, currency: 'USD', sheets: [{ date: dateText(state.money.opened), sheet: state.money.opening }], entries, lastYear: null,
        advisers: [], offers: [], settings: { riskLevel: state.money.riskLevel, savingsRate: state.money.savingsRate },
        yearlyTakeHomeCents: ownPay, // CS-7
      };
    },
    life: (rights, inSeason) => {
      if (!state.life) return null;
      const required = job && life.RUNGS.includes(job.rung) ? life.requiredHours(job.rung, inSeason, state.boss.hoursCulture) : 0;
      const workDays = 6;
      const homePerDay = life.homeTarget(inSeason) / 7;
      const sleep = life.param('sleepNeedHours');
      const days: life.DayPlan[] = Array.from({ length: 7 }, (_, i) => ({
        work: i < workDays && required > 0 ? [{ taskId: 'required', category: 'meetings', hours: required / workDays, priority: 5, delegateId: null, required: true }] : [],
        travelHours: 0, sleepHours: sleep, homeHours: homePerDay, facilityNight: false,
      }));
      return {
        rights, week: world.week, result: life.runWeek({ days }, 0), history: state.life.history,
        health: state.life.health, household: state.life.household, events: [],
        template: required > 0 ? [{ task: t('task.required'), hours: Math.round(required * 10) / 10 }] : [],
        realism: life.DEFAULT_LIFE_REALISM,
      };
    },
  };
}
