// G-100 scan policy: which scan hits are on a surface a player never sees (provenance, comments, code tokens).
// Data in scripts/release/data/policy.json. A permitted hit is still counted and reported by reason (never hidden).
import { readFileSync } from 'node:fs';

export interface ScanPolicy {
  provenanceFiles: string[]; annotationKeys: string[]; commentLines: boolean; identifierAbbreviations: boolean; genericTerms: string[];
}
export type PermitReason = 'provenance-file' | 'annotation-key' | 'comment' | 'identifier' | 'generic-term';

export function loadPolicy(path: string): ScanPolicy { return JSON.parse(readFileSync(path, 'utf8')) as ScanPolicy; }

const isAbbrev = (s: string) => /^[A-Z0-9&]{2,4}$/.test(s);

/** Why a hit may stay, or null when it is on a player-facing surface. `lineText` is the source line of the hit. */
export function permitReason(p: ScanPolicy, file: string, lineText: string | undefined, term: string, kind: 'mark' | 'name'): PermitReason | null {
  if (p.provenanceFiles.some((r) => new RegExp(r).test(file))) return 'provenance-file';
  if (kind === 'mark' && p.genericTerms.includes(term.toLowerCase())) return 'generic-term';
  if (lineText === undefined) return null;
  const t = lineText.trim();
  if (p.commentLines && /^(\/\/|\/\*|\*)/.test(t)) return 'comment';
  if (/\.json$/.test(file)) {
    const key = /^"([^"]+)"\s*:/.exec(t)?.[1];
    if (key && p.annotationKeys.includes(key)) return 'annotation-key';
  }
  if (kind === 'mark' && p.identifierAbbreviations && /\.tsx?$/.test(file) && isAbbrev(term)) {
    // Quoted-string occurrence: the abbreviation sits between a pair of quote marks on the line.
    const re = new RegExp(`(["'\`])(?:[^"'\`]*[^A-Za-z0-9])?${term}(?![A-Za-z0-9])[^"'\`]*\\1`);
    if (!re.test(lineText)) return 'identifier';
  }
  return null;
}
