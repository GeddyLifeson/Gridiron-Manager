// Reads the work packages of plans/engine-build-plan.md (WP-01..WP-26) and plans/game-build-plan.md (G-00..G-100):
// each package's acceptance text becomes a tracked check, its owned paths tell whether the module exists yet, and its
// bible list names the owner of each bible leaf.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface WorkPackage {
  id: string;
  title: string;
  plan: 'engine' | 'game';
  owns: string[];
  bible: string[];
  needs: string;
  acceptance: string;
}

const ticks = (s: string) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);

/** Turns the owned-path cell into repo paths. "src/x/" after "packages/p/src/y/" means packages/p/src/x/. */
export function resolveOwns(cell: string): string[] {
  const out: string[] = [];
  let pkgBase = '';
  const screens = /screens\s+`([^`]+)`/.exec(cell);
  if (screens) {
    for (const n of screens[1]!.split(/[ ,]+/).filter(Boolean)) out.push(`packages/app-ui/src/screens/${n}/`);
  }
  for (const raw of ticks(cell)) {
    if (screens && raw === screens[1]) continue;
    let p = raw.replace(/\s.*$/, '').replace(/\/\*\*$/, '/');
    if (p.startsWith('packages/')) { const m = /^packages\/[^/]+\//.exec(p); pkgBase = m ? m[0] : pkgBase; }
    else if (/^(src|test|data)\//.test(p)) { if (!pkgBase) continue; p = pkgBase + p; }
    else if (!/^(shells|scripts|facts|content|golden|plans)\b/.test(p)) continue;
    out.push(p);
  }
  return [...new Set(out)];
}

/** Bible references in a plan cell: "P3.2, P4.1 to P4.6, F, Q1.7.2 (season)". Ranges expand on the last number. */
export function parseBibleRefs(cell: string): string[] {
  const out: string[] = [];
  const clean = cell.replace(/\([^)]*\)/g, '');
  for (const part of clean.split(/,|;/)) {
    const range = /([A-Z]\d*(?:\.\d+)*)\s+to\s+([A-Z]\d*(?:\.\d+)*)/.exec(part);
    if (range) {
      const a = range[1]!.split('.'), b = range[2]!.split('.');
      const la = Number(a[a.length - 1]), lb = Number(b[b.length - 1]);
      if (a.length === b.length && a.slice(0, -1).join('.') === b.slice(0, -1).join('.') && Number.isFinite(la) && Number.isFinite(lb) && lb >= la && lb - la < 50) {
        for (let i = la; i <= lb; i++) out.push([...a.slice(0, -1), String(i)].join('.'));
      } else out.push(range[1]!, range[2]!);
      continue;
    }
    for (const m of part.matchAll(/\b([A-Z]\d+(?:\.\d+)*|[A-Z])\b/g)) {
      if (/^[A-Z]$/.test(m[1]!) && !/^\s*[A-Z]\s*$/.test(part)) continue; // a lone capital inside prose is not a category
      out.push(m[1]!);
    }
  }
  return [...new Set(out)];
}

function splitRow(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

export function parseGamePlan(text: string): WorkPackage[] {
  const out: WorkPackage[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/^\|\s*G-\d+\s*\|/.test(line)) continue;
    const c = splitRow(line);
    if (c.length < 7) continue;
    out.push({ id: c[0]!, title: c[1]!, plan: 'game', bible: parseBibleRefs(c[2]!), owns: resolveOwns(c[3]!), needs: c[4]!, acceptance: c[5]! });
  }
  return out;
}

export function parseEnginePlan(text: string): WorkPackage[] {
  const out: WorkPackage[] = [];
  let cur: WorkPackage | null = null;
  for (const line of text.split(/\r?\n/)) {
    const head = /^\*\*(WP-\d+)\s+(.*?)\.\*\*/.exec(line);
    if (head) { cur = { id: head[1]!, title: head[2]!, plan: 'engine', owns: [], bible: [], needs: '', acceptance: '' }; out.push(cur); continue; }
    const row = /^\|\s*(WP-\d+)\s*\|/.exec(line);
    if (row) {
      const c = splitRow(line);
      if (c.length >= 6) out.push({ id: c[0]!, title: c[1]!, plan: 'engine', owns: resolveOwns(c[2]!), bible: parseBibleRefs(c[3]!), needs: '', acceptance: c[5]! });
      cur = null;
      continue;
    }
    if (!cur) continue;
    if (/^#{1,4}\s/.test(line)) { cur = null; continue; }
    const item = /^-\s*(Owns|Bible|Acceptance|Tests):\s*(.*)$/.exec(line);
    if (!item) continue;
    if (item[1] === 'Owns') cur.owns = resolveOwns(item[2]!);
    else if (item[1] === 'Bible') cur.bible = parseBibleRefs(item[2]!);
    else if (item[1] === 'Acceptance') cur.acceptance = (cur.acceptance ? cur.acceptance + ' ' : '') + item[2]!;
    else if (item[1] === 'Tests') cur.acceptance = (cur.acceptance ? cur.acceptance + ' ' : '') + `Tests: ${item[2]!}`;
  }
  // A package listed both as a heading and as a table row keeps the first.
  const seen = new Set<string>();
  return out.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));
}

export function loadPlans(root: string): WorkPackage[] {
  const read = (p: string) => (existsSync(join(root, p)) ? readFileSync(join(root, p), 'utf8') : '');
  return [...parseEnginePlan(read('plans/engine-build-plan.md')), ...parseGamePlan(read('plans/game-build-plan.md'))];
}

export function ownedPathsPresent(root: string, wp: WorkPackage): { present: string[]; absent: string[] } {
  const present: string[] = [], absent: string[] = [];
  for (const p of wp.owns) (existsSync(join(root, p.replace(/\/$/, ''))) ? present : absent).push(p);
  return { present, absent };
}

/** The work package whose bible list names this leaf most specifically. */
export function ownerOf(leafId: string, wps: readonly WorkPackage[]): string | undefined {
  let best: { id: string; len: number } | undefined;
  for (const w of wps) for (const r of w.bible) {
    const hit = leafId === r || leafId.startsWith(r + '.') || (/^[A-Z]$/.test(r) && new RegExp(`^${r}\\d`).test(leafId));
    if (hit && (!best || r.length > best.len)) best = { id: w.id, len: r.length };
  }
  return best?.id;
}
