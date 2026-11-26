import { describe, expect, it } from 'vitest';
import { CalendarEngine, type CalendarEvent } from '../../src/calendar/engine.ts';
import { CALENDAR_FILES } from '../../src/calendar/files.ts';
import { CALENDAR_KEYS, calendarLookup } from '../../src/calendar/keys.ts';
import { iso, parseIso, parseTime, yearStart } from '../../src/calendar/date.ts';
import type { CalendarLevel } from '../../src/calendar/types.ts';
import { weeklyDeadlines } from '../../src/calendar/weekly.ts';
import { G10_FIXTURE, fixtureRules } from './fixtures.ts';

const engine = new CalendarEngine({ files: CALENDAR_FILES, rules: fixtureRules });
const LEVELS: CalendarLevel[] = ['pro', 'college'];
const D = parseIso;

function yearEvents(y: number): CalendarEvent[] {
  return engine.advance({ day: yearStart(y), done: 0 }, { kind: 'until', day: yearStart(y + 1) }, { delegated: true }).events as CalendarEvent[];
}

describe('a year rolls January to January for both levels (G-12 acceptance 1)', () => {
  for (const y of [2026, 2027, 2031]) {
    it(`${y}${y === 2031 ? ' (pattern only, C4.7.1 rule 2)' : ''}`, () => {
      const r = engine.advance({ day: yearStart(y), done: 0 }, { kind: 'until', day: yearStart(y + 1) }, { delegated: true });
      expect(r.stoppedAt).toBeUndefined();
      expect(r.cursor).toEqual({ day: yearStart(y + 1), done: 0 });
      expect(r.events.filter((e) => e.type === 'DayStart')).toHaveLength(yearStart(y + 1) - yearStart(y));
      expect(r.events.filter((e) => e.id === 'league_year_begins')).toHaveLength(1);
      expect(r.events.filter((e) => e.id === 'college_year_begins')).toHaveLength(1);
      // Every day has a phase at both levels, and the season number advances on its rollover day.
      for (let d = yearStart(y); d < yearStart(y + 1); d++) {
        for (const lv of LEVELS) expect(engine.phaseOf(lv, d), `${lv} ${iso(d)}`).toBeDefined();
      }
      const lys = r.events.find((e) => e.id === 'league_year_begins')!;
      expect(engine.seasonOf('pro', lys.day - 1)).toBe(y - 1);
      expect(engine.seasonOf('pro', lys.day)).toBe(y);
      expect(engine.seasonOf('college', yearStart(y))).toBe(y);
      // Events are in delivery order.
      for (let i = 1; i < r.events.length; i++) {
        const a = r.events[i - 1]!, b = r.events[i]!;
        expect(a.day * 1440 + a.minute <= b.day * 1440 + b.minute || a.day < b.day).toBe(true);
      }
    });
  }

  it('phases come in the C4.1.1 order for a club outside the playoffs', () => {
    const starts = yearEvents(2026).filter((e) => e.type === 'PhaseStart' && e.level === 'pro').map((e) => e.id);
    const order = ['season_review', 'staff_changes', 'predraft', 'free_agency', 'program_phase1', 'draft', 'program_phase1', 'program_phase2',
      'program_phase3', 'mandatory_minicamp', 'program_phase3', 'summer_break', 'training_camp', 'preseason', 'cutdown', 'regular_season'];
    expect(starts).toEqual(order);
  });

  it('college phases for a school outside the postseason', () => {
    const starts = yearEvents(2026).filter((e) => e.type === 'PhaseStart' && e.level === 'college').map((e) => e.id);
    expect(starts).toEqual(['college_winter', 'college_spring_practice', 'college_summer', 'college_preseason_practice', 'college_regular_season', 'college_offseason']);
  });
});

