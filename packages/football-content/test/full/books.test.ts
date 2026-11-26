import { describe, expect, it } from 'vitest';
import { full } from '@gm/football-content';

const PLAY_IDS = new Set(full.FULL_PLAYS.map((p) => p.id));
const CALL_IDS = new Set(full.FULL_DEFENSE.map((d) => d.id));
const SOURCE_IDS = new Set(full.ALL_SOURCES.map((s) => s.id));
const GROUP = new Map(full.ALL_SOURCES.map((s) => [s.id, s.group]));

describe('starter books', () => {
  for (const book of full.STARTER_BOOKS) {
    it(`${book.id}: every entry names authored content with a positive weight`, () => {
      for (const menu of [...Object.values(book.offense), book.runMiddle]) for (const e of menu!) { expect(PLAY_IDS.has(e.id), e.id).toBe(true); expect(e.weight).toBeGreaterThan(0); }
      for (const menu of Object.values(book.defense)) for (const e of menu!) { expect(CALL_IDS.has(e.id), e.id).toBe(true); expect(e.weight).toBeGreaterThan(0); }
    });
    it(`${book.id}: every play in a kind menu is of that kind (or a movement pass under play action)`, () => {
      const byId = new Map(full.FULL_PLAYS.map((p) => [p.id, p]));
      for (const [kind, menu] of Object.entries(book.offense)) for (const e of menu!) {
        const k = byId.get(e.id)!.kind;
        expect(k === kind || (kind === 'play_action' && k === 'movement_pass'), `${e.id} in ${kind}`).toBe(true);
      }
    });
    it(`${book.id}: the chart's call kinds and coverage families all have a real mix`, () => {
      for (const k of ['run', 'quick_pass', 'dropback_pass', 'play_action', 'screen', 'rpo'] as const) expect(full.menuFor(book.offense[k]!, 'any').length, k).toBeGreaterThanOrEqual(k === 'rpo' || k === 'screen' ? 3 : 4);
      for (const f of ['cover0', 'cover1', 'cover2', 'cover3', 'cover4', 'cover6', 'two_man'] as const) expect(full.menuFor(book.defense[f]!, 'any').length, f).toBeGreaterThanOrEqual(1);
      expect(full.menuFor(book.defense.cover3!, 'any').length).toBeGreaterThanOrEqual(5);
    });
    it(`${book.id}: basis rows cite known sources and the status matches the independence groups`, () => {
      for (const b of book.basis) {
        for (const s of b.sources) expect(SOURCE_IDS.has(s), s).toBe(true);
        const groups = new Set(b.sources.map((s) => GROUP.get(s))).size;
        if (b.status === 'Verified') expect(groups).toBeGreaterThanOrEqual(3);
        if (b.status === 'Assumption') expect(b.sources.length).toBe(0);
      }
    });
  }

  it('situational entries are called only in their situation', () => {
    const run = full.PRO_BOOK.offense.run!;
    expect(full.menuFor(run, 'any').some((e) => e.id === 'run_goal_line_power')).toBe(false);
    expect(full.menuFor(run, 'goalLine').some((e) => e.id === 'run_goal_line_power')).toBe(true);
    expect(full.menuFor(full.PRO_BOOK.defense.cover0!, 'shortYardage').some((e) => e.id === 'def_short_yardage_bear')).toBe(true);
  });

  it('picking is by weight and deterministic', () => {
    const menu = [{ id: 'a', weight: 3 }, { id: 'b', weight: 1 }];
    expect(full.pickEntry(menu, 0)!.id).toBe('a');
    expect(full.pickEntry(menu, 0.74)!.id).toBe('a');
    expect(full.pickEntry(menu, 0.76)!.id).toBe('b');
    expect(full.pickEntry(menu, 0.999999)!.id).toBe('b');
    expect(full.pickEntry([], 0.5)).toBeNull();
    let n = 0; for (let i = 0; i < 1000; i++) if (full.bookPlay(full.PRO_BOOK, 'dropback_pass', null, 'any', i / 1000)!.id === 'pass_y_cross') n++;
    expect(n).toBeGreaterThan(0);
  });

  it('a middle run calls a draw or trap; college and pro books differ', () => {
    expect(['draw_rb', 'run_trap_right']).toContain(full.bookPlay(full.PRO_BOOK, 'run', 'middle', 'any', 0.2)!.id);
    expect(full.starterBookFor('college').id).toBe('college');
    expect(full.starterBookFor('pro').id).toBe('pro');
  });
});
