// G-55 duty catalogue and ownership matrix as content (S3.1.1). Both files are data: a league or mod can
// rename tools, move due slots, or add a duty without touching code (P4). Every check here is a content-build
// check: a broken file throws at load, never at play time. Core packages may not import zod (P1.1.1), so the
// files are checked by hand.
import dutiesJson from './duties.json' with { type: 'json' };
import matrixJson from './matrix.json' with { type: 'json' };
import { LEVELS, type CatalogueLevel } from '../positions/index.ts';

export type Cadence = 'daily' | 'weekly' | 'per_game' | 'per_request' | 'seasonal';
export type GraderKind = 'truth' | 'boss' | 'outcome' | 'mixed';
/** H1.1.1 week days, numbered by distance to the game. */
export type WeekDay = 'G-6' | 'G-5' | 'G-4' | 'G-3' | 'G-2' | 'G-1' | 'G';
export type DutyKind =
  | 'chart' | 'signal' | 'video' | 'tagging' | 'cards' | 'scout_team' | 'enrolment' | 'tendency' | 'self_scout' | 'reel'
  | 'advice' | 'drawings' | 'drills' | 'meeting' | 'snap_grades' | 'depth' | 'recruiting' | 'academics' | 'personnel'
  | 'plan_slice' | 'side_plan' | 'play_calling' | 'staff' | 'hiring' | 'public' | 'program';

const CADENCES: readonly string[] = ['daily', 'weekly', 'per_game', 'per_request', 'seasonal'];
const GRADERS: readonly string[] = ['truth', 'boss', 'outcome', 'mixed'];
export const WEEK_DAYS: readonly WeekDay[] = ['G-6', 'G-5', 'G-4', 'G-3', 'G-2', 'G-1', 'G'];
export const DUTY_KINDS: readonly DutyKind[] = [
  'chart', 'signal', 'video', 'tagging', 'cards', 'scout_team', 'enrolment', 'tendency', 'self_scout', 'reel', 'advice', 'drawings',
  'drills', 'meeting', 'snap_grades', 'depth', 'recruiting', 'academics', 'personnel', 'plan_slice', 'side_plan', 'play_calling',
  'staff', 'hiring', 'public', 'program',
];

/** One duty (S3.1.1 fields: duty_id, tool, cadence, due, hours_est, grader, consumer). Ownership is per seat, from the matrix. */
export interface DutyDef {
  readonly id: string;
  readonly title: string;
  readonly leaf: string;
  /** Row of the S3.1.1 ownership matrix this duty belongs to. */
  readonly family: string;
  readonly levels: readonly CatalogueLevel[];
  /** The screen the duty opens (O7 owns the screens; G-85 makes each reachable). */
  readonly tool: string;
  readonly cadence: Cadence;
  /** Slot in the H1.1.1 week; null for seasonal work with no weekly slot. */
  readonly due: { readonly day: WeekDay; readonly time: string } | null;
  /** E7 hours a week (module starting value). */
  readonly hoursEst: number;
  readonly grader: GraderKind;
  readonly consumer: string;
  readonly kind: DutyKind;
  /** A seat holding this duty also owns every family marked O at its rung band (coordinator, head coach). */
  readonly leadsFamilies: boolean;
}

/** Matrix marks as written in S3.1.1, plus the two conditional cells. */
export type MatrixMark = 'O' | 'R' | 'B' | 'O_or_R' | 'by_power' | '';
export type Ownership = 'own' | 'recommend' | 'observe';
export type RungBand = '1' | '2' | '3' | '4-5' | '6' | '7' | '8-9';
export const BANDS: readonly RungBand[] = ['1', '2', '3', '4-5', '6', '7', '8-9'];
const MARKS: readonly string[] = ['O', 'R', 'B', 'O_or_R', 'by_power', ''];

export interface MatrixFamily {
  readonly id: string;
  readonly label: string;
  readonly leaf: string;
  readonly cells: Readonly<Record<RungBand, MatrixMark>>;
}

export interface DutyCatalogue {
  readonly version: string;
  readonly duties: readonly DutyDef[];
  readonly families: readonly MatrixFamily[];
  duty(id: string): DutyDef;
  has(id: string): boolean;
  family(id: string): MatrixFamily;
  dutiesOf(familyId: string, level: CatalogueLevel): readonly DutyDef[];
}

