// The battery report (Q3.3.1): one page that says whether the football is still right. Every item is
// listed under every rule set it names. Blocking rules:
//   - a failed data-based item with basis status 2 of 3 or better blocks the parameter set;
//   - a failed 1 of 3 or convention-based item blocks it too, unless the battery owner recorded a
//     written reason and the item is sent to coach review (a waiver);
//   - an item that passes under one rule set and fails under the other is a failure;
//   - an item that did not run cannot pass: the battery is INCOMPLETE until every active item ran.
// Items are never deleted to pass. The text is byte-identical for the same results.
import { fmt } from '../../calibration/index.ts';
import { BATTERY_ITEMS, itemProblems, type BatteryItem } from './items.ts';
import { runItem, type ItemBinding, type ItemResult } from './paired.ts';

export interface Waiver { readonly itemId: string; readonly reason: string; readonly sentToCoachReview: boolean }

export type ItemVerdict = 'pass' | 'fail_blocking' | 'fail_waived' | 'not_run' | 'not_active';

export interface BatteryRow {
  readonly item: BatteryItem;
  readonly results: readonly ItemResult[];
  readonly verdict: ItemVerdict;
  /** Marks printed beside the row (Q3.3.1): provisional, convention-based, not reviewed. */
  readonly marks: readonly string[];
  readonly waiver: Waiver | null;
}

export type BatteryVerdict = 'pass' | 'blocked' | 'incomplete';

export interface BatteryReport {
  readonly parameterSetId: string;
  readonly masterSeedHex: string;
  readonly ruleSets: readonly string[];
  readonly rows: readonly BatteryRow[];
  readonly verdict: BatteryVerdict;
  readonly counts: Readonly<Record<'items' | 'passed' | 'blocking' | 'waived' | 'notRun' | 'notActive', number>>;
  readonly problems: readonly string[];
}

const STRONG = new Set(['Verified', '2 of 3', 'rule arithmetic']);

function marks(it: BatteryItem): string[] {
  const out: string[] = [];
  if (it.basisStatus !== 'Verified' && it.basisStatus !== 'rule arithmetic') out.push('provisional');
  if (it.basis === 'convention') { out.push('convention-based'); if (!it.coachReviewed) out.push('not reviewed'); }
  return out;
}

function verdictOf(it: BatteryItem, results: readonly ItemResult[], waiver: Waiver | null): ItemVerdict {
  if (it.state !== 'active') return 'not_active';
  if (results.some((r) => r.pass === false)) {
    const waivable = !(it.basis === 'data' && STRONG.has(it.basisStatus));
    return waivable && waiver !== null && waiver.reason.trim() !== '' && waiver.sentToCoachReview ? 'fail_waived' : 'fail_blocking';
  }
  return results.length > 0 && results.every((r) => r.pass === true) ? 'pass' : 'not_run';
}

export interface BatteryRunOptions {
  /** Identifies the parameter set, so the report regenerates from it (Q3.3.1 acceptance). */
  readonly parameterSetId: string;
  readonly masterSeedHex: string;
  readonly ruleSets: readonly string[];
  readonly bindings: readonly ItemBinding[];
  readonly waivers?: readonly Waiver[];
  readonly items?: readonly BatteryItem[];
  /** Only items of these leaves (R1.2.7 gate item 3 reads Q3.2.5 alone). */
  readonly leaves?: readonly string[];
}

export function runBattery(o: BatteryRunOptions): BatteryReport {
  const all = o.items ?? BATTERY_ITEMS;
  const items = o.leaves ? all.filter((it) => o.leaves!.includes(it.leaf)) : all;
  const bindingOf = new Map(o.bindings.map((b) => [b.itemId, b]));
  const problems = itemProblems(all);
  for (const b of o.bindings) if (!all.some((it) => it.id === b.itemId)) problems.push(`binding for unknown item ${b.itemId}`);
  for (const w of o.waivers ?? []) if (!all.some((it) => it.id === w.itemId)) problems.push(`waiver for unknown item ${w.itemId}`);
  const rows: BatteryRow[] = items.map((item) => {
    const results = o.ruleSets.filter((rs) => item.ruleSets.includes(rs)).map((rs) => runItem(item, bindingOf.get(item.id), rs, o.masterSeedHex));
    const waiver = (o.waivers ?? []).find((w) => w.itemId === item.id) ?? null;
    return { item, results, verdict: verdictOf(item, results, waiver), marks: marks(item), waiver };
  });
  const count = (v: ItemVerdict) => rows.filter((r) => r.verdict === v).length;
  const counts = { items: rows.length, passed: count('pass'), blocking: count('fail_blocking'), waived: count('fail_waived'), notRun: count('not_run'), notActive: count('not_active') };
  const verdict: BatteryVerdict = counts.blocking > 0 || problems.length > 0 ? 'blocked' : counts.notRun > 0 ? 'incomplete' : 'pass';
  return { parameterSetId: o.parameterSetId, masterSeedHex: o.masterSeedHex, ruleSets: o.ruleSets, rows, verdict, counts, problems };
}

const VERDICT_TEXT: Readonly<Record<ItemVerdict, string>> = { pass: 'PASS', fail_blocking: 'FAIL (blocks)', fail_waived: 'FAIL (waived with a written reason, sent to coach review)', not_run: 'NOT RUN', not_active: 'NOT ACTIVE' };

export function formatBatteryReport(rep: BatteryReport): string {
  const L: string[] = [];
  L.push(`Decision-response battery (Q3.3.1): parameter set ${rep.parameterSetId}; master seed ${rep.masterSeedHex}; rule sets ${rep.ruleSets.join(', ')}`);
  const c = rep.counts;
  L.push(`Verdict: ${rep.verdict === 'pass' ? 'PASS' : rep.verdict === 'blocked' ? 'BLOCKED' : 'INCOMPLETE (an item that did not run cannot pass)'}. Items ${c.items}: pass ${c.passed}, blocking failures ${c.blocking}, waived failures ${c.waived}, not run ${c.notRun}, not active ${c.notActive}.`);
  for (const p of rep.problems) L.push(`Problem: ${p}`);
  L.push('', 'item | leaf | kind | basis status | marks | rule set | measure | difference [low, high] (pairs) | result');
  for (const r of rep.rows) {
    const head = [r.item.id, r.item.leaf, r.item.kind, r.item.basisStatus, r.marks.join(', ') || '-'];
    if (r.results.length === 0) { L.push([...head, '-', '-', '-', VERDICT_TEXT[r.verdict]].join(' | ')); continue; }
    for (const res of r.results) {
      const diff = res.differences.length ? res.differences.map((d) => `${d.armA} - ${d.armB}: ${fmt(d.mean)} [${fmt(d.low)}, ${fmt(d.high)}] (${d.n})`).join('; ') : res.note ?? '-';
      const one = res.pass === null ? (res.state === 'not_active' ? 'NOT ACTIVE' : 'NOT RUN') : res.pass ? 'PASS' : 'FAIL';
      L.push([...head, res.ruleSetId, res.measure ?? '-', diff, one].join(' | '));
    }
    if (r.results.length > 1 || r.verdict === 'fail_waived') L.push(`  ${r.item.id} overall: ${VERDICT_TEXT[r.verdict]}${r.waiver ? `. Reason on record: ${r.waiver.reason}` : ''}`);
  }
  L.push('', 'Claims:');
  for (const r of rep.rows) L.push(`  ${r.item.id}: ${r.item.claim}. Basis: ${r.item.basisText}`);
  return L.join('\n') + '\n';
}
