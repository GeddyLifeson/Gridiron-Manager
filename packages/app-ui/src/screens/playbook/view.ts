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
  | { kind: 'rename_word'; partId: string; word: string };

export const TABS = ['library', 'families', 'words', 'size'] as const;
export type Tab = (typeof TABS)[number];
export const ROLES = ['base', 'complement', 'constraint', 'situational', 'shot'] as const;

/** The filter lives in the address (O1.1.3) as strings, so back and forward keep it. */
export function filterFromView(view: Record<string, string>): UiFilter {
  const f: UiFilter = {};
  for (const k of ['text', 'formation', 'concept', 'personnel', 'role'] as const) if (view[k]) f[k] = view[k];
  if (view.retired === '1') f.includeRetired = true;
  return f;
}
export function filterToView(base: Record<string, string>, f: UiFilter): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (!['text', 'formation', 'concept', 'personnel', 'role', 'retired'].includes(k)) out[k] = v;
  for (const k of ['text', 'formation', 'concept', 'personnel', 'role'] as const) if (f[k]) out[k] = f[k]!;
  if (f.includeRetired) out.retired = '1';
  return out;
}
