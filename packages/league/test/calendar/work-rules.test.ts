import { describe, expect, it } from 'vitest';
import { CalendarEngine } from '../../src/calendar/engine.ts';
import { CALENDAR_FILES } from '../../src/calendar/files.ts';
import { parseIso } from '../../src/calendar/date.ts';
import {
  WORK_RULES, WorkRuleChecker, workContext, workCounters,
  type Activity, type ClubWorkFacts, type HeldActivity,
} from '../../src/calendar/work-rules.ts';
import type { CalendarLevel } from '../../src/calendar/types.ts';
import { fixtureRules } from './fixtures.ts';

const engine = new CalendarEngine({ files: CALENDAR_FILES, rules: fixtureRules });
const checker = new WorkRuleChecker(fixtureRules);
const D = parseIso;
const seen = new Set<string>();

const base: Omit<Activity, 'day'> = { type: 'practice', fieldMinutes: 60, equipment: 'none', contact: 'none' };
const act = (day: string, more: Partial<Activity> = {}): Activity => ({ ...base, day: D(day), ...more });
const camp: ClubWorkFacts = { reportDay: D('2026-07-28'), gameDays: [D('2026-08-14'), D('2026-08-21'), D('2026-08-28')], preseasonGames: 3, byeWeek: 7 };

function held(level: CalendarLevel, list: Activity[], club: ClubWorkFacts = {}): HeldActivity[] {
  return list.map((a) => ({ activity: a, ctx: workContext(engine, level, a.day, club) }));
}
function check(a: Activity, h: HeldActivity[] = [], club: ClubWorkFacts = {}, level: CalendarLevel = 'pro') {
  const r = checker.check(a, workContext(engine, level, a.day, club), h);
  for (const b of r.broken) seen.add(b.ruleId);
  return r;
}
const ids = (r: ReturnType<typeof check>) => r.broken.map((b) => b.ruleId);
function days(from: string, n: number, step = 1): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = D(from) + i * step;
    return new Date(Date.UTC(1970, 0, 1 + d)).toISOString().slice(0, 10);
  });
}

describe('rule records (C11.1.1 acceptance)', () => {
  it('every limit is a record with source, status and class', () => {
    expect(WORK_RULES.length).toBeGreaterThanOrEqual(30);
    for (const r of WORK_RULES) {
      expect(r.source && r.status && r.leaf && r.plain, r.id).toBeTruthy();
      expect(['blocked', 'breakable']).toContain(r.cls);
      expect(r.limitKey !== undefined || r.value !== undefined || ['off.program_window', 'off.gap_before_camp', 'off.phase1_content', 'off.phase2_content', 'off.contact', 'off.no_pads', 'off.no_weekends', 'off.hours_non_ota', 'off.hours_ota', 'off.mandatory_attendance', 'camp.acclimation_day1', 'camp.acclimation', 'camp.day_off_after_acclimation', 'camp.second_session', 'camp.prohibited_drills', 'season.field_time'].includes(r.id), r.id).toBe(true);
    }
    expect(WORK_RULES.find((r) => r.id === 'off.program_window')!.cls).toBe('blocked');
  });
  it('a rule below Verified carries a developer warning', () => {
    const r = check(act('2026-07-01'));
    expect(r.broken.find((b) => b.ruleId === 'off.gap_before_camp')!.developerWarning).toBe(true);
  });
});

