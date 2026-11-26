// Team hub sources for the career root (handoff item 2c, O1.2, O4): the route sources of the team screens,
// fed from the season's generated world through the observer (G-27). Each hub keeps its sources in its own
// file under app-root/sources, so the career root registers a hub with one line.
//
// Fed now: roster and player card (people read models over the seat team's observed world). The people host
// serves the other people screens too (staff, coach card, locker room, owner), since one source binds all six.
// Cap sheet (pro): the world's player contracts through play.seatCapView. Staff job ids read as catalogue titles through the host's text lookup.
// Not fed yet, so those screens stay placeholders: depth chart (no unit content or saved chart in the world),
// roster moves (league roster state, G-15), draft room and free
// agency (offseason state of the career year), recruiting board (no app-services barrel line yet), health
// (no screen route). See the PR description for the list.
import { people as peopleModels, play, type observer } from '@gm/app-services';
import type { RouteSources } from '../../routes.ts';
import type { CapHost } from '../../screens/cap/index.ts';
import type { CapUi } from '../../screens/cap/view.ts';
import type { PeopleHost, PeopleWorkHost } from '../../screens/people/index.ts';
import type { UiDelegation } from '../../screens/people/work-view.ts';
import type { UiCard, UiCoachCard, UiLockerRoom, UiOwner, UiRoster, UiStaff } from '../../screens/people/view.ts';
import type { CareerPort, SeatWorld } from '../port.ts';

export type TeamSources = Pick<RouteSources, 'people' | 'cap' | 'peopleWork'>;

/** The seat's observed world, built once per seat world (the world moves only between seasons). */
function observedOnce(seat: SeatWorld): () => observer.ObservedWorld {
  let w: observer.ObservedWorld | null = null;
  return () => (w ??= play.seatObservedWorld(seat.world, seat.teamId, seat.userPersonId));
}

/** The people host over the seat's observed world. Intents other than opening a screen have no command yet. */
export function peopleHostFor(seat: SeatWorld): PeopleHost {
  const world = observedOnce(seat);
  const limits = play.rosterLimits(seat.leagueRules, seat.level);
  const club = seat.teamId;
  const coachId = seat.userPersonId;
  return {
    roster: () => peopleModels.buildRosterTable(world(), club, { limits }) as UiRoster,
    card: (personId) => (personId > 0 ? (peopleModels.buildPlayerCard(world(), club, personId, {}, { coachId }) as unknown as UiCard | null) : null),
    staff: () => peopleModels.buildStaff(world(), club) as unknown as UiStaff,
    coach: (personId) => (personId > 0 ? (peopleModels.buildCoachCard(world(), club, personId) as unknown as UiCoachCard | null) : null),
    lockerRoom: () => (coachId === null ? null : (peopleModels.buildLockerRoom(world(), club, coachId) as unknown as UiLockerRoom)),
    owner: () => peopleModels.buildOwnerView(world(), club) as unknown as UiOwner,
    name: (personId) => {
      const p = seat.world.people.get(personId) as { name?: { first?: string; last?: string; suffix?: string | null } } | undefined;
      return peopleModels.displayName(p?.name, personId);
    },
    // Content keys the screens show through the host: staff job ids read as their catalogue titles.
    text: (key) => peopleModels.jobTitle(key) ?? key,
    // Re-evaluation, notes and meeting requests are world commands the career root does not run yet.
    dispatch: () => undefined,
  };
}

/** The cap sheet over the world's player contracts (pro only; college budgets have no live store yet). Moves have no command yet. */
export function capHostFor(seat: SeatWorld): CapHost | null {
  if (seat.level !== 'pro') return null;
  let v: CapUi | null | undefined;
  return {
    view: () => (v === undefined ? (v = play.seatCapView(seat.world, seat.teamId, seat.leagueRules, seat.level) as unknown as CapUi | null) : v),
    // Release and trade-shop are roster engine commands (G-15) the career root does not run yet.
    dispatch: () => undefined,
  };
}

/**
 * Delegation over the seat club's staff chart, settings saved in the world's system state. Player meetings
 * and staff one-on-ones need the promise ledger and agendas the save does not keep yet, so they stay empty.
 */
export function peopleWorkHostFor(seat: SeatWorld, onChange?: () => void): PeopleWorkHost {
  const args = [seat.world, seat.teamId, seat.level, seat.userPersonId] as const;
  return {
    delegation: () => play.seatDelegation(...args) as unknown as UiDelegation | null,
    previewDelegation: (draft) => play.seatDelegation(...args, draft as never) as unknown as UiDelegation | null,
    meeting: () => null,
    staffTalk: () => null,
    staffList: () => (play.seatDelegationInputs(...args)?.staff ?? []).map((s) => ({ personId: s.personId, name: s.name })),
    text: (key) => peopleModels.jobTitle(key) ?? key,
    dispatch: (i) => {
      if (i.kind === 'preset') play.saveSeatDelegation(...args, { preset: i.preset });
      else if (i.kind === 'saveDelegation') play.saveSeatDelegation(...args, { assignments: i.assignments as never });
      else return;
      onChange?.();
    },
  };
}

const made = new WeakMap<CareerPort, TeamSources>();

/** The team hub's route sources for this career (made once per career); none on a quick start, which has no generated world. */
export function teamSources(port: CareerPort, onChange?: () => void): TeamSources {
  let s = made.get(port);
  if (!s) {
    const seat = port.seatWorld?.() ?? null;
    const capHost = seat ? capHostFor(seat) : null;
    s = seat ? { people: peopleHostFor(seat), peopleWork: peopleWorkHostFor(seat, onChange), ...(capHost ? { cap: capHost } : {}) } : {};
    made.set(port, s);
  }
  return s;
}
