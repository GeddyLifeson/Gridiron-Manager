// Proposed read-model data schemas for the game-day frame (G-62), one visibility class per field. app-services
// may not import zod (P1.2.2), so these wait here, truth-scanned by the tests, until the integrator moves them
// into @gm/schema and registers the specs. own_team: the user's own staff and plan; public: what the press and
// the other team can also see (the toss outcome, the news conference, a handshake noticed by media).
import { z } from 'zod';
import { own, pub } from '@gm/schema';

const unit = z.enum(['offense', 'defense', 'special']);

export const PregameViewSchema = z.object({
  minutesToKickoff: own(z.number(), 'min'),
  budgetLeft: own(z.number(), 'min'),
  kickoffDelayMin: pub(z.number(), 'min'),
  nextDeadline: own(z.number(), 'min'),
  tasks: own(z.array(z.object({
    id: own(z.string()), leaf: own(z.string()), opensAt: own(z.number(), 'min'), deadline: own(z.number(), 'min'), costMin: own(z.number(), 'min'),
    owner: own(z.string()), state: own(z.enum(['open', 'done', 'delegated', 'missed', 'hidden'])), locked: own(z.boolean()), actionable: own(z.boolean()),
  }))),
  tossOptionLost: pub(z.array(z.enum(['own', 'opponent']))),
  log: own(z.array(z.object({ t: own(z.number(), 'min'), kind: own(z.string()), task: own(z.string()).nullable() }))),
}).strict();

export const HalftimeViewSchema = z.object({
  workingMin: own(z.number(), 'min'), staffMin: own(z.number(), 'min'), playerMin: own(z.number(), 'min'),
  staffLeft: own(z.number(), 'min'), playerLeft: own(z.number(), 'min'),
  attending: own(unit), sentBack: own(z.array(unit)),
  items: own(z.array(z.object({ kind: own(z.string()), unit: own(z.string()).nullable(), detail: own(z.string()).nullable() }))),
  uptake: own(z.array(z.object({ adjustmentId: own(z.string()), playerId: own(z.string()), word: own(z.enum(['solid', 'shaky', 'risky', 'not_told'])) }))),
}).strict();

export const PostgameViewSchema = z.object({
  gameId: pub(z.string()),
  handshake: own(z.object({ own: own(z.string()), other: pub(z.string()), mediaNotice: pub(z.boolean()) }).nullable()),
  talk: own(z.object({ tone: own(z.string()), points: own(z.array(z.string())), fit: own(z.enum(['good', 'neutral', 'poor'])) }).nullable()),
  gameBalls: own(z.array(z.object({ receiver: own(z.string()), reason: own(z.string()) }))),
  injuries: own(z.array(z.object({ playerId: own(z.string()), bodyPart: own(z.string()), firstRead: own(z.string()), inProtocol: own(z.boolean()), finishedGame: own(z.boolean()) }))),
  media: pub(z.object({ held: pub(z.boolean()), questions: pub(z.number(), 'count'), answers: pub(z.array(z.object({ question: pub(z.number(), 'index'), style: pub(z.string()) }))) }).nullable()),
  dayAfter: own(z.enum(['normal', 'short', 'off']).nullable()),
  officeReplies: own(z.array(z.object({ playId: own(z.string()), reply: own(z.enum(['correct', 'incorrect', 'no_comment'])) }))),
}).strict();

export const GAME_FRAME_SCHEMAS = { pregameView: PregameViewSchema, halftimeView: HalftimeViewSchema, postgameView: PostgameViewSchema } as const;
