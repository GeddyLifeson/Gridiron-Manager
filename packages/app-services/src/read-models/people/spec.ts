// The read-model specs (P1.3.2) of the people screens. Each builds from the observed world (G-27) plus the
// reads the world side has already made for this observer (words with their reasons). The `data` schemas
// are zod schemas with a visibility class on every field; they live in @gm/schema (CR-G72-1) because
// app-services may not import zod itself.
import type { ReadModelSpec, Schema } from '../../observer/index.ts';
import { buildPlayerCard, type CardOptions, type CardReads } from './card.ts';
import { buildRosterTable, type RosterInputs } from './roster.ts';
import { buildCoachCard, buildStaff, type CoachReads, type StaffInputs } from './staff.ts';
import { buildLockerRoom, buildOwnerView, type LockerRoomInputs, type OwnerInputs } from './room.ts';
import type { CoachCardView, LockerRoomView, OwnerView, PlayerCardView, RosterTableView, StaffView } from './types.ts';
import { userPersonId } from './world.ts';

export const PEOPLE_MODELS = {
  playerCard: 'playerCard', rosterTable: 'rosterTable', staff: 'staff', coachCard: 'coachCard', lockerRoom: 'lockerRoom', ownerView: 'ownerView',
} as const;

/** S3 task ids for the permission badge (O7.1.1). */
export const PEOPLE_TASKS: Readonly<Record<keyof typeof PEOPLE_MODELS, readonly string[]>> = {
  playerCard: ['evaluation.reevaluate', 'meeting.player'],
  rosterTable: ['roster.transactions'],
  staff: ['staff.hire', 'staff.assign'],
  coachCard: ['staff.assign', 'meeting.staff'],
  lockerRoom: ['meeting.player', 'discipline.decide'],
  ownerView: ['boss.request', 'meeting.boss'],
};

/** The world side's reads for one observer. Every source may answer null (nothing known yet). */
export interface PeopleSources {
  readonly cardReads?: (clubId: number, personId: number) => CardReads | null;
  readonly cardOptions?: () => CardOptions;
  readonly roster?: (clubId: number) => RosterInputs | null;
  readonly staff?: (clubId: number) => StaffInputs | null;
  readonly coachReads?: (clubId: number, personId: number) => CoachReads | null;
  readonly lockerRoom?: (clubId: number) => LockerRoomInputs | null;
  readonly owner?: (clubId: number) => OwnerInputs | null;
}

export interface PeopleSchemas {
  readonly playerCard: Schema; readonly rosterTable: Schema; readonly staff: Schema;
  readonly coachCard: Schema; readonly lockerRoom: Schema; readonly ownerView: Schema;
}

type Club = { clubId: number };
type ClubPerson = { clubId: number; personId: number };

export function peopleSpecs(data: PeopleSchemas, src: PeopleSources = {}): [
  ReadModelSpec<ClubPerson, PlayerCardView | null>, ReadModelSpec<Club, RosterTableView | null>, ReadModelSpec<Club, StaffView>,
  ReadModelSpec<ClubPerson, CoachCardView | null>, ReadModelSpec<Club, LockerRoomView | null>, ReadModelSpec<Club, OwnerView>,
] {
  return [
    {
      name: PEOPLE_MODELS.playerCard, data: data.playerCard, taskIds: PEOPLE_TASKS.playerCard,
      build: (world, { clubId, personId }) => ({
        data: buildPlayerCard(world, clubId, personId, src.cardReads?.(clubId, personId) ?? {}, { coachId: userPersonId(world), ...(src.cardOptions?.() ?? {}) }),
      }),
    },
    {
      name: PEOPLE_MODELS.rosterTable, data: data.rosterTable, taskIds: PEOPLE_TASKS.rosterTable,
      build: (world, { clubId }) => {
        const input = src.roster?.(clubId);
        return { data: input ? buildRosterTable(world, clubId, input) : null };
      },
    },
    {
      name: PEOPLE_MODELS.staff, data: data.staff, taskIds: PEOPLE_TASKS.staff,
      build: (world, { clubId }) => ({ data: buildStaff(world, clubId, src.staff?.(clubId) ?? {}) }),
    },
    {
      name: PEOPLE_MODELS.coachCard, data: data.coachCard, taskIds: PEOPLE_TASKS.coachCard,
      build: (world, { clubId, personId }) => ({ data: buildCoachCard(world, clubId, personId, src.coachReads?.(clubId, personId) ?? {}) }),
    },
    {
      name: PEOPLE_MODELS.lockerRoom, data: data.lockerRoom, taskIds: PEOPLE_TASKS.lockerRoom,
      build: (world, { clubId }) => {
        const coach = userPersonId(world);
        return { data: coach === null ? null : buildLockerRoom(world, clubId, coach, src.lockerRoom?.(clubId) ?? {}) };
      },
    },
    {
      name: PEOPLE_MODELS.ownerView, data: data.ownerView, taskIds: PEOPLE_TASKS.ownerView,
      build: (world, { clubId }) => ({ data: buildOwnerView(world, clubId, src.owner?.(clubId) ?? {}) }),
    },
  ];
}
