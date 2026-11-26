import { describe, expect, it } from 'vitest';
import { scanForbiddenJson } from '@gm/schema';
import screensJson from '../../src/ladder/screens.json' with { type: 'json' };
import { CATALOGUE } from '../../src/positions/index.ts';
import { DUTIES, SCREEN_TABLE, SCREEN_STATES, assignmentRows, buildScreenTable, ladderSeats, seatView } from '../../src/ladder/index.ts';

const job = (id: string) => CATALOGUE.job(id);
const seats = ladderSeats(CATALOGUE.jobs);

describe('G-85 screen states by seat (O7.1.1)', () => {
  it('builds a seat for every holdable ladder job at each of its levels', () => {
    const expected = CATALOGUE.jobs.filter((j) => j.onStaff && j.userHoldable && j.rung !== null && j.rung >= 1).reduce((n, j) => n + j.levels.length, 0);
    expect(seats.length).toBe(expected);
    expect(new Set(seats.map((s) => s.rung))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it('every listed screen resolves to exactly one of the four states', () => {
    for (const s of seats) for (const st of Object.values(s.states)) expect(SCREEN_STATES).toContain(st);
  });

  it("every duty on every seat's list opens a listed screen (R1.2.9 gate item 3)", () => {
    for (const s of seats) {
      expect(s.duties.length, s.jobId).toBeGreaterThan(0);
      for (const a of s.duties) {
        const opens = s.dutyScreens[a.duty.id]!;
        expect(opens.length, `${s.jobId} ${a.duty.id}`).toBeGreaterThan(0);
        for (const id of opens) expect(s.states[id], `${s.jobId} ${a.duty.id} -> ${id}`).toBeDefined();
      }
    }
  });

  it('a graduate assistant tags film as an assignment and cannot read the owner view (O7.2.2)', () => {
    const ga = seatView({ job: job('job:college.graduate_assistant'), level: 'college' });
    expect(ga.states['film.tagging']).toBe('assigned');
    expect(ga.states['people.owner']).toBeUndefined();
    expect(ga.states['coach.job_market']).toBe('yours');
    expect(ga.states['office.calendar']).toBe('read');
    expect(ga.rights).toContain('submit:duty:S3.3.1');
    expect(ga.rights).not.toContain('submit:duty:S3.6.2');
  });

  it('a head coach has Yours on everything except personnel without final roster say (O7.1.1 edge case)', () => {
    const hc = seatView({ job: job('job:pro.head_coach'), level: 'pro', flags: { callsPlays: true, hasRosterSay: false } });
    expect(hc.states['football.game_plan']).toBe('yours');
    expect(hc.states['office.calendar']).toBe('yours');
    expect(hc.states['team.draft']).toBe('suggest');
    const boss = seatView({ job: job('job:pro.head_coach'), level: 'pro', flags: { callsPlays: true, hasRosterSay: true } });
    expect(boss.states['team.draft']).toBe('yours');
    const notSuggest = Object.entries(boss.states).filter(([, st]) => st !== 'yours' && st !== 'read');
    expect(notSuggest).toEqual([]);
  });

  it('a coordinator who does not call plays suggests at the console; one who does owns it', () => {
    const oc = job('job:pro.coordinator.offense');
    expect(seatView({ job: oc, level: 'pro', flags: { callsPlays: false, hasRosterSay: false } }).states['game.console']).not.toBe('yours');
    expect(seatView({ job: oc, level: 'pro', flags: { callsPlays: true, hasRosterSay: false } }).states['game.console']).toBe('yours');
  });

  it('college-only and pro-only screens follow the level label, not a code branch', () => {
    const pc = job('job:college.position_coach.wr');
    const v = seatView({ job: pc, level: 'college' });
    expect(v.states['league.recruiting']).toBe('yours');
    expect(v.states['team.draft']).toBeUndefined();
    const pro = seatView({ job: job('job:pro.position_coach.wr'), level: 'pro' });
    expect(pro.states['league.recruiting']).toBeUndefined();
  });

  it('a job change recomputes every state at once (O7.1.1 edge case)', () => {
    const a = seatView({ job: job('job:college.graduate_assistant'), level: 'college' });
    const b = seatView({ job: job('job:college.coordinator.defense'), level: 'college' });
    expect(Object.keys(a.states).filter((k) => a.states[k] !== b.states[k]).length).toBeGreaterThan(5);
  });

  it('the table refuses a duty with no screen and an unknown screen id', () => {
    const bad = structuredClone(screensJson) as { dutyScreens: Record<string, string[]> };
    delete bad.dutyScreens['duty:S3.3.1'];
    expect(() => buildScreenTable(bad)).toThrow(/opens no screen/);
    const bad2 = structuredClone(screensJson) as { dutyScreens: Record<string, string[]> };
    bad2.dutyScreens['duty:S3.3.1'] = ['film.nowhere'];
    expect(() => buildScreenTable(bad2)).toThrow(/unknown screen/);
    expect(SCREEN_TABLE.dutyScreens['duty:S3.7.1']).toEqual(['*']);
    expect(scanForbiddenJson('screens.json', screensJson)).toEqual([]);
    expect(Object.keys(SCREEN_TABLE.dutyScreens).sort()).toEqual(DUTIES.duties.map((d) => d.id).sort());
  });
});

describe('G-85 assignment list (O7.2.1)', () => {
  it('a graduate assistant game week lists every duty with a due time, from the boss, with a submit command', () => {
    const ga = seatView({ job: job('job:college.graduate_assistant'), level: 'college' });
    const rows = assignmentRows({ view: ga, week: 'game', status: { 'duty:S3.3.1': 'graded' } });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.assignedBy).toBe('boss');
      expect(r.due).not.toBeNull();
      expect(ga.states[r.screenId]).toBeDefined();
      if (r.state === 'assigned' || r.state === 'yours') expect(r.command).toBe(`submit:${r.dutyId}`);
    }
    expect(rows.find((r) => r.dutyId === 'duty:S3.3.1')?.status).toBe('graded');
  });

  it('the head coach sets his own list', () => {
    const hc = seatView({ job: job('job:college.head_coach_top'), level: 'college', flags: { callsPlays: true, hasRosterSay: true } });
    const rows = assignmentRows({ view: hc, week: 'game' });
    expect(rows.every((r) => r.assignedBy === 'self')).toBe(true);
  });
});
