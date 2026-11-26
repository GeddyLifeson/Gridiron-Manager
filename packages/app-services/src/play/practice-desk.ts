// The practice week of a career (H3, G-65; playtest finding practice.not_in_barrel:unbound). The user plans
// the coming week's practices (or leaves them to the staff); each plan is checked when it is set
// (validatePractice for the plan's shape, checkPractice for the rule limits) and resolved when the week
// advances: reps go to the seat team's world roster, the period leaders write the report, and the report is
// kept in the career save. What practice produces (load, knowledge, technique exposures) is handed on as
// the result; D7, D9, D10 and D11 own what it changes (H3 "What a builder needs").
//
// Decisions (DECISIONS.md CY-06 to CY-09, all ASSUMPTION until a staff model owns them):
// - Depth order is the world roster order within each position slot; world position codes fold into the
//   practice slots (ILB, MLB, OLB to LB; FS, SS to S; NT to DT; FB to RB).
// - AI period leaders teach at the middle of the H3.5.1 range and evaluate at the middle of the skill range.
// - A week the user does not plan is run on the staff's standard week (STAFF_WEEK), one practice a week.
// - The pro CBA work-rule check needs the week's held activities, which the save does not keep yet, so only
//   the countable-hours and coaching findings run here; the week screen keeps its own checker.
import { stream } from '@gm/engine-core';
import { practice as pr, week as wk } from '@gm/league';
import { loop, recruiting as wrec } from '@gm/world';

export type PracticeLevel = 'pro' | 'college';

/** One planned practice and the scripts its team periods run (plain data, kept in the save). */
export interface PracticePlan {
  readonly practice: pr.Practice;
  readonly scripts: Readonly<Record<string, pr.Script>>;
}

export interface PlanCheck {
  readonly ok: boolean;
  readonly problems: readonly pr.PracticeProblem[];
  readonly findings: readonly pr.PracticeFinding[];
}

/** One resolved practice as the office keeps it: the leaders' report and the load handed to D10. */
export interface PracticeRecord {
  readonly seasonYear: number;
  readonly week: number;
  readonly by: 'user' | 'staff';
  readonly report: pr.PracticeReport;
  /** World person id to reps taken (all tempos), for the scouting desk and the load model. */
  readonly reps: Readonly<Record<string, number>>;
  /** World person id to the live or thud reps taken (full-speed looks for D6). */
  readonly fullSpeed: Readonly<Record<string, number>>;
  readonly paddedUsed: boolean;
}

export interface PracticeDeskSave {
  readonly version: 1;
  readonly plans: readonly PracticePlan[];
  readonly records: readonly PracticeRecord[];
  readonly paddedUsed: number;
}

/** World position code to the practice slot it works at. */
const SLOT_OF: Readonly<Record<string, string>> = {
  QB: 'QB', RB: 'RB', FB: 'RB', HB: 'RB', WR: 'WR', TE: 'TE', T: 'T', OT: 'T', LT: 'T', RT: 'T', G: 'G', OG: 'G', LG: 'G', RG: 'G', C: 'C',
  DE: 'DE', EDGE: 'DE', DT: 'DT', NT: 'DT', ILB: 'LB', MLB: 'LB', OLB: 'LB', LB: 'LB', CB: 'CB', NB: 'CB', FS: 'S', SS: 'S', S: 'S',
  K: 'K', P: 'P', LS: 'LS',
};

/** Unit shapes in practice slots: 11 on offense and defense, the specialists on special teams. */
export const PRACTICE_SHAPES: Readonly<Record<pr.Side, pr.UnitShape>> = {
  offense: ['QB', 'RB', 'WR', 'WR', 'WR', 'TE', 'T', 'T', 'G', 'G', 'C'],
  defense: ['DE', 'DE', 'DT', 'DT', 'LB', 'LB', 'LB', 'CB', 'CB', 'S', 'S'],
  special_teams: ['K', 'P', 'LS'],
};

