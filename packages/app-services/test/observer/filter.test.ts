// The observer filter (P1.1.4, K9.1.1). This file is the field whitelist test of the bridge
// `observer.filter` (K9.3.1 rule 4).
import { describe, expect, it } from 'vitest';
import { allSchemas, PersonRecord, PlayRecord, GameEvent, GameState, Decision, ContractRecord, type PersonRecord as Person } from '@gm/schema';
import {
  PUBLIC_OBSERVER, ObservedWorld, observerFor, filterValue, newReport, fullSample, maxUnionOptions, heldPaths, lookupFrom, canonical,
  bridges, PARAMS, type Observer,
} from '../../src/observer/index.ts';
import { fixtureWorld, HOME, AWAY, USER, ASSISTANT, AWAY_COACH, OWNER, AGENT } from './fixture-world.ts';

const world = fixtureWorld();
const seat = (personId: number) => new ObservedWorld(world, observerFor(world, personId));
const user = seat(USER), assistant = seat(ASSISTANT), away = seat(AWAY_COACH), owner = seat(OWNER);
const fan = new ObservedWorld(world, PUBLIC_OBSERVER);
const text = (v: unknown) => canonical(v);

describe('whitelist over every contract shape (K9.3.1 rule 4, Q1.4.2)', () => {
  const everyTeam: Observer = { personId: 1, teamScopes: Object.fromEntries(Array.from({ length: 9 }, (_x, i) => [String(i), ['*']])) };
  for (const [name, schema] of Object.entries(allSchemas())) {
    it(`${name}: a public observer holds public fields only; no observer holds truth`, () => {
      for (let option = 0; option < maxUnionOptions(schema); option++) {
        const sample = fullSample(schema, option);
        const pub = filterValue(schema, sample, PUBLIC_OBSERVER);
        // An event with public witnesses is witnessed by everyone (W-16): there the public observer is an owner.
        const witnessed = name === 'world:WorldEvent' && (sample as { witnesses: { kind: string } }).witnesses.kind === 'public';
        if (pub !== undefined && !witnessed) expect(heldPaths(schema, pub).filter((h) => h.vis !== 'public')).toEqual([]);
        if (witnessed) expect(heldPaths(schema, pub).filter((h) => h.vis === 'truth')).toEqual([]);
        // The widest observer there can be: every scope on every team, and named owner of the value.
        const wide = filterValue(schema, sample, everyTeam, { owners: { everyone: true }, sideTeams: [1, 2] });
        if (wide !== undefined) expect(heldPaths(schema, wide).filter((h) => h.vis === 'truth' || h.vis === 'unclassified' || h.vis === 'unknown_key')).toEqual([]);
      }
    });
  }
  it('the filter has no option that releases truth, and drops what the schema does not name', () => {
    const p = (world.rows('people') as Person[]).find((x) => x.id === 101)!;
    const report = newReport();
    const seen = filterValue(PersonRecord, { ...p, trueOverall: 99 }, observerFor(world, OWNER), { lookup: lookupFrom(world), owners: { everyone: true }, report });
    expect(seen).toBeDefined();
    expect(text(seen)).not.toContain('trueOverall');
    expect(seen!.playing).toBeDefined();
    expect(seen!.playing!.attributes).toBeUndefined();
    expect(seen!.playing!.ceilings).toBeUndefined();
    expect(seen!.traitBlock).toBeUndefined();
    expect(seen!.provenance).toBeUndefined();
    expect(report.dropped.map((d) => d.reason)).toContain('unknown_key');
    expect(report.dropped.filter((d) => d.reason === 'truth').length).toBeGreaterThan(4);
  });
  it('the bridge list is short and every bridge names its whitelist test (K9.3.1 acceptance)', () => {
    const max = PARAMS.params.find((p) => p.name === 'observer.bridge.max_count')!.value;
    expect(bridges().length).toBeLessThanOrEqual(max);
    for (const b of bridges()) expect(b.whitelistTest).toMatch(/\.test\.ts$/);
  });
});

