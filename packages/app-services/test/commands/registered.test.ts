// Every command type the game-day and legends unions name is in @gm/schema's COMMANDS with a payload
// schema, and the payloads accept what the screens send (playtest PR 267: unregistered commands).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMMANDS, commandSpec } from '@gm/schema';
import { LEGENDS_COMMAND_TABLE } from '../../src/commands/legends/index.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src/commands');
const typesIn = (family: string) => [...readFileSync(join(SRC, family, 'index.ts'), 'utf8').matchAll(/readonly type: '([a-z_.]+)'/g)].map((m) => m[1]!);

describe('game-day command families are registered (P1.3.1)', () => {
  for (const family of ['game-management', 'game-frame', 'seats']) {
    it(`${family}: every union type has a COMMANDS row`, () => {
      const types = typesIn(family);
      expect(types.length).toBeGreaterThan(3);
      expect(types.filter((t) => !commandSpec(t))).toEqual([]);
    });
  }

  it('legends: the row matches the app-services table', () => {
    for (const row of LEGENDS_COMMAND_TABLE) expect(commandSpec(row.type)).toMatchObject(row);
  });

  it('payloads take what the screens send and refuse extra fields', () => {
    const ok: [string, unknown][] = [
      ['gm.decide', { gameId: 'g1', decisionId: 'd1', kind: 'fourth_down', optionId: 'go', decidedBy: 'user', shown: { chartOption: 'go', advisorOption: null } }],
      ['pregame.advance', {}],
      ['halftime.add', { item: { kind: 'adjustment', unit: 'defense', note: 'x' } }],
      ['seat.substitute', { sendIn: [12], takeOut: [40] }],
      ['seat.chart_row', { playId: 4, row: { front: 'over', coverage: null } }],
    ];
    for (const [t, p] of ok) expect(commandSpec(t)!.payload.safeParse(p).success, t).toBe(true);
    expect(commandSpec('gm.timeout')!.payload.safeParse({ gameId: 'g1', extra: 1 }).success).toBe(false);
  });

  it('command types are unique', () => {
    expect(new Set(COMMANDS.map((c) => c.type)).size).toBe(COMMANDS.length);
  });
});
