// The static information audit (K9.3.1, Q1.4.1 check 1): AI decision code and interface code may not
// name a truth type. All contract types come from one entry point (@gm/schema), so the audit works on
// names, not on files: a name is a truth symbol when its schema has a truth-class field anywhere inside.
import { holdsTruth, type Schema } from '../schema-walk.ts';

/** Packages whose source makes decisions for AI people (K1 choices, K3 to K8). */
export const DECISION_PACKAGES = ['coach-ai', 'front-office'] as const;
/** Packages that draw the interface (K9.3.1 rule 5). */
export const INTERFACE_PACKAGES = ['app-ui'] as const;

/**
 * Names that give a holder the whole world, whatever their fields: an AI decision function takes a
 * view and no world-state argument (K9.1.1 acceptance).
 */
export const WORLD_STATE_SYMBOLS: readonly string[] = ['WorldState', 'TableSource', 'SaveStore', 'tablesOf', 'allSchemas', 'worldSchemas', 'simSchemas'];

const isSchema = (v: unknown): v is Schema => typeof v === 'object' && v !== null && '_zod' in v;

/** Exported schema names that hold truth, from a module namespace (`import * as schema from '@gm/schema'`). */
export function truthSymbols(moduleExports: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(moduleExports).filter(([, v]) => isSchema(v) && holdsTruth(v)).map(([k]) => k).sort();
}

/** Blanks comments and the contents of strings, keeping line breaks, so prose cannot trip the scan. */
export function codeOnly(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!, d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      out += c; i++;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; else if (src[i] === '\n') out += '\n'; i++; }
      out += c; i++;
      continue;
    }
    out += c; i++;
  }
  return out;
}

export interface StaticViolation { file: string; line: number; symbol: string; rule: 'truth type' | 'world state' }

export interface StaticAuditOptions {
  /** `file#symbol` pairs allowed by review, for example the one substitution function of K3.3.1. */
  readonly allow?: readonly string[];
}

/** Every use of a truth symbol or a world-state symbol in one source file. Empty is the pass mark. */
export function auditSource(file: string, text: string, truth: readonly string[], opts: StaticAuditOptions = {}): StaticViolation[] {
  const code = codeOnly(text);
  const out: StaticViolation[] = [];
  const scan = (symbols: readonly string[], rule: StaticViolation['rule']) => {
    if (!symbols.length) return;
    const re = new RegExp(`(?<![\\w$])(${symbols.map((s) => s.replace(/[$]/g, '\\$')).join('|')})(?![\\w$])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      if (opts.allow?.includes(`${file}#${m[1]}`)) continue;
      out.push({ file, line: code.slice(0, m.index).split('\n').length, symbol: m[1]!, rule });
    }
  };
  scan(truth, 'truth type');
  scan(WORLD_STATE_SYMBOLS, 'world state');
  return out;
}
