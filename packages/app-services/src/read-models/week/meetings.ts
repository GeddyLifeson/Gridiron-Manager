// Meetings read model (H4.1.1 "What the user sees": each meeting block shows its type and opens the agenda
// editor; types he does not lead show the leader's planned agenda for review. H4.1.2: a list of items with
// minutes, a timeline that marks long stretches without a break and the day's total meeting time. After
// the meeting the leader's report in words). The attention value stays hidden (K9, audit Part 17): the
// timeline marks minutes, never expected attention.
import { calendar, week as wk } from '@gm/league';
import { weekParam } from './params.ts';
import type { AgendaInput, AgendaRowView, AgendaWarning, MeetingDayView, MeetingView, MeetingsView } from './types.ts';

type Week = wk.Week;
type Block = wk.Block;

/**
 * Block types the meetings screen lists: the H4-owned blocks (H1.1.1 rule 5). Game-planning blocks are
 * the staff's G6 work days, not meetings, and open the game plan screen instead.
 */
const MEETING_BLOCKS: ReadonlySet<string> = new Set(['staff_meeting', 'team_meeting', 'unit_meeting', 'position_meeting']);

/** Attendee groups that are players: their meeting minutes count toward the daily total (H4.1.2 rule 3). */
const PLAYER_GROUPS: ReadonlySet<string> = new Set(['team', 'offense', 'defense', 'quarterbacks', 'leaders']);

/** Editor item kinds per meeting type (H4.1.2, H4.2.1 team meeting, H4.2.3 night before, H4.3.1 staff). */
export const ITEM_KINDS: Readonly<Record<string, readonly string[]>> = {
  general: ['install', 'film_corrections', 'opponent_report', 'situational', 'test', 'message', 'administrative', 'break', 'walkthrough'],
  team: ['theme', 'corrections', 'situational', 'opponent_overview', 'accountability', 'recognition', 'schedule_rules', 'rules_review', 'break'],
  night_before: ['keys', 'reminders', 'highlight_tape', 'guest_speaker'],
  staff: ['personnel_injury', 'schedule', 'plan_summaries', 'practice_emphasis', 'roster_decisions', 'open_floor'],
};

/** The H4.1.1 meeting type a block stands for. */
export function meetingType(b: Block, gMinus: number): string {
  switch (b.type) {
    case 'staff_meeting': return 'staff';
    case 'team_meeting':
      if (gMinus === 1 && b.start.minute >= weekParam('meeting.night_before_from_minute')) return 'night_before';
      return b.attendees.includes('leaders') ? 'leadership_council' : 'team';
    case 'unit_meeting': return b.leader === 'st_coordinator' ? 'special_teams' : 'unit';
    case 'position_meeting': return b.attendees.includes('quarterbacks') ? 'quarterback' : 'position';
    default: return b.type;
  }
}

function kindsFor(type: string): readonly string[] {
  return ITEM_KINDS[type] ?? ITEM_KINDS.general!;
}

/** Agenda rows with the timeline marks. `newSoFar` counts new install items already taught today per unit. */
export function agendaRows(rows: readonly AgendaInput[], newSoFar: Record<string, number>): AgendaRowView[] {
  const flat = wk.P('attention_flat_minutes');
  const perPlay = wk.P('meeting_mentioned_minutes_per_play');
  const dailyNew = wk.P('meeting_daily_new_items');
  let run = 0;
  return rows.map((r, i) => {
    const warnings: AgendaWarning[] = [];
    if (r.kind === 'break' || r.kind === 'walkthrough') run = 0;
    else {
      run += r.minutes;
      if (run > flat) warnings.push('long_stretch');
    }
    if (r.kind === 'install' && (r.plays ?? 0) > 0 && r.minutes / (r.plays ?? 1) < perPlay) warnings.push('mentioned_only');
    if (r.kind === 'install' && r.newItem) {
      const unit = r.unit ?? 'team';
      newSoFar[unit] = (newSoFar[unit] ?? 0) + 1;
      if (newSoFar[unit]! > dailyNew) warnings.push('over_install_limit');
    }
    return { n: i + 1, kind: r.kind, label: r.label, minutes: r.minutes, runMinutes: run, warnings };
  });
}

export interface MeetingsInput {
  readonly week: Week;
  /** Saved agendas by block id. A block without one runs the leader's default. */
  readonly agendas: Readonly<Record<string, readonly AgendaInput[]>>;
  /** The leader roles the user fills this week (head_coach; or off_coordinator and play_caller; ...). */
  readonly userRoles: readonly string[];
  /** Night-before tone by block id. */
  readonly tones?: Readonly<Record<string, string>>;
  /** Leaders' reports in words after a meeting, by block id. */
  readonly reports?: Readonly<Record<string, string>>;
}

export function buildMeetingsView(i: MeetingsInput): MeetingsView {
  const done = new Set(i.week.completed);
  const user = new Set(i.userRoles);
  const cap = wk.P('meeting_day_cap_minutes');
  const days: MeetingDayView[] = [];
  for (const d of i.week.days) {
    const newSoFar: Record<string, number> = {};
    const meetings: MeetingView[] = [];
    let total = 0;
    for (const b of d.blocks) {
      if (!MEETING_BLOCKS.has(b.type)) continue;
      const type = meetingType(b, d.gMinus);
      const saved = i.agendas[b.id];
      const agenda = saved ? agendaRows(saved, newSoFar) : [];
      const planned = saved ? agenda.reduce((s, r) => s + r.minutes, 0) : b.minutes;
      if (b.attendees.some((a) => PLAYER_GROUPS.has(a))) total += planned;
      meetings.push({
        blockId: b.id, type, start: calendar.formatTime(b.start.minute), minutes: b.minutes, leader: b.leader, attendees: b.attendees,
        editable: user.has(b.leader), done: done.has(b.id), defaultAgenda: !saved, agenda, planned, left: b.minutes - planned,
        itemKinds: kindsFor(type),
        tone: type === 'night_before' ? i.tones?.[b.id] ?? null : null,
        tones: type === 'night_before' ? wk.TONES : [],
        report: i.reports?.[b.id] ?? null,
      });
    }
    days.push({ date: calendar.iso(d.day), label: d.gMinus === 0 ? 'G' : `G-${d.gMinus}`, meetings, totalMinutes: total, capMinutes: cap, overCap: total > cap });
  }
  return { weekId: i.week.weekId, days, longStretchMinutes: wk.P('attention_flat_minutes') };
}
