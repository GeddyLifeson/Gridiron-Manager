// coach.life (O4.6.3, E7, E8): this week's hours by task, sleep and energy as words with a trend, what the
// physician and checkups have told him, family events with the hours they ask, his default week, and every
// active effect of his state with what it touches (O4.6.3 acceptance). The health state itself is hidden
// (E8.2.1): he sees warnings and checkup lines, never `HealthRecord.state`. Words come from the life module's
// bands (`sleepBand`, `loadBand`); no number of his fatigue reaches the view beyond hours.
import { life } from '@gm/career';
import { t } from './text.ts';
import type { LifeView } from './types.ts';

export interface LifeInput {
  readonly rights: readonly string[];
  readonly week: number;
  /** The week as run (E7.1.1). */
  readonly result: life.WeekResult;
  /** Weekly work and sleep summaries so far, for the load (E8.1.1). */
  readonly history: readonly life.WeekSummary[];
  readonly health: life.HealthRecord;
  readonly household: life.Household;
  /** Family events he has been told of (inbox notice already arrived), with the date text each is shown under. */
  readonly events: readonly { readonly event: life.LifeEvent; readonly date: string }[];
  readonly template: readonly { readonly task: string; readonly hours: number }[];
  readonly realism: life.LifeRealism;
  /** How many latest checkup lines to show. */
  readonly checkupsShown?: number;
}

type Trend = 'better' | 'same' | 'worse';
const LOAD_RANK: Readonly<Record<life.LoadBand, number>> = { light: 0, normal: 1, heavy: 2, veryHeavy: 3 };
const round1 = (x: number): number => Math.round(x * 10) / 10;

export function hoursByTask(r: life.WeekResult): { task: string; hours: number }[] {
  const m = new Map<string, number>();
  for (const o of r.outcomes) for (const w of o.kept) if (w.delegateId === null) m.set(w.category, (m.get(w.category) ?? 0) + w.hours);
  const rows = [...m].map(([task, hours]) => ({ task, hours: round1(hours) })).sort((a, b) => b.hours - a.hours || (a.task < b.task ? -1 : 1));
  if (r.week.totals.travel > 0) rows.push({ task: t('task.travel'), hours: round1(r.week.totals.travel) });
  if (r.week.totals.home > 0) rows.push({ task: t('task.home'), hours: round1(r.week.totals.home) });
  return rows;
}

export function sleepWord(r: life.WeekResult): { word: string; trend: Trend } {
  const trend: Trend = r.debtEnd < r.debtStart ? 'better' : r.debtEnd > r.debtStart ? 'worse' : 'same';
  return { word: t(`sleep.${life.sleepBand(r.debtEnd)}`), trend };
}

export function energyWord(history: readonly life.WeekSummary[], week: number): { word: string; trend: Trend } {
  const now = life.computeLoad(history, week);
  const before = life.computeLoad(history, week - 1);
  const d = before.weeksUsed === 0 ? 0 : LOAD_RANK[now.band] - LOAD_RANK[before.band];
  return { word: t(`energy.${now.band}`), trend: d < 0 ? 'better' : d > 0 ? 'worse' : 'same' };
}

export function healthLines(h: life.HealthRecord, shown: number): string[] {
  const out: string[] = [];
  if (h.awayUntil !== null) out.push(t('away', { week: h.awayUntil }));
  for (const w of h.warnings) if (w.outcome === 'open') out.push(life.warningText(w));
  const checks = [...h.checkups].sort((a, b) => b.week - a.week).slice(0, shown);
  for (const c of checks) out.push(t('checkup', { week: c.week, line: c.line }));
  return out;
}

export function effectLines(r: life.WeekResult, realism: life.LifeRealism): { id: string; line: string }[] {
  const out: { id: string; line: string }[] = [];
  const g = life.gameDayEffects(r.debtEnd, realism);
  if (g.notice) out.push({ id: 'game_day_tired', line: g.notice });
  const dropped = r.outcomes.flatMap((o) => o.dropped.map((w) => w.taskId));
  if (dropped.length) out.push({ id: 'tasks_dropped', line: t('effect.dropped', { list: [...new Set(dropped)].map((s) => s.replace(/[_.]/g, ' ')).join(', ') }) });
  if (r.slowWorkHours > 0) out.push({ id: 'slow_work', line: t('effect.slowWork', { hours: round1(r.slowWorkHours) }) });
  const fromHome = r.outcomes.reduce((s, o) => s + o.tookFromHome, 0);
  const fromSleep = r.outcomes.reduce((s, o) => s + o.tookFromSleep, 0);
  if (fromHome > 0) out.push({ id: 'took_from_home', line: t('effect.tookFromHome', { hours: round1(fromHome) }) });
  if (fromSleep > 0) out.push({ id: 'took_from_sleep', line: t('effect.tookFromSleep', { hours: round1(fromSleep) }) });
  return out;
}

export function familyRows(events: LifeInput['events']): LifeView['family'][number][] {
  return [...events]
    .sort((a, b) => a.event.week - b.event.week)
    .map(({ event: e, date }) => ({
      event: t(`event.${e.kind}`), date,
      owed: e.hours <= 0 ? null : e.periodWeeks > 1 ? t('event.owedWeekly', { hours: round1(e.hours), weeks: e.periodWeeks }) : t('event.owed', { hours: round1(e.hours) }),
    }));
}

export function buildLifeView(x: LifeInput): LifeView {
  const totals = x.result.week.totals;
  return {
    rights: [...x.rights],
    week: t('life.week', { week: x.week }),
    hours: hoursByTask(x.result),
    hoursAvailable: round1(life.weekHours() - totals.sleep - totals.needs),
    sleep: sleepWord(x.result),
    energy: energyWord(x.history, x.week),
    health: healthLines(x.health, x.checkupsShown ?? 2),
    family: x.household.members.length === 0 ? [] : familyRows(x.events),
    template: x.template.map((r) => ({ task: r.task, hours: r.hours })),
    effects: effectLines(x.result, x.realism),
  };
}
