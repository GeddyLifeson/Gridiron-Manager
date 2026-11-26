// Acceptance cases of B4.1.2 to B4.3.3, B2.3.1, B2.3.3, B13.2.2 and G1.5.1, run on FIXTURE rule sets
// (see fixtures.ts). Each B-leaf acceptance sentence in scope is a named test.
import { describe, expect, it } from 'vitest';
import {
  analyseAlignment, checkAlignment, checkPreSnapScript, isIllegalAsDrawn, FOUL_OF_CODE, RULE_KEYS, PARAMS,
  type AlignedPlayer, type PreSnapScript,
} from '../../src/legality/index.ts';
import { ParamFile, RuleKeyManifest } from '@gm/schema';
import { BANDS, FREE, FIXTURES, FIXTURE_BANDS, FIXTURE_FREE, MANIFEST_KEYS, P, base, illegalCodes, pl, swap } from './fixtures.ts';

const codes = (players: AlignedPlayer[], rules = BANDS) => illegalCodes(checkAlignment(players, rules, P));
/** A guard who reported eligible lines up in the backfield: six on the line, both ends still eligible. */
const sixOnLine = (): AlignedPlayer[] => swap(base(), 'RG', { px: -2, onLine: false, reported: true });

describe('legality manifest and parameters', () => {
  it('the rule-key manifest and the parameter file are valid, and both fixtures define exactly the manifest keys', () => {
    expect(() => RuleKeyManifest.parse(RULE_KEYS)).not.toThrow();
    expect(() => ParamFile.parse(PARAMS)).not.toThrow();
    for (const p of PARAMS.params) { expect(p.value).toBeGreaterThanOrEqual(p.min); expect(p.value).toBeLessThanOrEqual(p.max); }
    expect(Object.keys(FIXTURE_BANDS).sort()).toEqual([...MANIFEST_KEYS].sort());
    expect(Object.keys(FIXTURE_FREE).sort()).toEqual([...MANIFEST_KEYS].sort());
  });

  it('every finding code that marks a design illegal names a foul', () => {
    const all = new Set<string>();
    const bad = [...base(), pl('E', -3, 30, false, 70, { inMotion: true, velPx: 2 }), pl('S', -0.5, 9, false, 12)];
    for (const r of FIXTURES) for (const f of checkAlignment(bad, r, P, { minPy: -20, maxPy: 20 })) if (isIllegalAsDrawn([f])) all.add(f.code);
    expect(all.size).toBeGreaterThan(3);
    for (const c of all) expect(FOUL_OF_CODE[c]).toBeDefined();
  });

  it('findings are warnings only: the checker never refuses a formation (B4.2, G1.5.1)', () => {
    const six = swap(base(), 'Y', { px: -1, onLine: false });
    const fs = checkAlignment(six, BANDS, P);
    expect(fs.length).toBeGreaterThan(0);
    expect(fs.every((f) => f.severity === 'warning')).toBe(true);
    expect(isIllegalAsDrawn(fs)).toBe(true);
  });
});

describe('B4.1.2 who is on the line', () => {
  it('a tackle whose helmet is 0.5 yd behind the beltline plane is "neither" and triggers B4.2.2', () => {
    const f = swap(base(), 'RT', { px: -0.5, onLine: false });
    const r = analyseAlignment(f, BANDS, P);
    expect(r.status[f.findIndex((p) => p.role === 'RT')]).toBe('neither');
    expect(illegalCodes(r.findings)).toContain('formation.neither_position');
  });
  it('a wide receiver on the ball is on the line', () => {
    const r = analyseAlignment(base(), BANDS, P);
    expect(r.status[base().findIndex((p) => p.role === 'X')]).toBe('on');
  });
});

