// Turns career reports into the run summary: findings grouped by code across seeds (how many careers hit each,
// the first seed to replay it with, the owner), worst kind first, plus career and stage totals.
import { FINDING_KINDS, type CareerReport, type Finding, type FindingKind } from './types.ts';

export interface FindingGroup {
  readonly kind: FindingKind;
  readonly area: string;
  readonly code: string;
  readonly message: string;
  readonly owner: string;
  readonly careers: number;
  readonly occurrences: number;
  readonly firstSeed: string;
  readonly firstSeason: number | null;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface RunSummary {
  readonly careers: number;
  readonly reachedProHead: number;
  readonly seasons: number;
  readonly games: number;
  readonly crashedCareers: number;
  readonly byKind: Readonly<Record<FindingKind, number>>;
  readonly groups: readonly FindingGroup[];
  readonly stageMs: Readonly<Record<string, number>>;
  readonly ms: number;
}

export function summarise(reports: readonly CareerReport[]): RunSummary {
  const groups = new Map<string, { g: FindingGroup; seeds: Set<string> }>();
  const stageMs: Record<string, number> = {};
  for (const r of reports) {
    for (const s of r.stages) stageMs[s.area] = (stageMs[s.area] ?? 0) + s.ms;
    for (const f of r.findings) {
      const key = `${f.area}|${f.code}`;
      const n = (f.detail?.['count'] as number | undefined) ?? 1;
      const cur = groups.get(key);
      if (cur) { cur.seeds.add(f.seedHex); groups.set(key, { g: { ...cur.g, careers: cur.seeds.size, occurrences: cur.g.occurrences + n }, seeds: cur.seeds }); }
      else groups.set(key, { g: groupOf(f, n), seeds: new Set([f.seedHex]) });
    }
  }
  const order = (k: FindingKind) => FINDING_KINDS.indexOf(k);
  const list = [...groups.values()].map((x) => x.g).sort((a, b) => order(a.kind) - order(b.kind) || b.careers - a.careers || a.code.localeCompare(b.code));
  const byKind = Object.fromEntries(FINDING_KINDS.map((k) => [k, list.filter((g) => g.kind === k).length])) as Record<FindingKind, number>;
  return {
    careers: reports.length,
    reachedProHead: reports.filter((r) => r.reachedProHead).length,
    seasons: reports.reduce((n, r) => n + r.seasons, 0),
    games: reports.reduce((n, r) => n + r.games, 0),
    crashedCareers: reports.filter((r) => r.findings.some((f) => f.kind === 'crash')).length,
    byKind, groups: list, stageMs,
    ms: reports.reduce((n, r) => n + r.ms, 0),
  };
}

function groupOf(f: Finding, n: number): FindingGroup {
  const { count: _c, ...detail } = (f.detail ?? {}) as Record<string, unknown>;
  return {
    kind: f.kind, area: f.area, code: f.code, message: f.message, owner: f.owner, careers: 1, occurrences: n, firstSeed: f.seedHex, firstSeason: f.season,
    ...(Object.keys(detail).length ? { detail } : {}),
  };
}

export function formatSummary(s: RunSummary, meta: { readonly command: string; readonly script: string }): string {
  const L: string[] = [];
  L.push('# Headless career playtest', '');
  L.push(`Command: \`${meta.command}\``, '');
  L.push(`Careers: ${s.careers} (script ${meta.script}). Reached a pro head job: ${s.reachedProHead}. Seasons: ${s.seasons}. Game days played through the console: ${s.games}. Careers with a crash: ${s.crashedCareers}. CPU time: ${(s.ms / 1000).toFixed(1)} s.`, '');
  L.push(`Finding groups by kind: ${FINDING_KINDS.map((k) => `${k} ${s.byKind[k]}`).join(', ')}.`, '');
  L.push('Stage time (s): ' + Object.entries(s.stageMs).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`).join(', '), '');
  for (const k of FINDING_KINDS) {
    const gs = s.groups.filter((g) => g.kind === k);
    if (!gs.length) continue;
    L.push(`## ${k} (${gs.length})`, '');
    for (const g of gs) {
      L.push(`- **${g.area} / ${g.code}**: ${g.message}`);
      L.push(`  - ${g.careers} of ${s.careers} careers, ${g.occurrences} times. Replay: seed \`${g.firstSeed}\`${g.firstSeason === null ? '' : `, season ${g.firstSeason}`}. Owner: ${g.owner}.`);
      if (g.detail) L.push(`  - Detail: \`${JSON.stringify(g.detail).slice(0, 400)}\``);
    }
    L.push('');
  }
  return L.join('\n');
}
