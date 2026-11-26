// Lists every rule key a module's RULE_KEYS manifest reads that a rule set does not carry (B12.1.2).
// The phase 1 game cannot run on a rule set until this list is empty for it. Integrator-owned.
// Run: npx tsx scripts/rule-key-gaps.ts [out.md]
import { writeFileSync } from 'node:fs';
import * as core from '../packages/engine-core/src/index.ts';
import * as game from '../packages/engine-game/src/index.ts';
import * as officiating from '../packages/officiating/src/index.ts';
import { resolver } from '../packages/resolver-reference/src/index.ts';
import { resolveRuleSet } from '../packages/rules-data/src/index.ts';

type Manifest = readonly ({ key: string } | string)[];
const mods: Record<string, { RULE_KEYS: Manifest }> = { 'resolver-reference.resolver': resolver };
for (const [pk, ns] of Object.entries({ officiating, 'engine-core': core, 'engine-game': game })) {
  for (const [k, v] of Object.entries(ns as Record<string, unknown>)) {
    if (v !== null && typeof v === 'object' && 'RULE_KEYS' in v) mods[`${pk}.${k}`] = v as { RULE_KEYS: Manifest };
  }
}
const keyOf = (d: { key: string } | string) => (typeof d === 'string' ? d : d.key);
const lines: string[] = ['# Rule keys read by modules but missing from the rule sets', ''];
let total = 0;
const all = new Set<string>();
for (const id of ['pro_2026', 'college_2026']) {
  const have = new Set(resolveRuleSet(id).keys());
  lines.push(`## ${id}`, '');
  for (const [name, m] of Object.entries(mods)) {
    const want = m.RULE_KEYS.map(keyOf);
    const missing = want.filter((k) => !have.has(k));
    if (missing.length === 0) continue;
    total += missing.length;
    missing.forEach((k) => all.add(k));
    // Foul catalogue fields are listed once per foul id.
    const fouls = new Set<string>(), other: string[] = [];
    for (const k of missing) { const f = /^foul\.([a-z0-9_]+)\.[a-z_]+$/.exec(k); if (f) fouls.add(f[1]!); else other.push(k); }
    lines.push(`### ${name}: ${missing.length} of ${want.length} missing`, '');
    if (other.length) lines.push(...other.map((k) => `- ${k}`), '');
    if (fouls.size) lines.push(`Foul ids with missing catalogue fields (${fouls.size}): ${[...fouls].join(', ')}`, '');
  }
}
lines.splice(1, 0, '', `Distinct missing keys: ${all.size}. Module-by-rule-set gaps: ${total}. Made by scripts/rule-key-gaps.ts.`);
const text = lines.join('\n') + '\n';
const out = process.argv[2];
if (out) writeFileSync(out, text); else process.stdout.write(text);
console.error(`distinct missing keys: ${all.size}`);
process.exitCode = all.size === 0 ? 0 : 1;
