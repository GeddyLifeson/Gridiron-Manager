// The headless career playtest (npm run playtest): a short career runs end to end with no crash, stuck,
// invalid or rule finding, the same seed gives the same findings and game results, and the report groups
// findings across careers.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlaytestCareer } from '../../src/playtest/career.ts';
import { Recorder } from '../../src/playtest/recorder.ts';
import { playGameDay } from '../../src/playtest/stages/game-day.ts';
import { summarise, formatSummary } from '../../src/playtest/report.ts';
import { DEFAULT_OPTIONS } from '../../src/playtest/types.ts';

const BAD = new Set(['crash', 'stuck', 'invalid', 'rule']);

describe('headless career playtest', () => {
  it('plays a full game by console keys at both levels with no breach found', () => {
    for (const rs of ['pro_2026', 'college_2026']) {
      const rec = new Recorder('00000000000000a1');
      const g = playGameDay(rec, rs, '00000000000000a1', 0, DEFAULT_OPTIONS.maxStepsPerGame);
      expect(g.final).toBe(true);
      expect(rec.findings.filter((f) => BAD.has(f.kind))).toEqual([]);
    }
  });

  it('runs a short career end to end, deterministically, and reports the missing hookups', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gm-playtest-test-'));
    try {
      const o = { ...DEFAULT_OPTIONS, saveDir: dir, seasons: 4, gamesPerSeason: 1, worldSeasons: 0 };
      const a = await runPlaytestCareer('00000000c0ffee00', o);
      const b = await runPlaytestCareer('00000000c0ffee00', o);
      expect(a.findings.filter((f) => BAD.has(f.kind))).toEqual([]);
      expect(a.seasons).toBe(4);
      expect(a.stages.some((s) => s.area === 'save' && s.summary.includes('replayed'))).toBe(false); // round trip every 5 seasons
      expect(a.stages.at(-1)?.summary).toBe('final round trip');
      expect(b.findings.map((f) => f.code)).toEqual(a.findings.map((f) => f.code));
      expect(b.stages.filter((s) => s.area === 'game_day').map((s) => s.summary)).toEqual(a.stages.filter((s) => s.area === 'game_day').map((s) => s.summary));
      expect(a.findings.some((f) => f.code.startsWith('unregistered:'))).toBe(true);
      const s = summarise([a, b]);
      expect(s.careers).toBe(2);
      expect(s.groups.every((g) => g.careers === 1)).toBe(true); // same seed twice is one seed
      expect(formatSummary(s, { command: 'test', script: o.script })).toContain('# Headless career playtest');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the game checks catch planted faults', () => {
  it('flags an illegal score step, a fourth timeout in a half, a college tie and a wrong final score', async () => {
    const { checkGame } = await import('../../src/playtest/stages/game-day.ts');
    const rec = new Recorder('00000000000000a1');
    playGameDay(rec, 'college_2026', '00000000000000a1', 0, DEFAULT_OPTIONS.maxStepsPerGame);
    expect(rec.findings.filter((f) => BAD.has(f.kind))).toEqual([]);
    // A clean replay of a real game, then the same events with faults planted.
    const { realGame } = await import('@gm/headless');
    const rg = realGame.createRealGame('college_2026');
    const res = rg.simulate(rg.input(0, '00000000000000b2'));
    const clean = new Recorder('00000000000000b2');
    checkGame(clean, { game: res.final, events: res.events, final: true }, 'college_2026', 0, 3);
    expect(clean.findings.filter((f) => BAD.has(f.kind) && !f.code.startsWith('console.'))).toEqual([]); // no console in a chart-called game
    const first = res.events.findIndex((e) => e.type === 'play_resolved');
    const bad = [
      ...res.events.slice(0, first),
      ...[1, 2, 3, 4].map(() => ({ type: 'timeout_charged', side: 0, kind: 'team' })), // four in the first half
      ...res.events.slice(first).filter((e) => e.type !== 'game_final'),
      { type: 'score_changed', score: (res.events.find((e) => e.type === 'score_changed') as { score: unknown }).score, scoreAfter: [99, 99] },
      { type: 'game_final', score: [7, 7], tie: true },
    ] as typeof res.events;
    const r = new Recorder('00000000000000b2');
    checkGame(r, { game: res.final, events: bad, final: true }, 'college_2026', 0, 3);
    const codes = r.findings.map((f) => f.code);
    expect(codes.some((c) => c.startsWith('score.illegal_step'))).toBe(true);
    expect(codes).toContain('timeouts.over_half_limit');
    expect(codes).toContain('college.tie');
    expect(codes).toContain('final.score_mismatch');
  });
});
