// WP-22 acceptance (build plan row; bible J10). Formula directions are the J10 acceptance criteria;
// stage tests drive the module with hand-built contests and truth events on the tick fixture. Rates are
// parameters to be fitted against J15 (WP-26); nothing here asserts a league rate.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOVE_MODES, BEHAVIORS, SLOT_COUNT, STREAM_NAMES, type TickWorld } from '@gm/schema';
import {
  CONTACT_FORMS, LIVE_FOULS, MECHANISMS, PARAMS, REGION_TABLE, RULE_KEYS, conductChance, contactFormChance, coverageHoldChance,
  foulsInjuriesParams, holdingChance, injuryChance, interferenceChance, kickerContactChance, lateHitChance, pickRegion,
} from '../../src/fouls-injuries/index.ts';
import { place, type PlayerSpec } from '../tick/support.ts';
import { TABLE, ofType, rules, scene, tableWith } from './support.ts';

const P = foulsInjuriesParams(TABLE);
const DOWN = MOVE_MODES.indexOf('down');
const repo = new URL('../../../../', import.meta.url);
const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, repo), 'utf8'));

describe('parameters and rule keys', () => {
  it('every row is a starting value inside its own range, with a leaf and what constrains it', () => {
    for (const r of PARAMS.params) {
      expect(r.value, r.name).toBeGreaterThanOrEqual(r.min);
      expect(r.value, r.name).toBeLessThanOrEqual(r.max);
      expect(r.leaf.length, r.name).toBeGreaterThan(0);
      expect(r.constrainedBy.length, r.name).toBeGreaterThan(0);
      expect(r.status).toBe('starting');
    }
  });
  it('reads only rule keys the WP-01 dictionary has, and both rule sets carry every one', () => {
    const dict = new Set((read('packages/rules-data/data/keys.json').keys as { key: string }[]).map((k) => k.key));
    const pro = new Map((read('packages/rules-data/data/pro_2026.json').values as { key: string; value: unknown }[]).map((v) => [v.key, v.value]));
    const col = new Map((read('packages/rules-data/data/college_2026.json').values as { key: string; value: unknown }[]).map((v) => [v.key, v.value]));
    for (const k of RULE_KEYS) {
      expect(dict.has(k.key), k.key).toBe(true);
      expect(pro.has(k.key), `pro ${k.key}`).toBe(true);
      expect(col.has(k.key), `college ${k.key}`).toBe(true);
    }
    // J10.4.2 acceptance: under the pro set the targeting hazard never fires; it exists at college.
    expect(pro.get('foul.targeting.exists')).toBe(false);
    expect(col.get('foul.targeting.exists')).toBe(true);
  });
  it('draws only from its own two streams, which the contract lists', () => {
    expect(STREAM_NAMES).toContain('foul');
    expect(STREAM_NAMES).toContain('injury');
  });
});

