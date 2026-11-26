// The text kind validates with @gm/football-content's template validator (G-08's templates module).
// Package barrels are integrator-owned, so until `export * from './templates/index.ts'` is in
// packages/football-content/src/index.ts the validator is looked up at run time and, if absent, text
// files load with a warning instead of a check. Once the barrel line lands this switches on by itself.
import * as footballContent from '@gm/football-content';

export interface TemplateProblemLike { readonly severity: 'error' | 'warning'; readonly code: string; readonly path: string; readonly message: string }
export interface TemplateFileLike { readonly language: string; readonly templates: readonly { readonly key: string }[] }
export interface TextSupport {
  validateTemplateFile(data: unknown, opts: { unknownFields: 'error' | 'warning' }): { file: TemplateFileLike | null; problems: TemplateProblemLike[] };
}

let override: TextSupport | null | undefined;

/** Tests inject a validator; pass undefined to go back to the real lookup. */
export function setTextSupport(s: TextSupport | null | undefined): void { override = s; }

export function textSupport(): TextSupport | null {
  if (override !== undefined) return override;
  const m = footballContent as unknown as Partial<TextSupport>;
  return typeof m.validateTemplateFile === 'function' ? (m as TextSupport) : null;
}
