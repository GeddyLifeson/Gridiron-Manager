// The camp plan (M6.1.1), the install schedule (M6.1.2) and joint-practice limits (M6.2.4 rule 1). The
// checker marks illegal layouts; they are acts on the club's own field, so they are breakable (C11.2.1
// split): it warns once, names the rule, lets the coach keep the day, and each kept violation becomes one
// L8.2.5 row (compliance class work_rules_practice). One checker for both levels: rules switch on by key.
import type { CampRules } from './keys.ts';
import { P } from './params.ts';
import defaults from './defaults.json' with { type: 'json' };

export const DAY_TYPES = ['report', 'acclimation', 'padded', 'full_speed', 'walkthrough', 'joint_padded', 'joint_full_speed', 'preseason_game', 'off', 'travel', 'mock_game'] as const;
export type DayType = (typeof DAY_TYPES)[number];

export interface CampDay {
  readonly type: DayType;
  /** A padded practice cancelled by weather within 60 minutes does not count (M6.1.1 rule 4). */
  readonly cancelledByWeather?: boolean;
  /** Hours a player is required at the facility (meetings plus practice, H3 and H4). */
  readonly facilityHours?: number;
  /** A live-contact (tackling or thud) day, where the level limits them. */
  readonly liveContact?: boolean;
}

/** Day 0 is the veterans' report day. */
export interface CampPlan { readonly days: readonly CampDay[] }

export type CampRule =
  | 'pads_in_acclimation' | 'padded_over_max' | 'padded_streak' | 'padded_runs' | 'padded_run_gap'
  | 'day_off_after_acclimation' | 'day_off_every' | 'post_game_day_off' | 'days_off_min' | 'days_off_after_last_game' | 'final_days_off_run'
  | 'joint_before_game' | 'joint_per_week' | 'joint_per_season' | 'facility_hours' | 'practices_max' | 'live_contact';

export interface CampViolation {
  readonly rule: CampRule;
  readonly day: number;
  readonly leaf: string;
  readonly message: string;
  /** Joint practices are public: detection near certain (M6.2.4 acceptance). */
  readonly certainTrace: boolean;
}

const PADDED: ReadonlySet<DayType> = new Set(['padded', 'joint_padded']);
const JOINT: ReadonlySet<DayType> = new Set(['joint_padded', 'joint_full_speed']);
const PRACTICE: ReadonlySet<DayType> = new Set(['acclimation', 'padded', 'full_speed', 'walkthrough', 'joint_padded', 'joint_full_speed', 'mock_game']);

export const countsAsPadded = (d: CampDay): boolean => PADDED.has(d.type) && d.cancelledByWeather !== true;

