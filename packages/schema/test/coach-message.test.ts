// The shared message event mirrors career's `Message` (head-coach nuance item 3): a fourth-down go parses, and
// bad stances, days and extra fields are refused.
import { describe, expect, it } from 'vitest';
import { CoachMessage } from '../src/index.ts';

const go = {
  id: 'm1', week: 3, day: 6, source: 'fourth_down', public: true, heardBy: [], tone: 'neutral', afterLoss: false,
  claims: [{ topic: 'trust', stance: 1, towards: 'offense', weight: 1 }, { topic: 'trust', stance: -1, towards: 'defense', weight: 0.5 }],
};

describe('CoachMessage (H4, H7, L3, I5, M2 emitters)', () => {
  it('a fourth-down go and a private discipline call parse', () => {
    expect(CoachMessage.safeParse(go).success).toBe(true);
    expect(CoachMessage.safeParse({ ...go, id: 'm2', source: 'discipline', public: false, heardBy: ['leaders', 'defense'], tone: 'demanding', afterLoss: true, claims: [{ topic: 'standards', stance: 1, towards: 'leaders', aboutId: 42 }] }).success).toBe(true);
  });
  it('refuses a stance other than +1 or -1, day 7, an unknown audience and extra fields', () => {
    expect(CoachMessage.safeParse({ ...go, claims: [{ topic: 'trust', stance: 0, towards: 'offense' }] }).success).toBe(false);
    expect(CoachMessage.safeParse({ ...go, day: 7 }).success).toBe(false);
    expect(CoachMessage.safeParse({ ...go, heardBy: ['fans'] }).success).toBe(false);
    expect(CoachMessage.safeParse({ ...go, mood: 'angry' }).success).toBe(false);
  });
});
