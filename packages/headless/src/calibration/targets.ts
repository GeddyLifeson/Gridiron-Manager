// Loader checks for a target file (J15.1.1, Q2.1.1, Q6). A target file is accepted only when:
//   - it parses as CalibrationTargetFile and every row belongs to the file's rule set;
//   - ids are unique;
//   - every factId names a measured-rate row of the register at the same level (a college row is
//     never filled from a pro value, Q2.1.1), and the fact's value equals the target's value;
//   - targetTierProblems is empty for every row (certify only when Verified; no fact row means watch);
//   - a row with no fact row has an empty value (it prints MISSING SOURCE);
//   - every measure the filter names is one the harness implements, or `none`.
import { CalibrationTargetFile, targetTierProblems, type CalibrationTarget, type FactRow, type FactStatus } from '@gm/schema';
import { parseMeasure, isKnownMeasure } from './measures.ts';

export type Level = 'pro' | 'college';

export interface LoadedTargets {
  readonly file: CalibrationTargetFile;
  /** Computed status of each target's fact row by target id; null for a row with no fact row. */
  readonly statusOf: ReadonlyMap<string, FactStatus | null>;
  readonly problems: readonly string[];
}

/** Level of a rule set id: the part before the first underscore (`pro_2026`, `college_2026`). */
export function levelOf(ruleSetId: string): Level {
  const l = ruleSetId.split('_')[0];
  if (l !== 'pro' && l !== 'college') throw new Error(`rule set ${ruleSetId}: unknown level`);
  return l;
}

/** True when a fact's stored value supports the target value exactly (numbers, or a quantile list written "a, b, c"). */
export function factValueMatches(t: CalibrationTarget, f: FactRow): boolean {
  if (t.kind === 'ordering') return f.value === undefined;
  if (typeof t.value === 'number') return typeof f.value === 'number' && f.value === t.value;
  if (Array.isArray(t.value) && t.value.every((v) => typeof v === 'number')) {
    if (typeof f.value !== 'string') return false;
    const want = t.value as number[];
    const parts = f.value.split(',').map((s) => Number(s.trim()));
    return parts.length === want.length && parts.every((p, i) => p === want[i]);
  }
  return false;
}

export function checkTargets(raw: unknown, facts: readonly FactRow[]): LoadedTargets {
  const parsed = CalibrationTargetFile.safeParse(raw);
  if (!parsed.success) return { file: { ruleSetId: '', version: '', targets: [] }, statusOf: new Map(), problems: [`target file does not parse: ${parsed.error.message}`] };
  const file = parsed.data;
  const level = levelOf(file.ruleSetId);
  const factById = new Map(facts.map((f) => [f.id, f]));
  const problems: string[] = [];
  const statusOf = new Map<string, FactStatus | null>();
  const seen = new Set<string>();
  for (const t of file.targets) {
    if (seen.has(t.id)) problems.push(`${t.id}: duplicate id`);
    seen.add(t.id);
    if (t.ruleSetId !== file.ruleSetId) problems.push(`${t.id}: rule set ${t.ruleSetId} in a ${file.ruleSetId} file`);
    let status: FactStatus | null = null;
    if (t.factId !== null) {
      const f = factById.get(t.factId);
      if (!f) problems.push(`${t.id}: fact row ${t.factId} not found`);
      else {
        status = f.status;
        if (f.domain !== 'measured-rate') problems.push(`${t.id}: fact row ${f.id} is domain ${f.domain}, not measured-rate`);
        if (f.level !== level && f.level !== 'both') problems.push(`${t.id}: fact row ${f.id} is level ${f.level}; a ${level} row may not use it (Q2.1.1)`);
        if (!factValueMatches(t, f)) problems.push(`${t.id}: target value ${JSON.stringify(t.value)} does not equal fact ${f.id} value ${JSON.stringify(f.value)}`);
      }
    } else if (!(Array.isArray(t.value) && t.value.length === 0) && t.kind !== 'ordering') {
      problems.push(`${t.id}: a row with no fact row must have an empty value (it prints MISSING SOURCE)`);
    }
    statusOf.set(t.id, status);
    problems.push(...targetTierProblems(t, status));
    try {
      const m = parseMeasure(t.filter);
      if (m.name === 'ordering') {
        if (t.kind !== 'ordering') problems.push(`${t.id}: measure ordering on a ${t.kind} row`);
        else for (const name of t.value as unknown[]) {
          if (typeof name !== 'string') { problems.push(`${t.id}: ordering value must list measure names`); break; }
          const sub = parseMeasure(name);
          if (!isKnownMeasure(sub.name)) problems.push(`${t.id}: ordering names unknown measure ${sub.name}`);
        }
      } else if (m.name !== 'none' && !isKnownMeasure(m.name)) problems.push(`${t.id}: unknown measure ${m.name}`);
      if (t.kind === 'quantiles' && m.name !== 'none' && (m.quantiles === null || (Array.isArray(t.value) && t.value.length > 0 && m.quantiles.length !== t.value.length))) {
        problems.push(`${t.id}: quantile row needs one quantile point per value`);
      }
    } catch (e) {
      problems.push(`${t.id}: ${(e as Error).message}`);
    }
  }
  return { file, statusOf, problems };
}