/** Every marked day of a plan (M6.1.1 rule 1 and rule 4; M6.2.4 rule 1; the college edge case). */
export function checkCampPlan(plan: CampPlan, rules: CampRules): CampViolation[] {
  const out: CampViolation[] = [];
  const v = (rule: CampRule, day: number, leaf: string, message: string, certainTrace = false) => out.push({ rule, day, leaf, message, certainTrace });
  const days = plan.days;
  const games = days.map((d, i) => (d.type === 'preseason_game' ? i : -1)).filter((i) => i >= 0);
  const firstGame = games[0] ?? days.length;
  const lastGame = games[games.length - 1] ?? -1;

  if (rules.acclimationDays !== null) {
    for (let i = 0; i < Math.min(rules.acclimationDays, days.length); i++) if (PADDED.has(days[i]!.type)) v('pads_in_acclimation', i, 'M6.1.1', 'Pads during the acclimation days');
    if (rules.dayOffAfterAcclimation && rules.acclimationDays < days.length && days[rules.acclimationDays]!.type !== 'off') v('day_off_after_acclimation', rules.acclimationDays, 'M6.1.1', 'The day after acclimation must be a day off');
  }

  if (rules.padded) {
    let count = 0, streak = 0, runs = 0, lastRunEnd = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < days.length; i++) {
      if (countsAsPadded(days[i]!)) {
        count++; streak++;
        if (count === rules.padded.max + 1) v('padded_over_max', i, 'C11.2.2', `Padded practice ${count} of ${rules.padded.max}`);
        if (streak === rules.padded.streakMax + 1) v('padded_streak', i, 'C11.2.2', `${streak} padded days in a row`);
        if (streak === rules.padded.streakMax) {
          const start = i - streak + 1;
          runs++;
          if (runs === rules.padded.runsMax + 1) v('padded_runs', i, 'M6.1.1', `Padded run ${runs} of ${rules.padded.runsMax}`);
          if (start - lastRunEnd - 1 < rules.padded.runGapDays) v('padded_run_gap', start, 'M6.1.1', `New padded run ${start - lastRunEnd - 1} days after the last ended`);
          lastRunEnd = i;
        }
      } else streak = 0;
    }
  }

  const offs = days.map((d, i) => (d.type === 'off' ? i : -1)).filter((i) => i >= 0);
  if (rules.dayOffEveryDays !== null) {
    const w = rules.dayOffEveryDays;
    for (let s = 0; s + w <= firstGame; s++) if (!offs.some((o) => o >= s && o < s + w)) { v('day_off_every', s + w - 1, 'M6.1.1', `No day off in the ${w} days to day ${s + w - 1}`); break; }
  }
  if (rules.postGameOff) {
    games.forEach((g, gi) => {
      const next = games[gi + 1];
      if (next !== undefined && next - g <= rules.postGameOff!.exemptGapDays) return;
      if (g + 1 >= days.length) return;
      if (!offs.some((o) => o > g && o <= g + rules.postGameOff!.withinDays)) v('post_game_day_off', g + 1, 'M6.1.1', 'No day off on the first or second day after a preseason game');
    });
  }
  if (rules.daysOff) {
    const short = games.length <= rules.daysOff.shortPreseasonGames;
    const need = short ? rules.daysOff.minShortPreseason : rules.daysOff.min;
    if (offs.length < need) v('days_off_min', days.length - 1, 'C11.2.2', `${offs.length} days off in camp, ${need} required`);
    if (short && lastGame >= 0) {
      const after = offs.filter((o) => o > lastGame);
      if (after.length < rules.daysOff.afterLastGame) v('days_off_after_last_game', days.length - 1, 'M6.1.1', `${after.length} days off after the last preseason game, ${rules.daysOff.afterLastGame} required`);
      let run = 0, best = 0;
      for (let i = lastGame + 1; i < days.length; i++) { run = days[i]!.type === 'off' ? run + 1 : 0; best = Math.max(best, run); }
      if (best < rules.daysOff.finalRun) v('final_days_off_run', days.length - 1, 'M6.1.1', `Longest run of days off after the last game is ${best}, ${rules.daysOff.finalRun} required`);
    }
  }

  if (rules.joint) {
    let season = 0;
    const perWeek = new Map<number, number>();
    days.forEach((d, i) => {
      if (!JOINT.has(d.type)) return;
      season++;
      if (days[i + 1]?.type === 'preseason_game') v('joint_before_game', i, 'M6.2.4', 'Joint practice the day before a game', true);
      const week = games.findIndex((g) => g > i);
      const n = (perWeek.get(week) ?? 0) + 1;
      perWeek.set(week, n);
      if (n === rules.joint!.perWeek + 1) v('joint_per_week', i, 'M6.2.4', `Joint practice day ${n} in one preseason week`, true);
      if (season === rules.joint!.perSeason + 1) v('joint_per_season', i, 'M6.2.4', `Joint practice day ${season} this preseason`, true);
    });
  }

  if (rules.facility) {
    days.forEach((d, i) => {
      const played = games.filter((g) => g < i).length;
      const limit = played >= rules.facility!.reducedAfterGame ? rules.facility!.reduced : rules.facility!.max;
      const h = d.facilityHours ?? 0;
      if (h > limit) v('facility_hours', i, 'M6.1.1', `${h} hours at the facility, limit ${limit}`);
    });
  }

  if (rules.practicesMax !== null) {
    let n = 0;
    days.forEach((d, i) => { if (PRACTICE.has(d.type)) { n++; if (n === rules.practicesMax! + 1) v('practices_max', i, 'M6.1.1', `Practice ${n} of ${rules.practicesMax}`); } });
  }
  if (rules.liveContact) {
    const from = rules.acclimationDays ?? 0;
    const w = rules.liveContact.windowDays;
    for (let i = from; i < days.length; i++) {
      if (!days[i]!.liveContact) continue;
      const inWindow = days.slice(Math.max(from, i - w + 1), i + 1).filter((d) => d.liveContact).length;
      if (inWindow === rules.liveContact.max + 1) v('live_contact', i, 'M6.1.1', `Live-contact day ${inWindow} inside ${w} days`);
    }
  }
  return out.sort((a, b) => a.day - b.day || a.rule.localeCompare(b.rule));
}

/** Padded practices used, the current run, and days off given: the grid's counters (M6.1.1). */
export function campCounters(plan: CampPlan, uptoDay: number = plan.days.length - 1): { padded: number; currentRun: number; daysOff: number } {
  let padded = 0, run = 0, off = 0;
  for (let i = 0; i <= uptoDay && i < plan.days.length; i++) {
    const d = plan.days[i]!;
    if (countsAsPadded(d)) { padded++; run++; } else run = 0;
    if (d.type === 'off') off++;
  }
  return { padded, currentRun: run, daysOff: off };
}

