// Phase 0 lints, one entry point: npm run lint
//   P1.2.1  workspace packages match the table, each has a readme
//   P1.2.2  dependency lint: allowed imports only, entry points only, no core->app/tool, no cycles
//   P1.1.1  core purity: no clock, platform random, file, network, display, locale, transcendental math
//   P1.1.2  no level words in core conditionals; no numeric literals in officiating and league
//   Q1.2.1  forbidden keys in schemas and data (coach points, xp, skill trees, perks, traits, difficulty)
//   Q6.2.1  every rule value points at a register row with the same value; rule rows at least
//           "Rulebook only" (Q6.3.1); stored status equals computed status (Q6.1.2); quotes re-found
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';
import { allSchemas, scanForbiddenKeys, scanForbiddenJson, FactFile, computeStatus, ruleStatusShippable, type FactRow, type FactStatus, type RuleSetFile } from '@gm/schema';
import { RULE_SET_FILES, validateRuleSetFile, KEY_DICTIONARY } from '@gm/rules-data';
import { stripCommentsAndStrings, importSpecifiers, lineOf } from './source-scan.ts';

interface PkgInfo { kind: 'core' | 'app' | 'tool'; mayImport: string[] }
export interface LintProblem { rule: string; file: string; line?: number; message: string }

const CORE_ALLOWED_EXTERNAL: Record<string, string[]> = { schema: ['zod'] };
const APP_ALLOWED_EXTERNAL: Record<string, string[]> = {
  store: ['sql.js'],
  'app-services': [],
  'app-ui': ['react', 'react-dom'],
  headless: ['sql.js', 'node:'],
  tools: ['node:', 'sql.js'],
};

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules' && f !== 'fixtures') walk(p, out); }
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

export function loadPackageMap(root: string): Record<string, PkgInfo> {
  return JSON.parse(readFileSync(join(root, 'packages/tools/package-map.json'), 'utf8')).packages;
}

function allowedTargets(name: string, map: Record<string, PkgInfo>): Set<string> {
  const info = map[name]!;
  const out = new Set<string>();
  for (const t of info.mayImport) {
    if (t === '@core') Object.entries(map).filter(([, v]) => v.kind === 'core').forEach(([k]) => out.add(k));
    else if (t === '@any') Object.keys(map).forEach((k) => out.add(k));
    else out.add(t.replace(':public', ''));
  }
  out.delete(name);
  return out;
}

export function lintDependencies(root: string, map = loadPackageMap(root)): LintProblem[] {
  const problems: LintProblem[] = [];
  const graph = new Map<string, Set<string>>();
  for (const name of Object.keys(map)) {
    const info = map[name]!;
    const allowed = allowedTargets(name, map);
    const edges = new Set<string>();
    graph.set(name, edges);
    const pkgDir = join(root, 'packages', name);
    for (const file of [...walk(join(pkgDir, 'src')), ...walk(join(pkgDir, 'test'))]) {
      const isTest = file.includes(`${sep}test${sep}`);
      const rel = relative(root, file);
      const src = readFileSync(file, 'utf8');
      for (const { spec, line } of importSpecifiers(src)) {
        if (spec.startsWith('.')) {
          const target = resolve(dirname(file), spec);
          if (!target.startsWith(pkgDir + sep)) problems.push({ rule: 'P1.2.2 internal files', file: rel, line, message: `relative import ${spec} leaves package ${name}; import the other package's entry point` });
          continue;
        }
        if (spec.startsWith('@gm/')) {
          const [, target, ...deep] = spec.split('/');
          if (!target || !map[target]) { problems.push({ rule: 'P1.2.2 unknown package', file: rel, line, message: `${spec} is not in the package table` }); continue; }
          if (deep.length) problems.push({ rule: 'P1.2.2 internal files', file: rel, line, message: `${spec} reaches inside ${target}; only its entry point may be imported` });
          if (target === name) continue;
          const t = map[target]!;
          if (info.kind === 'core' && t.kind !== 'core') problems.push({ rule: 'P1.2.2 core imports app/tool', file: rel, line, message: `core package ${name} may not import ${t.kind} package ${target}` });
          if (!allowed.has(target) && !isTest) problems.push({ rule: 'P1.2.1 may-import', file: rel, line, message: `${name} may not import ${target} (allowed: ${[...allowed].sort().join(', ') || 'nothing'})` });
          if (!isTest) edges.add(target);
          continue;
        }
        // External module.
        if (isTest && (spec === 'vitest' || spec.startsWith('node:') || spec === 'fast-check' || spec === 'zod' || spec === 'sql.js')) continue;
        const ext = info.kind === 'core' ? (CORE_ALLOWED_EXTERNAL[name] ?? []) : (APP_ALLOWED_EXTERNAL[name] ?? []);
        const ok = ext.some((e) => (e.endsWith(':') ? spec.startsWith(e) : spec === e || spec.startsWith(`${e}/`)));
        if (!ok) problems.push({ rule: info.kind === 'core' ? 'P1.1.1 core external import' : 'P1.2.2 external import', file: rel, line, message: `${name} may not import external module ${spec}` });
      }
    }
  }
  // Cycles.
  const state = new Map<string, number>();
  const stack: string[] = [];
  const visit = (n: string) => {
    state.set(n, 1); stack.push(n);
    for (const m of graph.get(n) ?? []) {
      if (state.get(m) === 1) problems.push({ rule: 'P1.2.2 cycle', file: `packages/${n}`, message: `import cycle: ${[...stack.slice(stack.indexOf(m)), m].join(' -> ')}` });
      else if (!state.get(m)) visit(m);
    }
    stack.pop(); state.set(n, 2);
  };
  for (const n of graph.keys()) if (!state.get(n)) visit(n);
  return problems;
}

