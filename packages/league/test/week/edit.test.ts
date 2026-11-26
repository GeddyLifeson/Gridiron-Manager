import { describe, expect, it } from 'vitest';
import type { HeldActivity } from '../../src/calendar/work-rules.ts';
import {
  allBlocks, changeBlock, checkWeek, delegateBlock, markVoluntary, placeBlock, removeBlock, saveTemplate, setContent, weekLookup,
  minutesFor, unplanned, type Block,
} from '../../src/week/index.ts';
import { SUN, at, collegeEnv, collegeLeague, collegeWeek, proEnv, proWeek } from './fixtures.ts';

function padded(day: number, seasonWeek: number): HeldActivity {
  return { activity: { day, type: 'practice', fieldMinutes: 105, equipment: 'pads', contact: 'live', fullSpeed: true, mandatory: true }, ctx: { season: 2026, phaseId: 'regular_season', seasonWeek, gameDays: [] } };
}

function padUp(id: string, w = proWeek()): Omit<Block, 'id'> {
  const b = allBlocks(w).find((x) => x.id === id)!;
  const { id: _drop, ...rest } = b;
  return { ...rest, equipment: 'pads', contact: 'live' };
}

const practiceId = (w = proWeek()) => allBlocks(w).find((b) => b.type === 'practice')!.id;

describe('hard limits warn, confirm, log (H1.1.2)', () => {
  it('a fifteenth padded practice in a season needs the L8.2.5 warning and writes one violation', () => {
    const held = [...Array.from({ length: 11 }, (_, i) => padded(SUN - 200 + i * 7, i + 1)), ...Array.from({ length: 3 }, (_, i) => padded(SUN - 100 + i * 7, 12 + i))];
    const w = proWeek();
    const env = proEnv(18, held);
    const first = changeBlock(w, practiceId(w), padUp(practiceId(w)), env);
    expect(first.kind).toBe('needs_confirm');
    const ok = changeBlock(w, practiceId(w), padUp(practiceId(w)), env, true);
    expect(ok.kind).toBe('placed');
    if (ok.kind !== 'placed') return;
    expect(ok.violations.length).toBe(1);
    expect(ok.violations[0]!.classId).toBe('work_rules_practice');
    expect(ok.violations[0]!.ruleId).toBe('season.padded_total');
  });

  it('the same holds for a twelfth padded practice inside the first 11 weeks', () => {
    const held = Array.from({ length: 11 }, (_, i) => padded(SUN - 200 + i * 7, i + 1));
    const w = proWeek();
    const r = changeBlock(w, practiceId(w), padUp(practiceId(w)), proEnv(11, held));
    expect(r.kind).toBe('needs_confirm');
    expect(changeBlock(w, practiceId(w), padUp(practiceId(w)), proEnv(11, [])).kind).toBe('placed');
  });

  it('a block on the players’ day off breaks the weekly day off', () => {
    const w = proWeek();
    const tue = w.days.find((d) => d.kind === 'off')!.day;
    const b: Block = { id: 'extra', type: 'practice', start: at(tue, 10), minutes: 60, attendees: ['team'], leader: 'staff_default', location: 'facility', contentRef: null, mandatory: true, equipment: 'shells', contact: 'thud' };
    const free = removeBlock(w, w.days.find((d) => d.kind === 'off')!.blocks.find((x) => x.type === 'player_free')!.id, proEnv());
    expect(free.kind).toBe('placed');
    if (free.kind !== 'placed') return;
    const r = placeBlock(free.week, b, proEnv());
    expect(r.kind).toBe('needs_confirm');
    if (r.kind === 'needs_confirm') expect(r.warnings.map((f) => f.ruleId)).toContain('week.day_off');
  });

  it('a long day is a soft finding: placed, no violation', () => {
    const w = proWeek();
    const p1 = w.days.find((d) => d.kind === 'p1')!.day;
    const b: Block = { id: 'late', type: 'team_meeting', start: at(p1, 17, 30), minutes: 60, attendees: ['team'], leader: 'none', location: 'facility', contentRef: null, mandatory: true };
    const r = placeBlock(w, b, proEnv());
    expect(r.kind).toBe('placed');
    if (r.kind === 'placed') { expect(r.soft.map((f) => f.ruleId)).toContain('week.facility_day'); expect(r.violations).toEqual([]); }
  });
});

