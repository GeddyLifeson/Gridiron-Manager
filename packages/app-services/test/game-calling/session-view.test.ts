// The console read model of a live session (app composition root, handoff item D): strip facts come from the
// game's public situation and match the rule set, on both rule sets.
import { describe, it, expect } from 'vitest';
import { shell } from '@gm/app-ui';
import { season } from '@gm/world';
import { GameCallingSession, type LineupFor } from '../../src/commands/game-calling/index.ts';
import { consoleViewOfSession, sessionChallengesLeft, sessionStrip } from '../../src/read-models/game-calling/index.ts';
import { BINDINGS, resolve, testConsoleConfig } from './fixtures.ts';

const keyFor = (action: string): string | null => {
  const b = BINDINGS.find((x) => x.action === action);
  return b && b.keys[0] ? shell.displayChord(b.keys[0]) : null;
};

function open(ruleSetId: string, userSide: 0 | 1) {
  const core = season.createRealGameCore(ruleSetId);
  const input = core.input(0, '0123456789abcdef');
  const deps = core.deps(input);
  const roster = season.chart.depthRoster(input.teams[userSide].depth);
  const lineup: LineupFor = (unit) => roster(unit, null);
  const s = new GameCallingSession({ input, deps, userSide, console: testConsoleConfig({}, ruleSetId), lineup, resolve, keyIntervalMs: 250, startMs: 0 });
  s.start();
  return { s, core };
}

describe('console view of a live session', () => {
  for (const ruleSetId of ['pro_2026', 'college_2026']) {
    it(`${ruleSetId}: the console opens on the toss with the rule set's clock, timeouts and challenges`, () => {
      const { s, core } = open(ruleSetId, 0);
      expect(s.pending).not.toBeNull();
      const strip = sessionStrip(s);
      expect(strip.period).toBe(1);
      expect(strip.score).toEqual([0, 0]);
      expect(strip.down).toBeNull(); // a kick has no down
      const timeouts = core.rules.num('timeout.per_half');
      expect(strip.timeoutsLeft).toEqual([timeouts, timeouts]);
      expect(strip.clockTenths).toBe(core.rules.num('clock.period_length_s') * 10);
      const v = consoleViewOfSession(s, { keyFor });
      expect(v.prompt?.kind).toBe('options'); // the toss choice comes first
      expect(v.strip.quarter).toBe(1);
      expect(v.sheet.boxes.length).toBeGreaterThan(0);
      expect(sessionChallengesLeft(s)).toBe(core.rules.num('challenge.count'));
    });
  }

  it('the spot reads from the user side: both sides see the same ball from opposite goals', () => {
    const a = sessionStrip(open('pro_2026', 0).s);
    const b = sessionStrip(open('pro_2026', 1).s);
    const fromOwn = (x: typeof a.spot) => (x.side === 'own' ? x.yard : x.side === 'mid' ? 50 : 100 - x.yard);
    expect(fromOwn(a.spot) + fromOwn(b.spot)).toBe(100);
  });
});
