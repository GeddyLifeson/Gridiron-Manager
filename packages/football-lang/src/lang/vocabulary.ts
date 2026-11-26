// The vocabulary of the assignment rule language (J4.1.2, J4.1.3, J4.2.1). It is a data file
// (`vocabulary.json`): the closed list of conditions, actions, behaviors, entity selectors, gaze
// rules and technique slots. Adding an entry needs an implementation in conditions.ts or
// actions.ts, a unit test and its glossary line (J4.1.2 acceptance); a test checks that the file
// and the implementations name exactly the same things.
import { BEHAVIORS, type Behavior } from '@gm/schema';
import vocabularyJson from './vocabulary.json' with { type: 'json' };

type ArgValue = string | number | boolean;

export interface ArgSpec {
  /** enum: one of `options`. number: within min and max. entity: a selector. name: an identifier. behavior: a J4.2.1 behavior. */
  readonly type: 'enum' | 'number' | 'boolean' | 'entity' | 'name' | 'behavior';
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly unit?: string;
  /** An argument with no default is required. */
  readonly default?: ArgValue;
}

export interface ConditionDef {
  readonly name: string;
  readonly group: string;
  /** `preSnap` conditions are false once the ball is snapped; `live` ones are false before it. */
  readonly phase: 'preSnap' | 'live' | 'both';
  readonly args: Readonly<Record<string, ArgSpec>>;
  /** Perceived entities the condition reads; the attention set (J3.1.2) is derived from these. */
  readonly reads: readonly string[];
  readonly glossary: string;
  readonly leaf: string;
}

export interface ActionDef {
  readonly name: string;
  readonly group: string;
  readonly args: Readonly<Record<string, ArgSpec>>;
  readonly glossary: string;
  readonly leaf: string;
  /** Behavior state the action puts the player in, per behavior (J4.2.1). */
  readonly state?: Readonly<Record<string, string>>;
}

export interface ActionCall { readonly action: string; readonly args: Readonly<Record<string, ArgValue>>; readonly state?: string }

export const UNIVERSAL_EVENTS = ['ballThrown', 'ballCaught', 'changeOfPossession', 'fumble', 'whistle'] as const;
export type UniversalEvent = (typeof UNIVERSAL_EVENTS)[number];

export interface BehaviorDef {
  readonly name: string;
  readonly states: readonly string[];
  /** Conduct with no matching rule (J4.2.1). */
  readonly default: ActionCall;
  /** What happens on each universal event (J4.2.1, J4.2.2). */
  readonly events: Readonly<Record<string, ActionCall>>;
  readonly glossary: string;
  readonly leaf: string;
  /** Bible category that owns the detailed conduct, when it is not this one. */
  readonly owner?: string;
}

export interface Vocabulary {
  readonly version: string;
  readonly leaf: string;
  readonly universalEvents: readonly string[];
  readonly selectors: {
    readonly fixed: readonly string[];
    readonly prefixes: readonly string[];
    readonly receiver: { readonly numbers: readonly number[]; readonly sides: readonly string[]; readonly finalPrefix: string };
    readonly glossary: Readonly<Record<string, string>>;
  };
  readonly gaze: readonly string[];
  readonly techniqueSlots: readonly string[];
  /** Words that name true state. A rule that uses one is refused (J3.1.1, J4.1.2). */
  readonly trueStateWords: readonly string[];
  readonly conditions: readonly ConditionDef[];
  readonly actions: readonly ActionDef[];
  readonly behaviors: readonly BehaviorDef[];
}

const ARG_TYPES = ['enum', 'number', 'boolean', 'entity', 'name', 'behavior'];
const ARG_KEYS = ['type', 'options', 'min', 'max', 'unit', 'default'];

/**
 * Checks the shape of a vocabulary file and returns every problem found. The package may import
 * only @gm/schema (P1.2.2), so the check is written out here instead of using a schema library.
 */
