// Groups break-test findings across seeds and targets and writes the report: one row per (target, code) with
// how many seeds hit it, a shrunk repro, and the owner who gets the fix.
import { toJson } from './hostile.ts';
import { KINDS, type Finding, type TargetReport } from './types.ts';

export interface Grouped {
  readonly kind: Finding['kind'];
  readonly target: string;
  readonly code: string;
  readonly message: string;
  readonly owner: string;
  readonly seeds: readonly string[];
  readonly count: number;
  readonly repro: Finding['repro'] | null;
  readonly reproSeed: string | null;
  readonly detail: Finding['detail'] | null;
}

export function group(reports: readonly TargetReport[]): Grouped[] {
  const m = new Map<string, { f: Finding; seeds: Set<string>; count: number; best: Finding | null }>();
  for (const r of reports) for (const f of r.findings) {
    const key = `${f.target}|${f.kind}|${f.code}`;
    const g = m.get(key) ?? { f, seeds: new Set<string>(), count: 0, best: null };
    g.seeds.add(f.seedHex);
    g.count += f.count;
    if (f.repro && (!g.best?.repro || f.repro.length < g.best.repro.length)) g.best = f;
    m.set(key, g);
  }
  return [...m.values()].map(({ f, seeds, count, best }) => ({
    kind: f.kind, target: f.target, code: f.code, message: f.message, owner: f.owner, seeds: [...seeds].sort(), count,
    repro: best?.repro ?? null, reproSeed: best?.seedHex ?? null, detail: (best ?? f).detail ?? null,
  })).sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.target.localeCompare(b.target) || b.seeds.length - a.seeds.length || a.code.localeCompare(b.code));
}

export interface RunMeta { readonly commit: string; readonly seeds: readonly string[]; readonly steps: number; readonly targets: readonly string[]; readonly ms: number }

export function markdown(meta: RunMeta, reports: readonly TargetReport[]): string {
  const g = group(reports);
  const lines: string[] = [];
  lines.push('# Break test report', '');
  lines.push(`Commit ${meta.commit}. ${meta.seeds.length} seeds x ${meta.steps} steps on ${meta.targets.length} targets (${meta.targets.join(', ')}), ${(meta.ms / 1000).toFixed(1)} s.`, '');
  lines.push('| Target | Steps | Accepted | Refused | Reloads | Findings |', '|---|---|---|---|---|---|');
  const byTarget = new Map<string, TargetReport[]>();
  for (const r of reports) byTarget.set(r.target, [...(byTarget.get(r.target) ?? []), r]);
  for (const [t, rs] of byTarget) {
    const sum = (k: 'steps' | 'accepted' | 'refused' | 'reloads') => rs.reduce((s, r) => s + r[k], 0);
    lines.push(`| ${t} | ${sum('steps')} | ${sum('accepted')} | ${sum('refused')} | ${sum('reloads')} | ${g.filter((x) => x.target === t && x.kind !== 'unreachable').length} |`);
  }
  lines.push('');
  const counts = KINDS.map((k) => `${k} ${g.filter((x) => x.kind === k).length}`).join(', ');
  lines.push(`Findings by kind: ${counts}.`, '');
  for (const kind of KINDS) {
    const rows = g.filter((x) => x.kind === kind);
    if (!rows.length) continue;
    lines.push(`## ${kind}`, '');
    for (const x of rows) {
      lines.push(`### ${x.target}: \`${x.code}\``, '');
      lines.push(`${x.message}`, '');
      lines.push(`- Seeds: ${x.seeds.length} of ${meta.seeds.length}; times seen: ${x.count}. Owner: ${x.owner}.`);
      if (x.detail && Object.keys(x.detail).length && !('stack' in x.detail)) lines.push(`- Detail: \`${JSON.stringify(x.detail).slice(0, 300)}\``);
      if (x.detail && 'stack' in x.detail) lines.push('', '```', String(x.detail['stack']).slice(0, 800), '```');
      if (x.repro) lines.push(`- Repro (seed ${x.reproSeed}, ${x.repro.length} actions): \`${JSON.stringify(toJson(x.repro.map((a) => ({ kind: a.kind, args: a.args })))).slice(0, 600)}\``);
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function jsonReport(meta: RunMeta, reports: readonly TargetReport[]): unknown {
  return toJson({ meta, groups: group(reports), runs: reports.map((r) => ({ ...r, findings: r.findings.length })) });
}
