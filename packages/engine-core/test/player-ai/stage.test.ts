import { describe, expect, it } from 'vitest';
import { SLOT_COUNT, TruthEvent, type Behavior } from '@gm/schema';
import { ERROR_FORMS, MOTIVES, MatchupMemory, type DeviationRow, type SlotPlay } from '../../src/player-ai/index.ts';
import { P, bench, foulRules, goTo, job, mind, slotPlay, type Bench } from './helpers.ts';

const D = 15; // a defender slot
const withKnowledge = (b: Bench, slot: number, k: number) => { b.world.slots[slot]!.player.gameDay.knowledge['c'] = k; };
const setAttr = (b: Bench, slot: number, id: string, v: number) => { b.world.slots[slot]!.player.attributes[id] = v; };
/** Plays forward from `from` until a play on which none of the slots drew a mental error or an accident; returns its number. */
function clean(b: Bench, slots: readonly number[], ticks = 2, each?: Parameters<Bench['play']>[2], from = 1): number {
  for (let n = from; n < from + 200; n++) {
    b.play(n, ticks, each);
    if (slots.every((s) => b.ai.errorOf(s) === null) && !b.ai.deviations().some((r) => r.kind === 'accident')) return n;
  }
  throw new Error('no clean play');
}
const count = (rows: readonly DeviationRow[], test: (r: DeviationRow) => boolean) => rows.filter(test).length;

describe('J4.5.2 the mental error draw', () => {
  const rate = (knowledge: number, discipline: number, plays = 4000) => {
    const b = bench();
    b.plays[D] = slotPlay(goTo('zoneDrop', 12, 5));
    b.views[D]!.at(5, 5);
    withKnowledge(b, D, knowledge); setAttr(b, D, 'assignment_discipline', discipline);
    let k = 0, d = 0;
    for (let n = 1; n <= plays; n++) { b.play(n); const e = b.ai.errorOf(D); if (e?.cause === 'knowledge') k++; else if (e?.cause === 'discipline') d++; }
    return { k: k / plays, d: d / plays };
  };
  it('produces more knowledge errors as knowledge falls, at the D9.4.1 rates (acceptance 1)', () => {
    const r90 = rate(90, 50), r60 = rate(60, 50), r30 = rate(30, 50);
    expect(r90.k).toBeLessThan(r60.k); expect(r60.k).toBeLessThan(r30.k);
    expect(r60.k).toBeGreaterThan(0.065); expect(r60.k).toBeLessThan(0.095);
    expect(r30.k).toBeGreaterThan(0.22); expect(r30.k).toBeLessThan(0.27);
  });
  it('cuts discipline errors by the D4.2.1 ratio from 40 to 70 and leaves knowledge errors unchanged (acceptance 3)', () => {
    const lo = rate(80, 40, 20000), hi = rate(80, 70, 20000);
    expect(lo.d / hi.d).toBeGreaterThan(1.6); expect(lo.d / hi.d).toBeLessThan(2.5);
    // The same uniform decides both, so the knowledge errors are the very same plays.
    expect(lo.k).toBe(hi.k);
  });
  it('emits one schema-valid mental_error event and one deviation row per error, and none without one', () => {
    const b = bench();
    b.plays[D] = slotPlay(goTo('zoneDrop', 12, 5));
    withKnowledge(b, D, 20);
    let errors = 0;
    for (let n = 1; n <= 300; n++) {
      b.play(n, 3);
      const events = b.world.events.filter((e) => e.type === 'mental_error'), rows = b.ai.deviations().filter((r) => r.kind !== 'accident');
      for (const e of b.world.events) expect(() => TruthEvent.parse(e)).not.toThrow();
      const err = b.ai.errorOf(D);
      expect(events.length).toBe(err ? 1 : 0); expect(rows.length).toBe(err ? 1 : 0);
      if (err) { errors++; expect(events[0]).toMatchObject({ playerId: b.world.slots[D]!.playerId, cause: err.cause, form: err.form }); expect(rows[0]!.motive).toBe(err.motive); }
    }
    expect(errors).toBeGreaterThan(60);
  });
  it('raises temptation to 2.0 when the ball is close and his job takes him away from it', () => {
    const tempted = (ballPx: number) => {
      const b = bench();
      b.plays[D] = slotPlay(goTo('zoneDrop', 15, 5));
      b.views[D]!.at(5, 5).seeBall(ballPx, 5);
      let d = 0;
      for (let n = 1; n <= 8000; n++) { b.play(n); if (b.ai.errorOf(D)?.cause === 'discipline') d++; }
      return d;
    };
    const near = tempted(2), far = tempted(-20);
    expect(near / far).toBeGreaterThan(1.6); expect(near / far).toBeLessThan(2.5);
  });
});

