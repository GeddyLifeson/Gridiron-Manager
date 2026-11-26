// E7.2.1 the task cost table and E7.2.2 what changes a cost. One table prices every timed action in
// hours; nothing about the coach (experience, age, labels, tiredness) is an input (E7.2.2 rules 4, 5).
import tablesJson from './tables.json' with { type: 'json' };
import { param, toQ, fromQ } from './params.ts';

export type LedgerCategory =
  | 'film' | 'planning' | 'practice' | 'meetings' | 'players' | 'staff' | 'recruiting' | 'owner' | 'media'
  | 'outsideIncome' | 'career' | 'money' | 'health' | 'travel' | 'home' | 'sleep';

export interface TaskRow {
  readonly id: string;
  readonly category: LedgerCategory;
  readonly unit: string;
  readonly leaf: string;
  /** Review row for a product of this task (E7.3.2), when one exists. */
  readonly reviewTask?: string;
  readonly filmOncePerWeek?: boolean;
  readonly unitSize?: number;
  readonly plusTravel?: boolean;
  readonly scheduled?: boolean;
  readonly realLength?: boolean;
  readonly hasLongOption?: boolean;
}

export const TASKS: readonly TaskRow[] = tablesJson.tasks.map((t) => ({
  id: t.id,
  category: t.category as LedgerCategory,
  unit: t.unit,
  leaf: t.leaf,
  ...('reviewTask' in t ? { reviewTask: t.reviewTask } : {}),
  ...('filmOncePerWeek' in t ? { filmOncePerWeek: t.filmOncePerWeek } : {}),
  ...('unitSize' in t ? { unitSize: t.unitSize } : {}),
  ...('plusTravel' in t ? { plusTravel: t.plusTravel } : {}),
  ...('scheduled' in t ? { scheduled: t.scheduled } : {}),
  ...('realLength' in t ? { realLength: t.realLength } : {}),
  ...('hoursLong' in t ? { hasLongOption: true } : {}),
}));

const BY_ID = new Map(TASKS.map((t) => [t.id, t] as const));

export function taskRow(id: string): TaskRow {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`life: no cost row for task ${id} (E7.2.1 rule 4: add a row)`);
  return t;
}

/** Things outside the coach that change a cost (E7.2.2). Never the coach's record. */
export interface CostContext {
  /** Long option of a talk (E7.2.1 "0.25 to 0.5 by the option chosen"). */
  readonly long?: boolean;
  /** Travel hours from H8 for a task done in another city (E7.2.2 rule 2). */
  readonly travelHours?: number;
  /** Scheduled length of a block (H1), for block rows. */
  readonly blockHours?: number;
  /** Real length of an interview (E2.3.1), for real-length rows. */
  readonly realHours?: number;
  /** Cap on a real-length row from a rule key (pro head coach interview before season end, E2.3.1). */
  readonly capHours?: number;
}

export interface Cost {
  /** Whole quarter hours charged. */
  readonly q: number;
  readonly hours: number;
  /** Plain reason lines shown with the cost (E7.2.2 "what the user sees"). */
  readonly reasons: readonly string[];
}

/** Cost of `units` of a task done by the coach himself. Units are whole (E7.1.1 rule 8). */
export function taskCost(id: string, units: number, ctx: CostContext = {}): Cost {
  if (!Number.isInteger(units) || units < 0) throw new Error(`life: units must be a whole number, got ${units}`);
  const t = taskRow(id);
  const reasons: string[] = [];
  let perUnitQ = toQ(param(`cost.${t.id}${ctx.long && t.hasLongOption ? '.long' : ''}`));
  let n = units;
  if (t.unitSize) n = Math.ceil(units / t.unitSize); // per started block of clips
  if (t.scheduled) { perUnitQ = toQ(ctx.blockHours ?? 0); reasons.push('scheduled length'); }
  if (t.realLength) {
    const real = ctx.realHours ?? 0;
    perUnitQ = toQ(ctx.capHours !== undefined ? Math.min(real, ctx.capHours) : real);
    reasons.push(ctx.capHours !== undefined && real > ctx.capHours ? `capped at ${ctx.capHours} h` : 'real length');
  }
  let q = perUnitQ * n;
  if (ctx.travelHours && ctx.travelHours > 0) { q += toQ(ctx.travelHours); reasons.push(`plus ${ctx.travelHours} h travel`); }
  return { q, hours: fromQ(q), reasons };
}

/** E7.2.1 edge case: a film cost applies once per game per week. One instance per coach per week. */
export class WeekViewings {
  private readonly seen = new Set<string>();
  /** Cost of watching `gameId` with a film task; zero if already watched this week with the same task. */
  charge(id: string, gameId: string, ctx: CostContext = {}): Cost {
    const t = taskRow(id);
    if (!t.filmOncePerWeek) return taskCost(id, 1, ctx);
    const key = `${id}|${gameId}`;
    if (this.seen.has(key)) return { q: 0, hours: 0, reasons: ['already watched this week'] };
    this.seen.add(key);
    return taskCost(id, 1, ctx);
  }
}