describe('refusals are physical only', () => {
  it('refuses a clash for one attendee', () => {
    const w = proWeek();
    const pr = allBlocks(w).find((b) => b.type === 'practice')!;
    const r = placeBlock(w, { ...pr, id: 'dup', type: 'team_meeting' }, proEnv());
    expect(r.kind).toBe('refused');
  });
  it('refuses an edit to a resolved block', () => {
    const w = proWeek();
    const id = allBlocks(w)[0]!.id;
    expect(removeBlock({ ...w, completed: [id] }, id, proEnv()).kind).toBe('refused');
    expect(() => setContent({ ...w, completed: [id] }, id, 'x')).toThrow();
  });
  it('below coordinator a fixed block cannot move (H1.5.5)', () => {
    const w = proWeek();
    const b = allBlocks(w).find((x) => x.type === 'unit_meeting')!;
    const fixedWeek = { ...w, days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((x) => (x.id === b.id ? { ...x, fixed: true } : x)) })) };
    expect(removeBlock(fixedWeek, b.id, { ...proEnv(), rung: 'position_coach' }).kind).toBe('refused');
    expect(removeBlock(fixedWeek, b.id, { ...proEnv(), rung: 'coordinator' }).kind).toBe('placed');
  });
});

describe('college countable hours (H1.5.2)', () => {
  it('a practice past the daily hours saves only through the warning and logs one violation per finding', () => {
    const w = collegeWeek();
    const p1 = w.days.find((d) => d.kind === 'p1')!;
    const b: Block = { id: 'extra', type: 'practice', start: at(p1.day, 19), minutes: 60, attendees: ['team'], leader: 'staff_default', location: 'facility', contentRef: null, mandatory: true, countable: true, equipment: 'shells', contact: 'thud' };
    expect(placeBlock(w, b, collegeEnv()).kind).toBe('needs_confirm');
    const ok = placeBlock(w, b, collegeEnv(), true);
    expect(ok.kind).toBe('placed');
    if (ok.kind === 'placed') { expect(ok.violations.every((v) => v.classId === 'countable_hours')).toBe(true); expect(ok.violations.length).toBeGreaterThan(0); }
  });
  it('a countable block after the game on game day is a violation', () => {
    const w = collegeWeek();
    const gameEnd = w.kickoff!.minute + 210;
    const b: Block = { id: 'bus_film', type: 'unit_meeting', start: { day: w.kickoff!.day, minute: gameEnd + 120 }, minutes: 30, attendees: ['team'], leader: 'none', location: 'transit', contentRef: null, mandatory: true, countable: true };
    const r = placeBlock(w, b, collegeEnv());
    expect(r.kind).toBe('needs_confirm');
    if (r.kind === 'needs_confirm') expect(r.warnings[0]!.ruleId).toBe('college.after_competition');
  });
  it('a changed rule value changes the validation with no code change', () => {
    const w = collegeWeek();
    const strict = weekLookup((k) => (k === 'college.cara_week_hours' ? 18 : undefined), 'college');
    expect(() => checkWeek(w, collegeEnv({ rules: strict }))).toThrow(); // league value 18 contradicts the week row 20
    const tight = (k: string) => (k === 'college.cara_week_hours' ? 18 : weekLookup(collegeLeague, 'college')(k));
    expect(checkWeek(w, collegeEnv({ rules: tight })).map((f) => f.ruleId)).toContain('college.week_hours');
  });
  it('voluntary blocks cost no hours; staff attendance makes them a risk', () => {
    const w = collegeWeek();
    const lift = allBlocks(w).find((b) => b.type === 'lift_conditioning')!;
    const film = allBlocks(w).find((b) => b.type === 'unit_meeting' && b.countable)!;
    expect(markVoluntary(w, lift.id).risky).toBe(false);
    expect(markVoluntary(w, film.id).risky).toBe(true);
  });
});

describe('templates and delegation (H1.4.1, H1.4.2)', () => {
  it('a template that breaks a limit warns and still saves', () => {
    const held = Array.from({ length: 11 }, (_, i) => padded(SUN - 200 + i * 7, i + 1));
    const w = proWeek();
    const r = changeBlock(w, practiceId(w), padUp(practiceId(w)), proEnv(5, held), true);
    if (r.kind !== 'placed') throw new Error('expected placed');
    const s = saveTemplate(r.week, proEnv(5, held), true);
    expect(s.saved).toBe(true);
    expect(s.warnings.length).toBeGreaterThan(0);
    expect(s.routineChange).toBe(true);
  });
  it('the head coach is charged only for blocks he leads or attends', () => {
    const w = proWeek();
    const id = allBlocks(w).find((b) => b.type === 'staff_meeting')!.id;
    const before = minutesFor(w);
    const off = delegateBlock(w, id, false);
    expect(minutesFor(off)).toBeLessThan(before);
    expect(minutesFor(delegateBlock(w, id, true))).toBe(before);
  });
  it('blocks with no content are unplanned until filled', () => {
    const w = proWeek();
    const id = allBlocks(w).find((b) => b.type === 'practice')!.id;
    expect(unplanned(w).map((b) => b.id)).toContain(id);
    expect(unplanned(setContent(w, id, 'script-1')).map((b) => b.id)).not.toContain(id);
  });
});