describe('J4.5.3 error forms change what the player does', () => {
  /** Runs plays at knowledge 0 until every form of the behavior has been seen; returns the target written for each. */
  function forms(behavior: Behavior, setup: (b: Bench) => void, script?: Parameters<typeof job>[1]) {
    const seen = new Map<string, { px: number; py: number } | null>();
    const b = bench();
    const j = script ? job(behavior, script) : goTo(behavior, 12, 9);
    b.plays[D] = slotPlay(j);
    b.views[D]!.at(5, 5);
    setup(b);
    withKnowledge(b, D, 0);
    for (let n = 1; n <= 400; n++) {
      b.play(n, 4, (w) => { if (w.tick === 1) j.fire = 0; });
      const e = b.ai.errorOf(D);
      if (!e || e.cause !== 'knowledge' || seen.has(e.form) || b.ai.deviations().some((r) => r.kind === 'accident')) continue;
      const t = b.world.intents[D]!.target;
      seen.set(e.form, t ? { px: t.px, py: t.py } : null);
    }
    return seen;
  }
  it('zone drop: wrong landmark, no carry of the vertical, jumping the short route, wrong rotation', () => {
    const seen = forms('zoneDrop', (b) => { b.views[D]!.see(3, 8, 2, 0, 0, 1); });
    expect([...seen.keys()].sort()).toEqual(ERROR_FORMS.zoneDrop!.map((x) => x.form).sort());
    expect(Math.abs(seen.get('wrongLandmark')!.py - 9)).toBe(3);
    expect(seen.get('didNotCarryVertical')).toEqual({ px: 11, py: 9 }); // capped 6 yd past where he lined up
    expect(seen.get('jumpedShortRoute')).toEqual({ px: 8, py: 2 }); // the receiver he sees
    expect(seen.get('wrongRotation')).toEqual({ px: 12, py: 1 }); // mirrored about where he lined up
  });
  it('route: depth, break direction, conversion taken the wrong way, old route, no hot adjustment', () => {
    // The scripted route converts to (12, 9) from (12, 7) when the receiver hears "hot".
    const seen = forms('route', (b) => { b.views[D]!.calls.add('hot'); }, (v, _i, pt) => { pt.px = 12; pt.py = v.heard('hot') ? 9 : 7; });
    expect([...seen.keys()].sort()).toEqual(ERROR_FORMS.route!.map((x) => x.form).sort());
    expect(seen.get('wrongDepth')).toEqual({ px: 8, py: 9 });
    expect(seen.get('wrongBreakDirection')).toEqual({ px: 12, py: 1 });
    expect(seen.get('wrongConversion')).toEqual({ px: 12, py: 1 }); // mirrored once a rule had fired
    expect(seen.get('ranPreviousRoute')).toEqual({ px: 12, py: 1 }); // no old assignment supplied: mirrored
    expect(seen.get('noHotAdjust')).toEqual({ px: 12, py: 7 }); // he acted as if he never heard the call
  });
  it('pass set: wrong man, wrong slide, late on the exchange, the blitzer he did not see', () => {
    // The scripted blocker takes slot 0's man unless he sees slot 1 coming, in which case he takes slot 1.
    const seen = forms('passSet', (b) => { b.views[D]!.see(0, 6, 5).see(1, 9, 5); }, (v, _i, pt) => {
      const blitzer = v.entity(1), man = v.entity(0)!;
      pt.px = (blitzer ?? man).px; pt.py = v.tSinceSnapS >= 0 ? (blitzer ?? man).py : 0;
    });
    expect([...seen.keys()].sort()).toEqual(ERROR_FORMS.passSet!.map((x) => x.form).sort());
    expect(seen.get('wrongMan')).toEqual({ px: 6, py: 5 }); // the other rusher
    expect(seen.get('slidWrongWay')).toEqual({ px: 9, py: 5 }); // mirrored about py 5: the same line here
    expect(seen.get('didNotSeeBlitzer')).toEqual({ px: 6, py: 5 }); // slot 1 hidden from his rules
  });
  it('late reaction: he keeps his last target for 0.6 s after his rule fires', () => {
    const b = bench();
    let step = 0;
    const j = job('runBlock', (_v, _i, pt) => { pt.px = step < 2 ? 3 : 10; pt.py = 5; });
    b.plays[D] = slotPlay(j);
    withKnowledge(b, D, 0);
    for (let n = 1; n <= 400; n++) {
      const trace: number[] = [];
      step = 0;
      b.play(n, 12, (w) => { step = w.tick; if (w.tick === 2) j.fire = 0; if (w.tick > 0) trace.push(b.world.intents[D]!.target!.px); });
      if (b.ai.errorOf(D)?.form !== 'missedComboClimb') continue;
      // trace[i] is the target written at tick i. The rule fires at tick 2; he holds 3 through tick 7 and moves on at tick 8.
      expect(trace.slice(0, 8)).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
      expect(trace[8]).toBe(10);
      return;
    }
    throw new Error('form never drawn');
  });
  it('uses the supplied old assignment when he runs the previous play, and stops changing his path once the ball is thrown', () => {
    const b = bench();
    const j = goTo('route', 12, 9);
    b.plays[D] = slotPlay(j, { alternate: goTo('route', 3, -4) });
    b.views[D]!.at(5, 5);
    withKnowledge(b, D, 0);
    let checkedOld = false, checkedRelease = false;
    for (let n = 1; n <= 600 && !(checkedOld && checkedRelease); n++) {
      b.play(n, 2);
      const form = b.ai.errorOf(D)?.form;
      if (form === 'ranPreviousRoute') { expect(b.world.intents[D]!.target).toEqual({ px: 3, py: -4 }); checkedOld = true; }
      if (form === 'wrongDepth') {
        b.play(n, 4, (w) => { if (w.tick === 2) j.fire = 100; }); // a universal event: the ball is in the air
        expect(b.world.intents[D]!.target).toEqual({ px: 12, py: 9 });
        checkedRelease = true;
      }
    }
    expect(checkedOld && checkedRelease).toBe(true);
  });
  it('offers alignment and offside forms only when the error is decided before the snap', () => {
    const presnapForms = (firstTick: number) => {
      const b = bench();
      b.plays[D] = slotPlay(goTo('blitz', 0, 5));
      withKnowledge(b, D, 0);
      const seen = new Set<string>();
      for (let n = 1; n <= 600; n++) {
        (b.world.situation as { playNumber: number }).playNumber = n; b.world.tick = firstTick; b.world.events.length = 0;
        b.ai.stage.begin!(b.world); b.ai.stage.run(b.world, 0.1);
        const e = b.ai.errorOf(D);
        if (e?.prim === 'presnap') seen.add(e.form);
      }
      return [...seen].sort();
    };
    expect(presnapForms(0)).toEqual([]);
    expect(presnapForms(-20)).toEqual(['illegalFormation', 'jumpedOffside', 'wrongSide', 'wrongSplit']);
  });
});

