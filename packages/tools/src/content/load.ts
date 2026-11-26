// The pack loader (P4.1.1, P4.2, P4.3.1). Pure over in-memory files: platform adapters (node-fs.ts for
// folders and zips, a browser import later) hand over PackSource values. Deterministic: packs load in
// manifest dependency order then pack id order, files in path order, so the same packs read in any
// scan order give the same content hash (P4.1.1 acceptance).
import { readModelSchemas, type RuleSet, type ValidationFinding } from '@gm/schema';
import { CORE_PACK_ID, PackManifestShape, compareVersions, type PackManifest as Manifest } from './manifest.ts';
import { ITEM_ID, NOT_LOADED_FOLDERS, defaultRegistry, parseShape, type KindDef, type KindRegistry } from './kinds.ts';
import { registerUiKinds, uiChecks } from './ui.ts';
import { itemHash, packHash, setHash } from './hash.ts';
import { DEFAULT_LIMITS, type Limits } from './params.ts';
import type { ContentItem, ContentSet, FootballCheck, ItemStatus, ManifestEntry, PackSource, Problem, Ref } from './types.ts';

export interface LoadOptions {
  readonly registry?: KindRegistry;
  readonly limits?: Limits;
  /** Certified careers may not override core items (P4.1.1). */
  readonly certified?: boolean;
  /** Active rule sets for football validation (P4.2.2). */
  readonly ruleSets?: readonly RuleSet[];
  readonly football?: readonly FootballCheck[];
  /** Read-model keys the ui checks accept. Default: the schema registry. */
  readonly readModelKeys?: readonly string[];
  /** Findings by `${itemHash}|${ruleSetId}|${kind}`; a reload passes the old cache so unchanged items are not re-checked. */
  readonly footballCache?: Map<string, readonly ValidationFinding[]>;
  /** Items of the previous set; unchanged ones (same key and hash) are reused, not copied (P4.4.1). */
  readonly reuse?: ReadonlyMap<string, ContentItem>;
  readonly version?: number;
  readonly certifiedEligible?: boolean;
}

export interface IgnoredFile { readonly packId: string; readonly file: string; readonly reason: string }

export interface LoadResult {
  /** Null when any error was found: an invalid load keeps nothing (P4.4.1 keeps the old set). */
  readonly set: ContentSet | null;
  readonly problems: readonly Problem[];
  readonly ignored: readonly IgnoredFile[];
  /** Pack ids in load order. */
  readonly order: readonly string[];
}

interface ReadPack { readonly source: PackSource; readonly manifest: Manifest; readonly files: Map<string, { size: number; bytes?: Uint8Array }> }

const decoder = new TextDecoder('utf-8', { fatal: true });

export function normalisePath(p: string): { path: string; escape: boolean } {
  const s = p.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  const escape = s.startsWith('/') || /^[a-zA-Z]:/.test(s) || s.split('/').some((seg) => seg === '..');
  return { path: s, escape };
}

function walkStrings(v: unknown, path: string, visit: (key: string, s: string, path: string) => void, key = ''): void {
  if (typeof v === 'string') { visit(key, v, path); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => walkStrings(x, `${path}[${i}]`, visit, key)); return; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walkStrings(x, `${path}.${k}`, visit, k);
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) deepFreeze(x); }
  return v;
}

