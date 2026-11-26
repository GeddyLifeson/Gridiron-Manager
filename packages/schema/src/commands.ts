// Command contract (P1.3.1) and read-model contract (P1.3.2).
import { z } from 'zod';
import { pub, own } from './field.ts';
import { Calendar, Level } from './entities.ts';
import { GameplanData } from './read-models/gameplan.ts';
import { PlaybookData } from './read-models/playbook.ts';
import { InstallData } from './read-models/install.ts';
import { PracticeDeskData } from './read-models/practice.ts';
import { DraftRoomData, FreeAgencyData } from './read-models/draft-room.ts';
import { RecruitingBoardData } from './read-models/recruiting.ts';
import { ScoutingTableData, ScoutingPersonnelData } from './read-models/scouting.ts';
import { GAME_DAY_COMMAND_SPECS } from './game-day-commands.ts';
import { GAMEPLAN_COMMAND_SPECS } from './gameplan-commands.ts';
import { FILM_MODEL_SCHEMAS, FILM_COMMAND_SPECS } from './read-models/film.ts';
import { LEGENDS_SCHEMAS } from './read-models/legends.ts';
import { ANALYTICS_SCHEMAS } from './read-models/analytics.ts';
import { RosterMovesData } from './read-models/roster-moves.ts';
import { GameManagementData } from './read-models/game-management.ts';
import { GAME_FRAME_SCHEMAS } from './read-models/game-frame.ts';
import { PlayerCardData, RosterTableData, StaffData, CoachCardData, LockerRoomData, OwnerViewData, HomeData } from './read-models/people.ts';

export const Actor = z.object({
  personId: pub(z.number().int().positive(), 'id').nullable(),
  /** Job held when the command was issued. 'system' covers world creation before the user exists. */
  job: pub(z.string()),
});

export const CommandEnvelope = z.object({
  id: own(z.number().int().positive(), 'id'),
  type: pub(z.string()),
  actor: pub(Actor),
  worldTime: pub(Calendar),
  payload: own(z.unknown()),
  schemaVersion: pub(z.number().int().positive(), 'version'),
  /** Play-clock tick for game-day commands with a deadline (P1.3.1). */
  playClockTick: pub(z.number().int().min(0), 'index').optional(),
});
export type CommandEnvelope = z.infer<typeof CommandEnvelope>;

export const CreateWorldPayload = z.object({
  masterSeedHex: pub(z.string().regex(/^[0-9a-f]{16}$/)),
  startSeasonYear: pub(z.number().int().min(1900).max(3000), 'season_year'),
  competitions: pub(z.array(z.object({ name: pub(z.string()), level: pub(Level), ruleSetId: pub(z.string()), leagueRulesId: pub(z.string()) })).min(1)),
}).strict();

export const AdvanceDayPayload = z.object({ days: pub(z.number().int().min(1).max(366), 'count') }).strict();

/** A blank or whitespace-only name is refused (break test #11): the name is trimmed, then 1 to 60 characters. */
export const RenameCompetitionPayload = z.object({ competitionId: pub(z.number().int().positive(), 'id'), name: pub(z.string().trim().min(1).max(60)) }).strict();

// Office and people screen commands (G-72, CR-G72-3). app-services builds the requests
// (commands/home, commands/people); these are their payloads. An inbox answer uses the command type the
// item names (InboxItem.answerCommand), registered by the system that owns the item.
const zPersonId = () => pub(z.number().int().positive(), 'id');
const zDay = () => pub(z.object({ seasonYear: pub(z.number().int(), 'season_year'), dayIndex: pub(z.number().int().min(0), 'day_index') }).strict());