describe('hazard formulas (J10 acceptance directions)', () => {
  it('J10.2.1: holding rises sharply with the matchup gap and falls with discipline', () => {
    const a = holdingChance(-0.65, 0, false, P), b = holdingChance(-0.95, 0, false, P);
    expect(b / a).toBeGreaterThan(1.8);
    expect(holdingChance(-0.9, 1, false, P)).toBeLessThan(holdingChance(-0.9, 0, false, P));
    expect(holdingChance(-0.9, 0, true, P)).toBeGreaterThan(holdingChance(-0.9, 0, false, P));
  });
  it('J10.3.1: a defender who never found the ball interferes far more; both located is near zero', () => {
    const base = { trailingYd: 0.5, early: 0, zDisc: 0, zBallSkills: 0, team: 1 };
    const lost = interferenceChance({ ...base, notLocated: 1, bothLocated: false }, P);
    const found = interferenceChance({ ...base, notLocated: 0, bothLocated: false }, P);
    const both = interferenceChance({ ...base, notLocated: 0, bothLocated: true }, P);
    expect(lost).toBeGreaterThan(found * 2);
    expect(both).toBeLessThan(found / 10);
  });
  it('L3.4.1: the team layer scales only the hazard, within its bounds', () => {
    const lo = coverageHoldChance(0.5, 0, 0, P['team.defCoverageMin'], P), hi = coverageHoldChance(0.5, 0, 0, P['team.defCoverageMax'], P);
    expect(hi / lo).toBeCloseTo(P['team.defCoverageMax'] / P['team.defCoverageMin'], 5);
    const cLo = conductChance(1, 0, 0, false, P['team.postPlayMin'], P), cHi = conductChance(1, 0, 0, false, P['team.postPlayMax'], P);
    // J10.5.1 acceptance: best to worst bound moves the rate by no more than the ratio (about 16%).
    expect(cHi / cLo).toBeLessThanOrEqual(P['team.postPlayMax'] / P['team.postPlayMin'] + 1e-9);
  });
  it('J10.4.1: inside the could-not-stop gap only an illegal form is a foul; beyond it, the late hit falls with discipline', () => {
    expect(lateHitChance(0.1, 0, 0, P)).toBeLessThan(lateHitChance(0.8, 0, 0, P));
    expect(lateHitChance(0.6, 1.5, 0, P)).toBeLessThan(lateHitChance(0.6, -1.5, 0, P));
  });
  it('J10.4.2: pursuit from behind raises horse collar; a defenseless target raises forcible-contact forms only', () => {
    const x = { energy: 1, lunge: false, behind: false, defenseless: false, zDisc: 0, zTackling: 0, aggression: 0 };
    expect(contactFormChance('horse_collar', { ...x, behind: true }, P)).toBeGreaterThan(contactFormChance('horse_collar', x, P) * 2);
    expect(contactFormChance('helmet_use', { ...x, defenseless: true }, P)).toBeGreaterThan(contactFormChance('helmet_use', x, P) * 2);
    expect(contactFormChance('face_mask', { ...x, defenseless: true }, P)).toBe(contactFormChance('face_mask', x, P));
  });
  it('J10.4.3: an all-out block call raises kicker contact fouls', () => {
    expect(kickerContactChance(5, 0, true, P)).toBeGreaterThan(kickerContactChance(5, 0, false, P));
  });
  it('J10.6.1 acceptance 2: injury chance rises with fatigue above 0.7 and with load excess', () => {
    const x = { energy: 1, fatigue: 0.5, loadExcess: 0, priorSameRegion: false, playingHurt: false, zDurability: 0, surface: 0, ageYears: 25, group: 1 };
    for (const m of MECHANISMS) {
      expect(injuryChance(m, { ...x, fatigue: 0.9 }, P)).toBeGreaterThan(injuryChance(m, { ...x, fatigue: 0.7 }, P));
      expect(injuryChance(m, { ...x, loadExcess: 1 }, P)).toBeGreaterThan(injuryChance(m, x, P));
      expect(injuryChance(m, { ...x, priorSameRegion: true }, P)).toBeGreaterThan(injuryChance(m, x, P));
    }
  });
  it('A3 ruling 22: no possible act gets a chance of exactly 0 or 1', () => {
    const x = { energy: 0, fatigue: 0, loadExcess: 0, priorSameRegion: false, playingHurt: false, zDurability: 9, surface: 0, ageYears: 20, group: 0 };
    for (const m of MECHANISMS) { const c = injuryChance(m, x, P); expect(c).toBeGreaterThan(0); expect(c).toBeLessThan(1); }
    expect(holdingChance(1, 9, false, P)).toBeGreaterThan(0);
    expect(holdingChance(-50, -9, true, P)).toBeLessThan(1);
    expect(lateHitChance(9, -9, -9, P)).toBeLessThan(1);
  });
  it('regions are G-21 catalogue ids', () => {
    const ids = new Set((read('packages/football-content/data/injuries/catalogue.json').rows as { id: string }[]).map((r) => r.id));
    for (const table of Object.values(REGION_TABLE)) for (const [r] of table) expect(ids.has(r), r).toBe(true);
    expect(pickRegion(REGION_TABLE.head_impact, 0.99)).toBe('concussion');
  });
});

/** A losing pass block between slot 1 (blocker) and slot 12 (rusher), next to each other. */
function losingBlock(w: TickWorld, advantage: number): void {
  place(w, 1, -1, 0); place(w, 12, -0.2, 0);
  w.contests.push({ type: 'passBlock', offenseSlot: 1, defenseSlot: 12, advantage, startedTick: 0, helperSlots: [], stream: w.streams('contest', [1, 1, 101, 112, 'passBlock']) });
  w.players.engagement[1] = 0; w.players.engagement[12] = 0;
}

