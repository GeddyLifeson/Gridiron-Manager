// Tags, notes and telestration (N1.2.3). The annotation layer sits beside a play record and never
// changes it. Cause tags use one fixed vocabulary so every grader on the staff uses the same words; a
// free tag that matches a fixed term (any case) is stored as the fixed term.
import { param } from './params.ts';
import { CAUSE_TYPES, type CauseType } from './types.ts';
import type { Annotation, Drawing } from './views.ts';

export function emptyAnnotation(playId: string): Annotation {
  return { playId, tags: [], causeTags: [], note: '', noteOverSoftLimit: false, drawings: [] };
}

/** A fixed cause term for a free tag, or null when it is a free tag. */
export function fixedTerm(tag: string): CauseType | null {
  const t = tag.trim().toLowerCase();
  return (CAUSE_TYPES as readonly string[]).includes(t) ? (t as CauseType) : null;
}

export function addTag(a: Annotation, tag: string): Annotation {
  const t = tag.trim();
  if (!t) return a;
  const fixed = fixedTerm(t);
  if (fixed) return a.causeTags.includes(fixed) ? a : { ...a, causeTags: [...a.causeTags, fixed] };
  return a.tags.includes(t) ? a : { ...a, tags: [...a.tags, t] };
}

export function removeTag(a: Annotation, tag: string): Annotation {
  const fixed = fixedTerm(tag);
  return fixed ? { ...a, causeTags: a.causeTags.filter((c) => c !== fixed) } : { ...a, tags: a.tags.filter((t) => t !== tag.trim()) };
}

/** Sets the note. The film screen's soft limit is flagged, not enforced; the notebook keeps the whole note (E11). */
export function setNote(a: Annotation, note: string): Annotation {
  return { ...a, note, noteOverSoftLimit: note.length > param('note.softLimitChars') };
}

export function addDrawing(a: Annotation, d: Drawing): Annotation {
  if (d.shape === 'circle' ? d.points.length !== 2 : d.points.length < 2) throw new Error(`a ${d.shape} needs ${d.shape === 'circle' ? 'a centre and a rim point' : 'at least two points'}`);
  return { ...a, drawings: [...a.drawings, { shape: d.shape, points: d.points.map((p) => ({ x: p.x, y: p.y })) }] };
}

export function removeDrawing(a: Annotation, index: number): Annotation {
  return { ...a, drawings: a.drawings.filter((_, i) => i !== index) };
}

/** Notes on opponents and players also go to the coach's notebook (E11). */
export interface NotebookEntry { readonly playId: string; readonly text: string; readonly about: 'opponent' | 'player' | 'own' }
export function notebookEntry(a: Annotation, about: NotebookEntry['about']): NotebookEntry | null {
  return a.note.trim() ? { playId: a.playId, text: a.note, about } : null;
}