describe('B4.2.1 seven on the line and eligible ends', () => {
  it('the base set is legal under both fixtures', () => {
    for (const r of FIXTURES) expect(checkAlignment(base(), r, P)).toEqual([]);
  });
  it('six on the line draws illegal formation', () => {
    const fs = checkAlignment(sixOnLine(), BANDS, P);
    expect(illegalCodes(fs)).toEqual(['formation.line_min']);
    expect(fs.find((f) => f.code === 'formation.line_min')).toMatchObject({ ruleKey: 'formation.line_min', foul: 'illegal_formation', leaf: 'B4.2.1' });
  });
  it('a number 72 on the end of the line without reporting draws illegal formation', () => {
    const fs = checkAlignment(swap(base(), 'Y', { jersey: 72 }), BANDS, P);
    expect(illegalCodes(fs)).toEqual(['numbering.eligible_position_needs_number']);
    expect(fs[0]).toMatchObject({ role: 'Y', foul: 'illegal_formation' });
  });
  it('a wide receiver covering the tight end is legal and makes the tight end ineligible', () => {
    const f = swap(base(), 'Z', { px: 0, onLine: true });
    const r = analyseAlignment(f, BANDS, P);
    expect(illegalCodes(r.findings)).toEqual([]);
    const y = f.findIndex((p) => p.role === 'Y');
    expect(r.covered[y]).toBe(true);
    expect(r.eligible[y]).toBe(false);
    expect(r.eligible[f.findIndex((p) => p.role === 'Z')]).toBe(true);
  });
  it('eight on the line with four eligible receivers is legal', () => {
    expect(codes(swap(base(), 'H', { px: 0, onLine: true }))).toEqual([]);
  });
  it('a reported-eligible tackle must line up in an eligible position', () => {
    expect(codes(swap(base(), 'RT', { reported: true }))).toEqual(['numbering.reported_not_eligible_position']);
  });
  it('a player out of bounds is flagged when the sidelines are known', () => {
    const fs = checkAlignment(swap(base(), 'X', { py: 31 }), BANDS, P, { minPy: -23, maxPy: 30 });
    expect(illegalCodes(fs)).toEqual(['formation.out_of_bounds']);
    expect(checkAlignment(swap(base(), 'X', { py: 31 }), BANDS, P)).toEqual([]);
  });
});

describe('B4.2.2 the player neither on nor off the line', () => {
  it('a slot receiver set 0.5 yd off the ball draws illegal formation', () => {
    expect(codes(swap(base(), 'H', { px: -0.5 }))).toEqual(['formation.neither_position']);
  });
  it('a quarterback under center does not', () => {
    const r = analyseAlignment(base(), BANDS, P);
    expect(r.status[9]).toBe('neither');
    expect(r.underCenter).toBe(9);
    expect(r.findings).toEqual([]);
  });
  it('only one player may be in that position', () => {
    expect(codes(swap(base(), 'R', { px: -0.8, py: 0.2 }))).toEqual(['formation.neither_count']);
  });
  it('he must wear an eligible number or have reported', () => {
    expect(codes(swap(base(), 'Q', { jersey: 71 }))).toEqual(['numbering.eligible_position_needs_number']);
    expect(codes(swap(base(), 'Q', { jersey: 71, reported: true }))).toEqual([]);
  });
  it('a direct snap to a back in shotgun involves no player in the "neither" position', () => {
    const r = analyseAlignment(swap(base(), 'Q', { px: -5 }), BANDS, P);
    expect(r.status.includes('neither')).toBe(false);
    expect(r.underCenter).toBe(-1);
    expect(r.findings).toEqual([]);
  });
  it('whether the man under center is eligible by position is read from the rule set', () => {
    expect(analyseAlignment(base(), BANDS, P).eligibleByPosition[9]).toBe(false);
    expect(analyseAlignment(base(), FREE, P).eligibleByPosition[9]).toBe(true);
  });
});