/** Orders packs: core first, then dependencies before dependants, ties by pack id (P4.1.1). */
function orderPacks(packs: ReadPack[], problems: Problem[]): ReadPack[] {
  const byId = new Map(packs.map((p) => [p.manifest.id, p]));
  for (const p of packs) for (const r of p.manifest.requires) {
    const dep = byId.get(r.id);
    if (!dep) problems.push({ severity: 'error', code: 'pack.missing_requirement', packId: p.manifest.id, file: 'pack.json', path: '$.requires', message: `requires pack ${r.id} ${r.version}, which is not loaded` });
    else if (compareVersions(dep.manifest.version, r.version) < 0) problems.push({ severity: 'error', code: 'pack.requirement_version', packId: p.manifest.id, file: 'pack.json', path: '$.requires', message: `requires ${r.id} ${r.version} or later; ${dep.manifest.version} is loaded` });
  }
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const p of packs) { indeg.set(p.manifest.id, 0); out.set(p.manifest.id, []); }
  for (const p of packs) {
    const deps = new Set(p.manifest.requires.map((r) => r.id).filter((id) => byId.has(id)));
    if (p.manifest.id !== CORE_PACK_ID && byId.has(CORE_PACK_ID)) deps.add(CORE_PACK_ID);
    for (const d of deps) { out.get(d)!.push(p.manifest.id); indeg.set(p.manifest.id, indeg.get(p.manifest.id)! + 1); }
  }
  const ready = [...indeg].filter(([, n]) => n === 0).map(([id]) => id).sort();
  const order: ReadPack[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(byId.get(id)!);
    for (const n of out.get(id)!) {
      indeg.set(n, indeg.get(n)! - 1);
      if (indeg.get(n) === 0) { ready.push(n); ready.sort(); }
    }
  }
  if (order.length < packs.length) {
    const stuck = packs.filter((p) => !order.includes(p)).map((p) => p.manifest.id).sort();
    problems.push({ severity: 'error', code: 'pack.dependency_cycle', packId: stuck[0]!, file: 'pack.json', path: '$.requires', message: `dependency cycle among ${stuck.join(', ')}` });
    order.push(...packs.filter((p) => !order.includes(p)).sort((a, b) => (a.manifest.id < b.manifest.id ? -1 : 1)));
  }
  return order;
}

function readManifest(src: PackSource, limits: Limits, problems: Problem[]): ReadPack | null {
  const label = src.origin;
  for (const rp of src.readProblems ?? []) problems.push({ ...rp, packId: label });
  const files = new Map<string, { size: number; bytes?: Uint8Array }>();
  let total = 0;
  for (const f of src.files) {
    const { path, escape } = normalisePath(f.path);
    if (escape) { problems.push({ severity: 'error', code: 'file.path_escape', packId: label, file: f.path, path: '', message: 'path leaves the pack folder (P7.2.1)' }); continue; }
    if (path.split('/').length - 1 > limits.maxFolderDepth) problems.push({ severity: 'error', code: 'file.depth', packId: label, file: path, path: '', message: `folder depth over ${limits.maxFolderDepth} (P7.2.1)` });
    total += f.size;
    files.set(path, f.bytes ? { size: f.size, bytes: f.bytes } : { size: f.size });
  }
  if (total > limits.maxPackBytes) problems.push({ severity: 'error', code: 'pack.too_large', packId: label, file: '', path: '', message: `pack is ${total} bytes unpacked; the limit is ${limits.maxPackBytes} (P7.2.1)` });
  const mf = files.get('pack.json');
  if (!mf?.bytes) { problems.push({ severity: 'error', code: 'manifest.missing', packId: label, file: 'pack.json', path: '', message: 'no pack.json manifest at the pack root (P4.1.1)' }); return null; }
  let data: unknown;
  try { data = JSON.parse(decoder.decode(mf.bytes).replace(/^﻿/, '')); } catch (e) {
    problems.push({ severity: 'error', code: 'manifest.json', packId: label, file: 'pack.json', path: '', message: `pack.json is not valid JSON: ${(e as Error).message}` });
    return null;
  }
  const id = typeof (data as { id?: unknown })?.id === 'string' ? (data as { id: string }).id : label;
  const { value, problems: mp } = parseShape<Manifest>(PackManifestShape, data, { unknownFields: id === CORE_PACK_ID ? 'error' : 'warning', filePath: 'pack.json' });
  for (const p of mp) problems.push({ severity: p.severity, code: p.code === 'schema.unknown_field' ? p.code : `manifest.${p.code.replace(/^schema\./, '')}`, packId: id, file: 'pack.json', path: p.path, message: p.message });
  if (!value) return null;
  return { source: src, manifest: value, files };
}

interface Pending {
  item: Omit<ContentItem, 'status' | 'legalUnder'>;
  def: KindDef;
  draft: boolean;
  refs: Ref[];
}