describe('every window opens and closes on its rule key (G-12 acceptance 2)', () => {
  for (const lv of LEVELS) {
    for (const season of [2026, 2027, 2031]) {
      it(`${lv} ${season}`, () => {
        const s = engine.resolver(lv).season(season);
        const evs = [...yearEvents(season), ...yearEvents(season + 1)];
        expect(s.windows.length).toBeGreaterThan(20);
        for (const w of s.windows) {
          const open = s.anchors.get(w.def.opens)!;
          const close = w.def.closes ? s.anchors.get(w.def.closes.replace(/^next:/, '')) : undefined;
          if (!w.def.repeat) {
            expect(w.openDay, `${w.id} opens on ${w.def.opens}`).toBe(open.day);
            if (w.def.closes && !w.def.closes.startsWith('next:')) expect(w.closeDay, `${w.id} closes on ${w.def.closes}`).toBe(close!.day);
          }
          if (w.def.kind === 'phase') continue; // phases are reported as PhaseStart per club, below
          const mine = evs.filter((e) => e.level === lv && e.season === season && e.id === w.id);
          if (w.def.kind === 'deadline' || w.def.kind === 'event' || w.def.kind === 'cohort') {
            expect(mine.filter((e) => e.type !== 'StageMarker').map((e) => e.day), w.id).toEqual([w.openDay]);
          } else {
            expect(mine.find((e) => e.type === 'WindowOpened')?.day, `${w.id} opened`).toBe(w.openDay);
            expect(mine.find((e) => e.type === 'WindowClosed')?.day, `${w.id} closed`).toBe(w.closeDay);
          }
        }
      });
    }
  }

  it('every window and anchor carries a leaf, a source and a status', () => {
    for (const f of CALENDAR_FILES) {
      for (const a of f.anchors) {
        expect(a.leaf && a.source && a.status, `${f.level} ${f.season ?? 'pattern'} ${a.id}`).toBeTruthy();
      }
      for (const w of f.windows ?? []) expect(w.leaf, w.id).toMatch(/^[A-Z]\d+/);
    }
  });

  it('dated years use real dates; a year with no file falls back to the pattern', () => {
    const pro26 = engine.resolver('pro').season(2026);
    expect(pro26.anchors.get('league_year_start')!.fromPattern).toBe(false);
    expect(pro26.anchors.get('league_year_start')!.factId).toBe('F-league-0042');
    const pro31 = engine.resolver('pro').season(2031);
    expect(pro31.dated).toBe(false);
    expect([...pro31.anchors.values()].every((a) => a.fromPattern)).toBe(true);
    expect(pro31.anchors.get('league_year_start')!.status).toBe('Assumption');
    expect(iso(pro31.anchors.get('league_year_start')!.day)).toBe('2031-03-12');
  });
});

