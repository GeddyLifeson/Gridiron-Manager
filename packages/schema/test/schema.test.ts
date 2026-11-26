import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { allSchemas, readModelSchemas, walkFields, scanForbiddenKeys, Person, computeStatus, pub } from '../src/index.ts';

describe('schema conventions (P3.1.2 acceptance)', () => {
  it('every field has a visibility class, and every numeric field a unit or scale', () => {
    const bad: string[] = [];
    for (const [name, s] of Object.entries(allSchemas())) {
      walkFields(s, (f) => {
        if (!f.meta?.vis) bad.push(`${name}${f.path}: no visibility`);
        if (f.type === 'number' && !f.meta?.unit) bad.push(`${name}${f.path}: number without unit`);
      });
    }
    expect(bad).toEqual([]);
  });
});

describe('truth never reaches a read model (P1.1.4, Q1.4.2)', () => {
  it('no read-model field has class truth', () => {
    const hits: string[] = [];
    for (const [name, s] of Object.entries(readModelSchemas())) walkFields(s, (f) => { if (f.meta?.vis === 'truth') hits.push(name + f.path); });
    expect(hits).toEqual([]);
  });
});

describe('forbidden keys (Q1.2.1, R1.2.1 item 5)', () => {
  it('no schema has coach points, experience, skill trees, perks, traits or difficulty', () => {
    expect(scanForbiddenKeys(allSchemas())).toEqual([]);
  });
  it('adding a difficulty field to any schema is caught', () => {
    const withDifficulty = z.object({ settings: pub(z.object({ difficulty: pub(z.string()) })) });
    expect(scanForbiddenKeys({ x: withDifficulty }).map((h) => h.key)).toContain('difficulty');
    const coach = z.object({ coaching: pub(z.object({ playCallingRating: pub(z.number(), 'ratio') })) });
    expect(scanForbiddenKeys({ y: coach }).length).toBeGreaterThan(0);
  });
  it('a user person with a hidden behaviour block is refused (P3.2.2 acceptance 3)', () => {
    const base = { id: 1, origin: 'user', name: { first: 'A', last: 'B' }, birthDate: { year: 1990, dayIndex: 0 }, appearanceSeed: 1, roles: ['coach'] };
    expect(Person.safeParse(base).success).toBe(true);
    expect(Person.safeParse({ ...base, coaching: { systemFamilies: {}, demonstratedRecord: {}, historyFacts: [], hidden: { aggression: 0.5 } } }).success).toBe(false);
    expect(Person.safeParse({ ...base, coaching: { systemFamilies: {}, demonstratedRecord: {}, historyFacts: [], skills: { x: 1 } } }).success).toBe(false);
  });
});

describe('fact status is computed (Q6.1.2 acceptance)', () => {
  const src = (g: string, primary = false) => ({ citation: 'c', locator: 'l', dateRead: '2026-11-25', howRead: primary ? 'primary text' as const : 'secondary summary' as const, independenceGroup: g, primary });
  it('two citations of one study count once', () => {
    expect(computeStatus({ sources: [src('a'), src('a')] })).toBe('1 of 3');
  });
  it('primary text alone is Rulebook only; primary plus one independent is Verified', () => {
    expect(computeStatus({ sources: [src('book', true)] })).toBe('Rulebook only');
    expect(computeStatus({ sources: [src('book', true), src('other')] })).toBe('Verified');
    expect(computeStatus({ sources: [src('a'), src('b'), src('c')] })).toBe('Verified');
  });
  it('a disagreeing source makes a Conflict', () => {
    expect(computeStatus({ value: 40, sources: [{ ...src('book', true), value: 40 }, { ...src('x'), value: 45 }] })).toBe('Conflict');
  });
  it('no source read is Unverified', () => {
    expect(computeStatus({ sources: [{ ...src('mem'), howRead: 'model knowledge' }] })).toBe('Unverified');
  });
});
