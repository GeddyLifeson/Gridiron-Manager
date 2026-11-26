// E7.1.2 the hour ledger. Append-only rows of where the hours went and who did the work. It records
// hours and tasks only, never a quality grade for the coach (rule 4).
import { toQ, fromQ } from './params.ts';
import type { LedgerCategory } from './costs.ts';
import type { WeekResult } from './week.ts';

export interface LedgerRow {
  /** Absolute week index of the career (the caller maps it to world dates). */
  readonly week: number;
  /** 0 to 6 within the week. */
  readonly day: number;
  readonly taskId: string;
  readonly category: LedgerCategory;
  readonly hours: number;
  /** Person id of who did it; the coach's own id when he did it himself. */
  readonly doneBy: number;
  readonly delegated: boolean;
  readonly unplanned: boolean;
}

/** Rows for one committed week. Coach rows add up to the week's work, travel, sleep and home. */
export function ledgerRowsFor(week: number, coachId: number, r: WeekResult): LedgerRow[] {
  const rows: LedgerRow[] = [];
  r.outcomes.forEach((o, day) => {
    for (const w of o.kept) rows.push({ week, day, taskId: w.taskId, category: w.category, hours: w.hours, doneBy: coachId, delegated: false, unplanned: !!w.unplanned });
    for (const w of o.delegated) rows.push({ week, day, taskId: w.taskId, category: w.category, hours: w.hours, doneBy: w.delegateId!, delegated: true, unplanned: !!w.unplanned });
    const d = r.week.days[day]!;
    if (d.travel > 0) rows.push({ week, day, taskId: 'travel', category: 'travel', hours: d.travel, doneBy: coachId, delegated: false, unplanned: false });
    rows.push({ week, day, taskId: 'sleep', category: 'sleep', hours: d.sleep, doneBy: coachId, delegated: false, unplanned: false });
    if (d.home > 0) rows.push({ week, day, taskId: 'home', category: 'home', hours: d.home, doneBy: coachId, delegated: false, unplanned: false });
  });
  return rows;
}

/** Append-only ledger. A changed plan writes new rows and never edits old ones (rule 3). */
export class HourLedger {
  private readonly rows: LedgerRow[] = [];
  append(rows: readonly LedgerRow[]): void {
    for (const r of rows) this.rows.push(Object.freeze({ ...r }));
  }
  all(): readonly LedgerRow[] { return this.rows.slice(); }
  get length(): number { return this.rows.length; }
}

/** Totals by category for rows done by `personId` (not delegated) in weeks [from, to]. */
export function totalsByCategory(rows: readonly LedgerRow[], personId: number, from = -Infinity, to = Infinity): Partial<Record<LedgerCategory, number>> {
  const q: Partial<Record<LedgerCategory, number>> = {};
  for (const r of rows) if (r.doneBy === personId && !r.delegated && r.week >= from && r.week <= to) q[r.category] = (q[r.category] ?? 0) + toQ(r.hours);
  const out: Partial<Record<LedgerCategory, number>> = {};
  for (const [k, v] of Object.entries(q)) out[k as LedgerCategory] = fromQ(v);
  return out;
}

/** Coach work hours in a week from the ledger (everything but travel, sleep and home). */
export function workHoursOf(rows: readonly LedgerRow[], personId: number, week: number): number {
  let q = 0;
  for (const r of rows) if (r.week === week && r.doneBy === personId && !r.delegated && r.category !== 'travel' && r.category !== 'sleep' && r.category !== 'home') q += toQ(r.hours);
  return fromQ(q);
}

/** E7.1.2 rule 2: "Unplanned demands this week last season: about N hours", the user's own weekly mean
 *  of unplanned rows over the given weeks. */
export function unplannedWeeklyMean(rows: readonly LedgerRow[], personId: number, weeks: readonly number[]): number {
  if (weeks.length === 0) return 0;
  const set = new Set(weeks);
  let q = 0;
  for (const r of rows) if (r.unplanned && r.doneBy === personId && !r.delegated && set.has(r.week)) q += toQ(r.hours);
  return fromQ(q) / weeks.length;
}

export function unplannedLine(meanHours: number): string {
  return `Unplanned demands this week last season: about ${Math.round(meanHours)} hours.`;
}