describe('real dates from C4 (pro 2026 file)', () => {
  const s = engine.resolver('pro').season(2026);
  const at = (id: string) => { const a = s.anchors.get(id)!; return a.minute === undefined ? iso(a.day) : `${iso(a.day)} ${String(Math.floor(a.minute / 60)).padStart(2, '0')}:${String(a.minute % 60).padStart(2, '0')}`; };
  const cases: [string, string][] = [
    ['tag_window_open', '2026-02-17'], ['tag_window_close', '2026-03-03 16:00'], ['negotiating_open', '2026-03-09 12:00'],
    ['negotiating_close', '2026-03-11 15:59'], ['league_year_start', '2026-03-11 16:00'], ['rfa_offer_sheet_deadline', '2026-04-17'],
    ['rfa_rofr_deadline', '2026-04-22'], ['draft_start', '2026-04-23'], ['draft_end', '2026-04-25'], ['fifth_year_option_deadline', '2026-05-01 16:00'],
    ['rfa_tender_june1', '2026-06-01 16:00'], ['rfa_tender_june15', '2026-06-15 16:00'], ['tag_multiyear_deadline', '2026-07-15 16:00'],
    ['ufa_tender_deadline', '2026-07-22 16:00'], ['cutdown', '2026-08-30 18:00'], ['cutdown_claims_expire', '2026-08-31 13:00'],
    ['practice_squad_formation', '2026-08-31 13:00'], ['trade_deadline', '2026-11-10 16:00'], ['vested_waivers_begin', '2026-11-11'],
    ['playoff_roster_freeze', '2027-01-13'], ['championship_game', '2027-02-14'], ['last_regular_game', '2027-01-10'],
    ['program_start', '2026-04-20'], ['program_start_new_hc', '2026-04-06'],
  ];
  for (const [id, want] of cases) it(`${id} = ${want}`, () => expect(at(id)).toBe(want));

  it('the pattern reproduces the sourced dates it was built from', () => {
    // C4.2.4: tag window from the 22nd to the 8th day before the league year; the 2026 file says the same.
    const p = new CalendarEngine({ files: CALENDAR_FILES.filter((f) => f.kind === 'pattern'), rules: fixtureRules }).resolver('pro').season(2026);
    for (const id of ['league_year_start', 'tag_window_close', 'negotiating_open', 'trade_deadline', 'vested_waivers_begin', 'championship_game', 'kickoff_sunday']) {
      expect(iso(p.anchors.get(id)!.day), id).toBe(iso(s.anchors.get(id)!.day));
    }
    const p27 = new CalendarEngine({ files: CALENDAR_FILES.filter((f) => f.kind === 'pattern'), rules: fixtureRules }).resolver('pro').season(2027);
    for (const [id, want] of [['program_start', '2027-04-19'], ['program_start_new_hc', '2027-04-05'], ['combine_open', '2027-03-01'], ['draft_start', '2027-04-29']]) {
      expect(iso(p27.anchors.get(id!)!.day), id).toBe(want);
    }
  });

  it('postseason weeks: wild card Saturday January 16, divisional 23 and 24, conference 31 (C4.6.1)', () => {
    const w = (id: string) => s.windows.find((x) => x.id === id)!;
    expect(iso(w('wild_card').openDay)).toBe('2027-01-12');
    expect(D('2027-01-16')).toBeGreaterThanOrEqual(w('wild_card').openDay);
    expect(D('2027-01-16')).toBeLessThanOrEqual(w('wild_card').closeDay);
    expect(D('2027-01-24')).toBeLessThanOrEqual(w('divisional').closeDay);
    expect(D('2027-01-31')).toBeLessThanOrEqual(w('conference_championship').closeDay);
    expect(s.windows.filter((x) => x.def.id === 'regular_week')).toHaveLength(18);
  });
});

describe('college calendar files load both T3.2.1 columns with no code change', () => {
  const c26 = engine.resolver('college').season(2026);
  const c27 = engine.resolver('college').season(2027);
  const win = (s: typeof c26, id: string) => { const w = s.windows.find((x) => x.id === id); return w && `${iso(w.openDay)}..${iso(w.closeDay)}`; };
  it('2026 column', () => {
    expect(win(c26, 'transfer_window')).toBe('2026-01-02..2026-01-16');
    expect(win(c26, 'playoff_r1')).toBe('2026-12-18..2026-12-19');
    expect(win(c26, 'playoff_r2')).toBeUndefined();
    expect(win(c26, 'playoff_qf')).toBe('2026-12-30..2027-01-01');
    expect(win(c26, 'playoff_sf')).toBe('2027-01-14..2027-01-15');
    expect(iso(c26.anchors.get('playoff_final')!.day)).toBe('2027-01-25');
    expect(win(c26, 'early_signing')).toBe('2026-12-02..2026-12-04');
    // 2026 recruiting periods follow the official calendar: Jan. 11 quiet, Jan. 12-14 dead and Feb. 1 quiet split the contact and dead runs (15 windows).
    expect(c26.windows.filter((w) => w.def.period).length).toBe(15);
  });
  it('2027 column', () => {
    expect(win(c27, 'transfer_window')).toBe('2027-01-04..2027-01-13');
    expect(iso(c27.anchors.get('first_saturday')!.day)).toBe('2027-08-28');
    expect(iso(c27.anchors.get('regular_season_end')!.day)).toBe('2027-11-27');
    expect(win(c27, 'playoff_r1')).toBe('2027-12-09..2027-12-11');
    expect(win(c27, 'playoff_r2')).toBe('2027-12-16..2027-12-18');
    expect(win(c27, 'playoff_qf')).toBe('2027-12-31..2028-01-01');
    expect(win(c27, 'playoff_sf')).toBe('2028-01-13..2028-01-14');
    expect(iso(c27.anchors.get('playoff_final')!.day)).toBe('2028-01-24');
    expect(win(c27, 'recruiting_j1')).toBe('2027-01-01..2027-01-13');
    expect(win(c27, 'recruiting_j2')).toBe('2027-01-14..2027-01-31');
    expect(win(c27, 'preseason_practice')).toBe('2027-08-01..2027-08-27');
  });
  it('the college pattern reproduces the 2027 shape', () => {
    const p = new CalendarEngine({ files: CALENDAR_FILES.filter((f) => f.kind === 'pattern'), rules: fixtureRules }).resolver('college').season(2027);
    for (const id of ['first_saturday', 'regular_season_end', 'playoff_r1_start', 'playoff_r2_start', 'playoff_sf_start', 'playoff_final', 'transfer_window_open']) {
      expect(iso(p.anchors.get(id)!.day), id).toBe(iso(c27.anchors.get(id)!.day));
    }
  });
});

