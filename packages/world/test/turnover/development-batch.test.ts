// A development batch port (worker threads in history runs) must leave the world exactly as the serial step
// does. The port here copies every job as a thread would and works the chunks in reverse order.
import { describe, expect, it } from 'vitest';
import { development } from '@gm/league';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';
import { developmentJobResult } from '../../src/turnover/development.ts';

const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);

function run(port: turnover.TurnoverBinding['developBatch']): string {
  const binding: turnover.TurnoverBinding = { content, rule, ...(port ? { developBatch: port } : {}) };
  const w = loop.createWorld({ setup: setup(), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
  const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(),
    cohorts: loop.cohortStep({
      scale: () => ({ topCollegeTeams: w.teams.length - pro, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 }),
      names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
    }),
    development: turnover.developmentStep(binding), moves: turnover.rosterMovesStep(binding),
  }, 'test: not bound');
  for (let i = 0; i < 2; i++) loop.runSeason(w, sys, testSchedule);
  return loop.worldHash(w);
}

describe('development batch port', () => {
  it('leaves the same world as the serial step', () => {
    const n = development.devNumbers();
    let calls = 0;
    const port: turnover.TurnoverBinding['developBatch'] = (jobs) => {
      calls++;
      const copies = structuredClone(jobs);
      const chunks: (typeof copies)[] = [];
      for (let i = 0; i < copies.length; i += 37) chunks.push(copies.slice(i, i + 37));
      const done = new Map<number, ReturnType<typeof developmentJobResult>[]>();
      for (let c = chunks.length - 1; c >= 0; c--) done.set(c, chunks[c]!.map((j) => developmentJobResult(n, j)));
      return chunks.flatMap((_, c) => done.get(c)!);
    };
    expect(run(port)).toBe(run(undefined));
    expect(calls).toBeGreaterThan(0);
  }, 300_000);
});