describe('B4.3.3 motion at the snap', () => {
  const jet = (deg: number): AlignedPlayer[] => {
    const speed = 6;
    const rad = (deg * 3.141592653589793) / 180;
    return swap(base(), 'H', { inMotion: true, velPy: -speed * Math.cos(rad), velPx: speed * Math.sin(rad) });
  };
  it('a slot receiver in flat jet motion at the snap is legal', () => {
    expect(codes(jet(0))).toEqual([]);
  });
  it('the same receiver angled 15 degrees toward the line at the snap draws illegal motion', () => {
    const fs = checkAlignment(jet(15), BANDS, P);
    expect(illegalCodes(fs)).toEqual(['formation.motion_toward_line']);
    expect(fs[0]!.foul).toBe('illegal_motion');
  });
  it('motion away from the line is legal', () => {
    expect(codes(jet(-20))).toEqual([]);
  });
  it('two players moving at the snap draws a flag', () => {
    expect(codes(swap(jet(0), 'R', { inMotion: true, velPy: 3, velPx: 0 }))).toEqual(['formation.motion_max_at_snap']);
  });
  it('a lineman may never be the motion man', () => {
    expect(codes(swap(base(), 'X', { inMotion: true, velPy: -4, velPx: 0 }))).toEqual(['formation.motion_from_line']);
  });
  it('a drift under the stationary threshold is not motion; over it is, flag or no flag', () => {
    expect(codes(swap(base(), 'R', { velPy: 0.2, velPx: 0 }))).toEqual([]);
    expect(codes(swap(swap(base(), 'R', { velPy: 2, velPx: 0 }), 'H', { velPy: 2, velPx: 0 }))).toEqual(['formation.motion_max_at_snap']);
  });
  it('the player under center may not be moving at the snap', () => {
    expect(codes(swap(base(), 'Q', { inMotion: true, velPy: 3, velPx: 0 }))).toEqual(['formation.motion_under_center']);
  });
  it('a rule set that allows motion toward the line does not flag it', () => {
    const open = { ...BANDS, opt: (k: string) => (k === 'formation.motion_rule' ? 'any_direction' : BANDS.opt(k)) };
    expect(illegalCodes(checkAlignment(jet(15), open, P))).toEqual([]);
  });
});

describe('B2.3.1 eleven players', () => {
  it('twelve at the snap is flagged; ten is legal and noted', () => {
    const twelve = [...base(), pl('T2', 0, -1.75, true, 71)];
    const fs = checkAlignment(twelve, BANDS, P);
    expect(illegalCodes(fs)).toEqual(['formation.too_many_players']);
    expect(fs[0]).toMatchObject({ ruleKey: 'substitution.max_players' });
    const ten = checkAlignment(base().filter((p) => p.role !== 'R'), BANDS, P);
    expect(ten.map((f) => f.code)).toEqual(['formation.fewer_players']);
    expect(isIllegalAsDrawn(ten)).toBe(false);
  });
});

describe('B2.3.3 reporting eligible', () => {
  it('a number 71 aligned as the end man on the line without reporting draws the foul; after reporting he is eligible', () => {
    const f = swap(base(), 'Y', { jersey: 71 });
    expect(codes(f)).toEqual(['numbering.eligible_position_needs_number']);
    const reported = swap(f, 'Y', { reported: true });
    const r = analyseAlignment(reported, BANDS, P);
    expect(r.findings).toEqual([]);
    expect(r.eligible[reported.findIndex((p) => p.role === 'Y')]).toBe(true);
  });
  it('a report means nothing where the rule set does not allow reporting', () => {
    const f = swap(base(), 'Y', { jersey: 71, reported: true });
    const r = analyseAlignment(f, FREE, P);
    expect(r.eligible[f.findIndex((p) => p.role === 'Y')]).toBe(false);
  });
});

describe('B13.2.2 numbered linemen and backs (second fixture)', () => {
  it('a formation with four linemen numbered in the ineligible band is flagged', () => {
    const fs = checkAlignment(swap(base(), 'RT', { jersey: 85 }), FREE, P);
    expect(illegalCodes(fs)).toEqual(['formation.numbered_linemen_min']);
  });
  it('more backs than the rule set allows is flagged; the same set is legal where there is no such limit', () => {
    const fiveBacks = swap(base(), 'X', { px: -1, onLine: false });
    expect(codes(fiveBacks, FREE)).toEqual(['formation.backfield_max']);
    const noLimit = { ...FREE, num: (k: string) => (k === 'formation.backfield_max' ? 0 : FREE.num(k)) };
    expect(codes(fiveBacks, noLimit)).toEqual([]);
  });
  it('an ineligible number on the end is legal there and is not an eligible receiver', () => {
    const f = swap(base(), 'Y', { jersey: 72 });
    const r = analyseAlignment(f, FREE, P);
    expect(r.findings).toEqual([]);
    expect(r.eligible[f.findIndex((p) => p.role === 'Y')]).toBe(false);
  });
});

