// Data schema of the game management read model (G-61). It lives here because app-services may not import
// zod (CR-G61-1, same as CR-G27-4); the integrator moves it into @gm/schema and passes it to
// `gameManagementReadModels`. Every field carries a visibility class: the clock, timeouts and score state are
// public; the decision bar, chart, analyst line, staff messages and injury words are the team's own. None is truth.
import { z } from 'zod';
import { pub, own } from '@gm/schema';

const Kind = z.enum(['penalty', 'runoff', 'challenge', 'fourth_down', 'try', 'kickoff', 'coin_toss', 'overtime_toss', 'kneel']);
const Mark = z.enum(['solid', 'fair', 'thin']);
const ChannelE = z.enum(['offense', 'defense', 'special_teams', 'game_management']);
const Result = z.object({
  down: own(z.number().int().nullable(), 'count'),
  distanceYd: own(z.number().nullable(), 'yd'),
  yardsToGoalYd: own(z.number().nullable(), 'yd'),
  clockTenths: own(z.number().int().optional(), 'tenths_s'),
}).strict();

const Bar = z.object({
  id: own(z.string()),
  kind: own(Kind),
  mode: own(z.enum(['decide', 'recommend'])),
  options: own(z.array(z.object({ id: own(z.string()), labelId: own(z.string()), key: own(z.string()), result: own(Result.nullable()), guarded: own(z.boolean()) }).strict())),
  secondsLeft: own(z.number().min(0), 's'),
  onExpiry: own(z.object({ optionId: own(z.string()), by: own(z.enum(['standing_rule', 'default'])) }).strict()),
  chart: own(z.object({ option: own(z.string()), coachsCall: own(z.boolean()), mark: own(Mark.nullable()) }).strict().nullable()),
  advisor: own(z.object({
    optionId: own(z.string()), marginWp: own(z.number(), 'ratio'), breakEven: own(z.number().nullable(), 'ratio'),
    estimate: own(z.number().nullable(), 'ratio'), close: own(z.boolean()),
  }).strict().nullable()),
  advisorDueInS: own(z.number().nullable(), 's'),
  fgRangeYardsToGoal: own(z.number().nullable(), 'yd'),
  noticeOnly: own(z.boolean()),
  queued: own(z.number().int().min(0), 'count'),
  holdS: own(z.number().min(0), 's'),
}).strict();

const Control = {
  enabled: own(z.boolean()),
  reasonKey: own(z.string().nullable()),
  count: own(z.number().int().min(0), 'count'),
  guarded: own(z.boolean()),
};

const Message = {
  id: own(z.string()),
  channel: own(z.union([ChannelE, z.literal('sideline')])),
  kind: own(z.enum(['note', 'answer', 'alert', 'medical', 'position', 'player'])),
  speakerRole: own(z.string()),
  speakerName: own(z.string()),
  text: own(z.string()),
  ageInPlays: own(z.number().int().min(0).nullable(), 'count'),
  read: own(z.boolean()),
};

export const GameManagementView = z.object({
  gameId: own(z.string()),
  seat: own(z.enum(['head_coach', 'advisor', 'coordinator', 'other'])),
  bar: own(Bar.nullable()),
  timeout: own(z.object(Control).strict().nullable()),
  challenge: own(z.object({ ...Control, aspects: own(z.array(z.string())), windowS: own(z.number().nullable(), 's'), byTimeout: own(z.boolean()) }).strict().nullable()),
  clock: pub(z.object({
    clockTenths: pub(z.number().int().min(0), 'tenths_s'),
    playClockTenths: pub(z.number().int().min(0), 'tenths_s'),
    status: pub(z.enum(['running', 'stopped'])),
    startsOn: pub(z.enum(['snap', 'ready']).nullable()),
    timeoutsOwn: pub(z.number().int().min(0), 'count'),
    timeoutsOpp: pub(z.number().int().min(0), 'count'),
    panel: pub(z.object({
      leader: pub(z.enum(['own', 'opp'])),
      kneels: pub(z.number().int().min(0), 'count'),
      burnS: pub(z.number().min(0), 's'),
      trailingTimeouts: pub(z.number().int().min(0), 'count'),
      burnAgainstTimeoutsS: pub(z.number().min(0), 's'),
      kneelEndsGame: pub(z.boolean()),
    }).strict().nullable()),
  }).strict()),
  sideline: own(z.object({
    channel: own(ChannelE),
    line: own(z.object({ ...Message, clipped: own(z.string()) }).strict().nullable()),
    list: own(z.array(z.object(Message).strict())),
    headlines: own(z.array(z.object({ channel: own(ChannelE), count: own(z.number().int().min(1), 'count') }).strict())),
    infoDelayS: own(z.number().min(0), 's'),
  }).strict()),
  injuries: own(z.array(z.object({
    playerId: own(z.number().int(), 'id'),
    name: own(z.string()),
    position: own(z.string()),
    bodyPart: own(z.string()),
    word: own(z.enum(['being_evaluated', 'questionable', 'doubtful', 'out', 'concussion_protocol', 'cleared'])),
    revised: own(z.boolean()),
    replacedBy: own(z.string().nullable()),
  }).strict())),
}).strict();

export const GameManagementData = z.union([
  z.object({ teamId: own(z.number().int(), 'id'), live: own(z.literal(false)) }).strict(),
  z.object({ teamId: own(z.number().int(), 'id'), live: own(z.literal(true)), view: own(GameManagementView) }).strict(),
]);
