import { describe, expect, it } from 'vitest';
import { COMPACT, FULL, STANDARD, inWindow, retentionPolicy } from '../../src/retention/params.ts';
import { decidePerson, thinWorld, type PersonFacts } from '../../src/retention/thin.ts';
import { SMALL, USER_TEAM, factsAt, leagueDeps, leagueWorld, toStub, userGameIds, type LeagueWorld } from './world.ts';

const deps = leagueDeps(SMALL);
const play = (w: LeagueWorld, postseason = false): LeagueWorld => {
  const r = deps.apply(w, { id: 1, type: 'league.PlaySeason', actor: { personId: null, job: 'system' }, worldTime: w.calendar, payload: { postseason }, schemaVersion: 1 });
  if (!r.ok) throw new Error(r.reason);
  return { ...r.state, calendar: { seasonYear: r.state.calendar.seasonYear + 1, dayIndex: 0 } };
};
/** Seasons 2026 to 2026+n-1 played, the calendar standing at the next season. */
const seasons = (n: number, postseasonIn?: number) => {
  let w = leagueWorld();
  for (let i = 0; i < n; i++) w = play(w, w.calendar.seasonYear === postseasonIn);
  return w;
};
const deepFreeze = <T>(o: T): T => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const seasonOf = (w: LeagueWorld, gameId: number) => w.games.find((g) => g.id === gameId)!.seasonYear;

describe('retention windows (P5.4.1 table)', () => {
  it('counts the current season as one', () => {
    expect(inWindow(2, 2030, 2030)).toBe(true);
    expect(inWindow(2, 2029, 2030)).toBe(true);
    expect(inWindow(2, 2028, 2030)).toBe(false);
    expect(inWindow(null, 1900, 2030)).toBe(true);
  });
  it('maps profile names, unknown ones to standard', () => {
    expect(retentionPolicy('full')).toBe(FULL);
    expect(retentionPolicy('compact')).toBe(COMPACT);
    expect(retentionPolicy('standard')).toBe(STANDARD);
    expect(retentionPolicy('from-a-later-build')).toBe(STANDARD);
  });
});

