// Fouls in the reference resolver (J15.7.1, contract D-06): committed acts only, gated by the rule set.
import { describe, expect, it } from 'vitest';
import { deadBallOf, eventsOf, type PlayCalls, type PlayResult, type RuleSet } from '@gm/schema';
import { FOUL_ROWS, PARAMS, REFERENCE_RESOLVER as R } from '../../src/resolver/index.ts';
import { defenseCall, fixtureRules, input, kickCall, offenseCall, problems, returnCall, situation } from './helpers.ts';

const P = (name: string): number => PARAMS.params.find((p) => p.name === `resolverRef.${name}`)!.value;
const N = 60_000;

function plays(calls: PlayCalls, rules: RuleSet, n = N): PlayResult[] {
  const out: PlayResult[] = [];
  for (let i = 1; i <= n; i++) out.push(R.simulatePlay(input(situation({ playNumber: i }), calls, { rules })));
  return out;
}
const count = (rs: readonly PlayResult[]) => {
  const by = new Map<string, number>();
  for (const r of rs) for (const f of eventsOf(r.truth, 'foul_committed')) by.set(f.foulId, (by.get(f.foulId) ?? 0) + 1);
  return by;
};
const passCalls: PlayCalls = { snapping: offenseCall(0, 'dropback_pass'), opposing: defenseCall(1) };
const runCalls: PlayCalls = { snapping: offenseCall(0, 'run'), opposing: defenseCall(1) };

describe('reference resolver: fouls', () => {
  it('commits no foul when the rule set carries no foul catalogue', () => {
    for (const r of plays(passCalls, fixtureRules(), 5000)) expect(eventsOf(r.truth, 'foul_committed')).toEqual([]);
  });

  it('never commits a foul the rule set says does not exist', () => {
    const rules = fixtureRules({ fouls: true, off: ['illegal_contact', 'false_start'] });
    const by = count(plays(passCalls, rules));
    expect(by.get('illegal_contact')).toBeUndefined();
    expect(by.get('false_start')).toBeUndefined();
    expect(by.get('offensive_holding') ?? 0).toBeGreaterThan(0);
  });

  it('commits each type near its per-game row scaled to committed acts', () => {
    const rules = fixtureRules({ fouls: true });
    const pass = plays(passCalls, rules);
    const run = plays(runCalls, rules);
    const byPass = count(pass);
    const byRun = count(run);
    const perPlay = (perGame: number) => (perGame * P('foul.committedPerAccepted')) / P('volume.playsPerGame');
    // Types open on every scrimmage play: the same chance on a run and on a pass.
    for (const id of ['false_start', 'offensive_holding', 'delay_of_game', 'offside', 'unnecessary_roughness']) {
      const row = FOUL_ROWS.find((f) => f.id === id)!;
      const p = perPlay(row.perGame);
      const se = Math.sqrt(p / N);
      expect(Math.abs((byPass.get(id) ?? 0) / N - p), `${id} on passes`).toBeLessThan(5 * se);
      expect(Math.abs((byRun.get(id) ?? 0) / N - p), `${id} on runs`).toBeLessThan(5 * se);
    }
    // Pass-only types never happen on a run.
    for (const id of ['dpi', 'opi', 'def_holding', 'illegal_contact', 'roughing_passer', 'ineligible_downfield_pass', 'intentional_grounding']) {
      expect(byRun.get(id), id).toBeUndefined();
      expect(byPass.get(id) ?? 0, id).toBeGreaterThan(0);
    }
    for (const r of [...pass.slice(0, 5000), ...run.slice(0, 5000)]) expect(problems(r)).toEqual([]);
  });

  it('a dead-ball foul before the snap leaves a play that never became live', () => {
    const rules = fixtureRules({ fouls: true });
    let seen = 0;
    for (const r of plays(runCalls, rules, 5000)) {
      const d = deadBallOf(r.truth);
      if (d.reason !== 'pre_snap_foul') continue;
      seen++;
      expect(r.liveDurationTenths).toBe(0);
      expect(r.truth.events.length).toBe(2);
      const f = eventsOf(r.truth, 'foul_committed')[0]!;
      expect(f.timing).toBe('before_snap');
      expect(f.t).toBeLessThan(0);
      expect(['false_start', 'delay_of_game', 'neutral_zone_infraction', 'encroachment']).toContain(f.foulId);
      expect(r.deltas.every((x) => x.energyCost === 0)).toBe(true);
    }
    expect(seen).toBeGreaterThan(50);
  });

  it('puts live fouls before the dead ball and fouls after the play behind it, on the side the row names', () => {
    const rules = fixtureRules({ fouls: true });
    const sides = new Map(FOUL_ROWS.map((f) => [f.id, f.by]));
    for (const r of plays(passCalls, rules, 20_000)) {
      const d = deadBallOf(r.truth);
      const deadIndex = r.truth.events.indexOf(d);
      r.truth.events.forEach((e, i) => {
        if (e.type !== 'foul_committed') return;
        if (e.timing === 'dead_ball') { expect(i).toBeGreaterThan(deadIndex); expect(e.t).toBeGreaterThan(d.t); }
        else expect(i).toBeLessThan(deadIndex);
        const by = sides.get(e.foulId)!;
        if (by === 'snapping') expect(e.side).toBe(0);
        if (by === 'opposing') expect(e.side).toBe(1);
        expect(e.ordered).toBe(false);
        expect(e.borderline).toBe(false);
      });
    }
  });

  it('commits return fouls only on a kick that was returned, and no snap fouls on a free kick', () => {
    const rules = fixtureRules({ fouls: true });
    const free = { ballX: 45, playKind: 'kickoff', down: null, distanceYd: null, lineToGainX: null } as const;
    let blocks = 0;
    for (let i = 1; i <= N; i++) {
      const r = R.simulatePlay(input(situation({ ...free, playNumber: i }), { snapping: kickCall(0, 'kickoff'), opposing: returnCall(1) }, { rules }));
      const reason = deadBallOf(r.truth).reason;
      expect(reason).not.toBe('pre_snap_foul');
      for (const f of eventsOf(r.truth, 'foul_committed')) {
        expect(['illegal_block_in_back', 'unnecessary_roughness', 'unsportsmanlike', 'taunting']).toContain(f.foulId);
        expect(f.phase).toBe('free_kick');
        if (f.foulId === 'illegal_block_in_back') { blocks++; expect(reason === 'ball_dead_in_end_zone' && r.truth.endZoneImpetus === 0 && eventsOf(r.truth, 'possession').length === 0).toBe(false); }
      }
    }
    expect(blocks).toBeGreaterThan(100);
  });

  it('gives the same plays with and without the catalogue, apart from the fouls themselves', () => {
    // The foul draws are taken either way, so adding the catalogue cannot move another draw.
    const a = plays(passCalls, fixtureRules(), 3000);
    const b = plays(passCalls, fixtureRules({ fouls: true }), 3000);
    for (let i = 0; i < a.length; i++) {
      if (deadBallOf(b[i]!.truth).reason === 'pre_snap_foul') continue;
      const strip = (r: PlayResult) => JSON.stringify(r.truth.events.filter((e) => e.type !== 'foul_committed'));
      expect(strip(b[i]!)).toBe(strip(a[i]!));
    }
  });
});