describe('K1.7.4 selfish freelancing', () => {
  function run(over: Partial<SlotPlay['mind']>, plays = 30000) {
    const b = bench();
    b.plays[D] = slotPlay(goTo('passRush', 0, 5), { mind: mind(over) });
    b.views[D]!.at(3, 5).seeBall(-5, 0);
    let errors = 0, statForms = 0, contract = 0;
    const motives = new Set<string>();
    for (let n = 1; n <= plays; n++) {
      b.play(n);
      const e = b.ai.errorOf(D);
      if (e?.cause !== 'discipline') continue;
      errors++; motives.add(e.motive);
      if (e.form === 'leftRushLaneForSack') statForms++;
      if (e.motive === 'contract') contract++;
      expect(b.ai.deviations()[0]).toMatchObject({ kind: 'forSelf', leaf: 'K1.7.4', motive: e.motive });
    }
    return { errors, statForms, contract, motives };
  }
  it('gives two players who differ only in ego and team orientation the same number of discipline errors, with more stat-chasing forms for the selfish one (acceptance)', () => {
    const selfish = run({ ego: 90, teamOrientation: 20 }), unselfish = run({ ego: 20, teamOrientation: 90 });
    expect(selfish.errors).toBe(unselfish.errors);
    expect(selfish.errors).toBeGreaterThan(300);
    expect(selfish.statForms / selfish.errors).toBeGreaterThan(0.7);
    expect(unselfish.statForms).toBe(0); // wSelf is 0: his errors come from the J4.5.3 list
    expect([...unselfish.motives]).toEqual(['frustration']);
  });
  it('raises the selfish share in a contract year and labels the motive (acceptance)', () => {
    const plain = run({}), contract = run({ needSelf: 1 });
    expect(contract.errors).toBe(plain.errors);
    expect(contract.statForms).toBeGreaterThan(plain.statForms);
    expect(contract.contract).toBeGreaterThan(0); expect(plain.contract).toBe(0);
  });
  it('treats a real imported person the same whatever traits are passed for him (acceptance, X14)', () => {
    const a = run({ neutralBlock: true, ego: 100, teamOrientation: 0, needSelf: 1 }, 10000), b = run({ neutralBlock: true, ego: 50, teamOrientation: 50, needSelf: 1 }, 10000);
    expect(a.statForms).toBe(b.statForms); expect(a.errors).toBe(b.errors);
  });
  it('shows a protest as a loaf away from the ball: effort held under 0.90 and a loaf row beside the deviation', () => {
    const b = bench();
    b.plays[3] = slotPlay(goTo('route', 10, 12), { mind: mind({ roleGap: 1, buyIn: 20, ego: 50, teamOrientation: 100 }) });
    b.views[3]!.at(0, 12).seeBall(-3, 0);
    setAttr(b, 3, 'assignment_discipline', 1);
    for (let n = 1; n <= 2000; n++) {
      b.play(n, 2);
      if (b.ai.errorOf(3)?.form !== 'didNotBlock') continue;
      expect(b.ai.errorOf(3)!.motive).toBe('protest');
      expect(b.world.intents[3]!.target).toBeNull();
      expect(b.world.intents[3]!.effort).toBeLessThan(0.9);
      expect(b.ai.loafs().length).toBe(1);
      expect(b.world.events.some((e) => e.type === 'detail' && e.code === 'playerAi.loaf')).toBe(true);
      return;
    }
    throw new Error('form never drawn');
  });
});

describe('K1.2.1 effort on a snap', () => {
  it('makes a low-motor tired defender give less away from the ball, keeps him near full effort at the point of attack, and tags loafs (acceptance)', () => {
    const mean = (motor: number, freshness: number, ballPx: number) => {
      const b = bench({ players: () => ({ freshness }) });
      b.plays[D] = slotPlay(goTo('pursue', 0, 5), { mind: mind({ motor }) });
      b.views[D]!.at(10, 5).seeBall(ballPx, 5);
      let total = 0, loafs = 0, min = 1;
      for (let n = 1; n <= 1000; n++) { b.play(n); const e = b.world.intents[D]!.effort; total += e; if (e < min) min = e; loafs += b.ai.loafs().length; }
      return { mean: total / 1000, loafs, min };
    };
    const lazyAway = mean(30, 0.2, -5), keenAway = mean(70, 0.2, -5), lazyAtPoint = mean(30, 0.2, 9);
    expect(lazyAway.mean).toBeLessThan(keenAway.mean - 0.03);
    expect(lazyAtPoint.min).toBeGreaterThanOrEqual(0.97);
    expect(lazyAway.loafs).toBeGreaterThan(0);
    expect(keenAway.min).toBeGreaterThanOrEqual(0.8);
  });
});