describe('advancing time (C4.1.1 acceptance)', () => {
  const start = { day: D('2026-08-25'), done: 0 };
  const games = [D('2026-09-13'), D('2026-09-20'), D('2026-09-27'), D('2026-10-04')];

  it('day by day and "next game" reach the same state', () => {
    let c = start;
    const stepped: CalendarEvent[] = [];
    while (c.day < games[3]!) { const r = engine.advance(c, { kind: 'day' }, { delegated: true }); stepped.push(...r.events); c = r.cursor; }
    let j = start;
    const jumped: CalendarEvent[] = [];
    for (let i = 0; i < 4; i++) { const r = engine.advance(j, { kind: 'nextGame', gameDays: games }, { delegated: true }); jumped.push(...r.events); j = r.cursor; }
    expect(j).toEqual(c);
    expect(jumped).toEqual(stepped);
    const n = engine.advance(start, { kind: 'days', n: games[3]! - start.day }, { delegated: true });
    expect(n.events).toEqual(stepped);
  });

  it('no deadline can pass without its check running', () => {
    const seen: string[] = [];
    const r = engine.advance({ day: yearStart(2026), done: 0 }, { kind: 'until', day: yearStart(2027) }, { check: (e) => { seen.push(e.id); return false; } });
    const deadlines = r.events.filter((e) => e.type === 'Deadline');
    expect(r.checksRun).toBe(deadlines.length);
    expect(seen).toEqual(deadlines.map((e) => e.id));
    expect(seen).toContain('cutdown_deadline');
    expect(seen).toContain('transfer_window_close');
  });

  it('time stops at the cutdown deadline while the user roster is over the limit (C4.4.4)', () => {
    let over = true;
    const ctx = { check: (e: CalendarEvent) => e.id === 'cutdown_deadline' && over };
    const r = engine.advance({ day: D('2026-08-20'), done: 0 }, { kind: 'until', day: D('2026-09-10') }, ctx);
    expect(r.stoppedAt?.id).toBe('cutdown_deadline');
    expect(iso(r.cursor.day)).toBe('2026-08-30');
    const again = engine.advance(r.cursor, { kind: 'day' }, ctx);
    expect(again.stoppedAt?.id).toBe('cutdown_deadline');
    over = false;
    const go = engine.advance(r.cursor, { kind: 'until', day: D('2026-09-10') }, ctx);
    expect(go.stoppedAt).toBeUndefined();
    expect(go.events[0]!.id).toBe('cutdown_deadline');
  });

  it('a non-stopping deadline applies its default instead (trade deadline)', () => {
    const r = engine.advance({ day: D('2026-11-09'), done: 0 }, { kind: 'days', n: 3 }, { check: () => true });
    expect(r.stoppedAt).toBeUndefined();
    expect(r.defaultsApplied.map((e) => e.id)).toContain('trade_deadline');
  });

  it('a delegated year never stalls and takes every default (C4.1.1 acceptance 3)', () => {
    const r = engine.advance({ day: yearStart(2026), done: 0 }, { kind: 'until', day: yearStart(2027) }, { delegated: true, check: () => true });
    expect(r.stoppedAt).toBeUndefined();
    expect(r.defaultsApplied.length).toBe(r.checksRun);
  });

  it('next deadline jump stops right after the deadline', () => {
    const r = engine.advance({ day: D('2026-02-02'), done: 0 }, { kind: 'nextDeadline', level: 'pro' }, {});
    const last = r.events[r.events.length - 1]!;
    expect(last.id).toBe('tag_deadline');
    expect(iso(r.cursor.day)).toBe('2026-03-03');
  });

  it('30 seasons advance with all tasks delegated and no stall (C4.7.1 acceptance)', () => {
    let c = { day: yearStart(2026), done: 0 };
    const lys: number[] = [];
    for (let y = 2026; y < 2056; y++) {
      const r = engine.advance(c, { kind: 'until', day: yearStart(y + 1) }, { delegated: true, check: () => true });
      expect(r.stoppedAt).toBeUndefined();
      lys.push(...r.events.filter((e) => e.id === 'league_year_begins').map((e) => e.season!));
      c = r.cursor;
    }
    expect(lys).toEqual(Array.from({ length: 30 }, (_, i) => 2026 + i));
  });

  it('date bar shows date, phase, days to the next deadline and game', () => {
    const bar = engine.dateBar('pro', D('2026-08-28'), {}, [D('2026-09-13')]);
    expect(bar).toMatchObject({ date: '2026-08-28', phaseId: 'preseason', nextDeadline: 'Roster reduction to 53', daysToDeadline: 2, daysToGame: 16, season: 2026 });
  });
});

