// Text templates (P4.6.1, P3.6.1 "Template text"). A template entry is data: a key, a default text,
// optional variants keyed by level, rung or both, and typed parameters. Templates hold no logic beyond
// variant choice and plural forms. AI advice and inbox items are chosen in the core as a key plus
// parameters; the wording lives here (P4.6.1 "AI use").
import type { Level } from '@gm/schema';

/** Parameter types (P4.6.1: person, team, number with unit, date, football term). */
export type ParamType = 'person' | 'team' | 'number' | 'date' | 'term' | 'text';
export const PARAM_TYPES: readonly ParamType[] = ['person', 'team', 'number', 'date', 'term', 'text'];

export interface ParamDecl {
  readonly type: ParamType;
  /** Number parameters: the unit the caller must supply (`yd`, `s`, `count`, `usd`, ...). */
  readonly unit?: string;
  /** Number parameters: digits after the decimal point. Default 0. */
  readonly decimals?: number;
}

export interface TemplateVariant {
  readonly level?: Level;
  /** Career rung (S1.1.1, E2.1.1: 0 to 9). */
  readonly rung?: number;
  readonly text: string;
}

export interface TemplateEntry {
  readonly key: string;
  readonly params: Readonly<Record<string, ParamDecl>>;
  readonly default: string;
  readonly variants?: readonly TemplateVariant[];
  /** Free text for writers; never shown. */
  readonly note?: string;
}

/** One file of `text/<language>/*.json` in a pack (P4.1.1). */
export interface TemplateFile {
  readonly contentSchemaVersion: number;
  readonly language: string;
  readonly templates: readonly TemplateEntry[];
}

// Parameter values handed to render(). Ids are world ids; names are display text already chosen by the
// world (generated or imported people, A6).
export interface PersonValue { readonly id: number; readonly first: string; readonly last: string }
export interface TeamValue { readonly id: number; readonly name: string }
export interface NumberValue { readonly value: number; readonly unit: string }
export interface DateValue { readonly seasonYear: number; readonly dayIndex: number }
export interface TermValue { readonly termId: string }
export type ParamValue = PersonValue | TeamValue | NumberValue | DateValue | TermValue | string;

/**
 * Football terms go through the glossary (A4) so a term links to its definition and follows the
 * user's terminology system (G4). The glossary package (G-93) supplies the implementation.
 */
export interface TermResolver {
  resolve(termId: string, system: string): { readonly text: string; readonly glossaryId: string } | null;
}

export interface RenderContext {
  readonly level: Level;
  readonly rung: number;
  readonly language: string;
  /** Terminology system id (G4); passed to the term resolver. */
  readonly terminology: string;
  readonly terms?: TermResolver;
  /** Calendar wording belongs to the calendar (C4); a plain fallback is used when absent. */
  readonly formatDate?: (d: DateValue) => string;
}

/** Rendered output: plain text plus segments so screens can link people, teams and terms. */
export type Segment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'person'; readonly text: string; readonly id: number }
  | { readonly kind: 'team'; readonly text: string; readonly id: number }
  | { readonly kind: 'term'; readonly text: string; readonly glossaryId: string | null };

export interface Diagnostic {
  /** Stable code, for example `template.variant_fallback` or `template.missing_param`. */
  readonly code: string;
  readonly key: string;
  readonly message: string;
}

export interface Rendered {
  readonly text: string;
  readonly segments: readonly Segment[];
  readonly diagnostics: readonly Diagnostic[];
}
