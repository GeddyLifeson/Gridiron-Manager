// Moved here from app-services/test/read-models/roster-moves/data-schema.ts (CR-G70-1); registered in READ_MODELS (commands.ts).
// The zod schema of the roster moves read model, with a visibility class on every field. It belongs in
// @gm/schema (READ_MODELS) because app-services may not import zod: CR-G70-1 asks the integrator to move
// this file there unchanged. Every field is public or own-team league-office data; nothing is truth.
import { z } from 'zod';
import { pub } from '../field.ts';

const id = () => pub(z.number().int(), 'id');
const count = () => pub(z.number().int().min(0), 'count');
const hour = () => pub(z.number().int(), 'index');
const text = () => pub(z.string());
const level = () => pub(z.enum(['ok', 'amber', 'red']));
const button = () => pub(z.enum(['do_it', 'ask']));

const Marker = z.object({
  type: text(), status: text(), opensAtHour: hour(), deadlineHour: hour(), hoursLeft: pub(z.number().int().min(0), 'count'),
  target: text(), decider: text().nullable(), button: button().nullable(),
}).strict();

const Player = z.object({
  personId: id(), name: text(), position: text(), list: text(), elevated: pub(z.boolean()), designation: text().nullable(),
  out: pub(z.boolean()), offensiveLineman: pub(z.boolean()), quarterback: pub(z.boolean()), jobs: pub(z.array(z.string())),
  specialTeamsFirsts: count(), candidate: pub(z.boolean()), active: pub(z.boolean()),
}).strict();

const Coverage = z.object({
  unitId: text(), role: text(), starter: id().nullable(), backup: id().nullable(), emergency: id().nullable(), level: level(),
}).strict();

const Unit = z.object({ unitId: text(), named: count(), needed: count(), level: level() }).strict();

const Active = z.object({
  actives: pub(z.array(z.number().int()), 'id'), emergencyQb: id().nullable(), count: count(), limit: count(), linemenActive: count(),
  minLinemen: count(), floor: count(), inactives: pub(z.array(z.number().int()), 'id'),
  refusal: pub(z.object({ rule: text(), message: text(), fix: text() }).strict()).nullable(),
  locked: pub(z.boolean()), minutesToLock: pub(z.number().min(0), 'min'), redGaps: pub(z.array(z.string())), amberGaps: pub(z.array(z.string())),
  outDressed: pub(z.array(z.number().int()), 'id'), staffDraft: pub(z.array(z.number().int()), 'id'),
  staffReasons: pub(z.record(z.string(), z.string())), emergencyQbOffered: pub(z.boolean()),
}).strict();

const Elevation = z.object({
  personId: id(), name: text(), position: text(), used: count(), left: count().nullable(), elevated: pub(z.boolean()), blocked: text().nullable(),
}).strict();

export const RosterMovesData = z.object({
  clubId: id(), hasGameDayLimit: pub(z.boolean()), hasPracticeSquad: pub(z.boolean()), nowHour: hour(),
  markers: pub(z.array(Marker)), players: pub(z.array(Player)), coverage: pub(z.array(Coverage)), units: pub(z.array(Unit)),
  active: pub(Active).nullable(),
  elevations: pub(z.object({ perGame: count(), usedThisGame: count(), rows: pub(z.array(Elevation)) }).strict()).nullable(),
  buttons: pub(z.record(z.string(), z.enum(['do_it', 'ask']))),
}).strict().nullable();