describe('K1.3.1 gambles and K1.7.1 the record', () => {
  /** A corner in man coverage sees a receiver break outside with the quarterback still holding the ball. */
  function corner(over: Partial<SlotPlay> = {}, setup: (b: Bench) => void = () => {}) {
    const b = bench();
    b.plays[D] = slotPlay(goTo('manCover', 10, 10), over);
    b.views[D]!.at(10, 10).see(3, 8, 11, 0, 6, 1).see(20, 25, 0).seeBall(-5, 0);
    b.views[D]!.read = { read: 'pass', side: 'none', confidence: 1 };
    setAttr(b, D, 'play_recognition', 70); // confidence 0.76
    setup(b);
    return b;
  }
  const gambles = (b: Bench, plays = 300) => {
    let n = 0;
    const rows: DeviationRow[] = [];
    for (let i = 1; i <= plays; i++) { b.play(i, 2); const r = b.ai.deviations().filter((x) => x.form === 'jumpRoute'); if (r.length) { n++; rows.push(r[0]!); } }
    return { n, rows };
  };
  it('lets a risk taker jump the route and a careful player stay home, from the same read (acceptance direction)', () => {
    const bold = gambles(corner({ mind: mind({ riskTolerance: 95 }) })), careful = gambles(corner({ mind: mind({ riskTolerance: 5 }) }));
    expect(bold.n).toBeGreaterThan(250); expect(careful.n).toBe(0);
    expect(bold.rows[0]).toMatchObject({ kind: 'forTeam', motive: 'read', leaf: 'K1.3.1' });
  });
  it('drives him to where the receiver is going and records "left assignment: jumped route" in the explain record', () => {
    const b = corner({ mind: mind({ riskTolerance: 95 }) });
    clean(b, [D]);
    expect(b.world.intents[D]!.target).toEqual({ px: 8, py: 11 + 6 * P.jumpLeadS });
    expect(b.world.intents[D]!.moveMode).toBe('sprint');
    expect(b.ai.explain().some((e) => e.slot === D && e.note === 'left assignment: jumped route')).toBe(true);
  });
  it('labels the gamble for himself when it passes only with his own credit counted (K1.7.4 rule 2)', () => {
    // Middling risk tolerance: 0.76 confidence times 0.9 does not clear his bar; a large self weight does.
    const selfish = gambles(corner({ mind: mind({ riskTolerance: 30, ego: 100, teamOrientation: 0, needSelf: 1 }) }));
    const teamFirst = gambles(corner({ mind: mind({ riskTolerance: 30, ego: 0, teamOrientation: 100 }) }));
    expect(selfish.n).toBeGreaterThan(250); expect(teamFirst.n).toBe(0);
    expect(selfish.rows[0]).toMatchObject({ kind: 'forSelf', motive: 'contract', leaf: 'K1.7.4' });
    expect(selfish.rows[0]!.selfValueEst).toBe(P.creditInterception);
  });
  it('"no freelancing" stops the selfish gamble and still lets a clear team read through (K1.7.4 rule 6)', () => {
    const order = { instruction: { noFreelancing: true } };
    const selfish = mind({ riskTolerance: 30, ego: 70, trust: 100 });
    expect(gambles(corner({ mind: selfish })).n).toBeGreaterThan(250);
    expect(gambles(corner({ ...order, mind: selfish })).n).toBe(0);
    expect(gambles(corner({ ...order, mind: mind({ riskTolerance: 100 }) })).n).toBeGreaterThan(250);
  });
  it('asks more of the last line of defense (edge case) and of a player told to stay on top', () => {
    const m = mind({ riskTolerance: 70, teamOrientation: 100 }); // no pull of his own, so only the team bar counts
    expect(gambles(corner({ mind: m })).n).toBeGreaterThan(250);
    expect(gambles(corner({ mind: m }, (b) => { b.views[D]!.ents.delete(20); })).n).toBe(0); // nobody behind him
    expect(gambles(corner({ mind: m, instruction: { stayOnTop: true } })).n).toBe(0);
  });
  it('does not call an act the coverage allows a deviation (K1.7.4 edge case)', () => {
    const b = corner({ mind: mind({ riskTolerance: 95 }), freedom: ['jumpRoute'] });
    clean(b, [D]);
    expect(b.ai.deviations()).toEqual([]);
    expect(b.world.intents[D]!.moveMode).toBe('sprint');
    expect(b.ai.explain().some((e) => e.note.endsWith('(allowed by the call)'))).toBe(true);
  });
  it('records only the first when two producers fire on one player and play (K1.7.1 rule 3 acceptance)', () => {
    const b = corner({ mind: mind({ riskTolerance: 95 }) });
    withKnowledge(b, D, 0);
    let both = 0;
    for (let n = 1; n <= 200; n++) {
      b.play(n, 3);
      const deliberate = b.ai.deviations().filter((r) => r.kind !== 'accident');
      expect(deliberate.length).toBeLessThanOrEqual(1);
      if (b.ai.errorOf(D)) { both++; expect(deliberate[0]!.leaf).not.toBe('K1.3.1'); }
    }
    expect(both).toBeGreaterThan(50);
  });
  it('gives every row exactly one kind and one motive from the content list, with the motive belonging to the kind', () => {
    const b = corner({ mind: mind({ riskTolerance: 60, ego: 80, roleGap: 0.5, stress: 0.5 }) });
    withKnowledge(b, D, 70);
    let rows = 0;
    for (let n = 1; n <= 3000; n++) {
      b.play(n, 2);
      for (const r of b.ai.deviations()) { rows++; expect(MOTIVES[r.motive].kind).toBe(r.kind); expect(r.outcomeEP).toBeNull(); }
    }
    expect(rows).toBeGreaterThan(100);
  });
  it('chooses the strip more often when told to go for strips, and an ordered strip is not a deviation', () => {
    const tackler = (over: Partial<SlotPlay>) => {
      const b = bench();
      b.plays[D] = slotPlay(goTo('pursue', 4, 4), over);
      b.views[D]!.at(5, 5).see(2, 4, 4).seeBall(4, 4);
      b.views[D]!.carrier = 2;
      clean(b, [D]);
      return b;
    };
    const plain = tackler({ mind: mind({ riskTolerance: 50 }) }), ordered = tackler({ mind: mind({ riskTolerance: 50 }), instruction: { goForStrips: true } });
    const gambler = tackler({ mind: mind({ riskTolerance: 100 }) });
    expect(plain.ai.stripAttempt(D)).toBe(false);
    expect(ordered.ai.stripAttempt(D)).toBe(true); expect(ordered.ai.deviations()).toEqual([]);
    expect(gambler.ai.stripAttempt(D)).toBe(true); expect(gambler.ai.deviations()[0]).toMatchObject({ form: 'strip', kind: 'forTeam' });
    expect(gambler.world.intents[D]!.target).toEqual({ px: 4, py: 4 }); // the path is the assignment's; only the technique changes
  });
});

