// The coach screens over a running save: a trimmed real-content world run for two seasons with the loop's test
// doubles (world/test/fixtures; the doubles are not a result model), the user put in a staff seat. The host must
// read only what his observer may read, show his stints, his team's seasons and the people he worked beside,
// and fill contract, market, money and life from his own file in the save (coach-state.test.ts covers it).
import { describe, expect, it } from 'vitest';
import { CAREER_SCREEN_SCHEMAS } from '@gm/schema';
import { positions } from '@gm/career';
import { newWorld, runningSave } from './live-world.ts';
import { ObservedWorld, ReadModelRegistry, buildReadModel, crawlPassed, crawlReadModels, observerFor, PUBLIC_OBSERVER } from '../../../src/observer/index.ts';
import { careerHost, careerSourcesOf, COACH_KEY, NOTEBOOK_KEY, careerSpecs, CAREER_MODELS, EMPTY_VIEWS, liveCareerTables, teamSeasonOf } from '../../../src/read-models/career/index.ts';

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
  it('contract, market, money and life read the coach\'s own file in the save (career.coach)', () => {
    const h = careerHost(fixture.w);
    const rights = h.career().rights;
    expect(fixture.w.systemState.get(COACH_KEY)).toBeDefined();
    expect(h.finance()).not.toEqual(EMPTY_VIEWS.finance(rights));
    expect(h.finance().netWorth.length).toBe(1);
    expect(h.life().family).toEqual([]);
    expect(h.life().hours.length).toBeGreaterThan(0);
    expect(h.jobMarket().windowOpen).toBe(h.jobMarket().openings.length > 0);
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
  it('the notebook keeps his notes in the save, stamped with the job he holds, subjects named as he knows them', () => {
    const { w, user } = runningSave(1);
    const h = careerHost(w);
    expect(h.notebook()!.blank).toBe(true);
    const mate = [...w.jobs.values()].find((j) => j.holderPersonId !== null && j.holderPersonId !== user)!.holderPersonId!;
    expect(h.notebookAct({ kind: 'write', text: 'Runs the stretch well', subjects: [{ type: 'person', id: mate }] }, '2026-11-26')).toEqual({ ok: true });
    expect(h.notebookAct({ kind: 'write', text: '   ' })).toEqual({ ok: false, key: 'note.empty' });
    const v = h.notebook()!;
    expect(v.rows).toHaveLength(1);
    const p = w.people.get(mate)!;
    expect(v.rows[0]!.subjects[0]!.name).toBe(`${p.name.first} ${p.name.last}`);
    const job = [...w.jobs.values()].find((j) => j.holderPersonId === user)!;
    expect(v.rows[0]!.job.key).toBe(`${job.catalogueId}@${job.teamId}`);
    expect(w.systemState.get(NOTEBOOK_KEY)).toBeDefined();
    // A fresh host over the same save reads the same file; the text export names the subject.
    expect(careerHost(w).notebook()!.rows[0]!.text).toBe('Runs the stretch well');
    expect(careerHost(w).notebookText()).toContain(p.name.last);
    // Another coach's host on this save does not see his file.
    expect(careerHost(w, { personId: mate }).notebook()!.blank).toBe(true);
    // No statement saved yet: no ledger.
    expect(h.ledger()).toEqual({ own: null, boss: null });
  });
  it('a save with no user has no career screens', () => {
    const w = newWorld();
    w.userPersonId = null;
    const h = careerHost(w);
    expect(h.personId).toBeNull();
    expect(h.assignments()).toBeNull();
    expect(h.career().name).toBe('');
    expect(h.notebook()).toBeNull();
  });
});
