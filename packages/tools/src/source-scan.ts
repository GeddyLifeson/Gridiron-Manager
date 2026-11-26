// Small TypeScript source scanner for the lints: strips comments and string contents so token rules
// do not fire on prose, and lists import specifiers.
export function stripCommentsAndStrings(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!, d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += q; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; else if (src[i] === '\n') out += '\n'; i++; }
      out += q; i++;
      continue;
    }
    out += c; i++;
  }
  return out;
}

/** Import and export-from specifiers, plus dynamic import() and require() with literal arguments. */
export function importSpecifiers(src: string): { spec: string; line: number; typeOnly: boolean }[] {
  const out: { spec: string; line: number; typeOnly: boolean }[] = [];
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');
  const re = /(?:^|\n|;)\s*(import|export)\s+(type\s+)?(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments))) {
    const spec = m[3] ?? m[4] ?? m[5];
    if (!spec) continue;
    const line = noComments.slice(0, m.index).split('\n').length + (noComments[m.index] === '\n' ? 1 : 0);
    out.push({ spec, line, typeOnly: !!m[2] });
  }
  return out;
}

export function lineOf(src: string, index: number): number {
  return src.slice(0, index).split('\n').length;
}
