// G-91 acceptance tests, one block per G2 leaf (and O3.2.1).
import { describe, expect, it } from 'vitest';
import { lang as langModule } from '@gm/football-lang';
import { Assignment, scanForbiddenJson } from '@gm/schema';
import * as dd from '../../src/defense-designer/index.ts';
import { STARTER } from '../../src/starter/index.ts';
import { ruleSet } from './rules.ts';

const PRO = dd.fieldGeometry(ruleSet('pro'));
const COL = dd.fieldGeometry(ruleSet('college'));
const MID = { ballYd: 0, qbArm: 'right' as const };
const look = (id: string): dd.OffLook => dd.LOOK_BY_ID.get(id)!;
const with_ = (c: dd.DefensiveCall, patch: Partial<dd.DefensiveCall>): dd.DefensiveCall => ({ ...c, ...patch });

describe('G2.1.1 call object', () => {
  it('every starter call resolves to exactly eleven aligned defenders with one job each against every look', () => {
    for (const c of dd.DESIGNER_CALLS) for (const l of dd.LOOKS) for (const f of [PRO, COL]) {
      const r = dd.resolve(c, l, MID, f);
      expect(r.defenders).toHaveLength(11);
      for (const d of r.defenders) { expect(Number.isFinite(d.px) && Number.isFinite(d.py)).toBe(true); expect(d.job).toBeDefined(); }
    }
  });
  it('every starter call survives a save and load (JSON) without loss and holds no forbidden key', () => {
    for (const c of dd.DESIGNER_CALLS) {
      expect(JSON.parse(JSON.stringify(c))).toEqual(c);
      expect(scanForbiddenJson(c.id, c)).toEqual([]);
    }
  });
});

describe('G2.1.2 declarations', () => {
  it('every look gives exactly one run strength and one passing strength', () => {
    for (const l of dd.LOOKS) {
      const d = dd.declare(dd.readLook(l), dd.OVER_3_SKY.declarations, MID);
      expect(['left', 'right']).toContain(d.strong);
      expect(['left', 'right']).toContain(d.passStrong);
    }
  });
  it('ball on the left hash: a field-tagged player aligns to the offense right, and the reverse, under both rule sets', () => {
    const fieldCorner = with_(dd.OVER_3_SKY, { slots: dd.OVER_3_SKY.slots.map((s) => (s.id === 'LC' ? { ...s, align: { kind: 'rcv', n: 1, side: 'field', depthYd: 7, leverage: 'outside' } as dd.Align } : s)) });
    for (const f of [PRO, COL]) {
      const left = dd.resolve(fieldCorner, look('gun_2x2_11'), { ballYd: -f.hashYd, qbArm: 'right' }, f);
      expect(left.declared.field).toBe('right');
      expect(left.defenders.find((d) => d.slot.id === 'LC')!.py).toBeGreaterThan(-f.hashYd);
      const right = dd.resolve(fieldCorner, look('gun_2x2_11'), { ballYd: f.hashYd, qbArm: 'right' }, f);
      expect(right.declared.field).toBe('left');
      expect(right.defenders.find((d) => d.slot.id === 'LC')!.py).toBeLessThan(f.hashYd);
    }
  });
  it('college hashes are wider than pro, read from the rule set', () => {
    expect(COL.hashYd).toBeGreaterThan(PRO.hashYd);
  });
});

