// The game plan (G6.1.2 to G6.2.3): themes of the week, the menu with its balance and gaps, what is new
// this week against what the week can teach, and sequences. Install cost, readiness projection and the
// week's teaching capacity are owned by G5 and H1; they arrive as injected functions so this module only
// shows cost and never suggests plays (O3.4.1).
import type { Call, PlayEntry, Playbook, Role } from '../playbook/index.ts';
import { CATALOGUE_BY_ID, type InstallDay } from './catalogue.ts';
import type { LookCell } from './looks.ts';
import { param } from './params.ts';
import { expectedSnaps, type ReferenceTable } from './reference.ts';
import { callKey } from './sheet.ts';

export type Side = 'offense' | 'defense' | 'special_teams';

/** Defensive facts of a menu call the G2 call object knows (G6.4.1). */
export interface DefenseMeta {
  readonly package: string;
  readonly personnelFaced: readonly string[];
  readonly role: 'set' | 'stress' | 'break';
  readonly pressure: boolean;
  readonly shell: 'zero_high' | 'one_high' | 'two_high';
}

export type ProtectionAnswer = 'slide' | 'chip' | 'seventh_protector' | 'move_pocket' | 'quick' | 'screen';

export interface MenuEntry {
  readonly id: string;
  readonly side: Side;
  readonly call: Call;
  /** Catalogue or sheet situation ids the call is chosen for. */
  readonly situationIds: readonly string[];
  readonly targetReps: number;
  readonly defense?: DefenseMeta;
  /** Per-threat answers set on this call, overriding the plan answer (G6.3.2). */
  readonly protection?: Readonly<Record<string, ProtectionAnswer>>;
}

export type ThemeKind = 'attack' | 'protect' | 'exploit' | 'help' | 'tendency';
export interface Theme {
  readonly id: string;
  readonly side: Side;
  readonly text: string;
  readonly kind: ThemeKind;
  /** Looks-board cells the theme rests on ("bucket/look"). */
  readonly evidence: readonly string[];
  /** Menu entry ids chosen for it. */
  readonly calls: readonly string[];
  /** The install day whose content it serves (G5.3.1). */
  readonly installDay: InstallDay;
}

export interface PlanWarning {
  /** The leaf whose rule raised it (G6.6.1 acceptance: every warning traces to a rule). */
  readonly leaf: string;
  readonly code: string;
  readonly subject: string;
  readonly text: string;
  readonly severity: 'warning' | 'note';
}

export const cellKey = (c: Pick<LookCell, 'bucket' | 'look'>): string => `${c.bucket}/${c.look}`;

/** G6.1.2: 3 to 5 themes per side (a sixth allowed and warned); each links evidence and a call; each install day has calls. */
export function checkThemes(themes: readonly Theme[], menu: readonly MenuEntry[], cells: readonly LookCell[]): PlanWarning[] {
  const out: PlanWarning[] = [];
  const keys = new Set(cells.map(cellKey));
  const byId = new Map(menu.map((m) => [m.id, m]));
  for (const side of new Set(themes.map((t) => t.side))) {
    const n = themes.filter((t) => t.side === side).length;
    if (n > param('themes.max')) out.push({ leaf: 'G6.1.2', code: 'themes.too_many', subject: side, text: `${n} themes on ${side}; the plan is built on ${param('themes.max')} or fewer`, severity: 'warning' });
    if (n < param('themes.min')) out.push({ leaf: 'G6.1.2', code: 'themes.too_few', subject: side, text: `${n} themes on ${side}`, severity: 'note' });
  }
  for (const t of themes) {
    if (!t.evidence.some((e) => keys.has(e))) out.push({ leaf: 'G6.1.2', code: 'themes.no_evidence', subject: t.id, text: `"${t.text}" has no evidence on the looks board`, severity: 'warning' });
    const calls = t.calls.map((c) => byId.get(c)).filter((m): m is MenuEntry => m !== undefined);
    if (calls.length === 0) out.push({ leaf: 'G6.1.2', code: 'themes.no_calls', subject: t.id, text: `"${t.text}" has no calls on the menu`, severity: 'warning' });
    else if (!calls.some((m) => m.situationIds.some((s) => CATALOGUE_BY_ID.get(s)?.installDay === t.installDay))) {
      out.push({ leaf: 'G6.1.2', code: 'themes.day_without_calls', subject: t.id, text: `"${t.text}" serves install day ${t.installDay} but none of its calls are for that day's situations`, severity: 'warning' });
    }
  }
  return out;
}

