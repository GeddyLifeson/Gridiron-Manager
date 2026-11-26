// WP-24 diff report in words (Q1.3.2 outputs): count and share changed, the changed plays with their
// first tick and contest, and the shift per target row.
import type { DiffReport } from './run.ts';

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const num = (x: number | null, d = 3): string => (x === null ? '-' : x.toFixed(d));
const label = (b: DiffReport['base']): string => {
  const o = Object.entries(b.variant.paramOverrides ?? {}).map(([k, v]) => `${k}=${v}`).join(', ');
  return `${b.variant.label} (${b.resolverVersion}${o ? `; ${o}` : ''})`;
};

export function formatDiffReport(r: DiffReport, opts: { maxPlays?: number } = {}): string {
  const max = opts.maxPlays ?? 50;
  const L: string[] = [];
  L.push(`# Diff report (Q1.3.2)`, '');
  L.push(`Rule set ${r.ruleSetId}, master seed ${r.masterSeedHex}.`);
  L.push(`Base: ${label(r.base)}. Variant: ${label(r.variant)}.`, '');
  L.push(`Games: ${r.games.length} run, ${r.gamesChanged} with a different event log.`);
  L.push(`Plays replayed in isolation: ${r.plays.compared}; changed ${r.plays.changed} (${pct(r.plays.share)}).`);
  L.push(`Play-by-play comparison meaningful: ${r.playByPlayMeaningful ? 'yes' : 'no'}.`);
  for (const n of r.notes) L.push(`- NOTE: ${n}`);
  L.push('', '## Changed plays by call', '', '| call | compared | changed | share |', '|---|---:|---:|---:|');
  for (const [call, c] of Object.entries(r.plays.byCall).sort(([a], [b]) => (a < b ? -1 : 1))) {
    L.push(`| ${call} | ${c.compared} | ${c.changed} | ${pct(c.compared ? c.changed / c.compared : 0)} |`);
  }
  L.push('', '## Changed plays by contest responsible', '');
  const cs = Object.entries(r.plays.byContest).sort(([, a], [, b]) => b - a);
  if (!cs.length) L.push('None.');
  for (const [c, n] of cs) L.push(`- ${c}: ${n}`);
  L.push('', `## Changed plays (first ${Math.min(max, r.plays.list.length)} of ${r.plays.list.length})`, '');
  if (r.plays.list.length) {
    L.push('| game | play | call | first tick | from | first differing event (base / variant) | contest | dead ball (base / variant) |', '|---:|---:|---|---:|---|---|---|---|');
    for (const p of r.plays.list.slice(0, max)) {
      L.push(`| ${p.gameIndex} | ${p.playNumber} | ${p.call} | ${p.firstTick ?? '-'} | ${p.tickSource} | ${p.baseEvent ?? '-'} / ${p.variantEvent ?? '-'} | ${p.contest ?? '-'} (${p.contestSource}) | ${p.baseDeadBall ?? '-'} / ${p.variantDeadBall ?? '-'} |`);
    }
  } else L.push('None.');
  L.push('', '## Games', '', '| game | seed | same events | first changed play | base score | variant score |', '|---:|---|---|---:|---|---|');
  for (const g of r.games) {
    L.push(`| ${g.index} | ${g.seedHex} | ${g.sameEvents ? 'yes' : 'no'} | ${g.firstChangedPlay ?? '-'} | ${g.baseScore.join('-')} | ${g.variantScore.join('-')} |`);
  }
  if (r.distribution) {
    L.push('', '## Distribution shift per target row', '', '| filter | base n | variant n | base mean | variant mean | delta | z | shifted |', '|---|---:|---:|---:|---:|---:|---:|---|');
    for (const d of r.distribution) {
      L.push(`| ${d.filter} | ${d.baseN} | ${d.variantN} | ${num(d.baseMean)} | ${num(d.variantMean)} | ${num(d.delta)} | ${num(d.z, 2)} | ${d.note ? d.note : d.shifted ? 'yes' : 'no'} |`);
    }
  }
  return L.join('\n') + '\n';
}