describe('K1.7.5 the veteran adjustment', () => {
  function safety(veteran: boolean, tell: number, over: Partial<SlotPlay> = {}) {
    const b = bench();
    b.plays[D] = slotPlay(goTo('deepZone', 15, 0), { mind: mind({ seasonsInSystem: veteran ? 4 : 1, riskTolerance: 60 }), tell: tell > 0 ? { px: 12, py: 8, strength: tell } : null, ...over });
    b.views[D]!.at(14, 2).see(3, 6, 8, 5, 0, 1).see(20, 25, 0).seeBall(-5, 0);
    b.views[D]!.read = { read: 'pass', side: 'none', confidence: 0.8 };
    withKnowledge(b, D, veteran ? 95 : 95); setAttr(b, D, 'football_intelligence', 70);
    return b;
  }
  it('never records an adjustment from this leaf for a player below the gate (acceptance)', () => {
    for (const [k, iq, seasons] of [[80, 70, 4], [95, 50, 4], [95, 70, 1]] as const) {
      const b = safety(true, 1, { mind: mind({ seasonsInSystem: seasons, riskTolerance: 100 }) });
      withKnowledge(b, D, k); setAttr(b, D, 'football_intelligence', iq);
      for (let n = 1; n <= 200; n++) { b.play(n, 2); expect(b.ai.deviations().filter((r) => r.leaf === 'K1.7.5')).toEqual([]); }
    }
  });
  it('lets a gated veteran who studied the tell sit on the route, and one who did not stay in his zone (acceptance)', () => {
    const studied = safety(true, 1), unstudied = safety(true, 0);
    clean(studied, [D]); clean(unstudied, [D]);
    expect(studied.ai.deviations()[0]).toMatchObject({ kind: 'forTeam', motive: 'tell', form: 'sitOnRoute', leaf: 'K1.7.5' });
    expect(studied.world.intents[D]!.target).toEqual({ px: 12, py: 8 });
    expect(unstudied.ai.deviations()).toEqual([]);
    expect(unstudied.world.intents[D]!.target).toEqual({ px: 15, py: 0 });
  });
  it('weighs the teammates who count on him: low cohesion talks him out of it, and when he goes he calls it', () => {
    const calls: string[] = [];
    const dependents = (cohesion: number) => [16, 17, 18, 19].map((slot) => ({ slot, cohesion }));
    const tight = safety(true, 0.8, { dependents: dependents(0.9) }), loose = safety(true, 0.8, { dependents: dependents(0.2) });
    let tightN = 0, looseN = 0;
    const adj = (x: Bench) => count(x.ai.deviations(), (r) => r.leaf === 'K1.7.5');
    for (let n = 1; n <= 300; n++) { tight.play(n, 2); loose.play(n, 2); tightN += adj(tight); looseN += adj(loose); }
    expect(tightN).toBeGreaterThan(250);
    expect(tightN).toBeGreaterThan(looseN);
    // With a call hook the row says his teammates knew.
    const b = bench();
    const views = b.views;
    const { createPlayerAi } = requireAi();
    const ai = createPlayerAi({ view: (s) => views[s]!, call: (_w, sender, listeners, call) => { calls.push(`${sender}>${listeners.join(',')}:${call}`); } });
    const plays = new Array<SlotPlay | null>(SLOT_COUNT).fill(null);
    plays[D] = slotPlay(goTo('deepZone', 15, 0), { mind: mind({ seasonsInSystem: 4, riskTolerance: 60 }), tell: { px: 12, py: 8, strength: 1 }, dependents: dependents(0.9) });
    views[D]!.at(14, 2).see(3, 6, 8, 5, 0, 1).see(20, 25, 0).seeBall(-5, 0);
    views[D]!.read = { read: 'pass', side: 'none', confidence: 0.8 };
    withKnowledge(b, D, 95); setAttr(b, D, 'football_intelligence', 70);
    ai.setPlay(plays);
    for (let n = 1; ; n++) {
      (b.world.situation as { playNumber: number }).playNumber = n; b.world.tick = 0; b.world.events.length = 0; calls.length = 0;
      ai.stage.begin!(b.world); ai.stage.run(b.world, 0.1);
      if (ai.errorOf(D) === null) break;
    }
    expect(calls).toEqual([`${D}>16,17,18,19:adjust:sitOnRoute`]);
    expect(ai.deviations()[0]!.knownToTeammates).toBe(true);
  });
  it('lets a veteran cover a receiver a teammate has let run free deep (rule 4: rescue)', () => {
    const b = bench();
    b.plays[D] = slotPlay(goTo('zoneDrop', 8, 0), { mind: mind({ seasonsInSystem: 4, riskTolerance: 80 }) });
    b.views[D]!.at(8, 0).see(4, 18, 10, 7, 0, 1).see(20, 30, -15).seeBall(-5, 0);
    withKnowledge(b, D, 95); setAttr(b, D, 'football_intelligence', 70);
    const n = clean(b, [D]);
    expect(b.ai.deviations()[0]).toMatchObject({ kind: 'forTeam', motive: 'rescue', form: 'rescue' });
    // The same look with a teammate already on the receiver is no cue.
    b.views[D]!.see(19, 19, 11);
    clean(b, [D], 2, undefined, n + 1);
    expect(b.ai.deviations()).toEqual([]);
  });
});

