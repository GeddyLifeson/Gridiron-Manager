// WP-21 scene tests and J8 acceptance checks on bodies. Defenders are scripted chasers (a test stand-in
// for J8.5 pursuit, which is J4 rule content); the carrier, movement, ball and contests are the real
// modules. Rates here are checks of direction and size the leaves ask for, not calibration (J15, Q2).
import { describe, expect, it } from 'vitest';
import { BEHAVIORS, type TruthEvent } from '@gm/schema';
import { RB, runScene, share, tableWith } from './helpers.ts';

const V = (v: number) => ({ vision_zone: v, vision_gap: v });
const reason = (e: TruthEvent | null): string | null => (e !== null && e.type === 'dead_ball' ? e.reason : null);
const T = 120_000;

describe('determinism and draws', () => {
  it('the same seed gives the same play; another seed gives another', () => {
    const spec = { chasers: { 12: { at: [8, 2] as const, speed: 8 }, 13: { at: [12, -4] as const, speed: 8 } }, maxTicks: 60 };
    const a = runScene({ ...spec, seed: 3 }), b = runScene({ ...spec, seed: 3 });
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(JSON.stringify(a.carrier.lanes())).toBe(JSON.stringify(b.carrier.lanes()));
    let differs = false;
    for (let s = 4; s < 12 && !differs; s++) differs = JSON.stringify(runScene({ ...spec, seed: s }).carrier.lanes()) !== JSON.stringify(a.carrier.lanes());
    expect(differs).toBe(true);
  });
});

describe('J6.6.1 tackle on bodies', () => {
  it('a made tackle emits tackle_attempt, ends the play down by contact and records hit load', () => {
    let found = false;
    for (let seed = 1; seed <= 80 && !found; seed++) {
      const r = runScene({ seed, rbAt: [0, 0], rbVel: [7, 0], chasers: { 12: { at: [6, 0.5], speed: 8 } }, maxTicks: 40 });
      const made = r.record.tackles.find((t) => t.outcome === 'made' && !t.fumble && t.type === 'headOn');
      if (!made) continue;
      found = true;
      const ev = r.events.filter((e) => e.type === 'tackle_attempt');
      expect(ev.at(-1)).toMatchObject({ outcome: 'made', carrierId: r.world.slots[RB]!.playerId, tacklerIds: [r.world.slots[made.tacklerSlot]!.playerId] });
      expect(['down_by_contact', 'ball_across_goal_line_in_possession', 'runner_out_of_bounds']).toContain(reason(r.dead));
      expect(r.events.filter((e) => e.type === 'dead_ball')).toHaveLength(1);
      expect(r.carrier.hitLoad(RB)).toBeGreaterThan(0);
      expect(r.carrier.hitLoad(made.tacklerSlot)).toBeGreaterThan(0);
      expect(made.pTackle).toBeGreaterThan(0); expect(made.pTackle).toBeLessThan(1);
      expect(made.progressYd).toBeGreaterThanOrEqual(0); expect(made.progressYd).toBeLessThanOrEqual(3);
    }
    expect(found).toBe(true);
  });
  it('a missed tackler is on the ground and cannot try again at once', () => {
    let checked = false;
    for (let seed = 1; seed <= 200 && !checked; seed++) {
      const r = runScene({ seed, attrs: { elusiveness: 90 }, rbAt: [0, 0], rbVel: [7, 0], chasers: { 12: { at: [9, 2], speed: 8 } }, maxTicks: 30 });
      const miss = r.record.tackles.find((t) => t.outcome === 'missed');
      if (!miss) continue;
      checked = true;
      const again = r.record.tackles.filter((t) => t.tacklerSlot === miss.tacklerSlot && t.tick > miss.tick);
      for (const t of again) expect(t.tick - miss.tick).toBeGreaterThanOrEqual(8);
    }
    expect(checked).toBe(true);
  });
});