describe('offseason program (C11.2.1, C4.3.1)', () => {
  it('sessions before the program start are blocked', () => {
    const r = check(act('2026-04-14', { type: 'workout' }));
    expect(r.blocked).toBe(true);
    expect(ids(r)).toContain('off.program_window');
    expect(check(act('2026-04-21', { type: 'workout', strengthStaffOnly: true })).allowed).toBe(true);
    // A new head coach's club starts April 6.
    expect(check(act('2026-04-14', { type: 'workout', strengthStaffOnly: true }), [], { newHeadCoach: true }).allowed).toBe(true);
  });
  it('phase one: strength staff only, no footballs', () => {
    expect(ids(check(act('2026-04-21', { footballs: true })))).toContain('off.phase1_content');
  });
  it('phase two: no team against team, no contact; the planner warns on a team period', () => {
    const r = check(act('2026-05-05', { teamVsTeam: true }));
    expect(r.allowed).toBe(false);
    expect(r.blocked).toBe(false);
    expect(ids(r)).toContain('off.phase2_content');
    expect(r.broken[0]!.penalty).toMatch(/\$100,000/);
    expect(ids(check(act('2026-05-05', { contact: 'live' })))).toContain('off.contact');
    expect(check(act('2026-05-05')).allowed).toBe(true);
  });
  it('no pads in the spring', () => {
    expect(ids(check(act('2026-05-26', { type: 'ota', equipment: 'pads' })))).toContain('off.no_pads');
  });
  const otaDays = ['2026-05-26', '2026-05-27', '2026-05-28', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'];
  const tenOtas = () => held('pro', otaDays.map((d) => act(d, { type: 'ota' })));
  it('ten OTA days spaced 3, 3, 4 are legal; an 11th is not', () => {
    const h: HeldActivity[] = [];
    for (const d of otaDays) {
      const r = check(act(d, { type: 'ota' }), h);
      expect(r.allowed, d).toBe(true);
      h.push({ activity: act(d, { type: 'ota' }), ctx: workContext(engine, 'pro', D(d)) });
    }
    expect(ids(check(act('2026-06-01', { type: 'ota' }), tenOtas()))).toContain('off.ota_days');
    expect(workCounters(tenOtas(), 11).otaDays).toBe(10);
  });
  it('OTA spacing: a fourth OTA in week one, or an OTA in the minicamp week', () => {
    const h = held('pro', otaDays.slice(0, 3).map((d) => act(d, { type: 'ota' })));
    expect(ids(check(act('2026-05-29', { type: 'ota' }), h))).toContain('off.ota_spacing');
    expect(ids(check(act('2026-06-15', { type: 'ota' })))).toContain('off.ota_spacing');
  });
  it('four workout days a week, none on weekends', () => {
    const h = held('pro', ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07'].map((d) => act(d)));
    expect(ids(check(act('2026-05-08'), h))).toContain('off.workouts_per_week');
    expect(ids(check(act('2026-05-09')))).toContain('off.no_weekends');
  });
  it('time limits on non-OTA and OTA days', () => {
    expect(ids(check(act('2026-05-05', { fieldMinutes: 100 })))).toContain('off.hours_non_ota');
    expect(ids(check(act('2026-05-05', { facilityMinutes: 250 })))).toContain('off.hours_non_ota');
    expect(ids(check(act('2026-05-26', { type: 'ota', fieldMinutes: 130 })))).toContain('off.hours_ota');
    expect(check(act('2026-05-26', { type: 'ota', fieldMinutes: 120, facilityMinutes: 360 })).allowed).toBe(true);
  });
  it('one mandatory minicamp of up to three days, and nothing else mandatory', () => {
    expect(check(act('2026-06-16', { type: 'minicamp', mandatory: true, equipment: 'helmets' })).allowed).toBe(true);
    expect(ids(check(act('2026-06-09', { type: 'minicamp' })))).toContain('off.minicamp');
    expect(ids(check(act('2026-05-26', { type: 'ota', mandatory: true })))).toContain('off.mandatory_attendance');
  });
  it('no organised activity between the program and camp', () => {
    expect(ids(check(act('2026-07-01')))).toContain('off.gap_before_camp');
    expect(check(act('2026-07-01', { type: 'meeting', fieldMinutes: 0 })).allowed).toBe(true);
  });
});

describe('training camp (C11.2.2, C4.4.2)', () => {
  it('day 1 conditioning only', () => {
    expect(check(act('2026-07-28', { type: 'conditioning' }), [], camp).allowed).toBe(true);
    expect(ids(check(act('2026-07-28', { equipment: 'helmets' }), [], camp))).toContain('camp.acclimation_day1');
  });
  it('days 2 to 5: helmets then shells, no live contact, 3.5 hours, one full-speed practice', () => {
    expect(check(act('2026-07-29', { equipment: 'helmets', fullSpeed: true, fieldMinutes: 120 }), [], camp).allowed).toBe(true);
    expect(ids(check(act('2026-07-29', { equipment: 'shells' }), [], camp))).toContain('camp.acclimation');
    expect(check(act('2026-07-31', { equipment: 'shells' }), [], camp).allowed).toBe(true);
    expect(ids(check(act('2026-07-31', { equipment: 'pads' }), [], camp))).toContain('camp.acclimation');
    expect(ids(check(act('2026-07-30', { contact: 'live' }), [], camp))).toContain('camp.acclimation');
    expect(ids(check(act('2026-07-30', { fieldMinutes: 220 }), [], camp))).toContain('camp.acclimation');
    expect(ids(check(act('2026-07-30', { fullSpeed: true, fieldMinutes: 130 }), [], camp))).toContain('camp.acclimation');
  });
  it('day 6 is a day off, so the first padded practice is day 7 at the earliest', () => {
    expect(ids(check(act('2026-08-02'), [], camp))).toContain('camp.day_off_after_acclimation');
    expect(check(act('2026-08-03', { equipment: 'pads', contact: 'live', fieldMinutes: 150 }), [], camp).allowed).toBe(true);
  });
  it('a 17th padded practice', () => {
    const padded = days('2026-08-03', 16).map((d) => act(d, { equipment: 'pads' }));
    expect(ids(check(act('2026-08-25', { equipment: 'pads' }), held('pro', padded, camp), camp))).toContain('camp.padded_total');
  });
  it('a fourth consecutive padded day', () => {
    const h = held('pro', days('2026-08-03', 3).map((d) => act(d, { equipment: 'pads' })), camp);
    expect(ids(check(act('2026-08-06', { equipment: 'pads' }), h, camp))).toContain('camp.padded_consecutive');
  });
  it('blocks of three padded days need three days between them, and at most three blocks', () => {
    const h = held('pro', ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-07', '2026-08-08'].map((d) => act(d, { equipment: 'pads' })), camp);
    expect(ids(check(act('2026-08-09', { equipment: 'pads' }), h, camp))).toContain('camp.padded_blocks');
    const three = held('pro', [...days('2026-08-03', 3), ...days('2026-08-09', 3), ...days('2026-08-15', 3)].map((d) => act(d, { equipment: 'pads' })), camp);
    const fourth = held('pro', [...days('2026-08-03', 3), ...days('2026-08-09', 3), ...days('2026-08-15', 3), ...days('2026-08-21', 2)].map((d) => act(d, { equipment: 'pads' })), camp);
    expect(ids(check(act('2026-08-22', { equipment: 'pads' }), three, camp))).not.toContain('camp.padded_blocks');
    expect(ids(check(act('2026-08-23', { equipment: 'pads' }), fourth, camp))).toContain('camp.padded_blocks');
  });
  it('padded length, one padded a day, four hours on the field, walkthrough second session', () => {
    expect(ids(check(act('2026-08-03', { equipment: 'pads', fieldMinutes: 160 }), [], camp))).toContain('camp.padded_length');
    const morning = held('pro', [act('2026-08-03', { equipment: 'pads', fieldMinutes: 150 })], camp);
    expect(ids(check(act('2026-08-03', { equipment: 'pads', session: 2 }), morning, camp))).toContain('camp.padded_length');
    expect(ids(check(act('2026-08-03', { type: 'walkthrough', session: 2, fieldMinutes: 100 }), morning, camp))).toContain('camp.field_hours');
    expect(ids(check(act('2026-08-03', { session: 2, equipment: 'helmets' }), morning, camp))).toContain('camp.second_session');
    expect(check(act('2026-08-03', { type: 'walkthrough', session: 2, fieldMinutes: 60 }), morning, camp).allowed).toBe(true);
  });
  it('a day off in every seven until the first preseason game', () => {
    const h = held('pro', days('2026-08-03', 6).map((d) => act(d)), camp);
    expect(ids(check(act('2026-08-09'), h, camp))).toContain('camp.days_off_weekly');
  });
  it('days off in camp: at least 8 with three preseason games', () => {
    const campDays = days('2026-07-28', 30).map(D);
    const worked = held('pro', days('2026-07-28', 30).filter((_, i) => i % 5 !== 4).map((d) => act(d)), camp);
    expect(checker.campDaysOffShort(campDays, worked, 3)).toBe(true);
    const rested = held('pro', days('2026-07-28', 30).filter((_, i) => i % 3 !== 2).map((d) => act(d)), camp);
    expect(checker.campDaysOffShort(campDays, rested, 3)).toBe(false);
    seen.add('camp.days_off_total');
  });
  it('joint practices: two a week, none the day before a game', () => {
    const h = held('pro', [act('2026-08-17', { type: 'joint_practice' }), act('2026-08-18', { type: 'joint_practice' })], camp);
    expect(ids(check(act('2026-08-19', { type: 'joint_practice' }), h, camp))).toContain('camp.joint_practices');
    expect(ids(check(act('2026-08-20', { type: 'joint_practice' }), [], camp))).toContain('camp.joint_practices');
  });
  it('prohibited drills and late-joining players', () => {
    expect(ids(check(act('2026-08-04', { drills: ['oklahoma'] }), [], camp))).toContain('camp.prohibited_drills');
    expect(ids(check(act('2026-08-12', { equipment: 'pads', playerJoinedDay: D('2026-08-10') }), [], camp))).toContain('camp.late_player');
    expect(ids(check(act('2026-08-14', { equipment: 'pads', playerJoinedDay: D('2026-08-10') }), [], camp))).not.toContain('camp.late_player');
  });
});

describe('regular season and postseason (C11.2.3)', () => {
  const weekly = (week: number, n = 1) => Array.from({ length: n }, (_, i) => act(days('2026-09-09', 1)[0]!, { equipment: 'pads' }))
    .map((a, i) => ({ ...a, day: a.day + (week - 1) * 7 + i }));
  it('a 12th padded practice in the first 11 weeks; unused early ones do not carry', () => {
    const h = held('pro', Array.from({ length: 11 }, (_, i) => weekly(i + 1)[0]!), camp);
    expect(ids(check({ ...weekly(11)[0]!, day: weekly(11)[0]!.day + 1 }, h, camp))).toContain('season.padded_total');
    expect(ids(check(weekly(12)[0]!, h, camp))).not.toContain('season.padded_total');
    const late = held('pro', [weekly(12)[0]!, weekly(13)[0]!, weekly(14)[0]!], camp);
    expect(ids(check(weekly(15)[0]!, late, camp))).toContain('season.padded_total');
    expect(workCounters(h, 11)).toMatchObject({ paddedSeasonEarly: 11, paddedSeasonLate: 0 });
  });
  it('two padded practices in a week are allowed once, in the first 11 weeks', () => {
    const h = held('pro', weekly(2, 2), camp);
    expect(ids(check(weekly(2, 2)[1]!, held('pro', weekly(2, 1), camp), camp))).not.toContain('season.two_padded_week');
    const w5 = weekly(5, 2);
    expect(ids(check(w5[1]!, [...h, ...held('pro', [w5[0]!], camp)], camp))).toContain('season.two_padded_week');
    const w12 = weekly(12, 2);
    expect(ids(check(w12[1]!, held('pro', [w12[0]!], camp), camp))).toContain('season.two_padded_week');
  });
  it('three hours on the field plus 30 minutes of position-coach time', () => {
    expect(check(act('2026-09-09', { fieldMinutes: 210, positionCoachMinutes: 30 }), [], camp).allowed).toBe(true);
    expect(ids(check(act('2026-09-09', { fieldMinutes: 200 }), [], camp))).toContain('season.field_time');
  });
  it('bye week: four consecutive days off including Saturday and Sunday', () => {
    // Week 7 runs Tuesday 2026-10-20 to Monday 2026-10-26.
    const h = held('pro', [act('2026-10-20')], camp);
    expect(check(act('2026-10-21'), h, camp).allowed).toBe(true);
    expect(ids(check(act('2026-10-23'), h, camp))).toContain('season.bye_days_off');
  });
  it('one padded practice a postseason week', () => {
    const club = { ...camp, inPostseason: true };
    const h = held('pro', [act('2027-01-12', { equipment: 'pads' })], club);
    expect(ids(check(act('2027-01-13', { equipment: 'pads' }), h, club))).toContain('season.postseason_padded');
    expect(ids(check(act('2027-01-20', { equipment: 'pads' }), h, club))).not.toContain('season.postseason_padded');
  });
});

describe('college practice counts (T3.2.1)', () => {
  it('spring 2026: 15 sessions, 12 with contact, 8 with tackling', () => {
    const spring = days('2026-03-02', 15, 2).map((d, i) => act(d, { contact: i < 8 ? 'tackling' : i < 12 ? 'thud' : 'none' }));
    const h = held('college', spring);
    expect(ids(check(act('2026-04-03'), h, {}, 'college'))).toContain('college.spring');
    const twelve = held('college', spring.slice(0, 12));
    expect(ids(check(act('2026-04-03', { contact: 'thud' }), twelve, {}, 'college'))).toContain('college.spring');
    const eight = held('college', spring.slice(0, 8));
    expect(ids(check(act('2026-04-03', { contact: 'tackling' }), eight, {}, 'college'))).toContain('college.spring');
    expect(check(act('2026-04-03', { contact: 'thud' }), eight, {}, 'college').allowed).toBe(true);
  });
  it('spring from 2027 counts 21 practices', () => {
    const h = held('college', days('2027-03-01', 21, 1).map((d) => act(d)));
    expect(ids(check(act('2027-03-30'), h, {}, 'college'))).toEqual(['college.spring_2027']);
  });
  it('preseason: 25 practices in 2026, 21 in 2027', () => {
    const p26 = held('college', days('2026-08-02', 25, 1).map((d) => act(d)));
    expect(ids(check(act('2026-08-27', { type: 'walkthrough' }), p26, {}, 'college'))).toContain('college.preseason');
    const p27 = held('college', days('2027-08-01', 21, 1).map((d) => act(d)));
    expect(ids(check(act('2027-08-23'), p27, {}, 'college'))).toContain('college.preseason_2027');
  });
});

describe('coverage', () => {
  it('every work rule has a breaking case in this file', () => {
    expect(WORK_RULES.map((r) => r.id).filter((id) => !seen.has(id))).toEqual([]);
  });
});