describe('B4.3.1 and B4.3.2 scripted shifts and motion', () => {
  const script = (more: Partial<PreSnapScript>): PreSnapScript => ({ start: base(), startSetS: 2, steps: [], ...more });
  const seqCodes = (s: PreSnapScript, rules = BANDS) => illegalCodes(checkPreSnapScript(s, rules, P));
  const trade = { kind: 'shift' as const, moves: [{ role: 'Z', px: -1, py: 16, onLine: false }, { role: 'H', px: -1, py: -8, onLine: false }] };

  it('a snap 0.8 s after the last player stops draws illegal shift; 1.0 s draws nothing', () => {
    expect(seqCodes(script({ steps: [{ ...trade, setAfterS: 0.8 }] }))).toEqual(['formation.shift_set_seconds']);
    expect(seqCodes(script({ steps: [{ ...trade, setAfterS: 1.0 }] }))).toEqual([]);
    expect(seqCodes(script({ startSetS: 0.8 }))).toEqual(['formation.shift_set_seconds']);
  });
  it('two receivers trading sides at once is a shift and resets the count', () => {
    const fs = checkPreSnapScript(script({ steps: [{ ...trade, setAfterS: 0.5 }] }), BANDS, P);
    expect(fs.map((f) => [f.code, f.foul])).toEqual([['formation.shift_set_seconds', 'illegal_shift']]);
  });
  it('one back motioning, stopping, then a second back motioning needs no new set', () => {
    const s = script({ steps: [
      { kind: 'motion', move: { role: 'R', px: -7, py: 4, onLine: false }, stops: true, setAfterS: 0.1 },
      { kind: 'motion', move: { role: 'H', px: -1, py: 3, onLine: false }, stops: false, setAfterS: 0, velPx: 0, velPy: -5 },
    ] });
    expect(seqCodes(s)).toEqual([]);
  });
  it('two backs moving at once with a snap 0.5 s after they stop draws illegal shift', () => {
    const s = script({ steps: [{ kind: 'shift', moves: [{ role: 'R', px: -7, py: 4, onLine: false }, { role: 'H', px: -1, py: 3, onLine: false }], setAfterS: 0.5 }] });
    expect(seqCodes(s)).toEqual(['formation.shift_set_seconds']);
  });
  it('a second man starting before the first has stopped is another shift and both moving at the snap is flagged', () => {
    const s = script({ steps: [
      { kind: 'motion', move: { role: 'R', px: -7, py: 4, onLine: false }, stops: false, setAfterS: 0, velPx: 0, velPy: 4 },
      { kind: 'motion', move: { role: 'H', px: -1, py: 3, onLine: false }, stops: false, setAfterS: 0, velPx: 0, velPy: -5 },
    ] });
    expect(seqCodes(s)).toEqual(['formation.motion_max_at_snap', 'formation.shift_set_seconds']);
  });
  it('motion that starts before the set is complete is a shift', () => {
    const s = script({ startSetS: 0.4, steps: [{ kind: 'motion', move: { role: 'R', px: -7, py: 4, onLine: false }, stops: true, setAfterS: 0.3 }] });
    expect(seqCodes(s)).toEqual(['formation.shift_set_seconds']);
    expect(seqCodes({ ...s, steps: [{ kind: 'motion', move: { role: 'R', px: -7, py: 4, onLine: false }, stops: true, setAfterS: 1 }] })).toEqual([]);
  });
  it('the formation before and after every shift must be legal (G1.5.1 check 8)', () => {
    const illegalStart = script({ start: swap(base(), 'H', { px: -0.5 }), steps: [{ kind: 'shift', moves: [{ role: 'Z', px: -1, py: -12, onLine: false }, { role: 'H', px: -1, py: 6, onLine: false }], setAfterS: 1 }] });
    const fs = checkPreSnapScript(illegalStart, BANDS, P);
    expect(fs.map((f) => [f.code, f.step])).toEqual([['formation.neither_position', -1]]);
    const illegalAfter = script({ steps: [{ kind: 'shift', moves: [{ role: 'Z', px: -1, py: -12, onLine: false }, { role: 'H', px: -0.5, py: 6, onLine: false }], setAfterS: 1 }] });
    expect(checkPreSnapScript(illegalAfter, BANDS, P).map((f) => [f.code, f.step])).toEqual([['formation.neither_position', 0], ['formation.neither_position', null]]);
  });
  it('an end who leaves the line and is still moving at the snap is illegal motion (B4.3.3 items 1 and 3)', () => {
    const s = script({ steps: [{ kind: 'motion', move: { role: 'Y', px: -1.5, py: 3, onLine: false }, stops: false, setAfterS: 0, velPx: 0, velPy: 5 }] });
    const fs = checkPreSnapScript(s, BANDS, P);
    expect(illegalCodes(fs)).toContain('formation.motion_from_line');
  });
  it('the player under center who goes in motion must stop a full second before the snap or before a second motion', () => {
    const q = { role: 'Q', px: -5, py: 2, onLine: false };
    expect(seqCodes(script({ steps: [{ kind: 'motion', move: q, stops: true, setAfterS: 0.4 }] }))).toEqual(['formation.motion_under_center']);
    expect(seqCodes(script({ steps: [{ kind: 'motion', move: q, stops: true, setAfterS: 1 }] }))).toEqual([]);
    const second = { kind: 'motion' as const, move: { role: 'R', px: -7, py: 4, onLine: false }, stops: true, setAfterS: 1 };
    expect(seqCodes(script({ steps: [{ kind: 'motion', move: q, stops: true, setAfterS: 0.4 }, second] }))).toEqual(['formation.shift_under_center']);
    expect(seqCodes(script({ steps: [{ kind: 'motion', move: q, stops: true, setAfterS: 1 }, second] }))).toEqual([]);
  });
  it('the set period is read from the rule set', () => {
    const longer = { ...BANDS, num: (k: string) => (k === 'formation.shift_set_seconds' ? 2 : BANDS.num(k)) };
    expect(seqCodes(script({ steps: [{ ...trade, setAfterS: 1.5 }] }), longer)).toEqual(['formation.shift_set_seconds']);
  });
});