export type RunPass = 'run' | 'pass' | 'other';
const PASS_SECTIONS = new Set(['dropback', 'quick', 'play_action', 'movement', 'screen']);
export function runPassOf(p: PlayEntry | undefined): RunPass {
  if (!p) return 'other';
  const s = p.section[0];
  return s === 'run' ? 'run' : s !== undefined && PASS_SECTIONS.has(s) ? 'pass' : 'other';
}

export interface Balance {
  readonly runPass: Readonly<Record<RunPass, number>>;
  readonly personnel: Readonly<Record<string, number>>;
  readonly formation: Readonly<Record<string, number>>;
  readonly role: Readonly<Partial<Record<Role, number>>>;
}

/** G6.2.1 balance of a menu: counts by run and pass, personnel, formation and role (one count per entry). */
export function balance(menu: readonly MenuEntry[], book: Playbook): Balance {
  const rp: Record<RunPass, number> = { run: 0, pass: 0, other: 0 };
  const per: Record<string, number> = {}, form: Record<string, number> = {}, role: Partial<Record<Role, number>> = {};
  for (const m of menu) {
    const p = book.plays.get(m.call.playId);
    rp[runPassOf(p)]++;
    const pe = p?.parts.personnel ?? 'none', fo = p?.parts.formation ?? 'none';
    per[pe] = (per[pe] ?? 0) + 1;
    form[fo] = (form[fo] ?? 0) + 1;
    if (p) role[p.role] = (role[p.role] ?? 0) + 1;
  }
  return { runPass: rp, personnel: per, formation: form, role };
}

/** Scouted looks above the rate line that no menu play names in its `beats` (G6.2.1 acceptance). */
export function unansweredLooks(cells: readonly LookCell[], menu: readonly MenuEntry[], book: Playbook, rateLine = param('menu.unansweredRate')): LookCell[] {
  const beaten = new Set(menu.flatMap((m) => book.plays.get(m.call.playId)?.beats ?? []));
  return cells.filter((c) => (c.rate ?? (c.n === 0 ? 0 : c.count / c.n)) >= rateLine && !beaten.has(c.look));
}

export interface SituationTarget {
  readonly situationId: string;
  readonly expected: number | null;
  readonly onMenu: number;
  readonly suggested: readonly [number, number] | null;
}

const THIRD = new Set(['third_short', 'third_medium', 'third_long', 'third_extra_long']);
const NORMAL = new Set(['first_10', 'first_long', 'second_short', 'second_medium', 'second_long']);
/** G6.2.1 targets: expected snaps (G7.2.3) and the suggested calls for third-down buckets and normal downs. */
export function situationTargets(menu: readonly MenuEntry[], table: ReferenceTable | null, ids: readonly string[]): SituationTarget[] {
  return ids.map((id) => {
    const row = CATALOGUE_BY_ID.get(id);
    const expected = row?.situation && table ? expectedSnaps(row.situation, table).value : null;
    const suggested: readonly [number, number] | null = THIRD.has(id) ? [param('menu.thirdDownCallsMin'), param('menu.thirdDownCallsMax')]
      : NORMAL.has(id) ? [param('menu.normalDownCallsMin'), param('menu.normalDownCallsMax')] : null;
    return { situationId: id, expected, onMenu: menu.filter((m) => m.situationIds.includes(id)).length, suggested };
  });
}

export interface StageSizes { readonly cull: number; readonly practiced: number; readonly practicedRange: readonly [number, number]; readonly notes: readonly PlanWarning[] }
/** G6.2.1 stages: a first cull of about 100, a practiced plan of 30 to 60 distinct plays. */
export function stageSizes(culled: number, menu: readonly MenuEntry[]): StageSizes {
  const practiced = new Set(menu.map((m) => m.call.playId)).size;
  const lo = param('menu.practicedMin'), hi = param('menu.practicedMax');
  const notes: PlanWarning[] = [];
  if (practiced < lo || practiced > hi) notes.push({ leaf: 'G6.2.1', code: 'menu.practiced_range', subject: 'menu', text: `practiced plan ${practiced} plays, target ${lo} to ${hi}`, severity: 'note' });
  return { cull: culled, practiced, practicedRange: [lo, hi], notes };
}