export function loadPacks(sources: readonly PackSource[], opts: LoadOptions = {}): LoadResult {
  const registry = opts.registry ?? registerUiKinds(defaultRegistry());
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const problems: Problem[] = [];
  const ignored: IgnoredFile[] = [];

  const read = sources.map((s) => readManifest(s, limits, problems)).filter((p): p is ReadPack => p !== null);
  const seenIds = new Map<string, string>();
  const unique: ReadPack[] = [];
  for (const p of read) {
    const other = seenIds.get(p.manifest.id);
    if (other !== undefined) { problems.push({ severity: 'error', code: 'pack.duplicate_id', packId: p.manifest.id, file: 'pack.json', path: '$.id', message: `two packs have id ${p.manifest.id}: ${other} and ${p.source.origin}` }); continue; }
    seenIds.set(p.manifest.id, p.source.origin);
    unique.push(p);
  }
  const order = orderPacks(unique, problems);

  const items = new Map<string, Pending>();
  const byPack = new Map<string, { key: string; hash: string }[]>();
  for (const pack of order) {
    const packId = pack.manifest.id;
    const isCore = packId === CORE_PACK_ID;
    const contributed: { key: string; hash: string }[] = [];
    byPack.set(packId, contributed);
    const overrides = new Set(pack.manifest.overrides ?? []);
    const inPack = new Map<string, string>();
    for (const path of [...pack.files.keys()].sort()) {
      if (path === 'pack.json') continue;
      const f = pack.files.get(path)!;
      const prob = (severity: Problem['severity'], code: string, jsonPath: string, message: string) => problems.push({ severity, code, packId, file: path, path: jsonPath, message });
      if (!path.endsWith('.json')) { ignored.push({ packId, file: path, reason: 'not a .json file; ignored (P7.2.1)' }); prob('info', 'file.ignored_type', '', 'not a .json file; ignored'); continue; }
      const notLoaded = Object.entries(NOT_LOADED_FOLDERS).find(([folder]) => path.startsWith(folder));
      if (notLoaded) { ignored.push({ packId, file: path, reason: notLoaded[1] }); continue; }
      if (!path.includes('/')) { ignored.push({ packId, file: path, reason: 'file at the pack root other than pack.json; ignored' }); prob('info', 'file.ignored_root', '', 'only pack.json belongs at the pack root'); continue; }
      const def = registry.forPath(path);
      if (!def) { prob(isCore ? 'error' : 'warning', 'file.unknown_kind', '', `no content kind for ${path} (P4.1.1 folders)`); if (!isCore) ignored.push({ packId, file: path, reason: 'unknown kind' }); continue; }
      if (f.size > limits.maxFileBytes || !f.bytes) { prob('error', 'file.too_large', '', `file is ${f.size} bytes; the limit is ${limits.maxFileBytes} (P7.2.1)`); continue; }
      let text: string;
      try { text = decoder.decode(f.bytes).replace(/^﻿/, ''); } catch { prob('error', 'file.encoding', '', 'file is not UTF-8 (P4.1.1)'); continue; }
      let data: unknown;
      try { data = JSON.parse(text); } catch (e) { prob('error', 'file.json', '', `not valid JSON: ${(e as Error).message}`); continue; }

      walkStrings(data, '$', (key, s, jp) => {
        const max = key === 'name' ? limits.maxNameChars : limits.maxNoteChars;
        if (s.length > max) prob('error', 'file.string_length', jp, `${s.length} characters; the limit for ${key === 'name' ? 'names' : 'text'} is ${max} (P7.2.1)`);
      });

      // Content schema version: the file's own field when it is an object that has one, else the manifest's.
      const own = data && typeof data === 'object' && !Array.isArray(data) ? (data as { contentSchemaVersion?: unknown }).contentSchemaVersion : undefined;
      const fileVersion = typeof own === 'number' ? own : pack.manifest.contentSchemaVersion;
      if (fileVersion > def.version) { prob('error', 'schema.version_newer', '$.contentSchemaVersion', `content schema version ${fileVersion} is newer than this game reads (${def.version})`); continue; }
      let migrated = data;
      let v = fileVersion;
      let migrationFailed = false;
      while (v < def.version) {
        const step = def.migrations?.find((m) => m.from === v);
        if (!step) { prob('error', 'schema.no_migration', '$.contentSchemaVersion', `no migration for ${def.kind} from version ${v}`); migrationFailed = true; break; }
        migrated = step.up(migrated);
        v++;
      }
      if (migrationFailed) continue;
      if (v !== fileVersion && typeof own === 'number' && migrated && typeof migrated === 'object') migrated = { ...(migrated as object), contentSchemaVersion: v };

      const parsed = def.parse(migrated, { unknownFields: isCore ? 'error' : 'warning', filePath: path });
      for (const p of parsed.problems) prob(p.severity, p.code, p.path, p.message);
      if (parsed.problems.some((p) => p.severity === 'error')) continue;

      for (const pi of parsed.items) {
        const key = `${def.kind}/${pi.id}`;
        if (!ITEM_ID.test(pi.id) && def.kind !== 'text') { prob('error', 'item.id_format', '$.id', `id ${pi.id} must be lower case letters, digits, _ . -`); continue; }
        if (pi.draft && isCore) prob('error', 'item.core_draft', '$.draft', 'shipped content may not be a draft');
        const prevInPack = inPack.get(key);
        if (prevInPack !== undefined) { prob('error', 'item.duplicate_id', '$.id', `${key} is defined twice in pack ${packId}: ${prevInPack} and ${path}`); continue; }
        inPack.set(key, path);
        const prev = items.get(key);
        if (prev) {
          if (!overrides.has(key)) { prob('error', 'item.duplicate_id', '$.id', `${key} is defined by pack ${prev.item.packId} (${prev.item.file}) and pack ${packId} (${path}) with no declared override`); continue; }
          if (opts.certified && prev.item.packId === CORE_PACK_ID) { prob('error', 'item.override_certified', '$.id', `${key} overrides a core item; certified careers do not allow that (P4.1.1)`); continue; }
          prob('info', 'item.override', '$.id', `${key} from pack ${packId} replaces the one from pack ${prev.item.packId}`);
        }
        const data2 = deepFreeze(def.normalize ? def.normalize(pi.data) : pi.data);
        const hash = itemHash(data2);
        contributed.push({ key, hash });
        items.set(key, { item: { key, kind: def.kind, id: pi.id, packId, file: path, data: data2, hash, levelTags: pi.levelTags }, def, draft: pi.draft, refs: def.refs?.(data2) ?? [] });
      }
    }
    for (const key of overrides) if (!inPack.has(key)) problems.push({ severity: 'warning', code: 'pack.override_unused', packId, file: 'pack.json', path: '$.overrides', message: `declares an override of ${key} but defines no such item` });
  }

  // References (P4.2.2): every referenced id exists with a compatible kind and level tag.
  const status = new Map<string, ItemStatus>();
  for (const [key, p] of items) {
    for (const r of p.refs) {
      const target = items.get(`${r.kind}/${r.id}`);
      const where = { packId: p.item.packId, file: p.item.file, path: r.path };
      if (!target) {
        const sameId = [...items.values()].find((x) => x.item.id === r.id);
        const msg = sameId ? `refers to ${r.kind} ${r.id}, but ${r.id} is a ${sameId.item.kind}` : `refers to ${r.kind} ${r.id}, which does not exist`;
        if (p.draft) { status.set(key, 'draft'); problems.push({ ...where, severity: 'warning', code: 'ref.missing', message: `${msg} (draft)` }); }
        else problems.push({ ...where, severity: 'error', code: sameId ? 'ref.kind' : 'ref.missing', message: msg });
        continue;
      }
      const tt = target.item.levelTags, st = p.item.levelTags;
      if (!tt.includes('both')) {
        const missing = st.includes('both') ? tt : tt.filter((t) => !st.includes(t));
        if (missing.length) problems.push({ ...where, severity: 'warning', code: 'ref.level_tag', message: `${r.kind} ${r.id} needs ${missing.join(', ')}; this item does not require it, so it is usable only where that rule allows` });
      }
    }
  }

  // Football validation (P4.2.2): errors block, legality findings flag ("illegal as drawn"), others warn.
  const legal = new Map<string, string[]>();
  const ruleSets = opts.ruleSets ?? [];
  const lookup = (kind: string, id: string): ContentItem | undefined => {
    const p = items.get(`${kind}/${id}`);
    return p ? { ...p.item, status: 'ok', legalUnder: null } : undefined;
  };
  for (const check of opts.football ?? []) {
    for (const [key, p] of items) {
      if (p.item.kind !== check.kind || status.get(key) === 'draft') continue;
      const isCore = p.item.packId === CORE_PACK_ID;
      const under: string[] = [];
      for (const rs of ruleSets) {
        const ck = `${p.item.hash}|${rs.id}|${check.kind}`;
        let findings = opts.footballCache?.get(ck);
        if (!findings) { findings = check.check({ ...p.item, status: 'ok', legalUnder: null }, rs, lookup); opts.footballCache?.set(ck, findings); }
        let illegal = false;
        for (const f of findings) {
          const base = { packId: p.item.packId, file: p.item.file, path: f.role ? `role ${f.role}` : '$', ruleSetId: rs.id, ...(f.ruleKey ? { ruleKey: f.ruleKey } : {}) };
          if (f.severity === 'error') {
            if (p.draft) { status.set(key, 'draft'); problems.push({ ...base, severity: 'warning', code: f.code, message: `${f.messageKey} (draft: the engine cannot run it yet)` }); }
            else problems.push({ ...base, severity: 'error', code: f.code, message: f.messageKey });
          } else if (f.ruleKey) {
            illegal = true;
            problems.push({ ...base, severity: 'flag', code: f.code, message: `illegal as drawn under ${rs.id}: ${f.messageKey}` });
          } else problems.push({ ...base, severity: 'warning', code: f.code, message: f.messageKey });
        }
        if (!illegal) under.push(rs.id);
      }
      legal.set(key, under);
      if (ruleSets.length && !under.length && status.get(key) !== 'draft') {
        if (isCore) problems.push({ severity: 'error', code: 'football.shipped_illegal', packId: p.item.packId, file: p.item.file, path: '$', message: `${key} is legal under none of ${ruleSets.map((r) => r.id).join(', ')}; shipped content must be legal under at least one (P4.2.2)` });
        else status.set(key, 'illegal');
      }
    }
  }

  const manifest: ManifestEntry[] = order.map((p) => ({ packId: p.manifest.id, version: p.manifest.version, hash: packHash(p.manifest.id, p.manifest.version, byPack.get(p.manifest.id) ?? []) }));
  const finalItems = new Map<string, ContentItem>();
  for (const key of [...items.keys()].sort()) {
    const p = items.get(key)!;
    const next: ContentItem = { ...p.item, status: status.get(key) ?? 'ok', legalUnder: legal.get(key) ?? null };
    const old = opts.reuse?.get(key);
    const same = old && old.hash === next.hash && old.packId === next.packId && old.file === next.file && old.status === next.status
      && JSON.stringify(old.legalUnder) === JSON.stringify(next.legalUnder) && JSON.stringify(old.levelTags) === JSON.stringify(next.levelTags);
    finalItems.set(key, same ? old : Object.freeze(next));
  }

  const set: ContentSet = { version: opts.version ?? 1, hash: setHash(manifest), manifest, items: finalItems, certifiedEligible: opts.certifiedEligible ?? true };
  problems.push(...uiChecks(set, opts.readModelKeys ?? Object.keys(readModelSchemas())));

  const failed = problems.some((p) => p.severity === 'error');
  return { set: failed ? null : set, problems, ignored, order: order.map((p) => p.manifest.id) };
}

/** Convenience reads over a set. */
export function getItem(set: ContentSet, kind: string, id: string): ContentItem | undefined { return set.items.get(`${kind}/${id}`); }
export function itemsOfKind(set: ContentSet, kind: string): ContentItem[] { return [...set.items.values()].filter((i) => i.kind === kind); }
