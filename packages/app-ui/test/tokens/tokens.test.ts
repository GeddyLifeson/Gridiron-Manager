// O6.2.1 and O5.5.1 / Q1.5.1 token level: contrast in every theme and palette, theme switch, and no
// literal colour in component code.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  TOKENS, THEME_IDS, COLOUR_VISION_IDS, TOKEN_GROUPS, checkContrast, contrastRatio, relativeLuminance, resolveColours, tokenVariables, tokenCss, cssVar, type TokenFile,
} from '../../src/tokens/index.ts';

describe('contrast (O5.5.1, WCAG 2.2 SC 1.4.3)', () => {
  it('matches the WCAG reference points', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 12);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2); // the well-known just-failing grey
  });
  it('every declared pair meets its floor in every theme and colour-vision palette', () => {
    expect(checkContrast()).toEqual([]);
  });
  it('a grey-on-grey test theme fails (Q1.5.1 acceptance)', () => {
    const grey = structuredClone(TOKENS) as TokenFile;
    grey.themes.light.text.ink = '#999999';
    grey.themes.light.surface.panel = '#aaaaaa';
    const fails = checkContrast(grey);
    expect(fails.some((f) => f.theme === 'light' && f.fg === 'text.ink' && f.bg === 'surface.panel')).toBe(true);
  });
});

describe('token file (O6.2.1)', () => {
  it('every theme defines every group with the same keys', () => {
    const keys = (th: (typeof THEME_IDS)[number]) => TOKEN_GROUPS.map((g) => `${g}:${Object.keys(TOKENS.themes[th][g]).sort().join(',')}`);
    for (const th of THEME_IDS) expect(keys(th)).toEqual(keys('light'));
  });
  it('colour-vision blocks only override keys the base has, and change something', () => {
    for (const cv of COLOUR_VISION_IDS.filter((x) => x !== 'none')) for (const base of ['light', 'dark'] as const) {
      const over = TOKENS.colourVision[cv as 'protan'][base];
      for (const [g, kv] of Object.entries(over)) for (const k of Object.keys(kv!)) expect(TOKENS.themes[base][g as 'state'][k], `${cv}.${base}.${g}.${k}`).toBeDefined();
      expect(resolveColours(base, cv)).not.toEqual(resolveColours(base, 'none'));
    }
  });
  it('switching theme changes the variables at once, with no other input', () => {
    const light = tokenVariables({ theme: 'light' }), dark = tokenVariables({ theme: 'dark' });
    expect(light[cssVar('surface.bg')]).not.toBe(dark[cssVar('surface.bg')]);
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
    expect(tokenCss({ theme: 'high-contrast' })).toContain('--gm-text-ink: #ffffff;');
  });
  it('interface and text scale move sizes; the 4 px unit and 24 px rows are the O6.1.2 values', () => {
    expect(tokenVariables({ theme: 'light' })['--gm-space']).toBe('4px');
    expect(tokenVariables({ theme: 'light' })['--gm-row']).toBe('24px');
    expect(tokenVariables({ theme: 'light', interfaceScalePct: 200 })['--gm-row']).toBe('48px');
    expect(tokenVariables({ theme: 'light', textScalePct: 150 })['--gm-type-md']).toBe('21px');
  });
});

describe('no literal colour in component code (O6.2.1 lint)', () => {
  const root = join(import.meta.dirname, '../../src');
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
  walk(root);
  /**
   * Files allowed to hold literal colours. `tokens/` is the token source. Files waiting to move onto
   * the tokens are listed by name, and each listed file must still exist so the list cannot go stale
   * silently. The field view moved onto the tokens in G-03's follow-up; the list is empty.
   */
  const PENDING_TOKEN_MIGRATION: string[] = [];
  const allowed = (p: string) => { const r = relative(root, p).split('\\').join('/'); return r.startsWith('tokens/') || PENDING_TOKEN_MIGRATION.includes(r); };
  it('every file on the pending-migration list exists', () => {
    for (const f of PENDING_TOKEN_MIGRATION) expect(files.map((x) => relative(root, x).split('\\').join('/'))).toContain(f);
  });
  const literal = /#[0-9a-fA-F]{3,8}\b(?![\w-])|\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|oklab)\(|(?:color|background|background-color|border(?:-\w+)?|fill|stroke|outline)\s*:\s*['"]?(?:white|black|red|green|blue|gray|grey|yellow|orange|purple|pink|brown|navy|silver)\b/;
  it('scans at least the shell files', () => { expect(files.filter((f) => !allowed(f)).length).toBeGreaterThan(5); });
  for (const f of files.filter((x) => !allowed(x))) {
    it(relative(root, f), () => {
      const lines = readFileSync(f, 'utf8').split('\n');
      const bad = lines.map((l, i) => [i + 1, l] as const).filter(([, l]) => literal.test(l) && !/^\s*\/\//.test(l));
      expect(bad.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
    });
  }
});
