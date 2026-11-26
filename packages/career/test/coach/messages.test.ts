// Decisions are messages (plans/head-coach-nuance.md item 3, Q3): a fourth-down choice speaks to both units,
// timing changes how a line lands, a contradiction between what was said inside and outside costs trust with
// those who heard both, and a coach who keeps his words in line holds a room through a losing run.
import { describe, expect, it } from 'vitest';
import { contradictionCost, contradictions, fourthDownMessage, readings, timingFactor, type Message } from '../../src/coach/index.ts';

const meeting = (id: string, week: number, stance: 1 | -1, extra: Partial<Message> = {}): Message => ({
  id, week, day: 1, source: 'team_meeting', public: false, heardBy: ['offense', 'defense', 'special_teams', 'leaders', 'staff'], tone: 'neutral', afterLoss: false,
  claims: [{ topic: 'starter', stance, towards: 'offense', aboutId: 12 }], ...extra,
});
const press = (id: string, week: number, stance: 1 | -1): Message => ({ ...meeting(id, week, stance), source: 'press', public: true, heardBy: [], day: 3 });

describe('decisions are messages', () => {
  it('going for it on fourth down tells the offense he trusts them and the defense he does not; a kick says the reverse, quietly', () => {
    const go = readings(fourthDownMessage({ id: 'g', week: 1, day: 6, go: true }));
    const kick = readings(fourthDownMessage({ id: 'k', week: 1, day: 6, go: false }));
    expect(go.offense!).toBeGreaterThan(0);
    expect(go.defense!).toBeLessThan(0);
    expect(kick.offense!).toBeLessThan(0);
    expect(kick.defense!).toBeGreaterThan(0);
    expect(Math.abs(kick.offense!)).toBeLessThan(go.offense!);
  });

  it('timing: a demanding line lands the Monday after a loss and falls flat the night before a game', () => {
    expect(timingFactor({ day: 0, tone: 'demanding', afterLoss: true })).toBeGreaterThan(1);
    expect(timingFactor({ day: 5, tone: 'demanding', afterLoss: false })).toBeLessThan(1);
    expect(timingFactor({ day: 5, tone: 'neutral', afterLoss: true })).toBe(1);
  });

  it('a press answer that contradicts the team-meeting line costs trust with everyone who heard both, more than two meeting lines would', () => {
    const cs = contradictions([meeting('m1', 3, 1), press('p1', 4, -1)]);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.publicPrivate).toBe(true);
    expect(cs[0]!.heardBoth).toContain('offense');
    expect(cs[0]!.heardBoth).not.toContain('media'); // the press never heard the meeting
    const inside = contradictionCost(contradictions([meeting('m1', 3, 1), meeting('m2', 4, -1)]));
    expect(contradictionCost(cs).offense!).toBeLessThan(inside.offense!);
  });

  it('lines far apart in time, on different people, or saying the same thing are not contradictions', () => {
    expect(contradictions([meeting('m1', 1, 1), press('p1', 20, -1)])).toEqual([]);
    expect(contradictions([meeting('m1', 1, 1), { ...press('p1', 2, -1), claims: [{ topic: 'starter', stance: -1, towards: 'offense', aboutId: 13 }] }])).toEqual([]);
    expect(contradictions([meeting('m1', 1, 1), press('p1', 2, 1)])).toEqual([]);
  });

  it('a coach whose words stay in line holds the room through a losing run that breaks one who contradicts himself', () => {
    const run = (contradicts: boolean): number => {
      let trust = 55;
      const said: Message[] = [];
      for (let w = 1; w <= 8; w++) {
        trust -= 1.5; // the losing run, the same for both
        const m = meeting(`m${w}`, w, 1, { tone: 'demanding', afterLoss: true, day: 0 });
        said.push(m);
        trust += readings(m).offense ?? 0;
        if (contradicts && w % 2 === 0) {
          const p = press(`p${w}`, w, -1);
          said.push(p);
          trust += readings(p).offense ?? 0;
          trust += contradictionCost(contradictions([said[said.length - 2]!, p])).offense ?? 0;
        }
      }
      return trust;
    };
    expect(run(false)).toBeGreaterThanOrEqual(35);
    expect(run(true)).toBeLessThan(35);
  });
});
