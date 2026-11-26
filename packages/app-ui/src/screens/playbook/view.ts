// The parts of the playbook read model (app-services read-models/playbook) this screen shows, and the
// intents it sends back. Declared here because app-ui imports only the app-services entry point, which
// re-exports the read model once the integrator adds its barrel line (CR-G67-S3).
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const hasPbText = (id: string): boolean => Object.prototype.hasOwnProperty.call(STRINGS, id);
export const pbTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function pt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export interface UiFilter {
  text?: string; formation?: string; concept?: string; personnel?: string; role?: string; situation?: string; status?: string;
  readinessAtLeast?: number; includeRetired?: boolean;
}
export interface UiRow {
  id: string; call: string; family: string; section: string; personnel: string; formation: string; concept: string; protection: string;
  tags: readonly string[]; status: string; role: string; readinessEstimate: number | null; called: number; lastCalledWeek: number | null;
  avgResult: number | null; sample: number; lengthS: number; words: number; overLimit: boolean; latestStartS: number | null;
}
export interface UiFamily { key: string; plays: readonly string[]; gaps: readonly string[] }
export interface UiWord { partId: string; type: string; word: string; syllables: number; usedBy: number; duplicate: boolean; soundsLike: readonly string[] }
export interface UiLock { allowed: boolean; heldBy: string | null; suggest: boolean }
export interface UiOption { id: string; word: string }
export interface PlaybookUi {
  teamId: number; side: 'offense' | 'defense' | 'special_teams';
  sections: readonly { key: string; count: number }[]; rows: readonly UiRow[]; total: number;
  families: readonly UiFamily[]; words: readonly UiWord[];
  size: { readinessCeiling: number; upkeep: number; capacity: number; warning: 'none' | 'amber' | 'red'; warnings: readonly string[]; sectionUpkeep: readonly { section: string; units: number; share: number }[] } | null;
  locks: Readonly<Record<'view' | 'draft_play' | 'edit_group_coaching_points' | 'edit_side_playbook' | 'build_plan_and_sheet' | 'approve' | 'draw_scout_cards', UiLock>>;
  filter: UiFilter;
  options: { formation: readonly UiOption[]; concept: readonly UiOption[]; personnel: readonly UiOption[] };
}

/** What the screen asks the host to do. The host turns each into an app-services playbook command; a
 * locked control sends the same intent and the command layer turns it into a suggestion (G3.4.3). */
export type PlaybookIntent =
  | { kind: 'retire'; playIds: string[] }
  | { kind: 'restore'; playIds: string[] }
  | { kind: 'export'; playIds: string[] }
  | { kind: 'duplicate'; playId: string }
  | { kind: 'set_role'; playId: string; role: string }
  | { kind: 'rename_word'; partId: string; word: string }
  /** O3.3.1 bulk actions that hand plays to the install board (G5) and this week's plan (G6). */
  | { kind: 'add_to_install'; playIds: string[] }
  | { kind: 'add_to_plan'; playIds: string[] }
  /** Save the current filter as a named set (O3.3.1 saved filter sets); the host keeps it per user. */
  | { kind: 'save_filter'; name: string; filter: UiFilter };

/** A saved filter set, kept by the host as a user preference (not world state). */
export interface SavedFilter { name: string; filter: UiFilter }

export const TABS = ['library', 'families', 'words', 'size'] as const;
export type Tab = (typeof TABS)[number];
export const ROLES = ['base', 'complement', 'constraint', 'situational', 'shot'] as const;
export const STATUSES = ['draft', 'valid', 'installed', 'retired'] as const;

/** Columns the table sorts on (O3.3.1: sort under 100 ms for 1,000 plays; the sort is a view option). */
export const SORT_KEYS = ['call', 'family', 'personnel', 'formation', 'concept', 'protection', 'section', 'role', 'status', 'readiness', 'called', 'result', 'length'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export interface UiSort { key: SortKey; dir: 'asc' | 'desc' }

const sortValue = (r: UiRow, k: SortKey): string | number => {
  switch (k) {
    case 'readiness': return r.readinessEstimate ?? -1;
    case 'called': return r.called;
    case 'result': return r.avgResult ?? -Infinity;
    case 'length': return r.lengthS;
    default: return r[k];
  }
};
/** Rows in the chosen order; ties keep the read model's order so the table is stable. */
export function sortRows(rows: readonly UiRow[], sort: UiSort | null): UiRow[] {
  const out = rows.map((r, i) => ({ r, i }));
  if (!sort) return out.map((x) => x.r);
  const sign = sort.dir === 'asc' ? 1 : -1;
  out.sort((a, b) => {
    const x = sortValue(a.r, sort.key), y = sortValue(b.r, sort.key);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : (String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0);
    return c !== 0 ? sign * c : a.i - b.i;
  });
  return out.map((x) => x.r);
}
export function sortFromView(view: Record<string, string>): UiSort | null {
  const key = (SORT_KEYS as readonly string[]).includes(view.sort ?? '') ? (view.sort as SortKey) : null;
  return key ? { key, dir: view.dir === 'desc' ? 'desc' : 'asc' } : null;
}

const FILTER_KEYS = ['text', 'formation', 'concept', 'personnel', 'role', 'situation', 'status'] as const;

/** The filter lives in the address (O1.1.3) as strings, so back and forward keep it. */
export function filterFromView(view: Record<string, string>): UiFilter {
  const f: UiFilter = {};
  for (const k of FILTER_KEYS) if (view[k]) f[k] = view[k];
  if (view.retired === '1') f.includeRetired = true;
  return f;
}
export function filterToView(base: Record<string, string>, f: UiFilter): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (!([...FILTER_KEYS, 'retired'] as string[]).includes(k)) out[k] = v;
  for (const k of FILTER_KEYS) if (f[k]) out[k] = f[k]!;
  if (f.includeRetired) out.retired = '1';
  return out;
}
