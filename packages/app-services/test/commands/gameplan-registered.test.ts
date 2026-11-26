// Every game plan command kind is in @gm/schema's COMMANDS as `gameplan.<kind>`, and real values from the
// content package (template sheets, the catalogue's situations) parse through the payload schemas.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { commandSpec, gameplanCommandType, GAMEPLAN_PAYLOADS } from '@gm/schema';
import { gameplan as gp } from '@gm/football-content';
import type { GameplanCommand } from '../../src/commands/gameplan/index.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src/commands/gameplan/index.ts');
const kinds = [...readFileSync(SRC, 'utf8').matchAll(/\| \{ readonly kind: '([a-z_]+)'/g)].map((m) => m[1]!);

/** The payload of a command: the union member without `kind`, as the host logs it. */
function parses(cmd: GameplanCommand): boolean {
  const { kind, ...payload } = cmd;
  const r = commandSpec(gameplanCommandType(kind))!.payload.safeParse(payload);
  if (!r.success) console.error(kind, JSON.stringify(r.error.issues.slice(0, 3)));
  return r.success;
}

describe('game plan commands are registered (P1.3.1, G-68)', () => {
  it('every union kind has a COMMANDS row, and no row is stale', () => {
    expect(kinds.length).toBe(28);
    expect(kinds.filter((k) => !commandSpec(gameplanCommandType(k)))).toEqual([]);
    expect(Object.keys(GAMEPLAN_PAYLOADS).sort()).toEqual([...kinds].sort());
  });

  it('template boxes, entries, situations and catalogue rules parse', () => {
    const sheets = [gp.offenseTemplate(), gp.defenseTemplate(), gp.specialTeamsTemplate()];
    const call = { playId: 'p_inside_zone', tags: ['rt'], second: { playId: 'p_slant', tags: [] } };
    for (const sh of sheets) {
      for (const box of sh.boxes) expect(parses({ kind: 'add_box', box: { ...box, entries: [{ id: 'e1', call, hash: 'left', rank: 1, setRole: 'set' }] } })).toBe(true);
      for (const situation of sh.situations) expect(parses({ kind: 'set_situation', situation })).toBe(true);
    }
    for (const row of gp.CATALOGUE) if (row.situation) expect(parses({ kind: 'set_situation', situation: row.situation })).toBe(true);
  });

  it('the other payloads take what the screens send', () => {
    const call = { playId: 'p1', tags: [] };
    const cmds: GameplanCommand[] = [
      { kind: 'add_to_plan', entry: { id: 'm1', side: 'defense', call, situationIds: ['first_10'], targetReps: 6, defense: { package: 'nickel', personnelFaced: ['11'], role: 'stress', pressure: true, shell: 'one_high' }, protection: { t1: 'chip' } } },
      { kind: 'set_matchup', rule: { id: 'r1', ours: 'X', theirs: 'CB2', rule: 'target' } },
      { kind: 'move_box', boxId: 'b1', side: 1, col: 0, row: 2, w: 3, h: 4 },
      { kind: 'set_box_situation', boxId: 'b1', situationId: null },
      { kind: 'set_script', which: 'opening', entries: [{ id: 's1', call, purpose: 'show_formation', onlyIf: [{ on: 'down', in: [1] }, { on: 'distance', min: 7 }], setsUp: 's2' }] },
      { kind: 'set_must_calls', calls: [{ id: 'mc', call, target: { kind: 'by_half' } }, { id: 'mc2', call, target: { kind: 'at_least', times: 2 } }] },
      { kind: 'set_notes', notes: [{ id: 'n1', boxId: null, kind: 'tendency', text: 'Cover 3 on 3rd and long', tendency: { cell: '3L', count: 9, n: 14 } }] },
      { kind: 'fill_band', chosen: [call] },
      { kind: 'set_audibles', list: [{ name: 'Alamo', call }], freedom: 'package' },
      { kind: 'edit_fourth', distanceYd: 2, yardsToGoalYd: 38, call: 'go' },
      { kind: 'edit_two_point', scoreDiff: -8, goForTwo: true },
      { kind: 'lock_sheet' },
      { kind: 'send_back_plan', notes: 'more screens' },
    ];
    for (const c of cmds) expect(parses(c), c.kind).toBe(true);
  });

  it('extra fields and bad values are refused', () => {
    const p = (kind: string, v: unknown) => commandSpec(gameplanCommandType(kind))!.payload.safeParse(v).success;
    expect(p('lock_sheet', { force: true })).toBe(false);
    expect(p('send_back_plan', { notes: '' })).toBe(false);
    expect(p('set_situation', { situation: { id: 's', label: 'x', anyOf: [{ all: [{ on: 'weather', in: ['rain'] }] }] } })).toBe(false);
    expect(p('edit_fourth', { distanceYd: 2, yardsToGoalYd: 38, call: 'kneel' })).toBe(false);
  });

  it('hand-offs cannot be undone; edits can (P5.2.2)', () => {
    expect(commandSpec('gameplan.lock_sheet')!.undoable).toBe(false);
    expect(commandSpec('gameplan.approve_plan')!.undoable).toBe(false);
    expect(commandSpec('gameplan.add_entry')!.undoable).toBe(true);
  });
});
