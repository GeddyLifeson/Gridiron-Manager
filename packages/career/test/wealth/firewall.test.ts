// E6.12.1 acceptance 1: a static dependency check fails the build if a forbidden module imports wealth.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { FORBIDDEN_PACKAGES, PERMITTED_CAREER_MODULES, PROTECTED_SHAPES } from '../../src/wealth/index.ts';

const ROOT = join(__dirname, '../../../..');
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p, out); } else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}
const importsOf = (src: string) => [...src.matchAll(/(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);

describe('E6.12.1 money never changes football', () => {
  it('no forbidden package imports @gm/career at all', () => {
    const bad: string[] = [];
    for (const pkg of FORBIDDEN_PACKAGES) for (const f of walk(join(ROOT, 'packages', pkg, 'src'))) {
      if (importsOf(readFileSync(f, 'utf8')).some((s) => s === '@gm/career' || s.startsWith('@gm/career/'))) bad.push(relative(ROOT, f));
    }
    expect(bad).toEqual([]);
  });
  it('inside career, only permitted modules import the wealth module', () => {
    const bad: string[] = [];
    const src = join(ROOT, 'packages/career/src');
    for (const f of walk(src)) {
      const rel = relative(src, f);
      const mod = rel.includes(sep) ? rel.split(sep)[0]! : '(root)';
      if (mod === '(root)' || PERMITTED_CAREER_MODULES.includes(mod)) continue;
      if (importsOf(readFileSync(f, 'utf8')).some((s) => /(^|\/)wealth(\/|$)/.test(s))) bad.push(rel);
    }
    expect(bad).toEqual([]);
  });
  it('the wealth module reads nothing from football: it imports only @gm/schema and its own files', () => {
    for (const f of walk(join(ROOT, 'packages/career/src/wealth'))) {
      for (const s of importsOf(readFileSync(f, 'utf8'))) expect(s === '@gm/schema' || s.startsWith('./'), `${relative(ROOT, f)}: ${s}`).toBe(true);
    }
  });
  it('protected shapes are named so screens and the observer filter can find them', () => {
    expect(PROTECTED_SHAPES).toContain('BalanceSheet');
    expect(PROTECTED_SHAPES).toContain('SecurityStatus');
  });
});