describe('J8.1.1 acceptance: vision finds the cutback', () => {
  it('with an unblocked defender in the designed hole, vision 70 cuts back at least twice as often as vision 30', () => {
    const cut = (v: number): number => share(400, (seed) => {
      const r = runScene({ seed, attrs: V(v), rbAt: [-4, 0], rbVel: [6, 0], track: [1, 3], chasers: { 12: { at: [2.5, 3], speed: 0, still: true } }, maxTicks: 2 });
      const l = r.carrier.lanes()[0];
      return l !== undefined && Math.sin(l.headingRad) < -0.05;
    });
    const hi = cut(70), lo = cut(30);
    expect(hi).toBeGreaterThanOrEqual(2 * lo);
  }, T);
});

describe('J8.2.1 acceptance: the read on inside zone', () => {
  const read = (keyPy: number) => share(300, (seed) => {
    const r = runScene({
      seed, how: 'exchange', attrs: V(60), rbAt: [-5, 0], rbVel: [3, 1], track: [1, 2],
      play: { designed: { slot: RB, aimPx: 1, aimPy: 2, readSlot: 12, kind: 'zone' } },
      chasers: { 12: { at: [0.5, keyPy], speed: 0, still: true, blocked: true } }, maxTicks: 10,
    });
    const x = r.record.reads[0];
    return x !== undefined && x.chosen === x.correct;
  });
  it('reached tackle: he stays on the playside gap; tackle crossing face: he cuts back; both 85% at vision 60', () => {
    expect(read(0.5)).toBeGreaterThanOrEqual(0.85);
    expect(read(4)).toBeGreaterThanOrEqual(0.85);
  }, T);
  it('presses the track before the read, then makes one choice', () => {
    const r = runScene({ seed: 2, how: 'exchange', rbAt: [-5, 0], rbVel: [3, 1], play: { designed: { slot: RB, aimPx: 1, aimPy: 2, readSlot: 12, kind: 'zone' } }, chasers: { 12: { at: [0.5, 4], speed: 0, still: true, blocked: true } }, maxTicks: 12 });
    expect(r.record.reads).toHaveLength(1);
    expect(r.record.reads[0]!.tick).toBeGreaterThanOrEqual(3);
    expect(r.carrier.lanes().every((l) => l.tick >= r.record.reads[0]!.tick)).toBe(true);
  });
  it('penetration before the read point ends the press at once', () => {
    const r = runScene({ seed: 2, how: 'exchange', rbAt: [-5, 0], rbVel: [3, 1], play: { designed: { slot: RB, aimPx: 1, aimPy: 2, readSlot: 12, kind: 'zone' } }, chasers: { 12: { at: [0.5, 4], speed: 0, still: true, blocked: true }, 13: { at: [-4, 1.5], speed: 0, still: true } }, maxTicks: 6 });
    expect(r.record.reads[0]?.penetration).toBe(true);
    expect(r.record.reads[0]!.tick).toBe(0);
  });
});

