import { describe, expect, it } from 'vitest';
import { scanForbiddenKeys, walkFields, simSchemas } from '../../src/index.ts';
import {
  worldSchemas, worldPublicSchemas, WORLD_TABLES, PersonRecord, TraitBlock, EventTypeDef, mayReceiveEvent, guardClassOf,
  PositionDefinition, PersonView, JobRecord, RelationshipEdge, ContractRecord, WorldEvent, CoachingBlock,
} from '../../src/world/index.ts';
import { samples, userCoach, generatedPlayer, traitBlock } from './fixtures.ts';

const all = worldSchemas();

describe('world contract conventions (P3.1.2, G-00 acceptance)', () => {
  it('every field has a visibility class, and every numeric field a unit or scale', () => {
    const bad: string[] = [];
    for (const [name, s] of Object.entries(all)) {
      walkFields(s, (f) => {
        if (!f.meta?.vis) bad.push(`${name}${f.path}: no visibility`);
        if (f.type === 'number' && !f.meta?.unit) bad.push(`${name}${f.path}: number without unit`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('no world schema has coach points, experience, skill trees, perks, picked traits or difficulty (Q1.2.1)', () => {
    expect(scanForbiddenKeys(all)).toEqual([]);
  });

  it('public world schemas hold no truth field (P1.1.4, Q1.4.2)', () => {
    const hits: string[] = [];
    for (const [name, s] of Object.entries(worldPublicSchemas())) walkFields(s, (f) => { if (f.meta?.vis === 'truth') hits.push(name + f.path); });
    expect(hits).toEqual([]);
    for (const name of Object.keys(worldPublicSchemas())) expect(all[name]).toBeDefined();
  });

  it('names do not collide with the sim contract registry', () => {
    const sim = simSchemas();
    expect(Object.keys(all).filter((k) => k in sim)).toEqual([]);
  });
});

describe('round trip: one sample per world shape', () => {
  it('every registered shape has a sample', () => {
    expect(Object.keys(all).filter((k) => !(k in samples))).toEqual([]);
  });
  for (const [name, schema] of Object.entries(all)) {
    it(`${name} parses, and survives JSON encode and decode unchanged`, () => {
      const parsed = schema.parse(samples[name]);
      expect(parsed).toEqual(samples[name]);
      const again = schema.parse(JSON.parse(JSON.stringify(parsed)));
      expect(again).toEqual(parsed);
    });
  }
});

describe('table list (P3.1.1, for the save core)', () => {
  it('every table names a registered row schema and table names are unique', () => {
    const known = { ...all, ...simSchemas() };
    for (const t of WORLD_TABLES) expect(known[t.row], t.table).toBeDefined();
    expect(new Set(WORLD_TABLES.map((t) => t.table)).size).toBe(WORLD_TABLES.length);
  });
  it('only record tables are append-only, and the event log is', () => {
    for (const t of WORLD_TABLES) if (t.appendOnly) expect(t.kind).toBe('record');
    expect(WORLD_TABLES.find((t) => t.table === 'events')?.appendOnly).toBe(true);
  });
  it('every world schema that is a row is stored in some table, or is a nested part', () => {
    const nested = new Set(['world:TraitBlock', 'world:GoalRecord']);
    const stored = new Set(WORLD_TABLES.map((t) => t.row));
    expect(Object.keys(all).filter((k) => !stored.has(k) && !nested.has(k))).toEqual([]);
  });
});

describe('person rulings (P3.2.2, E9.1.2, X1.1.1, A3.1.2)', () => {
  it('the user coach validates against the same schema as a generated person', () => {
    expect(PersonRecord.safeParse(userCoach).success).toBe(true);
    expect(PersonRecord.safeParse(generatedPlayer).success).toBe(true);
  });
  it('a user person with a hidden behaviour block or scouting parameters is refused', () => {
    expect(PersonRecord.safeParse({ ...userCoach, coaching: { ...userCoach.coaching, hidden: { aggression: 0.5 } } }).success).toBe(false);
    expect(PersonRecord.safeParse({ ...userCoach, scouting: { evaluationSkill: { QB: 0.2 } } }).success).toBe(false);
  });
  it('no ability field can be added to coaching', () => {
    for (const key of ['skills', 'playCallingRating', 'level', 'experience', 'teachingRatings']) {
      expect(CoachingBlock.safeParse({ ...userCoach.coaching, [key]: 1 }).success, key).toBe(false);
    }
  });
  it('the user person has empty facet and value maps; others may not claim source user', () => {
    expect(TraitBlock.safeParse({ ...userCoach.traitBlock, facets: { ego: 50 } }).success).toBe(false);
    expect(PersonRecord.safeParse({ ...generatedPlayer, traitBlock: { ...traitBlock, facets: {}, values: {}, source: 'user' } }).success).toBe(false);
  });
  it('facets and values hold their X1.1.1 ranges, and a person has at most three goals', () => {
    expect(TraitBlock.safeParse({ ...traitBlock, facets: { ego: 101 } }).success).toBe(false);
    expect(TraitBlock.safeParse({ ...traitBlock, values: { money: -51 } }).success).toBe(false);
    const goal = traitBlock.goals[0];
    expect(TraitBlock.safeParse({ ...traitBlock, goals: [goal, goal, goal, goal] }).success).toBe(false);
  });
  it('imported people get neutral traits and keep their source key; only they carry imported statistics', () => {
    const imported = { ...generatedPlayer, origin: 'imported', provenance: null, externalRef: { source: 'pack', key: 'x1' }, traitBlock: { ...traitBlock, source: 'imported_neutral' }, history: { honourEventIds: [], importedStats: { games: 10 } } };
    expect(PersonRecord.safeParse(imported).success).toBe(true);
    expect(PersonRecord.safeParse({ ...imported, externalRef: null }).success).toBe(false);
    expect(PersonRecord.safeParse({ ...generatedPlayer, history: { honourEventIds: [], importedStats: { games: 1 } } }).success).toBe(false);
  });
  it('there is no photograph field and no place for a cause of death', () => {
    expect(PersonRecord.safeParse({ ...generatedPlayer, photoUrl: 'x' }).success).toBe(false);
    expect(PersonRecord.safeParse({ ...generatedPlayer, causeOfDeath: 'x' }).success).toBe(false);
  });
});

describe('protection rule for imported people (A6.3.1, X2.1.2)', () => {
  const base = samples['world:EventTypeDef'] as Record<string, unknown>;
  it('a personal or harmful type marked importedAllowed fails validation', () => {
    expect(EventTypeDef.safeParse({ ...base, harmClass: 'harmful', importedAllowed: true }).success).toBe(false);
    expect(EventTypeDef.safeParse({ ...base, harmClass: 'personal', importedAllowed: true }).success).toBe(false);
    expect(EventTypeDef.safeParse({ ...base, harmClass: 'harmful', importedAllowed: false }).success).toBe(true);
  });
  it('a type with no consumer fails (X2.1.2 rule 1)', () => {
    expect(EventTypeDef.safeParse({ ...base, consumers: [] }).success).toBe(false);
  });
  it('mayReceiveEvent refuses barred and unknown types for imported people only', () => {
    expect(mayReceiveEvent({ origin: 'imported' }, { importedAllowed: false })).toBe(false);
    expect(mayReceiveEvent({ origin: 'imported' }, undefined)).toBe(false);
    expect(mayReceiveEvent({ origin: 'imported' }, { importedAllowed: true })).toBe(true);
    expect(mayReceiveEvent({ origin: 'generated' }, { importedAllowed: false })).toBe(true);
  });
  it('the L9 guard class is computed from the harm class', () => {
    expect(guardClassOf('professional_negative')).toBe('football');
    expect(guardClassOf('personal')).toBe('personal');
  });
  it('an event carries no judgment field and no trait field', () => {
    const ev = samples['world:WorldEvent'] as Record<string, unknown>;
    expect(WorldEvent.safeParse({ ...ev, label: 'aggressive' }).success).toBe(false);
    expect(WorldEvent.safeParse({ ...ev, facets: {} }).success).toBe(false);
  });
});

describe('structural promises', () => {
  it('a game-required position needs a succession rule (X8.1.1)', () => {
    const p = samples['world:PositionDefinition'] as Record<string, unknown>;
    expect(PositionDefinition.safeParse({ ...p, successionRule: [] }).success).toBe(false);
    expect(PositionDefinition.safeParse({ ...p, requiredForGame: false, successionRule: [] }).success).toBe(true);
  });
  it('a person view has exactly one observer (P3.2.3)', () => {
    const v = samples['world:PersonView'] as Record<string, unknown>;
    expect(PersonView.safeParse({ ...v, observerPersonId: 1 }).success).toBe(false);
    expect(PersonView.safeParse({ ...v, observerTeamId: null }).success).toBe(false);
  });
  it('a held seat has a start date and an open seat none (S1.1.1)', () => {
    const j = samples['world:JobRecord'] as Record<string, unknown>;
    expect(JobRecord.safeParse({ ...j, holderSince: null }).success).toBe(false);
    expect(JobRecord.safeParse({ ...j, holderPersonId: null, holderSince: null }).success).toBe(true);
  });
  it('a relationship edge ends at a person or a team, not both', () => {
    const e = samples['world:RelationshipEdge'] as Record<string, unknown>;
    expect(RelationshipEdge.safeParse({ ...e, bTeamId: 3 }).success).toBe(false);
    expect(RelationshipEdge.safeParse({ ...e, b: null, bTeamId: 3, kind: 'rival' }).success).toBe(true);
  });
  it('money is integer cents', () => {
    const c = samples['world:ContractRecord'] as { terms: { signingBonusCents: number } };
    expect(ContractRecord.safeParse({ ...c, terms: { ...c.terms, signingBonusCents: 10.5 } }).success).toBe(false);
  });
});
