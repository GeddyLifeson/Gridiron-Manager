// Validators for the no-skill rule (E9.1.2 rule 2 and acceptance 1, E9.1.1 acceptance, P3.2.2).
// - A user's coach record may hold ids, dates, counts, text and references only. A field named skill,
//   rating, level, competency, experience or points is rejected, and so is a number that is neither a
//   count, a date nor an id.
// - Every label definition whose subject is a coach must read only event types that feed one of the six
//   families. A definition that reads anything else fails.
import { COACHING_FORBIDDEN, FORBIDDEN_KEY_PATTERNS } from '@gm/schema';
import { DEFAULT_EVIDENCE_MAP, indexMap, type EvidenceMap } from './events.ts';

/** Keys whose numbers are counts, dates or ids (E9.1.2 rule 2). Array elements inherit their key. */
const NUMERIC_OK = /(^id$|Id$|Ids$|^ids$|[cC]ount$|^seasons$|Seasons$|Season$|^games$|Games$|^seasonYear$|Year$|^year$|^dayIndex$|^hours$)/;

/** Containers whose keys are content ids and whose values are counts or id lists (P3.2.2 CoachingBlock). */
const COUNT_MAPS = new Set(['systemFamilies', 'demonstratedRecord', 'eventIds', 'simulatedEventIds']);

export interface ShapeProblem { readonly path: string; readonly message: string }

/**
 * Problems with a user's coach record object (the CoachingBlock or this module's record). `hidden` is
 * refused outright on a user (E9.5.2).
 */
export function userRecordProblems(obj: unknown, path = '$'): ShapeProblem[] {
  const out: ShapeProblem[] = [];
  walk(obj, path, null, false, out);
  return out;
}

function walk(v: unknown, path: string, key: string | null, inCountMap: boolean, out: ShapeProblem[]): void {
  if (typeof v === 'number') {
    const ok = inCountMap || (key !== null && NUMERIC_OK.test(key));
    if (!ok) out.push({ path, message: 'a number that is neither a count, a date nor an id (E9.1.2 rule 2)' });
    else if (!Number.isInteger(v)) out.push({ path, message: 'counts, dates and ids are whole numbers (E9.1.2 rule 2)' });
    return;
  }
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`, key, inCountMap, out)); return; }
  if (!v || typeof v !== 'object') return;
  // Inside a count map the keys are content ids (system families, family ids), not field names.
  const isMap = key !== null && COUNT_MAPS.has(key);
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const p = `${path}.${k}`;
    if (!isMap) {
      if (k === 'hidden') { out.push({ path: p, message: 'a user coach carries no hidden block (E9.5.2)' }); continue; }
      for (const re of [...FORBIDDEN_KEY_PATTERNS, ...COACHING_FORBIDDEN]) {
        if (re.test(k)) out.push({ path: p, message: `field name matches ${re.source} (E9.1.2 acceptance 1)` });
      }
    }
    walk(x, p, isMap ? key : k, isMap, out);
  }
}

/** A label definition as models/src/labels `LabelDef` gives it (structural copy, P1.2.1). */
export interface LabelDefLike {
  readonly id: string;
  readonly appliesTo: readonly string[];
  readonly positive: { readonly types: readonly string[] };
  readonly negative: { readonly types: readonly string[] };
}

/** E9.1.1 acceptance: a coach label that reads a type outside the six families fails validation. */
export function labelSourceProblems(defs: readonly LabelDefLike[], map: EvidenceMap = DEFAULT_EVIDENCE_MAP): string[] {
  const idx = indexMap(map);
  const out: string[] = [];
  for (const d of defs) {
    if (!d.appliesTo.includes('coach')) continue;
    for (const t of [...d.positive.types, ...d.negative.types]) {
      if (!idx.has(t)) out.push(`label ${d.id}: reads ${t}, which feeds none of the six evidence families (E9.1.1)`);
    }
  }
  return out;
}