describe('J8.3.1 acceptance: moves', () => {
  it('missed tackles rise with elusiveness in the open field', () => {
    const miss = (e: number) => share(300, (seed) => {
      const t = runScene({ seed, attrs: { elusiveness: e }, rbAt: [0, 0], rbVel: [7, 0], chasers: { 12: { at: [9, 2], speed: 8 } }, maxTicks: 40 }).record.tackles[0];
      return t !== undefined && t.outcome !== 'made';
    });
    expect(miss(85)).toBeGreaterThan(miss(15) + 0.1);
  }, T);
  it('missed tackles rise with power in head-on contact', () => {
    const miss = (e: number) => share(300, (seed) => {
      const t = runScene({ seed, attrs: { power_finish: e }, rbAt: [0, 0], rbVel: [7, 0], chasers: { 12: { at: [7, 0], speed: 3, breakdown: true }, 13: { at: [6, 2.5], speed: 0, still: true }, 14: { at: [6, -2.5], speed: 0, still: true } }, maxTicks: 40 }).record.tackles[0];
      return t !== undefined && t.outcome !== 'made';
    });
    expect(miss(85)).toBeGreaterThan(miss(15) + 0.1);
  }, T);
  it('a move beats at most the tackler it was chosen against, and emits the contest', () => {
    let seen = false;
    for (let seed = 1; seed <= 60 && !seen; seed++) {
      const r = runScene({ seed, rbAt: [0, 0], rbVel: [7, 0], chasers: { 12: { at: [9, 1], speed: 8 } }, maxTicks: 30 });
      const t = r.record.tackles.find((x) => x.move === 'cut' || x.move === 'spin' || x.move === 'stiffArm');
      if (!t) continue;
      seen = true;
      expect(r.events.some((e) => e.type === 'contest' && e.contest.startsWith('move.'))).toBe(true);
      expect(r.record.moves.some((m) => m.tacklerSlot === t.tacklerSlot)).toBe(true);
    }
    expect(seen).toBe(true);
  });
  it('the ball-security instruction allows no spins or stiff arms', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = runScene({ seed, instruction: { ballSecurity: true }, rbAt: [0, 0], rbVel: [7, 0], chasers: { 12: { at: [9, 1], speed: 8 } }, maxTicks: 30 });
      for (const m of r.record.moves) expect(['spin', 'stiffArm']).not.toContain(m.move);
    }
  });
});

describe('J8.4.1 acceptance: ball security', () => {
  it('the instruction lowers fumbles per carry (fumble hazard raised for the test)', () => {
    const params = tableWith({ 'contest.fumble.beta0': -1.5 });
    const fum = (sec: boolean) => share(400, (seed) =>
      runScene({ seed, params, instruction: { ballSecurity: sec }, rbAt: [0, 0], rbVel: [7, 0], chasers: { 12: { at: [6, 1], speed: 8 } }, maxTicks: 40 }).record.tackles.some((t) => t.fumble));
    expect(fum(true)).toBeLessThan(fum(false));
  }, T);
  it('a fumble puts the ball loose with a fumble event and no whistle', () => {
    const params = tableWith({ 'contest.fumble.beta0': 3 });
    let seen = false;
    for (let seed = 1; seed <= 30 && !seen; seed++) {
      const r = runScene({ seed, params, rbAt: [0, 0], rbVel: [7, 0], chasers: { 12: { at: [6, 0.5], speed: 8 } }, maxTicks: 12 });
      const t = r.record.tackles.find((x) => x.fumble);
      if (!t) continue;
      seen = true;
      const f = r.events.find((e) => e.type === 'fumble');
      expect(f).toMatchObject({ kind: 'fumble', playerId: r.world.slots[RB]!.playerId, forcedById: r.world.slots[t.tacklerSlot]!.playerId });
      const deadAfter = r.events.filter((e) => e.type === 'dead_ball' && e.reason === 'down_by_contact' && e.t <= (f as { t: number }).t);
      expect(deadAfter).toHaveLength(0);
    }
    expect(seen).toBe(true);
  });
});

