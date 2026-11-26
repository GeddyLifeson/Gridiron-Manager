// Read models of the game-day frame screens (G-62): pregame (I1), halftime (I8.2) and postgame (I10). Each
// builder takes the core state the session holds (career/gameday) and returns plain data the screen draws.
// Only reported values pass: true readiness, true kicking lines and truth grades never enter a view (I1.7.1,
// I8.3.1, audit Part 17). app-services may not import zod, so the data schemas with a visibility class per field
// are proposed in test/game-frame/proposed-schemas.ts (truth-scanned there) for the integrator to move into
// @gm/schema; the specs are registered once the game-day state sits in the observed world.
// The inputs are typed structurally (the fields each view reads) because `@gm/career` does not export the
// gameday namespace until the integrator adds its barrel line; the career types satisfy these shapes.

type TaskStateName = 'open' | 'done' | 'delegated' | 'missed' | 'hidden';
type UnitName = 'offense' | 'defense' | 'special';
type UptakeWordName = 'solid' | 'shaky' | 'risky' | 'not_told';

/** The fields of career gameday `PregameState` this view reads. */
export interface PregameStateInput {
  readonly now: number;
  readonly budgetLeft: number;
  readonly kickoffDelayMin: number;
  readonly defs: Readonly<Record<string, { readonly id: string; readonly leaf: string; readonly opensAt: number; readonly deadline: number; readonly costMin: number }>>;
  readonly tasks: Readonly<Record<string, { readonly state: TaskStateName; readonly owner: string; readonly locked: boolean }>>;
  readonly tossOptionLost: readonly ('own' | 'opponent')[];
  readonly log: readonly ({ readonly t: number; readonly kind: string } & { readonly task?: string })[];
}

/** The fields of career gameday `HalftimeSession` this view reads. */
export interface HalftimeSessionInput {
  readonly workingMin: number;
  readonly staffMin: number;
  readonly playerMin: number;
  readonly staffUsed: number;
  readonly playerUsed: number;
  readonly attending: UnitName;
  readonly sentBack: readonly UnitName[];
  readonly items: readonly ({ readonly kind: string; readonly unit?: UnitName; readonly adjustment?: { readonly unit: UnitName; readonly kind: string; readonly target: string } })[];
}

/** The fields of career gameday `PostgameRecord` this view reads. */
export interface PostgameRecordInput {
  readonly gameId: string;
  readonly handshake: { readonly own: string; readonly other: string; readonly result: { readonly mediaNotice: boolean } } | null;
  readonly talk: { readonly tone: string; readonly points: readonly string[]; readonly effect: { readonly fit: 'good' | 'neutral' | 'poor' } } | null;
  readonly gameBalls: readonly { readonly receiver: string; readonly reason: string }[];
  readonly injuries: readonly { readonly playerId: string; readonly bodyPart: string; readonly firstRead: string; readonly inProtocol: boolean; readonly finishedGame: boolean }[];
  readonly media: { readonly held: boolean; readonly questions: readonly unknown[]; readonly answers: readonly { readonly question: number; readonly style: string }[] } | null;
  readonly dayAfter: 'normal' | 'short' | 'off' | null;
  readonly office: readonly { readonly playId: string; readonly reply: 'correct' | 'incorrect' | 'no_comment' }[];
}

/** Same test as career gameday `canAct`: open, not locked, inside its window. */
function actionable(s: PregameStateInput, id: string): boolean {
  const d = s.defs[id], st = s.tasks[id];
  return !!d && !!st && st.state !== 'hidden' && !st.locked && s.now <= d.opensAt && s.now >= d.deadline && (st.state === 'open' || st.state === 'done');
}

function nextDeadline(s: PregameStateInput): number {
  let best = 0;
  for (const d of Object.values(s.defs)) if (d.deadline < s.now && d.deadline > best) best = d.deadline;
  return best;
}

// ---------------------------------------------------------------------------------------------- pregame

export interface PregameTaskRow {
  id: string;
  leaf: string;
  opensAt: number;
  deadline: number;
  costMin: number;
  owner: string;
  state: TaskStateName;
  locked: boolean;
  actionable: boolean;
}

export interface PregameViewData {
  minutesToKickoff: number;
  budgetLeft: number;
  kickoffDelayMin: number;
  nextDeadline: number;
  tasks: PregameTaskRow[];
  tossOptionLost: ('own' | 'opponent')[];
  log: { t: number; kind: string; task: string | null }[];
}

