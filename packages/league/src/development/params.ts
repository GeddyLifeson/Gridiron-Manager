// Development and aging numbers (D7, D8, T8.1, T8.2). Scalars live in params.json as a ParamFile
// (basis `bible` with the leaf, or `assumption`); tables live in tables.json with their basis and
// leaf. Code in this package holds no football number (P1.1.2): every constant is read from here.
import { ParamFile, type ParamTable } from '@gm/schema';
import paramsFile from './params.json' with { type: 'json' };
import tablesFile from './tables.json' with { type: 'json' };
import speedFile from './speed-value.json' with { type: 'json' };

export const MODULE = 'league.development';
export const PARAMS: ParamFile = ParamFile.parse(paramsFile);

/** Full parameter name from its short name: `p('gain.k')` is `league.development.gain.k`. */
export const p = (short: string): string => `${MODULE}.${short}`;

interface Basis { readonly basis: 'bible' | 'assumption'; readonly leaf: string; readonly note: string }
type Row = readonly number[];

/** Shape of tables.json. Checked by `tableProblems` at load (league may not import zod, P1.2.1). */
export interface DevelopmentTables {
  readonly module: string;
  readonly version: string;
  readonly growth: Basis & { readonly ages: Row; readonly height: Row; readonly weight: Row; readonly speed: Row; readonly strengthRel: Row };
  readonly collegeYearShare: Basis & { readonly shares: Row };
  readonly curves: Basis & {
    readonly bandStarts: Row; readonly groups: Readonly<Record<string, Row>>;
    /** Fit results (fit-aging.ts): last age within `value.primeBandIss` of the peak, and the mean yearly loss in ISS over the next four years. */
    readonly primeEnd: Readonly<Record<string, number>>; readonly declineIssPerYear: Readonly<Record<string, number>>;
  };
  /** Speed term of the whole-player value (value.ts), built by facts/aging-build/build.py. */
  readonly speedValue: Basis & { readonly fortySdPercent: Readonly<Record<string, number>>; readonly weight: Readonly<Record<string, number>> };
  readonly agingWeights: Basis & {
    readonly fortyS: number; readonly tenSplitS: number; readonly threeConeS: number; readonly shuttleS: number;
    readonly verticalIn: number; readonly broadIn: number; readonly explosiveness: number; readonly playStrengthEarly: number;
    readonly playStrengthLate: number; readonly stamina: number; readonly durability: number; readonly recovery: number; readonly mobility: number;
  };
  readonly exitRates: Basis & { readonly ages: Row; readonly groups: Readonly<Record<string, readonly (number | null)[]>> };
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isRow = (x: unknown): x is number[] => Array.isArray(x) && x.every(isNum);

/** Structural problems of a tables file; empty when valid. */
export function tableProblems(t: DevelopmentTables): string[] {
  const out: string[] = [];
  if (t.module !== MODULE) out.push(`module must be ${MODULE}`);
  for (const [name, part] of Object.entries({ growth: t.growth, collegeYearShare: t.collegeYearShare, curves: t.curves, agingWeights: t.agingWeights, exitRates: t.exitRates })) {
    const b = part as Partial<Basis> | undefined;
    if (!b || (b.basis !== 'bible' && b.basis !== 'assumption') || typeof b.leaf !== 'string' || typeof b.note !== 'string') out.push(`${name}: basis, leaf and note required`);
  }
  const g = t.growth;
  for (const k of ['ages', 'height', 'weight', 'speed', 'strengthRel'] as const) {
    if (!isRow(g[k]) || g[k].length !== g.ages.length) out.push(`growth.${k} needs one number per age`);
  }
  if (!isRow(t.collegeYearShare.shares)) out.push('collegeYearShare.shares must be numbers');
  if (!isRow(t.curves.bandStarts)) out.push('curves.bandStarts must be numbers');
  for (const [k, row] of Object.entries(t.curves.groups)) {
    if (!isRow(row) || row.length !== t.curves.bandStarts.length) out.push(`curve ${k} needs one number per band`);
    if (!isNum(t.curves.primeEnd?.[k]) || !isNum(t.curves.declineIssPerYear?.[k])) out.push(`curve ${k} needs primeEnd and declineIssPerYear`);
  }
  const sv = t.speedValue;
  if (!sv || (sv.basis !== 'bible' && sv.basis !== 'assumption') || typeof sv.leaf !== 'string' || typeof sv.note !== 'string') out.push('speedValue: basis, leaf and note required');
  else for (const [k, v] of Object.entries(sv.weight)) if (!isNum(v) || !isNum(sv.fortySdPercent[k]) || !(sv.fortySdPercent[k]! > 0)) out.push(`speedValue ${k} needs a weight and a positive fortySdPercent`);
  for (const [k, v] of Object.entries(t.agingWeights)) if (k !== 'basis' && k !== 'leaf' && k !== 'note' && !isNum(v)) out.push(`agingWeights.${k} must be a number`);
  if (!isRow(t.exitRates.ages)) out.push('exitRates.ages must be numbers');
  for (const [k, row] of Object.entries(t.exitRates.groups)) {
    if (!Array.isArray(row) || row.length !== t.exitRates.ages.length || !row.every((x) => x === null || isNum(x))) out.push(`exit rates ${k} need one number or null per age`);
  }
  return out;
}

function loadTables(raw: unknown): DevelopmentTables {
  const t = raw as DevelopmentTables;
  const problems = tableProblems(t);
  if (problems.length) throw new Error(`tables.json: ${problems.join('; ')}`);
  return t;
}

export const TABLES: DevelopmentTables = loadTables({ ...tablesFile, speedValue: speedFile });

/** A parameter table over one or more parameter files, with optional overrides by full name. */
export function paramTable(files: readonly ParamFile[] = [PARAMS], overrides: Readonly<Record<string, number>> = {}): ParamTable {
  const values = new Map<string, number>();
  for (const f of files) for (const row of f.params) values.set(row.name, row.value);
  for (const [k, v] of Object.entries(overrides)) {
    if (!values.has(k)) throw new Error(`parameter override ${k} names no parameter`);
    values.set(k, v);
  }
  return {
    version: files.map((f) => `${f.module}@${f.version}`).join(','),
    num(name: string): number {
      const v = values.get(name);
      if (v === undefined) throw new Error(`unknown parameter ${name}`);
      return v;
    },
    has(name: string): boolean { return values.has(name); },
  };
}

/** Everything a development function reads numbers from. */
export interface DevNumbers {
  readonly params: ParamTable;
  readonly tables: DevelopmentTables;
}

export function devNumbers(overrides: Readonly<Record<string, number>> = {}, tables: DevelopmentTables = TABLES): DevNumbers {
  return { params: paramTable([PARAMS], overrides), tables };
}

const cache = new WeakMap<DevNumbers, Map<string, number>>();

/** Short-name reader: `num(n, 'gain.k')`. Values are cached per DevNumbers (a ParamTable never changes). */
export function num(n: DevNumbers, short: string): number {
  let m = cache.get(n);
  if (!m) { m = new Map(); cache.set(n, m); }
  let v = m.get(short);
  if (v === undefined) { v = n.params.num(p(short)); m.set(short, v); }
  return v;
}

/** Piecewise-linear lookup on knots, clamped at both ends. */
export function interp(xs: readonly number[], ys: readonly number[], x: number): number {
  const last = xs.length - 1;
  if (x <= xs[0]!) return ys[0]!;
  if (x >= xs[last]!) return ys[last]!;
  let i = 0;
  while (x > xs[i + 1]!) i++;
  const t = (x - xs[i]!) / (xs[i + 1]! - xs[i]!);
  return ys[i]! + t * (ys[i + 1]! - ys[i]!);
}

/** Index of the band whose start is the largest one not above x, or -1 below the first. */
export function bandIndex(starts: readonly number[], x: number): number {
  let idx = -1;
  for (let i = 0; i < starts.length; i++) if (x >= starts[i]!) idx = i;
  return idx;
}
