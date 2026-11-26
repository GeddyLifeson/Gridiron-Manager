// A world crosses the worker boundary (P2.1.2) and comes back the same world.
import { describe, expect, it } from 'vitest';
import { loop, NAMES, setup, testSchedule, testSystems, trimmed } from '../fixtures.ts';

describe('packing a world for another thread', () => {
  it('a structured clone of the packed world revives with the same world hash and a working log', () => {
    const content = trimmed(4, 4);
    const w = loop.createWorld({ setup: setup({ firstSeasonYear: 2023, historySeasons: 3 }), content, names: NAMES });
    loop.runHistory(w, testSystems(), { seasons: 3, schedule: testSchedule });
    const back = loop.unpackWorld(structuredClone(loop.packWorld(w)));
    expect(loop.worldHash(back)).toBe(loop.worldHash(w));
    expect(back.log.rows()).toEqual(w.log.rows());
    expect(back.people).toBeInstanceOf(Map);
    // The revived log still takes rows through the same registry.
    const r = back.log.emit({ type: loop.HISTORY_RUN_ENDED, date: back.date, witnesses: { kind: 'none' }, tier: 3, source: 'sim', payload: { seasons: 0, stopped_early: false, seed_step: 0 } });
    expect(r.ok).toBe(true);
  });
});
