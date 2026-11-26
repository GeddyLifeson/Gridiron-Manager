// Forbidden-key scan (Q1.2.1 second lint, R1.2.1 gate item 5, A3.1.1 rows 8 to 10, A3.1.2).
// No entity may hold coach points, experience points, skill trees, perks, picked traits, difficulty or
// an outcome slider. The user's coaching component may not hold ability fields (P3.2.2 acceptance 3).
import type { z } from 'zod';
import { walkFields } from './field.ts';

export const FORBIDDEN_KEY_PATTERNS: readonly RegExp[] = [
  /difficulty/i,
  /slider/i,
  /skill_?points?/i,
  /coach_?points?/i,
  /^xp$|_xp$|Xp$|^xp_/i,
  /experience_?points?/i,
  /skill_?trees?/i,
  /talent_?trees?/i,
  /^perks?$|perks?$/i,
  /^(starting|picked|chosen|creation)?_?traits?$/i,
];

/** Extra bans inside a coaching component outside `hidden` (P3.2.2 acceptance 3). */
export const COACHING_FORBIDDEN: readonly RegExp[] = [/skill/i, /rating/i, /^level$|level$/i, /competenc/i, /experience/i, /points/i];

export interface ForbiddenHit { schema: string; path: string; key: string; rule: string }

export function scanForbiddenKeys(schemas: Record<string, z.ZodType>): ForbiddenHit[] {
  const hits: ForbiddenHit[] = [];
  for (const [name, s] of Object.entries(schemas)) {
    walkFields(s, (f) => {
      for (const re of FORBIDDEN_KEY_PATTERNS) {
        if (re.test(f.key)) hits.push({ schema: name, path: f.path, key: f.key, rule: re.source });
      }
      if (/\.coaching\./.test(f.path) && !/\.hidden/.test(f.path)) {
        for (const re of COACHING_FORBIDDEN) {
          if (re.test(f.key)) hits.push({ schema: name, path: f.path, key: f.key, rule: `coaching:${re.source}` });
        }
      }
    });
  }
  return hits;
}

/** Scans plain JSON data (rule-set files, config, content) for forbidden keys at any depth. */
export function scanForbiddenJson(name: string, data: unknown, path = '$', hits: ForbiddenHit[] = []): ForbiddenHit[] {
  if (Array.isArray(data)) data.forEach((v, i) => scanForbiddenJson(name, v, `${path}[${i}]`, hits));
  else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      for (const re of FORBIDDEN_KEY_PATTERNS) if (re.test(k)) hits.push({ schema: name, path: `${path}.${k}`, key: k, rule: re.source });
      // Rule-set keys are values of a "key" field: scan their segments too.
      if (k === 'key' && typeof v === 'string') {
        for (const seg of v.split('.')) for (const re of FORBIDDEN_KEY_PATTERNS) if (re.test(seg)) hits.push({ schema: name, path: `${path}.key=${v}`, key: seg, rule: re.source });
      }
      scanForbiddenJson(name, v, `${path}.${k}`, hits);
    }
  }
  return hits;
}
