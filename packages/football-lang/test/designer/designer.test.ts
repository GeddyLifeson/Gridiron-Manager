// G-90 play designer model (G1, O3.1, O3.7). Rule values here are FIXTURES, not rule data (see
// test/legality/fixtures.ts); the real-value cases run on the integrated rule sets.
import { describe, expect, it } from 'vitest';
import { designer as D } from '../../src/designer-entry.ts';
import { PARAMS as LEGALITY_PARAMS, paramTableOf } from '../../src/legality/index.ts';
import { fixtureRuleSet, FIXTURE_BANDS } from '../legality/fixtures.ts';

const rules = fixtureRuleSet('designer-fixture', { ...FIXTURE_BANDS, 'field.hash_from_sideline_ft': 70.75, 'pass.ineligible_downfield_limit_yd': 1, 'field.numbers_from_sideline_yd': 12, 'pass.offensive_pi_contact_beyond_yd': 1 });
const params = paramTableOf([LEGALITY_PARAMS, D.PARAMS]);
const ctx = { rules, params };
const base = () => D.newDraft('p1', '11', 'user', 'S1W1');
const pt = (d: number, l: number, kind: 'through' | 'cut' | 'settle' = 'through') => ({ at: [d, l] as const, kind, landmark: null });
const route = (path: ReturnType<typeof pt>[], params: Record<string, string | number | boolean> = {}) => ({ ...D.EMPTY_ASSIGNMENT, behavior: 'route', path, params });
const codes = (ms: readonly D.DesignMessage[], level?: D.MessageLevel) => ms.filter((m) => !level || m.level === level).map((m) => m.code);
const edit = (d: D.PlayDraft, ...es: D.PlayEdit[]) => es.reduce(D.applyEdit, d);

describe('slots (G1.1.2)', () => {
  it('offers exactly eleven distinct slots for every personnel group that eleven players can fill', () => {
    for (let b = 0; b <= 5; b++) for (let t = 0; t <= 5; t++) {
      const s = D.slotsForPersonnel(`${b}${t}`);
      if (b + t > 5) { expect(s).toBeNull(); continue; }
      expect(s).toHaveLength(11);
      expect(new Set(s).size).toBe(11);
    }
    expect(D.slotsForPersonnel('11')).toEqual(['Q', 'LT', 'LG', 'C', 'RG', 'RT', 'R', 'Y', 'X', 'Z', 'H']);
  });
  it('a fresh draft is a legal picture for every personnel group: nothing refused or illegal', () => {
    for (let b = 0; b <= 5; b++) for (let t = 0; b + t <= 5; t++) {
      const ms = D.validateDraft(D.newDraft('p', `${b}${t}`, 'user', 'S1W1'), ctx);
      expect(codes(ms, 'refused'), `${b}${t}`).toEqual([]);
      expect(codes(ms, 'illegal'), `${b}${t}`).toEqual([]);
    }
  });
});