export interface KeptViolation { readonly classId: 'work_rules_practice'; readonly rule: CampRule; readonly day: number; readonly leaf: string; readonly certainTrace: boolean }

/**
 * The coach's answer to the warnings: each violation warns once, and each one he keeps writes exactly one
 * L8.2.5 row; a plan with no marked day writes none (M6.1.1 acceptance). The caller files the rows as
 * compliance acts (G-28) with the actor and date.
 */
export function keepViolations(violations: readonly CampViolation[], kept: (v: CampViolation) => boolean): { warnings: CampViolation[]; rows: KeptViolation[] } {
  const seen = new Set<string>();
  const warnings = violations.filter((x) => { const k = `${x.rule}:${x.day}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { warnings, rows: warnings.filter(kept).map((x) => ({ classId: 'work_rules_practice' as const, rule: x.rule, day: x.day, leaf: x.leaf, certainTrace: x.certainTrace })) };
}

/** The staff's starting calendar for a three-preseason-game year (M6.1.1 rule 5), with facility hours per day type. */
export function staffCalendar(): CampPlan {
  const hours = defaults.facilityDayHours as unknown as Record<string, number>;
  return { days: (defaults.staffCalendar.days as DayType[]).map((type) => ({ type, facilityHours: hours[type] ?? 0 })) };
}

/** Per diem in the camp budget line (M6.1.1 rule 6; C6 owns the amounts by key): weekly rate times camp weeks. */
export function perDiemCents(weeklyCents: number, campDays: number): number {
  return Math.round((weeklyCents * campDays) / P.daysPerWeek);
}

// ---------- M6.1.2 install schedule ----------

export interface InstallDay {
  readonly day: number;
  readonly unit: string;
  readonly introduced: readonly string[];
  readonly reviewed: readonly string[];
  /** Situational periods held (F13: red zone, third down, two-minute, backed up, short yardage, goal line, special teams). */
  readonly situations: readonly string[];
}

/** Daily load warnings (rule 2): above a starting 8 new concepts per unit for a returning staff, 5 for a new staff. Allowed. */
export function installOverloads(days: readonly InstallDay[], returningStaff: boolean): { day: number; unit: string; count: number; cap: number }[] {
  const cap = returningStaff ? P.installCapReturning : P.installCapNew;
  return days.filter((d) => d.introduced.length > cap).map((d) => ({ day: d.day, unit: d.unit, count: d.introduced.length, cap }));
}

/** Camp re-install pace (M6.1.2): a starting 2 times the spring pace with carry-over; a new staff has about half. */
export function campInstallPace(springPace: number, returningStaff: boolean): number {
  return returningStaff ? springPace * P.campInstallPaceFactor : springPace * P.campInstallPaceFactor * P.newStaffPaceFactor;
}

/** Concepts on the opening-day sheet without an install day and a review day (acceptance). */
export function missingFromInstall(sheet: readonly string[], days: readonly InstallDay[]): { concept: string; missing: ('install' | 'review')[] }[] {
  return [...new Set(sheet)].sort().flatMap((c) => {
    const missing: ('install' | 'review')[] = [];
    if (!days.some((d) => d.introduced.includes(c))) missing.push('install');
    if (!days.some((d) => d.reviewed.includes(c))) missing.push('review');
    return missing.length ? [{ concept: c, missing }] : [];
  });
}

/** Situations with no dedicated period before the first preseason game (M6.1.2 starting rule). */
export function situationsUncovered(required: readonly string[], days: readonly InstallDay[], firstGameDay: number): string[] {
  const held = new Set(days.filter((d) => d.day < firstGameDay).flatMap((d) => d.situations));
  return [...required].filter((s) => !held.has(s)).sort();
}

/**
 * Taught or trained (rule 3): a concept that needs contact to learn is "taught" until it has had a padded
 * rep, then "trained". Other concepts are trained once taught.
 */
export function installState(concept: string, needsContact: boolean, plan: CampPlan, days: readonly InstallDay[], paddedRepDays: readonly number[]): 'not_taught' | 'taught' | 'trained' {
  const taughtOn = days.filter((d) => d.introduced.includes(concept) || d.reviewed.includes(concept)).map((d) => d.day);
  if (taughtOn.length === 0) return 'not_taught';
  if (!needsContact) return 'trained';
  const first = Math.min(...taughtOn);
  return paddedRepDays.some((d) => d >= first && plan.days[d] !== undefined && countsAsPadded(plan.days[d]!)) ? 'trained' : 'taught';
}
