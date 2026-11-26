// The parts of the player designer model (people designer `designerView`, served through app-services)
// this screen shows, and the intents it sends back. Declared here because app-ui imports only the
// app-services entry point, which re-exports the model once the integrator adds its line (CR-G92-2).
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const pdTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function pt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

/** Label for a sheet path: a text row when there is one, else the attribute or group id with spaces. */
export function fieldLabel(path: string): string {
  const id = `pd.field.${path}`;
  if (STRINGS[id] !== undefined) return STRINGS[id]!;
  const tail = path.includes('.') ? path.slice(path.indexOf('.') + 1) : path;
  return tail.replace(/_/g, ' ');
}

export function sectionLabel(id: string): string {
  const s = STRINGS[`pd.section.${id}`];
  return s ?? id.replace(/_/g, ' ');
}

export interface UiField {
  path: string;
  value: number | string | null;
  kind: 'number' | 'text' | 'side';
  locked: boolean;
  missing: boolean;
  warned: boolean;
  ceilingPath?: string;
  ceiling?: number | null;
}

export interface UiArchetype { id: string; labelId: string }

export interface PlayerDesignerUi {
  open: boolean;
  refusal: { rule: string; message: string } | null;
  hasSheet: boolean;
  entry: string | null;
  personId: number | null;
  position: string | null;
  positions: readonly string[];
  archetypes: readonly UiArchetype[];
  archetypeCatalog: Readonly<Record<string, readonly UiArchetype[]>>;
  archetypeId: string | null;
  realPerson: boolean;
  sandbox: boolean;
  marksWorldEdited: boolean;
  sections: readonly { id: string; fields: readonly UiField[] }[];
  derived: readonly { attribute: string; value: number }[];
  staffGrade: { text: string; sourceText: string } | null;
  warnings: readonly { fields: readonly string[]; kind: 'record' | 'z' | 'joint'; value: number; oneIn: number | null }[];
  missing: readonly string[];
  blockers: readonly string[];
  canCommit: boolean;
  result: { ok: true; personId: number } | { ok: false; rule: string; message: string; problems: readonly string[] } | null;
}

/** What the screen asks the host to do. The host resolves `start_copy` to the person's record. */
export type DesignerUiIntent =
  | { kind: 'start_archetype'; position: string; archetypeId: string; ageYears?: number }
  | { kind: 'start_measurables'; position: string; ageYears: number; heightIn: number; weightLb: number; fortyS: number; fill: 'generate' | 'hand' }
  | { kind: 'start_blank' }
  | { kind: 'start_copy'; personId: number; inPlace: boolean }
  | { kind: 'apply_archetype'; archetypeId: string }
  | { kind: 'set_field'; path: string; value: number | string | null }
  | { kind: 'set_sandbox'; on: boolean }
  | { kind: 'commit' };

/** One warning as a sentence, in the D13.1.2 form ("40 time 4.30 at 330 lb: ..."). */
export function warningText(w: PlayerDesignerUi['warnings'][number], position: string | null): string {
  const field = w.fields.map(fieldLabel).join(' and ');
  const n = w.oneIn === null ? '' : w.oneIn >= 1e12 ? 'a trillion' : w.oneIn.toLocaleString('en-US');
  if (w.kind === 'record') return pt('pd.warn.record', { field, value: w.value });
  if (w.kind === 'joint') return pt('pd.warn.joint', { field, n, position: position ?? '' });
  return pt('pd.warn.z', { field, value: w.value, n, position: position ?? '' });
}