describe('J8.4.2 acceptance: clock and boundary', () => {
  const run = (rule: 'stayInBounds' | 'getOutOfBounds' | 'none', seed: number, practiced = true, iq = 50) =>
    runScene({ seed, ballY: 6, attrs: { football_intelligence: iq }, instruction: { rule, practicedThisWeek: practiced }, rbAt: [0, -4.2], rbVel: [7, -0.3], chasers: { 12: { at: [5, 1], speed: 8 } }, maxTicks: 60 });
  const inBounds = (practiced: boolean, iq: number): number => {
    let ended = 0, inb = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const r = reason(run('stayInBounds', seed, practiced, iq).dead);
      if (r === null) continue;
      ended++; if (r !== 'runner_out_of_bounds') inb++;
    }
    return inb / ended;
  };
  it('unpracticed, the in-bounds share is at least 10 points lower (MA-70; shown at football intelligence 30, see the handoff)', () => {
    expect(inBounds(true, 30) - inBounds(false, 30)).toBeGreaterThanOrEqual(0.10);
  }, T);
  it('self-preservation: with no situation rule a carrier near the sideline sometimes steps out to avoid the hit', () => {
    const out = share(100, (seed) => reason(run('none', seed).dead) === 'runner_out_of_bounds');
    expect(out).toBeGreaterThan(0.2); expect(out).toBeLessThan(0.95);
  }, T);
  it('stay in bounds, practiced: carriers near the sideline end the play in bounds at least 85% of the time', () => {
    let ended = 0, inb = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const r = reason(run('stayInBounds', seed).dead);
      if (r === null) continue;
      ended++; if (r !== 'runner_out_of_bounds') inb++;
    }
    expect(ended).toBeGreaterThan(30);
    expect(inb / ended).toBeGreaterThanOrEqual(0.85);
  }, T);
  it('get out of bounds: he takes the sideline', () => {
    expect(share(60, (seed) => reason(run('getOutOfBounds', seed).dead) === 'runner_out_of_bounds')).toBeGreaterThan(0.6);
  }, T);
  it('do not score: an aware carrier goes down short of the goal line', () => {
    let seen = false;
    for (let seed = 1; seed <= 40 && !seen; seed++) {
      const r = runScene({ seed, ballX: 95, attrs: { football_intelligence: 90 }, instruction: { rule: 'downShortOfGoal', practicedThisWeek: true }, rbAt: [-2, 0], rbVel: [6, 0], maxTicks: 30 });
      if (r.record.endings.some((e) => e.kind === 'downShort')) {
        seen = true;
        expect(reason(r.dead)).toBe('gave_himself_up');
        expect((r.dead as { spot: { x: number } }).spot.x).toBeLessThan(r.world.geometry.goalLineEastX);
      }
    }
    expect(seen).toBe(true);
  });
});

describe('J8.4.3 acceptance: slides', () => {
  it('with protection on, hits per run fall by at least half', () => {
    const hits = (protect: boolean) => share(150, (seed) =>
      runScene({ seed, instruction: { selfProtect: protect }, rbAt: [0, 0], rbVel: [6, 0], chasers: { 12: { at: [8, 1], speed: 8 } }, maxTicks: 40 }).record.tackles.some((t) => t.outcome !== 'missed'));
    const on = hits(true), off = hits(false);
    expect(on).toBeLessThanOrEqual(off / 2);
  }, T);
  it('a slide ends the play as giving himself up', () => {
    const r = runScene({ seed: 1, instruction: { selfProtect: true }, rbAt: [0, 0], rbVel: [6, 0], chasers: { 12: { at: [6, 0], speed: 8 } }, maxTicks: 40 });
    expect(r.record.endings[0]?.kind).toBe('slide');
    expect(reason(r.dead)).toBe('gave_himself_up');
  });
});

describe('who the module steers', () => {
  it('a quarterback with the ball is left to the quarterback module until it hands him over', () => {
    const r = runScene({ seed: 1, behavior: BEHAVIORS.indexOf('quarterback'), chasers: { 12: { at: [6, 0], speed: 8 } }, maxTicks: 20 });
    expect(r.carrier.lanes()).toHaveLength(0);
    expect(r.record.tackles).toHaveLength(0);
    expect(r.carrier.onRun(r.world, RB, 'scramble')).toBe(true);
  });
  it('laneQuality is between 0 and 1 and draws nothing', () => {
    const r = runScene({ seed: 1, chasers: { 12: { at: [6, 0], speed: 8 } }, maxTicks: 1 });
    const q = r.carrier.laneQuality(r.world, RB);
    expect(q).toBeGreaterThanOrEqual(0); expect(q).toBeLessThanOrEqual(1);
    const lanes = JSON.stringify(r.carrier.lanes());
    r.carrier.laneQuality(r.world, RB);
    expect(JSON.stringify(r.carrier.lanes())).toBe(lanes);
  });
});