describe('own team, other team, public (K9.1.1 items 1 and 2)', () => {
  it('nobody reads true attributes, trait blocks, hidden coach parameters, knowledge, memories or person states', () => {
    for (const w of [user, assistant, away, owner, fan]) {
      for (const p of w.table('people')) {
        expect(p.traitBlock).toBeUndefined();
        expect(p.playing?.attributes).toBeUndefined();
        expect(p.coaching?.hidden).toBeUndefined();
      }
      expect(w.table('knowledge').every((k) => k.value === undefined)).toBe(true);
      expect(w.table('memories').every((m) => Object.keys(m).length === 0)).toBe(true);
      expect(w.table('personStates').every((m) => Object.keys(m).length === 0)).toBe(true);
      expect(w.table('games')[0]!.seedHex).toBeUndefined();
      expect(w.table('teams').every((t) => t.prestige === undefined)).toBe(true);
    }
  });
  it('a staff reads its own estimates and never another organisation\'s', () => {
    expect(user.table('personViews').length).toBe(12);
    expect(user.table('personViews').every((v) => v.observerTeamId === HOME && v.perAttribute !== undefined)).toBe(true);
    expect(away.table('personViews').every((v) => v.observerTeamId === AWAY)).toBe(true);
    expect(fan.table('personViews')).toEqual([]);
    // A player reads what the whole team is told, not the staff's evaluations of him.
    expect(seat(101).table('personViews')).toEqual([]);
  });
  it('an event is seen by its witnesses and its actors (W-16)', () => {
    const ids = (w: ObservedWorld) => w.table('events').map((e) => e.id);
    expect(ids(fan)).toEqual([500]);
    expect(ids(user)).toEqual([500, 503]);
    expect(ids(assistant)).toEqual([500, 501, 503]);
    expect(ids(away)).toEqual([500, 501, 502, 504]);
    expect(ids(seat(107))).toEqual([500, 502]);
    expect(ids(seat(101))).toEqual([500]); // a player is not in the staff room
    expect(user.table('events').every((e) => !('tier' in e) && !('source' in e))).toBe(true);
  });
  it('a prospect row shows a team its own line only', () => {
    const [p] = user.table('prospects');
    expect(p!.teams!.map((t) => t.teamId)).toEqual([HOME]);
    expect(p!.teams![0]!.boardPosition).toBe(4);
    expect(p!.teams![0]!.interest).toBeUndefined(); // the prospect's true interest
    expect(away.table('prospects')[0]!.teams!.map((t) => t.teamId)).toEqual([AWAY]);
    expect(fan.table('prospects')[0]!.teams).toBeUndefined();
    expect(fan.table('prospects')[0]!.publicRating).toBe(3);
  });
  it('a job search shows the hiring team every candidate and a candidate his own line', () => {
    expect(away.table('openings')[0]!.candidates!.length).toBe(2);
    expect(assistant.table('openings')[0]!.candidates!.map((c) => c.personId)).toEqual([ASSISTANT]);
    expect(user.table('openings')[0]!.candidates).toBeUndefined();
    expect(user.table('openings')[0]!.stage).toBe('interviews');
  });
  it('coach contract terms are known to the parties; filed player contracts are public (W-14)', () => {
    const terms = (w: ObservedWorld, id: number) => w.table('contracts').find((c) => c.id === id)!.terms as Record<string, unknown> | undefined;
    expect(terms(fan, 1)!.signingBonusCents).toBe(100000);
    expect(terms(user, 2)!.salary).toBeDefined();           // his own
    expect(terms(user, 4)!.salary).toBeDefined();           // he holds final say on staff hiring
    expect(terms(assistant, 2)!.salary).toBeUndefined();    // not the head coach's pay
    expect(terms(assistant, 4)!.salary).toBeDefined();      // his own
    expect(terms(owner, 2)!.salary).toBeDefined();
    expect(terms(away, 2)!.salary).toBeUndefined();
    expect(text(away.table('contracts'))).not.toContain('400000000');
    expect(new ObservedWorld(world, observerFor(world, AGENT)).table('contracts').find((c) => c.id === 1)!.agentId).toBe(AGENT);
  });
  it('personal rows are personal: inbox, money, household, evaluations, grades', () => {
    expect(user.table('inbox').map((i) => i.ownerPersonId)).toEqual([USER]);
    expect(user.table('balanceSheets').map((b) => b.personId)).toEqual([USER]);
    expect(user.table('ledger')).toEqual([]);
    expect(user.table('evaluations')).toEqual([]);
    expect(user.table('households')[0]!.members![0]!.needs).toBeUndefined();
    expect(away.table('households')).toEqual([]);
    expect(user.table('playGrades').map((g) => g.note)).toEqual(['home grade']);
    expect(away.table('playGrades').map((g) => g.note)).toEqual(['away grade']);
    expect(fan.table('playGrades')).toEqual([]);
  });
  it('medical estimates go to the injured player\'s own side; the true course to nobody', () => {
    const inj = (w: ObservedWorld, personId: number) => w.table('injuries').find((i) => i.personId === personId)!;
    expect(inj(user, 101).estimatedDays).toEqual([7, 21]);
    expect(inj(user, 107).estimatedDays).toBeUndefined();
    expect(inj(user, 107).designation).toBe('questionable'); // the published report
    expect(inj(seat(101), 101).estimatedDays).toEqual([7, 21]);
    for (const w of [user, away, fan]) expect(text(w.table('injuries'))).not.toMatch(/trueDaysToMilestone|severity|lastingLoss/);
  });
  it('a fact with no owner rule is released to nobody (fail closed)', () => {
    for (const w of [user, owner, fan]) expect(w.table('world')[0]!.nextIds).toBeUndefined();
  });
  it('a filtered table is new plain data: changing it does not touch the world', () => {
    const before = text(world.rows('teams'));
    (user.table('teams')[0] as { identity: { name: string } }).identity.name = 'changed';
    expect(text(world.rows('teams'))).toBe(before);
  });
});

