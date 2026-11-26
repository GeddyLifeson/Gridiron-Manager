// Command line for the rule data build (see build.ts).
//   npx tsx packages/rules-data/test/tools/build-cli.ts            write the dictionary, both rule sets and facts/rule.json
//   npx tsx packages/rules-data/test/tools/build-cli.ts --locate   first re-find every quote in the rule book texts and
//                                                                  store the book's own wording and line in the authoring files
// The rule book texts are not in the repository (copyright). Set GM_NFL_RULEBOOK_TXT and GM_NCAA_RULEBOOK_TXT, or keep them
// at the project drive paths below.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FactFile, RuleKeyDef, RuleSetFile } from '@gm/schema';
import { build, expandFouls, locateQuote, bookFile, LEVELS, type AuthFoulsFile, type AuthKeysFile, type AuthSource, type Level } from './build.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const DATA = join(ROOT, 'packages/rules-data/data');
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const write = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 1) + '\n');

const keysPath = join(DATA, 'authoring/keys.json');
const foulsPath = join(DATA, 'authoring/fouls.json');
const keysFile: AuthKeysFile = read(keysPath);
const foulsFile: AuthFoulsFile = existsSync(foulsPath) ? read(foulsPath) : { dateRead: keysFile.dateRead, readBy: [], shared: {}, entries: [] };

function texts(): Partial<Record<Level, string>> {
  const candidates: Record<Level, string[]> = {
    pro: [process.env.GM_NFL_RULEBOOK_TXT ?? '', '/mnt/project-files/nfl-rules/rulebook_2026.txt'],
    college: [process.env.GM_NCAA_RULEBOOK_TXT ?? '', '/mnt/project-files/research/college/ncaa-rulebook-2026.txt'],
  };
  const out: Partial<Record<Level, string>> = {};
  for (const l of LEVELS) {
    const p = candidates[l].find((x) => x && existsSync(x));
    if (p) out[l] = readFileSync(p, 'utf8');
  }
  return out;
}

if (process.argv.includes('--locate')) {
  const t = texts();
  let bad = 0, n = 0;
  const fix = (l: Level, s: AuthSource, where: string) => {
    if (!s.q) return;
    const text = t[l];
    if (!text) throw new Error(`rule book text for ${l} not found (${bookFile(l)})`);
    const hit = locateQuote(text, s.q);
    n++;
    if (!hit) { bad++; console.log(`NOT FOUND ${where} [${l}]: ${s.q}`); return; }
    s.q = hit.quote; s.line = hit.line;
  };
  for (const k of keysFile.entries) for (const l of LEVELS) for (const s of k[l].src) fix(l, s, k.key);
  for (const [name, s] of Object.entries(foulsFile.shared)) fix(name.startsWith('nfl') ? 'pro' : 'college', s, `shared ${name}`);
  for (const f of foulsFile.entries) for (const l of LEVELS) {
    const side = f[l];
    if (side.q) { const s: AuthSource = { cite: side.cite ?? '', q: side.q }; fix(l, s, `foul ${f.id}`); side.q = s.q; side.line = s.line; }
    for (const list of Object.values(side.more ?? {})) for (const s of list ?? []) if (typeof s !== 'string') fix(l, s, `foul ${f.id}`);
  }
  console.log(`quotes located: ${n - bad}/${n}`);
  write(keysPath, keysFile);
  if (foulsFile.entries.length) write(foulsPath, foulsFile);
  if (bad) process.exit(1);
}

const out = build({
  keys: [...keysFile.entries, ...expandFouls(foulsFile)],
  dateRead: keysFile.dateRead,
  dictionary: (read(join(DATA, 'keys.json')).keys as unknown[]).map((k) => RuleKeyDef.parse(k)),
  files: { pro: RuleSetFile.parse(read(join(DATA, 'pro_2026.json'))), college: RuleSetFile.parse(read(join(DATA, 'college_2026.json'))) },
  facts: FactFile.parse(read(join(ROOT, 'facts/rule.json'))).rows,
});
for (const p of out.problems) console.log(`PROBLEM ${p}`);
if (out.problems.length) process.exit(1);
const dictFile = read(join(DATA, 'keys.json'));
write(join(DATA, 'keys.json'), { ...dictFile, keys: out.dictionary });
write(join(DATA, 'pro_2026.json'), out.files.pro);
write(join(DATA, 'college_2026.json'), out.files.college);
write(join(ROOT, 'facts/rule.json'), { domain: 'rule', rows: out.facts });
console.log(`dictionary ${out.dictionary.length} keys; pro ${out.files.pro.values.length}; college ${out.files.college.values.length}; fact rows ${out.facts.length}`);
