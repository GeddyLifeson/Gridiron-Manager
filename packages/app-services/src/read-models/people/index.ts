// @gm/app-services, people read models (G-72): player card (O4.1), roster table (O4.2.1), staff and coach
// card (O4.3.1), locker room (O4.4.1), owner and general manager (O4.5.1). Estimates and words only.
export { PARAMS } from './params.ts';
export * from './types.ts';
export { buildPlayerCard, type CardReads, type CardOptions } from './card.ts';
export { buildRosterTable, type RosterInputs } from './roster.ts';
export { buildStaff, buildCoachCard, type StaffInputs, type CoachReads } from './staff.ts';
export { buildLockerRoom, buildOwnerView, type IssueInput, type LockerRoomInputs, type OwnerInputs } from './room.ts';
export { peopleSpecs, PEOPLE_MODELS, PEOPLE_TASKS, type PeopleSources, type PeopleSchemas } from './spec.ts';
export { displayName, ageAt, compareDate, type DateLike } from './world.ts';
