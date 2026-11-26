// The coach screens over a running save: a trimmed real-content world run for two seasons with the loop's test
// doubles (world/test/fixtures; the doubles are not a result model), the user put in a staff seat. The host must
// read only what his observer may read, show his stints, his team's seasons and the people he worked beside,
// and give each screen the save has no data for (money, life, market, contract terms) its empty view.
import { describe, expect, it } from 'vitest';
import { CAREER_SCREEN_SCHEMAS } from '@gm/schema';
import { positions } from '@gm/career';
import { newWorld, runningSave } from './live-world.ts';
import { ObservedWorld, ReadModelRegistry, buildReadModel, crawlPassed, crawlReadModels, observerFor, PUBLIC_OBSERVER } from '../../../src/observer/index.ts';
import { careerHost, careerSourcesOf, careerSpecs, CAREER_MODELS, EMPTY_VIEWS, liveCareerTables, teamSeasonOf } from '../../../src/read-models/career/index.ts';

// A position coach below head coach, so the Office list applies (O7.2.1).
const fixture = runningSave(2);

describe('career screens from the running save (CR-CS-2 stop-gap)', () => {
  it('names him, his seat and his stints from the staff lists', () => {
    const { w, user } = fixture;
    const v = careerHost(w).career();
    const p = w.people.get(user)!;
    expect(v.name).toBe(`${p.name.first} ${p.name.last}`);
    const now = [...w.jobs.values()].find((j) => j.holderPersonId === user);
    if (now) expect(v.jobTitle).toBe(positions.CATALOGUE.job(now.catalogueId).title);
    expect(v.history.length).toBeGreaterThan(0);
    expect(v.history[0]!.season).toBe(w.setup.firstSeasonYear);
  });
  it('his seasons carry the team results the world kept, season by season', () => {
    const { w, user } = fixture;
    const v = careerHost(w).record();
    expect(v.seasons.length).toBeGreaterThan(0);
    for (const s of v.seasons) {
      const team = w.teams.find((t) => t.identity.name === s.team)!;
      expect(teamSeasonOf(w, team.id, s.season)).toEqual({ wins: s.wins, losses: s.losses, ties: s.ties });
    }
    // Only seasons he spent on that staff.
    for (const s of v.seasons) expect(w.staffSeasons.some((x) => x.seasonYear === s.season && (x.headCoachId === user || x.staffIds.includes(user)))).toBe(true);
  });
  it('the network is the people who shared a staff with him', () => {
    const { w, user } = fixture;
    const v = careerHost(w).career();
    expect(v.network.length).toBeGreaterThan(0);
    const mates = new Set<string>();
    for (const s of w.staffSeasons) {
      const all = [s.headCoachId, ...s.staffIds];
      if (all.includes(user)) for (const id of all) if (id !== null && id !== user) { const p = w.people.get(id); if (p) mates.add(`${p.name.first} ${p.name.last}`); }
    }
    for (const n of v.network) expect(mates.has(n.name)).toBe(true);
  });
  it('screens the save holds nothing for show their empty view, never a made-up value', () => {
    const h = careerHost(fixture.w);
    const rights = h.career().rights;
    expect(h.finance()).toEqual(EMPTY_VIEWS.finance(rights));
    expect(h.life()).toEqual(EMPTY_VIEWS.life(rights));
    expect(h.jobMarket()).toEqual(EMPTY_VIEWS.jobMarket(rights));
    expect(h.contract()).toEqual(EMPTY_VIEWS.contract(rights));
  });
  it('the Office list carries his seat\'s duties and the hours left after required work', () => {
    // Between seasons the loop sits at week 0: an off-season week, where only seasonal duties show (S3.1.1).
    expect(fixture.w.week).toBe(0);
    const a = careerHost(fixture.w, { week: () => 'game' }).assignments();
    expect(a).not.toBeNull();
    expect(a!.rows.length).toBeGreaterThan(0);
    expect(a!.freeHours).toBeGreaterThanOrEqual(0);
    expect(a!.bossName).not.toBe('');
  });
  it('another seat or the public gets nothing from his sources', () => {
    const { w, user } = fixture;
    const { source, how } = liveCareerTables(w, user);
    const other = [...w.jobs.values()].find((j) => j.holderPersonId !== null && j.holderPersonId !== user)!.holderPersonId!;
    for (const observer of [observerFor(source, other), PUBLIC_OBSERVER]) {
      const src = careerSourcesOf(new ObservedWorld(source, observer), { how, week: 'game', seasonYear: w.date.seasonYear, teamSeason: () => null });
      const r = new ReadModelRegistry();
      for (const s of careerSpecs(CAREER_SCREEN_SCHEMAS, src)) r.register(s);
      for (const n of Object.values(CAREER_MODELS)) expect(buildReadModel(r, source, observer, n, { personId: user }).model.data).toBeNull();
    }
  });
  it('passes the Q1.4.2 crawler on the live tables: no truth, no hidden fact moves a screen', () => {
    const { w, user } = fixture;
    const { source, how } = liveCareerTables(w, user);
    const registry = (s: typeof source) => {
      const r = new ReadModelRegistry();
      const observed = new ObservedWorld(s, observerFor(s, user));
      for (const spec of careerSpecs(CAREER_SCREEN_SCHEMAS, careerSourcesOf(observed, { how, week: 'game', seasonYear: w.date.seasonYear, teamSeason: (t, y) => { const l = teamSeasonOf(w, t, y); return l ? { ...l, finish: null } : null; } }))) r.register(spec);
      return r;
    };
    const rep = crawlReadModels({
      registry, source, observers: [{ name: 'coach', observer: observerFor(source, user) }, { name: 'public', observer: PUBLIC_OBSERVER }],
      params: () => [{ personId: user }], markedPersonIds: [user],
    });
    expect(rep.errors).toEqual([]);
    expect(rep.sentinelHits).toEqual([]);
    expect(rep.divergences).toEqual([]);
    expect(crawlPassed(rep)).toBe(true);
  });
  it('a save with no user has no career screens', () => {
    const w = newWorld();
    w.userPersonId = null;
    const h = careerHost(w);
    expect(h.personId).toBeNull();
    expect(h.assignments()).toBeNull();
    expect(h.career().name).toBe('');
  });
});