/** The staff's standard week: one practice of individual, group and team work in shells (CY-08). */
export const STAFF_WEEK: pr.PracticeTemplate = (() => {
  const staff: pr.PeriodLeader = { staffId: 'staff', role: 'coordinator', user: false };
  const coach: pr.PeriodLeader = { staffId: 'staff', role: 'position_coach', user: false };
  return {
    name: 'staff standard', weekday: 3, pads: 'shells',
    periods: [
      pr.newPeriod(1, 'warmup', coach, { minutes: 10, tempo: 'walk', groups: ['offense', 'defense'] }),
      pr.newPeriod(2, 'individual', coach, { minutes: 15, tempo: 'thud', groups: ['offense', 'defense'], drills: ['stance_start', 'tackling_form'] }),
      pr.newPeriod(3, 'inside_run', staff, { minutes: 10, tempo: 'thud', groups: ['offense', 'defense'], moveField: true }),
      pr.newPeriod(4, 'seven_on_seven', staff, { minutes: 10, tempo: 'jog', groups: ['offense', 'defense'] }),
      pr.newPeriod(5, 'team_scout', staff, { minutes: 15, tempo: 'jog', groups: ['offense'] }),
      pr.newPeriod(6, 'team_scout', staff, { minutes: 15, tempo: 'jog', groups: ['defense'] }),
    ],
  };
})();

/** Practice block length of the staff week, in minutes (CY-08). */
const STAFF_BLOCK_MINUTES = 120;

/** Rule lookup for practice at a level from the league rule reader (league week and practice key rows on top). */
export function practiceRules(rule: (key: string) => number | undefined, level: PracticeLevel): (key: string) => number | undefined {
  return pr.practiceLookup(wk.weekLookup(rule, level), level);
}

/** The depth chart and unit context of a team, from its world roster (CY-06). */
export function assignContextOf(world: loop.LiveWorld, teamId: number, out: ReadonlySet<string> = new Set()): pr.AssignContext {
  const depth: Record<string, string[]> = {};
  for (const id of world.rosters.get(teamId) ?? []) {
    const pos = world.people.get(id)?.playing?.position;
    const slot = pos === undefined ? undefined : SLOT_OF[pos];
    if (slot === undefined) continue;
    (depth[slot] ??= []).push(String(id));
  }
  return { depth, shapes: PRACTICE_SHAPES, split: pr.DEFAULT_SPLIT, participation: new Map(), out };
}

const scriptMap = (p: PracticePlan): Map<string, pr.Script> => new Map(Object.entries(p.scripts));

export class PracticeDesk {
  private plans: PracticePlan[] = [];
  private readonly records: PracticeRecord[] = [];
  private padded = 0;

  constructor(private readonly level: () => PracticeLevel, private readonly rules: () => (key: string) => number | undefined) {}

  static restore(level: () => PracticeLevel, rules: () => (key: string) => number | undefined, save: PracticeDeskSave): PracticeDesk {
    if (save.version !== 1) throw new Error(`practice desk: save version ${String(save.version)} is not supported`);
    const d = new PracticeDesk(level, rules);
    d.plans = [...save.plans];
    d.records.push(...save.records);
    d.padded = save.paddedUsed;
    return d;
  }

  /** Checks a plan without keeping it: shape problems (validatePractice) and rule findings (checkPractice). */
  check(plan: PracticePlan): PlanCheck {
    const problems = pr.validatePractice(plan.practice, this.level());
    const findings = pr.checkPractice(plan.practice, { rules: this.rules() });
    return { ok: problems.length === 0 && !findings.some((f) => f.hardness === 'hard'), problems, findings };
  }