describe('phase per club on a shared calendar (C4.1.1 rule 3, C4.6.1)', () => {
  it('an eliminated club starts its season review the day after its last game', () => {
    const lost = D('2027-01-24');
    const club = { inPostseason: true, lastGameDay: lost };
    expect(engine.phaseOf('pro', D('2027-01-20'), club)!.id).toBe('divisional');
    expect(engine.phaseOf('pro', D('2027-01-15'))!.id).toBe('season_review');
    expect(engine.phaseOf('pro', D('2027-01-20'))!.id).toBe('staff_changes');
    expect(engine.phaseOf('pro', lost + 1, club)!.id).toBe('season_review');
    expect(engine.phaseOf('pro', lost + 7, club)!.id).toBe('season_review');
    expect(engine.phaseOf('pro', lost + 8, club)!.id).toBe('staff_changes');
    expect(engine.phaseOf('pro', D('2027-01-20'), { inPostseason: true })!.id).toBe('divisional');
  });
  it('the champion reviews its season into Pre-draft', () => {
    const club = { inPostseason: true, lastGameDay: D('2027-02-14') };
    expect(engine.phaseOf('pro', D('2027-02-14'), club)!.id).toBe('league_championship');
    expect(engine.phaseOf('pro', D('2027-02-17'), club)!.id).toBe('season_review');
    expect(engine.phaseOf('pro', D('2027-02-22'), club)!.id).toBe('predraft');
  });
  it('a new head coach starts the program two weeks earlier (C4.3.1)', () => {
    expect(engine.phaseOf('pro', D('2026-04-07'), { newHeadCoach: true })!.id).toBe('program_phase1_new_hc');
    expect(engine.phaseOf('pro', D('2026-04-07'))!.id).toBe('free_agency');
    expect(engine.phaseOf('pro', D('2026-06-03'), { newHeadCoach: true })!.id).toBe('mandatory_minicamp_new_hc');
  });
  it('a college playoff team stays in the postseason into January', () => {
    const club = { inPostseason: true, lastGameDay: D('2027-01-14') };
    expect(engine.phaseOf('college', D('2026-12-20'), club)!.id).toBe('college_postseason');
    expect(engine.phaseOf('college', D('2027-01-10'), club)!.id).toBe('college_postseason');
    expect(engine.phaseOf('college', D('2027-01-15'), club)!.id).toBe('college_winter');
    expect(engine.phaseOf('college', D('2026-12-20'))!.id).toBe('college_offseason');
  });
  it('club camp report date: 47 days before its opener, 48 for a Monday opener (C4.4.2)', () => {
    expect(iso(engine.clubReportDay(D('2026-09-13'), false, fixtureRules).day)).toBe('2026-07-28');
    expect(iso(engine.clubReportDay(D('2026-09-14'), true, fixtureRules).day)).toBe('2026-07-28');
  });
});

