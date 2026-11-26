// The wristband and the audible list (G7.6). The band format, capacity and stale-cell check are G4.4.1's
// (playbook/codes.ts); this module chooses which sheet calls go on the band, numbers them on the sheet, and
// holds the audible list and the quarterback's freedom.
import { buildBand, bandCapacity, type BandFormat, type Call, type Playbook } from '../playbook/index.ts';
import { param } from './params.ts';
import type { PlanWarning } from './plan.ts';
import { callKey, type Audible, type BandCellRef, type QbFreedom, type Sheet } from './sheet.ts';

/** Calls the designer suggests for the band: over the spoken limit, every two-minute call, every no-huddle call. */
export function bandSuggestions(sheet: Sheet, overLimit: (c: Call) => boolean): Call[] {
  const hurry = new Set(sheet.situations.filter((s) => s.anyOf.some((r) => r.all.some((c) => (c.on === 'halfSecondsLeft' && c.max !== undefined && c.max <= 120) || (c.on === 'tempo' && c.in.some((t) => t !== 'huddle'))))).map((s) => s.id));
  const seen = new Set<string>();
  const out: Call[] = [];
  for (const b of sheet.boxes) for (const e of b.entries) {
    const k = callKey(e.call);
    if (seen.has(k)) continue;
    if (overLimit(e.call) || (b.situationId !== null && hurry.has(b.situationId)) || b.category === 'clock_plays') { seen.add(k); out.push(e.call); }
  }
  return out;
}

/** Fill the band: chosen calls first, then the longest remaining sheet calls, up to the format's capacity. */
export function fillBand(sheet: Sheet, format: BandFormat, chosen: readonly Call[], spokenS: (c: Call) => number, versionOf: (playId: string) => number, week: number): BandCellRef[] {
  const cap = bandCapacity(format);
  const keys = new Set<string>();
  const calls: Call[] = [];
  const push = (c: Call): void => { const k = callKey(c); if (!keys.has(k) && calls.length < cap) { keys.add(k); calls.push(c); } };
  chosen.forEach(push);
  const rest = sheet.boxes.flatMap((b) => b.entries.map((e) => e.call)).sort((a, b) => spokenS(b) - spokenS(a) || (callKey(a) < callKey(b) ? -1 : 1));
  rest.forEach(push);
  return buildBand(week, format, calls, versionOf).cells.map((c) => ({ label: c.label, call: c.call }));
}

/** Band number shown beside a call on the sheet; null when the call is not on the band (it cannot be sent by number). */
export function bandNumberOf(sheet: Pick<Sheet, 'wristband'>, call: Call): string | null {
  const k = callKey(call);
  return sheet.wristband.find((c) => callKey(c.call) === k)?.label ?? null;
}

/** G7.6.1 acceptance: every band number maps to exactly one call, and no call sits under two numbers. */
export function bandProblems(cells: readonly BandCellRef[]): string[] {
  const out: string[] = [];
  const labels = new Map<string, number>(), calls = new Map<string, string>();
  for (const c of cells) {
    labels.set(c.label, (labels.get(c.label) ?? 0) + 1);
    const k = callKey(c.call);
    if (calls.has(k)) out.push(`${k} is under ${calls.get(k)} and ${c.label}`); else calls.set(k, c.label);
  }
  for (const [l, n] of labels) if (n > 1) out.push(`number ${l} is used ${n} times`);
  return out;
}

/** Calls the console can send when the radio fails: band, signal and code-word calls only (G7.6.1 edge case). */
export function radioDownCalls(sheet: Sheet, signalOrCode: (c: Call) => boolean): Call[] {
  return sheet.boxes.flatMap((b) => b.entries.map((e) => e.call)).filter((c) => bandNumberOf(sheet, c) !== null || signalOrCode(c));
}

// ---- G7.6.2 audibles -------------------------------------------------------------------------------------

/** Audible list checks: at most 6; each must be installed and practised as an audible (D9 reps). */
export function checkAudibles(list: readonly Audible[], book: Playbook, audibleReps: (playId: string) => number): PlanWarning[] {
  const w: PlanWarning[] = [];
  if (list.length > param('audible.max')) w.push({ leaf: 'G7.6.2', code: 'audible.count', subject: 'audibles', text: `${list.length} audibles (up to ${param('audible.max')})`, severity: 'warning' });
  for (const a of list) {
    if (book.plays.get(a.call.playId)?.status !== 'installed') w.push({ leaf: 'G7.6.2', code: 'audible.not_installed', subject: a.name, text: `${a.name} is not installed`, severity: 'warning' });
    else if (audibleReps(a.call.playId) <= 0) w.push({ leaf: 'G7.6.2', code: 'audible.unpractised', subject: a.name, text: `${a.name} has not been practised as an audible`, severity: 'warning' });
  }
  return w;
}

/**
 * Whether the quarterback may change to this play at the line: the list is in force only at full freedom;
 * at "package" he may only flip within a packaged call (its two plays). G7.6.2 acceptance: never outside.
 */
export function mayAudibleTo(sheet: Pick<Sheet, 'audibleList'>, freedom: QbFreedom, called: Call, target: string): boolean {
  if (freedom === 'none') return false;
  if (freedom === 'package') return called.second !== undefined && (called.playId === target || called.second.playId === target);
  return sheet.audibleList.some((a) => a.call.playId === target) || (called.second !== undefined && (called.playId === target || called.second.playId === target));
}