describe('K1.3.3 deliberate fouls', () => {
  function beaten(cap: number, discipline: number, behindHelp = false) {
    const b = bench({ rules: foulRules(cap), ballX: 35 });
    b.plays[D] = slotPlay(goTo('manCover', 30, 10), { mind: mind({ discipline }) });
    b.views[D]!.at(38, 10).see(3, 40, 10.5, 8, 0, 1).seeBall(20, 8);
    b.views[D]!.kind = 'passInFlight';
    if (behindHelp) b.views[D]!.see(20, 50, 8);
    let n = 0;
    for (let i = 1; i <= 2000; i++) { b.play(i, 2); if (b.ai.foulIntent(D)) n++; }
    return { n, b };
  }
  it('is more frequent under a capped interference rule than under a spot foul, and for low discipline (acceptance)', () => {
    const spot = beaten(0, 50), capped = beaten(15, 50), cappedWild = beaten(15, 10), cappedClean = beaten(15, 95);
    expect(capped.n).toBeGreaterThan(spot.n);
    expect(cappedWild.n).toBeGreaterThan(capped.n); expect(capped.n).toBeGreaterThan(cappedClean.n);
    expect(capped.n).toBeGreaterThan(0);
  });
  it('hands J10 the foul and the man, records it as done for the team, and explains it', () => {
    const { b } = beaten(15, 10);
    for (let i = 1; i <= 200; i++) {
      b.play(i, 2);
      const foul = b.ai.foulIntent(D);
      if (!foul) continue;
      expect(foul).toMatchObject({ slot: D, foulId: 'dpi', targetSlot: 3 });
      expect(b.ai.deviations()[0]).toMatchObject({ kind: 'forTeam', motive: 'preventScore', leaf: 'K1.3.3' });
      expect(b.ai.explain().some((e) => e.note === 'deliberate foul: prevented a likely touchdown')).toBe(true);
      expect(b.world.intents[D]!.target).toEqual({ px: 40, py: 10.5 });
      return;
    }
    throw new Error('no foul chosen');
  });
  it('seldom pays with help behind the receiver, and never when the foul does not exist in the rule set', () => {
    expect(beaten(15, 50, true).n).toBeLessThan(beaten(15, 50).n);
    const b = bench();
    b.plays[D] = slotPlay(goTo('manCover', 30, 10), { mind: mind({ discipline: 0, competitiveness: 100 }) });
    b.views[D]!.at(38, 10).see(3, 40, 10.5, 8, 0, 1).seeBall(20, 8);
    b.views[D]!.kind = 'passInFlight';
    for (let i = 1; i <= 100; i++) { b.play(i, 2); expect(b.ai.foulIntent(D)).toBeNull(); }
  });
  it('lets a beaten blocker hold rather than give up the sack, more readily when the sack costs more', () => {
    const blocker = (sackCostsMore: boolean) => {
      const b = bench({ rules: foulRules(0) });
      b.plays[5] = slotPlay(goTo('passSet', -3, 2), { mind: mind({ discipline: 30, competitiveness: 70 }) });
      b.views[5]!.at(-3, 2).see(14, -4.5, 2.5, -5, 0).seeBall(-7, 0);
      b.ai.setPlay(b.plays, { sackCostsMore });
      let n = 0;
      for (let i = 1; i <= 1000; i++) { b.play(i, 2); const f = b.ai.foulIntent(5); if (f) { n++; expect(f.foulId).toBe('offensive_holding'); expect(b.ai.deviations()[0]!.motive).toBe(sackCostsMore ? 'clock' : 'preventScore'); } }
      return n;
    };
    expect(blocker(true)).toBeGreaterThan(blocker(false));
  });
});