/** Advance the calendar to a moment the office screen offered (O1.2.3). Refused past a must deadline. */
export const AdvanceTimePayload = z.object({
  to: pub(z.object({ date: zDay(), minute: pub(z.number().int().min(0).max(1439), 'min') }).strict()),
  target: pub(z.enum(['next_block', 'end_of_day', 'next_must', 'game_day'])),
}).strict();
/** Mark an inbox note read (O1.2.2). */
export const MarkInboxReadPayload = z.object({ itemId: pub(z.number().int().positive(), 'id') }).strict();
/** Spend staff hours re-evaluating a player, one attribute group or all (O4.1.2; M3, E7). */
export const RequestEvaluationPayload = z.object({ personId: zPersonId(), clubId: zPersonId(), group: pub(z.string().min(1)).nullable() }).strict();
/** A note on a player card (O4.1.1). */
export const WriteNotePayload = z.object({ personId: zPersonId(), text: own(z.string().min(1).max(2000)) }).strict();
/** Ask for a meeting with a person (O4.1.5, O4.3.1, O4.4.1, O4.5.1; L1). */
export const RequestMeetingPayload = z.object({ personId: zPersonId(), subjectKey: pub(z.string().min(1)) }).strict();
/** A request to the general manager for a move he holds (O4.5.1; L5.2.1). */
export const GmRequestPayload = z.object({ moveKey: pub(z.string().min(1)), personId: zPersonId().nullable(), toPersonId: zPersonId() }).strict();

export interface CommandSpec {
  type: string;
  payload: z.ZodType;
  /** S3 task this command belongs to. Phase 0 commands are system tasks. */
  task: string;
  undoable: boolean;
  allowedInCertified: boolean;
}

/** Command registry (P1.3.1). About 150 types at v1; phase 0 registers the empty-world commands. */
export const COMMANDS: readonly CommandSpec[] = [
  { type: 'CreateWorld', payload: CreateWorldPayload, task: 'system.create_world', undoable: false, allowedInCertified: true },
  { type: 'AdvanceDay', payload: AdvanceDayPayload, task: 'system.advance_time', undoable: false, allowedInCertified: true },
  { type: 'RenameCompetition', payload: RenameCompetitionPayload, task: 'system.edit_world', undoable: true, allowedInCertified: false },
  { type: 'AdvanceTime', payload: AdvanceTimePayload, task: 'system.advance_time', undoable: false, allowedInCertified: true },
  { type: 'MarkInboxRead', payload: MarkInboxReadPayload, task: 'office.inbox', undoable: true, allowedInCertified: true },
  { type: 'RequestEvaluation', payload: RequestEvaluationPayload, task: 'evaluation.reevaluate', undoable: false, allowedInCertified: true },
  { type: 'WriteNote', payload: WriteNotePayload, task: 'evaluation.notes', undoable: true, allowedInCertified: true },
  { type: 'RequestMeeting', payload: RequestMeetingPayload, task: 'meeting.request', undoable: false, allowedInCertified: true },
  { type: 'GmRequest', payload: GmRequestPayload, task: 'boss.request', undoable: false, allowedInCertified: true },
  // Film room (G-63, CR-G63-0).
  ...FILM_COMMAND_SPECS,
  // Game management, game-day frame, seats and legends (playtest PR 267).
  ...GAME_DAY_COMMAND_SPECS,
  // Game plan and call sheet (G-68): `gameplan.<kind>` of app-services GameplanCommand.
  ...GAMEPLAN_COMMAND_SPECS,
];

export function commandSpec(type: string): CommandSpec | undefined {
  return COMMANDS.find((c) => c.type === type);
}

export const Permission = z.enum(['Yours', 'Assigned', 'Suggest', 'Read']);

export const ValueMeta = z.object({
  sampleSize: pub(z.number().int().min(0), 'count').optional(),
  band: pub(z.tuple([z.number(), z.number()]), 'ratio').optional(),
  unit: pub(z.string()).optional(),
  source: pub(z.enum(['staff', 'film', 'measured'])).optional(),
  asOf: pub(Calendar).optional(),
});

export function readModelOf<T extends z.ZodType>(data: T) {
  return z.object({
    key: pub(z.string()),
    version: pub(z.number().int().min(0), 'version'),
    permission: pub(Permission),
    data: pub(data),
    meta: pub(z.record(z.string(), ValueMeta)),
  });
}

