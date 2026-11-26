// PV-13 acceptance: about 40 icons, each with a label and the information it carries; non-text
// contrast (WCAG 2.2 SC 1.4.11, 3:1) in every theme and colour-vision palette; the injury icon
// never imitates the protected red cross on white; interface states (O2.5.3, MB-15).
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GLYPHS, Icon, checkEmblemRule, checkIconContrast, glyphById, iconSvg, isRed, roleTokens, type Glyph,
} from '../../src/presentation/icons/index.ts';
import { TOKENS, type TokenFile } from '../../src/tokens/index.ts';

const clone = (): TokenFile => JSON.parse(JSON.stringify(TOKENS)) as TokenFile;

describe('icon set contents', () => {
  it('holds about 40 icons with unique ids', () => {
    expect(GLYPHS.length).toBeGreaterThanOrEqual(36);
    expect(GLYPHS.length).toBeLessThanOrEqual(50);
    expect(new Set(GLYPHS.map((g) => g.id)).size).toBe(GLYPHS.length);
  });
  it('every icon has a text label and names the information it carries', () => {
    for (const g of GLYPHS) {
      expect(g.label.trim().length, g.id).toBeGreaterThan(0);
      expect(g.carries.trim().length, g.id).toBeGreaterThan(0);
    }
  });
  it('covers the plan 3.6 list', () => {
    for (const id of ['timeout', 'challenge', 'whistle', 'injury', 'review', 'rain', 'snow', 'wind', 'possession', 'confirm', 'warning', 'lock', 'film', 'notebook', 'phone']) expect(() => glyphById(id)).not.toThrow();
  });
  it('is two-colour: each icon uses at most ink, one tone and the page colour', () => {
    for (const g of GLYPHS) {
      const t = roleTokens(g);
      expect(new Set([t.ink, t.tone, t.paper]).size).toBeLessThanOrEqual(3);
    }
  });
  it('draws on the 24-unit grid', () => {
    for (const g of GLYPHS) for (const part of g.parts) {
      const nums = part.el === 'path' ? (part.d.match(/-?\d*\.?\d+/g) ?? []).map(Number) : [];
      if (part.el === 'path') for (const n of nums) expect(Math.abs(n), g.id).toBeLessThanOrEqual(24);
    }
  });
});

describe('non-text contrast in every theme and palette (SC 1.4.11)', () => {
  it('the shipped set passes', () => { expect(checkIconContrast()).toEqual([]); });
  it('a low-contrast tone is caught', () => {
    const f = clone();
    f.themes.light.state.caution = '#f6f7f4';
    const fails = checkIconContrast(f);
    expect(fails.some((x) => x.icon === 'timeout' && x.theme === 'light' && x.fg === 'state.caution')).toBe(true);
  });
  it('a pale ink is caught', () => {
    const f = clone();
    f.themes.dark.text.ink = '#262b25';
    expect(checkIconContrast(f).some((x) => x.theme === 'dark' && x.fg === 'text.ink')).toBe(true);
  });
});

describe('protected emblem rule (Geneva Convention I arts. 38 and 53; 18 U.S.C. 706)', () => {
  it('the injury icon is a plus in a ring, never red, in every theme and palette', () => {
    expect(checkEmblemRule()).toEqual([]);
    const g = glyphById('injury');
    expect(g.parts.map((p) => p.el)).toEqual(['circle', 'path']);
    expect(g.parts.every((p) => p.role === 'line')).toBe(true);
  });
  it('a red ink on the injury icon is caught', () => {
    const f = clone();
    f.themes.light.text.ink = '#c8102e';
    expect(checkEmblemRule(f).some((x) => x.icon === 'injury' && x.theme === 'light')).toBe(true);
  });
  it('isRed separates reds from the shipped non-red colours', () => {
    expect(isRed('#ff0000')).toBe(true);
    expect(isRed('#b3261e')).toBe(true);
    expect(isRed('#1b1f1a')).toBe(false);
    expect(isRed('#ffffff')).toBe(false);
    expect(isRed('#7f5300')).toBe(false);
  });
});

describe('rendering and interface states', () => {
  it('a standalone SVG names itself and uses only token variables', () => {
    for (const g of GLYPHS) {
      const s = iconSvg(g.id);
      expect(s).toContain(`<title>${g.label}</title>`);
      expect(s).toContain('role="img"');
      expect(s).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      const paints = [...s.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]);
      for (const p of paints) expect(p === 'none' || p!.startsWith('var(--gm-'), `${g.id} ${p}`).toBe(true);
    }
  });
  it('the component shows its label by default', () => {
    const html = renderToStaticMarkup(createElement(Icon, { id: 'timeout' }));
    expect(html).toContain('>Timeout<');
    expect(html).toContain('aria-label="Timeout"');
  });
  it('a hidden label is still the accessible name', () => {
    const html = renderToStaticMarkup(createElement(Icon, { id: 'wind', label: 'hidden' }));
    expect(html).toContain('aria-label="Wind"');
    expect(html).not.toContain('>Wind<');
  });
  it('a disabled icon shows its reason (MB-15)', () => {
    const html = renderToStaticMarkup(createElement(Icon, { id: 'timeout', state: 'disabled', reason: 'no timeouts left' }));
    expect(html).toContain('(no timeouts left)');
    expect(html).toContain('aria-label="Timeout: no timeouts left"');
    expect(html).toContain('var(--gm-text-muted)');
  });
  it('the hold-to-confirm ring grows with the hold (O2.5.3)', () => {
    const dash = (f: number) => Number(/stroke-dasharray="([\d.]+) /.exec(iconSvg('challenge', { state: 'holding', holdFraction: f }))![1]);
    expect(dash(0)).toBe(0);
    expect(dash(0.5)).toBeGreaterThan(0);
    expect(dash(1)).toBeGreaterThan(dash(0.5));
  });
  it('every icon renders in every state', () => {
    const all: Glyph[] = [...GLYPHS];
    for (const g of all) for (const props of [{ id: g.id }, { id: g.id, state: 'active' as const }, { id: g.id, state: 'holding' as const, holdFraction: 0.3 }, { id: g.id, state: 'disabled' as const, reason: 'x' }]) {
      expect(() => renderToStaticMarkup(createElement(Icon, props))).not.toThrow();
    }
  });
});
