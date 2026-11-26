// Defensive call designer read model (G-91, O3.2.1). The designer core is injected (CR-G91-1), so these
// tests bind a small hand-built core and check what the model itself adds: gap flags (zero or two names),
// run-to and run-away duties by the defender's side, finding order (shown look, call-wide, other looks;
// refusals first), the checks table per look, selection, the hours strip, and the unknown-look error.
// The real core is bound by the screen fixtures (app-ui test/screens/defense-designer/views.json).
import { describe, it, expect } from 'vitest';
import { defenseDesignerView, RUN_FAMILY_IDS, type DefenseDesignerCore, type PortCall, type PortLook, type PortResolution, type PortDefender } from '../../../src/read-models/defense-designer/index.ts';

const P = (role: string, px: number, py: number, onLine = true, eligible = false) => ({ role, px, py, onLine, eligible });
const LOOK_A: PortLook = { id: 'a', name: 'Look A', personnel: '11', players: [P('C', 0, 0), P('X', 0, -15, true, true)], motion: null };
const LOOK_B: PortLook = { id: 'b', name: 'Look B', personnel: '12', players: [P('C', 0, 0), P('Y', 0, 4, true, true)], motion: { role: 'Y', toPy: -4, kind: 'normal', timeS: 2 } };
const CALL: PortCall = {
  id: 'c1', name: 'Test call', status: 'draft',
  package: { name: 'Nickel', dl: 4, lb: 2, db: 5 }, front: { name: 'Over', convention: 'oddOutside' },
  movement: { stunts: [{}], pressure: null }, coverage: { name: 'Cover 3', shell: 'oneHigh' },
  checks: [{ id: 'chk', when: ['motion'], note: 'Motion: bump' }], disguise: null,
};
const D = (id: string, py: number, job: PortDefender['job'], tech = false): PortDefender => ({
  slot: { id, pos: tech ? 'DT' : 'S', align: tech ? { kind: 'tech', blocker: 'G', shade: 'outside' } : { kind: 'deep' }, gapControl: tech ? 'one' : undefined }, px: tech ? 1 : 10, py, job, label: tech ? '3' : null, onLine: tech,
});

function res(look: PortLook): PortResolution {
  return {
    look, reading: { center: P('C', 0, 0), line: { left: { gaps: [{ gap: 'A', y: -0.5 }, { gap: 'B', y: -1.5 }] }, right: { gaps: [{ gap: 'A', y: 0.5 }] } } },
    declared: { strong: 'right', passStrong: 'left' }, checkApplied: look.id === 'b' ? { id: 'chk', note: 'Motion: bump' } : null,
    coverage: CALL.coverage, pressureCancelled: false,
    defenders: [D('T', -1, { kind: 'rush', gap: 'B', side: 'left', delayS: 0 }, true), D('FS', 2, { kind: 'zone', area: 'deepMiddle', side: null, rect: { y0: -9, y1: 9, d0: 12, d1: 25 } })],
    matchupNotes: [],
  };
}

const core: DefenseDesignerCore = {
  LOOKS: [LOOK_A, LOOK_B],
  fieldGeometry: () => ({ halfWidthYd: 80 / 3, hashYd: 3, numbersTopYd: null, numbersBottomYd: null }),
  resolve: (_c, l) => res(l),
  gapTable: () => [{ side: 'left', gap: 'A', owners: [] }, { side: 'left', gap: 'B', owners: ['T'] }, { side: 'right', gap: 'A', owners: ['FS', 'T'] }],
  fitTable: (_c, _r, _fam, side) => ({ rows: [{ slot: 'T', job: side === 'left' ? { kind: 'gap', gap: 'B', side: 'left' } : { kind: 'pursuit', side: null } }], errors: [] }),
  boxDefenders: (r) => [r.defenders[0]!],
  conflicts: () => ['FS'],
  coverageReport: () => ({ uncovered: ['Y'], doubled: [] }),
  pressureReport: () => ({ rushers: ['T'], family: 'four', deep: 1, freeRushers: { left: 0, right: 1 }, hot: [{ receiver: 'Y', takenBy: null }, { receiver: 'X', takenBy: 'FS' }] }),
  validateCall: () => ({
    status: 'valid',
    findings: [
      { severity: 'warning', code: 'other', formationId: 'b', slot: null, message: 'on b', ruleKey: null },
      { severity: 'warning', code: 'wide', formationId: null, slot: null, message: 'call-wide', ruleKey: null },
      { severity: 'warning', code: 'mine.w', formationId: 'a', slot: null, message: 'warn on a', ruleKey: null },
      { severity: 'rule_failure', code: 'mine.r', formationId: 'a', slot: 'T', message: 'rule on a', ruleKey: 'foul.offside.exists' },
    ],
    perLook: [{ lookId: 'a', box: 6, checkApplied: null }, { lookId: 'b', box: 7, checkApplied: 'chk' }],
  }),
  stuntName: () => 'Tex',
};
const RULES = { keys: () => [], num: () => 0 };

