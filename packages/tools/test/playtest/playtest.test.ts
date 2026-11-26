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
      const o = { ...DEFAULT_OPTIONS, saveDir: dir, seasons: 4, gamesPerSeason: 1 };
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
