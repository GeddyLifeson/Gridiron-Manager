// The seat's play designer (G-90) on the real football-lang designer: a new draft has the group's eleven,
// dragging snaps by the designer's parameters, the rule set's landmarks give the field lines, the real
// validator judges the picture, and publishing a legal play keeps a version.
import { describe, it, expect } from 'vitest';
import { PlayDesignerDesk } from '../../src/play/play-designer-desk.ts';
import { FootballDesk } from '../../src/play/football-desk.ts';

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

  it('the Against tab lines the defensive calls up against the drawn formation', () => {
    const d = desk();
    const looks = d.view().looks;
    expect(looks.length).toBeGreaterThan(0);
    d.send({ type: 'look', id: looks[0]!.id });
    const shown = d.view().canvas.look!;
    expect(shown.id).toBe(looks[0]!.id);
    expect(shown.markers.length).toBe(11);
    // Defenders stand on their side of the ball.
    expect(shown.markers.every((m) => m.at[0] >= 0)).toBe(true);
  });

  it('the parts list offers the content formations, the book protections and tags, and the drop', () => {
    const book = new FootballDesk({ teamId: 4, ruleSetId: 'pro_2026', level: 'pro' });
    const d = new PlayDesignerDesk({ ruleSetId: 'pro_2026', calendarLabel: () => 'x', bookParts: () => book.playbook.parts.values() });
    const part = (k: string) => d.view().parts.find((p) => p.kind === k)!;
    const formation = part('formation').options.find((o) => o.label.endsWith('(11)'))!;
    const before = JSON.stringify(d.play.slots.map((x) => x.at));
    d.send({ type: 'choose_part', kind: 'formation', id: formation.id });
    expect(d.play.formation.id).toBe(formation.id);
    expect(JSON.stringify(d.play.slots.map((x) => x.at))).not.toBe(before);
    const protection = part('protection').options[0]!;
    d.send({ type: 'choose_part', kind: 'protection', id: protection.id });
    expect(d.play.protection!.id).toBe(protection.id);
    const tag = part('tags').options[0]!;
    d.send({ type: 'choose_part', kind: 'tags', id: tag.id });
    expect(d.play.tagsAllowed).toEqual([tag.id]);
    d.send({ type: 'choose_part', kind: 'tags', id: tag.id });
    expect(d.play.tagsAllowed).toEqual([]);
    d.send({ type: 'choose_part', kind: 'qb', id: 'drop5' });
    expect(d.play.qb.dropSteps).toBe(5);
  });

  it('a published play goes into the playbook, and publishing it again replaces it', () => {
    const book = new FootballDesk({ teamId: 4, ruleSetId: 'pro_2026', level: 'pro' });
    const before = book.playbookView('offense', {}).rows.length;
    const d = new PlayDesignerDesk({ ruleSetId: 'pro_2026', calendarLabel: () => '2026, week 1', onPublish: (p, v) => book.addDesigned(p, v) });
    d.send({ type: 'publish', confirmIllegal: false });
    expect(d.published.map((x) => x.version)).toEqual([1]);
    const id = `design:${d.play.id}`;
    const rows = book.playbookView('offense', {}).rows;
    expect(rows.length).toBe(before + 1);
    const row = rows.find((r) => r.id === id)!;
    expect(row.status).toBe('valid');
    expect(book.playbook.plays.get(id)!.parts.personnel).toBeDefined();
    d.send({ type: 'notes', text: 'beat cover 3' });
    d.send({ type: 'publish', confirmIllegal: false });
    expect(d.published.map((x) => x.version)).toEqual([1, 2]);
    expect(book.playbookView('offense', {}).rows.filter((r) => r.id === id).length).toBe(1);
    expect(book.playbook.plays.get(id)!.origin).toContain(':v2');
    // The staff draft no drawn play onto a sheet (it has no content play yet), and nothing breaks.
    book.prepare('1');
    expect(book.sheets().offense.boxes.flatMap((b) => b.entries).some((e) => e.call.playId === id)).toBe(false);
  });
});
