// The zod schemas of the people and office read models (G-72), with a visibility class on every field.
// Moved here unchanged from app-services/test/read-models/people/data-schema.ts (CR-G72-1); registered in
// READ_MODELS as playerCard, rosterTable, staff, coachCard, lockerRoom, ownerView and home. Classes:
//  public            names, positions, roster lists, report designations, measured values, seats
//  own_team          the club's contract lines, notes, inbox, requests to the general manager
//  observer_estimate a grade a staff member assigned, a staff read in words (it can be wrong)
// Nothing is truth: the registry refuses a schema with a truth field.
import { z } from 'zod';
import { pub, own, est } from '../field.ts';

const id = () => pub(z.number().int(), 'id');
const int = () => z.number().int();
const count = () => pub(z.number().int().min(0), 'count');
const text = () => pub(z.string());
const flag = () => pub(z.boolean());
const ids = () => pub(z.array(z.number().int()), 'id');
const keys = () => pub(z.array(z.string()));
const Date = pub(z.object({ seasonYear: pub(int(), 'season_year'), dayIndex: pub(int(), 'day_index') }).strict());
const OwnDate = own(z.object({ seasonYear: own(int(), 'season_year'), dayIndex: own(int(), 'day_index') }).strict());

const Reason = z.object({ textKey: est(z.string()), eventId: est(int(), 'id') }).strict();
const Read = est(z.object({ textKey: est(z.string()), reasons: est(z.array(Reason)), trend: est(z.enum(['up', 'steady', 'down'])).nullable() }).strict());
const Contract = own(z.object({ years: own(int(), 'count'), throughYear: own(int(), 'season_year'), thisYearCents: own(int(), 'cents').nullable() }).strict());

const Grade = z.union([
  z.object({
    state: est(z.literal('graded')), attribute: text(), text: est(z.string()), label: est(z.string()), confidence: est(z.string()), bandText: est(z.string()),
    grader: est(z.string()), n: est(int(), 'count'), asOf: est(z.object({ seasonYear: est(int(), 'season_year'), dayIndex: est(int(), 'day_index') }).strict()),
  }).strict(),
  z.object({ state: pub(z.literal('unwatched')), attribute: text(), text: text() }).strict(),
]);

const HealthRow = z.object({
  injuryId: id(), typeId: text(), bodyRegion: text(), designation: text().nullable(),
  returnDays: est(z.tuple([z.number().int().min(0), z.number().int().min(0)]), 'count').nullable(), status: text(), occurred: Date,
}).strict();

const Medical = est(z.object({
  clearance: est(z.enum(['cleared', 'cleared_with_limits', 'not_cleared', 'protocol'])), limits: est(z.array(z.string())),
  practice: est(z.array(z.enum(['full', 'limited', 'did_not_participate', 'none_scheduled']))), reinjuryRiskKey: est(z.string()), loadBandKey: est(z.string()),
}).strict());

const Knowledge = z.object({
  conceptId: text(), word: est(z.enum(['new', 'learning', 'knows', 'masters'])), lastPractised: Date.nullable(),
  mentalErrors: pub(z.array(z.object({ gameId: id(), playIndex: pub(int(), 'index') }).strict())), readyThisWeek: est(z.boolean()),
}).strict();

const Person = z.object({
  rolePromisedKey: own(z.string()).nullable(), roleGivenKey: own(z.string()).nullable(),
  morale: Read.nullable(), trust: Read.nullable(), respect: Read.nullable(),
  openPromises: pub(z.array(z.object({ promiseId: id(), subjectKey: text(), made: Date, due: Date.nullable() }).strict())),
  personality: est(z.array(z.object({ traitKey: est(z.string()), readKey: est(z.string()), confidenceKey: est(z.string()) }).strict())).optional(),
  standingKey: est(z.string()).nullable(), closestTeammates: est(z.array(int()), 'id'),
  meetings: own(z.array(z.object({ date: OwnDate, subjectKey: own(z.string()), outcomeKey: own(z.string()) }).strict())),
  offField: est(z.array(z.object({ eventId: est(int(), 'id'), textKey: est(z.string()) }).strict())).optional(),
}).strict();

