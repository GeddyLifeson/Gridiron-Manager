// The sideline seat (E7.5.1 one thing at a time; plans/head-coach-nuance.md item 2, Q3 shape): the play-calling
// head coach has less of the window for game management, a pre-set decision book closes most of that gap, and a
// game-management assistant with the line ready closes more.
import { describe, expect, it } from 'vitest';
import { itemArrivalTenths, itemThinkTenths, windowLeftTenths } from '../../src/gameday/attention.ts';

const caller = { callsOnField: true, bookLine: false, assistantLine: false };
const free = { callsOnField: false, bookLine: false, assistantLine: false };

describe('one thing at a time on the sideline', () => {
  it('the play-caller is on his call first; the head coach who gave it away is on the item at once', () => {
    expect(itemArrivalTenths(caller)).toBeGreaterThan(itemArrivalTenths(free));
    expect(itemArrivalTenths(free)).toBe(0);
  });

  it('on a fourth down the play-caller has less of the window left; a pre-set book line closes most of the gap', () => {
    const w = 400;
    const gapRaw = windowLeftTenths('fourth_down', free, w) - windowLeftTenths('fourth_down', caller, w);
    const gapBook = windowLeftTenths('fourth_down', free, w) - windowLeftTenths('fourth_down', { ...caller, bookLine: true }, w);
    expect(gapRaw).toBeGreaterThan(0);
    expect(gapBook).toBeLessThan(gapRaw / 2);
  });

  it('a book does not cover a challenge; an assistant with the line ready does', () => {
    expect(itemThinkTenths('challenge', { ...caller, bookLine: true })).toBe(itemThinkTenths('challenge', caller));
    expect(itemThinkTenths('challenge', { ...caller, assistantLine: true })).toBeLessThan(itemThinkTenths('challenge', caller));
  });

  it('a short window closes before the play-caller gets to it', () => {
    expect(windowLeftTenths('challenge', caller, 100)).toBeLessThan(0);
    expect(windowLeftTenths('challenge', free, 100)).toBeGreaterThan(0);
  });
});
