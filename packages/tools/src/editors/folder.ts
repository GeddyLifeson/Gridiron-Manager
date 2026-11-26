// The user content folder (P7.1.1): every pack found is safety-scanned (P7.2.1), validated against the
// shipped packs (P4.2), and listed with its kinds, version, author, signature state and problems for
// Settings, Mods. A pack with errors is listed and cannot be selected; its errors export as text for
// its author. Packs are chosen per career at creation and copied into the save (P5.1.2).
import { loadPacks, type LoadOptions, type PackSource, type Problem } from '../content/index.ts';
import { safetyScan, type Neutralised, type SafetyOptions } from './safety.ts';

/** P7.4.1 signatures are checked by G-95; until then a present signature is shown as not yet checked. */
export type SignatureState = 'unsigned' | 'signature_not_checked';

export interface ModEntry {
  /** Folder or file name the pack came from. */
  readonly origin: string;
  readonly packId: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly kinds: readonly string[];
  readonly signature: SignatureState;
  /** True when the pack has no errors of its own and loads together with the shipped packs. */
  readonly selectable: boolean;
  readonly problems: readonly Problem[];
  /** Files the pack carries that the game does not load (other types, images), with why. */
  readonly ignored: readonly { readonly file: string; readonly reason: string }[];
  readonly neutralised: readonly Neutralised[];
  /** Content hash of the pack (P4.3.1) when it loaded. */
  readonly hash: string | null;
  /** Item kinds it defines, from the loaded set, for the add-to-career rule. */
  readonly itemKinds: readonly string[];
}

export interface AssessOptions extends SafetyOptions {
  /** The shipped packs (core and any official packs) every user pack is checked against. */
  readonly base?: readonly PackSource[];
  readonly load?: Omit<LoadOptions, 'reuse' | 'version'>;
}

