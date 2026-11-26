import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ParamFile } from '@gm/schema';
import {
  buildMarkings, markingStatus, PRO_MARKINGS, DEFAULT_MARKERS, markerFor, contrastRatio, resolveTeamColours,
  fieldPalette, PARAMS,
} from '../../src/field-view/index.ts';
import { PRO } from './fixtures.ts';

describe('field markings (I9.1.1, Rule 1 Section 2)', () => {
  const m = buildMarkings(PRO);
  it('draws a yard line every 5 yd between the goal lines and hashes at the rule-set inbounds lines', () => {
    expect(m.lines.length / 4).toBe(6 + 19);
    const ys = new Set<number>();
    for (let i = 0; i < m.ticks.length; i += 4) ys.add(Math.round(((m.ticks[i + 1]! + m.ticks[i + 3]!) / 2) * 1000) / 1000);
    expect(ys.has(Math.round(PRO.hashSouthY * 1000) / 1000)).toBe(true);
    expect(ys.has(Math.round(PRO.hashNorthY * 1000) / 1000)).toBe(true);
  });
  it('numbers the yard lines by J1.1.1 (10 to 50 to 10), bottoms 12 yd from each sideline', () => {
    const south = m.numbers.filter((n) => n.bottomToward === 'south').map((n) => n.text);
    expect(south).toEqual(['10', '20', '30', '40', '50', '40', '30', '20', '10']);
    expect(m.numbers[0]!.y - m.numeralLengthYd / 2).toBeCloseTo(12, 9);
  });
  it('prints the markings as PROVISIONAL until three sources back them (Q6.3.1)', () => {
    expect(markingStatus(PRO_MARKINGS)).toBe('PROVISIONAL');
  });
  it('holds no literal field dimension in the view code (J1.1.1 acceptance 3)', () => {
    const dir = join(__dirname, '../../src/field-view');
    for (const f of readdirSync(dir).filter((x) => /\.(ts|tsx)$/.test(x))) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/53\.3|23\.58|29\.75|\b120\b|\b160\b|70\.75/);
    }
  });
});

describe('marker table (O6.3.1, O2.3.2)', () => {
  it('maps every role in the table to a group with a style', () => {
    for (const role of Object.keys(DEFAULT_MARKERS.roles)) expect(() => markerFor(role, true)).not.toThrow();
  });
  it('tells offense from defense without colour (greyscale test)', () => {
    const off = new Set<string>(), def = new Set<string>();
    for (const [role, group] of Object.entries(DEFAULT_MARKERS.roles)) {
      if (group === 'ST') continue; // specialists are a small square on both sides, by the table
      const s = markerFor(role, true).style;
      (['CB', 'S', 'LB', 'DL'].includes(group) ? def : off).add(s.shape);
    }
    for (const shape of off) expect(def.has(shape)).toBe(false);
    expect(markerFor('XYZ', true).style.shape).toBe('circle');
    expect(markerFor('XYZ', false).style.shape).toBe('triangle');
  });
});

describe('team colours (I9.1.1)', () => {
  it('computes the WCAG contrast ratio', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 9);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 9);
  });
  it('keeps colours that pass 3:1, else swaps to the away alternate, else the colour-blind-safe pair', () => {
    expect(resolveTeamColours({ primary: '#ffffff', alternate: '#000000' }, { primary: '#000000', alternate: '#ffffff' }).source).toBe('primary');
    expect(resolveTeamColours({ primary: '#ffffff', alternate: '#000000' }, { primary: '#eeeeee', alternate: '#000000' }).source).toBe('awayAlternate');
    const pal = fieldPalette('light');
    const bad = resolveTeamColours({ primary: pal.turf, alternate: pal.turf }, { primary: pal.turf, alternate: pal.turf });
    expect(bad.source).toBe('colourBlindSafe');
    expect(bad.sides).toEqual([pal.safeDark, pal.safeLight]);
    expect(contrastRatio(pal.safeLight, pal.turf)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(pal.safeDark, pal.safeLight)).toBeGreaterThanOrEqual(3);
    expect(resolveTeamColours({ primary: '#ffffff', alternate: '#000000' }, { primary: '#000000', alternate: '#ffffff' }, { colourBlindSafe: true }).source).toBe('colourBlindSafe');
  });
});

describe('tuning constants', () => {
  it('is a valid ParamFile with a basis on every row', () => {
    const parsed = ParamFile.parse(JSON.parse(JSON.stringify(PARAMS)));
    expect(parsed.params.every((p) => p.basis === 'assumption' || /^[A-Z]\d/.test(p.leaf))).toBe(true);
    for (const p of parsed.params) expect(p.value >= p.min && p.value <= p.max, p.name).toBe(true);
  });
});

describe('colours come from the token file (O6.2.1)', () => {
  it('builds a palette for every theme and colour-vision setting', () => {
    for (const theme of ['light', 'dark', 'high-contrast'] as const) for (const v of ['none', 'protan', 'deutan', 'tritan'] as const) {
      const pal = fieldPalette(theme, v);
      for (const [k, c] of Object.entries(pal)) expect(c, `${theme} ${v} ${k}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('outlines a side that cannot reach 3:1 on the turf', () => {
    const pal = fieldPalette('high-contrast');
    const r = resolveTeamColours({ primary: pal.turf, alternate: pal.turf }, { primary: pal.turf, alternate: pal.turf }, { palette: pal });
    expect(r.outlined[0]).toBe(contrastRatio(pal.safeDark, pal.turf) < 3);
    expect(r.outlined[1]).toBe(false);
  });
});