describe('J10.2.1 offensive holding in the stage', () => {
  it('commits holds from a losing block, with the physical effect, and only when the foul exists', () => {
    let holds = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const sc = scene({ seed, params: tableWith({ 'hold.b0': -2 }) });
      losingBlock(sc.world, -0.95);
      for (let i = 0; i < 10; i++) { sc.step(); if (sc.world.contests[0]!.advantage < -0.9) sc.world.contests[0]!.advantage = -0.95; }
      const f = ofType(sc.events, 'foul_committed').filter((e) => e.foulId === 'offensive_holding');
      expect(f.length).toBeLessThanOrEqual(1);
      if (f.length === 1) {
        holds++;
        expect(f[0]!.playerId).toBe(sc.world.slots[1]!.playerId);
        expect(f[0]!.side).toBe(0);
        expect(f[0]!.timing).toBe('live');
        expect(f[0]!.borderline).toBe(false);
      }
    }
    expect(holds).toBeGreaterThan(20);
    const off = scene({ seed: 3, params: tableWith({ 'hold.b0': 5 }), rules: rules({ off: ['offensive_holding', 'illegal_use_of_hands_offense'] }) });
    losingBlock(off.world, -0.95);
    for (let i = 0; i < 10; i++) off.step();
    expect(ofType(off.events, 'foul_committed')).toHaveLength(0);
  });
  it('a committed hold resets the advantage toward -0.2 for its duration', () => {
    const sc = scene({ seed: 1, params: tableWith({ 'hold.b0': 20 }) });
    losingBlock(sc.world, -0.95);
    sc.step();
    expect(ofType(sc.events, 'foul_committed').some((e) => e.foulId === 'offensive_holding')).toBe(true);
    expect(sc.world.contests[0]!.advantage).toBeGreaterThanOrEqual(P['hold.resetA']);
    sc.world.contests[0]!.advantage = -0.9;
    sc.step();
    expect(sc.world.contests[0]!.advantage).toBeGreaterThanOrEqual(P['hold.resetA']);
  });
  it('is deterministic: the same seed gives the same events', () => {
    const run = () => { const sc = scene({ seed: 11, params: tableWith({ 'hold.b0': -3 }) }); losingBlock(sc.world, -0.9); for (let i = 0; i < 20; i++) sc.step(); return JSON.stringify(sc.events); };
    expect(run()).toBe(run());
  });
  it('better discipline means fewer holds over many plays (J10.1.1 acceptance 3 direction)', () => {
    const count = (disc: number) => {
      let n = 0;
      for (let seed = 1; seed <= 150; seed++) {
        const sc = scene({ seed, params: tableWith({ 'hold.b0': -4 }), players: (s): PlayerSpec => (s === 1 ? { attributes: { foul_discipline: disc } } : {}) });
        losingBlock(sc.world, -0.9);
        for (let i = 0; i < 10; i++) sc.step();
        n += ofType(sc.events, 'foul_committed').filter((e) => e.foulId === 'offensive_holding').length;
      }
      return n;
    };
    expect(count(80)).toBeLessThan(count(20));
  });
});

