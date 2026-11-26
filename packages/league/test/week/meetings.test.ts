import { describe, expect, it } from 'vitest';
import { attention, bulletinBoardModifier, installMap, longTermOnly, nightBeforeEffect, runAgenda, themeEffect, userTeach, type AgendaRow } from '../../src/week/index.ts';

const item = (id: string, minutes: number, plays = 1, newItem = true, unit = 'offense'): AgendaRow => ({ kind: 'item', id, unit, plays, minutes, newItem });
const total = (rows: AgendaRow[], teach = 1) => runAgenda(rows, teach, 1, { minutesToday: 0, newByUnit: {} }).items.reduce((s, i) => s + i.factor, 0);

describe('meeting effect (H4.1.2)', () => {
  it('two 45-minute meetings with a break beat one 90-minute meeting with the same agenda', () => {
    const agenda = Array.from({ length: 6 }, (_, i) => item(`p${i}`, 15, 3));
    const split = [...agenda.slice(0, 3), { kind: 'break', minutes: 15 } as AgendaRow, ...agenda.slice(3)];
    expect(total(split)).toBeGreaterThan(total(agenda));
  });
  it('items past the daily cap get half gain', () => {
    const rows = Array.from({ length: 13 }, (_, i) => item(`p${i}`, 3, 1));
    const r = runAgenda(rows, 1, 1, { minutesToday: 0, newByUnit: {} });
    expect(r.items[12]!.factor).toBeCloseTo(r.items[11]!.factor * 0.5, 5);
  });
  it('gains scale with the teaching factor', () => {
    const rows = [item('a', 10, 2)];
    expect(total(rows, 1.2) / total(rows, 0.8)).toBeCloseTo(1.5, 6);
  });
  it('under two minutes a play is only "mentioned"', () => {
    const r = runAgenda([item('a', 3, 3)], 1, 1, { minutesToday: 0, newByUnit: {} });
    expect(r.items[0]!.exposure).toBe('mentioned');
  });
  it('attention is flat to minute 40, falls to the floor at 90, shortens with season fatigue', () => {
    expect(attention(40)).toBe(1);
    expect(attention(90)).toBe(0.5);
    expect(attention(65)).toBeCloseTo(0.75, 6);
    expect(attention(39, 1)).toBeLessThan(1);
  });
  it('the user’s teaching term: 1.0 with the default agenda, 1.1 when every check holds', () => {
    expect(userTeach('default_agenda')).toBe(1);
    expect(userTeach({ clips: 1, order: 1, time: 1 })).toBeCloseTo(1.1, 9);
    expect(userTeach({ clips: 0, order: 0, time: 0 })).toBeCloseTo(0.8, 9);
  });
});

describe('team meeting, night before, bulletin board', () => {
  it('a theme without practice support has no effect; repeated past three weeks it halves', () => {
    expect(themeEffect('ball_security', [], false)).toBe(0);
    expect(themeEffect('ball_security', ['ball_security', 'ball_security'], true)).toBe(0.03);
    expect(themeEffect('ball_security', ['ball_security', 'ball_security', 'ball_security'], true)).toBe(0.015);
  });
  it('tone fit decides the sign and the cap holds; on the plane it is halved', () => {
    expect(nightBeforeEffect('challenging', 'complacent_favourite')).toBe(0.02);
    expect(nightBeforeEffect('calm', 'tense_big_game', true)).toBe(0.01);
    expect(nightBeforeEffect('calm', 'complacent_favourite')).toBeLessThan(0);
    expect(nightBeforeEffect('confident', 'neutral')).toBe(0);
  });
  it('bulletin-board material adds nothing after two uses in a season', () => {
    expect(bulletinBoardModifier(0)).toBe(0.05);
    expect(bulletinBoardModifier(2)).toBe(0);
  });
});

describe('install map (H1.2.2)', () => {
  const base = { carryOver: false, installGMinus: 4, meeting: true as const, walkthrough: true, practiceReps: 2 };
  it('all three exposures give the full gain; each missing exposure applies its factor', () => {
    const m = installMap([
      { id: 'full', ...base },
      { id: 'nomeet', ...base, meeting: false },
      { id: 'nowalk', ...base, walkthrough: false },
      { id: 'norep', ...base, practiceReps: 0 },
    ], 100);
    expect(m.gain['full']).toBe(1);
    expect(m.gain['nomeet']).toBe(0.7);
    expect(m.gain['nowalk']).toBe(0.85);
    expect(m.gain['norep']).toBe(0.5);
  });
  it('the plan-size warning appears past one new item per two reps and dilutes gains', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, ...base }));
    expect(installMap(items, 12).warning).toBe(false);
    const m = installMap(items, 10);
    expect(m.warning).toBe(true);
    expect(m.gain['i0']).toBeCloseTo(0.5 / 0.6, 9);
  });
  it('late installs lose a night of retention; a G-1 play with no exposure is long-term only', () => {
    expect(installMap([{ id: 'late', ...base, installGMinus: 2 }], 100).gain['late']).toBe(0.9);
    expect(longTermOnly({ id: 'x', carryOver: false, installGMinus: 1, meeting: false, walkthrough: false, practiceReps: 0 })).toBe(true);
  });
});