describe('defenseDesignerView', () => {
  const v = defenseDesignerView(core, { call: CALL, lookId: 'a', rules: RULES, selectedSlot: 'T', family: 'power', hours: { usedH: 1, leftH: 20, owner: 'coach', ownerName: '', delegable: true } });

  it('flags a gap with zero names and one with two; one name is ok; gap y comes from the line', () => {
    expect(v.gaps.map((g) => g.flag)).toEqual(['none', 'ok', 'double']);
    expect(v.gaps.map((g) => g.y)).toEqual([-0.5, -1.5, 0.5]);
  });

  it('run to is the fit for a play to the defender\'s side, run away the other side; pass is his job', () => {
    const t = v.defenders.find((d) => d.slot === 'T')!;
    expect(t.runTo).toMatchObject({ kind: 'gap', gap: 'B', side: 'left' });
    expect(t.runAway).toMatchObject({ kind: 'pursuit', side: null });
    expect(t.pass).toMatchObject({ kind: 'rush', gap: 'B', side: 'left', delayS: null });
    expect(t).toMatchObject({ technique: '3', key: 'G', gapControl: 'one', inBox: true, conflict: false, zone: null });
    const fs = v.defenders.find((d) => d.slot === 'FS')!;
    expect(fs.runTo).toBeNull();
    expect(fs).toMatchObject({ key: null, conflict: true, inBox: false, zone: { d0: 12 } });
    expect(v.box).toBe(1);
    expect(v.family).toBe('power');
  });

  it('orders findings: shown look (refusal and rule failure first), call-wide, then other looks', () => {
    expect(v.findings.map((f) => f.code)).toEqual(['mine.r', 'mine.w', 'wide', 'other']);
    expect(v.findings[0]).toMatchObject({ lookId: 'a', slot: 'T', ruleKey: 'foul.offside.exists' });
  });

  it('checks table: one row per look with the check note; layers, pressure and summary carried over', () => {
    expect(v.checks).toEqual([
      { lookId: 'a', lookName: 'Look A', box: 6, checkId: null, note: null },
      { lookId: 'b', lookName: 'Look B', box: 7, checkId: 'chk', note: 'Motion: bump' },
    ]);
    expect(v.layers).toMatchObject({ package: 'Nickel', personnel: '4-2-5', stunts: ['Tex'], pressure: null, checks: 1 });
    expect(v.pressure).toEqual({ rushers: 1, family: 'four', deep: 1, freeLeft: 0, freeRight: 1, hotUnanswered: ['Y'] });
    expect(v.uncovered).toEqual(['Y']);
    expect(v.status).toBe('valid');
    expect(v.selected).toBe('T');
    expect(v.hours).toMatchObject({ usedH: 1, leftH: 20 });
  });

  it('carries the motion and the applied check of the look; an unknown selection is dropped', () => {
    const b = defenseDesignerView(core, { call: CALL, lookId: 'b', rules: RULES, selectedSlot: 'ZZ' });
    expect(b.motion).toEqual({ role: 'Y', toPy: -4, kind: 'normal' });
    expect(b.checkApplied).toEqual({ id: 'chk', note: 'Motion: bump' });
    expect(b.selected).toBeNull();
    expect(b.hours).toBeNull();
    expect(b.family).toBe('insideZone');
    expect(b.findings[0]!.code).toBe('other');
  });

  it('throws on an unknown look; the view survives JSON (worker bridge)', () => {
    expect(() => defenseDesignerView(core, { call: CALL, lookId: 'nope', rules: RULES })).toThrow(/unknown look nope/);
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    expect(RUN_FAMILY_IDS).toHaveLength(6);
  });
});