/** A play needing an unavailable player (G6.2.1 edge case); H5 supplies the check. */
export type AvailabilityCheck = (playId: string) => { readonly playerId: string; readonly replacementReadiness: number } | null;
export function unavailableFlags(menu: readonly MenuEntry[], check: AvailabilityCheck): { entryId: string; playerId: string; replacementReadiness: number }[] {
  return menu.flatMap((m) => { const r = check(m.call.playId); return r ? [{ entryId: m.id, ...r }] : []; });
}

// ---- G6.2.2 New for this week ----------------------------------------------------------------------------

/** The week's shape and install machinery, owned by H1 and G5. Days count full practice days (1 = first). */
export interface WeekInstall {
  readonly shortWeek: boolean;
  /** Learning units the week can teach (G5). */
  readonly capacityUnits: number;
  /** Full practice day the plan is at now; 0 = before the first full practice. */
  readonly today: number;
  /** Team reps left from the start of a day to kickoff (H3). */
  readonly repsFrom: (day: number) => number;
  /** Projected readiness at kickoff of a new play given the reps it gets (G5.4.1 staff estimate). */
  readonly projectReadiness: (playId: string, reps: number) => number;
}

export type NewKind = 'play' | 'known_concept_new_look' | 'tag' | 'protection' | 'check';
export interface NewItem {
  readonly playId: string;
  readonly kind: NewKind;
  readonly units: number;
  readonly repsNeeded: number;
  /** The day the item must enter by (G5.3.1 order) and the day it was added. */
  readonly dueDay: InstallDay;
  readonly addedDay: number;
  readonly projectedReadiness: number;
}

/** Install day of a menu call: the earliest day among its situations (normal downs 1, third 2, red zone and two-minute 3). */
export function dueDayOf(m: MenuEntry): InstallDay {
  const days = m.situationIds.map((s) => CATALOGUE_BY_ID.get(s)?.installDay ?? 1);
  return (days.length === 0 ? 1 : Math.min(...days)) as InstallDay;
}

function newKindOf(p: PlayEntry, book: Playbook): NewKind {
  const parent = p.parentId ? book.plays.get(p.parentId) : undefined;
  if (parent && parent.status === 'installed' && parent.parts.concept === p.parts.concept) return 'known_concept_new_look';
  return 'play';
}

/**
 * G6.2.2 list of everything on the menu not yet installed, cheapest forms first. A known concept from a new
 * formation or motion costs about a third of a new concept (the play's own units are G1.7.1's; this list
 * ranks by them). An item added after its due day gets only the reps left from the day it was added.
 */
/** A new part the menu needs that is not a play: a new protection, check or tag (G3 parts, G5.5.2 units). */
export interface NewPart { readonly id: string; readonly kind: 'tag' | 'protection' | 'check'; readonly units: number; readonly reps: number; readonly addedDay: number }

export function newForWeek(menu: readonly MenuEntry[], book: Playbook, week: WeekInstall, addedDay: (entryId: string) => number = () => week.today, parts: readonly NewPart[] = []): NewItem[] {
  const seen = new Set<string>();
  const out: NewItem[] = [];
  for (const m of menu) {
    const p = book.plays.get(m.call.playId);
    if (!p || p.status === 'installed' || seen.has(p.id)) continue;
    seen.add(p.id);
    const kind = newKindOf(p, book);
    const units = kind === 'known_concept_new_look' ? p.units * param('install.knownConceptShare') : p.units;
    const due = dueDayOf(m);
    const added = addedDay(m.id);
    // Installed on its due day; added later, it gets only the reps left from the day it was added.
    const reps = Math.min(m.targetReps, week.repsFrom(Math.max(added, due)));
    out.push({ playId: p.id, kind, units, repsNeeded: m.targetReps, dueDay: due, addedDay: added, projectedReadiness: week.projectReadiness(p.id, reps) });
  }
  for (const q of parts) {
    out.push({ playId: q.id, kind: q.kind, units: q.units, repsNeeded: q.reps, dueDay: 1, addedDay: q.addedDay, projectedReadiness: week.projectReadiness(q.id, Math.min(q.reps, week.repsFrom(Math.max(q.addedDay, 1)))) });
  }
  return out.sort((a, b) => a.units - b.units || (a.playId < b.playId ? -1 : 1));
}

