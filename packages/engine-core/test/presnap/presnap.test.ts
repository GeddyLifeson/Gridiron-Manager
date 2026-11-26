import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DMATH } from '../../src/index.ts';
import { ParamFile, SLOTS_PER_TEAM, type Assignment } from '@gm/schema';
import { legality } from '@gm/football-lang';
import { streamSource, seedFromNumber } from '../../src/index.ts';
import {
  PARAMS, RULE_KEYS, DRAW_TYPES, DRAWS_PER_TEAM, drawTeam, presnapParams, planPresnap, playClockAt,
  substitutionErrorChance, huddleDeliveryChance, techniqueSpot, coverageSpot, readCorrectChance, protectionRecognitionChance,
  unblockedAfterSet, disguiseQualityOf, offenseStartS, defenderKeyDelayS, startingAdvantage, disciplineMult, venueMult,
  falseStartChance, defensiveOffsideChance, classifyDefensiveForm, snapMotionSdS, checkDurationS, holdEndS, badSnapChances,
} from '../../src/presnap/index.ts';
import { callDeliveryChance, perceptionParams } from '../../src/perception/index.ts';
import {
  FIXTURE_COLLEGE, FIXTURE_VALUES, JERSEYS, TABLE, asg, defense, defenseInput, input, offense, offenseInput, ofType, playX, playY,
  ruleSet, run, tableWith, world,
} from './support.ts';

const P = presnapParams(TABLE);
const PP = perceptionParams(TABLE);
const SEEDS = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const rate = (xs: boolean[]) => xs.filter(Boolean).length / xs.length;

describe('J5 parameters and rule keys', () => {
  it('exports a valid parameter file with a basis and a constraint on every row', () => {
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    for (const r of PARAMS.params) { expect(r.constrainedBy.length).toBeGreaterThan(0); expect(r.value).toBeGreaterThanOrEqual(r.min); expect(r.value).toBeLessThanOrEqual(r.max); }
  });
  it('reads only keys that exist in the WP-01 dictionary and both 2026 rule sets', () => {
    const dict = new Set((JSON.parse(readFileSync('packages/rules-data/data/keys.json', 'utf8')).keys as { key: string }[]).map((k) => k.key));
    for (const file of ['pro_2026', 'college_2026']) {
      const vals = new Set((JSON.parse(readFileSync(`packages/rules-data/data/${file}.json`, 'utf8')).values as { key: string }[]).map((v) => v.key));
      for (const k of RULE_KEYS) { expect(dict.has(k.key), k.key).toBe(true); expect(vals.has(k.key), `${file} ${k.key}`).toBe(true); }
    }
  });
});

describe('J5 draw order (J13.2.1)', () => {
  const streams = streamSource(seedFromNumber(11));
  it('takes the same fixed block for every play: one block per slot per draw type, in order', () => {
    const a = drawTeam(streams, 1, 1, 0), b = drawTeam(streams, 1, 1, 0);
    expect(DRAWS_PER_TEAM).toBe(DRAW_TYPES.reduce((t, d) => t + d.count * SLOTS_PER_TEAM, 0));
    expect(a.rawDraws).toBe(b.rawDraws);
    for (const d of DRAW_TYPES) for (let s = 0; s < SLOTS_PER_TEAM; s++) for (let i = 0; i < d.count; i++) expect(a.get(d.name, s, i)).toBe(b.get(d.name, s, i));
    expect(drawTeam(streams, 1, 2, 0).get('substitution', 0)).not.toBe(a.get('substitution', 0));
  });
  it('adding a motion or a check never shifts another player\'s draw', () => {
    const base = planPresnap(world({ seed: 5 }), input());
    const more = planPresnap(world({ seed: 5 }), input({
      offense: offenseInput({ motion: { teamSlot: 7, leadS: 1.2 } }),
      defense: defenseInput({ checks: [{ name: 'spin', trigger: 'motion' }] }),
    }));
    for (const d of DRAW_TYPES) for (let s = 0; s < SLOTS_PER_TEAM; s++) for (let i = 0; i < d.count; i++) {
      expect(more.draws[0].get(d.name, s, i)).toBe(base.draws[0].get(d.name, s, i));
      expect(more.draws[1].get(d.name, s, i)).toBe(base.draws[1].get(d.name, s, i));
    }
    for (let s = 0; s < 2 * SLOTS_PER_TEAM; s++) expect(more.received[s]![0]).toBe(base.received[s]![0]);
  });
});

