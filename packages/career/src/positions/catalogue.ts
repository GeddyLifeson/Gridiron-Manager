// G-25 job catalogue and position definitions (S1.1.1 to S1.1.3, S1.2.1, E2.1.1, X8.1.1, L4.1.1).
// Both files are content: a league can rename or add jobs without touching code (S1.1 intro, P4).
// Every check below is a content-build check: a broken file throws at load, never at play time.
import { PositionDefinition, RUNG_MIN, RUNG_MAX } from '@gm/schema';
import catalogueJson from './catalogue.json' with { type: 'json' };
import positionsJson from './positions.json' with { type: 'json' };

// Core packages may not import zod (P1.1.1), so the content files are checked by hand here; the X8.1.1
// definitions inside positions.json are parsed by the contract's own schema.

/** A level is a label on content rows, never a branch in code (P1.1.2). */
export type CatalogueLevel = 'college' | 'pro';
export const LEVELS: readonly CatalogueLevel[] = ['college', 'pro'];

export type JobSide = 'offense' | 'defense' | 'special_teams' | 'whole_team' | 'support';
export type PositionGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'specialists' | 'none';
const JOB_SIDES: readonly string[] = ['offense', 'defense', 'special_teams', 'whole_team', 'support'];
const GROUPS: readonly string[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'specialists', 'none'];

/** One catalogue row (S1.1.1 fields, plus seat counts from S1.1.2 and S1.1.3). `by_seat`: chosen when the seat is made. */
export interface CatalogueRow {
  readonly id: string;
  readonly title: string;
  /** E2.1.1 rung; null for seats off the coaching ladder (strength staff, bosses, college general manager). */
  readonly rung: number | null;
  readonly levels: readonly CatalogueLevel[];
  readonly side: JobSide | 'by_seat';
  readonly positionGroup: PositionGroup | 'by_seat';
  /** X8.1.1 position this seat instantiates; null only for rung 0 (not a seat on any staff). */
  readonly positionId: string | null;
  /** S3 duty leaves this seat owns (G-55 expands them into duty records). */
  readonly dutyIds: readonly string[];
  /** May carry the `calls_plays` flag (S1.1.1: only meaningful at rungs 6 to 9). */
  readonly callsPlaysEligible: boolean;
  readonly recruitsOffCampus: boolean;
  readonly gamedaySeat: 'booth' | 'sideline' | 'none';
  readonly paid: 'none' | 'stipend' | 'salary';
  readonly termLimitYears: number | null;
  /** Starting seat counts on a top-level staff [min, max] (S1.1.2, S1.1.3 tables). */
  readonly seats: readonly [number, number];
  /** Count picked by resource band (X8.1.2); otherwise the seat count is fixed at `seats[1]`. */
  readonly pooled: boolean;
  readonly perSide: boolean;
  readonly userHoldable: boolean;
  /** False for rung 0: the person is outside every staff (E2.1.1). */
  readonly onStaff: boolean;
  /** S1.1.2 rung 6: a title on top of a rung 5 seat, normally held by someone already on the staff. */
  readonly titleOnTop: boolean;
  readonly onLadder: boolean;
  /** S1.2.2 league-rules key that caps this kind of seat, or null. */
  readonly limitKey: string | null;
  readonly whatTheyDo: string;
  readonly leaf: string;
}

/** How a seat finds its evaluating boss when made (S1.2.1 default lines). `none`: the seat of the position its definition reports to, if on the staff. */
export type ReportsToRule = 'boss' | 'head_coach' | 'coordinator_of_side' | 'position_coach_of_group' | 'graduate_assistant'
  | 'recruiting_assistant' | 'strength_head' | 'general_manager' | 'none';
const REPORTS_TO_RULES: readonly string[] = ['boss', 'head_coach', 'coordinator_of_side', 'position_coach_of_group', 'graduate_assistant', 'recruiting_assistant', 'strength_head', 'general_manager', 'none'];