export interface InstallMeter { readonly units: number; readonly capacity: number; readonly warnings: readonly PlanWarning[] }

/** G6.2.2 meter and warnings: units against capacity, new share over 20%, over 8 new plays, new protection or check after day 1, any new play on a short week. */
export function installMeter(items: readonly NewItem[], menu: readonly MenuEntry[], week: WeekInstall): InstallMeter {
  const units = items.reduce((a, i) => a + i.units, 0);
  const w: PlanWarning[] = [];
  const practiced = new Set(menu.map((m) => m.call.playId)).size;
  const plays = items.filter((i) => i.kind === 'play' || i.kind === 'known_concept_new_look');
  if (units > week.capacityUnits) w.push({ leaf: 'G6.2.2', code: 'install.over_capacity', subject: 'week', text: `${units.toFixed(1)} new units against a capacity of ${week.capacityUnits}`, severity: 'warning' });
  if (practiced > 0 && plays.length / practiced > param('install.newShareMax')) w.push({ leaf: 'G6.2.2', code: 'install.new_share', subject: 'week', text: `${plays.length} of ${practiced} plays are new`, severity: 'warning' });
  if (plays.length > param('install.newPlaysMax')) w.push({ leaf: 'G6.2.2', code: 'install.new_count', subject: 'week', text: `${plays.length} new plays`, severity: 'warning' });
  for (const i of items) {
    if ((i.kind === 'protection' || i.kind === 'check') && i.addedDay > 1) w.push({ leaf: 'G6.2.2', code: 'install.late_protection', subject: i.playId, text: `new ${i.kind} ${i.playId} after the first full practice`, severity: 'warning' });
    if (i.addedDay > i.dueDay) w.push({ leaf: 'G6.2.2', code: 'install.late_item', subject: i.playId, text: `${i.playId} added on day ${i.addedDay}, due by day ${i.dueDay}`, severity: 'warning' });
  }
  if (week.shortWeek && plays.length > 0) w.push({ leaf: 'G6.2.2', code: 'install.short_week', subject: 'week', text: 'short week: the default is no new plays, only new tags of installed plays', severity: 'warning' });
  return { units, capacity: week.capacityUnits, warnings: w };
}

// ---- G6.2.3 Sequences ------------------------------------------------------------------------------------

export type SequenceKind = 'set_up' | 'until_adjust' | 'set_stress_break';
export interface Sequence {
  readonly id: string;
  readonly kind: SequenceKind;
  /** Menu entry ids in order, 2 to 4. */
  readonly calls: readonly string[];
  /** "Until they adjust": runs of the earlier call before the later one's reminder (default 1). */
  readonly times?: number;
  /** "Until they adjust": the named reaction the booth watches for. */
  readonly reaction?: string;
}

export function checkSequences(seqs: readonly Sequence[], menu: readonly MenuEntry[]): PlanWarning[] {
  const ids = new Set(menu.map((m) => m.id));
  const out: PlanWarning[] = [];
  for (const s of seqs) {
    if (s.calls.length < param('sequence.minCalls') || s.calls.length > param('sequence.maxCalls')) out.push({ leaf: 'G6.2.3', code: 'sequence.size', subject: s.id, text: `sequence of ${s.calls.length} calls (2 to 4)`, severity: 'warning' });
    for (const c of s.calls) if (!ids.has(c)) out.push({ leaf: 'G6.2.3', code: 'sequence.off_menu', subject: s.id, text: `${c} is not on the menu`, severity: 'warning' });
  }
  return out;
}

/** Whether the reminder for call i of a sequence shows: the earlier call has been called at least once (or `times`). */
export function sequenceReminder(s: Sequence, i: number, timesCalled: (entryId: string) => number): boolean {
  if (i <= 0 || i >= s.calls.length) return false;
  const need = s.kind === 'until_adjust' ? s.times ?? 1 : 1;
  return timesCalled(s.calls[i - 1]!) >= need;
}

/** Keys of distinct calls on a menu (play plus tags). */
export function menuCallKeys(menu: readonly MenuEntry[]): Set<string> {
  return new Set(menu.map((m) => callKey(m.call)));
}