describe('edits: every G1.1.1 field is editable (O3.1.1 acceptance 1)', () => {
  const edits: D.PlayEdit[] = [
    { type: 'set_name', name: { formation: 'Trips', strength: 'Right', motion: '', protection: '', concept: 'Stick', tags: ['Alert'] } },
    { type: 'set_kind', kind: 'quick_pass' },
    { type: 'set_personnel', personnel: '12' },
    { type: 'apply_formation', formation: { id: 'f.trips', personnel: '11', shotgun: true, players: [{ role: 'X', at: [0, -14], onLine: true }] } },
    { type: 'set_strength', strength: 'left' },
    { type: 'move_slot', role: 'Z', at: [-1, 9], onLine: false },
    { type: 'set_stance', role: 'R', stance: 'pistol' },
    { type: 'set_letter', role: 'H', letter: 'S' },
    { type: 'set_flags', role: 'Y', reportsEligible: true, extraTackle: false },
    { type: 'set_assignment', role: 'X', assignment: route([pt(5, -14, 'cut'), pt(8, -10)]) },
    { type: 'set_path', role: 'Z', behavior: 'route', path: [pt(6, 9, 'cut'), pt(6, 4, 'settle')] },
    { type: 'set_params', role: 'Z', params: { purpose: 'pick' } },
    { type: 'set_rules', role: 'H', rules: [{ when: { op: 'test', name: 'coverage_is', args: { family: 'cover2' } }, guard: null, then: [{ name: 'settle', args: {} }], text: 'sit down against two deep' }] },
    { type: 'insert_presnap', index: 0, step: { kind: 'motion', role: 'H', path: [pt(-1, 2)], onLine: false, stops: true, setAfterS: 1, speed: null } },
    { type: 'replace_presnap', index: 0, step: { kind: 'motion', role: 'H', path: [pt(-1, 3)], onLine: false, stops: true, setAfterS: 1, speed: null } },
    { type: 'set_qb', qb: { action: 'drop', dropSteps: 5, readType: 'progression', progression: [{ role: 'X', eyesAtS: 1.2 }], hot: [{ role: 'H', trigger: 'blitz_inside' }], throwAway: 'out_of_bounds' } },
    { type: 'set_protection', protection: { id: 'prot.half_slide', redirects: ['mike_left'] } },
    { type: 'set_run_direction', runDirection: 'right' },
    { type: 'set_shotgun', shotgun: false },
    { type: 'set_tags_allowed', tags: ['Alert', 'Smash'] },
    { type: 'set_intent', role: 'shot', beats: ['cover3'], checkOutOf: ['cover0'] },
    { type: 'set_coaching_point', role: 'X', text: 'win the release' },
    { type: 'set_status', status: 'installed' },
    { type: 'dismiss_warning', code: 'spacing.same_spot', role: null, reason: 'rub on purpose' },
    { type: 'set_notes', notes: 'first install week' },
    { type: 'remove_presnap', index: 0 },
    { type: 'restore_warning', code: 'spacing.same_spot', role: null },
    { type: 'mirror' },
  ];
  it('each edit changes the draft and the result serialises', () => {
    let d = base();
    for (const e of edits) {
      const next = D.applyEdit(d, e);
      expect(D.canonical(next), e.type).not.toBe(D.canonical(d));
      d = next;
    }
  });
  it('rejects edits that name a missing slot or step, and a dismissal with no reason', () => {
    expect(() => D.applyEdit(base(), { type: 'move_slot', role: 'Nope', at: [0, 0], onLine: true })).toThrow(D.DesignError);
    expect(() => D.applyEdit(base(), { type: 'remove_presnap', index: 0 })).toThrow(D.DesignError);
    expect(() => D.applyEdit(base(), { type: 'dismiss_warning', code: 'x', role: null, reason: ' ' })).toThrow(D.DesignError);
  });
  it('mirroring twice returns the original byte for byte (G1.1.1 acceptance 3)', () => {
    const d = edit(base(), ...edits.slice(0, 22));
    const once = D.mirrorDraft(d);
    expect(D.canonical(once)).not.toBe(D.canonical(d));
    expect(once.formation.strength).toBe(d.formation.strength === 'left' ? 'right' : 'left');
    expect(once.runDirection).toBe('left');
    expect(D.canonical(D.mirrorDraft(once))).toBe(D.canonical(d));
  });
});

