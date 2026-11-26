import { describe, expect, it } from 'vitest';
import {
  campCounters, campInstallPace, campRules, checkCampPlan, installOverloads, installState, keepViolations, missingFromInstall, perDiemCents, RULE_KEYS,
  situationsUncovered, staffCalendar, type CampDay, type CampPlan, type DayType,
} from '../../src/personnel/index.ts';
import { CAMP_COLLEGE_RS, CAMP_PRO_RS } from './helpers.ts';

const PRO = campRules(CAMP_PRO_RS);
const COLLEGE = campRules(CAMP_COLLEGE_RS);
const plan = (types: DayType[], over: Record<number, Partial<CampDay>> = {}): CampPlan => ({ days: types.map((type, i) => ({ type, ...over[i] })) });
const rulesOf = (p: CampPlan, r = PRO) => checkCampPlan(p, r).map((v) => v.rule);
const withDay = (base: CampPlan, i: number, d: Partial<CampDay>): CampPlan => ({ days: base.days.map((x, j) => (j === i ? { ...x, ...d } : x)) });

describe('rule keys', () => {
  it('every key read is declared, and a level with no camp keys turns those rules off', () => {
    const declared = new Set(RULE_KEYS.map((k) => k.key));
    for (const k of PRO.keysRead) expect(declared.has(k)).toBe(true);
    expect(COLLEGE.padded).toBeNull();
    expect(COLLEGE.practicesMax).toBe(29);
  });
});

describe('M6.1.1 the staff starting calendar', () => {
  const cal = staffCalendar();
  it('passes every rule with 15 padded practices and at least 8 days off', () => {
    expect(checkCampPlan(cal, PRO)).toEqual([]);
    const c = campCounters(cal);
    expect(c.padded).toBe(15);
    expect(c.daysOff).toBeGreaterThanOrEqual(8);
    expect(keepViolations(checkCampPlan(cal, PRO), () => true).rows).toEqual([]);
  });

  it('each rule marks a violating layout, warns once, and a kept day writes one row', () => {
    const cases: [string, CampPlan][] = [
      ['pads_in_acclimation', withDay(cal, 2, { type: 'padded' })],
      ['day_off_after_acclimation', withDay(cal, 5, { type: 'full_speed' })],
      ['padded_streak', withDay(cal, 10, { type: 'padded' })],
      ['padded_run_gap', withDay(withDay(cal, 11, { type: 'full_speed' }), 12, { type: 'padded' })],
      ['padded_over_max', withDay(withDay(cal, 28, { type: 'padded' }), 43, { type: 'padded' })],
      ['day_off_every', withDay(cal, 11, { type: 'full_speed' })],
      ['post_game_day_off', withDay(cal, 25, { type: 'walkthrough' })],
      ['days_off_after_last_game', withDay(cal, 45, { type: 'walkthrough' })],
      ['final_days_off_run', withDay(cal, 40, { type: 'walkthrough' })],
      ['joint_before_game', withDay(cal, 30, { type: 'joint_full_speed' })],
      ['facility_hours', withDay(cal, 33, { facilityHours: 10.5 })],
    ];
    for (const [rule, p] of cases) {
      const v = checkCampPlan(p, PRO);
      expect(v.map((x) => x.rule), rule).toContain(rule);
      const kept = keepViolations([...v, ...v], (x) => x.rule === rule);
      expect(kept.warnings.length).toBe(v.length);
      expect(kept.rows.filter((r) => r.rule === rule)).toHaveLength(v.filter((x) => x.rule === rule).length);
      expect(kept.rows.every((r) => r.classId === 'work_rules_practice')).toBe(true);
    }
  });

  it('a fourth padded run of three is marked', () => {
    const t: DayType[] = ['report', 'acclimation', 'acclimation', 'acclimation', 'acclimation', 'off'];
    for (let r = 0; r < 4; r++) t.push('padded', 'padded', 'padded', 'full_speed', 'off', 'full_speed');
    expect(rulesOf(plan(t))).toContain('padded_runs');
  });

  it('a padded practice cancelled by weather within 60 minutes does not count toward 16', () => {
    const over = withDay(withDay(cal, 28, { type: 'padded' }), 43, { type: 'padded' });
    expect(rulesOf(over)).toContain('padded_over_max');
    expect(rulesOf(withDay(over, 43, { cancelledByWeather: true }))).not.toContain('padded_over_max');
  });

  it('the facility limit drops to 10 hours after the second preseason game', () => {
    expect(rulesOf(withDay(cal, 26, { facilityHours: 10.5 }))).not.toContain('facility_hours');
    expect(rulesOf(withDay(cal, 33, { facilityHours: 10.5 }))).toContain('facility_hours');
    expect(rulesOf(withDay(cal, 26, { facilityHours: 11.5 }))).toContain('facility_hours');
  });

  it('a third joint day in one preseason week is marked and its row has a certain trace', () => {
    const p = withDay(withDay(withDay(cal, 26, { type: 'joint_padded' }), 27, { type: 'joint_padded' }), 28, { type: 'joint_full_speed' });
    const v = checkCampPlan(p, PRO).filter((x) => x.rule === 'joint_per_week');
    expect(v).toHaveLength(1);
    expect(keepViolations(v, () => true).rows[0]!.certainTrace).toBe(true);
  });

  it('per diem from the weekly rate', () => {
    expect(perDiemCents(350_000, 14)).toBe(700_000);
  });
});

