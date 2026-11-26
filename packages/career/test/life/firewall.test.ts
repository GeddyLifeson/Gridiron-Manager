// E8.5.1 and E7.4.2 dependency tests, Q6 facts, PARAMS, and the realism switches.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { FactFile, computeStatus, scanForbiddenJson, ParamFile } from '@gm/schema';
import factsJson from '../../src/life/facts.json' with { type: 'json' };
import tablesJson from '../../src/life/tables.json' with { type: 'json' };
import {
  LIFE_FORBIDDEN_PACKAGES, LIFE_PERMITTED_CAREER_MODULES, SLEEP_DEBT_READERS, LIFE_FACTS, PARAMS, param, realismKey, DEFAULT_LIFE_REALISM,
  lifeFactNumber, FACT_LONG_HOURS, FACT_SLEEP_MIN, HEALTH_ABSENCE_LOWERS_CONFIDENCE,
} from '../../src/life/index.ts';

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

describe('E8.5.1 the firewall', () => {
  it('no forbidden package imports @gm/career', () => {
    const bad: string[] = [];
    for (const pkg of LIFE_FORBIDDEN_PACKAGES) for (const f of walk(join(ROOT, 'packages', pkg, 'src'))) {
      if (importsOf(readFileSync(f, 'utf8')).some((s) => s === '@gm/career' || s.startsWith('@gm/career/'))) bad.push(relative(ROOT, f));
    }
    expect(bad).toEqual([]);
  });
  it('inside career, only permitted modules import life', () => {
    const bad: string[] = [];
    const src = join(ROOT, 'packages/career/src');
    for (const f of walk(src)) {
      const rel = relative(src, f);
      const mod = rel.includes(sep) ? rel.split(sep)[0]! : '(root)';
      if (mod === '(root)' || LIFE_PERMITTED_CAREER_MODULES.includes(mod)) continue;
      if (importsOf(readFileSync(f, 'utf8')).some((s) => /(^|\/)life(\/|$)/.test(s))) bad.push(rel);
    }
    expect(bad).toEqual([]);
  });
  it('life reads nothing from football: it imports only @gm/schema and its own files', () => {
    for (const f of walk(join(ROOT, 'packages/career/src/life'))) {
      for (const s of importsOf(readFileSync(f, 'utf8'))) expect(s === '@gm/schema' || s.startsWith('./'), `${relative(ROOT, f)}: ${s}`).toBe(true);
    }
  });
  it('E7.4.1 acceptance 3: inside life, only the named files mention sleep debt', () => {
    for (const f of walk(join(ROOT, 'packages/career/src/life'))) {
      const name = f.split(sep).at(-1)!;
      if (/debtHours|debtStart|debtAtStart/.test(readFileSync(f, 'utf8'))) expect(SLEEP_DEBT_READERS, name).toContain(name);
    }
  });
  it('health absences do not lower owner confidence (E8.2.3 rule 6)', () => {
    expect(HEALTH_ABSENCE_LOWERS_CONFIDENCE).toBe(false);
  });
});

describe('Q6 facts and PARAMS', () => {
  it('fact rows parse, stored status equals computed status, both rows Verified', () => {
    FactFile.parse(factsJson);
    for (const r of LIFE_FACTS) expect(r.status, r.id).toBe(computeStatus(r));
    expect(LIFE_FACTS.map((r) => r.status)).toEqual(['Verified', 'Verified']);
  });
  it('design values that sit on a fact agree with it', () => {
    expect(param('sleepNeedHours')).toBeGreaterThanOrEqual(lifeFactNumber(FACT_SLEEP_MIN));
    expect(param('loadBand.heavy')).toBeGreaterThan(lifeFactNumber(FACT_LONG_HOURS));
  });
  it('PARAMS validates, names are unique, and the data has no forbidden keys', () => {
    ParamFile.parse(PARAMS);
    expect(new Set(PARAMS.params.map((p) => p.name)).size).toBe(PARAMS.params.length);
    for (const p of PARAMS.params) expect(p.value >= p.min && p.value <= p.max, p.name).toBe(true);
    expect(scanForbiddenJson('facts.json', factsJson)).toEqual([]);
    expect(scanForbiddenJson('tables.json', tablesJson)).toEqual([]);
  });
  it('the realism switches default to the bible and key into certified records', () => {
    expect(realismKey(DEFAULT_LIFE_REALISM)).toBe('life:t1h1s1');
    expect(realismKey({ gameDayTiredness: false, healthEvents: true, separation: false })).toBe('life:t0h1s0');
  });
});