describe('validator (G1.5, O3.1.3)', () => {
  it('a missing or duplicate slot is the only thing refused', () => {
    const d = base();
    const dup = { ...d, slots: [...d.slots.slice(0, 10), { ...d.slots[0]! }] };
    const ms = D.validateDraft(dup, ctx);
    expect(codes(ms, 'refused')).toEqual(expect.arrayContaining(['structure.missing_slot', 'structure.duplicate_slot']));
    expect(D.publishDraft(dup, ms, { confirmIllegal: true, previous: null }).kind).toBe('refused');
  });
  it('fewer than seven on the line is illegal, publishes after one confirmation marked illegal as drawn', () => {
    const d = edit(base(), { type: 'move_slot', role: 'X', at: [-1, -12], onLine: false });
    const ms = D.validateDraft(d, ctx);
    const ill = ms.filter((m) => m.level === 'illegal');
    expect(ill.map((m) => m.code)).toContain('formation.line_min');
    expect(ill.find((m) => m.code === 'formation.line_min')!.foul).toBe('illegal_formation');
    expect(D.publishDraft(d, ms, { confirmIllegal: false, previous: null }).kind).toBe('needs_confirmation');
    const r = D.publishDraft(d, ms, { confirmIllegal: true, previous: null });
    expect(r.kind).toBe('published');
    if (r.kind !== 'published') return;
    expect(r.illegalAsDrawn).toBe(true);
    expect(r.play.status).toBe('draft');
    expect(r.play.ruleFailures.map((f) => f.ruleId)).toContain('formation.line_min');
    expect(r.play.version).toBe(1);
  });
  it('a legal play publishes as valid with no failures', () => {
    const r = D.publishDraft(base(), D.validateDraft(base(), ctx), { confirmIllegal: false, previous: null });
    expect(r.kind === 'published' && r.play.status === 'valid' && r.play.ruleFailures.length === 0).toBe(true);
  });
  it('two players moving at the snap is illegal motion', () => {
    const d = edit(base(),
      { type: 'insert_presnap', index: 0, step: { kind: 'motion', role: 'Z', path: [pt(-1, 4)], onLine: false, stops: false, setAfterS: 0, speed: [0, -5] } },
      { type: 'insert_presnap', index: 1, step: { kind: 'motion', role: 'R', path: [pt(-5, 3)], onLine: false, stops: false, setAfterS: 0, speed: [0, 5] } });
    expect(codes(D.validateDraft(d, ctx), 'illegal').some((c) => c.startsWith('formation.motion') || c.startsWith('formation.shift'))).toBe(true);
  });
  it('a route for an interior lineman is illegal; a screen release behind the line is not (G1.5.2)', () => {
    const d = edit(base(), { type: 'set_assignment', role: 'LG', assignment: route([pt(6, -2)]) });
    expect(codes(D.validateDraft(d, ctx), 'illegal')).toContain('eligibility.route_to_ineligible');
    const s = edit(base(), { type: 'set_kind', kind: 'screen' }, { type: 'set_assignment', role: 'LG', assignment: route([pt(0, -6)]) });
    expect(codes(D.validateDraft(s, ctx), 'illegal')).not.toContain('eligibility.route_to_ineligible');
  });
  it('a covered end with a route is flagged; a reporting player gets the must-report note every time', () => {
    // Slot 7 (Y) is on the line at lateral 6; put Z on the line outside him so Y is covered.
    const d = edit(base(), { type: 'move_slot', role: 'Z', at: [0, 12], onLine: true }, { type: 'set_assignment', role: 'Y', assignment: route([pt(8, 6)]) });
    expect(codes(D.validateDraft(d, ctx), 'illegal')).toContain('eligibility.covered_route');
    const r = edit(base(), { type: 'set_flags', role: 'Y', reportsEligible: true, extraTackle: false });
    expect(codes(D.validateDraft(r, ctx), 'note')).toContain('eligibility.must_report');
  });
  it('spacing fires on two finishes at one spot, is silent for a marked pick, and can be dismissed with a reason', () => {
    const d = edit(base(),
      { type: 'set_assignment', role: 'X', assignment: route([pt(6, -12, 'cut'), pt(6, -6)]) },
      { type: 'set_assignment', role: 'H', assignment: route([pt(6, -8, 'cut'), pt(6, -5)]) });
    expect(codes(D.validateDraft(d, ctx), 'unsound')).toContain('spacing.same_spot');
    const pick = D.applyEdit(d, { type: 'set_params', role: 'H', params: { purpose: 'pick' } });
    expect(codes(D.validateDraft(pick, ctx), 'unsound')).not.toContain('spacing.same_spot');
    const dis = D.applyEdit(d, { type: 'dismiss_warning', code: 'spacing.same_spot', role: null, reason: 'rub' });
    expect(D.validateDraft(dis, ctx).find((m) => m.code === 'spacing.same_spot')!.dismissed).toBe(true);
  });
  it('protection: more rushers than protectors with no hot fires; a hot answers it; a long drop behind five fires', () => {
    let d = base();
    for (const r of ['LT', 'LG', 'C', 'RG', 'RT']) d = D.applyEdit(d, { type: 'set_path', role: r, behavior: 'pass_block', path: [] });
    const looks = [{ id: 'cover0_six', rushers: 6, box: 7 }];
    expect(codes(D.validateDraft(d, { ...ctx, looks }), 'unsound')).toContain('protection.unblocked');
    const hot = D.applyEdit(d, { type: 'set_qb', qb: { ...d.qb, hot: [{ role: 'H', trigger: 'six_man_pressure' }] } });
    expect(codes(D.validateDraft(hot, { ...ctx, looks }), 'unsound')).not.toContain('protection.unblocked');
    const long = D.applyEdit(d, { type: 'set_qb', qb: { ...d.qb, dropSteps: 7 } });
    expect(codes(D.validateDraft(long, ctx), 'unsound')).toContain('protection.long_drop');
  });
  it('run count fires with too many in the box and stays silent with motion', () => {
    let d = D.applyEdit(base(), { type: 'set_kind', kind: 'run' });
    for (const r of ['LT', 'LG', 'C', 'RG', 'RT']) d = D.applyEdit(d, { type: 'set_path', role: r, behavior: 'run_block', path: [] });
    const looks = [{ id: 'eight_man_front', rushers: 4, box: 8 }];
    expect(codes(D.validateDraft(d, { ...ctx, looks }), 'unsound')).toContain('run.count');
    const m = D.applyEdit(d, { type: 'insert_presnap', index: 0, step: { kind: 'motion', role: 'Z', path: [pt(-1, 3)], onLine: false, stops: true, setAfterS: 1, speed: null } });
    expect(codes(D.validateDraft(m, { ...ctx, looks }), 'unsound')).not.toContain('run.count');
  });
  it('timing, tell, personnel fit and RPO lineman each fire on a bad example', () => {
    const t = edit(base(), { type: 'set_assignment', role: 'X', assignment: route([pt(12, -12, 'cut'), pt(14, -6)]) },
      { type: 'set_qb', qb: { ...base().qb, progression: [{ role: 'X', eyesAtS: 0.6 }] } });
    expect(codes(D.validateDraft(t, ctx), 'unsound')).toContain('timing.break_vs_eyes');
    expect(codes(D.validateDraft(base(), { ...ctx, formationKinds: ['dropback_pass', 'dropback_pass'] }), 'unsound')).toContain('tell.formation');
    expect(codes(D.validateDraft(base(), { ...ctx, formationKinds: ['run', 'dropback_pass'] }), 'unsound')).not.toContain('tell.formation');
    expect(codes(D.validateDraft(base(), { ...ctx, fitGap: { Y: 0.8 } }), 'unsound')).toContain('fit.personnel');
    const rpo = edit(base(), { type: 'set_kind', kind: 'rpo' }, { type: 'set_path', role: 'LG', behavior: 'run_block', path: [pt(3, -2)] });
    expect(codes(D.validateDraft(rpo, ctx), 'unsound')).toContain('foul_risk.rpo_lineman');
  });
  it('a sound library-style play raises no unsound message', () => {
    const d = edit(base(), { type: 'set_assignment', role: 'X', assignment: route([pt(5, -12, 'cut'), pt(5, -15)]) },
      { type: 'set_assignment', role: 'Z', assignment: route([pt(12, 12)]) },
      { type: 'set_qb', qb: { ...base().qb, progression: [{ role: 'X', eyesAtS: 5 / 7 }] } });
    expect(codes(D.validateDraft(d, ctx), 'unsound')).toEqual([]);
  });
});

