// @gm/schema keeps copies of the film vocabularies and command table (schema may not import
// app-services). They must stay equal to the app-services originals.
import { describe, expect, it } from 'vitest';
import { FILM_CAUSE_TYPES, FILM_COACHING_FIELDS, FILM_COMMAND_TABLE as SCHEMA_TABLE, COMMANDS } from '@gm/schema';
import { FILM_COMMAND_TABLE } from '../../../src/commands/film/index.ts';
import { CAUSE_TYPES, COACHING_FIELDS } from '../../../src/read-models/film/types.ts';

describe('film schema copies (CR-G63-0)', () => {
  it('match the app-services vocabularies and command table', () => {
    expect([...FILM_CAUSE_TYPES]).toEqual([...CAUSE_TYPES]);
    expect([...FILM_COACHING_FIELDS]).toEqual([...COACHING_FIELDS]);
    expect(SCHEMA_TABLE).toEqual(FILM_COMMAND_TABLE);
  });
  it('every film command is in COMMANDS with a payload schema', () => {
    for (const c of FILM_COMMAND_TABLE) expect(COMMANDS.find((x) => x.type === c.type)?.payload, c.type).toBeDefined();
  });
});