describe('J5.8.1 the play clock runs through the whole phase', () => {
  it('ticks down one tenth per tick from the phase start to the snap at tick 0, never paused', () => {
    for (const tempo of ['huddle', 'no_huddle', 'hurry_up'] as const) {
      const r = run(input({ tempo }));
      expect(r.ticks[0]).toBe(r.plan.firstTick);
      expect(r.ticks[r.ticks.length - 1]).toBe(-1);
      for (let i = 1; i < r.clock.length; i++) expect(r.clock[i]).toBe(r.clock[i - 1]! - 1);
      expect(playClockAt(r.plan, 0)).toBe(r.plan.playClockAtSnapTenths);
      expect(r.plan.playClockAtSnapTenths).toBeGreaterThan(0);
      expect(r.w.tick).toBe(0);
      expect(ofType(r.w, 'snap')).toHaveLength(1);
    }
  });
  it('snaps earlier at hurry-up than in a huddle', () => {
    const h = planPresnap(world(), input({ tempo: 'huddle' })), u = planPresnap(world(), input({ tempo: 'hurry_up' }));
    expect(u.playClockAtSnapTenths).toBeGreaterThan(h.playClockAtSnapTenths);
  });
  it('acceptance 1: at hurry-up the defense completes all its checks on fewer snaps than at huddle tempo', () => {
    const share = (tempo: 'huddle' | 'hurry_up') => rate(SEEDS(200).map((seed) => {
      const empty = offense(); empty[10] = asg('RB', 'route', -1.5, -6, false);
      const plan = planPresnap(world({ seed }), input({ tempo, offense: offenseInput({ assignments: empty }), defense: defenseInput({ checks: [{ name: 'cover1_five', trigger: 'empty' }] }) }));
      return plan.checks.every((c) => !c.fired || c.completed);
    }));
    expect(share('hurry_up')).toBeLessThan(share('huddle'));
  });
  it('acceptance 2: no action ends after the snap, and dropped actions appear in the log and the truth record', () => {
    const inp = input({ tempo: 'hurry_up', hardCount: true, offense: offenseInput({ motion: { teamSlot: 7, leadS: 1.2 }, shift: [{ teamSlot: 8, to: { px: -1.5, py: 4 }, onLine: false }, { teamSlot: 10, to: { px: -5, py: -1.5 }, onLine: false }] }) });
    const r = run(inp);
    for (const e of r.plan.log) if (e.status === 'done') expect(e.endS).toBeLessThanOrEqual(r.plan.snapS + 1e-9);
    const dropped = r.plan.log.filter((e) => e.status === 'dropped');
    expect(dropped.length).toBeGreaterThan(0);
    const codes = ofType(r.w, 'detail').map((e) => e.code);
    for (const e of dropped) expect(codes).toContain(`presnap.dropped.${e.action}`);
  });
  it('calls delay of game when the offense cannot even align before the play clock runs out', () => {
    const r = run(input({ playClockStartTenths: 30 }));
    const f = ofType(r.w, 'foul_committed');
    expect(f.map((x) => x.foulId)).toEqual(['delay_of_game']);
    expect(f[0]!.timing).toBe('before_snap');
    expect(r.plan.playClockAtSnapTenths).toBe(0);
    expect(ofType(r.w, 'snap')).toHaveLength(0);
    expect(ofType(r.w, 'dead_ball')[0]!.reason).toBe('pre_snap_foul');
  });
});

describe('J5.1 substitution and the huddle', () => {
  it('J5.1.1 acceptance 2: a hurry-up personnel change errs at least three times as often as a huddle change', () => {
    expect(substitutionErrorChance('hurry_up', 0, 50, P) / substitutionErrorChance('huddle', 0, 50, P)).toBeGreaterThanOrEqual(3);
    expect(substitutionErrorChance('huddle', 0, 50, P)).toBeCloseTo(0.002, 12);
    expect(substitutionErrorChance('huddle', 2, 50, P)).toBeGreaterThan(substitutionErrorChance('huddle', 0, 50, P));
    expect(substitutionErrorChance('huddle', 0, 90, P)).toBeLessThan(substitutionErrorChance('huddle', 0, 50, P));
  });
  it('J5.1.1: a substitute who never arrives leaves a hole, and an extra man draws the too-many flag', () => {
    const subs = [5, 6, 7, 8, 10];
    let missing = 0, extra = 0;
    const big = tableWith({ 'presnap.sub.errorBasePerPlayer': 0.2 });
    for (const seed of SEEDS(40)) {
      const plan = planPresnap(world({ seed, params: big }), input({ tempo: 'hurry_up', offense: offenseInput({ substituted: subs }) }));
      missing += plan.missing.length;
      if (plan.fouls.some((f) => f.foulId === 'too_many_in_formation')) extra++;
    }
    expect(missing).toBeGreaterThan(0);
    expect(extra).toBeGreaterThan(0);
  });
  it('J5.1.2 acceptance: with offensive substitution the snap never comes before the hold window ends; no hold inside two minutes', () => {
    const inp = input({ tempo: 'hurry_up', offense: offenseInput({ substituted: [8, 10] }), defense: defenseInput({ substituted: [4, 5, 8] }) });
    for (const seed of SEEDS(20)) {
      const plan = planPresnap(world({ seed }), inp);
      const pm = plan.log.find((e) => e.action === 'personnel_match')!;
      expect(plan.snapS).toBeGreaterThanOrEqual(pm.endS - 0.05);
    }
    expect(holdEndS(true, true, false, 0, 20, P)).toBe(P['hold.capS']);
    expect(holdEndS(true, true, true, 0, 5, P)).toBe(0);
    expect(holdEndS(false, true, false, 0, 5, P)).toBe(0);
    expect(holdEndS(true, false, false, 0, 5, P)).toBe(0);
  });
  it('J5.1.3: huddle delivery is near 1 and drops for the last-named players of a long call', () => {
    expect(huddleDeliveryChance(6, 1, 50, P)).toBeCloseTo(0.9995, 12);
    expect(huddleDeliveryChance(14, 1, 50, P)).toBeLessThan(huddleDeliveryChance(14, 0, 50, P));
    expect(huddleDeliveryChance(6, 1, 20, P)).toBeLessThan(huddleDeliveryChance(6, 1, 80, P));
  });
  it('J5.1.3 acceptance: under 0.5 huddle misses a game at home, and failures rise on the road in a loud stadium at no-huddle', () => {
    // Expected misses for an eleven-man home huddle over a game of 62.1 plays (J15.3.2): under 0.5.
    expect(11 * (1 - huddleDeliveryChance(6, 0.5, 50, P)) * 62.1).toBeLessThan(0.5);
    const misses = (over: Parameters<typeof input>[0]) => SEEDS(200).reduce((t, seed) => t + planPresnap(world({ seed }), input(over)).received.slice(0, SLOTS_PER_TEAM).filter((r) => !r[0]).length, 0);
    const home = misses({ tempo: 'huddle' });
    const road = misses({ tempo: 'no_huddle', playClockStartTenths: 140, offense: offenseInput({ noise: 0.9 }) });
    expect(road).toBeGreaterThan(home);
    expect(callDeliveryChance(0.9, 10, 0, 0, 0, PP)).toBeLessThan(callDeliveryChance(0, 10, 0, 0, 0, PP));
  });
});