describe('M6.1.1 college rule file', () => {
  it('counts 29 practices and marks a fourth live-contact day inside 7', () => {
    const t: DayType[] = Array.from({ length: 31 }, (_, i) => (i === 0 ? 'report' : i < 5 ? 'acclimation' : 'full_speed'));
    const v = rulesOf(plan(t), COLLEGE);
    expect(v).toContain('practices_max');
    const live = { 6: { liveContact: true }, 7: { liveContact: true }, 9: { liveContact: true }, 11: { liveContact: true } };
    expect(rulesOf(plan(t.slice(0, 20), live), COLLEGE)).toContain('live_contact');
    expect(rulesOf(plan(t.slice(0, 20), { 6: { liveContact: true }, 7: { liveContact: true }, 13: { liveContact: true }, 16: { liveContact: true } }), COLLEGE)).not.toContain('live_contact');
  });
});

describe('M6.1.2 install schedule', () => {
  const days = [
    { day: 1, unit: 'offense', introduced: ['inside_zone', 'base_pro'], reviewed: [], situations: [] },
    { day: 7, unit: 'offense', introduced: ['play_action'], reviewed: ['inside_zone'], situations: ['red_zone'] },
    { day: 8, unit: 'defense', introduced: Array.from({ length: 9 }, (_, i) => `c${i}`), reviewed: [], situations: [] },
  ];
  it('a day with 9 new concepts for a returning staff shows the overload warning', () => {
    expect(installOverloads(days, true)).toEqual([{ day: 8, unit: 'defense', count: 9, cap: 8 }]);
    expect(installOverloads(days, false)).toHaveLength(1);
  });
  it('every sheet concept needs an install and a review day, else it is listed', () => {
    expect(missingFromInstall(['inside_zone', 'play_action', 'screen'], days)).toEqual([
      { concept: 'play_action', missing: ['review'] }, { concept: 'screen', missing: ['install', 'review'] },
    ]);
  });
  it('a run-fit concept installed only in acclimation is taught, not trained, until a padded rep', () => {
    const cal = staffCalendar();
    const fit = [{ day: 2, unit: 'defense', introduced: ['gap_fit'], reviewed: [], situations: [] }];
    expect(installState('gap_fit', true, cal, fit, [])).toBe('taught');
    expect(installState('gap_fit', true, cal, fit, [7])).toBe('trained');
    expect(installState('gap_fit', true, cal, fit, [3])).toBe('taught');
  });
  it('situations with no period before the first game are flagged; pace doubles with carry-over', () => {
    expect(situationsUncovered(['red_zone', 'two_minute'], days, 24)).toEqual(['two_minute']);
    expect(campInstallPace(4, true)).toBe(8);
    expect(campInstallPace(4, false)).toBe(4);
  });
});