describe('K1.7.2 accidents', () => {
  function digs(grade: number, freshness: number, plays = 10000) {
    const b = bench({ players: () => ({ freshness }) });
    let leg = 0;
    const j = job('route', (_v, _i, pt) => { pt.px = 12; pt.py = leg === 0 ? 8 : -6; });
    b.plays[3] = slotPlay(j);
    b.views[3]!.at(0, 8);
    setAttr(b, 3, 'route_running_intermediate', grade); withKnowledge(b, 3, 100); setAttr(b, 3, 'assignment_discipline', 90);
    let accidents = 0, checkpoints = 0, rules = 0;
    const offsets: number[] = [];
    for (let n = 1; n <= plays; n++) {
      leg = 0;
      b.play(n, 2, (w) => { leg = w.tick; });
      if (b.ai.errorOf(3) !== null) continue; // an error is its own row; this test counts accidents
      const rows = b.ai.deviations();
      accidents += rows.length; checkpoints += 2;
      for (const r of rows) { expect(r.kind).toBe('accident'); expect(r.leaf).toBe('K1.7.2'); }
      rules += b.ai.explain().filter((e) => e.rule >= 0).length;
      const t = b.world.intents[3]!.target!;
      if (rows.some((r) => r.form === 'routeDepthOff' && r.tick === 1)) offsets.push(Math.abs(t.px - 12));
    }
    return { rate: accidents / checkpoints, rules, offsets };
  }
  it('averages the base 2 percent per check point with every multiplier at 1 (acceptance)', () => {
    const r = digs(70, 1, 20000);
    expect(r.rate).toBeGreaterThan(0.017); expect(r.rate).toBeLessThan(0.023);
  });
  it('rises with fatigue and falls with route-running grade, and never changes the rule in the explain record (acceptance)', () => {
    const good = digs(70, 1), poor = digs(30, 1), tired = digs(70, 0.1);
    expect(poor.rate).toBeGreaterThan(good.rate * 1.5);
    expect(tired.rate).toBeGreaterThan(good.rate * 1.4);
    expect(good.rules + poor.rules + tired.rules).toBe(0);
    for (const off of poor.offsets) { expect(off).toBeGreaterThanOrEqual(1); expect(off).toBeLessThanOrEqual(3); }
    expect(poor.offsets.length).toBeGreaterThan(20);
  });
  it('records a slip reported by the footing model without drawing anything', () => {
    const b = bench();
    b.plays[3] = slotPlay(goTo('route', 12, 8));
    b.play(1);
    b.ai.recordSlip(b.world, 3);
    expect(b.ai.deviations().at(-1)).toMatchObject({ kind: 'accident', motive: 'slip', leaf: 'J12.5.1' });
  });
});

describe('K1.7.3 situational lapses', () => {
  const misses = (over: Partial<SlotPlay>, m: Partial<SlotPlay['mind']>) => {
    const b = bench();
    b.plays[3] = slotPlay(goTo('ballCarrier', 12, 8), { mind: mind(m), ...over });
    let n = 0;
    for (let i = 1; i <= 5000; i++) {
      b.play(i);
      const right = b.ai.situational(b.world, 3, 'clock');
      expect(b.ai.situational(b.world, 3, 'clock')).toBe(right); // one draw per family per play
      if (!right) { n++; expect(b.ai.deviations().at(-1)).toMatchObject({ kind: 'didNotKnow', motive: 'situation', form: 'clock', leaf: 'K1.7.3' }); }
    }
    return n;
  };
  const taught = { sticks: 1, clock: 1, field: 1, score: 1, possession: 1 }, untaught = { ...taught, clock: 0 };
  it('falls as installed situational knowledge and years at the level rise; a reminder helps on that snap (acceptance)', () => {
    const base = misses({}, { situationKnowledge: untaught, yearsAtLevel: 0 });
    expect(misses({}, { situationKnowledge: taught, yearsAtLevel: 0 })).toBeLessThan(base);
    expect(misses({}, { situationKnowledge: untaught, yearsAtLevel: 3 })).toBeLessThan(base);
    expect(misses({ reminder: true }, { situationKnowledge: untaught, yearsAtLevel: 0 })).toBeLessThan(base);
    expect(base / 5000).toBeGreaterThan(0.29); expect(base / 5000).toBeLessThan(0.37);
  });
});

describe('K1.5.1 getting people lined up', () => {
  function unitErrors(communication: number, playClockLeftS = 10) {
    const b = bench();
    const members = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    for (const s of [11, ...members]) { b.plays[s] = slotPlay(goTo('zoneDrop', 10, s)); withKnowledge(b, s, 70); }
    setAttr(b, 11, 'front_and_coverage_checks', communication);
    b.ai.setPlay(b.plays, { units: [{ communicator: 11, members }], playClockLeftS });
    let errors = 0, spread = 0;
    for (let n = 1; n <= 3000; n++) {
      b.play(n);
      for (const s of members) { const e = b.ai.errorOf(s); if (e) { errors++; if (e.cause === 'communication') { spread++; expect(e.form).toBe('wrongCall'); expect(b.ai.errorOf(11)?.cause).toBe('knowledge'); } } }
    }
    return { errors, spread, quality: b.ai.commQuality(0), bonus: b.ai.deliveryBonus(0) };
  }
  it('raises the unit mental error count when a strong communicator is replaced by a weak one, everyone else unchanged (acceptance)', () => {
    const strong = unitErrors(90), weak = unitErrors(10);
    expect(strong.quality).toBeGreaterThan(weak.quality);
    expect(strong.bonus).toBeGreaterThan(0); expect(weak.bonus).toBeLessThan(0);
    // 30,000 member snaps each; the gap is far outside sampling error (standard error of each count is about 35).
    expect(weak.errors - strong.errors).toBeGreaterThan(250);
  });
  it('spreads a wrong call made by a strong communicator to more teammates (rule 3), and fixes fewer with no time on the clock (rule 2)', () => {
    expect(unitErrors(90).spread).toBeGreaterThan(unitErrors(10).spread);
    expect(unitErrors(90, 0).errors).toBeGreaterThan(unitErrors(90, 10).errors);
  });
});

