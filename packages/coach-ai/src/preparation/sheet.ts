// K3.4.2 building the sheet: lay the plan out by situation, script the opening, and lock it with a stored
// mix per box (K4.3.1). The object follows the G7.1.1 sheet (boxes with a situation rule, priority and
// ranked entries, script, lock time) and holds references only. G-68 owns the stored schema (CR-G74-2).
import type { PrepDepth } from './depth.ts';
import { param } from './params.ts';
import { buildMatrix, type BucketMatrix, type CallOption, type ClockPayoff, type PayoffTable, type SituationDef, type Unit } from './payoffs.ts';
import type { AiGamePlan, MenuEntry, Theme } from './plan.ts';
import type { LookShare } from './scouting.ts';

export interface SheetBox {
  readonly id: string;
  /** G7.2.2 catalogue situation the box's rule is for. */
  readonly situationId: string;
  /** K4.1.1 rule 1: first match in priority order; narrower situations come first. */
  readonly priority: number;
  readonly entries: readonly { readonly callId: string; readonly rank: number }[];
}

/** G6.2.3 sequence: 2 to 4 calls, base first. */
export interface SequencePackage { readonly id: string; readonly kind: string; readonly calls: readonly string[] }

export interface AiSheet {
  readonly unit: Unit;
  readonly gameId: number;
  readonly boxes: readonly SheetBox[];
  /** Catalogue situations with no box of their own: the caller falls to the parent box (K4.1.1 rule 2). */
  readonly uncovered: readonly string[];
  /** G7.4.1 script: an order of suggestion with an "only if" situation. */
  readonly script: readonly { readonly callId: string; readonly onlyIf: string }[];
  readonly sequences: readonly SequencePackage[];
  /** G7.5.1 must-calls: the menu call that goes hardest at each matchup theme. */
  readonly mustCalls: readonly { readonly callId: string; readonly pairingId: string }[];
  /** K3.3.2: one matrix per non-empty box, with the stored mix once locked. */
  readonly matrices: readonly BucketMatrix[];
  /** Plan lock time of the week (G6.6.1); null while the sheet is open. */
  readonly lockedAt: number | null;
  readonly version: number;
}

export interface SheetInput {
  readonly unit: Unit;
  readonly gameId: number;
  readonly menu: readonly MenuEntry[];
  readonly calls: readonly CallOption[];
  readonly table: PayoffTable;
  /** The standard situation catalogue for the unit with expected snaps for the save's rule set (G7.2.2, G7.2.3). */
  readonly catalogue: readonly SituationDef[];
  readonly shares: { readonly all: readonly LookShare[]; readonly byBucket: ReadonlyMap<string, readonly LookShare[]> };
  /** Total entries the sheet aims for (`system.sheetSize`). */
  readonly sizeLimit: number;
  readonly clockPayoff?: ClockPayoff | null;
  /** Situations the opening script draws from, in order (first and 10, second and medium: K4.5.1). */
  readonly scriptSituations?: readonly string[];
  readonly packages?: readonly SequencePackage[];
  readonly themes?: readonly Theme[];
  /** Group a box should not be all of when another exists (defense: pressure against coverage, G7.7.1). */
  readonly mixGroupOf?: ((c: CallOption) => string) | null;
}

function depthOf(id: string, byId: ReadonlyMap<string, SituationDef>): number {
  let d = 0;
  let cur = byId.get(id);
  while (cur?.parentId != null && d < 32) { d++; cur = byId.get(cur.parentId); }
  return d;
}

/** K3.4.2 rule 2: which catalogue situations get their own box. The rarest narrow situations go first. */
export function coveredSituations(catalogue: readonly SituationDef[], coverage: number): { own: string[]; uncovered: string[] } {
  const keep = Math.min(catalogue.length, Math.ceil(coverage * catalogue.length - 1e-9));
  const droppable = catalogue.filter((s) => s.parentId !== null).sort((a, b) => a.expectedSnaps - b.expectedSnaps || (a.id < b.id ? -1 : 1));
  const uncovered = new Set(droppable.slice(0, Math.max(0, catalogue.length - keep)).map((s) => s.id));
  return { own: catalogue.filter((s) => !uncovered.has(s.id)).map((s) => s.id), uncovered: [...uncovered].sort() };
}

