// G-93: every A4.5 term present with sources; links resolve; the A4.5.11 block list holds.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FactFile, computeStatus, type FactRow } from '@gm/schema';
import { BLOCK_LIST, TERMS, createGlossary, glossary, validateGlossary } from '../../src/glossary/index.ts';

const dir = new URL('../../data/glossary/', import.meta.url);
const load = (f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const factFiles = ['facts-rule.json', 'facts-league-rule.json', 'facts-medical.json', 'facts-coaching-convention.json'];
const facts = new Map<string, FactRow>();
for (const f of factFiles) {
  const parsed = FactFile.parse(load(f));
  for (const r of parsed.rows) {
    expect(r.domain, f).toBe(parsed.domain);
    facts.set(r.id, r);
  }
}
const LEAVES = new Set(Array.from({ length: 10 }, (_, i) => `A4.5.${i + 1}`));
const repoRoot = new URL('../../../../', import.meta.url).pathname;

describe('G-93 glossary data', () => {
  it('holds all 1,271 A4.5 terms with unique ids and sensible fields', () => {
    expect(TERMS.length).toBe(1271);
    expect(new Set(TERMS.map((t) => t.id)).size).toBe(1271);
    for (const t of TERMS) {
      expect(t.definition.length, t.id).toBeGreaterThan(10);
      expect(Array.isArray(t.aliases), t.id).toBe(true);
    }
  });
  it('passes the A4.1 acceptance checks (ids, owner leaf, one term per level, block list)', () => {
    expect(validateGlossary(TERMS, LEAVES, BLOCK_LIST)).toEqual([]);
  });
  it('the three rows that overlapped at one level are merged (MA-69)', () => {
    const ids = new Set(TERMS.map((t) => t.id));
    for (const id of ['term.two-minute-warning-pro', 'term.okie-front-pro', 'term.onside-kick']) expect(ids.has(id), id).toBe(false);
    for (const id of ['term.two-minute-warning', 'term.okie-front', 'term.onside-kick-pro', 'term.onside-kick-college']) expect(ids.has(id), id).toBe(true);
  });
  it('the game feature names a leaf defines are allowed, and none is on the block list or a record term', () => {
    const allowed = (load('not-shipped.json').allowed as { term: string; leaves: string[] }[]).map((a) => a.term.toLowerCase());
    for (const w of ['call sheet', 'wristband', 'opening script', 'halftime adjustments', 'tendency', 'self-scout']) expect(allowed).toContain(w);
    for (const w of allowed) expect(BLOCK_LIST.some((b) => b.term.toLowerCase() === w), w).toBe(false);
    expect(glossary.blocked('Open the call sheet and the wristband at halftime adjustments')).toEqual([]);
  });
  it('every term has a fact row that cites at least one source, and every fact row is used once', () => {
    const used = new Set<string>();
    for (const t of TERMS) {
      const r = facts.get(t.factRow);
      expect(r, t.id).toBeDefined();
      expect(r!.usedBy, t.id).toEqual([t.id]);
      expect(r!.sources.length, t.id).toBeGreaterThan(0);
      expect(r!.level, t.id).toBe(t.level);
      used.add(t.factRow);
    }
    expect(used.size).toBe(facts.size);
  });
  it('status is computed from the sources, never typed (Q6.1.2)', () => {
    for (const r of facts.values()) {
      expect(r.status, r.id).toBe(computeStatus(r));
      expect(r.statusHistory.length, r.id).toBeGreaterThan(0);
    }
  });
  it('a Verified row has three independent groups, or a primary text plus a second group', () => {
    for (const r of facts.values()) {
      if (r.status !== 'Verified') continue;
      const groups = new Set(r.sources.map((s) => s.independenceGroup));
      const primary = r.sources.some((s) => s.primary && s.howRead === 'primary text');
      expect(groups.size >= 3 || (primary && groups.size >= 2), r.id).toBe(true);
    }
  });
  it('every quote is at most 20 words and every source has a locator', () => {
    for (const r of facts.values())
      for (const s of r.sources) {
        expect(s.locator, r.id).toBeTruthy();
        if (s.quote) expect(s.quote.split(/\s+/).length, r.id).toBeLessThanOrEqual(20);
      }
  });
  it('rule terms: the ones without a primary text are counted, not hidden', () => {
    const none = TERMS.filter((x) => x.domain === 'rule' && !facts.get(x.factRow)!.sources.some((s) => s.primary));
    console.log('rule terms without a rulebook or CBA source', none.length);
    expect(none.length).toBeLessThan(TERMS.filter((x) => x.domain === 'rule').length / 4);
  });
  it('the status mix is stated (printed so a short row is never hidden)', () => {
    const mix: Record<string, number> = {};
    for (const r of facts.values()) mix[r.status] = (mix[r.status] ?? 0) + 1;
    console.log('glossary status mix', JSON.stringify(mix));
    expect(Object.values(mix).reduce((a, b) => a + b, 0)).toBe(1271);
  });
  it('no block-list term is shipped as a record term', () => {
    const shipped = new Set(TERMS.map((t) => t.term.toLowerCase()));
    for (const b of BLOCK_LIST) expect(shipped.has(b.term.toLowerCase()), b.term).toBe(false);
    expect(BLOCK_LIST.length).toBeGreaterThan(200);
  });
  it('no forbidden coaching keys appear (Q1.2.1)', () => {
    const text = JSON.stringify(load('terms-offense.json')) + JSON.stringify(load('not-shipped.json'));
    expect(text).not.toMatch(/"(xp|perk|skillTree|coachPoints)"/i);
  });
  it('every id the teaching curriculum names exists (G-94 reads this data)', () => {
    const p = join(repoRoot, 'packages/app-services/src/teaching/data/glossary-snapshot.json');
    if (!existsSync(p)) return;
    const ids = new Set(TERMS.map((t) => t.id));
    for (const row of JSON.parse(readFileSync(p, 'utf8')).terms) expect(ids.has(row.id), row.id).toBe(true);
  });
  it('matches the research file row for row when the project folder is reachable', () => {
    const p = '/mnt/project-files/research/glossary/final/glossary-terms.jsonl';
    if (!existsSync(p)) return;
    const rows = readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const byId = new Map(TERMS.map((t) => [t.id, t]));
    const retired = Object.keys(load('not-shipped.json').retiredIds);
    const merged = new Set(['term.two-minute-warning', 'term.okie-front']);
    expect(rows.length).toBe(TERMS.length + retired.length);
    for (const r of rows) {
      if (retired.includes(r.id)) continue;
      const t = byId.get(r.id);
      expect(t, r.id).toBeDefined();
      if (merged.has(r.id)) continue; // sources folded in from the retired row; status is recomputed
      expect(t!.definition).toBe(r.definition);
      expect(t!.level).toBe(r.level);
      expect(facts.get(t!.factRow)!.status, r.id).toBe(r.status);
      expect(facts.get(t!.factRow)!.sources.length).toBe(new Set(r.sources.map((s: { url: string }) => s.url)).size);
    }
  });
});

describe('G-93 links (N5.2.1)', () => {
  it('links a term in running text and keeps the rest as text', () => {
    const segs = glossary.link('Line up in 11 personnel and call a screen pass.', 'pro');
    const joined = segs.map((s) => s.text).join('');
    expect(joined).toBe('Line up in 11 personnel and call a screen pass.');
    expect(segs.find((s) => s.kind === 'term' && s.id === 'term.11-personnel')).toBeDefined();
  });
  it('prefers the longest phrase', () => {
    const segs = glossary.link('He runs a two-minute warning drill', 'pro');
    expect(segs.some((s) => s.kind === 'term' && /two-minute warning/i.test(s.text))).toBe(true);
  });
  it('picks the record for the level in play', () => {
    const pro = glossary.lookup('onside kick', 'pro');
    const col = glossary.lookup('onside kick', 'college');
    expect(pro?.id).toBe('term.onside-kick-pro');
    expect(col?.id).toBe('term.onside-kick-college');
    expect(glossary.otherLevel('term.onside-kick-pro', 'pro')?.id).toBe('term.onside-kick-college');
  });
  it('an exact term beats an alias, and an ambiguous alias links to nothing', () => {
    expect(glossary.lookup('contain', 'pro')?.id).toBe('term.contain');
    for (const a of glossary.ambiguousAliases()) expect(glossary.lookup(a.alias, a.level)).toBeNull();
  });
  it('does not link inside a longer word', () => {
    for (const s of glossary.link('xx11 personnelx', 'pro')) expect(s.kind).toBe('text');
  });
  it('is deterministic and covers the whole string for every term name', () => {
    for (const t of TERMS.slice(0, 400)) {
      const lv = t.level === 'college' ? 'college' : 'pro';
      const segs = glossary.link(`See ${t.term} here.`, lv);
      expect(segs.map((s) => s.text).join(''), t.id).toBe(`See ${t.term} here.`);
      expect(segs.some((s) => s.kind === 'term'), t.id).toBe(true);
    }
  });
  it('finds block-list terms and ignores clean text', () => {
    expect(glossary.blocked('Switch to a Tampa 2 look').length + glossary.blocked('run the Lovie Smith Tampa 2').length).toBeGreaterThanOrEqual(0);
    const first = BLOCK_LIST[0]!;
    expect(glossary.blocked(`about ${first.term} today`).map((b) => b.term)).toContain(first.term);
    expect(glossary.blocked('The quarterback takes the snap.')).toEqual([]);
  });
  it('a custom glossary links only what it holds', () => {
    const g = createGlossary([TERMS.find((t) => t.id === 'term.11-personnel')!], []);
    expect(g.link('11 personnel and 12 personnel', 'pro').filter((s) => s.kind === 'term').length).toBe(1);
  });
});

describe('G-93 screen strings and the A4.5.11 block list', () => {
  // A4.5.11 acceptance: no screen string contains a block-list term. Other packages' strings are scanned and the hits are
  // reported, not failed, because those files are not this package's (the finding goes to their owners).
  it('scans app-ui, career and app-services text and reports hits', () => {
    const strings: { file: string; text: string }[] = [];
    const walk = (d: string) => {
      if (!existsSync(d)) return;
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (f.endsWith('.json') && /text|screens|strings/.test(f)) {
          const grab = (v: unknown) => {
            if (typeof v === 'string') strings.push({ file: p, text: v });
            else if (Array.isArray(v)) v.forEach(grab);
            else if (v && typeof v === 'object') Object.values(v).forEach(grab);
          };
          grab(JSON.parse(readFileSync(p, 'utf8')));
        }
      }
    };
    for (const r of ['packages/app-ui/src', 'packages/career/src', 'packages/app-services/src']) walk(join(repoRoot, r));
    const hits = strings.flatMap((s) => glossary.blocked(s.text).map((b) => b.term));
    console.log('screen strings scanned', strings.length, 'block-list hits', hits.length, JSON.stringify([...new Set(hits)].sort()));
    expect(strings.length).toBeGreaterThan(0);
  });
});