const BANNED_CORE: { re: RegExp; what: string }[] = [
  { re: /\bMath\.random\b/, what: 'platform random (use J13 streams)' },
  { re: /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|exp|expm1|log|log2|log10|log1p|pow|cbrt|hypot|sinh|cosh|tanh|asinh|acosh|atanh)\b/, what: 'platform transcendental math (use engine dmath)' },
  { re: /\*\*/, what: 'exponent operator (use dPow or multiplication)' },
  { re: /\bDate\b/, what: 'wall clock' },
  { re: /\bperformance\./, what: 'wall clock' },
  { re: /\b(setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame)\b/, what: 'timers' },
  { re: /\b(fetch|XMLHttpRequest|WebSocket)\b/, what: 'network' },
  { re: /(?<![.\w$])(window|document|navigator|localStorage|sessionStorage|indexedDB)\b(?!\s*[:?]\s)/, what: 'display or browser storage' },
  { re: /\bprocess\./, what: 'process environment' },
  { re: /\bIntl\b|\.toLocale\w*\(/, what: 'locale' },
  { re: /\bcrypto\./, what: 'platform random' },
  { re: /\brequire\(/, what: 'dynamic module loading' },
];

export function lintCorePurity(root: string, map = loadPackageMap(root)): LintProblem[] {
  const problems: LintProblem[] = [];
  for (const [name, info] of Object.entries(map)) {
    if (info.kind !== 'core') continue;
    for (const file of walk(join(root, 'packages', name, 'src'))) {
      const rel = relative(root, file);
      const code = stripCommentsAndStrings(readFileSync(file, 'utf8'));
      for (const { re, what } of BANNED_CORE) {
        const g = new RegExp(re.source, 'g');
        let m: RegExpExecArray | null;
        while ((m = g.exec(code))) {
          // dmath may call Math.sqrt (correctly rounded); nothing else.
          problems.push({ rule: 'P1.1.1 core purity', file: rel, line: lineOf(code, m.index), message: `${m[0]}: ${what}` });
        }
      }
      // P1.1.2 acceptance 2: no level words in a conditional.
      const lvl = /(===|!==|==|!=)\s*['"](college|pro|nfl|ncaa)['"]|['"](college|pro|nfl|ncaa)['"]\s*(===|!==|==|!=)|\bcase\s+['"](college|pro|nfl|ncaa)['"]|\bif\s*\([^)]*\b(college|NFL|NCAA)\b/gi;
      const raw = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      let m: RegExpExecArray | null;
      while ((m = lvl.exec(raw))) problems.push({ rule: 'P1.1.2 level word in conditional', file: rel, line: lineOf(raw, m.index), message: `${m[0]}: branch on a rule key, never on a level (P1.3.3)` });
      if (name === 'officiating' || name === 'league') {
        const lit = /(?<![\w.$\]])(?:\d+\.\d+|[2-9]\d*|1\d+)(?![\w.])/g;
        while ((m = lit.exec(code))) problems.push({ rule: 'P1.1.2 numeric literal', file: rel, line: lineOf(code, m.index), message: `${m[0]}: football numbers live in rule-set or config files with a register id` });
      }
    }
  }
  return problems;
}

