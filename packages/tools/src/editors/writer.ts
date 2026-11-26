// Editors as content writers (P7.5.1). Every editor writes the same pack files as hand-made content:
// outside a career to the user content folder, inside a career as a command (P4.4.1 `EditPlay`). Each
// editor names the kinds it writes; `buildPack` turns its items into a pack that the G-08 loader reads
// with no hand editing (the P7.5.1 acceptance test runs every editor through it).
import { defaultRegistry, itemHash, CORE_PACK_ID, PACK_ID, VERSION, type PackSource, type Problem } from '../content/index.ts';
import { PLAYBOOK_KINDS } from './folder.ts';

export interface EditorDef {
  readonly id: string;
  readonly title: string;
  /** The leaf that owns the editor's decisions. */
  readonly leaf: string;
  /** Content kinds it writes (registry kinds of P4.1.1). */
  readonly kinds: readonly string[];
  /** The rule-set editor is non-certified (P7.5.1). */
  readonly certifiedAllowed: boolean;
}

/** The P7.5.1 editor list. Kinds follow the loader's registered folders (README decision E-06). */
export const EDITORS: readonly EditorDef[] = [
  { id: 'play-designer', title: 'Play designer', leaf: 'G1', kinds: ['playbooks', 'football/formations', 'football/motions', 'football/routes', 'football/concepts', 'football/protections', 'football/runs', 'football/personnel'], certifiedAllowed: true },
  { id: 'defense-designer', title: 'Defensive call designer', leaf: 'G2', kinds: ['football/fronts', 'football/coverages', 'football/pressures'], certifiedAllowed: true },
  { id: 'playbook-manager', title: 'Playbook manager', leaf: 'G3', kinds: ['playbooks'], certifiedAllowed: true },
  { id: 'terminology-editor', title: 'Terminology editor', leaf: 'G4', kinds: ['playbooks'], certifiedAllowed: true },
  { id: 'special-teams-designer', title: 'Special teams designer', leaf: 'G1', kinds: ['football/special-teams'], certifiedAllowed: true },
  { id: 'player-designer', title: 'Player designer', leaf: 'D13', kinds: ['people'], certifiedAllowed: true },
  { id: 'world-options', title: 'World options', leaf: 'U4', kinds: ['world'], certifiedAllowed: true },
  { id: 'rule-set-editor', title: 'Rule-set editor', leaf: 'P7.5.1', kinds: ['rules', 'league-rules'], certifiedAllowed: false },
  { id: 'people-pack-builder', title: 'People pack builder', leaf: 'P7.3.2', kinds: ['packs-people'], certifiedAllowed: true },
];

export function editorDef(id: string): EditorDef | undefined { return EDITORS.find((e) => e.id === id); }

export interface EditorItem { readonly kind: string; readonly item: Readonly<Record<string, unknown>> }

export interface BuildRequest {
  readonly editor: string;
  readonly pack: { readonly id: string; readonly name: string; readonly version: string; readonly author: string; readonly coreVersion?: string };
  readonly items: readonly EditorItem[];
  /** Building for a certified career (the rule-set editor is refused). */
  readonly certified?: boolean;
}

export interface BuiltPack {
  /** Path to file text, `/` separated, deterministic. Null when refused. */
  readonly files: Readonly<Record<string, string>> | null;
  readonly source: PackSource | null;
  readonly problems: readonly Problem[];
}

/** Keys that would carry a real person's identity into a generated person (P7.5.1, A6.3.3). */
const REAL_SOURCE_KEYS = ['sourceKey', 'source_key', 'realSourceKey', 'realPersonKey', 'externalId'];

/** Stable JSON: object keys sorted, two-space indent, newline at the end, so a save writes the same bytes. */
export function stableJson(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map((k) => [k, sort((x as Record<string, unknown>)[k])]));
    return x;
  };
  return `${JSON.stringify(sort(v), null, 2)}\n`;
}

const NOT_LOADED_KIND_FOLDERS: Readonly<Record<string, string>> = { 'packs-people': 'packs-people/' };

function folderFor(kind: string): string | null {
  if (NOT_LOADED_KIND_FOLDERS[kind]) return NOT_LOADED_KIND_FOLDERS[kind]!;
  const def = defaultRegistry().get(kind);
  return def && def.match.endsWith('/') ? def.match : null;
}