describe('game shapes (Q1.4.1: the other side\'s call)', () => {
  const lookup = lookupFrom(world);
  const home = observerFor(world, USER), visitors = observerFor(world, AWAY_COACH);
  const play = { ...(fullSample(PlayRecord) as Record<string, unknown>), gameId: 7 } as { gameId: number; situation: { offense: number }; calls: { snapping: Record<string, unknown>; opposing: Record<string, unknown> } };
  play.situation.offense = 0; // HOME snaps
  it('a play record gives each side its own call and the film-visible part of the other', () => {
    const h = filterValue(PlayRecord, play, home, { lookup })!;
    const a = filterValue(PlayRecord, play, visitors, { lookup })!;
    expect(h.calls!.snapping!).toHaveProperty('playContentId');
    expect(h.calls!.opposing!).not.toHaveProperty('coverageId');
    expect(h.calls!.opposing!).toHaveProperty('coverageFamily');
    expect(a.calls!.snapping!).not.toHaveProperty('playContentId');
    expect(a.calls!.snapping!).toHaveProperty('formationId');
    expect(a.calls!.opposing!).toHaveProperty('coverageId');
    for (const v of [h, a]) { expect(v).not.toHaveProperty('truth'); expect(v).not.toHaveProperty('deltas'); }
    const f = filterValue(PlayRecord, play, PUBLIC_OBSERVER, { lookup })!;
    expect(f.calls!.snapping!).not.toHaveProperty('playContentId');
    expect(f.calls!.opposing!).not.toHaveProperty('pressureId');
  });
  it('the rule follows the shape when it is nested in a game event', () => {
    const ev = { type: 'play_resolved', record: play };
    const a = filterValue(GameEvent, ev, visitors, { lookup }) as { record: { calls: { snapping: object; opposing: object }; truth?: unknown } };
    expect(a.record.truth).toBeUndefined();
    expect(a.record.calls.snapping).not.toHaveProperty('playContentId');
    expect(a.record.calls.opposing).toHaveProperty('coverageId');
  });
  it('a pending decision shows its call to the side that made it only', () => {
    const d = { ...(fullSample(Decision) as Record<string, unknown>), side: 0 };
    expect(filterValue(Decision, d, home, { sideTeams: [HOME, AWAY] })).toHaveProperty('snappingCall');
    expect(filterValue(Decision, d, visitors, { sideTeams: [HOME, AWAY] })).not.toHaveProperty('snappingCall');
    expect(filterValue(Decision, d, home)).not.toHaveProperty('snappingCall'); // no game named: nobody
  });
  it('the live game state never carries the seed or the bench truth', () => {
    const s = filterValue(GameState, fullSample(GameState), home, { sideTeams: [HOME, AWAY] })!;
    expect(s).not.toHaveProperty('seedHex');
    expect(s).not.toHaveProperty('gameDay');
    expect(s).toHaveProperty('score');
  });
  it('a caller may name the owner of a value that has no rule', () => {
    const terms = (world.rows('contracts') as { id: number; terms: unknown }[]).find((c) => c.id === 3)!;
    const asParty = filterValue(ContractRecord, terms, home, { owners: { personIds: [USER] } }) as { terms: object };
    expect(asParty.terms).toHaveProperty('salary');
  });
});