/**
 * PV-01 (presentation-build-plan section 6, MB-16, J13.4.1): sound and visual variety draw only from the seeded
 * cosmetic streams in app-services (`cosmetic.display`, `cosmetic.audio`), so presentation can never change a
 * game result and film replays repeat. Two checks:
 *   1. app-ui and app-services may not call the platform's random (Math.random, crypto random). The one
 *      allowed use is fresh entropy for a new world's seed (J13.4.1), marked on the line or the line above with
 *      `allow-platform-random: J13.4.1`.
 *   2. No core package names the cosmetic stream: the flow is one way, presentation reads game state, never
 *      the reverse.
 */
export const PRESENTATION_RANDOM_PACKAGES: readonly string[] = ['app-ui', 'app-services'];
const PLATFORM_RANDOM: { re: RegExp; what: string }[] = [
  { re: /\bMath\s*\.\s*random\b/, what: 'platform random' },
  { re: /\b(getRandomValues|randomUUID|randomBytes|randomInt|randomFillSync|randomFill)\b/, what: 'platform crypto random' },
];
const PLATFORM_RANDOM_PRAGMA = /allow-platform-random:\s*J13\.4\.1/;

export function lintPresentationRandom(root: string, map = loadPackageMap(root)): LintProblem[] {
  const problems: LintProblem[] = [];
  for (const name of PRESENTATION_RANDOM_PACKAGES) {
    if (!map[name]) continue;
    for (const file of walk(join(root, 'packages', name, 'src'))) {
      const rel = relative(root, file);
      const raw = readFileSync(file, 'utf8');
      const rawLines = raw.split('\n');
      const code = stripCommentsAndStrings(raw);
      for (const { re, what } of PLATFORM_RANDOM) {
        const g = new RegExp(re.source, 'g');
        let m: RegExpExecArray | null;
        while ((m = g.exec(code))) {
          const line = lineOf(code, m.index);
          const here = rawLines[line - 1] ?? '', above = rawLines[line - 2] ?? '';
          if (PLATFORM_RANDOM_PRAGMA.test(here) || PLATFORM_RANDOM_PRAGMA.test(above)) continue;
          problems.push({ rule: 'PV-01 no platform random in presentation', file: rel, line, message: `${m[0]}: ${what}; draw from the cosmetic streams (app-services cosmetic) instead` });
        }
      }
    }
  }
  for (const [name, info] of Object.entries(map)) {
    if (info.kind !== 'core') continue;
    for (const file of walk(join(root, 'packages', name, 'src'))) {
      const raw = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (x) => x.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/.*$/gm, '$1');
      const re = /['"`]cosmetic(?:['"`.])/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(raw))) problems.push({ rule: 'PV-01 core reads a cosmetic stream', file: relative(root, file), line: lineOf(raw, m.index), message: `${m[0]}: the cosmetic streams are presentation only (J13.2.1 A-2)` });
    }
  }
  return problems;
}

/**
 * D6.5.1 / O6.5.1 rule 2 (ruling MA-48): no UI code path renders a projected number or range. The scouting
 * module keeps its projection maths (`project`, the band helpers, the projection noise) for AI and world
 * code; the UI layer (app packages that build or render read models, and the shells) may show only assigned
 * grades (`gradeCells`, `formatGrade`) and potential words (`potentialRead`). This flags any use of the
 * internal names, by import or by namespace, and any read of a projection's mean or variance.
 */