describe('cohort windows (X11.1.1)', () => {
  it('each season has exactly one cohort_entered per cohort kind', () => {
    const counts = new Map<string, Map<number, number>>();
    for (let y = 2027; y < 2037; y++) {
      for (const e of yearEvents(y).filter((x) => x.type === 'CohortEntered')) {
        const m = counts.get(e.cohort!) ?? new Map<number, number>();
        m.set(e.season!, (m.get(e.season!) ?? 0) + 1);
        counts.set(e.cohort!, m);
      }
    }
    expect([...counts.keys()].sort()).toEqual(['coach_staff_entry', 'college_walk_on', 'pro_entry_pool', 'recruit_class', 'undrafted_pool']);
    for (const [kind, m] of counts) {
      for (let s = 2028; s < 2035; s++) {
        const want = kind === 'coach_staff_entry' ? 2 : 1; // one per level's hiring cycle
        expect(m.get(s), `${kind} ${s}`).toBe(want);
      }
    }
  });
  it('the undrafted pool forms the day the draft ends', () => {
    for (const y of [2026, 2027, 2031]) {
      const s = engine.resolver('pro').season(y);
      expect(s.windows.find((w) => w.id === 'cohort_undrafted_pool')!.openDay).toBe(s.windows.find((w) => w.id === 'draft')!.closeDay);
    }
  });
  it('exits and vacancies come before a cohort on the same date', () => {
    const day = engine.eventsOn(D('2026-09-01'));
    const i = day.findIndex((e) => e.type === 'CohortEntered');
    expect(day.slice(i - 2, i).map((e) => e.id)).toEqual(['exits', 'vacancies']);
  });
});

describe('rule keys', () => {
  it('calendar rows never disagree with league-rules keys', () => {
    for (const row of CALENDAR_KEYS) if (G10_FIXTURE[row.key] !== undefined) expect(G10_FIXTURE[row.key]).toBe(row.value);
    const bad = calendarLookup((k) => (k === 'calendar.regular_season_weeks' ? 17 : undefined));
    expect(() => bad('calendar.regular_season_weeks')).toThrow(/17/);
  });
  it('a missing key is an error, not a silent default', () => {
    const e = new CalendarEngine({ files: CALENDAR_FILES, rules: calendarLookup(() => undefined) });
    expect(() => e.resolver('pro').season(2026)).toThrow(/rule key [a-z_.]+ is not defined/);
  });
  it('the league-rules file values the calendar reads match the G-10 sourced dates', () => {
    const s = engine.resolver('pro').season(2026);
    const d = (id: string) => iso(s.anchors.get(id)!.day);
    expect(d('league_year_start')).toBe(`2026-03-${G10_FIXTURE['calendar.league_year_start_march_day']}`);
    expect(d('negotiating_open')).toBe(`2026-03-0${G10_FIXTURE['calendar.negotiating_window_start_march_day']}`);
    expect(d('tag_window_open')).toBe(`2026-02-${G10_FIXTURE['calendar.tag_window_opens_feb_day']}`);
  });
});

describe('in-week deadlines (C4.5.1)', () => {
  it('fire at their offsets for a game week and not in a bye week', () => {
    const kick = { day: D('2026-09-13'), minute: parseTime('13:00') };
    const list = weeklyDeadlines(kick, 'game');
    expect(list.find((x) => x.id === 'inactives')!.at).toEqual({ day: kick.day, minute: parseTime('11:30') });
    expect(list.filter((x) => x.id === 'practice_report').map((x) => iso(x.at.day))).toEqual(['2026-09-09', '2026-09-10', '2026-09-11']);
    expect(iso(list.find((x) => x.id === 'game_status')!.at.day)).toBe('2026-09-12');
    expect(weeklyDeadlines(kick, 'bye')).toEqual([]);
  });
});