const enc = new TextEncoder();

/** Turns an editor's items into a pack (P7.5.1). Refusals are `editor.*` problems; nothing is written then. */
export function buildPack(req: BuildRequest): BuiltPack {
  const problems: Problem[] = [];
  const packId = req.pack.id;
  const prob = (code: string, file: string, path: string, message: string) => problems.push({ severity: 'error', code, packId, file, path, message });
  const ed = editorDef(req.editor);
  if (!ed) { prob('editor.unknown', '', '', `no editor ${req.editor}`); return { files: null, source: null, problems }; }
  if (req.certified && !ed.certifiedAllowed) prob('editor.not_certified', '', '', `${ed.title} is not available in a certified career (P7.5.1)`);
  if (!PACK_ID.test(packId) || packId === CORE_PACK_ID) prob('editor.pack_id', 'pack.json', '$.id', `pack id ${packId} must be lower case letters, digits and hyphens, and not "core"`);
  if (!VERSION.test(req.pack.version)) prob('editor.pack_version', 'pack.json', '$.version', 'version must look like 1.0.0');
  const files: Record<string, string> = {};
  const kinds = new Set<string>();
  for (const [i, { kind, item }] of req.items.entries()) {
    const at = `items[${i}]`;
    if (!ed.kinds.includes(kind)) { prob('editor.kind', '', at, `${ed.title} does not write ${kind}`); continue; }
    const folder = folderFor(kind);
    if (!folder) { prob('editor.kind', '', at, `no folder for kind ${kind}`); continue; }
    let data: Record<string, unknown> = { ...item };
    if (kind === 'people' || kind === 'packs-people') {
      const hit = REAL_SOURCE_KEYS.find((k) => k in data);
      if (hit && ed.id === 'player-designer') { prob('editor.real_source_key', '', `${at}.${hit}`, 'the player designer creates generated people only; it has no real-person source key (P7.5.1)'); continue; }
      if (ed.id === 'player-designer') data = { ...data, origin: 'generated' };
    }
    const id = typeof data.id === 'string' ? data.id : '';
    if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(id)) { prob('editor.item_id', '', `${at}.id`, `item id ${id || '(none)'} must be lower case letters, digits, _ . -`); continue; }
    const path = `${folder}${id}.json`;
    if (files[path]) { prob('editor.duplicate_item', path, `${at}.id`, `two items would be written to ${path}`); continue; }
    files[path] = stableJson(data);
    kinds.add(folder.split('/')[0]!);
  }
  if (problems.length) return { files: null, source: null, problems };
  const manifest = {
    id: packId, name: req.pack.name, version: req.pack.version, author: req.pack.author, contentSchemaVersion: 1,
    requires: req.pack.coreVersion ? [{ id: CORE_PACK_ID, version: req.pack.coreVersion }] : [],
    kinds: [...kinds].sort(),
  };
  files['pack.json'] = stableJson(manifest);
  const sorted = Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]!]));
  const source: PackSource = {
    origin: packId,
    files: Object.entries(sorted).map(([path, text]) => { const bytes = enc.encode(text); return { path, size: bytes.length, bytes }; }),
  };
  return { files: sorted, source, problems };
}

/** A content edit inside a career (P4.4.1): a command for the log, never a file write. */
export type CareerEdit =
  | { readonly ok: true; readonly command: { readonly type: 'EditPlay'; readonly payload: { readonly kind: string; readonly id: string; readonly itemHash: string; readonly item: unknown } } }
  | { readonly ok: false; readonly reason: string };

/**
 * P4.4.1: edits to the user's own playbook are `EditPlay` commands. Rule sets and other world-wide
 * content are blocked in a running career, except through the logged non-certified override
 * (ContentStore.stage with a reason, G-08).
 */
export function careerEdit(kind: string, item: Readonly<Record<string, unknown>>): CareerEdit {
  if (!PLAYBOOK_KINDS.has(kind)) return { ok: false, reason: `${kind} cannot be edited in a running career; only a logged, non-certified override can change it (P4.4.1)` };
  const id = typeof item.id === 'string' ? item.id : '';
  if (!id) return { ok: false, reason: 'the item has no id' };
  return { ok: true, command: { type: 'EditPlay', payload: { kind, id, itemHash: itemHash(item), item } } };
}