export const PROJECTION_INTERNALS: readonly string[] = [
  'project', 'Projection', 'band', 'halfWidth', 'arrowFor', 'hunchStrength', 'ceilingLookVariance', 'projectionLookSd', 'linearToPeak',
];
const UI_LAYER_EXCLUDED = new Set(['store']);

function uiLayerFiles(root: string, map: Record<string, PkgInfo>): string[] {
  const files: string[] = [];
  for (const [name, info] of Object.entries(map)) {
    if (info.kind !== 'app' || UI_LAYER_EXCLUDED.has(name)) continue;
    walk(join(root, 'packages', name, 'src'), files);
  }
  const shells = join(root, 'shells');
  if (existsSync(shells)) for (const d of readdirSync(shells)) walk(join(shells, d, 'src'), files);
  return files;
}

export function lintUiProjection(root: string, map = loadPackageMap(root)): LintProblem[] {
  const problems: LintProblem[] = [];
  const names = PROJECTION_INTERNALS.join('|');
  const ns = new RegExp(`\\bscouting\\s*\\.\\s*(${names})\\b`, 'g');
  const field = /\bprojection\s*\??\.\s*(mean|variance)\b/gi;
  const internal = new Set(PROJECTION_INTERNALS);
  for (const file of uiLayerFiles(root, map)) {
    const rel = relative(root, file);
    const raw = readFileSync(file, 'utf8');
    // Comments removed but strings kept: screens build text in template literals, and `${...}` inside one
    // is code (stripCommentsAndStrings would hide it).
    const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, (x) => x.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/.*$/gm, '$1');
    const rule = 'D6.5.1 no projected number in UI';
    let m: RegExpExecArray | null;
    while ((m = ns.exec(noComments))) problems.push({ rule, file: rel, line: lineOf(noComments, m.index), message: `${m[0]}: projection internals stay out of the UI layer; show potentialRead words (MA-48)` });
    while ((m = field.exec(noComments))) problems.push({ rule, file: rel, line: lineOf(noComments, m.index), message: `${m[0]}: a projected number may not reach a screen (MA-48)` });
    const imp = /\b(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
    while ((m = imp.exec(noComments))) {
      const spec = m[2]!;
      if (!/^@gm\/(people|app-services)\b/.test(spec) && !/scouting/.test(spec)) continue;
      for (const part of m[1]!.split(',')) {
        const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim();
        if (internal.has(name)) problems.push({ rule, file: rel, line: lineOf(noComments, m.index), message: `imports ${name} from ${spec}: projection internals stay out of the UI layer (MA-48)` });
      }
    }
  }
  return problems;
}

export function lintPackageTable(root: string, map = loadPackageMap(root)): LintProblem[] {
  const problems: LintProblem[] = [];
  const dirs = readdirSync(join(root, 'packages')).filter((d) => statSync(join(root, 'packages', d)).isDirectory());
  for (const d of dirs) if (!map[d]) problems.push({ rule: 'P1.2.1 package table', file: `packages/${d}`, message: 'package is not in the P1.2.1 table' });
  for (const k of Object.keys(map)) {
    if (!dirs.includes(k)) problems.push({ rule: 'P1.2.1 package table', file: `packages/${k}`, message: 'package in the table is missing from the workspace' });
    else if (!existsSync(join(root, 'packages', k, 'README.md'))) problems.push({ rule: 'P1.2.1 package table', file: `packages/${k}`, message: 'package has no README naming its bible categories' });
  }
  return problems;
}

function dataFiles(root: string): string[] {
  const out: string[] = [];
  for (const d of ['packages/rules-data/data', 'packages/engine-game/data', 'packages/league/data', 'facts']) {
    const p = join(root, d);
    if (existsSync(p)) for (const f of readdirSync(p)) if (f.endsWith('.json')) out.push(join(p, f));
  }
  return out;
}

export function lintForbiddenKeys(root: string): LintProblem[] {
  const problems: LintProblem[] = scanForbiddenKeys(allSchemas()).map((h) => ({ rule: 'Q1.2.1 forbidden key', file: `schema:${h.schema}`, message: `${h.path} (${h.key}) matches ${h.rule}` }));
  for (const f of dataFiles(root)) {
    const data = JSON.parse(readFileSync(f, 'utf8'));
    for (const h of scanForbiddenJson(relative(root, f), data)) problems.push({ rule: 'Q1.2.1 forbidden key', file: relative(root, f), message: `${h.path} (${h.key}) matches ${h.rule}` });
  }
  return problems;
}