describe('drawing (O3.1.2)', () => {
  const l = D.landmarksOf(rules, 160 / 3);
  it('snaps to football positions and Alt keeps the raw spot', () => {
    expect(D.snapAlignment([-0.2, 6.3], params)).toEqual({ at: [0, 6.5], onLine: true });
    expect(D.snapAlignment([-4.6, -0.1], params)).toEqual({ at: [-5, 0], onLine: false });
    expect(D.snapAlignment([-4.6, 6.3], params, true).at).toEqual([-4.6, 6.3]);
  });
  it('reads alignment in coaching terms from the stored values', () => {
    const slots = base().slots;
    expect(D.alignmentReadout([0, 6], true, slots, l, 'middle')).toBe('2 outside the right tackle, on the line');
    const sl = D.sidelines(l, 'middle');
    expect(D.alignmentReadout([0, sl.right - 12 + 2], true, slots, l, 'middle')).toBe('plus 2 outside the numbers, on the line');
    expect(D.alignmentReadout([-5, 0], false, slots, l, 'middle')).toBe('over the ball, 5 deep');
    // Readout is a pure function of stored values: 50 sampled drags read the same from the stored spot.
    for (let i = 0; i < 50; i++) {
      const s = D.snapAlignment([-(i % 7) * 0.9, (i * 1.37) % 25 - 12], params);
      expect(D.alignmentReadout(s.at, s.onLine, slots, l, 'left')).toBe(D.alignmentReadout([s.at[0], s.at[1]], s.onLine, slots, l, 'left'));
    }
  });
  it('snaps a stem to whole yards and standard breaks, and names a route from the tree', () => {
    const from = [0, 10] as const;
    const drawn = D.snapPath(from, [pt(5.3, 10.4), pt(8.1, 7.2)], params);
    expect(drawn.map((p) => p.at)).toEqual([[5, 10], [8, 7]]);
    const tree = [{ name: 'slant', points: [[5, 0], [8, -3]] as const }, { name: 'go', points: [[20, 0]] as const }];
    expect(D.recognizeRoute(from, drawn, tree, params)).toBe('slant');
    // The same shape on the left side reads the same (inside is toward the ball).
    expect(D.recognizeRoute([0, -10], drawn.map((p) => ({ ...p, at: [p.at[0], -p.at[1]] as const })), tree, params)).toBe('slant');
  });
});

