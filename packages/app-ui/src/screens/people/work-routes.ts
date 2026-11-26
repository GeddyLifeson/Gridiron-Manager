// Routes for people.delegation (O4.3.2) and people.meeting (O4.4.2). The integrator adds them to the shell's
// route table: `putAll(peopleWorkRoutes(s.peopleWork))` in buildRoutes.
import { createElement } from 'react';
import { screenById, type RouteTable } from '../../shell/index.ts';
import { DelegationScreen, MeetingScreen } from './WorkScreens.tsx';
import { MEETING_TABS, type DelegationIntent, type MeetingIntent, type MeetingTab, type UiAssignment, type UiDelegation, type UiMeeting, type UiStaffOneOnOne } from './work-view.ts';

export const PEOPLE_WORK_SCREEN_IDS = { delegation: 'people.delegation', meeting: 'people.meeting' } as const;

export interface PeopleWorkHost {
  delegation(): UiDelegation | null;
  /** The delegation table recomputed for unsaved settings; absent shows stored hours until saved. */
  previewDelegation?(draft: Readonly<Record<string, UiAssignment>>): UiDelegation | null;
  /** The player conversation for the person in the address (`?person=`), or the tracker alone when null. */
  meeting(personId: number | null): UiMeeting | null;
  /** This week's one-on-one with the staff member in the address (`?staff=`). */
  staffTalk(staffId: number | null): UiStaffOneOnOne | null;
  staffList?(): readonly { readonly personId: number; readonly name: string }[];
  text?(key: string): string;
  dispatch(intent: DelegationIntent | MeetingIntent): void;
}

/** A path, or a registry id of a screen with no route parameters, as a path; else null (as people `toPath`). */
function toPath(to: string): string | null {
  if (to.startsWith('/')) return to;
  const s = screenById(to);
  return s && !s.route.includes(':') ? s.route : null;
}

const idOf = (v: string | undefined): number | null => (v && /^\d+$/.test(v) ? Number(v) : null);
const isTab = (s: string | undefined): s is MeetingTab => !!s && (MEETING_TABS as readonly string[]).includes(s);

export function peopleWorkRoutes(host: PeopleWorkHost): RouteTable {
  const text = host.text ? (k: string) => host.text!(k) : undefined;
  return {
    [PEOPLE_WORK_SCREEN_IDS.delegation]: {
      render: (p) => createElement(DelegationScreen, {
        view: host.delegation(), ...(text ? { text } : {}),
        ...(host.previewDelegation ? { preview: (d: Readonly<Record<string, UiAssignment>>) => host.previewDelegation!(d) } : {}),
        onIntent: (i: DelegationIntent) => host.dispatch(i),
      }),
    },
    [PEOPLE_WORK_SCREEN_IDS.meeting]: {
      render: (p) => {
        const view = p.location.view;
        const person = idOf(view.person);
        const staff = idOf(view.staff);
        const tab: MeetingTab = isTab(view.tab) ? view.tab : staff !== null && person === null ? 'staff' : 'player';
        return createElement(MeetingScreen, {
          view: host.meeting(person), staffTalk: host.staffTalk(staff), staffList: host.staffList?.() ?? [], tab, readOnly: p.readOnly, ...(text ? { text } : {}),
          onTab: (t: MeetingTab) => p.setView({ ...view, tab: t }),
          onIntent: (i: MeetingIntent) => {
            if (i.kind === 'pickStaff') { p.setView({ ...view, tab: 'staff', staff: String(i.staffId) }); return; }
            const path = i.kind === 'open' ? toPath(i.to) : null;
            if (path) p.navigate(path); else host.dispatch(i);
          },
        });
      },
    },
  };
}