export function buildSheet(inp: SheetInput, depth: PrepDepth): AiSheet {
  const byId = new Map(inp.catalogue.map((s) => [s.id, s]));
  const callById = new Map(inp.calls.map((c) => [c.callId, c]));
  const menuCalls = inp.menu.map((e) => callById.get(e.callId)).filter((c): c is CallOption => !!c && c.unit === inp.unit);
  const { own, uncovered } = coveredSituations(inp.catalogue, depth.catalogueCoverage);
  const totalSnaps = own.reduce((s, id) => s + byId.get(id)!.expectedSnaps, 0);

  const order = own.slice().sort((a, b) => depthOf(b, byId) - depthOf(a, byId) || (a < b ? -1 : 1));
  const boxes: SheetBox[] = [];
  const matrices: BucketMatrix[] = [];
  const empty: string[] = [];
  order.forEach((id, priority) => {
    const situation = byId.get(id)!;
    const fits = menuCalls.filter((c) => c.fits === null || c.fits.includes(id));
    if (!fits.length) { empty.push(id); return; }
    // Rule 1: the top candidates by estimated value in that situation; box size follows expected snaps (G7.2.3).
    const want = totalSnaps > 0 ? Math.round(inp.sizeLimit * situation.expectedSnaps / totalSnaps) : 0;
    const size = Math.min(param('matrix.candidateCap'), Math.max(param('sheet.boxMinCalls'), want));
    const args = { situation, table: inp.table, bucketShares: inp.shares.byBucket.get(id), allShares: inp.shares.all, clockPayoff: inp.clockPayoff ?? null };
    const ranked = buildMatrix({ ...args, calls: fits }).candidates;
    let chosen = ranked.slice(0, size);
    if (inp.mixGroupOf && chosen.length >= 2) {
      const g = (cid: string) => inp.mixGroupOf!(callById.get(cid)!);
      const first = g(chosen[0]!);
      const alt = ranked.find((cid) => g(cid) !== first);
      if (alt && chosen.every((cid) => g(cid) === first)) chosen = [...chosen.slice(0, -1), alt];
    }
    const keep = new Set(chosen);
    const m = buildMatrix({ ...args, calls: fits.filter((c) => keep.has(c.callId)) });
    matrices.push(m);
    boxes.push({ id: `${inp.unit}:${id}`, situationId: id, priority, entries: m.candidates.map((callId, rank) => ({ callId, rank })) });
  });

  // Rule 3: script length and sequence packages by preparation.
  const script: { callId: string; onlyIf: string }[] = [];
  const sources = (inp.scriptSituations ?? []).map((id) => ({ id, entries: boxes.find((b) => b.situationId === id)?.entries ?? [] })).filter((s) => s.entries.length);
  const used = new Set<string>();
  for (let round = 0; script.length < depth.scriptLength && sources.some((s) => s.entries.some((e) => !used.has(e.callId))); round++) {
    const src = sources[round % sources.length]!;
    const next = src.entries.find((e) => !used.has(e.callId));
    if (!next) continue;
    used.add(next.callId);
    script.push({ callId: next.callId, onlyIf: src.id });
  }
  // The opener boxes ran out before the script was full: the best remaining menu calls that fit an opener situation.
  if (sources.length) {
    const rest = inp.menu.filter((e) => !used.has(e.callId) && callById.get(e.callId)?.unit === inp.unit).sort((a, b) => b.value - a.value || (a.callId < b.callId ? -1 : 1));
    for (const e of rest) {
      if (script.length >= depth.scriptLength) break;
      const fits = callById.get(e.callId)!.fits;
      const src = sources.find((s) => fits === null || fits.includes(s.id));
      if (src) script.push({ callId: e.callId, onlyIf: src.id });
    }
  }

  const onMenu = new Map(inp.menu.map((e) => [e.callId, e]));
  const sequences = (inp.packages ?? []).filter((p) => p.calls.length >= 2 && p.calls.every((c) => onMenu.has(c)))
    .sort((a, b) => onMenu.get(b.calls[0]!)!.value - onMenu.get(a.calls[0]!)!.value || (a.id < b.id ? -1 : 1))
    .slice(0, depth.sequencePackages);

  const mustCalls: { callId: string; pairingId: string }[] = [];
  for (const t of inp.themes ?? []) {
    if (t.kind === 'tendency' || (t.side === 'offense') !== (inp.unit === 'offense')) continue;
    let best: { id: string; w: number } | null = null;
    for (const c of menuCalls) {
      const w = c.pairings.filter((p) => p.pairingId === t.ref).reduce((s, p) => s + p.weight, 0);
      if (w > 0 && (!best || w > best.w || (w === best.w && c.callId < best.id))) best = { id: c.callId, w };
    }
    if (best) mustCalls.push({ callId: best.id, pairingId: t.ref });
  }

  return { unit: inp.unit, gameId: inp.gameId, boxes, uncovered: [...uncovered, ...empty].sort(), script, sequences, mustCalls, matrices, lockedAt: null, version: 1 };
}

/**
 * K4.3.1: the stored mix for one matrix, a probability per candidate. G-58 supplies the solver (the
 * zero-sum matrix game with its 5% floor); this module only stores what it returns.
 */
export type MixSolver = (m: BucketMatrix) => readonly number[];

