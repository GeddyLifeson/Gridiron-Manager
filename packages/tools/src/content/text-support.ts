// The text kind validates with @gm/football-content's template validator (G-08's templates module).
// The football-content barrel exports the module under the namespace `templates` (integrator convention).
// The validator is still looked up at run time so a missing module gives a warning, not a crash.
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
  const m = ((footballContent as unknown as { templates?: Partial<TextSupport> }).templates ?? {}) as Partial<TextSupport>;
  return typeof m.validateTemplateFile === 'function' ? (m as TextSupport) : null;
}
