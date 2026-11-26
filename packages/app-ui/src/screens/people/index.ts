// @gm/app-ui, people screens (G-72): player card, roster, staff, coach card, locker room, owner and
// general manager. The integrator adds the routes to the shell's route table:
// `putAll(peopleRoutes(s.people))` in buildRoutes (CR-G72-4).
import { createElement } from 'react';
import { screenById, type RouteEntry, type RouteTable } from '../../shell/index.ts';
import { CoachCardScreen, LockerRoomScreen, OwnerScreen, PlayerCardScreen, RosterScreen, StaffScreen } from './PeopleScreens.tsx';
import { CARD_TABS, type CardTab, type PeopleIntent, type TextOf, type UiCard, type UiCoachCard, type UiLockerRoom, type UiOwner, type UiRoster, type UiStaff } from './view.ts';

export * from './PeopleScreens.tsx';
export * from './view.ts';

export const PEOPLE_SCREEN_IDS = {
  player: 'team.player', roster: 'team.roster', staff: 'people.staff', coach: 'people.coach', lockerRoom: 'people.locker_room', owner: 'people.owner',
} as const;

/** What the host supplies: the current read models for the user's club, a text lookup and a sink for intents. */
export interface PeopleHost {
  card(personId: number): UiCard | null;
  roster(): UiRoster | null;
  staff(): UiStaff | null;
  coach(personId: number): UiCoachCard | null;
  lockerRoom(): UiLockerRoom | null;
  owner(): UiOwner | null;
  text?: TextOf;
  name?(personId: number): string;
  dispatch(intent: PeopleIntent): void;
}

/** A path, or a registry id of a screen with no route parameters, as a path; else null. */
export function toPath(to: string): string | null {
  if (to.startsWith('/')) return to;
  const s = screenById(to);
  return s && !s.route.includes(':') ? s.route : null;
}

const isTab = (s: string | undefined): s is CardTab => !!s && (CARD_TABS as readonly string[]).includes(s);
const idParam = (v: string | undefined): number => (v && /^\d+$/.test(v) ? Number(v) : -1);

export function peopleRoutes(host: PeopleHost): RouteTable {
  const text = host.text ?? ((k: string) => k);
  const sink = (navigate: (to: string) => void) => (i: PeopleIntent) => {
    const path = i.kind === 'open' ? toPath(i.to) : null;
    if (path) navigate(path); else host.dispatch(i);
  };
  const player: RouteEntry = {
    render: (p) => createElement(PlayerCardScreen, {
      view: host.card(idParam(p.location.params.playerId)), tab: isTab(p.location.view.tab) ? p.location.view.tab : 'overview', readOnly: p.readOnly, text,
      onTab: (tab) => p.setView({ ...p.location.view, tab }), onIntent: sink(p.navigate),
    }),
  };
  return {
    [PEOPLE_SCREEN_IDS.player]: player,
    [PEOPLE_SCREEN_IDS.roster]: { render: (p) => createElement(RosterScreen, { view: host.roster(), text, onIntent: sink(p.navigate) }) },
    [PEOPLE_SCREEN_IDS.staff]: { render: (p) => createElement(StaffScreen, { view: host.staff(), text, onIntent: sink(p.navigate) }) },
    [PEOPLE_SCREEN_IDS.coach]: { render: (p) => createElement(CoachCardScreen, { view: host.coach(idParam(p.location.params.personId)), text, readOnly: p.readOnly, onIntent: sink(p.navigate) }) },
    [PEOPLE_SCREEN_IDS.lockerRoom]: {
      render: (p) => createElement(LockerRoomScreen, { view: host.lockerRoom(), text, ...(host.name ? { names: host.name } : {}), onIntent: sink(p.navigate) }),
    },
    [PEOPLE_SCREEN_IDS.owner]: { render: (p) => createElement(OwnerScreen, { view: host.owner(), text, readOnly: p.readOnly, onIntent: sink(p.navigate) }) },
  };
}
