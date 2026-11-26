// The parts of the glossary read model (app-services read-models/glossary) the screen and the term links
// show. Declared here because app-ui imports only the app-services entry point, which re-exports the read
// model once the integrator adds its barrel line.
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const glTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function gt(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export type PlayLevel = 'pro' | 'college';
export type TermLevel = PlayLevel | 'both';

export interface UiSource { readonly citation: string; readonly locator: string; readonly dateRead: string; readonly howRead: string; readonly primary: boolean }

export interface UiTermCard {
  readonly id: string; readonly term: string; readonly aliases: readonly string[]; readonly variants: readonly string[]; readonly definition: string;
  readonly domain: string; readonly subdomain: string; readonly level: TermLevel; readonly ownerLeaf: string; readonly factRow: string;
  readonly status: string; readonly sources: readonly UiSource[]; readonly otherLevel: { readonly id: string; readonly definition: string } | null;
  readonly lesson: string | null; readonly diagram: string | null;
}

export interface UiGlossaryRow { readonly id: string; readonly term: string; readonly domain: string; readonly level: TermLevel; readonly status: string; readonly definition: string }

export interface UiGlossary {
  readonly level: PlayLevel;
  readonly rows: readonly UiGlossaryRow[];
  readonly total: number;
  readonly domains: readonly string[];
  readonly statusCounts: Readonly<Record<string, number>>;
  readonly selected: UiTermCard | null;
}

export interface UiGlossaryFilter { readonly query: string; readonly domain: string | null; readonly levelOnly: boolean; readonly flaggedOnly: boolean }

/** A piece of linked text (N5.2.1): plain, or a term the reader can open. */
export type UiSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'term'; readonly text: string; readonly id: string; readonly matched: 'term' | 'alias' };

export interface UiHoverCard { readonly id: string; readonly term: string; readonly definition: string; readonly aliases: readonly string[]; readonly lesson: string | null; readonly status: string; readonly otherLevelNote: string | null }

/** Statuses short of triple verification are flagged wherever a term's sources are shown (project rule). */
export const isFlagged = (status: string): boolean => status !== 'Verified';
