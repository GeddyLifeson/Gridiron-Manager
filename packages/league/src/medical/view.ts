// What people see (H5.1.2, H5.6.2, H5.4.3). The shown case never carries a truth value; the daily report
// lists every known active injury; filtering is by rung and group. No medical field holds mental-health
// information, so no path can show it (H5.4.3 acceptance).
import data from './data/medical.json' with { type: 'json' };
import { recommendedPractice } from './authority.ts';
import type { CaseShown, Limits, MedicalCase, MedicalState, Participation } from './types.ts';

export interface ShownCase {
  readonly id: number;
  readonly personId: number;
  readonly teamId: number;
  readonly typeId: string;
  readonly occurredDay: number;
  readonly shown: CaseShown;
  /** Protocol step (1 to 5) or null; never the hidden symptom days. */
  readonly protocolStep: number | null;
  readonly mediaAvailable: boolean;
  readonly status: MedicalCase['status'];
}

export function shownCase(c: MedicalCase): ShownCase {
  return {
    id: c.id, personId: c.personId, teamId: c.teamId, typeId: c.typeId, occurredDay: c.occurredDay, shown: c.shown,
    protocolStep: c.protocol && !c.protocol.cleared ? c.protocol.step : null,
    mediaAvailable: c.protocol ? c.protocol.mediaAvailable : true,
    status: c.status,
  };
}

/** One line of the trainer's daily report to the coach (H5.1.2). */
export interface DailyReportEntry {
  readonly personId: number;
  readonly typeId: string;
  readonly state: MedicalState;
  readonly limits: Limits | null;
  /** Shown range of days left, or null (before imaging, or a concussion: no set timeline). */
  readonly rangeDays: readonly [number, number] | null;
  readonly protocolStep: number | null;
  readonly practice: Participation;
}

export function dailyReport(cases: readonly MedicalCase[], teamId: number): DailyReportEntry[] {
  return cases
    .filter((c) => c.teamId === teamId && c.status === 'active' && c.shown.known)
    .map((c) => ({
      personId: c.personId, typeId: c.typeId, state: c.shown.state, limits: c.shown.limits,
      rangeDays: c.protocol ? null : c.shown.rangeDays,
      protocolStep: c.protocol && !c.protocol.cleared ? c.protocol.step : null,
      practice: recommendedPractice(c),
    }))
    .sort((a, b) => a.personId - b.personId);
}

export interface Viewer {
  readonly role: string;
  /** Players the viewer coaches (his group, or unit for a coordinator); ignored for team scope. */
  readonly playerIds: readonly number[];
}

interface RungRow { readonly role: string; readonly scope: string; readonly ranges: boolean }
const RUNG = new Map<string, RungRow>((data.rungView as RungRow[]).map((r) => [r.role, r]));

/**
 * Filter the report for a viewer (H5.6.2 rule 1): below head coach nobody sees players outside his group,
 * and the rows below the line of `ranges` see state without projected ranges. An unknown role sees nothing.
 */
export function reportFor(entries: readonly DailyReportEntry[], viewer: Viewer): DailyReportEntry[] {
  const r = RUNG.get(viewer.role);
  if (!r) return [];
  const mine = new Set(viewer.playerIds);
  return entries
    .filter((e) => r.scope === 'team' || mine.has(e.personId))
    .map((e) => (r.ranges ? e : { ...e, rangeDays: null }));
}