export function checkVocabulary(input: unknown): string[] {
  const problems: string[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const isStr = (v: unknown): v is string => typeof v === 'string';
  const strs = (v: unknown, at: string): void => { if (!Array.isArray(v) || !v.every(isStr)) problems.push(`${at}: expected a list of strings`); };
  const keys = (o: Record<string, unknown>, need: readonly string[], may: readonly string[], at: string): void => {
    for (const k of need) if (o[k] === undefined) problems.push(`${at}: missing ${k}`);
    for (const k of Object.keys(o)) if (!need.includes(k) && !may.includes(k)) problems.push(`${at}: unknown key ${k}`);
  };
  const argSpecs = (v: unknown, at: string): void => {
    if (!isObj(v)) { problems.push(`${at}: expected args`); return; }
    for (const [name, spec] of Object.entries(v)) {
      const here = `${at}.${name}`;
      if (!isObj(spec)) { problems.push(`${here}: expected an argument spec`); continue; }
      keys(spec, ['type'], ARG_KEYS, here);
      if (!isStr(spec['type']) || !ARG_TYPES.includes(spec['type'])) problems.push(`${here}: unknown type`);
      if (spec['type'] === 'enum') strs(spec['options'], `${here}.options`);
      for (const n of ['min', 'max']) if (spec[n] !== undefined && typeof spec[n] !== 'number') problems.push(`${here}.${n}: expected a number`);
      const d = spec['default'];
      if (d !== undefined && typeof d !== 'string' && typeof d !== 'number' && typeof d !== 'boolean') problems.push(`${here}.default: expected a plain value`);
    }
  };
  const call = (v: unknown, at: string): void => {
    if (!isObj(v)) { problems.push(`${at}: expected an action call`); return; }
    keys(v, ['action', 'args'], ['state'], at);
    if (!isStr(v['action'])) problems.push(`${at}.action: expected a string`);
    if (!isObj(v['args'])) problems.push(`${at}.args: expected an object`);
    if (v['state'] !== undefined && !isStr(v['state'])) problems.push(`${at}.state: expected a string`);
  };
  if (!isObj(input)) return ['vocabulary: expected an object'];
  keys(input, ['version', 'leaf', 'universalEvents', 'selectors', 'gaze', 'techniqueSlots', 'trueStateWords', 'conditions', 'actions', 'behaviors'], [], 'vocabulary');
  for (const k of ['version', 'leaf']) if (!isStr(input[k])) problems.push(`${k}: expected a string`);
  for (const k of ['universalEvents', 'gaze', 'techniqueSlots', 'trueStateWords']) strs(input[k], k);
  const sel = input['selectors'];
  if (!isObj(sel)) problems.push('selectors: expected an object');
  else {
    keys(sel, ['fixed', 'prefixes', 'receiver', 'glossary'], [], 'selectors');
    strs(sel['fixed'], 'selectors.fixed'); strs(sel['prefixes'], 'selectors.prefixes');
    const r = sel['receiver'];
    if (!isObj(r)) problems.push('selectors.receiver: expected an object');
    else {
      keys(r, ['numbers', 'sides', 'finalPrefix'], [], 'selectors.receiver');
      if (!Array.isArray(r['numbers']) || !r['numbers'].every((n) => Number.isInteger(n))) problems.push('selectors.receiver.numbers: expected whole numbers');
      strs(r['sides'], 'selectors.receiver.sides');
      if (!isStr(r['finalPrefix'])) problems.push('selectors.receiver.finalPrefix: expected a string');
    }
    if (!isObj(sel['glossary']) || !Object.values(sel['glossary']).every(isStr)) problems.push('selectors.glossary: expected strings');
  }
  const each = (k: string, visit: (o: Record<string, unknown>, at: string) => void): void => {
    const list = input[k];
    if (!Array.isArray(list)) { problems.push(`${k}: expected a list`); return; }
    list.forEach((o: unknown, i) => {
      const at = `${k}[${isObj(o) && isStr(o['name']) ? o['name'] : i}]`;
      if (!isObj(o)) { problems.push(`${at}: expected an object`); return; }
      for (const s of ['name', 'glossary', 'leaf']) if (!isStr(o[s]) || o[s] === '') problems.push(`${at}.${s}: expected text`);
      visit(o, at);
    });
  };
  each('conditions', (o, at) => {
    keys(o, ['name', 'group', 'phase', 'args', 'reads', 'glossary', 'leaf'], [], at);
    if (!isStr(o['group'])) problems.push(`${at}.group: expected a string`);
    if (o['phase'] !== 'preSnap' && o['phase'] !== 'live' && o['phase'] !== 'both') problems.push(`${at}.phase: unknown phase`);
    argSpecs(o['args'], `${at}.args`); strs(o['reads'], `${at}.reads`);
  });
  each('actions', (o, at) => {
    keys(o, ['name', 'group', 'args', 'glossary', 'leaf'], ['state'], at);
    if (!isStr(o['group'])) problems.push(`${at}.group: expected a string`);
    argSpecs(o['args'], `${at}.args`);
    if (o['state'] !== undefined && (!isObj(o['state']) || !Object.values(o['state']).every(isStr))) problems.push(`${at}.state: expected strings`);
  });
  each('behaviors', (o, at) => {
    keys(o, ['name', 'states', 'default', 'events', 'glossary', 'leaf'], ['owner'], at);
    strs(o['states'], `${at}.states`);
    if (Array.isArray(o['states']) && o['states'].length === 0) problems.push(`${at}.states: needs at least one state`);
    call(o['default'], `${at}.default`);
    if (!isObj(o['events'])) problems.push(`${at}.events: expected an object`);
    else for (const [e, c] of Object.entries(o['events'])) call(c, `${at}.events.${e}`);
    if (o['owner'] !== undefined && !isStr(o['owner'])) problems.push(`${at}.owner: expected a string`);
  });
  return problems;
}

function load(input: unknown): Vocabulary {
  const problems = checkVocabulary(input);
  if (problems.length > 0) throw new Error(`vocabulary.json is malformed: ${problems.join('; ')}`);
  return input as Vocabulary;
}

export const VOCABULARY: Vocabulary = load(vocabularyJson);

export const CONDITION_DEFS: ReadonlyMap<string, ConditionDef> = new Map(VOCABULARY.conditions.map((c) => [c.name, c]));
export const ACTION_DEFS: ReadonlyMap<string, ActionDef> = new Map(VOCABULARY.actions.map((a) => [a.name, a]));
export const BEHAVIOR_DEFS: ReadonlyMap<string, BehaviorDef> = new Map(VOCABULARY.behaviors.map((b) => [b.name, b]));

export function isBehavior(name: string): name is Behavior {
  return (BEHAVIORS as readonly string[]).includes(name);
}

/** Names are identifiers: letters, digits, `_`, `.`, `-`. Technique, stance and call names are content (J6.1.1 technique matrix). */
const NAME_RE = /^[A-Za-z][A-Za-z0-9_.-]*$/;
export function isName(s: string): boolean { return NAME_RE.test(s); }

const TRUE_WORDS: ReadonlySet<string> = new Set(VOCABULARY.trueStateWords);
/** True when the text names true state (J3.1.1): any of its words is on the list. */
export function namesTrueState(text: string): boolean {
  if (TRUE_WORDS.has(text.toLowerCase())) return true;
  // camelCase and snake_case are split into words, so `trueX` and `actual_pos` are caught too.
  const words = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
  for (const token of words) if (token !== '' && TRUE_WORDS.has(token)) return true;
  return false;
}
