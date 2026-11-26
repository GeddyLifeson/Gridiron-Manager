// Content tests of the vocabulary file (Q1.2.1, J4.1.2 acceptance): the file and the
// implementations name exactly the same things, every entry has a glossary line, and the behavior
// table is complete for every universal event (J4.2.1 acceptance).
import { describe, expect, it } from 'vitest';
import { BEHAVIORS, ParamFile, RuleKeyManifest } from '@gm/schema';
import {
  ACTIONS, CONDITIONS, INSTANT_ACTIONS, PARAMS, PARAM_FILES, RULE_KEYS, UNIVERSAL_EVENTS, VOCABULARY, checkVocabulary, constsOf, isSelector,
  namesTrueState, validateAssignment,
} from '../../src/lang/index.ts';
import { paramTableOf } from '../../src/legality/index.ts';
import { ALWAYS, assignment, when } from './world.ts';

describe('vocabulary file', () => {
  it('is well formed, and a malformed file is refused with the place named', () => {
    expect(checkVocabulary(VOCABULARY)).toEqual([]);
    const broken = JSON.parse(JSON.stringify(VOCABULARY)) as { conditions: Record<string, unknown>[]; behaviors: Record<string, unknown>[] };
    delete broken.conditions[0]!['glossary'];
    broken.conditions[1]!['phase'] = 'sometimes';
    broken.behaviors[1]!['extra'] = 1;
    const problems = checkVocabulary(broken);
    expect(problems.some((p) => p.includes('conditions[read].glossary'))).toBe(true);
    expect(problems.some((p) => p.includes('.phase'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown key extra'))).toBe(true);
  });

  it('every condition in the file has exactly one implementation, and the reverse', () => {
    expect(VOCABULARY.conditions.map((c) => c.name).sort()).toEqual(Object.keys(CONDITIONS).sort());
    expect(new Set(VOCABULARY.conditions.map((c) => c.name)).size).toBe(VOCABULARY.conditions.length);
  });

  it('every action in the file has exactly one implementation, and the reverse', () => {
    expect(VOCABULARY.actions.map((a) => a.name).sort()).toEqual(Object.keys(ACTIONS).sort());
    expect(new Set(VOCABULARY.actions.map((a) => a.name)).size).toBe(VOCABULARY.actions.length);
    for (const name of INSTANT_ACTIONS) expect(ACTIONS[name]).toBeDefined();
  });

  it('every entry, selector, and argument has what the designer needs: a glossary line and a bible leaf', () => {
    for (const e of [...VOCABULARY.conditions, ...VOCABULARY.actions, ...VOCABULARY.behaviors]) {
      expect(e.glossary.length, e.name).toBeGreaterThan(10);
      expect(e.leaf, e.name).toMatch(/^[A-Z]\d+(\.\d+)*/);
    }
    for (const s of [...VOCABULARY.selectors.fixed, ...VOCABULARY.selectors.prefixes]) expect(VOCABULARY.selectors.glossary[s], s).toBeTruthy();
    for (const e of [...VOCABULARY.conditions, ...VOCABULARY.actions]) {
      for (const [name, spec] of Object.entries(e.args)) {
        if (spec.type === 'enum') expect(spec.options?.length, `${e.name}.${name}`).toBeGreaterThan(1);
        if (spec.type === 'number') { expect(spec.min, `${e.name}.${name}`).toBeDefined(); expect(spec.max, `${e.name}.${name}`).toBeDefined(); expect(spec.unit, `${e.name}.${name}`).toBeDefined(); }
      }
    }
  });

  it('the behavior table matches the contract catalogue and answers every universal event (J4.2.1 acceptance)', () => {
    expect(VOCABULARY.behaviors.map((b) => b.name)).toEqual([...BEHAVIORS]);
    expect(VOCABULARY.universalEvents).toEqual([...UNIVERSAL_EVENTS]);
    for (const b of VOCABULARY.behaviors) {
      expect(Object.keys(b.events).sort(), b.name).toEqual([...UNIVERSAL_EVENTS].sort());
      expect(new Set(b.states).size, b.name).toBe(b.states.length);
      for (const call of [b.default, ...Object.values(b.events)]) {
        // The default and each event answer are themselves valid vocabulary.
        const a = assignment({ rules: [when(ALWAYS, [{ name: call.action, args: { ...call.args } }])] });
        expect(validateAssignment(a), `${b.name}: ${call.action}`).toEqual([]);
        if (call.state !== undefined) expect(b.states, `${b.name}: ${call.action}`).toContain(call.state);
      }
      // The whistle stops every behavior.
      expect(b.events['whistle']!.action, b.name).toBe('stop');
    }
  });

  it('states that actions name exist in the behavior they name', () => {
    for (const a of VOCABULARY.actions) {
      for (const [behavior, state] of Object.entries(a.state ?? {})) {
        const b = VOCABULARY.behaviors.find((x) => x.name === behavior);
        expect(b, `${a.name}: ${behavior}`).toBeDefined();
        expect(b!.states, `${a.name}: ${behavior}`).toContain(state);
      }
    }
  });

  it('no word of the vocabulary names true state, and what conditions read are perceived things', () => {
    const names = [
      ...VOCABULARY.conditions.flatMap((c) => [c.name, ...Object.keys(c.args), ...Object.values(c.args).flatMap((s) => s.options ?? [])]),
      ...VOCABULARY.actions.flatMap((a) => [a.name, ...Object.keys(a.args), ...Object.values(a.args).flatMap((s) => s.options ?? [])]),
      ...VOCABULARY.behaviors.flatMap((b) => [b.name, ...b.states]), ...VOCABULARY.selectors.fixed, ...VOCABULARY.gaze, ...VOCABULARY.techniqueSlots,
    ];
    expect(names.filter(namesTrueState)).toEqual([]);
    const perceived = ['playRead', 'carrier', 'receivers', 'defense', 'offense', 'man', 'ball', 'qb', 'self', 'call', 'fact'];
    for (const c of VOCABULARY.conditions) for (const r of c.reads) expect(r.startsWith('arg:') || perceived.includes(r), `${c.name}: ${r}`).toBe(true);
    for (const s of VOCABULARY.selectors.fixed) expect(isSelector(s)).toBe(true);
  });

  it('selectors: fixed names, slots, roles and receiver numbers are well formed; anything else is not', () => {
    for (const ok of ['self', 'ball', 'qb', 'man', 'slot:0', 'slot:21', 'role:Mike', '#1', '#3:left', '#2:away', 'final#2', 'final#3:right']) expect(isSelector(ok), ok).toBe(true);
    for (const bad of ['slot:22', 'slot:-1', 'slot:x', '#0', '#9', '#2:up', 'last#2', 'truePosition', 'player:4', '']) expect(isSelector(bad), bad).toBe(false);
  });
});

describe('parameters and rule keys of the language module', () => {
  it('the parameter file and the rule-key manifest are valid, and every value sits inside its range', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    expect(() => RuleKeyManifest.parse(RULE_KEYS)).not.toThrow();
    for (const p of PARAMS.params) { expect(p.value, p.name).toBeGreaterThanOrEqual(p.min); expect(p.value, p.name).toBeLessThanOrEqual(p.max); }
    expect(new Set(PARAMS.params.map((p) => p.name)).size).toBe(PARAMS.params.length);
  });

  it('every constant the compiler reads is in the file, and every parameter in the file is read', () => {
    const read = new Set<string>();
    const table = paramTableOf(PARAM_FILES);
    constsOf({ version: table.version, has: table.has, num: (name) => { read.add(name); return table.num(name); } });
    expect(PARAMS.params.map((p) => p.name).filter((n) => !read.has(n))).toEqual([]);
    expect([...read].filter((n) => !PARAMS.params.some((p) => p.name === n))).toEqual([]);
  });

  it('values the bible states are marked as from the bible; the rest are marked as assumptions', () => {
    const bible = PARAMS.params.filter((p) => p.basis === 'bible').map((p) => p.name).sort();
    expect(bible).toEqual(['lang.decide.hysteresisTicks', 'lang.eyes.coneCos', 'lang.leverage.marginYd', 'lang.path.passRadiusYd']);
    for (const p of PARAMS.params) expect(['bible', 'assumption']).toContain(p.basis);
  });
});
