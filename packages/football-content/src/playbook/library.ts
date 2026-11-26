// G3.1 library structure: the playbook object, sections, shared parts, status, families and the
// concept-by-formation grid. Pure functions over immutable maps; every edit returns a new book.
import { param, LEARNING_PROFILES } from './params.ts';
import type { Book, LanguageFamily, Part, PlayEntry, Playbook, PlayStatus, Validator } from './types.ts';

export function emptyBook(teamId: string): Playbook {
  return { teamId, parts: new Map(), plays: new Map() };
}

export function withParts(book: Playbook, parts: readonly Part[]): Playbook {
  const next = new Map(book.parts);
  for (const p of parts) {
    if (next.has(p.id)) throw new Error(`part ${p.id} already exists`);
    next.set(p.id, p);
  }
  return { ...book, parts: next };
}

/** Parts a play uses, slot parts first then tags. */
export function partIdsOf(play: PlayEntry): string[] {
  const ids: string[] = [];
  for (const v of Object.values(play.parts)) if (v !== undefined) ids.push(v);
  for (const t of play.tags) ids.push(t);
  return ids;
}

export function addPlay(book: Playbook, play: PlayEntry): Playbook {
  if (book.plays.has(play.id)) throw new Error(`play ${play.id} already exists`);
  for (const id of partIdsOf(play)) if (!book.parts.has(id)) throw new Error(`play ${play.id} uses unknown part ${id}`);
  if (play.section.length === 0) throw new Error(`play ${play.id} has no home section`);
  const plays = new Map(book.plays);
  plays.set(play.id, play);
  return { ...book, plays };
}

export function replacePlay(book: Playbook, play: PlayEntry): Playbook {
  if (!book.plays.has(play.id)) throw new Error(`play ${play.id} not in the book`);
  const plays = new Map(book.plays);
  plays.set(play.id, play);
  return { ...book, plays };
}

const NEXT: Record<PlayStatus, readonly PlayStatus[]> = {
  draft: ['valid', 'retired'],
  valid: ['draft', 'installed', 'retired'],
  installed: ['valid', 'retired'],
  retired: ['draft'],
};

/** Status change per G1.1.1. Retired plays keep history and knowledge; restoring returns them to draft for re-validation. */
export function setStatus(book: Playbook, playId: string, status: PlayStatus, validate?: Validator): Playbook {
  const play = book.plays.get(playId);
  if (!play) throw new Error(`play ${playId} not in the book`);
  if (!NEXT[play.status].includes(status)) throw new Error(`play ${playId}: ${play.status} cannot become ${status}`);
  if ((status === 'valid' || status === 'installed') && validate) {
    const r = validate(play, book);
    if (!r.ok) throw new Error(`play ${playId} fails validation: ${r.failures.join('; ')}`);
  }
  return replacePlay(book, { ...play, status });
}

/** Plays that use a part, in id order: the confirmation list before a shared edit (G3.1.1). */
export function dependentsOf(book: Playbook, partId: string): string[] {
  const out: string[] = [];
  for (const p of book.plays.values()) if (partIdsOf(p).includes(partId)) out.push(p.id);
  return out.sort();
}

export interface PartEditResult {
  readonly book: Playbook;
  readonly dependents: readonly string[];
  /** Plays that no longer pass validation after the edit; they drop to draft. */
  readonly failed: readonly { readonly playId: string; readonly failures: readonly string[] }[];
}

/**
 * Edit a shared part (G3.1.1): every dependent play changes, and each is re-validated. Plays that fail
 * drop to draft (illegal plays are flagged, never silently kept as valid).
 */
