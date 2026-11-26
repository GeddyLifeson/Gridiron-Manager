// The seat's football desk (plan item 2b): the staff draft the week's sheets from the team's own book, an
// edit on the call sheet is what the console calls from, a new game redrafts and the same game keeps edits,
// and the playbook, install board and defensive designer read the same team.
import { describe, it, expect } from 'vitest';
import { FootballDesk, installUnits, normalPracticeDays } from '../../src/play/football-desk.ts';

const desk = (level: 'pro' | 'college' = 'pro') => new FootballDesk({ teamId: 4, ruleSetId: level === 'pro' ? 'pro_2026' : 'college_2026', level });
const OPTS = { situation: null, paper: 'letter' as const, keyHints: true };
const entries = (d: FootballDesk, unit: 'offense' | 'defense') => d.sheets()[unit].boxes.flatMap((b) => b.entries);

describe('football desk', () => {
  for (const level of ['pro', 'college'] as const) {
    it(`${level}: the staff draft both sheets from the team's own book, with no call missing from it`, () => {
      const d = desk(level);
      d.prepare('101');
      for (const unit of ['offense', 'defense'] as const) {
        const v = d.gameplanView(unit, OPTS)!;
        expect(v.teamId).toBe(4);
        expect(v.sheet.gameId).toBe('101');
        const rows = v.sheet.boxes.flatMap((b) => b.entries);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.filter((e) => e.broken)).toEqual([]);
        // MA-48: the season has no readiness estimate yet, so none is shown.
        expect(rows.every((e) => e.readinessEstimate === null)).toBe(true);
      }
      expect(d.gameplanView('special_teams', OPTS)).toBeNull();
    });
  }

  it('an edit on the call sheet is the sheet the console calls from', () => {
    const d = desk();
    d.prepare('7');
    const box = d.sheets().offense.boxes.find((b) => b.entries.length > 1)!;
    const gone = box.entries[0]!;
    const r = d.runGameplan('offense', { kind: 'remove_entry', boxId: box.id, entryId: gone.id });
    expect(r.ok).toBe(true);
    expect(entries(d, 'offense').some((e) => e.id === gone.id)).toBe(false);
    const cfg = d.consoleConfig('7', []);
    const consoleBox = cfg.sheets.offense!.boxes.find((b) => b.id === box.id)!;
    expect(consoleBox.entries.length).toBe(box.entries.length - 1);
  });

  it('the same game keeps edits; the next game gets a fresh staff draft', () => {
    const d = desk();
    d.prepare('1');
    const box = d.sheets().defense.boxes.find((b) => b.entries.length > 0)!;
    d.runGameplan('defense', { kind: 'remove_box', boxId: box.id });
    d.prepare('1');
    expect(d.sheets().defense.boxes.some((b) => b.id === box.id)).toBe(false);
    d.prepare('2');
    expect(d.sheets().defense.boxes.some((b) => b.id === box.id)).toBe(true);
    expect(d.sheets().defense.gameId).toBe('2');
  });

  it('in a week with no game the staff draft for the next game, and edits carry over to it', () => {
    const d = desk();
    d.prepare(null);
    const box = d.sheets().offense.boxes.find((b) => b.entries.length > 1)!;
    expect(box.entries.length).toBeGreaterThan(1);
    d.runGameplan('offense', { kind: 'remove_entry', boxId: box.id, entryId: box.entries[0]!.id });
    d.prepare('9');
    expect(d.sheets().offense.gameId).toBe('9');
    expect(d.sheets().offense.boxes.find((b) => b.id === box.id)!.entries.length).toBe(box.entries.length - 1);
  });

  it('plan commands run through the G3.4.3 access table and keep their state', () => {
    const d = desk();
    d.prepare('1');
    const playId = [...d.playbook.plays.values()].find((p) => p.book === 'offense')!.id;
    expect(d.runGameplan('offense', { kind: 'add_to_plan', entry: d.planEntry('offense', playId, ['first_10']) }).ok).toBe(true);
    const v = d.gameplanView('offense', { ...OPTS, situation: 'first_10' })!;
    expect(v.plan.summary.total).toBe(1);
    expect(v.plan.situations.find((s) => s.id === 'first_10')!.entries[0]!.playId).toBe(playId);
    const coordinator = new FootballDesk({ teamId: 4, ruleSetId: 'pro_2026', level: 'pro', holder: { job: 'coordinator', side: 'offense' } });
    coordinator.prepare('1');
    const r = coordinator.runGameplan('defense', { kind: 'submit_plan' });
    expect(r).toMatchObject({ ok: false, rule: 'G3.4.3' });
    expect(coordinator.runGameplan('special_teams', { kind: 'submit_plan' }).ok).toBe(false);
  });

  it('playbook commands change the book every screen reads', () => {
    const d = desk();
    const id = d.playbookView('offense', {}).rows[0]!.id;
    expect(d.runPlaybook('offense', { kind: 'retire', playIds: [id] }).ok).toBe(true);
    expect(d.playbookView('offense', {}).rows.some((r) => r.id === id)).toBe(false);
    // A sheet drafted before the retirement keeps the call, marked broken (O3.4.2: the user decides).
    expect(d.gameplanView('offense', OPTS)!.sheet.boxes.flatMap((b) => b.entries).filter((e) => e.playId === id).every((e) => e.broken)).toBe(true);
    // The next game's staff draft leaves it out.
    d.prepare('2');
    d.prepare('3');
    expect(entries(d, 'offense').some((e) => e.call.playId === id)).toBe(false);
  });

  it('install board: units come from the book and the default fill places them on the week', () => {
    const d = desk();
    const units = installUnits(d.playbook, d.playbookSource('offense').words, 'offense');
    const plays = units.filter((u) => u.kind === 'play');
    expect(plays.length).toBe([...d.playbook.plays.values()].filter((p) => p.book === 'offense').length);
    // G5.1.1: a play needs its parts.
    for (const p of plays) for (const r of p.requires) expect(units.some((u) => u.id === r && u.kind === 'part')).toBe(true);
    expect(d.installView('offense', 'week').days.length).toBe(normalPracticeDays(d.rules));
    // Nobody is slated yet (placeholder rosters), so the staff call nothing installed.
    expect(d.installView('offense', 'week').totals.installed).toBe(0);
    expect(d.runInstall('offense', 'week', { kind: 'fill' }).ok).toBe(true);
    const placed = d.installView('offense', 'week').days.reduce((n, day) => n + day.cards.length, 0);
    expect(placed).toBeGreaterThan(0);
  });

  it('a normal pro week has three full practice days (H1.1.1, Wednesday to Friday)', () => {
    expect(normalPracticeDays(desk().rules)).toBe(3);
  });

  it('defensive designer: the designer calls against the scout looks, unknown ids fall back', () => {
    const d = desk();
    const calls = d.designerCalls();
    expect(calls.length).toBeGreaterThan(0);
    const v = d.defenseDesigner({ callId: calls[1]!.id, lookId: null, slot: null, family: 'power' });
    expect(v.callId).toBe(calls[1]!.id);
    expect(v.looks.length).toBeGreaterThan(0);
    expect(d.defenseDesigner({ callId: 'nope', lookId: 'nope', slot: null, family: 'insideZone' }).callId).toBe(calls[0]!.id);
  });
});