describe('to the engine (G1.1.1 -> J4.1.1)', () => {
  it('negates lateral into the play frame and hashes only what the engine runs', () => {
    const d = D.applyEdit(base(), { type: 'set_assignment', role: 'X', assignment: route([pt(5, -12, 'cut')]) });
    const a = D.toAssignments(d);
    expect(a).toHaveLength(11);
    const x = a.find((s) => s.role === 'X')!;
    expect(x.preSnap.align.py).toBe(12);
    expect(x.behavior.path[0]!.py).toBe(12);
    const call = D.toOffenseCall(d, (r) => 100 + d.slots.findIndex((s) => s.role === r));
    expect(call.players.map((p) => p.role)).toEqual(d.slots.map((s) => s.role));
    expect(call.contentHash).toBe(D.draftContentHash(D.applyEdit(d, { type: 'set_notes', notes: 'changed' })));
    expect(call.contentHash).not.toBe(D.draftContentHash(D.applyEdit(d, { type: 'move_slot', role: 'X', at: [0, -13], onLine: true })));
  });
  it('publishing a changed installed play names the new teaching (O3.7.1)', () => {
    const installed = { ...base(), status: 'installed' as const, version: 1 };
    const next = D.applyEdit(installed, { type: 'set_assignment', role: 'Z', assignment: route([pt(10, 12)]) });
    const r = D.publishDraft(next, D.validateDraft(next, ctx), { confirmIllegal: false, previous: installed });
    expect(r.kind === 'published' && r.newTeaching).toEqual(['Z']);
  });
});