export function editPart(book: Playbook, part: Part, validate: Validator): PartEditResult {
  const old = book.parts.get(part.id);
  if (!old) throw new Error(`part ${part.id} not in the book`);
  if (old.type !== part.type) throw new Error(`part ${part.id}: type cannot change (${old.type} to ${part.type})`);
  const parts = new Map(book.parts);
  parts.set(part.id, part);
  let next: Playbook = { ...book, parts };
  const dependents = dependentsOf(next, part.id);
  const failed: { playId: string; failures: readonly string[] }[] = [];
  for (const id of dependents) {
    const play = next.plays.get(id)!;
    if (play.status === 'retired') continue;
    const r = validate(play, next);
    if (!r.ok) {
      failed.push({ playId: id, failures: r.failures });
      next = replacePlay(next, { ...play, status: 'draft' });
    }
  }
  return { book: next, dependents, failed };
}

/** Delete a part. Blocked while any play uses it (G3.1.1 edge case): replace it or retire the plays first. */
export function deletePart(book: Playbook, partId: string): Playbook {
  if (!book.parts.has(partId)) throw new Error(`part ${partId} not in the book`);
  const users = dependentsOf(book, partId);
  if (users.length) throw new Error(`part ${partId} is used by ${users.length} play(s): ${users.join(', ')}`);
  const parts = new Map(book.parts);
  parts.delete(partId);
  return { ...book, parts };
}