/** Rule 4: at lock, solve each box's mix. A locked sheet is never rebuilt (K3.4.2 edge case). */
export function lockSheet(sheet: AiSheet, solve: MixSolver, lockedAt: number): AiSheet {
  if (sheet.lockedAt !== null) throw new Error('sheet is already locked; a late lineup change is filtered on game day (K4.1.1), not rebuilt');
  const matrices = sheet.matrices.map((m) => {
    const mix = solve(m);
    const total = mix.reduce((s, x) => s + x, 0);
    if (mix.length !== m.candidates.length || mix.some((x) => !(x >= 0)) || Math.abs(total - 1) > 1e-6) throw new Error(`mix for ${m.bucketId} is not a probability per candidate`);
    return { ...m, sigmaStar: [...mix] };
  });
  return { ...sheet, matrices, lockedAt };
}

/**
 * Planned snaps a game per call: each box's expected snaps (its own situation plus the uncovered ones
 * that fall to it) spread by the stored mix, or evenly before lock.
 */
export function plannedSnaps(sheet: AiSheet, catalogue: readonly SituationDef[]): Map<string, number> {
  const byId = new Map(catalogue.map((s) => [s.id, s]));
  const boxed = new Set(sheet.boxes.map((b) => b.situationId));
  const snaps = new Map<string, number>();
  for (const s of catalogue) {
    let cur: SituationDef | undefined = s;
    for (let i = 0; cur && !boxed.has(cur.id) && i < 32; i++) cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
    if (cur) snaps.set(cur.id, (snaps.get(cur.id) ?? 0) + s.expectedSnaps);
  }
  const out = new Map<string, number>();
  for (const m of sheet.matrices) {
    const n = snaps.get(m.bucketId) ?? 0;
    m.candidates.forEach((callId, i) => out.set(callId, (out.get(callId) ?? 0) + n * (m.sigmaStar ? m.sigmaStar[i]! : 1 / m.candidates.length)));
  }
  return out;
}

/** Writes the sheets' planned snaps onto the plan's menus (the G6.2.1 target counts practice reads). */
export function withPlannedSnaps(plan: AiGamePlan, sheets: readonly AiSheet[], catalogues: Readonly<Record<Unit, readonly SituationDef[]>>): AiGamePlan {
  const fill = (menu: readonly MenuEntry[], unit: Unit): MenuEntry[] => {
    const sheet = sheets.find((s) => s.unit === unit);
    if (!sheet) return [...menu];
    const snaps = plannedSnaps(sheet, catalogues[unit]);
    return menu.map((e) => ({ ...e, plannedSnaps: snaps.get(e.callId) ?? 0 }));
  };
  return { ...plan, offenseMenu: fill(plan.offenseMenu, 'offense'), defenseMenu: fill(plan.defenseMenu, 'defense'), specialTeamsMenu: fill(plan.specialTeamsMenu, 'specialTeams') };
}

/** Structural checks every AI sheet must pass (K3.3.2 and K3.4.2 acceptance); empty means sound. */
export function sheetProblems(sheet: AiSheet, catalogue: readonly SituationDef[], menu: readonly MenuEntry[]): string[] {
  const out: string[] = [];
  const known = new Set(catalogue.map((s) => s.id));
  const onMenu = new Set(menu.map((e) => e.callId));
  const matrix = new Map(sheet.matrices.map((m) => [m.bucketId, m]));
  const seen = new Set<string>();
  for (const b of sheet.boxes) {
    if (!known.has(b.situationId)) out.push(`box ${b.id}: situation ${b.situationId} is not in the catalogue`);
    if (seen.has(b.situationId)) out.push(`box ${b.id}: second box for ${b.situationId}`);
    seen.add(b.situationId);
    if (!b.entries.length) { out.push(`box ${b.id}: empty`); continue; }
    for (const e of b.entries) if (!onMenu.has(e.callId)) out.push(`box ${b.id}: ${e.callId} is not on the plan's menu`);
    const m = matrix.get(b.situationId);
    if (!m) { out.push(`box ${b.id}: no matrix`); continue; }
    if (m.candidates.join('|') !== b.entries.map((e) => e.callId).join('|')) out.push(`box ${b.id}: matrix candidates differ from the entries`);
    if (m.candidates.length > param('matrix.candidateCap') || m.looks.length > param('matrix.lookCap')) out.push(`box ${b.id}: matrix over the K4.3.1 size limits`);
    if (sheet.lockedAt !== null && !m.sigmaStar) out.push(`box ${b.id}: locked without a stored mix`);
  }
  for (const s of catalogue) if (!seen.has(s.id) && !sheet.uncovered.includes(s.id)) out.push(`situation ${s.id}: neither boxed nor listed uncovered`);
  for (const e of sheet.script) if (!onMenu.has(e.callId)) out.push(`script: ${e.callId} is not on the menu`);
  return out;
}
