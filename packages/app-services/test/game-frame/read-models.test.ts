// G-62 read models: the proposed schemas have no truth-class or unclassed field (Q1.4.2), the builders' output
// parses against them, and views never carry hidden truth. Inputs are built by hand in the career gameday
// shapes (app-services tests cannot reach career's gameday until its barrel line lands).
import { describe, it, expect } from 'vitest';
import { readModelSchemaProblems } from '../../src/observer/index.ts';
import { pregameView, halftimeView, postgameView, type PregameStateInput } from '../../src/read-models/game-frame/index.ts';
import { isGameFrameCommand, needsWarning } from '../../src/commands/game-frame/index.ts';
import { GAME_FRAME_SCHEMAS, PregameViewSchema, HalftimeViewSchema, PostgameViewSchema } from '@gm/schema';

const def = (id: string, opensAt: number, deadline: number, costMin = 1) => ({ id, leaf: 'I1', opensAt, deadline, costMin });
const pregame: PregameStateInput = {
  now: 89, budgetLeft: 100, kickoffDelayMin: 0, tossOptionLost: [],
  defs: { inactives: def('inactives', 180, 90, 2), decision_book: def('decision_book', 180, 0, 2), talk: def('talk', 25, 20, 3), radio: def('radio', 180, 90) },
  tasks: { inactives: { state: 'missed', owner: 'user', locked: true }, decision_book: { state: 'open', owner: 'user', locked: false }, talk: { state: 'open', owner: 'user', locked: false }, radio: { state: 'hidden', owner: 'boss', locked: true } },
  log: [{ t: 90, kind: 'missed', task: 'inactives' }, { t: 90, kind: 'locked', task: 'inactives' }],
};

describe('game-frame read models', () => {
  it('proposed schemas pass the read-model truth scan', () => {
    for (const [name, schema] of Object.entries(GAME_FRAME_SCHEMAS)) expect(readModelSchemaProblems(name, schema)).toEqual([]);
  });
  it('pregame view: tasks by deadline, hidden tasks left out, actionable only inside the window', () => {
    const v = PregameViewSchema.parse(pregameView(pregame));
    expect(v.tasks.map((t) => t.id)).toEqual(['inactives', 'talk', 'decision_book']);
    expect(v.tasks.map((t) => t.actionable)).toEqual([false, false, true]);
    expect(v.nextDeadline).toBe(20);
    expect(v.log[0]).toEqual({ t: 90, kind: 'missed', task: 'inactives' });
  });
  it('halftime view shows budgets, items and uptake words', () => {
    const v = HalftimeViewSchema.parse(halftimeView({ workingMin: 7, staffMin: 3, playerMin: 4, staffUsed: 1, playerUsed: 1, attending: 'defense', sentBack: ['offense'], items: [{ kind: 'send_back', unit: 'offense' }, { kind: 'adjustment', adjustment: { unit: 'defense', kind: 'matchup', target: 'double_11' } }] }, [{ adjustmentId: 'a1', playerId: 'DB1', word: 'shaky' }]));
    expect(v).toMatchObject({ staffLeft: 2, playerLeft: 3, items: [{ kind: 'send_back', unit: 'offense', detail: null }, { kind: 'adjustment', unit: 'defense', detail: 'matchup:double_11' }] });
  });
  it('postgame view carries the fit band, never the morale number or private notes', () => {
    const v = PostgameViewSchema.parse(postgameView({
      gameId: 'g7', handshake: null, gameBalls: [], injuries: [], office: [], dayAfter: 'short',
      talk: { tone: 'level', points: [], effect: { fit: 'good', moraleZ: 0.04 } as { fit: 'good' } },
      media: { held: false, questions: [], answers: [] },
      notes: { text: 'private' },
    } as Parameters<typeof postgameView>[0]));
    expect(v.talk).toEqual({ tone: 'level', points: [], fit: 'good' });
    expect(JSON.stringify(v)).not.toMatch(/moraleZ|private/);
  });
  it('commands are plain data; skipping media needs the warning', () => {
    expect(isGameFrameCommand({ type: 'pregame.advance' })).toBe(true);
    expect(isGameFrameCommand({ type: 'nope' })).toBe(false);
    expect(needsWarning({ type: 'postgame.skip_media' })).toBe(true);
  });
});