/** Plays of one book side in a section path prefix; retired hidden unless asked (G3.5.1 edge case). */
export function playsIn(book: Playbook, side: Book, sectionPrefix: readonly string[] = [], includeRetired = false): PlayEntry[] {
  const out: PlayEntry[] = [];
  for (const p of book.plays.values()) {
    if (p.book !== side) continue;
    if (!includeRetired && p.status === 'retired') continue;
    if (sectionPrefix.every((s, i) => p.section[i] === s)) out.push(p);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------- families (G3.1.2)

/**
 * Family key: the part that carries the teaching. Runs: the run scheme. Passes: concept plus protection.
 * Defensive calls: the coverage. Kicking: the scheme. A play with none of them is a family of one.
 */
export function familyKey(play: PlayEntry): string {
  const p = play.parts;
  if (play.book === 'defense') return p.coverage ? `coverage:${p.coverage}` : `play:${play.id}`;
  if (play.book === 'special_teams') return p.scheme ? `scheme:${p.scheme}` : `play:${play.id}`;
  if (p.run) return `run:${p.run}`;
  if (p.concept) return `concept:${p.concept}|protection:${p.protection ?? '-'}`;
  return `play:${play.id}`;
}

export interface Family { readonly key: string; readonly plays: readonly string[]; readonly variants: ReadonlyMap<string, readonly string[]> }

/** Every play belongs to exactly one family; variants show under their parent. */
export function families(book: Playbook, includeRetired = false): Family[] {
  const byKey = new Map<string, string[]>();
  for (const p of book.plays.values()) {
    if (!includeRetired && p.status === 'retired') continue;
    const k = familyKey(p);
    const list = byKey.get(k) ?? [];
    list.push(p.id);
    byKey.set(k, list);
  }
  const out: Family[] = [];
  for (const [key, ids] of [...byKey.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    ids.sort();
    const variants = new Map<string, string[]>();
    for (const id of ids) {
      const parent = book.plays.get(id)!.parentId;
      if (parent && ids.includes(parent)) variants.set(parent, [...(variants.get(parent) ?? []), id]);
    }
    out.push({ key, plays: ids, variants });
  }
  return out;
}

export type CellState = 'empty' | 'exists' | 'installed' | 'called';
export interface GridUsage { readonly calledThisSeason: (playId: string) => number }

export interface Grid {
  readonly concepts: readonly string[];
  readonly formations: readonly string[];
  /** cell[concept][formation] */
  readonly cells: ReadonlyMap<string, ReadonlyMap<string, { readonly state: CellState; readonly playIds: readonly string[] }>>;
  readonly rowFormations: ReadonlyMap<string, { readonly carried: number; readonly installed: number }>;
  readonly columnConcepts: ReadonlyMap<string, number>;
  /** Formations with fewer than the thin-formation count of plays (G3.1.2). */
  readonly thin: readonly string[];
}

/** The concept-by-formation grid of one side (G3.1.2). Concept here is the teaching part (run or concept). */
export function conceptGrid(book: Playbook, side: Book = 'offense', usage?: GridUsage): Grid {
  const plays = playsIn(book, side);
  const teach = (p: PlayEntry) => p.parts.run ?? p.parts.concept ?? p.parts.coverage ?? p.parts.scheme;
  const concepts = [...new Set(plays.map(teach).filter((x): x is string => !!x))].sort();
  const formations = [...new Set(plays.map((p) => p.parts.formation ?? p.parts.front).filter((x): x is string => !!x))].sort();
  const cells = new Map<string, Map<string, { state: CellState; playIds: string[] }>>();
  const perFormation = new Map<string, number>();
  for (const c of concepts) cells.set(c, new Map(formations.map((f) => [f, { state: 'empty' as CellState, playIds: [] as string[] }])));
  const rank: Record<CellState, number> = { empty: 0, exists: 1, installed: 2, called: 3 };
  for (const p of plays) {
    const c = teach(p);
    const f = p.parts.formation ?? p.parts.front;
    if (!f) continue;
    perFormation.set(f, (perFormation.get(f) ?? 0) + 1);
    if (!c) continue;
    const cell = cells.get(c)!.get(f)!;
    cell.playIds.push(p.id);
    const s: CellState = usage && usage.calledThisSeason(p.id) > 0 ? 'called' : p.status === 'installed' ? 'installed' : 'exists';
    if (rank[s] > rank[cell.state]) cell.state = s;
  }
  const rowFormations = new Map<string, { carried: number; installed: number }>();
  for (const c of concepts) {
    let carried = 0;
    let installed = 0;
    for (const f of formations) {
      const st = cells.get(c)!.get(f)!.state;
      if (st !== 'empty') carried++;
      if (st === 'installed' || st === 'called') installed++;
    }
    rowFormations.set(c, { carried, installed });
  }
  const columnConcepts = new Map<string, number>();
  for (const f of formations) columnConcepts.set(f, concepts.filter((c) => cells.get(c)!.get(f)!.state !== 'empty').length);
  const thinAt = param('grid.thinFormationPlays');
  const thin = formations.filter((f) => (perFormation.get(f) ?? 0) < thinAt);
  return { concepts, formations, cells, rowFormations, columnConcepts, thin };
}

export interface FillResult {
  readonly book: Playbook;
  readonly play: PlayEntry | null;
  readonly failures: readonly string[];
  /** Learning units the new cell costs: the "known concept from a new formation" profile value (G4.2.1). */
  readonly units: number;
}

/**
 * Fill an empty grid cell with one action (G3.1.2): copy a play of the concept row, swap in the column's
 * formation, validate. A play that fails is still added, as draft with its failures shown.
 */
export function fillCell(book: Playbook, conceptPartId: string, formationPartId: string, family: LanguageFamily, validate: Validator, newId: string): FillResult {
  const units = LEARNING_PROFILES[family].knownFromNewFormation;
  const template = [...book.plays.values()].filter((p) => p.status !== 'retired' && (p.parts.run === conceptPartId || p.parts.concept === conceptPartId)).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (!template) return { book, play: null, failures: [`no play carries ${conceptPartId}`], units };
  const formation = book.parts.get(formationPartId);
  if (!formation || formation.type !== 'formation') return { book, play: null, failures: [`${formationPartId} is not a formation`], units };
  const existing = [...book.plays.values()].find((p) => p.parts.formation === formationPartId && (p.parts.run === conceptPartId || p.parts.concept === conceptPartId) && p.status !== 'retired');
  if (existing) return { book, play: null, failures: [`cell already holds ${existing.id}`], units };
  const draft: PlayEntry = { ...template, id: newId, status: 'draft', parts: { ...template.parts, formation: formationPartId }, parentId: template.id, look: undefined, origin: `grid:${template.id}` };
  const check = validate(draft, book);
  const play: PlayEntry = check.ok ? { ...draft, status: 'valid' } : draft;
  return { book: addPlay(book, play), play, failures: check.failures, units };
}