/** The pregame screen: the countdown, the budget and the task list in deadline order (I1.1.1). */
export function pregameView(s: PregameStateInput): PregameViewData {
  const tasks = Object.values(s.defs)
    .filter((d) => s.tasks[d.id]!.state !== 'hidden')
    .sort((a, b) => b.deadline - a.deadline || a.id.localeCompare(b.id))
    .map((d) => {
      const st = s.tasks[d.id]!;
      return { id: d.id, leaf: d.leaf, opensAt: d.opensAt, deadline: d.deadline, costMin: d.costMin, owner: st.owner, state: st.state, locked: st.locked, actionable: actionable(s, d.id) };
    });
  return {
    minutesToKickoff: s.now, budgetLeft: s.budgetLeft, kickoffDelayMin: s.kickoffDelayMin, nextDeadline: nextDeadline(s), tasks,
    tossOptionLost: [...s.tossOptionLost],
    log: s.log.map((e) => ({ t: e.t, kind: e.kind, task: e.task ?? null })),
  };
}

// ---------------------------------------------------------------------------------------------- halftime

export interface HalftimeViewData {
  workingMin: number;
  staffMin: number;
  playerMin: number;
  staffLeft: number;
  playerLeft: number;
  attending: UnitName;
  sentBack: UnitName[];
  items: { kind: string; unit: string | null; detail: string | null }[];
  /** The teaching coach's uptake words per affected player (his estimate, never the truth, I8.1.4). */
  uptake: { adjustmentId: string; playerId: string; word: UptakeWordName }[];
}

/** The halftime screen (I8.2.1, I8.2.2): phase budgets, the side the user sits with, chosen items and uptake words. */
export function halftimeView(s: HalftimeSessionInput, words: readonly { adjustmentId: string; playerId: string; word: UptakeWordName }[] = []): HalftimeViewData {
  const left = { staff: s.staffMin - s.staffUsed, player: s.playerMin - s.playerUsed };
  return {
    workingMin: s.workingMin, staffMin: s.staffMin, playerMin: s.playerMin, staffLeft: left.staff, playerLeft: left.player,
    attending: s.attending, sentBack: [...s.sentBack],
    items: s.items.map((i) => ({
      kind: i.kind,
      unit: i.unit ?? i.adjustment?.unit ?? null,
      detail: i.adjustment ? `${i.adjustment.kind}:${i.adjustment.target}` : null,
    })),
    uptake: words.map((w) => ({ ...w })),
  };
}

// ---------------------------------------------------------------------------------------------- postgame

export interface PostgameViewData {
  gameId: string;
  handshake: { own: string; other: string; mediaNotice: boolean } | null;
  talk: { tone: string; points: string[]; fit: 'good' | 'neutral' | 'poor' } | null;
  gameBalls: { receiver: string; reason: string }[];
  injuries: { playerId: string; bodyPart: string; firstRead: string; inProtocol: boolean; finishedGame: boolean }[];
  media: { held: boolean; questions: number; answers: { question: number; style: string }[] } | null;
  dayAfter: 'normal' | 'short' | 'off' | null;
  officeReplies: { playId: string; reply: 'correct' | 'incorrect' | 'no_comment' }[];
}

/**
 * The postgame screen and the game's page in the season log (I10.6.1). The talk shows its fit band (the read
 * the staff and room give back), never its morale number; first notes stay private and are not in this view.
 */
export function postgameView(r: PostgameRecordInput): PostgameViewData {
  return {
    gameId: r.gameId,
    handshake: r.handshake ? { own: r.handshake.own, other: r.handshake.other, mediaNotice: r.handshake.result.mediaNotice } : null,
    talk: r.talk ? { tone: r.talk.tone, points: [...r.talk.points], fit: r.talk.effect.fit } : null,
    gameBalls: r.gameBalls.map((b) => ({ receiver: b.receiver, reason: b.reason })),
    injuries: r.injuries.map((l) => ({ playerId: l.playerId, bodyPart: l.bodyPart, firstRead: l.firstRead, inProtocol: l.inProtocol, finishedGame: l.finishedGame })),
    media: r.media ? { held: r.media.held, questions: r.media.questions.length, answers: r.media.answers.map((a) => ({ question: a.question, style: a.style })) } : null,
    dayAfter: r.dayAfter,
    officeReplies: r.office.map((o) => ({ ...o })),
  };
}