describe('G2.2.2 front and gaps', () => {
  it('technique labels follow the chosen convention, and editing a technique moves the diagram and the gap table together', () => {
    expect(dd.techLabel('oddOutside', 'T', 'outside')).toBe('5');
    expect(dd.techLabel('oddOutside', 'G', 'inside')).toBe('2i');
    expect(dd.techLabel('fiveHeadUp', 'T', 'head')).toBe('5');
    const base = dd.resolve(dd.OVER_3_SKY, look('gun_2x2_11'), MID, PRO);
    const edited = with_(dd.OVER_3_SKY, { slots: dd.OVER_3_SKY.slots.map((s) => (s.id === 'T' ? { ...s, align: { kind: 'tech', blocker: 'G', shade: 'inside', side: 'strong' } as dd.Align, job: { kind: 'rush', gap: 'A', side: 'strong' } as dd.Job } : s)) });
    const after = dd.resolve(edited, look('gun_2x2_11'), MID, PRO);
    expect(after.defenders.find((d) => d.slot.id === 'T')!.py).not.toBe(base.defenders.find((d) => d.slot.id === 'T')!.py);
    const strong = after.declared.strong;
    expect(dd.gapTable(after).find((g) => g.side === strong && g.gap === 'A')!.owners).toContain('T');
  });
  it('adding a tight end adds a gap; a wing adds another', () => {
    expect(dd.readLook(look('gun_2x2_11')).line.right.gaps.map((g) => g.gap)).toEqual(['A', 'B', 'C']);
    expect(dd.readLook(look('uc_singleback_11')).line.right.gaps.map((g) => g.gap)).toEqual(['A', 'B', 'C', 'D']);
    expect(dd.readLook(look('uc_te_wing_12')).line.right.gaps.map((g) => g.gap)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
  it('Over 3 Sky owns every gap against the 2x2, trips and singleback looks; the tight end and wing check covers the extra gap', () => {
    for (const id of ['gun_2x2_11', 'gun_trips_right_11', 'uc_singleback_11', 'uc_te_wing_12']) {
      const r = dd.resolve(dd.OVER_3_SKY, look(id), MID, PRO);
      expect(dd.gapTable(r).filter((g) => g.owners.length === 0), id).toEqual([]);
    }
  });
});

describe('G2.2.3 run fits', () => {
  it('switching a side from box to spill moves the bounce job to the outside defender; spill with no outside defender is an error', () => {
    const r = dd.resolve(dd.OVER_3_SKY, look('uc_singleback_11'), MID, PRO);
    const s = r.declared.strong;
    const spill = dd.fitTable(with_(dd.OVER_3_SKY, { runFits: { ...dd.OVER_3_SKY.runFits, onePuller: { strong: 'spill', weak: 'box' } } }), r, 'power', s);
    expect(spill.rows.some((x) => x.job.kind === 'bounce')).toBe(true);
    const box = dd.fitTable(with_(dd.OVER_3_SKY, { runFits: { ...dd.OVER_3_SKY.runFits, onePuller: { strong: 'box', weak: 'box' } } }), r, 'power', s);
    expect(box.rows.some((x) => x.job.kind === 'bounce')).toBe(false);
    expect(box.rows.some((x) => x.job.kind === 'box')).toBe(true);
    const noOutside = with_(dd.OVER_3_SKY, { slots: dd.OVER_3_SKY.slots.map((x) => (x.id === 'S' ? { ...x, align: { kind: 'lb', gap: 'B', side: 'strong' } as dd.Align } : x.id === 'SS' ? { ...x, align: { kind: 'deep', side: 'middle', depthYd: 10, outsideHashYd: 0 } as dd.Align } : x)) });
    const r2 = dd.resolve(noOutside, look('uc_singleback_11'), MID, PRO);
    expect(dd.fitTable(noOutside, r2, 'power', r2.declared.strong).errors.join()).toMatch(/no defender outside the end man/);
  });
  it('reports a box count and the defenders in run and pass conflict', () => {
    const r = dd.resolve(dd.OVER_3_SKY, look('uc_singleback_11'), MID, PRO);
    expect(dd.boxDefenders(r).length).toBeGreaterThanOrEqual(6);
    expect(dd.conflicts(r).length).toBeGreaterThan(0);
  });
});

describe('G2.3.1 stunts', () => {
  const stunt = dd.NICKEL_1_ROBBER.movement.stunts[0]!;
  it('is named from the firing order, leaves each rusher one final gap, and the looper delay adds one for one to his arrival', () => {
    const r = dd.resolve(dd.NICKEL_1_ROBBER, look('gun_2x2_11'), MID, PRO);
    expect(dd.stuntName(dd.NICKEL_1_ROBBER, stunt)).toBe('TE');
    const a = dd.stuntReport(dd.NICKEL_1_ROBBER, r, stunt);
    expect(Object.keys(a.finalGaps).sort()).toEqual(['K', 'T']);
    const b = dd.stuntReport(dd.NICKEL_1_ROBBER, r, { ...stunt, delayS: stunt.delayS + 0.2 });
    expect(b.looperArrivalS! - a.looperArrivalS!).toBeCloseTo(0.2, 10);
  });
  it('a stunt and a pressure through the same gap is an error', () => {
    const call = with_(dd.NICKEL_1_ROBBER, { slots: dd.NICKEL_1_ROBBER.slots.map((x) => (x.id === 'M' ? { ...x, job: { kind: 'rush', gap: 'B', side: 'strong' } as dd.Job } : x)) });
    const r = dd.resolve(call, look('gun_2x2_11'), MID, PRO);
    expect(dd.stuntReport(call, r, stunt).errors.join()).toMatch(/stunt and pressure/);
  });
});

describe('G2.3.2 pressure', () => {
  it('rushers plus droppers is eleven in every resolved case, and families classify', () => {
    for (const c of dd.DESIGNER_CALLS) for (const l of dd.LOOKS) {
      const p = dd.pressureReport(dd.resolve(c, l, MID, PRO));
      expect(p.rushers.length + p.droppers.length).toBe(11);
    }
    expect(dd.pressureReport(dd.resolve(dd.BASE_0_SIX, look('gun_2x2_11'), MID, PRO)).family).toBe('allOut');
    expect(dd.pressureReport(dd.resolve(dd.NICKEL_FIRE_ZONE, look('gun_2x2_11'), MID, PRO)).family).toBe('zone');
    expect(dd.pressureReport(dd.resolve(dd.OVER_3_SKY, look('gun_2x2_11'), MID, PRO)).family).toBe('four');
  });
  it('a six-man pressure against five blockers and one back shows the free-rusher count by side', () => {
    const p = dd.pressureReport(dd.resolve(dd.BASE_0_SIX, look('gun_empty_3x2_10'), MID, PRO));
    expect(p.freeRushers.left + p.freeRushers.right).toBeGreaterThan(0);
  });
});

describe('G2.4.1 coverage', () => {
  it('man coverage gives each eligible receiver exactly one defender against the 2x2; zone gives every pass defender one zone', () => {
    const r = dd.resolve(dd.NICKEL_1_ROBBER, look('gun_2x2_11'), MID, PRO);
    const c = dd.coverageReport(r);
    expect(c.uncovered).toEqual([]);
    expect(c.doubled).toEqual([]);
    const z = dd.resolve(dd.OVER_3_SKY, look('gun_2x2_11'), MID, PRO);
    expect(z.defenders.filter((d) => d.job.kind === 'zone')).toHaveLength(7);
  });
  it('marks the holes at 1, 2 and 3 seconds', () => {
    const r = dd.resolve(dd.OVER_3_SKY, look('gun_2x2_11'), MID, PRO);
    for (const t of [1, 2, 3]) { const h = dd.holes(r, t, PRO); expect(h.cells.length).toBeGreaterThan(0); expect(h.areas.length).toBeGreaterThan(0); }
    // The deep middle is never a hole in a single-high coverage once the free safety is there.
    expect(dd.holes(r, 2, PRO).areas).not.toContain('deep middle');
  });
});

describe('G2.4.2 match rules', () => {
  it('passes the library quarters rules and finds a planted conflict', () => {
    const r = dd.resolve(dd.NICKEL_QUARTERS, look('gun_2x2_11'), MID, PRO);
    expect(dd.matchConsistency(dd.NICKEL_QUARTERS.coverage.match, r)).toEqual([]);
    const broken = dd.NICKEL_QUARTERS.coverage.match.map((m) => (m.slot === 'SS' ? { ...m, triggers: [{ n: 1, side: 'right' as const, release: 'vertical' as const, job: 'man' as const }], otherwise: 'zone' as const } : m));
    expect(dd.matchConsistency(broken, r).length).toBeGreaterThan(0);
  });
  it('the divider moves with the ball from the near hash to the far hash (off when the rule set has no numbers keys)', () => {
    expect(dd.dividerYd(PRO, MID, 'right')).toBeNull();
    const f = { ...PRO, numbersTopYd: 9, numbersBottomYd: 7 };
    const near = dd.dividerYd(f, { ballYd: f.hashYd, qbArm: 'right' }, 'right')!;
    const far = dd.dividerYd(f, { ballYd: -f.hashYd, qbArm: 'right' }, 'right')!;
    const sideline = f.halfWidthYd;
    expect(sideline - near).toBeCloseTo(7, 10);
    expect(sideline - far).toBeCloseTo(9 + 5, 10);
  });
});

describe('G2.4.3 matchups', () => {
  it('a travel corner aligns over the named receiver wherever he lines up; an absent receiver idles the rule', () => {
    const call = with_(dd.NICKEL_1_ROBBER, { matchups: [{ kind: 'travel', corner: 'RC', target: 'X', priority: 1 }] });
    for (const id of ['gun_2x2_11', 'gun_trips_right_11', 'uc_singleback_11', 'gun_stack_left_11']) {
      const r = dd.resolve(call, look(id), MID, PRO);
      const x = r.reading.eligible.find((p) => p.role === 'X')!;
      const rc = r.defenders.find((d) => d.slot.id === 'RC')!;
      expect(rc.py).toBe(x.py);
      expect(rc.job).toMatchObject({ kind: 'man', target: 'X' });
    }
    const idle = dd.resolve(with_(dd.NICKEL_1_ROBBER, { matchups: [{ kind: 'travel', corner: 'RC', target: 'Q9', priority: 1 }] }), look('gun_2x2_11'), MID, PRO);
    expect(idle.matchupNotes.join()).toMatch(/off the field/);
    expect(dd.travelTimeS(-17, 17)).toBeGreaterThan(0.6);
  });
  it('two brackets needing the same helper: the higher priority wins and the clash is noted', () => {
    const call = with_(dd.NICKEL_QUARTERS, { matchups: [
      { kind: 'bracket', target: 'Z', outside: 'RC', inside: 'SS', dir: 'inOut', priority: 2 },
      { kind: 'bracket', target: 'Y', outside: 'NB', inside: 'SS', dir: 'inOut', priority: 1 },
    ] });
    const r = dd.resolve(call, look('gun_2x2_11'), MID, PRO);
    expect(r.defenders.find((d) => d.slot.id === 'SS')!.job).toMatchObject({ kind: 'bracket', target: 'Z' });
    expect(r.matchupNotes.join()).toMatch(/already used/);
  });
});

describe('G2.5.1 formation checks', () => {
  it('the first check whose looks hold is applied; empty beats trips in priority order', () => {
    expect(dd.resolve(dd.NICKEL_1_ROBBER, look('gun_empty_3x2_10'), MID, PRO).checkApplied?.id).toBe('empty_mike_on_3');
    expect(dd.resolve(dd.NICKEL_1_ROBBER, look('gun_trips_right_11'), MID, PRO).checkApplied?.id).toBe('trips_robber_on_3');
    expect(dd.resolve(dd.NICKEL_1_ROBBER, look('gun_2x2_11'), MID, PRO).checkApplied).toBeNull();
  });
  it('the trips check gives number 3 a defender the base call left open', () => {
    const noChecks = with_(dd.NICKEL_1_ROBBER, { checks: [] });
    expect(dd.coverageReport(dd.resolve(noChecks, look('gun_trips_right_11'), MID, PRO)).uncovered.length).toBeGreaterThan(0);
    expect(dd.coverageReport(dd.resolve(dd.NICKEL_1_ROBBER, look('gun_trips_right_11'), MID, PRO)).uncovered).toEqual([]);
  });
});

describe('G2.5.2 motion', () => {
  it('lock: the man defender follows the motion', () => {
    const o = dd.motionOutcome(dd.NICKEL_1_ROBBER, look('gun_2x2_jet_left_11'), MID, PRO);
    expect(o.answer).toBe('lock');
    expect(o.manAfter['Z']).toEqual(['RC']);
    expect(o.showsOffense).toMatch(/man/);
  });
  it('bump: defenders keep receiver numbers, so assignments shift by one toward the motion', () => {
    const bumpCall = with_(dd.NICKEL_1_ROBBER, { coverage: { ...dd.NICKEL_1_ROBBER.coverage, motion: { normal: 'bump' } } });
    const o = dd.motionOutcome(bumpCall, look('gun_2x2_motion_trips_11'), MID, PRO);
    expect(o.answer).toBe('bump');
    expect(o.manAfter['H']).toBeDefined();
    expect(o.manAfter['H']).not.toContain('W');
  });
  it('a switch with its link forced to fail leaves a receiver uncovered and names him', () => {
    const sw = with_(dd.NICKEL_1_ROBBER, { coverage: { ...dd.NICKEL_1_ROBBER.coverage, motion: { normal: 'switch' } } });
    const o = dd.motionOutcome(sw, look('gun_2x2_motion_trips_11'), MID, PRO, true);
    expect(o.uncovered.length).toBeGreaterThan(0);
  });
  it('a spin started with less than 1.2 s before the snap ends late by the remaining time', () => {
    const spin = with_(dd.OVER_3_SKY, { coverage: { ...dd.OVER_3_SKY.coverage, motion: { normal: 'spin', jet: 'spin' } } });
    const l = look('gun_2x2_jet_left_11');
    const fast = { ...l, motion: { ...l.motion!, timeS: 0.5 } };
    expect(dd.motionOutcome(spin, fast, MID, PRO).lateByS).toBeCloseTo(0.7, 10);
  });
});

describe('G2.5.3 tempo', () => {
  const base = { channel: 'band' as const, checkWithMe: false, defaultTempoCall: 'dd_over_3_sky', lastCall: 'dd_nickel_quarters', intendedCall: 'dd_nickel_1_robber' };
  it('a hurry-up snap with no call relayed runs the default tempo call every time one is set; none set repeats the last call with the penalty', () => {
    for (let s = 0; s < 6; s += 0.5) expect(dd.tempoOutcome({ ...base, snapAfterS: s }).runs).toBe('default');
    const rep = dd.tempoOutcome({ ...base, defaultTempoCall: null, snapAfterS: 1 });
    expect(rep).toMatchObject({ runs: 'repeat', call: 'dd_nickel_quarters', knowledgePenaltyZ: 0.3 });
    expect(dd.tempoOutcome({ ...base, snapAfterS: 10 }).runs).toBe('called');
  });
  it('check-with-me: snap 2 s after setting gets the default, waiting 5 s gets the checked call', () => {
    expect(dd.tempoOutcome({ ...base, snapAfterS: 20, checkWithMe: true, offenseWaitAfterSetS: 2 }).runs).toBe('default');
    expect(dd.tempoOutcome({ ...base, snapAfterS: 20, checkWithMe: true, offenseWaitAfterSetS: 5 }).runs).toBe('called');
  });
});

describe('G2.6.1 disguise', () => {
  it('the robber disguise is reachable; a 15-yard rotation in under a second is flagged', () => {
    expect(dd.disguiseReport(dd.NICKEL_1_ROBBER, look('gun_2x2_11'), MID, PRO).every((r) => r.reachable)).toBe(true);
    const far = with_(dd.NICKEL_1_ROBBER, { disguise: { shell: 'twoHigh', moment: 'snap', positions: { SS: { kind: 'spot', px: 23, py: 0 } } } });
    const row = dd.disguiseReport(far, look('gun_2x2_11'), MID, PRO).find((r) => r.slot === 'SS')!;
    expect(row.travelYd).toBeCloseTo(15, 10);
    expect(row.reachable).toBe(false);
  });
});

describe('G2.7.1 legality and soundness', () => {
  const sky = dd.OVER_3_SKY;
  const planted: [string, dd.DefensiveCall, string][] = [
    ['twelve slots refused', with_(sky, { slots: [...sky.slots, { ...sky.slots[0]!, id: 'X2' }] }), 'slots.over_eleven'],
    ['ten slots warns', with_(sky, { slots: sky.slots.slice(0, 10) }), 'slots.under_eleven'],
    ['neutral zone is a rule failure', with_(sky, { slots: sky.slots.map((s) => (s.id === 'E' ? { ...s, align: { kind: 'spot', px: -0.5, py: 3 } as dd.Align } : s)) }), 'align.neutral_zone'],
    ['duplicate letter refused', with_(sky, { slots: sky.slots.map((s) => (s.id === 'E' ? { ...s, id: 'N' } : s)) }), 'slots.duplicate'],
    ['unowned gap', with_(sky, { slots: sky.slots.map((s) => (s.id === 'M' ? { ...s, align: { kind: 'deep', side: 'middle', depthYd: 15, outsideHashYd: 0 } as dd.Align } : s)) }), 'gap.unowned'],
    ['uncovered receiver', with_(dd.NICKEL_1_ROBBER, { checks: [] }), 'coverage.uncovered'],
    ['match conflict', with_(dd.NICKEL_QUARTERS, { coverage: { ...dd.NICKEL_QUARTERS.coverage, match: dd.NICKEL_QUARTERS.coverage.match.map((m) => ({ ...m, otherwise: 'zone' as const, triggers: m.triggers.filter((t) => t.release !== 'vertical') })) } }), 'match.conflict'],
    ['unreachable disguise', with_(dd.NICKEL_1_ROBBER, { disguise: { shell: 'twoHigh', moment: 'snap', positions: { SS: { kind: 'spot', px: 23, py: 0 } } } }), 'disguise.unreachable'],
    ['pressure with no deep defender', with_(dd.NICKEL_FIRE_ZONE, { movement: { stunts: [], pressure: null }, slots: dd.NICKEL_FIRE_ZONE.slots.map((s) => (s.id === 'FS' ? { ...s, job: { kind: 'zone', area: 'hook', side: 'weak' } as dd.Job } : s.id === 'LC' || s.id === 'RC' ? { ...s, job: { kind: 'zone', area: 'flat', side: s.id === 'LC' ? 'left' : 'right' } as dd.Job } : s)) }), 'pressure.no_deep'],
    ['high teaching load', sky, 'teaching.load_high'],
  ];
  for (const [name, call, code] of planted) {
    it(`reports the planted fault: ${name}`, () => {
      const v = dd.validateCall(call, PRO, { teachingCapacity: code === 'teaching.load_high' ? 5 : null });
      expect(v.findings.map((x) => x.code)).toContain(code);
    });
  }
  it('a rule failure marks the call illegal as drawn and still publishes; only twelve slots is refused', () => {
    const v = dd.validateCall(planted[2]![1], PRO);
    expect(v.status).toBe('illegal_as_drawn');
    expect(v.ruleFailures[0]!.ruleKey).toBe('foul.offside.exists');
    expect(dd.refuseReason(planted[2]![1])).toBeNull();
    expect(dd.refuseReason(planted[0]![1])).toMatch(/eleven/);
  });
});

describe('G2.7.2 board testing', () => {
  it('the auto test plan contains every scouted top formation and the weak-to concepts, and reports assignments, never a win rate', () => {
    const plan = dd.proposePlan(dd.OVER_3_SKY, { scoutedTop: ['gun_2x2_11', 'gun_trips_right_11'], scoutedPlays: STARTER.plays, recentMotions: ['gun_2x2_jet_left_11'] });
    expect(plan.filter((p) => p.why === 'scouted_formation').map((p) => p.lookId)).toEqual(['gun_2x2_11', 'gun_trips_right_11']);
    for (const pair of plan) {
      const res = dd.runPair(dd.OVER_3_SKY, pair, STARTER.plays, MID, PRO);
      expect(Object.keys(res)).not.toContain('winRate');
      expect(Object.keys(res.openAt)).toEqual(['1', '2', '3']);
    }
  });
  it('changing the scout card of one play changes that play only', () => {
    const play = STARTER.plays.find((p) => p.formationId === 'gun_2x2_11' && p.slots.some((s) => (s.path ?? []).length > 0))!;
    const pair = { lookId: 'gun_2x2_11', playId: play.id, why: 'weak_concept' as const };
    const before = dd.runPair(dd.OVER_3_SKY, pair, STARTER.plays, MID, PRO);
    const res = dd.resolve(dd.OVER_3_SKY, dd.LOOK_BY_ID.get('gun_2x2_11')!, MID, PRO);
    const z = dd.LOOK_BY_ID.get('gun_2x2_11')!.players.find((p) => p.role === 'Z')!;
    const dist = (c: { y: number; d: number }): number => (c.y - z.py) * (c.y - z.py) + (c.d - z.px) * (c.d - z.px);
    const hole = [...dd.holes(res, 3, PRO).cells].sort((a, b) => dist(a) - dist(b))[0]!;
    const moved = STARTER.plays.map((p) => (p.id === play.id ? { ...p, slots: p.slots.map((s) => (s.role === 'Z' ? { ...s, path: [{ px: z.px, py: z.py }, { px: hole.d, py: hole.y }] } : s)) } : p));
    const other = STARTER.plays.find((p) => p.id !== play.id && p.formationId === 'gun_2x2_11')!;
    const otherPair = { ...pair, playId: other.id };
    expect(dd.runPair(dd.OVER_3_SKY, otherPair, moved, MID, PRO)).toEqual(dd.runPair(dd.OVER_3_SKY, otherPair, STARTER.plays, MID, PRO));
    expect(dd.runPair(dd.OVER_3_SKY, pair, moved, MID, PRO)).not.toEqual(before);
  });
});

describe('compile to the engine contract (J4)', () => {
  it('every starter call against every look compiles: eleven valid Assignments with no error finding', () => {
    const lang = langModule.createFootballLang();
    for (const c of dd.DESIGNER_CALLS) for (const l of dd.LOOKS) {
      const a = dd.compileCall(dd.resolve(c, l, MID, PRO));
      expect(a).toHaveLength(11);
      for (const x of a) {
        expect(Assignment.safeParse(x).success).toBe(true);
        expect(lang.compile(x).findings.filter((f) => f.severity === 'error'), `${c.id} ${l.id} ${x.role}`).toEqual([]);
      }
    }
  });
});

describe('parameters', () => {
  it('every parameter has a bible leaf and sits inside its range', () => {
    for (const p of dd.PARAMS.params) { expect(p.leaf).toMatch(/^G2\./); expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
  });
});
