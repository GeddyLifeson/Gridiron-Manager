// S5.1.1 seat assignment: the head coach's game-day sheet. Each coach on the sheet gets one role with a place,
// a channel, a watch duty, a report duty and decision rights. College headsets are capped by rule; seats left
// without one work by hand signal and runner, with a delay. The user below head coach takes the line he is given.
import { sp, type SeatRules } from './params.ts';

export type SeatRole =
  | 'head_coach'
  | 'caller_offense'
  | 'caller_defense'
  | 'caller_assistant'
  | 'booth_coverage'
  | 'booth_front'
  | 'booth_offense'
  | 'personnel_caller'
  | 'position_bench'
  | 'signaler'
  | 'sub_getback'
  | 'game_management'
  | 'charter'
  | 'special_teams_coordinator';

export type Location = 'booth' | 'sideline';
export type Channel = 'offense' | 'defense' | 'special_teams' | 'head_coach' | 'analyst';
export type Side = 'offense' | 'defense' | 'special_teams' | 'whole_team';
export type CommMode = 'headset' | 'hand_signal_runner';

interface RoleDef {
  readonly location: Location | 'either';
  /** Which channel: the holder's side, or a fixed one. */
  readonly channel: 'side' | Channel;
  readonly watch: string;
  readonly report: string;
  readonly rights: readonly string[];
  /** Headset priority when the cap binds: lower goes first (S5.1.1, B13.10.1). */
  readonly headsetRank: number;
}

/** The S5.1.1 starting set (Assumption: which title sits where varies by staff). */
export const ROLES: Readonly<Record<SeatRole, RoleDef>> = {
  head_coach: { location: 'sideline', channel: 'head_coach', watch: 'everything', report: 'none', rights: ['game_management', 'intervene', 'challenge', 'timeout'], headsetRank: 0 },
  caller_offense: { location: 'either', channel: 'offense', watch: 'defense_look', report: 'calls', rights: ['call'], headsetRank: 1 },
  caller_defense: { location: 'either', channel: 'defense', watch: 'offense_look', report: 'calls', rights: ['call'], headsetRank: 1 },
  special_teams_coordinator: { location: 'sideline', channel: 'special_teams', watch: 'kicking_units', report: 'calls', rights: ['call_kicking'], headsetRank: 1 },
  caller_assistant: { location: 'sideline', channel: 'side', watch: 'side_unit', report: 'suggested_calls', rights: ['suggest_call', 'bench'], headsetRank: 2 },
  booth_coverage: { location: 'booth', channel: 'side', watch: 'coverage', report: 'coverage_family', rights: ['report'], headsetRank: 2 },
  booth_front: { location: 'booth', channel: 'side', watch: 'front_pressure', report: 'front_family', rights: ['report'], headsetRank: 2 },
  booth_offense: { location: 'booth', channel: 'side', watch: 'personnel_formation', report: 'personnel', rights: ['report'], headsetRank: 2 },
  game_management: { location: 'booth', channel: 'analyst', watch: 'situation', report: 'advice', rights: ['advise'], headsetRank: 2 },
  personnel_caller: { location: 'sideline', channel: 'side', watch: 'personnel_call', report: 'group', rights: ['call_group'], headsetRank: 3 },
  position_bench: { location: 'sideline', channel: 'side', watch: 'position_group', report: 'one_line', rights: ['substitute_group', 'correct'], headsetRank: 4 },
  charter: { location: 'booth', channel: 'side', watch: 'every_snap', report: 'chart', rights: ['chart', 'flag'], headsetRank: 5 },
  signaler: { location: 'sideline', channel: 'side', watch: 'call_heard', report: 'signal', rights: ['signal'], headsetRank: 6 },
  sub_getback: { location: 'sideline', channel: 'side', watch: 'personnel_call', report: 'none', rights: ['send_players'], headsetRank: 7 },
};

/** The fields the sheet reads from a catalogue job (G-25 CatalogueRow, structural). */
export interface SheetJob {
  readonly id: string;
  readonly rung: number | null;
  readonly side: string;
  readonly positionGroup: string;
  readonly gamedaySeat: 'booth' | 'sideline' | 'none';
}

export interface StaffSeat {
  readonly seatId: number;
  readonly personId: number;
  readonly job: SheetJob;
  /** The seat's side for `by_seat` jobs (graduate assistants, analysts). */
  readonly sideOverride?: Side;
  readonly callsPlays: boolean;
  readonly user: boolean;
}

export interface GamedayRole {
  readonly seatId: number;
  readonly personId: number;
  readonly role: SeatRole;
  readonly location: Location;
  readonly channel: Channel;
  readonly side: Side;
  readonly watch: string;
  readonly report: string;
  readonly rights: readonly string[];
  readonly comm: CommMode;
  /** Seconds added to every report from this seat (runner or hand signal when no headset). */
  readonly reportDelayS: number;
  readonly user: boolean;
}

function sideOf(s: StaffSeat): Side {
  if (s.sideOverride) return s.sideOverride;
  const v = s.job.side;
  return v === 'offense' || v === 'defense' || v === 'special_teams' ? v : 'whole_team';
}

/**
 * The role an AI head coach gives a job by default (S5.1.1 "usual holder" column). Returns null for jobs with
 * no game-day seat, and for the strength staff, whom the S5.1.1 set gives no role (they are left off the sheet).
 */