/** X8.4.1 rule 3 chair kinds. `none` chairs are outside the firing cascade (bosses). */
export type CascadeKind = 'head_coach' | 'coordinator' | 'special_teams_coordinator' | 'position_coach' | 'strength_head' | 'analyst_qc' | 'graduate_assistant' | 'none';
const CASCADE_KINDS: readonly string[] = ['head_coach', 'coordinator', 'special_teams_coordinator', 'position_coach', 'strength_head', 'analyst_qc', 'graduate_assistant', 'none'];

/** One position: the contract's X8.1.1 definition plus the extension this package reads. */
export interface PositionRow {
  readonly definition: PositionDefinition;
  readonly title: string;
  /** Group name used by `role_group` succession steps. */
  readonly roleGroup: string;
  readonly cascadeKind: CascadeKind;
  readonly reportsToRule: ReportsToRule;
  /** L4.1.1 `controls[]`: delegable tasks this chair owns by default. */
  readonly controls: readonly string[];
  readonly side: JobSide | 'by_seat';
  readonly leaf: string;
  readonly note?: string;
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (o: Obj, k: string, where: string, out: string[]) => { if (typeof o[k] !== 'string' || (o[k] as string).length === 0) out.push(`${where}: ${k} must be a non-empty string`); };
const bool = (o: Obj, k: string, where: string, out: string[]) => { if (typeof o[k] !== 'boolean') out.push(`${where}: ${k} must be true or false`); };
const oneOf = (o: Obj, k: string, allowed: readonly string[], where: string, out: string[]) => { if (!allowed.includes(o[k] as string)) out.push(`${where}: ${k} ${String(o[k])} is not one of ${allowed.join(', ')}`); };
const intOrNull = (o: Obj, k: string, lo: number, hi: number, where: string, out: string[]) => {
  const v = o[k];
  if (v !== null && !(Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi)) out.push(`${where}: ${k} must be null or an integer ${lo} to ${hi}`);
};

const ROW_KEYS = ['id', 'title', 'rung', 'levels', 'side', 'positionGroup', 'positionId', 'dutyIds', 'callsPlaysEligible', 'recruitsOffCampus', 'gamedaySeat', 'paid', 'termLimitYears', 'seats', 'pooled', 'perSide', 'userHoldable', 'onStaff', 'titleOnTop', 'onLadder', 'limitKey', 'whatTheyDo', 'leaf'];

function checkRow(r: unknown, i: number, out: string[]): r is CatalogueRow {
  const where = `catalogue row ${i}`;
  if (!isObj(r)) { out.push(`${where}: not an object`); return false; }
  for (const k of Object.keys(r)) if (!ROW_KEYS.includes(k)) out.push(`${where}: unknown field ${k}`);
  if (typeof r.id !== 'string' || !/^job:[a-z_.]+$/.test(r.id)) out.push(`${where}: bad id`);
  str(r, 'title', where, out); str(r, 'whatTheyDo', where, out); str(r, 'leaf', where, out);
  intOrNull(r, 'rung', RUNG_MIN, RUNG_MAX, where, out);
  if (!Array.isArray(r.levels) || r.levels.length === 0 || r.levels.some((l) => !LEVELS.includes(l as CatalogueLevel))) out.push(`${where}: levels`);
  oneOf(r, 'side', [...JOB_SIDES, 'by_seat'], where, out);
  oneOf(r, 'positionGroup', [...GROUPS, 'by_seat'], where, out);
  if (r.positionId !== null && typeof r.positionId !== 'string') out.push(`${where}: positionId`);
  if (!Array.isArray(r.dutyIds) || r.dutyIds.some((d) => typeof d !== 'string' || !/^duty:S3\.\d+\.\d+$/.test(d))) out.push(`${where}: dutyIds must be S3 duty leaves`);
  for (const k of ['callsPlaysEligible', 'recruitsOffCampus', 'pooled', 'perSide', 'userHoldable', 'onStaff', 'titleOnTop', 'onLadder']) bool(r, k, where, out);
  oneOf(r, 'gamedaySeat', ['booth', 'sideline', 'none'], where, out);
  oneOf(r, 'paid', ['none', 'stipend', 'salary'], where, out);
  intOrNull(r, 'termLimitYears', 1, 10, where, out);
  if (!Array.isArray(r.seats) || r.seats.length !== 2 || r.seats.some((n) => !Number.isInteger(n) || (n as number) < 0)) out.push(`${where}: seats must be [min, max]`);
  if (r.limitKey !== null && typeof r.limitKey !== 'string') out.push(`${where}: limitKey`);
  return true;
}

function checkPosition(p: unknown, i: number, out: string[]): PositionRow | null {
  const where = `position row ${i}`;
  if (!isObj(p)) { out.push(`${where}: not an object`); return null; }
  for (const k of Object.keys(p)) if (!['definition', 'title', 'roleGroup', 'cascadeKind', 'reportsToRule', 'controls', 'side', 'leaf', 'note'].includes(k)) out.push(`${where}: unknown field ${k}`);
  const def = PositionDefinition.safeParse(p.definition);
  if (!def.success) { out.push(`${where}: definition: ${def.error.issues.map((x) => x.message).join('; ')}`); return null; }
  str(p, 'title', where, out); str(p, 'roleGroup', where, out); str(p, 'leaf', where, out);
  oneOf(p, 'cascadeKind', CASCADE_KINDS, where, out);
  oneOf(p, 'reportsToRule', REPORTS_TO_RULES, where, out);
  oneOf(p, 'side', [...JOB_SIDES, 'by_seat'], where, out);
  if (!Array.isArray(p.controls) || p.controls.some((c) => typeof c !== 'string' || !/^[a-z_]+(\.[a-z_]+)*$/.test(c))) out.push(`${where}: controls`);
  return { ...(p as unknown as PositionRow), definition: def.data };
}

export interface Catalogue {
  readonly version: string;
  readonly jobs: readonly CatalogueRow[];
  readonly positions: readonly PositionRow[];
  job(id: string): CatalogueRow;
  position(id: string): PositionRow;
  hasPosition(id: string): boolean;
  /** Rows offered at a level (a row lists the levels it belongs to). */
  jobsAt(level: CatalogueLevel): readonly CatalogueRow[];
}

/** Parse and cross-check both files. Throws a list of every problem found (content build). */
export function buildCatalogue(catalogueData: unknown, positionsData: unknown): Catalogue {
  const problems: string[] = [];
  const catObj = isObj(catalogueData) ? catalogueData : {};
  const posObj = isObj(positionsData) ? positionsData : {};
  const rawJobs = Array.isArray(catObj.jobs) ? catObj.jobs : [];
  const rawPos = Array.isArray(posObj.positions) ? posObj.positions : [];
  if (rawJobs.length === 0) problems.push('catalogue has no jobs');
  if (rawPos.length === 0) problems.push('positions file has no positions');
  const jobsList = rawJobs.filter((r, i) => checkRow(r, i, problems)) as CatalogueRow[];
  const posList = rawPos.map((p, i) => checkPosition(p, i, problems)).filter((p): p is PositionRow => p !== null);
  const cat = { version: String(catObj.version ?? '?'), jobs: jobsList };
  const pos = { version: String(posObj.version ?? '?'), positions: posList };
  if (problems.length === 0) problems.push(...catalogueProblems(cat.jobs, pos.positions));
  if (problems.length > 0) throw new Error(`job catalogue invalid:\n${problems.join('\n')}`);
  const jobs = new Map(cat.jobs.map((j) => [j.id, j] as const));
  const positions = new Map(pos.positions.map((p) => [p.definition.id, p] as const));
  return {
    version: `${cat.version}+${pos.version}`,
    jobs: cat.jobs,
    positions: pos.positions,
    job(id) { const j = jobs.get(id); if (!j) throw new Error(`positions: unknown job ${id}`); return j; },
    position(id) { const p = positions.get(id); if (!p) throw new Error(`positions: unknown position ${id}`); return p; },
    hasPosition(id) { return positions.has(id); },
    jobsAt(level) { return cat.jobs.filter((j) => j.levels.includes(level)); },
  };
}

/** Rungs each level must offer (E2.1.1: the professional league has no rung 8, S1.1.3). */
export const RUNGS_BY_LEVEL: Readonly<Record<CatalogueLevel, readonly number[]>> = {
  college: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  pro: [0, 1, 2, 3, 4, 5, 6, 7, 9],
};

export function catalogueProblems(jobs: readonly CatalogueRow[], positions: readonly PositionRow[]): string[] {
  const out: string[] = [];
  const posIds = new Set<string>();
  for (const p of positions) {
    if (posIds.has(p.definition.id)) out.push(`duplicate position ${p.definition.id}`);
    posIds.add(p.definition.id);
  }
  const jobIds = new Set<string>();
  for (const j of jobs) {
    if (jobIds.has(j.id)) out.push(`duplicate job ${j.id}`);
    jobIds.add(j.id);
    if (j.seats[0] > j.seats[1]) out.push(`${j.id}: seat range min above max`);
    if (j.onStaff && j.positionId === null) out.push(`${j.id}: a staff seat needs a position`);
    if (!j.onStaff && j.rung !== 0) out.push(`${j.id}: only rung 0 is off every staff (E2.1.1)`);
    if (j.positionId !== null && !posIds.has(j.positionId)) out.push(`${j.id}: unknown position ${j.positionId}`);
    if (j.onLadder && j.rung === null) out.push(`${j.id}: a ladder seat needs a rung (S1.1.1 acceptance)`);
    if (j.onLadder && j.onStaff && j.dutyIds.length === 0) out.push(`${j.id}: a ladder seat needs a duty set (S1.1.1 acceptance)`);
    if (j.callsPlaysEligible && (j.rung === null || j.rung < 6)) out.push(`${j.id}: calls_plays is only meaningful at rungs 6 to 9 (S1.1.1)`);
  }
  for (const level of LEVELS) {
    const have = new Set(jobs.filter((j) => j.levels.includes(level) && j.onLadder).map((j) => j.rung));
    for (const r of RUNGS_BY_LEVEL[level]) if (!have.has(r)) out.push(`${level}: no job at rung ${r} (E2.1.1)`);
    for (const r of have) if (r !== null && !RUNGS_BY_LEVEL[level].includes(r)) out.push(`${level}: rung ${r} is not used at this level (S1.1.3)`);
  }
  for (const p of positions) {
    const d = p.definition;
    if (d.reportsTo !== null && !posIds.has(d.reportsTo)) out.push(`${d.id}: reports to unknown ${d.reportsTo}`);
    for (const s of d.successionRule) if (s.kind === 'role' && !posIds.has(s.positionId)) out.push(`${d.id}: succession names unknown ${s.positionId}`);
    if (d.requiredForGame) {
      // X8.1.1: a game-required chair's rule must resolve on a test staff, so it must end in a step that can
      // always yield someone (the appointer's pick).
      const last = d.successionRule[d.successionRule.length - 1];
      if (!last || last.kind !== 'appointer_pick') out.push(`${d.id}: a game-required chair's rule must end with appointer_pick (X8.1.1)`);
    }
  }
  // Reporting lines form a tree (no cycles).
  const parent = new Map(positions.map((p) => [p.definition.id, p.definition.reportsTo] as const));
  for (const id of posIds) {
    const seen = new Set<string>();
    let cur: string | null | undefined = id;
    while (cur) {
      if (seen.has(cur)) { out.push(`${id}: reporting line loops through ${cur}`); break; }
      seen.add(cur);
      cur = parent.get(cur) ?? null;
    }
  }
  return out;
}

/** The shipped catalogue. */
export const CATALOGUE: Catalogue = buildCatalogue(catalogueJson, positionsJson);

/** The X8.1.1 definitions as contract rows (table `positions`, content copied into the save). */
export function positionDefinitions(cat: Catalogue = CATALOGUE): readonly PositionDefinition[] {
  return cat.positions.map((p) => p.definition);
}
