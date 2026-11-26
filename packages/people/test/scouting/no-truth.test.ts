// "No true value reaches a read model" (G-19 acceptance; D6.1.1, X1.3.1, K9, Q1.4.1).
// Three checks: (1) the display and read-model files cannot reach the one file that reads truth;
// (2) the read model's only input, PersonView, has no truth-class field in the world contract;
// (3) the read model refuses a person record at compile time and its output carries no truth.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PersonView, walkFields } from '@gm/schema';
import { seedFromNumber, stream } from '@gm/engine-core';
import {
  DECIMAL_SCALE, evidenceItem, gradeCells, NO_LEAN, observe, priorFor, toPersonView, update, type Estimate,
} from '../../src/scouting/index.ts';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/scouting');
const TRUTH_READER = 'observe.ts';
/** Files a screen may reach. Each one, and everything it imports, must stay clear of truth. */
const READ_SIDE = ['view.ts', 'display.ts', 'scales.ts', 'belief.ts'];

function localImports(file: string): string[] {
  const code = readFileSync(join(SRC, file), 'utf8');
  return [...code.matchAll(/from\s+'\.\/([^']+)'/g)].map((m) => m[1]!);
}

function reach(start: string): Set<string> {
  const seen = new Set<string>();
  const todo = [start];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    todo.push(...localImports(f));
  }
  return seen;
}

describe('no true value reaches a read model', () => {
  it('display and read-model files never import the truth reader, directly or through another file', () => {
    expect(readdirSync(SRC)).toContain(TRUTH_READER);
    for (const f of READ_SIDE) expect([...reach(f)], f).not.toContain(TRUTH_READER);
  });
  it('read-side files name no truth-bearing record type', () => {
    for (const f of [...new Set(READ_SIDE.flatMap((x) => [...reach(x)]))]) {
      const code = readFileSync(join(SRC, f), 'utf8');
      expect(code, f).not.toMatch(/\b(PersonRecord|PlayingBlock|TrueTests|ScoutingBlock|TraitBlock|ceilings)\b/);
    }
  });
  it('PersonView, the read model input, has no truth-class field', () => {
    const truthFields: string[] = [];
    walkFields(PersonView, (f) => { if (f.meta?.vis === 'truth') truthFields.push(f.path); });
    expect(truthFields).toEqual([]);
  });
  it('a person record cannot be passed to the read model (compile-time check)', () => {
    const record = { id: 1, playing: { attributes: { pass_set: 61 } } };
    // @ts-expect-error a person record is not a PersonView: truth cannot be handed to the read model.
    expect(() => gradeCells(record, { scale: DECIMAL_SCALE, asOf: { seasonYear: 2030, dayIndex: 0 }, age: 25 })).toThrow();
  });
  it('end to end: the read model holds estimate fields only, and differs from truth by the estimate error', () => {
    const r = stream(seedFromNumber(4), 'no-truth', [4]);
    const D = { seasonYear: 2030, dayIndex: 10 };
    const truth = { pass_set: 61.3, anchor: 44.7 };
    const estimates: Record<string, Estimate> = {};
    for (const [attr, t] of Object.entries(truth)) {
      let e = priorFor({ positionLevelMean: 50, publicImplied: null, information: 'none', date: D });
      e = update(e, observe(t, { attribute: attr, source: 'game_film', units: 40, date: D, evaluator: { id: 5, line: 'ol' }, skill: 50, estimateMean: e.mean, opponent: null }, NO_LEAN, r), 25, () => 50);
      estimates[attr] = e;
    }
    // A user grade enters too: what the user said, not what is true.
    estimates.anchor = update(estimates.anchor!, evidenceItem({ attribute: 'anchor', source: 'game_film', units: 5, date: D, evaluator: { id: 1, line: 'user' }, skill: 50, estimateMean: 0, opponent: null }, 70), 25, () => 50);
    const view = toPersonView({ observerTeamId: 2, personId: 77, estimates });
    expect(PersonView.safeParse(view).success).toBe(true);
    const cells = gradeCells(view, { scale: DECIMAL_SCALE, asOf: D, age: 25 });
    expect(cells.map((c) => c.attribute)).toEqual(['anchor', 'pass_set']);
    for (const c of cells) {
      expect(Object.keys(c).sort()).toEqual(['as_of', 'attribute', 'bandText', 'confidence', 'cutHigh', 'cutLow', 'grader', 'high', 'label', 'legend', 'low', 'n', 'relative', 'source', 'state', 'text', 'value', 'watched']);
      expect(c.text).toMatch(/^\d\.\d \((thin look|fair look|well watched)\), /);
    }
  });
});