describe('thinWorld', () => {
  const ctx = (w: LeagueWorld, profile = 'standard', extra = {}) => ({ policy: retentionPolicy(profile), currentSeason: w.calendar.seasonYear, userGameIds: userGameIds(w), personFacts: factsAt(w.calendar.seasonYear), toStub, ...extra });

  it('keeps every game\'s play rows for the current and previous season and the user\'s forever (standard)', () => {
    const w = seasons(5);
    const { world, report } = thinWorld(deepFreeze(w), ctx(w));
    const cur = w.calendar.seasonYear; // 2031; seasons kept for all games: 2030 only has games (2031 has none yet)
    const user = userGameIds(w);
    for (const p of world.plays) {
      const y = seasonOf(w, p.gameId);
      expect(y >= cur - 1 || user.has(p.gameId), `play of game ${p.gameId} (${y})`).toBe(true);
    }
    const dropped = w.plays.filter((p) => seasonOf(w, p.gameId) < cur - 1 && !user.has(p.gameId));
    expect(report.removed.plays).toBe(dropped.length);
    expect(world.plays.filter((p) => user.has(p.gameId)).length).toBe(w.plays.filter((p) => user.has(p.gameId)).length);
    expect(world.games).toBe(w.games); // results kept forever, untouched
    expect(world.drives.every((d) => seasonOf(w, d.gameId) >= cur - 1 || user.has(d.gameId))).toBe(true);
    expect(world.gameInputs.every((g) => seasonOf(w, g.gameId) >= cur - 1)).toBe(true);
  });

  it('compact keeps one season, full keeps everything', () => {
    const w = seasons(4);
    const cur = w.calendar.seasonYear;
    const c = thinWorld(w, ctx(w, 'compact')).world;
    expect(c.plays.every((p) => seasonOf(w, p.gameId) >= cur || userGameIds(w).has(p.gameId))).toBe(true);
    expect(c.gameInputs).toEqual([]);
    const f = thinWorld(w, ctx(w, 'full'));
    expect(f.world.plays).toBe(w.plays);
    expect(f.world.gameInputs).toBe(w.gameInputs);
    expect(f.report.removed).toEqual({});
  });

  it('keeps user film for 3 seasons, then only bookmarked plays and postseason games', () => {
    const w = seasons(6, 2027);
    const cur = w.calendar.seasonYear; // 2032
    const user = userGameIds(w);
    const old = w.games.find((g) => user.has(g.id) && g.seasonYear === 2028 && g.phase === 'regular')!;
    const bookmark = `${old.id}:3`;
    const { world, report } = thinWorld(w, ctx(w, 'standard', { bookmarkedPlays: new Set([bookmark]) }));
    for (const t of world.trajectories.filter((x) => user.has(x.gameId))) {
      const g = w.games.find((x) => x.id === t.gameId)!;
      const shouldStore = g.seasonYear > cur - 3 || g.phase === 'postseason' || `${t.gameId}:${t.playIndex}` === bookmark;
      expect(t.state === 'stored', `${t.gameId}:${t.playIndex} (${g.seasonYear} ${g.phase})`).toBe(shouldStore);
      if (!shouldStore) expect(t.byteLength).toBe(0);
    }
    // Other games' film is never stored; it is regenerable while the game input is kept, then dropped with the play rows.
    for (const t of world.trajectories.filter((x) => !user.has(x.gameId))) {
      expect(t.state).toBe('regenerable');
      expect(seasonOf(w, t.gameId)).toBeGreaterThanOrEqual(cur - 1);
    }
    const stored = (x: LeagueWorld) => x.trajectories.filter((t) => t.state === 'stored').length;
    expect(report.filmToDelete.length).toBe(stored(w) - stored(world));
  });

  it('cuts minor leavers to a stub, keeps pros, the honoured and the linked, and drops closed unsigned prospects', () => {
    const w = seasons(3);
    const { world, report } = thinWorld(w, ctx(w));
    const leavers = w.people.filter((p) => p.teamId === null && !p.pro && !p.linked && p.leftYear !== undefined);
    expect(leavers.length).toBeGreaterThan(0);
    for (const l of leavers) expect(world.people.find((p) => p.id === l.id)?.stub).toBe(true);
    expect(report.stubbed.sort()).toEqual(leavers.map((l) => l.id).sort());
    expect(world.people.filter((p) => p.teamId === USER_TEAM)).toEqual(w.people.filter((p) => p.teamId === USER_TEAM));
    expect(world.prospects.every((p) => p.classYear >= w.calendar.seasonYear)).toBe(true);
    const closed = w.people.filter((p) => p.id >= 10_000 && p.id - 10_000 < w.calendar.seasonYear).map((p) => p.id);
    expect(report.dropped.sort()).toEqual(closed.sort());
    expect(world.people.some((p) => closed.includes(p.id))).toBe(false);
    const noStub = thinWorld(w, { ...ctx(w), toStub: undefined });
    expect(noStub.report.stubSkipped).toBe(leavers.length);
  });

  it('is pure and idempotent: a second pass changes nothing, the input is never edited', () => {
    for (const profile of ['standard', 'compact', 'full']) {
      const w = deepFreeze(seasons(5, 2028));
      const once = thinWorld(w, ctx(w, profile));
      const twice = thinWorld(once.world, ctx(once.world, profile));
      expect(deps.stateHash(twice.world)).toBe(deps.stateHash(once.world));
      expect(twice.report.removed).toEqual({});
      expect(twice.report.filmToDelete).toEqual([]);
      expect(twice.report.stubbed).toEqual([]);
    }
  });
});

describe('decidePerson (P5.4.1 people row)', () => {
  const base: PersonFacts = { active: false, playedOrCoachedPro: false, coachedAnyLevel: false, honours: false, linkedToUser: false, isStub: false, unsignedProspectCycleOver: false };
  it('applies each clause', () => {
    expect(decidePerson({ ...base, active: true }, STANDARD)).toBe('keep');
    expect(decidePerson({ ...base, playedOrCoachedPro: true }, STANDARD)).toBe('keep');
    expect(decidePerson({ ...base, coachedAnyLevel: true }, STANDARD)).toBe('keep');
    expect(decidePerson({ ...base, honours: true }, STANDARD)).toBe('keep');
    expect(decidePerson({ ...base, linkedToUser: true }, STANDARD)).toBe('keep');
    expect(decidePerson(base, STANDARD)).toBe('stub');
    expect(decidePerson(base, FULL)).toBe('keep');
    expect(decidePerson({ ...base, isStub: true }, STANDARD)).toBe('keep');
    expect(decidePerson({ ...base, unsignedProspectCycleOver: true }, STANDARD)).toBe('drop');
    expect(decidePerson({ ...base, unsignedProspectCycleOver: true, linkedToUser: true }, STANDARD)).toBe('keep');
    expect(decidePerson({ ...base, unsignedProspectCycleOver: true }, FULL)).toBe('keep');
  });
});
