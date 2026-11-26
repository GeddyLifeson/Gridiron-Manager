// The checks phase gate items run (R1.2.3 to R1.2.6). Each returns a status and the evidence it read.
// PASS only when the check ran here and held. PROVISIONAL: it ran, but the facts it compares to are not at
// three sources (Q6, masterclaude rule 10), so the gate cannot be called passed. NOT_RUN: the runner exists but
// has nothing bound to run. MISSING: no runner or module yet. FAIL: ran and failed.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realGame, seasonGate } from '@gm/headless';
import { computeStatus, type FactRow } from '@gm/schema';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const STATUSES = ['PASS', 'FAIL', 'PROVISIONAL', 'NOT_RUN', 'MISSING', 'NOT_BLOCKING'] as const;
export type Status = (typeof STATUSES)[number];
export interface CheckResult { readonly status: Status; readonly evidence: string; readonly levels?: Readonly<Record<string, Status>> }
export interface RunContext { readonly quick: boolean; readonly ruleSets: readonly string[] }

/** Runs vitest on the given files; PASS when every test passes. */
export function vitest(files: readonly string[]): CheckResult {
  const r = spawnSync('npx', ['vitest', 'run', ...files], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const out = `${r.stdout}\n${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, '');
  const line = (out.match(/^\s*Tests\s+.*$/m)?.[0] ?? 'no test summary').trim();
  return { status: r.status === 0 ? 'PASS' : 'FAIL', evidence: `vitest ${files.join(' ')}: ${line}` };
}

/** Runs a command; PASS on exit 0. The last lines are the evidence. */
export function command(args: readonly string[], label: string): CheckResult {
  const r = spawnSync('npx', ['tsx', ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const tail = `${r.stdout}\n${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, '').trim().split('\n').filter(Boolean).slice(-2).join(' / ');
  return { status: r.status === 0 ? 'PASS' : 'FAIL', evidence: `${label}: exit ${r.status}; ${tail.slice(0, 300)}` };
}

/** Q3 battery items of the given leaves, at every rule set asked for. NOT_RUN while no binding is admitted. */
export function battery(leaves: readonly string[], ctx: RunContext): CheckResult {
  const items = seasonGate.BATTERY_ITEMS.filter((i) => leaves.includes(i.leaf));
  const oneLevel = items.filter((i) => !ctx.ruleSets.every((rs) => i.ruleSets.includes(rs)));
  const rep = seasonGate.runBattery({ parameterSetId: 'phase-gates', masterSeedHex: '00000000a11ce000', ruleSets: ctx.ruleSets, bindings: seasonGate.ADMITTED_BINDINGS, leaves });
  const levels: Record<string, Status> = {};
  for (const rs of ctx.ruleSets) {
    const res = rep.rows.flatMap((r) => r.results.filter((x) => x.ruleSetId === rs));
    levels[rs] = res.length === 0 || res.some((x) => x.pass === null) ? 'NOT_RUN' : res.every((x) => x.pass) ? 'PASS' : 'FAIL';
  }
  const status: Status = oneLevel.length ? 'FAIL' : rep.verdict === 'pass' ? 'PASS' : rep.verdict === 'blocked' ? 'FAIL' : 'NOT_RUN';
  const needs = leaves.map((l) => `${l}: ${seasonGate.BINDING_NEEDS[l] ?? '?'}`).join('; ');
  return {
    status, levels,
    evidence: `${items.length} items (${leaves.join(', ')}), every one tagged ${oneLevel.length ? `NOT both levels: ${oneLevel.map((i) => i.id).join(', ')}` : 'pro and college'}; battery ${rep.verdict}: pass ${rep.counts.passed}, not run ${rep.counts.notRun}, blocking ${rep.counts.blocking}, bindings admitted ${seasonGate.ADMITTED_BINDINGS.length}. Waiting for ${needs}`,
  };
}

type Row = FactRow & { readonly statement: string; readonly level: string; readonly validFor?: string };
function factRows(file: string): Row[] {
  const d = JSON.parse(readFileSync(join(ROOT, 'facts', file), 'utf8')) as { rows?: Row[]; facts?: Row[] } | Row[];
  return Array.isArray(d) ? d : d.rows ?? d.facts ?? [];
}
const MODERN = (r: Row) => /20(1[8-9]|2\d)/.test(r.validFor ?? r.statement);

/** Fact rows a gate compares to: PASS when every one computes Verified, else PROVISIONAL, listing the short ones. */
export function factsAtThree(file: string, match: RegExp, label: string): CheckResult & { rows: Row[] } {
  const rows = factRows(file).filter((r) => match.test(r.statement) && MODERN(r));
  if (!rows.length) return { status: 'MISSING', evidence: `${label}: no modern rows in facts/${file}`, rows };
  const st = rows.map((r) => ({ r, s: computeStatus(r) }));
  const short = st.filter((x) => x.s !== 'Verified');
  const levels: Record<string, Status> = {};
  for (const lvl of ['pro', 'college']) {
    const at = st.filter((x) => x.r.level === lvl);
    levels[lvl] = at.length === 0 ? 'MISSING' : at.every((x) => x.s === 'Verified') ? 'PASS' : 'PROVISIONAL';
  }
  const anyMissing = Object.values(levels).includes('MISSING');
  return {
    status: short.length ? 'PROVISIONAL' : anyMissing ? 'MISSING' : 'PASS', levels, rows,
    evidence: `${label}: ${rows.length} modern rows in facts/${file}, ${rows.length - short.length} Verified (3 sources). Short: ${short.slice(0, 8).map((x) => `${x.r.id} ${x.s}`).join(', ')}${short.length > 8 ? ` and ${short.length - 8} more` : ''}${anyMissing ? `. No rows at all for: ${Object.entries(levels).filter(([, v]) => v === 'MISSING').map(([k]) => k).join(', ')}` : ''}`,
  };
}

/** Fourth-down decision mix and two-point share of the deciders real games use, from N games per level. */
export function aiDecisionRates(ctx: RunContext): CheckResult {
  const games = ctx.quick ? 20 : 200;
  const parts: string[] = [];
  for (const rs of ctx.ruleSets) {
    const rg = realGame.createRealGame(rs);
    let fourth = 0, go = 0, punt = 0, fg = 0, tries = 0, two = 0;
    for (let g = 0; g < games; g++) {
      const res = rg.simulate(rg.input(g, (0xd00d0000n + BigInt(g)).toString(16).padStart(16, '0')));
      for (const rec of res.records) {
        const s = rec.situation;
        const call = rec.calls.snapping as { unit: string; kickKind?: string };
        if (s.playKind === 'scrimmage' && s.down === 4) {
          fourth++;
          if (call.unit === 'offense') go++; else if (call.kickKind === 'punt') punt++; else if (call.kickKind === 'field_goal') fg++;
        }
        if (s.playKind === 'try') { tries++; if (call.unit === 'offense') two++; }
      }
    }
    const pct = (a: number, b: number) => (b ? (a / b).toFixed(3) : '-');
    parts.push(`${rs}: ${games} games, fourth downs ${fourth}: go ${pct(go, fourth)}, punt ${pct(punt, fourth)}, field goal ${pct(fg, fourth)}; tries ${tries}, two-point share ${pct(two, tries)}`);
  }
  return {
    status: 'NOT_RUN',
    evidence: `Measured with the calibration chart caller, the only decider real games run: ${parts.join('. ')}. The gate asks for coach AI (K4, K5) decision rates; no real game binds the coach AI as a decider yet, so these rates are context, not the gate measure.`,
  };
}

export function missing(why: string): CheckResult { return { status: 'MISSING', evidence: why }; }
