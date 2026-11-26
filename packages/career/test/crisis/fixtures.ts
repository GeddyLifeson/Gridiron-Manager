// Test fixtures for the crisis engine. The catalogue and act files are read from G-32's content folder
// (the world layer does the same in the game). People, events and rule sets here are fixtures.
import { readFileSync } from 'node:fs';
import { stream, seedFromNumber } from '@gm/engine-core';
import { WorldEvent, type PersonOrigin, type RuleSet, type WorldDate } from '@gm/schema';
import type { ActsFile, CrisisCatalogue, CrisisContext, EventDraft, EventSink, GuardPerson, StreamFor, Trigger } from '../../src/crisis/index.ts';

export const CATALOGUE: CrisisCatalogue = JSON.parse(readFileSync(new URL('../../../football-content/data/crises/catalogue.json', import.meta.url), 'utf8'));
export const ACTS: ActsFile = JSON.parse(readFileSync(new URL('../../../football-content/data/crises/acts.json', import.meta.url), 'utf8'));

const draftSchema = WorldEvent.omit({ id: true, notability: true });

export class MemorySink implements EventSink {
  readonly events: (EventDraft & { id: number })[] = [];
  append(d: EventDraft): number {
    draftSchema.parse(d);
    const id = this.events.length + 1;
    this.events.push({ ...d, id });
    return id;
  }
  ofType(t: string) { return this.events.filter((e) => e.type === t); }
}

export function streams(seed = 7): StreamFor {
  const s = seedFromNumber(seed);
  return (scope) => stream(s, 'crisis', scope);
}

export function ruleSet(values: Record<string, number | boolean | string>, level: 'pro' | 'college' = 'pro'): RuleSet {
  const get = (k: string) => {
    if (!(k in values)) throw new Error(`no rule ${k}`);
    return values[k]!;
  };
  return { id: 'fixture', level, seasonYear: 2026, num: (k) => get(k) as number, bool: (k) => get(k) as boolean, opt: (k) => get(k) as string, keys: () => Object.keys(values) };
}

export const day = (dayIndex: number, seasonYear = 2026): WorldDate => ({ seasonYear, dayIndex });

export function person(personId: number, origin: PersonOrigin = 'generated', minor = false, hasFamily = true): GuardPerson {
  return { personId, origin, minor, hasFamily };
}

export interface Fixture {
  readonly ctx: CrisisContext;
  readonly sink: MemorySink;
  readonly people: Map<number, GuardPerson>;
  /** Event ids the history log holds; causes must be in it. */
  readonly events: Set<number>;
  /** Trigger keys whose cause still holds. */
  readonly holding: Set<string>;
  roomLost: boolean;
  level: string;
}

export const triggerKey = (t: Trigger): string => `${t.typeId}:${t.subjectIds.join(',')}`;

export function fixture(opts: { seed?: number; people?: GuardPerson[]; level?: string } = {}): Fixture {
  const sink = new MemorySink();
  const people = new Map<number, GuardPerson>();
  for (const p of opts.people ?? Array.from({ length: 60 }, (_, i) => person(i + 1))) people.set(p.personId, p);
  const events = new Set<number>();
  const holding = new Set<string>();
  const f: Fixture = {
    sink, people, events, holding, roomLost: false, level: opts.level ?? 'pro',
    ctx: undefined as unknown as CrisisContext,
  };
  (f as { ctx: CrisisContext }).ctx = {
    catalogue: CATALOGUE,
    levelOf: () => f.level,
    person: (id) => people.get(id) ?? null,
    eventExists: (id) => events.has(id),
    causeHolds: (t) => holding.has(triggerKey(t)),
    roomLost: () => f.roomLost,
    coachOf: () => 900,
    stream: streams(opts.seed ?? 7),
    sink,
    tier: 1,
    source: 'sim',
  };
  return f;
}

/** Log a cause event in the fixture history and return its id. */
export function cause(f: Fixture): number {
  const id = 10_000 + f.events.size;
  f.events.add(id);
  return id;
}