export function loadFacts(root: string): FactRow[] {
  const dir = join(root, 'facts');
  const rows: FactRow[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    rows.push(...FactFile.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))).rows);
  }
  return rows;
}

const norm = (s: string) => s.replace(/­/g, '').replace(/\s+/g, ' ').trim();

/** Where local copies of the rule book texts may be found. They are not committed (copyright). */
export function rulebookTexts(): Record<string, string> {
  const candidates: Record<string, string[]> = {
    'rulebook_2026.txt': [process.env.GM_NFL_RULEBOOK_TXT ?? '', '/mnt/project-files/nfl-rules/rulebook_2026.txt'],
    'ncaa-rulebook-2026.txt': [process.env.GM_NCAA_RULEBOOK_TXT ?? '', '/mnt/project-files/research/college/ncaa-rulebook-2026.txt'],
  };
  const out: Record<string, string> = {};
  for (const [k, paths] of Object.entries(candidates)) {
    const p = paths.find((x) => x && existsSync(x));
    if (p) out[k] = norm(readFileSync(p, 'utf8'));
  }
  return out;
}

export interface FactLintResult { problems: LintProblem[]; notes: string[]; counts: Record<string, Record<FactStatus | 'no row', number>> }

export function lintFacts(root: string, opts: { files?: readonly RuleSetFile[]; rows?: FactRow[] } = {}): FactLintResult {
  const problems: LintProblem[] = [];
  const notes: string[] = [];
  const rows = opts.rows ?? loadFacts(root);
  const files = opts.files ?? RULE_SET_FILES;
  const byId = new Map<string, FactRow>();
  for (const r of rows) {
    if (byId.has(r.id)) problems.push({ rule: 'Q6.1.1 unique id', file: 'facts', message: `${r.id} appears twice` });
    byId.set(r.id, r);
    const computed = computeStatus(r);
    if (computed !== r.status) problems.push({ rule: 'Q6.1.2 computed status', file: 'facts', message: `${r.id}: stored status ${r.status}, computed ${computed}` });
  }
  const texts = rulebookTexts();
  let quotes = 0, quotesChecked = 0;
  for (const r of rows) for (const s of r.sources) {
    if (!s.quote) continue;
    quotes++;
    const m = /text copy ([\w.-]+)/.exec(s.locator);
    const t = m ? texts[m[1]!] : undefined;
    if (!t) continue;
    quotesChecked++;
    if (!t.includes(norm(s.quote))) problems.push({ rule: 'Q6 quote check', file: 'facts', message: `${r.id}: quote not found in ${m![1]}: "${s.quote}"` });
  }
  notes.push(quotesChecked === quotes ? `quotes re-found in rule book texts: ${quotesChecked}/${quotes}` : `quotes checked ${quotesChecked}/${quotes} (rule book texts not found locally for the rest; set GM_NFL_RULEBOOK_TXT and GM_NCAA_RULEBOOK_TXT to check them)`);
  const counts: FactLintResult['counts'] = {};
  const usedBy = new Map<string, string[]>();
  for (const file of files) {
    for (const e of validateRuleSetFile(file, KEY_DICTIONARY, files)) problems.push({ rule: 'P1.3.3 rule-set keys', file: file.ruleset_id, message: e });
    const c: Record<string, number> = {};
    for (const v of file.values) {
      const row = byId.get(v.factId);
      if (!row) { problems.push({ rule: 'Q6.2.1 fact link', file: file.ruleset_id, message: `${v.key}: factId ${v.factId} has no register row` }); c['no row'] = (c['no row'] ?? 0) + 1; continue; }
      c[row.status] = (c[row.status] ?? 0) + 1;
      if (row.value !== v.value) problems.push({ rule: 'Q6.2.1 fact value', file: file.ruleset_id, message: `${v.key} = ${v.value} but ${row.id} says ${row.value}` });
      if (row.level !== 'both' && row.level !== file.level) problems.push({ rule: 'Q6.2.1 fact level', file: file.ruleset_id, message: `${v.key} cites ${row.id}, a ${row.level} fact` });
      if (row.domain !== 'rule' && row.domain !== 'league-rule') problems.push({ rule: 'Q6.2.1 fact domain', file: file.ruleset_id, message: `${v.key} cites ${row.id} of domain ${row.domain}` });
      if (!ruleStatusShippable(row.status)) problems.push({ rule: 'Q6.3.1 rule status', file: file.ruleset_id, message: `${v.key} cites ${row.id} with status ${row.status}; rule values need at least Rulebook only` });
      const u = usedBy.get(row.id) ?? []; u.push(`${file.ruleset_id}:${v.key}`); usedBy.set(row.id, u);
    }
    counts[file.ruleset_id] = c as FactLintResult['counts'][string];
  }
  for (const r of rows) {
    const want = (usedBy.get(r.id) ?? []).sort();
    if (JSON.stringify([...r.usedBy].sort()) !== JSON.stringify(want)) problems.push({ rule: 'Q6.1.1 usedBy', file: 'facts', message: `${r.id}: usedBy ${JSON.stringify(r.usedBy)} should be ${JSON.stringify(want)} (run npm run facts -- --fill-used-by)` });
  }
  const provisional = rows.filter((r) => r.status !== 'Verified').length;
  notes.push(`PROVISIONAL rows (not Verified): ${provisional} of ${rows.length}`);
  notes.push(`rule keys in the dictionary: ${KEY_DICTIONARY.length}`);
  return { problems, notes, counts };
}

