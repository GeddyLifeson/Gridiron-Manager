// Payload schemas of the game-day and legends command families (playtest PR 267: unregistered commands).
// The command unions live in app-services (commands/game-management, game-frame, seats, legends), which
// may not import zod; these are their payloads, the union member without `type`, joined to COMMANDS in
// commands.ts. A test in app-services checks every type its union names is registered here.
// Game-day commands are not undoable (the play clock always runs) and are allowed in certified mode:
// they are the coaching itself. Task ids follow S3 (game.*, seat.*, legends.*).
import { z } from 'zod';
import { pub, own } from './field.ts';
import type { CommandSpec } from './commands.ts';

const s = () => own(z.string().min(1));
const strs = () => own(z.array(z.string()));
const gameId = () => own(z.string().min(1));

// --- game management panel (G-61) -------------------------------------------------------------
const GM_DECISION_KINDS = ['penalty', 'runoff', 'challenge', 'fourth_down', 'try', 'kickoff', 'coin_toss', 'overtime_toss', 'kneel'] as const;
const GM_CHANNELS = ['offense', 'defense', 'special_teams', 'game_management'] as const;
export const GAME_MANAGEMENT_PAYLOADS: Record<string, z.ZodType> = {
  'gm.timeout': z.object({ gameId: gameId() }).strict(),
  'gm.timeout_request': z.object({ gameId: gameId() }).strict(),
  'gm.challenge': z.object({ gameId: gameId(), aspect: s() }).strict(),
  'gm.decide': z.object({
    gameId: gameId(), decisionId: s(), kind: own(z.enum(GM_DECISION_KINDS)), optionId: s(),
    decidedBy: own(z.enum(['user', 'standing_rule', 'default', 'delegate'])),
    shown: own(z.object({ chartOption: own(z.string()).nullable(), advisorOption: own(z.string()).nullable() }).strict()),
  }).strict(),
  'gm.recommend': z.object({ gameId: gameId(), decisionId: s(), optionId: s() }).strict(),
  'gm.channel': z.object({ gameId: gameId(), channel: own(z.enum(GM_CHANNELS)) }).strict(),
  'gm.ask_booth': z.object({ gameId: gameId(), questionId: s() }).strict(),
  'gm.message_read': z.object({ gameId: gameId(), messageId: s(), beforeCallConfirmed: own(z.boolean()) }).strict(),
};

// --- game-day frame (G-62) ----------------------------------------------------------------------
const UNITS3 = ['offense', 'defense', 'special'] as const;
export const GAME_FRAME_PAYLOADS: Record<string, z.ZodType> = {
  'pregame.do_task': z.object({ task: s(), costMin: own(z.number().int().min(0), 'min').optional() }).strict(),
  'pregame.delegate': z.object({ task: s(), staffId: s() }).strict(),
  'pregame.advance': z.object({}).strict(),
  'pregame.run_to_kickoff': z.object({}).strict(),
  'halftime.open': z.object({ attending: own(z.enum(UNITS3)), staffMin: own(z.number().int().min(0), 'min').optional() }).strict(),
  // An item names its kind; the rest of its fields belong to that kind (career gameday halftime items).
  'halftime.add': z.object({ item: own(z.object({ kind: s() }).catchall(own(z.unknown()))) }).strict(),
  'halftime.openers': z.object({ unit: own(z.enum(UNITS3)), calls: strs() }).strict(),
  'halftime.end': z.object({}).strict(),
  'postgame.handshake': z.object({ manner: own(z.enum(['normal', 'warm', 'cold', 'skipped'])) }).strict(),
  'postgame.talk': z.object({ tone: own(z.enum(['proud', 'level', 'demanding', 'angry', 'brief'])), points: strs(), callouts: strs() }).strict(),
  'postgame.game_balls': z.object({ receivers: strs() }).strict(),
  'postgame.answer': z.object({ question: own(z.number().int().min(0), 'index'), style: s() }).strict(),
  'postgame.skip_media': z.object({}).strict(),
  'postgame.notes': z.object({ text: own(z.string()), mustSee: strs() }).strict(),
  'postgame.day_after': z.object({ choice: own(z.enum(['normal', 'short', 'off'])) }).strict(),
  'postgame.send_play': z.object({ playId: s(), question: own(z.string()) }).strict(),
};

// --- seats below head coach (G-79) --------------------------------------------------------------
const playId = () => own(z.number().int().min(0), 'id');
export const SEAT_PAYLOADS: Record<string, z.ZodType> = {
  'seat.report_look': z.object({ playId: playId(), phase: own(z.enum(['pre', 'post'])), look: s() }).strict(),
  'seat.relay': z.object({ playId: playId(), personnel: s() }).strict(),
  'seat.chart_row': z.object({ playId: playId(), row: own(z.record(z.string(), own(z.string()).nullable())) }).strict(),
  'seat.flag': z.object({ key: s() }).strict(),
  'seat.advise': z.object({ momentId: own(z.number().int().min(0), 'id'), choice: s(), reason: own(z.string()) }).strict(),
  'seat.warn': z.object({ text: s() }).strict(),
  'seat.substitute': z.object({ sendIn: own(z.array(z.number().int()), 'id'), takeOut: own(z.array(z.number().int()), 'id') }).strict(),
  'seat.signal': z.object({ signal: s() }).strict(),
  'seat.correct': z.object({ optionId: s(), way: own(z.enum(['words', 'picture', 'walkthrough'])) }).strict(),
  'seat.report_line': z.object({ claim: s() }).strict(),
  'seat.ask_ahead': z.object({ series: own(z.number().int().min(0), 'index'), question: s() }).strict(),
  'seat.suggest_call': z.object({ callId: s() }).strict(),
  'seat.channel': z.object({ channel: own(z.enum(['offense', 'defense', 'special_teams', 'head_coach', 'analyst'])) }).strict(),
  'seat.standing_rules': z.object({ on: own(z.boolean()) }).strict(),
};

// --- legends (G-84) -----------------------------------------------------------------------------
/** The seasons to export (X3.6.1); the host adds the world code, date and public rows when it runs it. */
export const LegendsExportPayload = z.object({
  firstSeason: pub(z.number().int(), 'season_year'), lastSeason: pub(z.number().int(), 'season_year'),
}).strict();

const spec = (type: string, payload: z.ZodType, task: string): CommandSpec => ({ type, payload, task, undoable: false, allowedInCertified: true });

export const GAME_DAY_COMMAND_SPECS: readonly CommandSpec[] = [
  ...Object.entries(GAME_MANAGEMENT_PAYLOADS).map(([t, p]) => spec(t, p, 'game.management')),
  ...Object.entries(GAME_FRAME_PAYLOADS).map(([t, p]) => spec(t, p, `game.${t.split('.')[0]}`)),
  ...Object.entries(SEAT_PAYLOADS).map(([t, p]) => spec(t, p, 'seat.duty')),
  spec('LegendsExport', LegendsExportPayload, 'legends.export'),
];
