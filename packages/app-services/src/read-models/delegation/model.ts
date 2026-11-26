// Delegation settings (O4.3.2) with E7.3.1 handing work off, E7.3.2 checking it, L4.1.1 tasks, L4.3.2
// autonomy and K6 (the staff does the work at its own level). One table: every delegable task, who owns
// it, in what mode, the hours that saves the head coach this week, and that assistant's record on it.
//
// Hours come from the E7.2.1 cost table (career life), so the projected week here is E7's computation:
// a task he keeps costs its full rows, a task an assistant proposes costs the review rows (E7.3.2), a
// task an assistant decides costs nothing (E7.3.1 rule 1). Nothing about the assistant is shown as a
// number: the record is his demonstrated products and how they held up, and what he has said he wants.
// Good staff means less work: the "staff default" owner of each task is the chair that controls it.
import { life } from '@gm/career';
import TASKS_JSON from './tasks.json' with { type: 'json' };

export type Autonomy = 'decides' | 'proposes' | 'keeps';
export const AUTONOMIES: readonly Autonomy[] = ['decides', 'proposes', 'keeps'];
export type DelegationSide = 'offense' | 'defense' | 'special_teams' | 'none';

interface TaskDef { readonly side: DelegationSide; readonly rows: readonly (readonly [string, number])[] }
const TASKS = (TASKS_JSON as unknown as { tasks: Record<string, TaskDef> }).tasks;

/** Every task the screen knows a weekly load for (L4.1.1 `controls[]`). */
export const DELEGABLE_TASKS: readonly string[] = Object.keys(TASKS).sort();

export function taskSide(taskId: string): DelegationSide {
  return TASKS[taskId]?.side ?? 'none';
}

/** Hours a task costs the head coach in one week in each mode (E7.2.1 rows; E7.3.2 review rows for `proposes`). */
export function taskHours(taskId: string): Readonly<Record<Autonomy, number>> {
  const def = TASKS[taskId];
  if (!def) throw new Error(`delegation: no weekly load for task ${taskId} (add it to tasks.json)`);
  let keepQ = 0;
  let reviewQ = 0;
  for (const [row, units] of def.rows) {
    keepQ += life.taskCost(row, units).q;
    const review = life.taskRow(row).reviewTask;
    if (review) reviewQ += life.taskCost(review, units).q;
  }
  const h = (q: number) => q / life.QUARTERS_PER_HOUR;
  return { keeps: h(keepQ), proposes: h(reviewQ), decides: 0 };
}

/** One staff member as the screen sees him: his chair and what he may hold, never a skill. */
export interface DelegationStaff {
  readonly personId: number;
  readonly name: string;
  /** Job title text key (X8 chair). */
  readonly titleKey: string;
  readonly available: boolean;
  /** Hours already on his own week from other work (E7.3.1 rule 3), and what he has for delegated work. */
  readonly loadHours: number;
  readonly capacityHours: number;
}

/** His record on one task: products and how many held up on game day (E7.3.1 "9 of 11 held"), with the events behind it. */
export interface TaskRecord {
  readonly products: number;
  readonly held: number;
  /** Products the head coach redid himself (E7.3.2). */
  readonly replaced: number;
  readonly eventIds: readonly number[];
}

/** Something he has said about wanting more or less say (O4.3.2: shown before saving, never a forecast). */
export interface SayStatement { readonly personId: number; readonly textKey: string; readonly eventId: number; readonly wants: 'more' | 'less' }

export interface Assignment { readonly holderId: number | null; readonly autonomy: Autonomy }

export interface DelegationInputs {
  readonly headCoachId: number;
  /** False below head coach: the boss sets the table and the screen is read only (O7.2.1). */
  readonly userIsHeadCoach: boolean;
  /** Hours he has in the week (E7.1.1) and the hours already fixed by scheduled blocks and other work. */
  readonly budgetHours: number;
  readonly fixedHours: number;
  readonly tasks: readonly string[];
  readonly staff: readonly DelegationStaff[];
  /** Staff default owner of each task (career positions `taskOwners`, as a person id; null when it falls to the head coach). */
  readonly defaultOwner: Readonly<Record<string, number | null>>;
  /** Who may hold each task (his chair controls it, or a chair up its line); missing means nobody. */
  readonly qualified: Readonly<Record<string, readonly number[]>>;
  /** Current settings; a task missing here sits with its staff default in `decides` mode. */
  readonly assignments: Readonly<Record<string, Assignment>>;
  readonly records?: Readonly<Record<string, TaskRecord>>;
  readonly statements?: readonly SayStatement[];
}

export const recordKey = (personId: number, taskId: string): string => `${personId}|${taskId}`;

export interface DelegationRow {
  readonly taskId: string;
  readonly side: DelegationSide;
  readonly holderId: number | null;
  readonly holderName: string | null;
  readonly autonomy: Autonomy;
  /** Whether this row follows the staff default. */
  readonly isDefault: boolean;
  readonly defaultOwnerId: number | null;
  /** Hours charged to the head coach this week in the current mode, and the hours that saves against doing it himself. */
  readonly coachHours: number;
  readonly hoursSaved: number;
  /** Rows with no review step (film work): "proposes" charges nothing extra there. */
  readonly reviewStep: boolean;
  readonly record: TaskRecord | null;
  /** People who may take it; empty means it cannot be delegated, and `blockedKey` says why. */
  readonly candidates: readonly { readonly personId: number; readonly name: string }[];
  readonly blockedKey: string | null;
}

