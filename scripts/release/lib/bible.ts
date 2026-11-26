// Reads every leaf's acceptance criteria from the bible (/mnt/project-files/bible) so each one becomes a tracked
// release check. The bible lives outside the repo (A6.4.1 item 5: it is not part of the game), so a snapshot is kept in
// scripts/release/data/bible-criteria.json and refreshed with `gate.ts --refresh-bible`.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export interface BibleLeaf {
  id: string;
  title: string;
  tag: string;
  file: string;
  inScope: boolean;
  scopeNote: string;
  criterion: string;
}

export interface BibleSnapshot {
  source: string;
  contentHash: string;
  leafCount: number;
  leaves: BibleLeaf[];
}

export function findBibleDir(): string | null {
  const c = [process.env.GM_BIBLE_DIR ?? '', '/mnt/project-files/bible', 'E:/mnt/project-files/bible', 'E:\\mnt\\project-files\\bible'];
  for (const p of c) if (p && existsSync(join(p, 'INDEX.md'))) return p;
  return null;
}

function mdFiles(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir).sort()) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!n.startsWith('_')) out.push(...mdFiles(p)); }
    else if (n.endsWith('.md') && n !== 'INDEX.md' && n !== 'TEMPLATE.md') out.push(p);
  }
  return out;
}

const LEAF = /^###\s+([A-Z]\d+(?:\.\d+)+)\s+(.*?)\s*$/;
const BOLD_HEAD = /^\*\*[A-Z][^*]{0,60}\.\*\*/;

/** v1 scope from the leaf tag (A2): out when the tag names only later/v2 work or the leaf is retired. */
export function scopeOf(tag: string, title: string): { inScope: boolean; note: string } {
  const t = tag.toLowerCase();
  if (/retired/.test(t) || /^retired$/i.test(title.trim())) return { inScope: false, note: 'retired leaf' };
  if (/\bv1\b/.test(t)) return { inScope: true, note: '' };
  if (/\bv2\b|\blater\b/.test(t)) return { inScope: false, note: `tag [${tag}] is not v1` };
  return { inScope: true, note: tag ? `tag [${tag}] names no version; treated as v1 (first release is the full career, A2)` : 'no tag; treated as v1' };
}

export function parseBibleFile(text: string, file: string): BibleLeaf[] {
  const lines = text.split(/\r?\n/);
  const leaves: BibleLeaf[] = [];
  let cur: BibleLeaf | null = null;
  let inAcc = false;
  const acc: string[] = [];
  const close = () => {
    if (cur) { cur.criterion = acc.join(' ').replace(/\s+/g, ' ').trim(); leaves.push(cur); }
    cur = null; inAcc = false; acc.length = 0;
  };
  for (const line of lines) {
    const m = LEAF.exec(line);
    if (m) {
      close();
      const rest = m[2]!;
      const tm = /\[([^\]]*)\]/.exec(rest);
      const tag = tm ? tm[1]!.trim() : '';
      const title = (tm ? rest.slice(0, tm.index) : rest).trim();
      const s = scopeOf(tag, title);
      cur = { id: m[1]!, title, tag, file, inScope: s.inScope, scopeNote: s.note, criterion: '' };
      continue;
    }
    if (!cur) continue;
    if (/^#{1,3}\s/.test(line) || /^---\s*$/.test(line)) { close(); continue; }
    if (line.startsWith('**Acceptance criteria.**')) { inAcc = true; acc.push(line.slice('**Acceptance criteria.**'.length)); continue; }
    if (inAcc) {
      if (BOLD_HEAD.test(line)) { inAcc = false; continue; }
      acc.push(line);
    }
  }
  close();
  return leaves;
}

export function readBible(dir: string): BibleSnapshot {
  const h = createHash('sha256');
  const leaves: BibleLeaf[] = [];
  for (const f of mdFiles(dir)) {
    const text = readFileSync(f, 'utf8');
    const rel = f.slice(dir.length + 1).replace(/\\/g, '/');
    h.update(rel).update('\0').update(text).update('\0');
    leaves.push(...parseBibleFile(text, rel));
  }
  return { source: 'bible', contentHash: h.digest('hex').slice(0, 16), leafCount: leaves.length, leaves };
}

export interface GateItem { phase: string; title: string; item: number; text: string }

/** The numbered gate items of each phase in R1.2 ("**Rules and logic.** Gate: ..." followed by "1. ..."). */
export function parsePhaseGates(text: string): GateItem[] {
  const out: GateItem[] = [];
  let phase = '', title = '', inGate = false;
  for (const line of text.split(/\r?\n/)) {
    const h = /^###\s+(R1\.2\.\d+)\s+(.*?)\s*(\[.*)?$/.exec(line);
    if (h) { phase = h[1]!; title = h[2]!; inGate = false; continue; }
    if (!phase) continue;
    if (/^#{1,3}\s/.test(line)) { phase = ''; continue; }
    if (/^\*\*Rules and logic\.\*\*.*Gate/.test(line)) { inGate = true; continue; }
    if (inGate && /^\*\*[A-Z][^*]*\.\*\*/.test(line)) { inGate = false; continue; }
    const m = inGate ? /^(\d+)\.\s+(.*)$/.exec(line) : null;
    if (m) out.push({ phase, title, item: Number(m[1]), text: m[2]!.trim() });
  }
  return out;
}

export function readPhaseGates(dir: string): GateItem[] {
  const p = join(dir, 'R-production/R1-roadmap-and-phases.md');
  return existsSync(p) ? parsePhaseGates(readFileSync(p, 'utf8')) : [];
}
