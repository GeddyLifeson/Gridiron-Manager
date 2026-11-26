// The seat's play designer (G-90) on the real football-lang designer: a new draft has the group's eleven,
// dragging snaps by the designer's parameters, the rule set's landmarks give the field lines, the real
// validator judges the picture, and publishing a legal play keeps a version.
import { describe, it, expect } from 'vitest';
import { PlayDesignerDesk } from '../../src/play/play-designer-desk.ts';

const desk = () => new PlayDesignerDesk({ ruleSetId: 'pro_2026', calendarLabel: () => '2026, week 1' });

describe('play designer desk', () => {
  it('opens a blank 11 personnel draft with field lines from the rule set', () => {
    const d = desk();
    const v = d.view();
    expect(v.canvas.markers.length).toBe(11);
    const [l, r] = v.canvas.lines.sidelines;
    expect(r - l).toBeCloseTo(160 / 3, 6);
    expect(v.canvas.lines.hashes[0]).toBeGreaterThan(l);
    expect(v.parts.find((p) => p.kind === 'personnel')!.options.map((o) => o.id)).toContain('12');
    expect(v.counts.refused).toBe(0);
  });

  it('drags snap, the validator speaks, and personnel can change', () => {
    const d = desk();
    const role = d.view().canvas.markers.find((m) => !m.lineman && !m.onLine)!.role;
    d.send({ type: 'drag', role, raw: [-1.04, 12.31], free: false });
    const m = d.view().canvas.markers.find((x) => x.role === role)!;
    expect(m.at).not.toEqual([-1.04, 12.31]);
    d.send({ type: 'select', role });
    expect(d.view().properties!.readout.length).toBeGreaterThan(0);
    d.send({ type: 'choose_part', kind: 'personnel', id: '12' });
    expect(d.play.personnel).toBe('12');
  });

  it('publishing keeps a version when nothing refuses it', () => {
    const d = desk();
    d.send({ type: 'publish', confirmIllegal: true });
    const v = d.view();
    if (v.counts.refused === 0) {
      expect(d.published.length).toBe(1);
      expect(d.published[0]!.version).toBe(1);
    } else expect(d.published.length).toBe(0);
  });
});