export interface DelegationView {
  readonly readOnly: boolean;
  readonly rows: readonly DelegationRow[];
  readonly staff: readonly (DelegationStaff & { readonly delegatedHours: number; readonly overloaded: boolean })[];
  readonly statements: readonly SayStatement[];
  readonly totals: { readonly budgetHours: number; readonly fixedHours: number; readonly taskHours: number; readonly projectedHours: number; readonly overBudget: boolean; readonly savedHours: number };
  readonly presets: readonly PresetId[];
}

const q = (h: number): number => Math.round(h * 4); // whole quarter hours (E7.1.1 rule 8)

/** Resolve one task's setting: the stored one, else the staff default deciding, else the head coach keeping it. */
function settingFor(taskId: string, i: DelegationInputs): Assignment {
  const a = i.assignments[taskId];
  if (a) return a.holderId === null ? { holderId: null, autonomy: 'keeps' } : a;
  const d = i.defaultOwner[taskId] ?? null;
  return d === null || d === i.headCoachId ? { holderId: null, autonomy: 'keeps' } : { holderId: d, autonomy: 'decides' };
}

export function buildDelegation(i: DelegationInputs): DelegationView {
  const byId = new Map(i.staff.map((s) => [s.personId, s] as const));
  const delegated = new Map<number, number>();
  const rows: DelegationRow[] = [...i.tasks].sort().map((taskId) => {
    const hours = taskHours(taskId);
    let s = settingFor(taskId, i);
    const holder = s.holderId === null ? null : byId.get(s.holderId) ?? null;
    // A holder who has left or is away hands the task back (K6.1.1 edge case; E7.3.1 "a vacant job means the coach does it").
    if (s.holderId !== null && (!holder || !holder.available)) s = { holderId: null, autonomy: 'keeps' };
    const coachHours = hours[s.autonomy];
    if (s.holderId !== null) delegated.set(s.holderId, (delegated.get(s.holderId) ?? 0) + q(hours.keeps));
    const candidates = (i.qualified[taskId] ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is DelegationStaff => !!m && m.available && m.personId !== i.headCoachId)
      .map((m) => ({ personId: m.personId, name: m.name }));
    const defaultOwnerId = i.defaultOwner[taskId] ?? null;
    return {
      taskId, side: taskSide(taskId), holderId: s.holderId, holderName: s.holderId === null ? null : byId.get(s.holderId)?.name ?? null,
      autonomy: s.autonomy, isDefault: !i.assignments[taskId], defaultOwnerId: defaultOwnerId === i.headCoachId ? null : defaultOwnerId,
      coachHours, hoursSaved: hours.keeps - coachHours, reviewStep: hours.proposes > 0,
      record: s.holderId === null ? null : i.records?.[recordKey(s.holderId, taskId)] ?? null,
      candidates, blockedKey: candidates.length === 0 ? (i.staff.length === 0 ? 'dg.blocked.noStaff' : 'dg.blocked.noQualified') : null,
    };
  });
  const taskQ = rows.reduce((t, r) => t + q(r.coachHours), 0);
  const savedQ = rows.reduce((t, r) => t + q(r.hoursSaved), 0);
  const projectedQ = q(i.fixedHours) + taskQ;
  return {
    readOnly: !i.userIsHeadCoach,
    rows,
    staff: [...i.staff].sort((a, b) => a.personId - b.personId).map((s) => {
      const dh = (delegated.get(s.personId) ?? 0) / 4;
      return { ...s, delegatedHours: dh, overloaded: q(s.loadHours) + q(dh) > q(s.capacityHours) };
    }),
    statements: [...(i.statements ?? [])].sort((a, b) => a.eventId - b.eventId),
    totals: {
      budgetHours: i.budgetHours, fixedHours: i.fixedHours, taskHours: taskQ / 4, projectedHours: projectedQ / 4,
      overBudget: projectedQ > q(i.budgetHours), savedHours: savedQ / 4,
    },
    presets: PRESETS,
  };
}

// --- presets (O4.3.2) -------------------------------------------------------------------------------------

export type PresetId = 'ceo' | 'offense_caller' | 'defense_caller' | 'do_everything';
export const PRESETS: readonly PresetId[] = ['ceo', 'offense_caller', 'defense_caller', 'do_everything'];

/** What a head coach keeps under each preset, beyond tasks nobody can take. The rest go to the staff default, deciding. */
function keeps(preset: PresetId, taskId: string): boolean {
  const side = taskSide(taskId);
  switch (preset) {
    case 'ceo': return false;
    case 'do_everything': return true;
    case 'offense_caller': return side === 'offense' && /^(calling|gameplan|adjustments|package)\./.test(taskId);
    case 'defense_caller': return side === 'defense' && /^(calling|gameplan|adjustments)\./.test(taskId);
  }
}

/** The assignments a preset produces. A task with no default owner who may hold it stays with the head coach. */
export function presetAssignments(preset: PresetId, i: Pick<DelegationInputs, 'tasks' | 'defaultOwner' | 'qualified' | 'headCoachId'>): Record<string, Assignment> {
  const out: Record<string, Assignment> = {};
  for (const t of [...i.tasks].sort()) {
    const d = i.defaultOwner[t] ?? null;
    const allowed = d !== null && d !== i.headCoachId && (i.qualified[t] ?? []).includes(d);
    out[t] = keeps(preset, t) || !allowed ? { holderId: null, autonomy: 'keeps' } : { holderId: d, autonomy: 'decides' };
  }
  return out;
}
