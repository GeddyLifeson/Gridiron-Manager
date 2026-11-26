// The registration order is part of determinism (J13.3.2): these checks stop it changing by accident.
import { describe, expect, it } from 'vitest';
import { MODULE_ORDER, PLUG_IDS } from '../../src/tick-resolver/index.ts';

describe('tick resolver integration points', () => {
  it('names each module once', () => {
    expect(new Set(MODULE_ORDER).size).toBe(MODULE_ORDER.length);
  });
  it('runs the plugged modules after the merged ones and before the finish, in a fixed order', () => {
    const at = PLUG_IDS.map((id) => MODULE_ORDER.indexOf(id));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(at[0]).toBeGreaterThan(MODULE_ORDER.indexOf('interact'));
    expect(at[at.length - 1]).toBeLessThan(MODULE_ORDER.indexOf('finish'));
  });
  it('keeps the order that the golden hashes were made with', () => {
    expect(MODULE_ORDER.join(' ')).toBe('presnap perception playerAi movement heldBall ball interact qb carrier foulsInjuries finish');
  });
});