export const PlayerCardData = z.object({
  personId: id(), clubId: id(), ownPlayer: flag(),
  header: pub(z.object({
    personId: id(), name: text(), jersey: pub(int(), 'index').nullable(), position: text(), altPositions: keys(), age: count().nullable(),
    heightIn: pub(z.number(), 'in').nullable(), weightLb: pub(z.number(), 'lb').nullable(), experience: count().nullable(), status: text().nullable(),
    contract: Contract.nullable(), designed: flag(), imported: flag(),
  }).strict()),
  grades: pub(z.array(Grade)), gradesNoteKey: text().nullable(),
  measured: pub(z.array(z.object({ key: text(), value: pub(z.number(), 'ratio'), unit: text() }).strict())),
  knowledge: est(z.array(Knowledge)).nullable(),
  health: pub(z.object({ current: pub(z.array(HealthRow)), history: pub(z.array(HealthRow)), medical: Medical.nullable() }).strict()),
  person: pub(Person).nullable(),
  notes: own(z.array(z.object({ date: OwnDate, textKey: own(z.string()), byStaffId: own(int(), 'id') }).strict())),
}).strict().nullable();

export const RosterTableData = z.object({
  clubId: id(), lists: keys(),
  rows: pub(z.array(z.object({
    personId: id(), name: text(), position: text(), list: text(), jersey: pub(int(), 'index').nullable(), age: count().nullable(), experience: count().nullable(), designation: text().nullable(),
  }).strict())),
  limits: pub(z.array(z.object({ list: text(), limit: count().nullable(), count: count(), over: flag() }).strict())),
  subtotals: pub(z.array(z.object({ position: text(), count: count(), planned: own(int(), 'count').nullable() }).strict())),
  requests: own(z.array(z.object({
    requestId: own(int(), 'id'), moveKey: own(z.string()), personId: own(int(), 'id').nullable(), state: own(z.enum(['requested', 'done', 'refused'])), reasonKey: own(z.string()).nullable(),
  }).strict())),
}).strict().nullable();

export const StaffData = z.object({
  clubId: id(),
  seats: pub(z.array(z.object({
    jobId: id(), catalogueId: text(), rung: pub(int(), 'index'), side: text(), positionGroup: text(), reportsToJobId: id().nullable(),
    holderPersonId: id().nullable(), holderName: text().nullable(), holding: text(), coveringPersonId: id().nullable(), coverCostKey: own(z.string()).nullable(),
  }).strict())),
}).strict();

export const CoachCardData = z.object({
  personId: id(), name: text(), jobId: id().nullable(), catalogueId: text().nullable(), side: text().nullable(), positionGroupTaught: text().nullable(),
  systems: pub(z.array(z.object({ familyId: text(), seasons: count() }).strict())), background: keys(),
  record: own(z.array(z.object({ key: own(z.string()), eventIds: own(z.array(int()), 'id'), labelKey: own(z.string()).nullable() }).strict())), noBook: flag(),
  relationship: est(z.object({ trust: Read.nullable(), loyalty: Read.nullable() }).strict()).nullable(),
  ambitionKeys: est(z.array(z.string())), contract: Contract.nullable(),
  proposals: own(z.array(z.object({ taskKey: own(z.string()), date: OwnDate, resultKey: own(z.string()), eventId: own(int(), 'id') }).strict())),
}).strict().nullable();

export const LockerRoomData = z.object({
  clubId: id(),
  groups: est(z.array(z.object({ kind: est(z.enum(['leaders', 'followers', 'clique', 'isolated'])), leaderId: est(int(), 'id').nullable(), memberIds: est(z.array(int()), 'id') }).strict())),
  culture: Read.nullable(), buyIn: Read.nullable(),
  issues: est(z.array(z.object({
    issueId: est(int(), 'id'), kindKey: est(z.string()), personIds: est(z.array(int()), 'id'), sourcePersonId: est(int(), 'id'), sourceKey: est(z.string()),
    reportedOn: est(z.object({ seasonYear: est(int(), 'season_year'), dayIndex: est(int(), 'day_index') }).strict()), responseLinks: est(z.array(z.string())),
  }).strict())),
  lostRoom: est(z.object({ causeKeys: est(z.array(z.string())) }).strict()).nullable(),
}).strict().nullable();