/** Phase 0 read model: the world summary the empty-world screen shows. */
export const WorldSummaryData = z.object({
  masterSeedHex: pub(z.string()),
  calendar: pub(Calendar),
  competitions: pub(z.array(z.object({
    id: pub(z.number().int(), 'id'),
    name: pub(z.string()),
    level: pub(Level),
    ruleSetId: pub(z.string()),
    teamCount: pub(z.number().int(), 'count'),
  }))),
  peopleCount: pub(z.number().int(), 'count'),
  stateHash: pub(z.string()),
});
export const WorldSummaryModel = readModelOf(WorldSummaryData);
export type WorldSummaryModel = z.infer<typeof WorldSummaryModel>;

export const READ_MODELS: Record<string, z.ZodType> = {
  worldSummary: WorldSummaryModel,
  gameplan: readModelOf(GameplanData),
  // PLAYBOOK_MODEL, INSTALL_MODEL (PR 251), DRAFT_ROOM_MODEL, FREE_AGENCY_MODEL (PR 268), RECRUITING_BOARD_MODEL (PR 257).
  playbook: readModelOf(PlaybookData),
  install: readModelOf(InstallData),
  practiceDesk: readModelOf(PracticeDeskData),
  draftRoom: readModelOf(DraftRoomData),
  freeAgency: readModelOf(FreeAgencyData),
  recruitingBoard: readModelOf(RecruitingBoardData),
  scoutingTable: readModelOf(ScoutingTableData),
  scoutingPersonnel: readModelOf(ScoutingPersonnelData),
  playerCard: readModelOf(PlayerCardData),
  rosterTable: readModelOf(RosterTableData),
  staff: readModelOf(StaffData),
  coachCard: readModelOf(CoachCardData),
  lockerRoom: readModelOf(LockerRoomData),
  ownerView: readModelOf(OwnerViewData),
  home: readModelOf(HomeData),
  // Model names as the app-services specs name them (LEGENDS_MODELS, ANALYTICS_MODELS, ROSTER_MOVES_MODEL,
  // GAME_MANAGEMENT_MODEL, GAME_FRAME_SCHEMAS keys).
  legendsPage: readModelOf(LEGENDS_SCHEMAS.page),
  legendsChronicle: readModelOf(LEGENDS_SCHEMAS.chronicle),
  legendsEra: readModelOf(LEGENDS_SCHEMAS.era),
  legendsTree: readModelOf(LEGENDS_SCHEMAS.tree),
  legendsRivalry: readModelOf(LEGENDS_SCHEMAS.rivalry),
  legendsRecords: readModelOf(LEGENDS_SCHEMAS.records),
  legendsSearch: readModelOf(LEGENDS_SCHEMAS.search),
  analyticsStrength: readModelOf(ANALYTICS_SCHEMAS.strength),
  analyticsAccess: readModelOf(ANALYTICS_SCHEMAS.access),
  analyticsChart: readModelOf(ANALYTICS_SCHEMAS.chart),
  analyticsTracking: readModelOf(ANALYTICS_SCHEMAS.tracking),
  rosterMoves: readModelOf(RosterMovesData),
  gameManagement: readModelOf(GameManagementData),
  pregameView: readModelOf(GAME_FRAME_SCHEMAS.pregameView),
  halftimeView: readModelOf(GAME_FRAME_SCHEMAS.halftimeView),
  postgameView: readModelOf(GAME_FRAME_SCHEMAS.postgameView),
  filmPlay: readModelOf(FILM_MODEL_SCHEMAS.play),
  filmPlayList: readModelOf(FILM_MODEL_SCHEMAS.playList),
  filmGradeSheet: readModelOf(FILM_MODEL_SCHEMAS.gradeSheet),
  filmCorrections: readModelOf(FILM_MODEL_SCHEMAS.corrections),
  filmCutUps: readModelOf(FILM_MODEL_SCHEMAS.cutUps),
};
