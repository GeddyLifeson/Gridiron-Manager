// P4.6.1 build check: "All user-visible text in the game comes from templates. A build check finds
// literal display strings in app-ui." Finds JSX text with letters and literal display attributes
// (title, label, placeholder, alt, aria-label) in .tsx files. Wiring it into `npm run lint` is the
// integrator's (packages/tools/src/lint.ts); until every screen renders through templates it reports
// without failing.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface LiteralString { readonly file: string; readonly line: number; readonly text: string }

const ATTR = /\b(title|label|placeholder|alt|aria-label)\s*=\s*(["'])([^"']*[A-Za-z][^"']*)\2/g;
const JSX_TEXT = />([^<>{}]*[A-Za-z][^<>{}]*)</g;

export function scanSource(src: string): { line: number; text: string }[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
  const out: { line: number; text: string }[] = [];
  const lineAt = (i: number) => code.slice(0, i).split('\n').length;
  let m: RegExpExecArray | null;
  while ((m = ATTR.exec(code))) out.push({ line: lineAt(m.index), text: m[3]!.trim() });
  while ((m = JSX_TEXT.exec(code))) {
    const t = m[1]!.trim();
    // Generic type arguments and comparisons look like `>x<` too; JSX text has no code punctuation.
    if (!t || /[;=()&|]|=>/.test(t)) continue;
    out.push({ line: lineAt(m.index), text: t });
  }
  return out.sort((a, b) => a.line - b.line);
}

export function scanLiteralDisplayStrings(root: string, dir = 'packages/app-ui/src'): LiteralString[] {
  const base = join(root, dir);
  const out: LiteralString[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.tsx')) for (const hit of scanSource(readFileSync(p, 'utf8'))) out.push({ file: relative(root, p), ...hit });
    }
  };
  walk(base);
  return out;
}