export function runLint(root: string): number {
  const all: LintProblem[] = [];
  const sections: [string, () => LintProblem[]][] = [
    ['package table (P1.2.1)', () => lintPackageTable(root)],
    ['dependency lint (P1.2.2)', () => lintDependencies(root)],
    ['core purity and level words (P1.1.1, P1.1.2)', () => lintCorePurity(root)],
    ['forbidden keys (Q1.2.1)', () => lintForbiddenKeys(root)],
    ['no projected number or range in the UI layer (D6.5.1, O6.5.1, MA-48)', () => lintUiProjection(root)],
    ['no platform random in presentation, cosmetic streams one way (PV-01, J13.4.1)', () => lintPresentationRandom(root)],
  ];
  for (const [title, f] of sections) {
    const p = f();
    console.log(`${p.length ? 'FAIL' : 'PASS'} ${title}${p.length ? `: ${p.length} problem(s)` : ''}`);
    for (const x of p) console.log(`  [${x.rule}] ${x.file}${x.line ? `:${x.line}` : ''} ${x.message}`);
    all.push(...p);
  }
  const facts = lintFacts(root);
  console.log(`${facts.problems.length ? 'FAIL' : 'PASS'} fact register and rule-set links (Q6, P4.7.1)${facts.problems.length ? `: ${facts.problems.length} problem(s)` : ''}`);
  for (const x of facts.problems) console.log(`  [${x.rule}] ${x.file} ${x.message}`);
  for (const n of facts.notes) console.log(`  ${n}`);
  for (const [id, c] of Object.entries(facts.counts)) console.log(`  ${id}: ${Object.entries(c).map(([s, n]) => `${n} ${s}`).join(', ')}`);
  all.push(...facts.problems);
  const out = join(root, 'test-results', 'lint.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ ok: all.length === 0, problems: all, factNotes: facts.notes, ruleValueStatus: facts.counts }, null, 2) + '\n');
  return all.length === 0 ? 0 : 1;
}

export function fillUsedBy(root: string): void {
  const dir = join(root, 'facts');
  const usedBy = new Map<string, string[]>();
  for (const file of RULE_SET_FILES) for (const v of file.values) {
    const u = usedBy.get(v.factId) ?? []; u.push(`${file.ruleset_id}:${v.key}`); usedBy.set(v.factId, u);
  }
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const p = join(dir, f);
    const data = JSON.parse(readFileSync(p, 'utf8'));
    for (const r of data.rows) r.usedBy = (usedBy.get(r.id) ?? []).sort();
    writeFileSync(p, JSON.stringify(data, null, 1) + '\n');
  }
}