describe('K1.3.2 offensive improvisation', () => {
  function scrambles(scrambleKnowledge: number) {
    const b = bench();
    const depths = [20, 12, 4];
    [1, 2, 3].forEach((s, i) => { b.plays[s] = slotPlay(goTo('route', 30, 10), { scrambleKnowledge }); b.views[s]!.at(depths[i]!, 10); b.views[s]!.carrier = 0; });
    b.ai.setPlay(b.plays, { qbSlot: 0 });
    let byRule = 0;
    const targets: ({ px: number; py: number } | null)[] = [];
    for (let n = 1; n <= 1000; n++) {
      b.play(n, 3, (w) => { for (const s of [1, 2, 3]) b.views[s]!.see(0, -6, w.tick >= 1 ? -8 : 0); });
      for (const s of [1, 2, 3]) if (b.world.events.some((e) => e.type === 'detail' && e.code === 'playerAi.scramble_rule' && e.playerIds[0] === b.world.slots[s]!.playerId)) byRule++;
      if (n === 1) for (const s of [1, 2, 3]) { const t = b.world.intents[s]!.target; targets.push(t ? { ...t } : null); }
    }
    return { share: byRule / 3000, targets, deviations: b.ai.deviations().length };
  }
  it('moves receivers by the installed scramble rule in at least 95 percent of cases they see, under 20 percent without it (acceptance)', () => {
    const taught = scrambles(1), untaught = scrambles(0);
    expect(taught.share).toBeGreaterThanOrEqual(0.95);
    expect(untaught.share).toBeLessThan(0.2);
  });
  it('sends the deep man deep, the crosser to the quarterback\'s side and the short man back toward him', () => {
    const b = bench();
    const depths = [20, 12, 4];
    [1, 2, 3].forEach((s, i) => { b.plays[s] = slotPlay(goTo('route', 30, 10), { scrambleKnowledge: 1 }); b.views[s]!.at(depths[i]!, 10); b.views[s]!.carrier = 0; });
    b.ai.setPlay(b.plays, { qbSlot: 0 });
    for (let n = 1; n <= 50; n++) {
      b.play(n, 3, (w) => { for (const s of [1, 2, 3]) b.views[s]!.see(0, -6, w.tick >= 1 ? -8 : 0); });
      if (b.world.events.filter((e) => e.type === 'detail' && e.code === 'playerAi.scramble_rule').length < 3 || b.ai.deviations().length > 0) continue;
      expect(b.world.intents[1]!.target).toEqual({ px: 20 + P.scrambleGoYd, py: 10 });
      expect(b.world.intents[2]!.target).toEqual({ px: 12, py: 10 - P.scrambleGoYd });
      expect(b.world.intents[3]!.target).toEqual({ px: P.backfieldDepthYd, py: 10 - P.scrambleComeBackYd });
      expect(b.ai.deviations()).toEqual([]); // an installed rule is not a deviation
      return;
    }
    throw new Error('rule never applied to all three');
  });
  it('lets only an aware receiver with chemistry sit down in a hole of the zone', () => {
    const sits = (awareness: number, chemistry: number) => {
      const b = bench();
      b.plays[3] = slotPlay(goTo('route', 30, 0), { chemistry });
      b.views[3]!.at(12, 0).see(15, 12, 7).see(16, 12, -7).see(17, 19, 0);
      setAttr(b, 3, 'zone_awareness', awareness);
      b.play(1, 2);
      return b.world.intents[3]!.target!.px === 12;
    };
    expect(sits(70, 0.8)).toBe(true); expect(sits(70, 0.3)).toBe(false); expect(sits(50, 0.8)).toBe(false);
  });
  it('bounds the coach\'s shift of the carrier\'s patience (rule 3)', () => {
    const b = bench();
    b.plays[3] = slotPlay(goTo('ballCarrier', 5, 0), { instruction: { carrierPatience: 1 } });
    b.plays[4] = slotPlay(goTo('ballCarrier', 5, 0), { instruction: { carrierPatience: -1 } });
    b.play(1);
    expect(b.ai.patienceShift(3)).toBe(P.patienceShiftMax); expect(b.ai.patienceShift(4)).toBe(-P.patienceShiftMax); expect(b.ai.patienceShift(5)).toBe(0);
  });
});

describe('K1.4.1 learning feeds the gamble', () => {
  it('makes a defender who has seen the same break all game surer of it than a substitute', () => {
    const jumps = (reps: number) => {
      const b = bench();
      b.plays[D] = slotPlay(goTo('manCover', 10, 10), { mind: mind({ riskTolerance: 95, teamOrientation: 100 }) });
      b.views[D]!.at(10, 10).see(3, 8, 11, 0, 6, 1).see(20, 25, 0).seeBall(-5, 0);
      b.views[D]!.read = { read: 'pass', side: 'none', confidence: 0.6 };
      setAttr(b, D, 'football_intelligence', 70);
      const m = new MatchupMemory();
      for (let i = 0; i < reps; i++) m.record(b.world.slots[D]!.playerId, b.world.slots[3]!.playerId, 'separation', 'out');
      b.ai.setPlay(b.plays, {}, m);
      clean(b, [D]);
      // A veteran of the system sits on the route (K1.7.5); a newer player would jump it (K1.3.1). Either is the learned read at work.
      return count(b.ai.deviations(), (r) => r.form === 'jumpRoute' || r.form === 'sitOnRoute');
    };
    expect(jumps(0)).toBe(0); expect(jumps(12)).toBe(1);
  });
});

function requireAi() { return aiModule; }
import * as aiModule from '../../src/player-ai/index.ts';
