// Travel read model (H8.1.1 "What the user sees": for each away game a travel plan card lists two or three
// plans with the blocks each one changes: hours of practice and meetings lost, nights away and the body
// time of kickoff; H8.1.2 the travel day as editable blocks; H8.2.1 the body-time line; H8.2.2 the altitude
// flag). Each option is the week module's own `applyTravel` result, so the card and the week cannot differ.
import { calendar, week as wk } from '@gm/league';
import { weekParam } from './params.ts';
import type { TravelBlockView, TravelOptionView, TravelView } from './types.ts';

type Week = wk.Week;

export interface TravelInput {
  readonly week: Week;
  readonly gameId: string;
  readonly trip: wk.Trip;
  /** Hours the destination clock is ahead of home: positive going east, negative going west (C2). */
  readonly zoneShift: number;
  /** Home days shifted toward destination time (H8.2.1 option one). */
  readonly shiftedDays?: number;
  readonly homeAltitudeM: number;
  readonly siteAltitudeM: number;
  /** The plan the user picked, if any. */
  readonly chosen?: wk.PlanType;
}

const stamp = (i: calendar.Instant): string => `${calendar.iso(i.day)} ${calendar.formatTime(i.minute)}`;

const MEETING_TYPES: ReadonlySet<string> = new Set(['staff_meeting', 'team_meeting', 'unit_meeting', 'position_meeting', 'walkthrough']);

/** Body time of kickoff (H8.2.1): local kickoff moved by the offset left after adaptation. */
export function bodyKickoff(localMinute: number, zoneShift: number, daysOnSite: number, shiftedDays: number): { minute: number; offsetHours: number; early: boolean } {
  const offset = wk.bodyClockOffset(zoneShift, daysOnSite, shiftedDays);
  const mph = wk.P('minutes_per_hour');
  const east = zoneShift > 0;
  const minute = east ? localMinute - offset * mph : localMinute + offset * mph;
  return { minute, offsetHours: offset, early: east && wk.earlyBodyTimeKickoff(localMinute, offset) };
}

export function buildTravelView(i: TravelInput): TravelView {
  const w = i.week;
  const altitude = wk.altitudeFlag(i.homeAltitudeM, i.siteAltitudeM);
  if (w.home || !w.kickoff) return { weekId: w.weekId, home: true, gameId: null, thursdayOnlyStandard: false, altitude, options: [], travelDay: null };
  const kickoff = w.kickoff;
  const byId = new Map(wk.allBlocks(w).map((b) => [b.id, b]));
  const offered = wk.travelOptions(i.trip);
  const def = wk.defaultPlan(i.trip);
  const pick = i.chosen && offered.includes(i.chosen) ? i.chosen : def;
  const note = weekParam('travel.body_time_note_hours');
  let chosenResult: wk.TravelResult | null = null;
  const options: TravelOptionView[] = offered.map((plan) => {
    const r = wk.applyTravel(w, i.gameId, i.trip, plan);
    if (plan === pick) chosenResult = r;
    const lost = r.lost.map((id) => byId.get(id)).filter((b): b is wk.Block => b !== undefined);
    const practices = lost.filter((b) => b.type === 'practice');
    const daysOnSite = kickoff.day - r.plan.departAt.day;
    const body = bodyKickoff(kickoff.minute, i.zoneShift, daysOnSite, i.shiftedDays ?? 0);
    return {
      plan, isDefault: plan === def, chosen: plan === pick, mode: r.plan.mode,
      departs: stamp(r.plan.departAt), arrives: stamp(r.plan.arriveAt), returns: stamp(r.plan.returnAt),
      nightsAway: r.plan.nightsAway,
      practicesLost: practices.length,
      practiceMinutesLost: practices.reduce((s, b) => s + b.minutes, 0),
      meetingMinutesLost: lost.filter((b) => MEETING_TYPES.has(b.type)).reduce((s, b) => s + b.minutes, 0),
      blocksMoved: r.moved.length,
      bodyKickoff: body.offsetHours >= note ? calendar.formatTime(((body.minute % calendar.MINUTES_PER_DAY) + calendar.MINUTES_PER_DAY) % calendar.MINUTES_PER_DAY) : null,
      earlyBodyTime: body.early,
    };
  });
  const r = chosenResult as wk.TravelResult | null;
  let travelDay: TravelView['travelDay'] = null;
  if (r) {
    const day = r.plan.departAt.day;
    const blocks: TravelBlockView[] = wk.allBlocks(r.week).filter((b) => b.start.day === day)
      .map((b) => ({ id: b.id, type: b.type, start: calendar.formatTime(b.start.minute), minutes: b.minutes, location: b.location }));
    travelDay = { date: calendar.iso(day), blocks };
  }
  return { weekId: w.weekId, home: false, gameId: i.gameId, thursdayOnlyStandard: i.trip.thursdayGame, altitude, options, travelDay };
}
