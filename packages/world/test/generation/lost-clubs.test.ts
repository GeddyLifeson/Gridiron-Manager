// Lost clubs: pro clubs founded in the world's past that fold for good (Marlon 2026-11-26).
import { describe, expect, it } from 'vitest';
import { seedFromHex } from '@gm/engine-core';
import { CONTENT, generation, loop, NAMES, setup, testSchedule, testSystems, trimmed } from '../fixtures.ts';

const d = generation.lostClubData();

describe('lost clubs', () => {
  it('ships one span per real defunct franchise, years rising inside each span', () => {
    expect(d.spans.length).toBe(48);
    for (const [a, b] of d.spans) { expect(b).toBeGreaterThanOrEqual(a); expect(a).toBeGreaterThanOrEqual(1920); }
    // Most folded in the 1920s (research: 35 of 48 by last season).
    expect(d.spans.filter(([, b]) => b < 1930).length).toBe(35);
  });

  it('scales the count to the world\'s club count', () => {
    expect(generation.lostClubCount(32)).toBe(48);
    expect(generation.lostClubCount(8)).toBe(12);
    expect(generation.lostClubCount(8, d, 0.5)).toBe(6);
  });

  it('leaves out clubs gone before the first season and founds on day one those already playing', () => {
    const seed = seedFromHex('00000000000000a7');
    expect(generation.lostClubSpans(seed, 48, 1869).length).toBe(48);
    const late = generation.lostClubSpans(seed, 48, 1931);
    expect(late.length).toBe(d.spans.filter(([, b]) => b >= 1931).length);
    for (const s of late) { expect(s.founded).toBeGreaterThanOrEqual(1931); expect(s.folded).toBeGreaterThan(s.founded); }
  });

  it('appends fictional clubs after every content team, with no blocked term and no repeated name', () => {
    const content = trimmed(8, 6);
    const plain = loop.createWorld({ setup: setup({ firstSeasonYear: 1900, historySeasons: 60 }), content, names: NAMES });
    const w = loop.createWorld({ setup: setup({ firstSeasonYear: 1900, historySeasons: 60 }), content, names: NAMES, lostClubs: { fraction: 1 } });
    expect(w.teams.slice(0, plain.teams.length).map((t) => t.identity.name)).toEqual(plain.teams.map((t) => t.identity.name));
    const lost = w.teams.slice(plain.teams.length);
    expect(lost.length).toBe(12);
    const names = new Set(w.teams.map((t) => t.identity.name));
    expect(names.size).toBe(w.teams.length);
    for (const t of lost) {
      expect(generation.blockedTermHits([t.identity.name, t.identity.nickname, t.identity.place], CONTENT.blockedTerms)).toEqual([]);
      expect(w.competitions.find((c) => c.id === t.competitionId)!.level).toBe('pro');
      expect(w.teamSpans.get(t.id)!.folded).not.toBeNull();
    }
  });

  it('plays its seasons, folds for good and releases its people', () => {
    const content = trimmed(8, 6);
    const w = loop.createWorld({ setup: setup({ firstSeasonYear: 1919, historySeasons: 40 }), content, names: NAMES, lostClubs: { fraction: 1 } });
    const sys = testSystems({ lifecycle: loop.lifecycleStep({ content, names: NAMES, built: w }) });
    const lostIds = [...w.teamSpans.values()].filter((s) => s.folded !== null).map((s) => s.teamId);
    loop.runHistory(w, sys, { seasons: 40, schedule: testSchedule });
    const folded = new Set(w.log.rows().filter((e) => e.type === loop.TEAM_FOLDED).map((e) => e.subjects[0]!.id));
    for (const id of lostIds) {
      const s = w.teamSpans.get(id)!;
      if (s.folded! <= 1958) { expect(folded.has(id)).toBe(true); expect(w.rosters.has(id)).toBe(false); }
      expect(loop.isActive(w, id)).toBe(false);
    }
    expect(w.staffSeasons.some((r) => lostIds.includes(r.teamId))).toBe(true);
    expect(loop.validateHistory(w).failures.filter((f) => /team/.test(f))).toEqual([]);
  });
});