export function defaultRole(s: StaffSeat): SeatRole | null {
  const j = s.job;
  if (j.gamedaySeat === 'none') return null;
  const id = j.id;
  if (id.includes('strength')) return null;
  if (j.rung === 8 || j.rung === 9) return 'head_coach';
  if (id.includes('game_management') || id.includes('.analyst')) return 'game_management';
  if (id.includes('coordinator.special_teams')) return 'special_teams_coordinator';
  if (j.rung === 7 && (j.side === 'offense' || j.side === 'defense')) {
    if (!s.callsPlays) return 'caller_assistant';
    return j.side === 'offense' ? 'caller_offense' : 'caller_defense';
  }
  if (id.includes('quality_control.offense')) return 'booth_coverage';
  if (id.includes('quality_control.defense')) return 'booth_offense';
  if (id.includes('quality_control.special_teams')) return 'charter';
  if (id.includes('pass_game_coordinator')) return 'booth_coverage';
  if (id.includes('co_coordinator') || id.includes('run_game_coordinator') || id.includes('assistant_head_coach') || id.includes('senior_assistant')) return 'position_bench';
  if (id.includes('position_coach.ol') || id.includes('position_coach.dl')) return 'position_bench';
  if (id.includes('assistant_position_coach')) return 'personnel_caller';
  if (j.rung === 5) return 'position_bench';
  if (id.includes('graduate_assistant')) return 'charter';
  if (id.includes('student_assistant')) return 'signaler';
  if (id.includes('student_manager')) return 'sub_getback';
  return j.gamedaySeat === 'booth' ? 'charter' : 'sub_getback';
}

export interface SheetEntry { readonly seatId: number; readonly role: SeatRole; readonly location?: Location }

/**
 * Build the game-day sheet: each staff seat on it gets exactly one role. `entries` are the head coach's choices
 * (I1); any seat not named gets its default role. Headsets go by role rank (then seat id) up to the cap; the rest
 * work by hand signal and runner.
 */
export function buildSheet(staff: readonly StaffSeat[], rules: SeatRules, entries: readonly SheetEntry[] = []): GamedayRole[] {
  const chosen = new Map(entries.map((e) => [e.seatId, e]));
  const rows: { s: StaffSeat; role: SeatRole; loc: Location }[] = [];
  for (const s of staff) {
    const e = chosen.get(s.seatId);
    const role = e ? e.role : defaultRole(s);
    if (role === null) continue;
    const def = ROLES[role];
    const loc: Location = def.location === 'either' ? (e?.location ?? (s.job.gamedaySeat === 'booth' ? 'booth' : 'sideline')) : def.location;
    rows.push({ s, role, loc });
  }
  const order = [...rows].sort((a, b) => ROLES[a.role].headsetRank - ROLES[b.role].headsetRank || a.s.seatId - b.s.seatId);
  const cap = rules.headsetsMax ?? Infinity;
  const withHeadset = new Set(order.slice(0, cap).map((r) => r.s.seatId));
  return rows.map(({ s, role, loc }) => {
    const def = ROLES[role];
    const side = sideOf(s);
    const channel: Channel = def.channel === 'side' ? (side === 'whole_team' ? 'head_coach' : side) : def.channel;
    const comm: CommMode = withHeadset.has(s.seatId) ? 'headset' : 'hand_signal_runner';
    return {
      seatId: s.seatId, personId: s.personId, role, location: loc, channel, side, watch: def.watch, report: def.report, rights: def.rights,
      comm, reportDelayS: comm === 'headset' ? 0 : sp('comm.runnerDelayS'), user: s.user,
    };
  });
}

export interface SheetProblem { readonly seatId: number | null; readonly problem: 'duplicate_seat' | 'over_headset_cap' | 'no_role' }

/** S5.1.1 acceptance: every seat on the sheet has exactly one role, and the headset count is within the cap. */
export function checkSheet(sheet: readonly GamedayRole[], rules: SeatRules): SheetProblem[] {
  const out: SheetProblem[] = [];
  const seen = new Set<number>();
  for (const r of sheet) {
    if (seen.has(r.seatId)) out.push({ seatId: r.seatId, problem: 'duplicate_seat' });
    seen.add(r.seatId);
    if (!(r.role in ROLES)) out.push({ seatId: r.seatId, problem: 'no_role' });
  }
  const headsets = sheet.filter((r) => r.comm === 'headset').length;
  if (rules.headsetsMax !== undefined && headsets > rules.headsetsMax) out.push({ seatId: null, problem: 'over_headset_cap' });
  return out;
}

/** The user's own line on the Friday sheet (S5.1.1 "the user sees his line"). */
export const userLine = (sheet: readonly GamedayRole[]): GamedayRole | null => sheet.find((r) => r.user) ?? null;

/**
 * Headset failure (S5.1.1 edge case, I7): when the rule says both sides go off, every seat on either team loses
 * its headset; booth roles then report by phone or runner with a delay.
 */
export function onHeadsetFailure(sheet: readonly GamedayRole[], failedOwnSide: boolean, rules: SeatRules): GamedayRole[] {
  const off = failedOwnSide || rules.headsetFailureBothOff === true;
  if (!off) return [...sheet];
  return sheet.map((r) => r.comm === 'headset' ? { ...r, comm: 'hand_signal_runner' as const, reportDelayS: sp('comm.phoneDelayS') } : r);
}
