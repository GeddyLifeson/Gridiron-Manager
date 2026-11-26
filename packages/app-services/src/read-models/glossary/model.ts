// Glossary screen (school.glossary; A4, O1.5.3) and term links (N5.2.1). Every A4 term with its
// definition, aliases, level, owner leaf and its register row: the computed status and the sources
// behind it (A4.1.1). The same records drive the links every screen draws from its text.
import { glossary as g } from '@gm/football-content';

export type PlayLevel = 'pro' | 'college';
type Term = g.TermRecord;

export interface SourceLine { readonly citation: string; readonly locator: string; readonly dateRead: string; readonly howRead: string; readonly primary: boolean }

export interface TermCard {
  readonly id: string;
  readonly term: string;
  readonly aliases: readonly string[];
  readonly variants: readonly string[];
  readonly definition: string;
  readonly domain: string;
  readonly subdomain: string;
  readonly level: g.GlossaryLevel;
  readonly ownerLeaf: string;
  readonly factRow: string;
  /** Computed from the register row's sources (Q6.1.2); anything short of Verified is flagged on screen. */
  readonly status: string;
  readonly sources: readonly SourceLine[];
  /** The same phrase at the other level when its meaning differs there (N5.2.1 edge case). */
  readonly otherLevel: { readonly id: string; readonly definition: string } | null;
  readonly lesson: string | null;
  readonly diagram: string | null;
}

export interface GlossaryListRow { readonly id: string; readonly term: string; readonly domain: string; readonly level: g.GlossaryLevel; readonly status: string; readonly definition: string }

export interface GlossaryFilter {
  readonly query?: string;
  readonly domain?: string | null;
  /** Show only terms that apply at the save's level (default true). */
  readonly levelOnly?: boolean;
  /** Only terms short of Verified. */
  readonly flaggedOnly?: boolean;
}

export interface GlossaryView {
  readonly level: PlayLevel;
  readonly rows: readonly GlossaryListRow[];
  readonly total: number;
  readonly domains: readonly string[];
  readonly statusCounts: Readonly<Record<string, number>>;
  readonly selected: TermCard | null;
}

const fold = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
const applies = (t: Term, level: PlayLevel): boolean => t.level === 'both' || t.level === level;

/** The card for one term at the save's level. */
export function termCard(id: string, level: PlayLevel, gl: g.Glossary = g.glossary): TermCard | null {
  const t = gl.byId(id);
  if (!t) return null;
  const row = g.glossaryFact(t.factRow);
  const other = gl.otherLevel(id, level);
  return {
    id: t.id, term: t.term, aliases: t.aliases, variants: t.variants ?? [], definition: t.definition, domain: t.domain, subdomain: t.subdomain,
    level: t.level, ownerLeaf: t.ownerLeaf, factRow: t.factRow, status: g.glossaryFactStatus(t.factRow),
    sources: (row?.sources ?? []).map((s) => ({ citation: s.citation, locator: s.locator, dateRead: s.dateRead, howRead: s.howRead, primary: s.primary === true })),
    otherLevel: other ? { id: other.id, definition: other.definition } : null,
    lesson: t.lesson ?? null, diagram: t.diagram ?? null,
  };
}

export function buildGlossary(level: PlayLevel, f: GlossaryFilter = {}, selectedId: string | null = null, gl: g.Glossary = g.glossary): GlossaryView {
  const q = fold(f.query ?? '');
  const levelOnly = f.levelOnly ?? true;
  const statusCounts: Record<string, number> = {};
  const rows: GlossaryListRow[] = [];
  for (const t of gl.terms) {
    if (levelOnly && !applies(t, level)) continue;
    const status = g.glossaryFactStatus(t.factRow);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    if (f.domain && t.domain !== f.domain) continue;
    if (f.flaggedOnly && status === 'Verified') continue;
    if (q && !fold(t.term).includes(q) && !t.aliases.some((a) => fold(a).includes(q)) && !fold(t.definition).includes(q)) continue;
    rows.push({ id: t.id, term: t.term, domain: t.domain, level: t.level, status, definition: t.definition });
  }
  rows.sort((a, b) => { const x = fold(a.term), y = fold(b.term); return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1; });
  return {
    level, rows, total: gl.terms.length,
    domains: [...new Set(gl.terms.map((t) => t.domain))].sort(),
    statusCounts,
    selected: selectedId ? termCard(selectedId, level, gl) : null,
  };
}

/** A piece of linked text (N5.2.1 rule 1): plain, or a term the reader can open. */
export type Segment = g.Segment;

/** Split free text into plain runs and term links at the save's level (generated reports are scanned at render time). */
export function linkText(text: string, level: PlayLevel, gl: g.Glossary = g.glossary): Segment[] {
  return gl.link(text, level);
}

/** A short hover card (N5.2.1): definition, aliases, and whether "Teach me this" has a lesson to open. */
export interface HoverCard { readonly id: string; readonly term: string; readonly definition: string; readonly aliases: readonly string[]; readonly lesson: string | null; readonly status: string; readonly otherLevelNote: string | null }

export function hoverCard(id: string, level: PlayLevel, gl: g.Glossary = g.glossary): HoverCard | null {
  const c = termCard(id, level, gl);
  return c ? { id: c.id, term: c.term, definition: c.definition, aliases: c.aliases, lesson: c.lesson, status: c.status, otherLevelNote: c.otherLevel?.definition ?? null } : null;
}
