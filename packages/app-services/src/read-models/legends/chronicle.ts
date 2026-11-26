// X3.2.1 season chronicle: one page per competition season, built by query at open. Sections are
// preseason, each week, postseason and offseason (dates from the C4/T4 calendar). Entries are event lines
// at or above the X4 chronicle threshold, ordered by score inside the week, capped per week (the rest sit
// behind "More this week"). Some entries appear whatever their score: each champion, every head coach
// change, every record set and every award winner. The one-line summary is built from templates over
// events, never authored.
import { param } from './params.ts';
import { byNotability, DEFAULT_TYPES, type CalendarOf, type EventRow, type LegendsTypes, type Section } from './types.ts';

export interface ChronicleEntry { readonly eventId: number; readonly type: string; readonly notability: number | null; readonly guaranteed: boolean }
export interface ChronicleSection {
  readonly section: Section;
  readonly week: number;
  readonly entries: readonly ChronicleEntry[];
  /** Entries past the cap, behind "More this week". */
  readonly more: readonly ChronicleEntry[];
}
export interface ChronicleSummary { readonly textKey: string; readonly params: Readonly<Record<string, string | number>> }
export interface Chronicle {
  readonly competitionId: number;
  readonly seasonYear: number;
  readonly summary: ChronicleSummary | null;
  readonly sections: readonly ChronicleSection[];
  /** History-run seasons show season-level entries only (X3.2.1 edge case). */
  readonly seasonLevelOnly: boolean;
}

export interface ChronicleOptions {
  /** X4.3.1 chronicle threshold (awards.consumerThreshold('chronicle')). */
  readonly threshold: number;
  readonly calendar: CalendarOf;
  /** Whether a season was played in the history run (X10.3.1). */
  readonly historyRun?: boolean;
  /** Last season this team won a title before `seasonYear`, for the summary template. */
  readonly lastTitleBefore?: (teamId: number, seasonYear: number) => number | null;
  readonly types?: LegendsTypes;
}

const SECTION_ORDER: Record<Section, number> = { preseason: 0, week: 1, postseason: 2, offseason: 3 };

export function isGuaranteed(e: EventRow, t: LegendsTypes = DEFAULT_TYPES): boolean {
  if (e.type === t.title || e.type === t.record) return true;
  if (e.type === t.award) return e.payload['place'] === 1;
  return t.coachChanges.includes(e.type) && e.payload['role'] === t.headCoachRole;
}

/** Event types that count as season-level for a history-run season. */
function seasonLevel(e: EventRow, t: LegendsTypes): boolean {
  return isGuaranteed(e, t) || e.type === t.conferenceTitle;
}

export function buildChronicle(rows: readonly EventRow[], competitionId: number, seasonYear: number, opts: ChronicleOptions): Chronicle {
  const t = opts.types ?? DEFAULT_TYPES;
  const weekCap = param('legends.chronicle.week_cap');
  const offCap = param('legends.chronicle.offseason_cap');
  const historyRun = opts.historyRun === true;
  const mine = rows.filter((e) => e.competitionId === competitionId && e.when.date.seasonYear === seasonYear);
  const picked = mine.filter((e) => (historyRun ? seasonLevel(e, t) : isGuaranteed(e, t) || (e.notability !== null && e.notability >= opts.threshold)));

  const groups = new Map<string, { section: Section; week: number; rows: EventRow[] }>();
  for (const e of picked) {
    const place = historyRun ? { section: 'offseason' as const, week: 0 } : opts.calendar(e.competitionId, e.when.date.seasonYear, e.when.date.dayIndex);
    const week = place.section === 'week' ? place.week : 0;
    const k = `${place.section}:${week}`;
    (groups.get(k) ?? groups.set(k, { section: place.section, week, rows: [] }).get(k)!).rows.push(e);
  }
  const sections: ChronicleSection[] = [];
  for (const g of [...groups.values()].sort((a, b) => SECTION_ORDER[a.section] - SECTION_ORDER[b.section] || a.week - b.week)) {
    const cap = g.section === 'offseason' ? offCap : weekCap;
    // Guaranteed entries first (they never fall behind "More"), then by score.
    const ordered = [...g.rows].sort((a, b) => Number(isGuaranteed(b, t)) - Number(isGuaranteed(a, t)) || byNotability(a, b));
    const entry = (e: EventRow): ChronicleEntry => ({ eventId: e.id, type: e.type, notability: e.notability, guaranteed: isGuaranteed(e, t) });
    const shown = ordered.filter((e, i) => i < cap || isGuaranteed(e, t)).sort(byNotability);
    const ids = new Set(shown.map((e) => e.id));
    sections.push({ section: g.section, week: g.week, entries: shown.map(entry), more: ordered.filter((e) => !ids.has(e.id)).map(entry) });
  }
  return { competitionId, seasonYear, summary: summaryOf(mine, seasonYear, t, opts.lastTitleBefore), sections, seasonLevelOnly: historyRun };
}

/** "<team> won its first title since <year>", or its first title, or a plain champion line. */
export function summaryOf(rows: readonly EventRow[], seasonYear: number, t: LegendsTypes, lastTitleBefore?: (teamId: number, seasonYear: number) => number | null): ChronicleSummary | null {
  const title = [...rows].filter((e) => e.type === t.title && e.where.teamId !== null).sort((a, b) => a.id - b.id)[0];
  if (!title || title.where.teamId === null) return null;
  const team = title.where.teamId;
  if (!lastTitleBefore) return { textKey: 'legends.chronicle.summary.champion', params: { team } };
  const prev = lastTitleBefore(team, seasonYear);
  if (prev === null) return { textKey: 'legends.chronicle.summary.first_title', params: { team } };
  return { textKey: 'legends.chronicle.summary.first_since', params: { team, year: prev } };
}

/** Last title season for a team before a season, from title rows (feeds `lastTitleBefore`). */
export function lastTitleFrom(rows: readonly EventRow[], t: LegendsTypes = DEFAULT_TYPES): (teamId: number, seasonYear: number) => number | null {
  const by = new Map<number, number[]>();
  for (const e of rows) if (e.type === t.title && e.where.teamId !== null) (by.get(e.where.teamId) ?? by.set(e.where.teamId, []).get(e.where.teamId)!).push(e.when.date.seasonYear);
  return (team, season) => {
    const prior = (by.get(team) ?? []).filter((y) => y < season);
    return prior.length === 0 ? null : Math.max(...prior);
  };
}