const dec = new TextDecoder();
function manifestOf(src: PackSource): Record<string, unknown> {
  const f = src.files.find((x) => x.path.replace(/\\/g, '/').replace(/^\.\//, '') === 'pack.json');
  if (!f?.bytes) return {};
  try { const v: unknown = JSON.parse(dec.decode(f.bytes).replace(/^﻿/, '')); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}; } catch { return {}; }
}
const s = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

/** Checks one pack: safety first; a pack that fails safety is never handed to the loader. */
export function assessPack(src: PackSource, opts: AssessOptions = {}): ModEntry {
  const m = manifestOf(src);
  const safety = safetyScan(src, opts);
  const packId = safety.packId;
  const head = {
    origin: src.origin, packId, name: s(m.name, src.origin), version: s(m.version, '?'), author: s(m.author, '?'),
    kinds: Array.isArray(m.kinds) ? m.kinds.filter((k): k is string => typeof k === 'string') : [],
    signature: (typeof m.signature === 'string' && m.signature ? 'signature_not_checked' : 'unsigned') as SignatureState,
    neutralised: safety.neutralised,
  };
  const safetyErrors = safety.problems.some((p) => p.severity === 'error');
  if (safetyErrors) return { ...head, selectable: false, problems: safety.problems, ignored: [], hash: null, itemKinds: [] };
  const base = opts.base ?? [];
  const r = loadPacks([...base, src], opts.load ?? {});
  const baseIds = new Set(base.map((b) => s(manifestOf(b).id, b.origin)));
  const mine = (p: { packId: string }) => p.packId === packId || p.packId === src.origin;
  // A problem that names this pack, or a pack-level error the base packs alone would not have.
  const own = r.problems.filter((p) => mine(p) || !baseIds.has(p.packId));
  const problems = [...safety.problems, ...own];
  const set = r.set;
  const entry = set?.manifest.find((e) => e.packId === packId);
  const itemKinds = set ? [...new Set([...set.items.values()].filter((i) => i.packId === packId).map((i) => i.kind))].sort() : [];
  return {
    ...head,
    selectable: !problems.some((p) => p.severity === 'error') && set !== null,
    problems,
    ignored: r.ignored.filter(mine).map((i) => ({ file: i.file, reason: i.reason })),
    hash: entry?.hash ?? null,
    itemKinds,
  };
}

export interface ModsList {
  readonly entries: readonly ModEntry[];
}

/** Scans every pack found (P7.1.1 "scanned at launch and on request"). Two user packs with one id are both refused. */
export function assessUserContent(sources: readonly PackSource[], opts: AssessOptions = {}): ModsList {
  const entries = sources.map((src) => assessPack(src, opts));
  const count = new Map<string, number>();
  for (const e of entries) count.set(e.packId, (count.get(e.packId) ?? 0) + 1);
  const out = entries.map((e) => {
    if ((count.get(e.packId) ?? 0) < 2) return e;
    const others = entries.filter((x) => x.packId === e.packId && x !== e).map((x) => x.origin).join(', ');
    const p: Problem = { severity: 'error', code: 'pack.duplicate_id', packId: e.packId, file: 'pack.json', path: '$.id', message: `another pack in the user content folder has id ${e.packId}: ${others}` };
    return { ...e, selectable: false, problems: [...e.problems, p] };
  });
  return { entries: out.sort((a, b) => (a.packId < b.packId ? -1 : a.packId > b.packId ? 1 : a.origin < b.origin ? -1 : 1)) };
}

/** The error list as plain text, for the pack's author (P7.1.1 edge case). */
export function errorReportText(e: ModEntry): string {
  const lines = [`Pack ${e.packId} ${e.version} by ${e.author} (${e.origin})`, e.selectable ? 'Status: can be selected' : 'Status: cannot be selected', ''];
  const order: Problem['severity'][] = ['error', 'flag', 'warning', 'info'];
  for (const sev of order) {
    for (const p of e.problems.filter((x) => x.severity === sev)) lines.push(`${sev.toUpperCase()} ${p.code} ${p.file}${p.path ? ` ${p.path}` : ''}: ${p.message}`);
  }
  for (const i of e.ignored) lines.push(`IGNORED ${i.file}: ${i.reason}`);
  return `${lines.join('\n')}\n`;
}

export interface Selection {
  /** Packs to copy into the new save (P5.1.2), in the order given. Empty when refused. */
  readonly packs: readonly PackSource[];
  readonly refused: readonly { readonly packId: string; readonly reason: string }[];
  readonly problems: readonly Problem[];
  readonly contentHash: string | null;
}

/** Career creation: the chosen packs must each be selectable and must load together with the base. */
export function selectPacks(list: ModsList, sources: readonly PackSource[], chosen: readonly string[], opts: AssessOptions = {}): Selection {
  const refused: { packId: string; reason: string }[] = [];
  const picked: PackSource[] = [];
  for (const id of chosen) {
    const e = list.entries.find((x) => x.packId === id);
    if (!e) { refused.push({ packId: id, reason: 'not in the user content folder' }); continue; }
    if (!e.selectable) { refused.push({ packId: id, reason: 'has errors; see its report' }); continue; }
    const src = sources.find((x) => x.origin === e.origin);
    if (src) picked.push(src);
  }
  if (refused.length) return { packs: [], refused, problems: [], contentHash: null };
  const r = loadPacks([...(opts.base ?? []), ...picked], opts.load ?? {});
  if (!r.set) {
    const errs = r.problems.filter((p) => p.severity === 'error');
    return { packs: [], refused: [...new Set(errs.map((p) => p.packId))].map((packId) => ({ packId, reason: 'conflicts with another chosen pack' })), problems: errs, contentHash: null };
  }
  return { packs: picked, refused: [], problems: r.problems, contentHash: r.set.hash };
}

/** Kinds that count as playbook content (G1 to G4): plays, play parts and terminology, not rules. */
export const PLAYBOOK_KINDS: ReadonlySet<string> = new Set([
  'playbooks', 'football/personnel', 'football/formations', 'football/motions', 'football/routes', 'football/concepts',
  'football/protections', 'football/runs', 'football/fronts', 'football/coverages', 'football/pressures', 'football/special-teams',
]);

export interface CareerState {
  readonly certified: boolean;
  readonly atSeasonBoundary: boolean;
  /** The author name the user's editors write into packs (decision E-05). */
  readonly userAuthor: string;
}

/**
 * P7.1.1: adding a pack to a running career is allowed only for the user's own playbook content, and
 * for other kinds only at a season boundary in a non-certified career.
 */
export function canAddToCareer(e: ModEntry, career: CareerState): { allowed: boolean; reason: string } {
  if (!e.selectable) return { allowed: false, reason: 'the pack has errors' };
  const playbookOnly = e.itemKinds.length > 0 && e.itemKinds.every((k) => PLAYBOOK_KINDS.has(k));
  if (playbookOnly && e.author === career.userAuthor) return { allowed: true, reason: 'your own playbook content can be added at any time' };
  if (career.certified) return { allowed: false, reason: 'a certified career takes only your own playbook content after creation' };
  if (!career.atSeasonBoundary) return { allowed: false, reason: 'other content can be added only at a season boundary' };
  return { allowed: true, reason: 'season boundary in a non-certified career' };
}
