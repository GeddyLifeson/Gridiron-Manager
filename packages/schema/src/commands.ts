// Command contract (P1.3.1) and read-model contract (P1.3.2).
import { z } from 'zod';
import { pub, own } from './field.ts';
import { Calendar, Level } from './entities.ts';

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

export const RenameCompetitionPayload = z.object({ competitionId: pub(z.number().int().positive(), 'id'), name: pub(z.string().min(1).max(60)) }).strict();

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
};