export const OwnerViewData = z.object({
  clubId: id(),
  owner: pub(z.object({
    personId: id().nullable(), name: text().nullable(), goalKeys: own(z.array(z.string())), confidence: Read.nullable(),
    comments: own(z.array(z.object({ date: OwnDate, textKey: own(z.string()), eventId: own(int(), 'id') }).strict())), nextMeeting: OwnDate.nullable(),
  }).strict()),
  gm: pub(z.object({
    personId: id().nullable(), name: text().nullable(), relationship: Read.nullable(),
    say: own(z.array(z.object({ moveKey: own(z.string()), holderKey: own(z.enum(['coach', 'general_manager', 'owner', 'shared'])) }).strict())),
    requests: own(z.array(z.object({
      requestId: own(int(), 'id'), moveKey: own(z.string()), phaseKey: own(z.string()), state: own(z.enum(['requested', 'approved', 'refused', 'done'])), reasonKey: own(z.string()).nullable(),
    }).strict())),
    upcoming: own(z.array(z.object({ decisionKey: own(z.string()), toldKey: own(z.string()).nullable() }).strict())),
  }).strict()),
}).strict();

export const PEOPLE_SCHEMAS = {
  playerCard: PlayerCardData, rosterTable: RosterTableData, staff: StaffData, coachCard: CoachCardData, lockerRoom: LockerRoomData, ownerView: OwnerViewData,
};

// --- office (home) ------------------------------------------------------------------------------------

const Moment = own(z.object({ date: OwnDate, minute: own(int(), 'min') }).strict());

export const HomeData = z.object({
  personId: id(),
  today: own(z.object({
    date: Date, phaseKey: text(), dayLabelKey: own(z.string()).nullable(), daysToGame: count().nullable(),
    opponent: pub(z.object({ teamId: id(), name: text() }).strict()).nullable(), mode: own(z.enum(['normal', 'game_day', 'empty'])),
    blocks: own(z.array(z.object({
      blockId: own(z.string()), labelKey: own(z.string()), startMinute: own(int(), 'min'), minutes: own(int(), 'min'), runBy: own(z.enum(['coach', 'delegate'])),
      coachMinutes: own(int(), 'min').nullable(), delegateId: own(int(), 'id').nullable(), delegateName: own(z.string()).nullable(),
      delegateNoteKey: own(z.string()).nullable(), requiredByRule: own(z.boolean()), screenId: own(z.string()).nullable(),
    }).strict())),
    nextEvent: own(z.object({ date: OwnDate, labelKey: own(z.string()) }).strict()).nullable(),
    minutesLeftThisWeek: own(int(), 'min'), energyKey: own(z.string()).nullable(),
  }).strict()),
  inbox: own(z.array(z.object({
    itemId: own(int(), 'id'), weight: own(z.enum(['must', 'should', 'note'])), kind: own(z.string()), senderId: own(int(), 'id').nullable(), senderName: own(z.string()).nullable(),
    subjectKey: own(z.string()), bodyKey: own(z.string()), params: own(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
    received: OwnDate, deadline: OwnDate.nullable(), answerCommand: own(z.string()).nullable(), defaultCommand: own(z.string()).nullable(),
    links: own(z.array(z.string())), unread: own(z.boolean()), answerMinutes: own(int(), 'min').nullable(), conflictsWith: own(z.array(int()), 'id'),
  }).strict())),
  advance: own(z.array(z.object({
    target: own(z.enum(['next_block', 'end_of_day', 'next_must', 'game_day'])), to: Moment.nullable(), blockedBy: own(z.array(int()), 'id'),
    runsWithout: own(z.array(z.object({ blockId: own(z.string()), labelKey: own(z.string()), date: OwnDate, byName: own(z.string()).nullable() }).strict())),
  }).strict())),
}).strict().nullable();
