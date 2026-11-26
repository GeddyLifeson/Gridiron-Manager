// WP-23, third part: the three real stage modules together (quarterback WP-20, ball carrier WP-21,
// fouls and injuries WP-22). FIXTURE units, calls, parameters and rule values, so these check that the
// modules meet (who owns the man with the ball, who ends the play, one hit-load ledger, determinism),
// not football rates. Rates are WP-26's.
import { describe, expect, it } from 'vitest';
import { deadBallOf, eventsOf, playTruthProblems, type PlayInput, type PlayResult } from '@gm/schema';
import { canonicalBytes } from '../../src/canonical.ts';
import {
  CARRIER_PLUG_VERSION, availablePlugs, ballCarrierPlug, createTickResolver, quarterbackPlug, type StagePlug,
} from '../../src/tick-resolver/index.ts';
import { ALL_RULES, ALL_TABLE, CONTENT, playInput, type Kind } from './support.ts';

const hex = (r: PlayResult): string => Buffer.from(canonicalBytes({ truth: r.truth, deltas: r.deltas, live: r.liveDurationTenths })).toString('hex');
const input = (kind: Kind, seed: number, over: Partial<Parameters<typeof playInput>[0]> = {}): PlayInput =>
  ({ ...playInput({ kind, seed, playNumber: seed, params: ALL_TABLE, attackDir: seed % 2 === 0 ? 1 : -1, ballX: 30 + (seed % 5) * 12, ...over }), rules: ALL_RULES });
const resolver = createTickResolver({ content: CONTENT, plugs: availablePlugs() });
const QB_ID = 109;
const KINDS: readonly Kind[] = ['pass', 'run', 'punt', 'field_goal', 'kickoff', 'onside_kick', 'fair_catch_kick'];

describe('tick resolver on all three real modules: honesty', () => {
  it('runs no stand-in and may produce saved results', () => {
    expect(resolver.report.standIns).toEqual([]);
    expect(resolver.mayProduceSavedResults).toBe(true);
    expect(resolver.report.moduleVersions['carrier']).toBe(CARRIER_PLUG_VERSION);
    expect(resolver.report.moduleVersions['foulsInjuries']).toMatch(/^fouls-injuries-/);
  });
  it('still names a missing module', () => {
    const r = createTickResolver({ content: CONTENT, plugs: [quarterbackPlug(), ballCarrierPlug()] });
    expect(r.report.standIns).toEqual(['foulsInjuries']);
    expect(r.mayProduceSavedResults).toBe(false);
  });
});

describe('tick resolver on all three real modules: the truth record', () => {
  const tally = new Map<string, number>();
  const add = (k: string): void => { tally.set(k, (tally.get(k) ?? 0) + 1); };
  it('keeps every structural promise on seeded plays of every kind and never hits the tick limit', () => {
    for (const kind of KINDS) for (let seed = 1; seed <= (kind === 'pass' || kind === 'run' ? 60 : 16); seed++) {
      const r = resolver.simulatePlay(input(kind, seed)), where = `${kind} seed ${seed}`;
      expect(playTruthProblems(r.truth), where).toEqual([]);
      const dead = deadBallOf(r.truth);
      expect(dead.reason, where).not.toBe('engine_fault');
      add(`${kind}:${dead.reason}`);
      for (const t of eventsOf(r.truth, 'tackle_attempt')) add(`tackle:${t.outcome}`);
      for (const f of eventsOf(r.truth, 'foul_committed')) add(`foul:${f.foulId}`);
      for (const d of eventsOf(r.truth, 'detail')) if (d.code === 'tick.carrier.no_procedure') add(`handed:${kind}`);
      for (const d of r.deltas) { expect(d.hitLoad, where).toBeGreaterThanOrEqual(0); expect(Number.isFinite(d.hitLoad), where).toBe(true); }
      // The quarterback is his own module's until it says he runs or his part is over (J6.2.5): nobody
      // tackles him as a runner before one of those is on the record.
      const details = eventsOf(r.truth, 'detail');
      for (const t of eventsOf(r.truth, 'tackle_attempt')) {
        if (t.carrierId !== QB_ID) continue;
        const released = details.some((d) => d.t <= t.t && d.playerIds.includes(QB_ID) && (d.code === 'tick.carrier.no_procedure' || /^qb\.(scramble|keep|sneak|run|draw|escape)/.test(d.code)));
        expect(released, `${where}: quarterback tackled at ${t.t} while still in his procedure`).toBe(true);
      }
      // A punter or a holder is the kick operation's until the ball is kicked.
      if (kind === 'punt' || kind === 'field_goal') {
        const kick = eventsOf(r.truth, 'kick')[0];
        for (const d of details) if (d.code === 'tick.carrier.no_procedure' && kick !== undefined) expect(d.t, where).toBeGreaterThanOrEqual(kick.t);
      }
    }
    if (process.env['GM_TICK_TALLY']) console.log(Object.fromEntries([...tally].sort()));
  }, 240_000);
  it('ends runs and catches with tackles, not only at the goal line or the sideline', () => {
    expect(tally.get('tackle:made') ?? 0).toBeGreaterThan(20);
    expect((tally.get('run:down_by_contact') ?? 0) + (tally.get('run:forward_progress_stopped') ?? 0)).toBeGreaterThan(5);
  });
  it('gives identical bytes for the same input, in any order of plays', () => {
    const fresh = createTickResolver({ content: CONTENT, plugs: availablePlugs() });
    for (const kind of KINDS) for (const seed of [3, 4]) {
      const a = hex(resolver.simulatePlay(input(kind, seed)));
      expect(hex(fresh.simulatePlay(input(kind, seed))), `${kind} ${seed}`).toBe(a);
    }
    for (const kind of [...KINDS].reverse()) expect(hex(fresh.simulatePlay(input(kind, 3))), kind).toBe(hex(resolver.simulatePlay(input(kind, 3))));
  }, 120_000);
  it('gives the same result at summary and full detail', () => {
    for (const kind of ['pass', 'run', 'punt'] as const) {
      const a = resolver.simulatePlay(input(kind, 5)), b = resolver.simulatePlay(input(kind, 5, { detail: 'full' }));
      expect(hex(b), kind).toBe(hex(a));
      expect((b.explain as { modules: { id: string }[] }).modules.map((m) => m.id)).toEqual(['qb', 'carrier', 'foulsInjuries']);
    }
  });
});

describe('tick resolver: one hit-load ledger (J10.6.2)', () => {
  const fake = (id: StagePlug['id'], load: number): StagePlug => ({ id, version: 'fake', create: () => ({ stages: [], hitLoad: () => load }) });
  const standInEnd = (plugs: StagePlug[]): PlayResult => createTickResolver({ content: CONTENT, plugs }).simulatePlay(playInput({ kind: 'kickoff', seed: 2 }));
  it('uses the fouls-and-injuries ledger alone when that module keeps one', () => {
    for (const d of standInEnd([fake('carrier', 5), fake('foulsInjuries', 2)]).deltas) expect(d.hitLoad).toBe(2);
  });
  it('sums what the other modules saw when it keeps none', () => {
    for (const d of standInEnd([fake('qb', 1), fake('carrier', 5)]).deltas) expect(d.hitLoad).toBe(6);
  });
});