  /**
   * Sets the coming week's practices. A plan with a shape problem is refused; a plan that breaks a rule is
   * refused unless `goAhead` (the user saw the warning and chose to; the finding stays on the record).
   */
  plan(plans: readonly PracticePlan[], goAhead = false): readonly PlanCheck[] {
    const checks = plans.map((p) => this.check(p));
    const refused = checks.some((c) => c.problems.length > 0 || (!goAhead && c.findings.some((f) => f.hardness === 'hard')));
    if (!refused) this.plans = [...plans];
    return checks;
  }

  get planned(): readonly PracticePlan[] { return this.plans; }
  get history(): readonly PracticeRecord[] { return this.records; }
  get paddedUsed(): number { return this.padded; }

  /** The planner screen's view of a plan (H3.1.1, H3.6.1). */
  view(plan: PracticePlan): pr.PracticeView {
    const rules = this.rules();
    const scripts = [...scriptMap(plan).values()];
    const calls = [...new Set(scripts.flatMap((s) => s.reps.map((r) => r.callId)))];
    return pr.practiceView({
      practice: plan.practice, rules, coverage: pr.coverage(calls, scripts),
      findings: pr.checkPractice(plan.practice, { rules }), participation: [], paddedUsed: this.padded,
    });
  }

  /** The staff's plan for a week the user left alone. */
  staffPlan(day: number, seasonYear: number, week: number): PracticePlan {
    return { practice: pr.fromTemplate(STAFF_WEEK, `staff-${seasonYear}-${week}`, `block-${seasonYear}-${week}`, STAFF_BLOCK_MINUTES, day, false), scripts: {} };
  }

  /**
   * Runs the week's practices for the seat team at its advance: the user's plans, or the staff week. Each
   * practice is resolved on the team's world roster, the report is written and kept, and the plans clear.
   */
  runWeek(world: loop.LiveWorld, teamId: number): readonly PracticeRecord[] {
    const year = world.date.seasonYear, week = world.week;
    const by: 'user' | 'staff' = this.plans.length > 0 ? 'user' : 'staff';
    const plans = this.plans.length > 0 ? this.plans : [this.staffPlan(wrec.dayOfWorld(world.date), year, week)];
    const out = plans.map((plan, i) => this.runBlock(world, teamId, plan, i, by));
    this.plans = [];
    return out;
  }

  /**
   * Resolves one practice block for the seat team (the week loop calls this per practice or walkthrough
   * block): reps on the world roster, the leaders' report, the record kept in the history. `index` numbers
   * the block inside the week, so each block draws from its own stream.
   */
  runBlock(world: loop.LiveWorld, teamId: number, plan: PracticePlan, index: number, by: 'user' | 'staff' = 'user'): PracticeRecord {
    const year = world.date.seasonYear, week = world.week;
    const rng = stream(world.seed, 'career.practice', [year, week, index]);
    const result = pr.resolvePractice({
      practice: plan.practice, scripts: scriptMap(plan), ctx: assignContextOf(world, teamId), rng,
      teachingTerm: (per) => (per.leader.user ? pr.userTeachingTerm(null) : pr.teachingTermOf(1)),
    });
    const report = pr.writeReport(plan.practice, result, new Map(), () => 0.5, rng);
    const reps: Record<string, number> = {}, fullSpeed: Record<string, number> = {};
    for (const [id, l] of [...result.load.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const n = l.liveReps + l.thudReps + l.teamReps + l.walkThroughReps;
      if (n > 0) reps[id] = n;
      if (l.liveReps + l.thudReps > 0) fullSpeed[id] = l.liveReps + l.thudReps;
    }
    if (result.paddedUsed) this.padded++;
    const rec: PracticeRecord = { seasonYear: year, week, by, report, reps, fullSpeed, paddedUsed: result.paddedUsed };
    this.records.push(rec);
    return rec;
  }

  /** A new season: the padded counter starts again (H3.6.1). Records stay as the career's practice history. */
  newSeason(): void { this.padded = 0; this.plans = []; }

  save(): PracticeDeskSave {
    return { version: 1, plans: this.plans, records: this.records, paddedUsed: this.padded };
  }
}