describe('G1.5.1 test set: 20 legal and 20 illegal formations, each with its known reason', () => {
  const legal: [string, AlignedPlayer[]][] = [
    ['base under center', base()],
    ['shotgun', swap(base(), 'Q', { px: -5 })],
    ['pistol', swap(swap(base(), 'Q', { px: -4 }), 'R', { px: -7 })],
    ['eight on the line', swap(base(), 'H', { px: 0, onLine: true })],
    ['covered tight end', swap(base(), 'Z', { px: 0, onLine: true })],
    ['empty backfield', swap(base(), 'R', { px: -1, py: -9 })],
    ['trips left', swap(base(), 'Z', { py: 12 })],
    ['bunch right', swap(swap(base(), 'H', { py: -4 }), 'Z', { py: -5.5 })],
    ['unbalanced line', swap(swap(base(), 'Y', { py: 2.1 }), 'X', { py: -18 })],
    ['tight end off the line as a wing', swap(swap(base(), 'Y', { px: -1, onLine: false }), 'Z', { px: 0, onLine: true })],
    ['reported tackle at tight end', swap(base(), 'Y', { jersey: 71, reported: true })],
    ['reported tackle in the backfield', swap(base(), 'R', { jersey: 74, reported: true })],
    ['jet motion flat', swap(base(), 'H', { inMotion: true, velPx: 0, velPy: -6 })],
    ['orbit motion backward', swap(base(), 'Z', { inMotion: true, velPx: -2, velPy: 5 })],
    ['back in motion out of the backfield', swap(base(), 'R', { inMotion: true, velPx: 0.2, velPy: 5 })],
    ['i formation', [...swap(base(), 'H', { px: -4.5, py: 0 })]],
    ['two tight ends', swap(base(), 'X', { py: 2.1, jersey: 85 })],
    ['quarterback one yard back', swap(base(), 'Q', { px: -1 })],
    ['ten players', base().filter((p) => p.role !== 'H')],
    ['nine on the line', swap(swap(base(), 'H', { px: 0, onLine: true }), 'Z', { px: 0, onLine: true })],
  ];
  const illegal: [string, AlignedPlayer[], string][] = [
    ['six on the line', sixOnLine(), 'formation.line_min'],
    ['five on the line', swap(sixOnLine(), 'LG', { px: -2, onLine: false, reported: true }), 'formation.line_min'],
    ['tackle number on the end', swap(base(), 'Y', { jersey: 72 }), 'numbering.eligible_position_needs_number'],
    ['guard number split wide', swap(base(), 'X', { jersey: 64 }), 'numbering.eligible_position_needs_number'],
    ['lineman number at running back', swap(base(), 'R', { jersey: 74 }), 'numbering.eligible_position_needs_number'],
    ['lineman number under center', swap(base(), 'Q', { jersey: 55 }), 'numbering.eligible_position_needs_number'],
    ['slot neither on nor off', swap(base(), 'H', { px: -0.5 }), 'formation.neither_position'],
    ['flanker neither on nor off', swap(base(), 'Z', { px: -0.3 }), 'formation.neither_position'],
    ['back creeping up to the line', swap(base(), 'R', { px: -0.4, py: 5 }), 'formation.neither_position'],
    ['two men behind the snapper', swap(base(), 'R', { px: -0.8, py: 0.2 }), 'formation.neither_count'],
    ['twelve players', [...base(), pl('T2', 0, -1.75, true, 71)], 'formation.too_many_players'],
    ['thirteen players', [...base(), pl('T2', 0, -1.75, true, 71), pl('T3', 0, 1.75, true, 73)], 'formation.too_many_players'],
    ['two in motion', swap(swap(base(), 'H', { inMotion: true }), 'R', { inMotion: true }), 'formation.motion_max_at_snap'],
    ['three in motion', swap(swap(swap(base(), 'H', { inMotion: true }), 'R', { inMotion: true }), 'Z', { inMotion: true }), 'formation.motion_max_at_snap'],
    ['motion toward the line', swap(base(), 'H', { inMotion: true, velPx: 1.5, velPy: -5 }), 'formation.motion_toward_line'],
    ['back running downhill at the snap', swap(base(), 'R', { inMotion: true, velPx: 4, velPy: 0 }), 'formation.motion_toward_line'],
    ['split end in motion', swap(base(), 'X', { inMotion: true, velPx: 0, velPy: -5 }), 'formation.motion_from_line'],
    ['tight end in motion', swap(base(), 'Y', { inMotion: true, velPx: 0, velPy: 4 }), 'formation.motion_from_line'],
    ['quarterback moving at the snap', swap(base(), 'Q', { inMotion: true, velPx: 0, velPy: 3 }), 'formation.motion_under_center'],
    ['reported tackle left at tackle', swap(base(), 'LT', { reported: true }), 'numbering.reported_not_eligible_position'],
  ];
  it('holds 20 of each', () => { expect(legal.length).toBe(20); expect(illegal.length).toBe(20); });
  for (const [name, f] of legal) it(`legal: ${name}`, () => { expect(codes(f)).toEqual([]); });
  for (const [name, f, code] of illegal) {
    it(`illegal: ${name} -> ${code}`, () => {
      const fs = checkAlignment(f, BANDS, P);
      expect(illegalCodes(fs)).toEqual([code]);
      // Saved anyway after one confirmation: nothing here is an error, so nothing blocks the save (G1.5.1).
      expect(fs.every((x) => x.severity === 'warning')).toBe(true);
    });
  }
});