describe('J5.2 alignment', () => {
  it('J5.2.1 acceptance: the fixture formation aligns legally from both hashes and the middle, both rule sets, every yard line 1 to 99', () => {
    for (const values of [FIXTURE_VALUES, FIXTURE_COLLEGE]) {
      const rules = ruleSet(values);
      const jerseys = values === FIXTURE_COLLEGE ? [70, 71, 72, 73, 74, 85, 11, 14, 83, 9, 26] : JERSEYS;
      for (let yl = 1; yl <= 99; yl += 1) for (const where of ['left', 'middle', 'right'] as const) {
        const w0 = world({ rules, ballX: 10 + yl });
        const ballY = where === 'middle' ? w0.geometry.centreY : where === 'left' ? w0.geometry.hashNorthY : w0.geometry.hashSouthY;
        const w = world({ rules, ballX: 10 + yl, ballY });
        const plan = planPresnap(w, input({ errorsDisabled: true }));
        const players = offense().map((a, s) => {
          const t = plan.targets[s]![plan.targets[s]!.length - 1]!;
          return { role: a.role, px: t.px, py: t.py, onLine: a.preSnap.onLine, jersey: jerseys[s]!, inMotion: false };
        });
        const minPy = Math.min(-w.frame.originY * w.frame.attackDir, (w.geometry.widthYd - w.frame.originY) * w.frame.attackDir);
        const maxPy = Math.max(-w.frame.originY * w.frame.attackDir, (w.geometry.widthYd - w.frame.originY) * w.frame.attackDir);
        const f = legality.checkAlignment(players, rules, TABLE, { minPy, maxPy });
        expect(f, `${values === FIXTURE_COLLEGE ? 'college' : 'pro'} ${yl} ${where}`).toEqual([]);
      }
    }
  });
  it('J5.2.1: a receiver split outside the field is pulled in from the sideline', () => {
    const w = world({ ballY: world().geometry.hashNorthY });
    const wide = offense(); wide[6] = asg('X', 'route', -0.4, 30, true);
    const plan = planPresnap(w, input({ offense: offenseInput({ assignments: wide }), errorsDisabled: true }));
    const t = plan.targets[6]!.at(-1)!;
    const sideline = Math.max(-w.frame.originY * w.frame.attackDir, (w.geometry.widthYd - w.frame.originY) * w.frame.attackDir);
    expect(t.py).toBeCloseTo(sideline - P['align.sidelineMarginYd']!, 9);
  });
  it('J5.2.2: techniques are head-up, 0.35 yd shades or half-split gaps; coverage depth and leverage stay in their bands', () => {
    expect(techniqueSpot('0', 0.7, P)).toEqual([0, 0]);
    expect(techniqueSpot('3', 0.7, P)).toEqual([1, 0.35]);
    expect(techniqueSpot('4i', 0.7, P)).toEqual([2, -0.35]);
    expect(techniqueSpot('9', 0.7, P)[1]).toBeCloseTo(0.35 + 0.35, 12);
    expect(coverageSpot(10, true, 'outside', 1, 0, 0, P)).toEqual({ px: 1, py: 10.5 });
    const off = coverageSpot(10, false, 'inside', 1, 1, 1, P);
    expect(off.px).toBe(8); expect(off.py).toBe(9);
  });
  it('J5.2.2: the defense finishes aligning after the offense, by its communication time', () => {
    const plan = planPresnap(world(), input());
    const defStart = plan.targets[SLOTS_PER_TEAM]![0]!.fromTick, offStart = plan.targets[0]![0]!.fromTick;
    expect(defStart - offStart).toBe(Math.round(P['align.defCommS']! * 10));
  });
});