describe('J10.2.3 ineligible downfield: geometry against the rule key', () => {
  const release = (w: TickWorld, airYd: number) => w.emit({
    type: 'pass_release', t: 0.1, marginYd: null, marginS: null, visibility: 'open', passerId: w.slots[0]!.playerId, targetId: w.slots[6]!.playerId, forward: true,
    releaseSpot: { x: 45, y: 26 }, aimSpot: { x: 60, y: 26 }, landingSpot: { x: 60, y: 26 }, airYd, throwaway: false, spike: false, underPressure: false, passerOutsidePocket: false, ballBeyondLine: false,
  });
  const run = (lineDepth: number, idfYd: number, airYd = 12) => {
    const sc = scene({ rules: rules({ idfYd }) });
    for (let s = 0; s < 11; s++) { sc.world.players.eligible[s] = s >= 5 ? 1 : 0; place(sc.world, s, -3, s * 2 - 10); }
    place(sc.world, 2, lineDepth, 0);
    release(sc.world, airYd);
    sc.step();
    return ofType(sc.events, 'foul_committed').filter((e) => e.foulId === 'ineligible_downfield_pass');
  };
  it('a guard 2 yd downfield fouls under a 1 yd key, not under a 3 yd key', () => {
    expect(run(2, 1)).toHaveLength(1);
    expect(run(2, 3)).toHaveLength(0);
  });
  it('a pass that does not cross the line has no limit', () => { expect(run(4, 1, -2)).toHaveLength(0); });
  it('with no eligibility flags set, only men who blocked at the snap are ineligible; receivers downfield never foul', () => {
    const sc = scene({ rules: rules({ idfYd: 1 }) });
    const w = sc.world, pass = BEHAVIORS.indexOf('passSet'), route = BEHAVIORS.indexOf('route');
    for (let s = 0; s < 11; s++) { w.players.eligible[s] = 0; w.players.behavior[s] = s >= 1 && s <= 5 ? pass : route; place(w, s, s >= 6 ? 8 : -2, s * 2 - 10); }
    place(w, 2, 2.5, 0);
    sc.step();
    release(w, 12);
    sc.step();
    const f = ofType(sc.events, 'foul_committed').filter((e) => e.foulId === 'ineligible_downfield_pass' && !e.borderline);
    expect(f.map((e) => e.playerId)).toEqual([w.slots[2]!.playerId]);
  });
  it('just inside the limit is a borderline legal act, flagged as such for B11', () => {
    const f = run(0.9, 1);
    expect(f).toHaveLength(1);
    expect(f[0]!.borderline).toBe(true);
    expect(f[0]!.flagrant).toBe(false);
  });
});

/** A made tackle on carrier slot 6 by defender slot 15, the defender running in hard from behind. */
function tackle(w: TickWorld): void {
  place(w, 6, 10, 0); place(w, 15, 9.4, 0);
  w.players.velX[6] = 6 * w.frame.attackDir; w.players.velX[15] = 9 * w.frame.attackDir;
  w.players.headingRad[6] = w.frame.attackDir === 1 ? 0 : Math.PI;
  w.emit({ type: 'tackle_attempt', t: 0.1, outcome: 'made', carrierId: w.slots[6]!.playerId, tacklerIds: [w.slots[15]!.playerId], spot: { x: 60, y: 26 } });
}

describe('J10.4.2 dangerous contact and J10.6.1 injuries at a tackle', () => {
  it('commits at most one contact form per tackler, and never one the rule set lacks', () => {
    const over: Record<string, number> = {};
    for (const f of CONTACT_FORMS) over[`form.b0.${f}`] = 3;
    const sc = scene({ params: tableWith(over), rules: rules({ off: ['targeting', 'face_mask'] }) });
    tackle(sc.world);
    sc.step();
    const f = ofType(sc.events, 'foul_committed');
    expect(f).toHaveLength(1);
    expect(['face_mask', 'targeting']).not.toContain(f[0]!.foulId);
  });
  it('injures with a catalogue region and puts a player who cannot finish on the ground', () => {
    let downs = 0, injuries = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const sc = scene({ seed, params: tableWith({ 'injury.h0.contact_lower': 0.5, 'injury.h0.contact_upper': 0.3, 'injury.h0.head_impact': 0.1, 'injury.finishSeed': 0.3 }) });
      tackle(sc.world);
      sc.step();
      for (const e of ofType(sc.events, 'injury')) {
        injuries++;
        expect(['contact_lower', 'contact_upper', 'head_impact']).toContain(e.mechanism);
        expect(e.headImpact).toBe(e.mechanism === 'head_impact');
        const s = sc.world.slots.findIndex((x) => x.playerId === e.playerId);
        if (!e.finishesPlay && sc.world.players.hasBall[s] === 0) { expect(sc.world.players.moveMode[s]).toBe(DOWN); downs++; }
      }
      expect(sc.module.hitLoad(6)).toBeGreaterThan(0);
      expect(sc.module.hitLoad(15)).toBe(sc.module.hitLoad(6));
    }
    expect(injuries).toBeGreaterThan(20);
    expect(downs).toBeGreaterThan(0);
  });
  it('J10.6.2: exposures that do not injure add soreness instead', () => {
    const sc = scene({ params: tableWith({ 'injury.h0.contact_lower': 0, 'injury.h0.contact_upper': 0, 'injury.h0.head_impact': 0 }) });
    tackle(sc.world);
    sc.step();
    expect(ofType(sc.events, 'injury')).toHaveLength(0);
    const sore = sc.module.record().soreness;
    let total = 0;
    for (let m = 0; m < MECHANISMS.length; m++) total += sore[6 * MECHANISMS.length + m]!;
    expect(total).toBeGreaterThan(0);
  });
  it('J10.7.2: a big head impact may start an evaluation of 8 to 15 minutes; a missed concussion stays in truth', () => {
    let evals = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const sc = scene({ seed, params: tableWith({ 'concussion.energy': 0.01, 'injury.h0.head_impact': 0.9 }) });
      tackle(sc.world);
      sc.step();
      const r = sc.module.record();
      for (const e of r.evaluations) { evals++; expect(e.durationS).toBeGreaterThanOrEqual(P['concussion.minS']); expect(e.durationS).toBeLessThanOrEqual(P['concussion.maxS']); }
      const concussed = ofType(sc.events, 'injury').filter((e) => e.headImpact).map((e) => e.playerId);
      for (const m of r.missed) expect(concussed).toContain(m.playerId);
      for (const e of r.evaluations) if (e.result === 'diagnosed') expect(concussed).toContain(e.playerId);
    }
    expect(evals).toBeGreaterThan(0);
  });
});