/** The band a rung falls in; null for rung 0 (outside every staff) and seats off the ladder. */
export function bandOf(rung: number | null): RungBand | null {
  if (rung === null || rung < 1 || rung > 9) return null;
  if (rung <= 3) return String(rung) as RungBand;
  if (rung <= 5) return '4-5';
  if (rung <= 7) return String(rung) as RungBand;
  return '8-9';
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkDuty(r: unknown, i: number, out: string[]): r is DutyDef {
  const where = `duty ${i}`;
  if (!isObj(r)) { out.push(`${where}: not an object`); return false; }
  const before = out.length;
  for (const f of ['id', 'title', 'leaf', 'family', 'tool', 'consumer'] as const) if (typeof r[f] !== 'string' || r[f] === '') out.push(`${where}: ${f}`);
  if (typeof r.id === 'string' && !/^duty:S3\.\d\.\d(#[a-z_]+)?$/.test(r.id)) out.push(`${where}: id ${String(r.id)}`);
  if (!Array.isArray(r.levels) || r.levels.length === 0 || r.levels.some((l) => !LEVELS.includes(l as CatalogueLevel))) out.push(`${where}: levels`);
  if (!CADENCES.includes(String(r.cadence))) out.push(`${where}: cadence`);
  if (!GRADERS.includes(String(r.grader))) out.push(`${where}: grader`);
  if (!DUTY_KINDS.includes(r.kind as DutyKind)) out.push(`${where}: kind`);
  if (typeof r.hoursEst !== 'number' || r.hoursEst < 0 || r.hoursEst > 80) out.push(`${where}: hoursEst`);
  if (typeof r.leadsFamilies !== 'boolean') out.push(`${where}: leadsFamilies`);
  if (r.due !== null) {
    if (!isObj(r.due) || !WEEK_DAYS.includes(r.due.day as WeekDay) || typeof r.due.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.due.time)) out.push(`${where}: due`);
  } else if (r.cadence !== 'seasonal') out.push(`${where}: only seasonal duties may have no due slot`);
  return out.length === before;
}

function checkFamily(f: unknown, i: number, out: string[]): f is MatrixFamily {
  const where = `family ${i}`;
  if (!isObj(f)) { out.push(`${where}: not an object`); return false; }
  const before = out.length;
  for (const k of ['id', 'label', 'leaf'] as const) if (typeof f[k] !== 'string' || f[k] === '') out.push(`${where}: ${k}`);
  if (!isObj(f.cells)) out.push(`${where}: cells`);
  else for (const b of BANDS) if (!MARKS.includes(String(f.cells[b]))) out.push(`${where}: cell ${b}`);
  return out.length === before;
}

/** Parse and cross-check both files. Throws a list of every problem found (content build). */
export function buildDutyCatalogue(dutiesData: unknown, matrixData: unknown): DutyCatalogue {
  const problems: string[] = [];
  const dObj = isObj(dutiesData) ? dutiesData : {};
  const mObj = isObj(matrixData) ? matrixData : {};
  const rawD = Array.isArray(dObj.duties) ? dObj.duties : [];
  const rawF = Array.isArray(mObj.families) ? mObj.families : [];
  if (rawD.length === 0) problems.push('no duties');
  if (rawF.length === 0) problems.push('no matrix families');
  const duties = rawD.filter((r, i) => checkDuty(r, i, problems)) as DutyDef[];
  const families = rawF.filter((f, i) => checkFamily(f, i, problems)) as MatrixFamily[];
  const byId = new Map<string, DutyDef>();
  for (const d of duties) { if (byId.has(d.id)) problems.push(`duplicate duty ${d.id}`); byId.set(d.id, d); }
  const famById = new Map<string, MatrixFamily>();
  for (const f of families) { if (famById.has(f.id)) problems.push(`duplicate family ${f.id}`); famById.set(f.id, f); }
  for (const d of duties) if (!famById.has(d.family)) problems.push(`${d.id}: unknown family ${d.family}`);
  for (const f of families) if (!duties.some((d) => d.family === f.id)) problems.push(`family ${f.id} has no duty`);
  if (problems.length > 0) throw new Error(`duty catalogue invalid:\n${problems.join('\n')}`);
  return {
    version: `${String(dObj.version ?? '?')}+${String(mObj.version ?? '?')}`,
    duties,
    families,
    duty(id) { const d = byId.get(id); if (!d) throw new Error(`ladder: unknown duty ${id}`); return d; },
    has(id) { return byId.has(id); },
    family(id) { const f = famById.get(id); if (!f) throw new Error(`ladder: unknown family ${id}`); return f; },
    dutiesOf(familyId, level) { return duties.filter((d) => d.family === familyId && d.levels.includes(level)); },
  };
}

export const DUTIES: DutyCatalogue = buildDutyCatalogue(dutiesJson, matrixJson);