describe('J5.1 squaring up at the spot', () => {
  it('has every man who is set at his spot facing the line of scrimmage at the snap, defenders included', () => {
    const r = run();
    let checked = 0;
    for (let s = 0; s < 2 * SLOTS_PER_TEAM; s++) {
      if (Math.hypot(r.w.players.velX[s]!, r.w.players.velY[s]!) > 0.05) continue; // a man in motion faces where he runs
      // Heading in the play frame: 0 is toward the defense's goal line, pi is back toward the offense's.
      const h = r.w.frame.attackDir === 1 ? r.w.players.headingRad[s]! : r.w.players.headingRad[s]! + Math.PI;
      const cos = Math.cos(h);
      if (s < SLOTS_PER_TEAM) expect(cos, `offense slot ${s}`).toBeGreaterThan(0.9); else expect(cos, `defense slot ${s}`).toBeLessThan(-0.9);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  });
});

describe('J5.3 shifts and motion', () => {
  const motionInput = (over: Partial<Parameters<typeof defenseInput>[0]> = {}) => input({ offense: offenseInput({ motion: { teamSlot: 7, leadS: 1.2 } }), defense: defenseInput(over) });
  it('J5.3.1 acceptance: the motion runs legally with full time and the motion man has a running start at the snap', () => {
    for (const seed of SEEDS(5)) {
      const r = run(motionInput(), { seed });
      expect(ofType(r.w, 'foul_committed').filter((f) => f.foulId.startsWith('illegal'))).toEqual([]);
      const vy = r.w.players.velY[7]! * r.w.frame.attackDir, vx = r.w.players.velX[7]! * r.w.frame.attackDir;
      expect(Math.hypot(vx, vy)).toBeGreaterThan(1);
      expect(vx).toBeLessThanOrEqual(0.3);
    }
  });
  it('J5.3.1: the snap-to-motion timing SD is 0.15 s at grade 50 and smaller with better cadence and snapping', () => {
    expect(snapMotionSdS(50, 50, P)).toBeCloseTo(0.15, 12);
    expect(snapMotionSdS(80, 80, P)).toBeLessThan(0.15);
  });
  it('J5.3.1: a forced snap before the offense is set is an illegal shift, or a dead-ball false start with the clock running inside two minutes', () => {
    const far = (w: ReturnType<typeof world>) => { for (let s = 0; s < SLOTS_PER_TEAM; s++) w.players.posX[s] = w.frame.originX - 22 * w.frame.attackDir; return w; };
    // A clock that lets every man reach his spot (J5.8.1 `alignTravelS`) half a second before it runs out: aligned, not set.
    const short = Math.round((planPresnap(far(world()), input({ tempo: 'no_huddle' })).offenseSetS - 0.5) * 10);
    const w = far(world());
    const plan = planPresnap(w, input({ tempo: 'no_huddle', playClockStartTenths: short }));
    expect(plan.fouls.map((f) => f.foulId)).toContain('illegal_shift');
    const w2 = far(world());
    (w2.situation as { insideTwoMinute: boolean }).insideTwoMinute = true;
    const plan2 = planPresnap(w2, input({ tempo: 'no_huddle', playClockStartTenths: short }));
    expect(plan2.fouls.find((f) => f.slot === null && f.foulId === 'false_start')?.deadBall).toBe(true);
  });
  it('J5.3.2 acceptance: against a man call with no bluff the matched defender follows the motion on 100% of trials', () => {
    for (const seed of SEEDS(30)) {
      const plan = planPresnap(world({ seed }), motionInput({ coverage: 'man' }));
      expect(plan.follower).toBe(SLOTS_PER_TEAM + 7);
    }
    const r = run(motionInput({ coverage: 'man' }));
    const zone = run(motionInput({ coverage: 'zone' }));
    expect(playY(r.w, SLOTS_PER_TEAM + 7) - playY(zone.w, SLOTS_PER_TEAM + 7)).toBeGreaterThan(1.5);
  });
  it('J5.3.2 acceptance: against zone, a bluff makes the quarterback\'s man or zone read worse', () => {
    const acc = (bluff: boolean) => rate(SEEDS(800).map((seed) => planPresnap(world({ seed }), motionInput({ coverage: 'zone', bluff })).qb.manCorrect));
    expect(acc(true)).toBeLessThan(acc(false));
  });
});

describe('J5.4 the offense\'s pre-snap process', () => {
  it('J5.4.1: about 82% correct at grade 50 with no disguise; rises with the coverage reading grade, falls with disguise', () => {
    expect(readCorrectChance(50, 0, 0, DMATH, P)).toBeCloseTo(0.8176, 3);
    expect(readCorrectChance(70, 0, 0, DMATH, P)).toBeGreaterThan(readCorrectChance(50, 0, 0, DMATH, P));
    expect(readCorrectChance(50, 0.6, 0, DMATH, P)).toBeLessThan(readCorrectChance(50, 0, 0, DMATH, P));
  });
  it('J5.4.1 acceptance: over 10,000 snaps shell-read accuracy rises with grade and falls with disguise', () => {
    const plays = (cr: number, disguise: boolean) => {
      const out: boolean[] = [];
      for (const seed of SEEDS(2500)) {
        const w = world({ seed, players: (s) => (s === 9 ? { attributes: { coverage_reading_pre_snap: cr } } : {}) });
        const d = disguise ? [{ teamSlot: 10, shown: { px: 12, py: -6 } }] : [];
        const asgs = defense(); if (disguise) asgs[10] = asg('SS', 'runFit', 6, -4, false);
        out.push(planPresnap(w, input({ defense: defenseInput({ assignments: asgs, disguise: d }) })).qb.shellCorrect);
      }
      return rate(out);
    };
    const lo = plays(35, false), hi = plays(75, false), dis = plays(75, true);
    expect(hi).toBeGreaterThan(lo);
    expect(dis).toBeLessThan(hi);
  });
  it('J5.4.1: with under 2 s at the line the read is skipped', () => {
    const plan = planPresnap(world(), input({ tempo: 'hurry_up', playClockStartTenths: 90 }));
    expect(plan.snapS - (plan.offenseSetS - 1)).toBeLessThan(P['read.minTimeS']!);
    expect(plan.qb.made).toBe(false);
  });
  it('J5.4.2 acceptance 1: a correctly set six-man protection leaves no five-man rusher free, in 100% of trials with errors disabled', () => {
    for (const seed of SEEDS(50)) {
      const plan = planPresnap(world({ seed }), input({ errorsDisabled: true, defense: defenseInput({ assignments: defense(5) }) }));
      expect(plan.protection.recognized).toBe(true);
      expect(plan.protection.unblockedLeft + plan.protection.unblockedRight).toBe(0);
    }
    expect(unblockedAfterSet(3, 2, 2, 3, true, true)).toEqual([0, 0]);
    expect(unblockedAfterSet(3, 2, 2, 3, false, false)).toEqual([1, 0]);
  });
  it('J5.4.2 acceptance 2: the unblocked-rusher chance rises with disguise and noise and falls with the protection grade', () => {
    const base = protectionRecognitionChance(50, 0, 0, 0, DMATH, P);
    expect(protectionRecognitionChance(50, 0.6, 0, 0, DMATH, P)).toBeLessThan(base);
    expect(protectionRecognitionChance(50, 0, 0, 0.9, DMATH, P)).toBeLessThan(base);
    expect(protectionRecognitionChance(50, 0, 1, 0, DMATH, P)).toBeLessThan(base);
    expect(protectionRecognitionChance(75, 0, 0, 0, DMATH, P)).toBeGreaterThan(base);
    const free = (noise: number) => SEEDS(400).reduce((t, seed) => {
      const pr = planPresnap(world({ seed }), input({ offense: offenseInput({ noise }), defense: defenseInput({ assignments: defense(6), simulatedPressure: true }) })).protection;
      return t + pr.unblockedLeft + pr.unblockedRight;
    }, 0);
    expect(free(0.9)).toBeGreaterThanOrEqual(free(0));
  });
  it('J5.4.3: a box-loaded audible fires on the believed box with time, costs its time, and is not made without time', () => {
    const aud = [{ name: 'check_pass', trigger: 'box_loaded' as const, kind: 'audible' as const, boxAtLeast: 6 }];
    const plan = planPresnap(world(), input({ errorsDisabled: true, offense: offenseInput({ audibles: aud }) }));
    expect(plan.audible).toBe('check_pass');
    const entry = plan.log.find((e) => e.action === 'audible')!;
    expect(entry.endS - entry.startS).toBeCloseTo(P['audible.fullS']!, 9);
    const rushed = planPresnap(world(), input({ tempo: 'hurry_up', playClockStartTenths: 160, errorsDisabled: true, offense: offenseInput({ audibles: aud }) }));
    expect(rushed.audible).toBeNull();
  });
});

describe('J5.5 the defense\'s pre-snap process', () => {
  it('J5.5.1: disguise quality is 0.5 at grade 50 held to the snap, falls with an early stem, rises with grade', () => {
    expect(disguiseQualityOf(50, 0, P)).toBe(0.5);
    expect(disguiseQualityOf(50, 2, P)).toBe(0);
    expect(disguiseQualityOf(70, 0, P)).toBeCloseTo(0.7, 12);
  });
  it('J5.5.1 acceptance: holding two-high to the snap leaves the deep-middle safety farther from his landmark than an honest look', () => {
    const asgs = defense(); asgs[9] = asg('FS', 'deepZone', 12, 0, false); asgs[10] = asg('SS', 'runFit', 6, -5, false);
    const honest = run(input({ defense: defenseInput({ assignments: asgs }) }));
    const disguised = run(input({ defense: defenseInput({ assignments: asgs, disguise: [{ teamSlot: 9, shown: { px: 12, py: 6 } }, { teamSlot: 10, shown: { px: 12, py: -6 } }] }) }));
    const off = (r: typeof honest) => Math.hypot(playX(r.w, 20) - 12, playY(r.w, 20));
    expect(off(disguised)).toBeGreaterThan(off(honest) + 0.5);
    expect(disguised.plan.disguiseQuality).toBeGreaterThan(0);
  });
  it('J5.5.2 acceptance: an installed empty check fires on every empty look given time; without it the call stands', () => {
    const empty = offense(); empty[10] = asg('RB', 'route', -1.5, -6, false);
    for (const seed of SEEDS(40)) {
      const plan = planPresnap(world({ seed }), input({ errorsDisabled: true, offense: offenseInput({ assignments: empty }), defense: defenseInput({ checks: [{ name: 'cover1_five', trigger: 'empty' }] }) }));
      expect(plan.checks[0]!.fired && plan.checks[0]!.completed).toBe(true);
      const none = planPresnap(world({ seed }), input({ errorsDisabled: true, offense: offenseInput({ assignments: empty }) }));
      expect(none.checks).toEqual([]);
    }
    const notEmpty = planPresnap(world(), input({ errorsDisabled: true, defense: defenseInput({ checks: [{ name: 'cover1_five', trigger: 'empty' }] }) }));
    expect(notEmpty.checks[0]!.fired).toBe(false);
  });
  it('G2.5.1: a completed check with a patch walks the named defender to his new spot; a check that misses him leaves him', () => {
    const empty = offense(); empty[10] = asg('RB', 'route', -1.5, -6, false);
    const walked = asg('SS', 'zoneDrop', 5, 9, false);
    const check = { name: 'walk_out', trigger: 'empty' as const, patch: [{ teamSlot: 9, assignment: walked }] };
    const r = run(input({ errorsDisabled: true, offense: offenseInput({ assignments: empty }), defense: defenseInput({ checks: [check] }) }));
    expect(r.plan.checks[0]!.completed).toBe(true);
    expect(r.plan.checks[0]!.patched).toEqual([9]);
    const s = SLOTS_PER_TEAM + 9, last = r.plan.targets[s]![r.plan.targets[s]!.length - 1]!;
    expect([last.px, last.py]).toEqual([5, 9]);
    expect(Math.hypot(playX(r.w, s) - 5, playY(r.w, s) - 9)).toBeLessThan(1.5);
    expect(ofType(r.w, 'detail').some((e) => e.code === 'presnap.check_patched')).toBe(true);
    // Without the look the check never fires and nobody moves.
    const plain = planPresnap(world(), input({ errorsDisabled: true, defense: defenseInput({ checks: [check] }) }));
    expect(plain.checks[0]!.patched).toEqual([]);
    // A defender the check did not reach is not patched (J3.6.1 delivery).
    let missed = 0;
    for (const seed of SEEDS(60)) {
      const plan = planPresnap(world({ seed }), input({ offense: offenseInput({ assignments: empty }), defense: defenseInput({ noise: 1, checks: [check] }) }));
      const c = plan.checks[0]!;
      if (c.completed && !plan.received[s]![1]) { missed++; expect(c.patched).toEqual([]); }
      if (c.completed && plan.received[s]![1]) expect(c.patched).toEqual([9]);
    }
    expect(missed).toBeGreaterThan(0);
  });
  it('a formation check (a look the content found) shows when the offense is aligned', () => {
    const plan = planPresnap(world(), input({ errorsDisabled: true, defense: defenseInput({ checks: [{ name: 'trips_check', trigger: 'formation' }] }) }));
    expect(plan.checks[0]!.fired).toBe(true);
  });
  it('J5.3.2: a check takes 0.5 to 1.5 s, shorter for a better signal caller', () => {
    expect(checkDurationS(50, P)).toBe(1);
    expect(checkDurationS(100, P)).toBe(0.5);
    expect(checkDurationS(0, P)).toBe(1.5);
  });
});

describe('J5.6 cadence and the snap', () => {
  it('J5.6.1: a voiced count he heard starts him at 0; a silent count costs 0.05 to 0.15 s', () => {
    expect(offenseStartS(false, true, 50, P)).toBe(0);
    const s = offenseStartS(true, true, 50, P);
    expect(s).toBeGreaterThanOrEqual(0.05); expect(s).toBeLessThanOrEqual(0.15);
  });
  it('J5.6.1: defender key delay 0.20 s at grade 50, anticipation up to 0.08 s after six snaps, floored at 0.08 s', () => {
    expect(defenderKeyDelayS(50, 0, P)).toBeCloseTo(0.2, 12);
    expect(defenderKeyDelayS(50, 6, P)).toBeCloseTo(0.12, 12);
    expect(defenderKeyDelayS(100, 10, P)).toBe(0.08);
  });
  it('J5.6.1 acceptance (start advantage): the rusher\'s start edge is larger against a silent count than a voiced, varied count', () => {
    const rusher = defenderKeyDelayS(50, 0, P);
    const silent = startingAdvantage(offenseStartS(true, true, 50, P), rusher, P);
    const voiced = startingAdvantage(offenseStartS(false, true, 50, P), rusher, P);
    expect(voiced).toBe(0);
    expect(silent).toBeLessThanOrEqual(voiced);
    expect(startingAdvantage(0.3, 0.1, P)).toBe(-0.3);
  });
  it('J5.6.2: the snap is a recorded contest; the ball is held by the quarterback after a good snap', () => {
    const r = run();
    const snap = ofType(r.w, 'snap')[0]!;
    expect(snap.snapperId).toBe(r.w.slots[2]!.playerId);
    expect(snap.toPlayerId).toBe(r.w.slots[9]!.playerId);
    if (snap.quality !== 'loose') { expect(r.w.ball.kind).toBe('held'); expect(r.w.ball.carrierSlot).toBe(9); }
  });
  it('J5.6.2 acceptance: bad snaps rise in rain, fall with a better pairing; an average dry shotgun pair matches the starting rates', () => {
    const [l0, o0] = badSnapChances(0, false, false, true, P, DMATH);
    expect(l0).toBeCloseTo(0.0025, 9); expect(o0).toBeCloseTo(0.015, 9);
    const [l1, o1] = badSnapChances(0, true, false, true, P, DMATH);
    expect(l1).toBeGreaterThan(l0); expect(o1).toBeGreaterThan(o0);
    expect(badSnapChances(1.5, false, false, true, P, DMATH)[1]).toBeLessThan(o0);
    expect(badSnapChances(0, false, false, false, P, DMATH)[1]).toBeLessThan(o0);
  });
});

describe('J5.6.2 snap exchange fitted to real aborted snaps (nflverse 2018-2025, 1 of 3)', () => {
  const logit = (q: number) => Math.log(q / (1 - q));
  it('an average pair aborts 0.25% of shotgun snaps and 0.40% under center', () => {
    expect(badSnapChances(0, false, false, true, P, DMATH)[0]).toBeCloseTo(0.0025, 6);
    expect(badSnapChances(0, false, false, false, P, DMATH)[0]).toBeCloseTo(0.004, 6);
  });
  it('one sd of the centre and quarterback pair (dz 0.707) moves the aborted rate about 0.5 logit (real 0.61 shotgun, 0.39 under center)', () => {
    const pairSd = Math.SQRT1_2;
    const shift = logit(badSnapChances(-pairSd, false, false, true, P, DMATH)[0]) - logit(badSnapChances(0, false, false, true, P, DMATH)[0]);
    expect(shift).toBeGreaterThan(0.39); expect(shift).toBeLessThan(0.61);
  });
});

describe('J5.7 pre-snap fouls', () => {
  it('D4.2.2 discipline enters once: 1 at grade 50, 2 at 0, floored at 0.25', () => {
    expect(disciplineMult(50, P)).toBe(1); expect(disciplineMult(0, P)).toBe(2); expect(disciplineMult(100, P)).toBe(0.25);
  });
  it('venue term: 1.142 road to home on defense; none on offense, where the delay-of-game split from the relay carries the measured gap; neutral is 1', () => {
    // J5.7.1: the term closes the gap the mechanisms leave. Offense: 2.194 road against 2.087 home is 0.107 per 100 snaps,
    // and delay of game alone is 0.13 (J12.6.1: 0.47 against 0.34), which the play clock now produces (relay.test.ts).
    expect(venueMult('road', true, P) / venueMult('home', true, P)).toBe(1);
    expect(venueMult('road', false, P) / venueMult('home', false, P)).toBeCloseTo(1.142, 2);
    expect(venueMult('neutral', true, P)).toBe(1);
  });
  it('false start hazard rises with noise, hard count and fatigue; offside hazard with the hard count and anticipation', () => {
    const t0 = { noise: 0, hardCountOwn: false, defensiveMovement: false, rushedSnap: false, longCount: false, fatigue: 0 };
    const b = P['foul.baseFalseStartLine']!;
    expect(falseStartChance(b, 50, 'neutral', t0, DMATH, P)).toBeCloseTo(b, 12);
    // J12.6.1: "little or no noise weight" on the direct false-start term (road false starts show no excess).
    expect(P['foul.gNoise']!).toBeLessThanOrEqual(0.1);
    expect(falseStartChance(b, 50, 'neutral', { ...t0, noise: 1 }, DMATH, P)).toBeCloseTo(b * Math.exp(P['foul.gNoise']!), 9);
    expect(falseStartChance(b, 50, 'neutral', { ...t0, fatigue: 1 }, DMATH, P)).toBeGreaterThan(b);
    expect(falseStartChance(b, 50, 'neutral', { ...t0, hardCountOwn: true }, DMATH, P)).toBeGreaterThan(b);
    const o0 = { hardCountOpp: false, anticipated: false, aggression: false, fatigue: 0 };
    const d = P['foul.baseDefOffside']!;
    expect(defensiveOffsideChance(d, 50, 'neutral', { ...o0, hardCountOpp: true }, DMATH, P)).toBeCloseTo(d * Math.exp(0.5), 9);
  });
  it('B4.4.2 decision order: contact is encroachment, a distant flinch is a false start, and inside two minutes there is no free play', () => {
    expect(classifyDefensiveForm(0, null, false, P)).toBe('encroachment');
    expect(classifyDefensiveForm(0.3, 1, false, P)).toBe('neutral_zone_infraction');
    expect(classifyDefensiveForm(0.3, 5, false, P)).toBe('false_start');
    expect(classifyDefensiveForm(0.99, null, false, P)).toBe('offside');
    expect(classifyDefensiveForm(0.99, null, true, P)).toBe('neutral_zone_infraction');
  });
  it('starting base rates put the fixture formation near the J15 false start rate (2.30 per game, both teams)', () => {
    const t0 = { noise: 0, hardCountOwn: false, defensiveMovement: false, rushedSnap: false, longCount: false, fatigue: 0 };
    const perSnap = 5 * falseStartChance(P['foul.baseFalseStartLine']!, 50, 'neutral', t0, DMATH, P)
      + 5 * falseStartChance(P['foul.baseFalseStartOther']!, 50, 'neutral', t0, DMATH, P);
    const perGameBoth = 2 * 62.1 * perSnap;
    expect(perGameBoth).toBeGreaterThan(2.3 * 0.75); expect(perGameBoth).toBeLessThan(2.3 * 1.25);
  });
  it('a road defense commits more pre-snap fouls than a home defense over many snaps, and false starts do not differ by venue', () => {
    const big = tableWith({ 'presnap.foul.baseFalseStartLine': 0.03, 'presnap.foul.baseFalseStartOther': 0.01, 'presnap.foul.baseDefOffside': 0.03 });
    const DEF = new Set(['offside', 'defensive_offside', 'neutral_zone_infraction', 'encroachment']);
    // `venue` is the offense's: a home offense faces a road defense.
    const count = (venue: 'home' | 'road', test: (id: string) => boolean) => SEEDS(1500).reduce((t, seed) => t + planPresnap(world({ seed, params: big }), input({ venue })).fouls.filter((f) => test(f.foulId)).length, 0);
    expect(count('home', (id) => DEF.has(id))).toBeGreaterThan(count('road', (id) => DEF.has(id)));
    // The same draws against the same chance: a false start by the line is the same snap at home and on the road.
    const lineFalseStarts = (venue: 'home' | 'road') => SEEDS(300).map((seed) => planPresnap(world({ seed, params: tableWith({ 'presnap.foul.baseFalseStartLine': 0.03, 'presnap.foul.baseDefOffside': 0 }) }), input({ venue })).fouls.filter((f) => f.foulId === 'false_start').length);
    expect(lineFalseStarts('road')).toEqual(lineFalseStarts('home'));
  });
  it('a dead-ball pre-snap foul ends the play before the snap: flag, dead ball, no snap', () => {
    const r = run(input(), { params: tableWith({ 'presnap.foul.baseFalseStartLine': 1 }) });
    const f = ofType(r.w, 'foul_committed');
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.foulId === 'false_start' && x.timing === 'before_snap')).toBe(true);
    expect(r.w.deadAtTick).toBe(-1);
    expect(ofType(r.w, 'snap')).toHaveLength(0);
    expect(ofType(r.w, 'dead_ball')[0]!.reason).toBe('pre_snap_foul');
  });
  it('an illegal formation as drawn is aligned exactly as drawn and draws its flag at the snap, never corrected', () => {
    const bad = offense(); bad[5] = asg('Y', 'route', -1.5, -4.2, false); bad[6] = asg('X', 'route', -1.5, 12, false);
    const r = run(input({ offense: offenseInput({ assignments: bad }) }));
    expect(playX(r.w, 6)).toBeCloseTo(-1.5, 0);
    const f = ofType(r.w, 'foul_committed');
    expect(f.map((x) => x.foulId)).toContain('illegal_formation');
    expect(f.find((x) => x.foulId === 'illegal_formation')!.timing).toBe('live');
    expect(ofType(r.w, 'snap')).toHaveLength(1);
  });
});

describe('determinism (J13)', () => {
  it('the same seed gives the same events and positions; another seed may differ', () => {
    const inp = input({ tempo: 'no_huddle', playClockStartTenths: 250, offense: offenseInput({ motion: { teamSlot: 7, leadS: 1 } }) });
    const a = run(inp, { seed: 9 }), b = run(inp, { seed: 9 });
    expect(JSON.stringify(a.w.events)).toBe(JSON.stringify(b.w.events));
    expect(Array.from(a.w.players.posX)).toEqual(Array.from(b.w.players.posX));
  });
});

// Unused import guard for the type-only helpers.
export type _A = Assignment;