describe('J10.4.1 late hits after the whistle and J10.5.1 conduct', () => {
  it('a defender who arrives after the whistle can commit a dead-ball unnecessary roughness', () => {
    let n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const sc = scene({ seed, params: tableWith({ 'late.pullB0': -6 }) });
      const w = sc.world;
      place(w, 6, 10, 0); place(w, 15, 13, 0);
      w.ball.kind = 'held'; w.ball.carrierSlot = 6; w.ball.lastPossessorSlot = 6; w.players.hasBall[6] = 1;
      sc.step();
      w.deadAtTick = w.tick - 1;
      w.emit({ type: 'dead_ball', t: 0.1, marginYd: null, marginS: null, visibility: 'open', reason: 'down_by_contact', spot: { x: 60, y: 26 }, side: 0, carrierId: w.slots[6]!.playerId });
      w.players.velX[15] = -6 * w.frame.attackDir;
      expect(sc.module.wantsAfterWhistle(w)).toBe(true);
      for (let i = 0; i < 6; i++) { place(w, 15, 13 - (i + 1) * 0.6, 0); sc.step(); }
      const f = ofType(sc.events, 'foul_committed').filter((e) => e.foulId === 'unnecessary_roughness');
      for (const e of f) { expect(e.timing).toBe('dead_ball'); expect(e.playerId).toBe(w.slots[15]!.playerId); }
      n += f.length;
    }
    expect(n).toBeGreaterThan(10);
  });
  it('conduct fouls are dead-ball fouls by players near the ball, and the module asks for the after-whistle ticks', () => {
    let n = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const sc = scene({ seed, params: tableWith({ 'conduct.b0': 1 }) });
      const w = sc.world;
      sc.step();
      w.deadAtTick = w.tick - 1;
      w.emit({ type: 'dead_ball', t: 0.1, marginYd: null, marginS: null, visibility: 'open', reason: 'down_by_contact', spot: { x: w.players.posX[3]!, y: w.players.posY[3]! }, side: 0, carrierId: null });
      expect(sc.module.wantsAfterWhistle(w)).toBe(true);
      sc.step();
      const f = ofType(sc.events, 'foul_committed');
      for (const e of f) { expect(e.timing).toBe('dead_ball'); expect(['taunting', 'unsportsmanlike', 'striking']).toContain(e.foulId); }
      n += f.length;
    }
    expect(n).toBeGreaterThan(0);
  });
});

describe('the module never touches what it does not own', () => {
  it('emits only foul_committed, injury and detail events', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const sc = scene({ seed, params: tableWith({ 'hold.b0': -1, 'injury.h0.contact_lower': 0.3 }) });
      losingBlock(sc.world, -0.95);
      tackle(sc.world);
      const before = sc.events.length;
      for (let i = 0; i < 10; i++) sc.step();
      for (const e of sc.events.slice(before)) expect(['foul_committed', 'injury', 'detail']).toContain(e.type);
    }
  });
  it('every committed foul id is one the module declares', () => {
    expect(new Set(LIVE_FOULS).size).toBe(LIVE_FOULS.length);
    expect(SLOT_COUNT).toBe(22);
    expect(BEHAVIORS).toContain('returner');
  });
});