describe('J8.6.1 after the catch', () => {
  it('an adjusted catch waits out the turn-up before he is steered; an in-stride one does not', () => {
    const stride = runScene({ seed: 1, how: 'catch', rbVel: [7, 0], maxTicks: 8 });
    const adjusted = runScene({ seed: 1, how: 'catch', rbVel: [-1, 0], maxTicks: 8 });
    expect(stride.carrier.lanes()[0]!.tick).toBe(0);
    expect(adjusted.carrier.lanes()[0]!.tick).toBeGreaterThanOrEqual(2);
  });
});

describe('J6.7.2 loose balls and J8.6.2 kicks', () => {
  it('a loose ball is recovered by a player who reaches it, with a possession event', () => {
    const r = runScene({
      seed: 1, chasers: { 12: { at: [3, 0.6], speed: 0, still: true } }, maxTicks: 30,
      setup: (w) => {
        w.ball.kind = 'loose'; w.ball.carrierSlot = -1; w.players.hasBall[RB] = 0;
        w.ball.x = w.frame.originX + 3; w.ball.y = w.frame.originY; w.ball.heightYd = 0; w.ball.velX = 0; w.ball.velY = 0;
      },
    });
    const pos = r.events.find((e) => e.type === 'possession' && e.how === 'fumble_recovery');
    expect(pos).toBeDefined();
  });
  it('a punt caught with coverage arriving is a fair catch; with room he returns it', () => {
    const kick = (coverAt: readonly [number, number]) => runScene({
      seed: 1, play: { returnPlan: { side: 'middle', fairCatchAllowed: true } }, chasers: { 12: { at: [-30, 0], speed: 0, still: true } }, maxTicks: 6,
      mates: { 3: { at: coverAt } },
      setup: (w) => {
        w.ball.kind = 'kickInFlight'; w.ball.kickKind = 'punt'; w.ball.carrierSlot = -1; w.players.hasBall[RB] = 0;
        // The returner is a defensive slot: move the ball to slot 12's spot.
        w.ball.x = w.players.posX[12]!; w.ball.y = w.players.posY[12]!; w.ball.heightYd = 1.0; w.ball.velHeight = -5; w.ball.velX = 0; w.ball.velY = 0;
      },
    });
    const close = kick([-29, 1.5]), far = kick([-5, 10]);
    expect(reason(close.dead)).toBe('fair_catch');
    expect(close.events.some((e) => e.type === 'kick_touch' && e.kind === 'fair_catch_signal')).toBe(true);
    expect(far.events.some((e) => e.type === 'possession' && e.how === 'kick_catch')).toBe(true);
    expect(reason(far.dead)).not.toBe('fair_catch');
  });
});

describe('J6.6.2 pile', () => {
  it('two defenders at the line with blocks engaged on both sides go to the pile model', () => {
    const r = runScene({
      seed: 1, rbAt: [-1.2, 0], rbVel: [3, 0], maxTicks: 10,
      chasers: { 12: { at: [-0.2, 0.5], speed: 2 }, 13: { at: [-0.2, -0.5], speed: 2 }, 14: { at: [0.5, 2], speed: 0, still: true }, 15: { at: [0.5, -2], speed: 0, still: true } },
      mates: { 3: { at: [-0.5, 2], engagedWith: 14 }, 4: { at: [-0.5, -2], engagedWith: 15 } },
    });
    const t = r.record.tackles[0];
    expect(t?.type).toBe('pile');
    expect(['forward_progress_stopped', 'ball_across_goal_line_in_possession']).toContain(reason(r.dead));
    expect(t!.progressYd).toBeGreaterThanOrEqual(-1); expect(t!.progressYd).toBeLessThanOrEqual(3);
  });
});
