// Read models of the game-day seats below head coach (G-79; S5, O7.4). The seat view is what the user's seat
// lets him have during play: his line on the sheet, the lower panel and its task, the time left, the pick pad in
// his staff's terms, and the booth line on his channel. Truth never enters the live view (index rule 9: no
// overlay names or hints at the look). The role report is built after the game from graded records and shows
// what the opponent really played, as next-day film would (S5.5.1); it carries no hidden value or probability.
// Inputs are typed structurally (the fields each view reads) because `@gm/career` does not export the seats
// namespace until the integrator adds its barrel line (CR-G79-1); the career types satisfy these shapes.

type ChannelName = 'offense' | 'defense' | 'special_teams' | 'head_coach' | 'analyst';

/** The fields of career seats `GamedayRole` this view reads. */
export interface SeatRoleInput {
  readonly seatId: number;
  readonly role: string;
  readonly location: 'booth' | 'sideline';
  readonly channel: ChannelName;
  readonly comm: 'headset' | 'hand_signal_runner';
  readonly watch: string;
  readonly report: string;
  readonly rights: readonly string[];
}

/** The fields of career seats `SeatLayout` this view reads. */
export interface SeatLayoutInput {
  readonly panel: string;
  readonly task: string;
  readonly view: 'booth_overhead' | 'sideline';
  readonly zoomMin: number;
  readonly gameWaits: boolean;
  readonly tasks: readonly string[];
}

/** The fields of career seats `BoothLine` this view reads. */
export interface BoothLineInput {
  readonly shown: readonly { readonly id: number; readonly kind: string; readonly fromSeat: number; readonly body: Readonly<Record<string, string | number | boolean | null>> }[];
  readonly queued: readonly { readonly message: { readonly id: number; readonly channel: ChannelName }; readonly ageS: number }[];
}

export interface SeatViewInput {
  readonly role: SeatRoleInput;
  readonly layout: SeatLayoutInput;
  readonly selectedChannel: ChannelName;
  readonly listenable: readonly ChannelName[];
  readonly line: BoothLineInput;
  /** The open task window, if any: what is asked, seconds left. */
  readonly open: { readonly ask: string; readonly secondsLeft: number; readonly phase?: 'pre' | 'post' } | null;
  /** The pick pad in the staff's terms (G4), `family/variant` paths. */
  readonly pad: readonly string[];
  /** Correction options for a position coach, as built from what happened (no cause ids). */
  readonly corrections: readonly { readonly id: string; readonly playerId: number; readonly kind: string }[];
  readonly correctionsLeft: number;
  readonly onField: number | null;
  readonly simulated: boolean;
}

export interface SeatView {
  readonly role: string;
  readonly location: 'booth' | 'sideline';
  readonly channel: ChannelName;
  readonly canPickChannel: boolean;
  readonly channels: readonly ChannelName[];
  readonly noHeadset: boolean;
  readonly panel: string;
  readonly task: string;
  readonly view: 'booth_overhead' | 'sideline';
  readonly zoomMin: number;
  readonly gameWaits: boolean;
  readonly open: { readonly ask: string; readonly secondsLeft: number; readonly phase: 'pre' | 'post' | null } | null;
  readonly pad: readonly { readonly family: string; readonly variants: readonly string[] }[];
  readonly corrections: readonly { readonly id: string; readonly playerId: number; readonly kind: string }[];
  readonly correctionsLeft: number;
  readonly onField: number | null;
  readonly line: readonly { readonly id: number; readonly kind: string; readonly fromSeat: number; readonly text: string }[];
  readonly queued: readonly { readonly id: number; readonly channel: ChannelName; readonly ageS: number }[];
  readonly simulated: boolean;
}

/** Fields a live view may never carry (truth or engine values; index rule 9, E9.3.4 rule 3). */
export const LIVE_FORBIDDEN = ['truth', 'played', 'shown', 'causeId', 'probability', 'credit', 'grade'] as const;

function padTree(pad: readonly string[]): { family: string; variants: string[] }[] {
  const by = new Map<string, string[]>();
  for (const l of pad) {
    const [f, v] = l.split('/');
    if (!f) continue;
    const list = by.get(f) ?? [];
    if (v && !list.includes(v)) list.push(v);
    by.set(f, list);
  }
  return [...by.entries()].map(([family, variants]) => ({ family, variants }));
}

const bodyText = (b: Readonly<Record<string, string | number | boolean | null>>): string =>
  Object.entries(b).filter(([k]) => !(LIVE_FORBIDDEN as readonly string[]).includes(k)).map(([k, v]) => `${k}: ${String(v)}`).join(', ');

export function buildSeatView(i: SeatViewInput): SeatView {
  const bench = i.layout.tasks.includes('corrections');
  return {
    role: i.role.role,
    location: i.role.location,
    channel: i.selectedChannel,
    canPickChannel: i.listenable.length > 1,
    channels: i.listenable,
    noHeadset: i.role.comm === 'hand_signal_runner',
    panel: i.layout.panel,
    task: i.layout.task,
    view: i.layout.view,
    zoomMin: i.layout.zoomMin,
    gameWaits: i.layout.gameWaits,
    open: i.open ? { ask: i.open.ask, secondsLeft: Math.max(0, Math.round(i.open.secondsLeft * 10) / 10), phase: i.open.phase ?? null } : null,
    pad: padTree(i.pad),
    corrections: bench ? i.corrections.map((c) => ({ id: c.id, playerId: c.playerId, kind: c.kind })) : [],
    correctionsLeft: bench ? i.correctionsLeft : 0,
    onField: i.onField,
    line: i.line.shown.map((m) => ({ id: m.id, kind: m.kind, fromSeat: m.fromSeat, text: bodyText(m.body) })),
    queued: i.line.queued.map((q) => ({ id: q.message.id, channel: q.message.channel, ageS: Math.round(q.ageS) })),
    simulated: i.simulated,
  };
}

type ShareInput = { readonly value: number; readonly n: number } | 'not_enough_yet';

/** The fields of career seats `RoleReport` this view reads. */
export interface RoleReportInput {
  readonly games: number;
  readonly accuracy: ShareInput;
  readonly byFamily: Readonly<Record<string, ShareInput>>;
  readonly medianSeconds: number | null;
  readonly advice: { readonly matchedModel: ShareInput; readonly workedOut: ShareInput };
  readonly corrections: { readonly given: number; readonly worked: number };
  readonly signalErrorsPerGame: number | null;
  readonly lateRelaysPerGame: number | null;
  readonly estimated: boolean;
}

/** One graded event as film shows it next day: his entry beside what the opponent really played. */
export interface RoleEventInput {
  readonly kind: string;
  readonly playId: number | null;
  readonly entry: string | null;
  readonly truth: string | null;
  readonly seconds: number | null;
  readonly simulated: boolean;
}

export interface RoleReportView {
  readonly games: number;
  readonly accuracyPct: number | null;
  readonly families: readonly { readonly family: string; readonly pct: number | null; readonly n: number | null }[];
  readonly medianSeconds: number | null;
  readonly adviceMatchedPct: number | null;
  readonly adviceWorkedPct: number | null;
  readonly correctionsGiven: number;
  readonly correctionsWorked: number;
  readonly signalErrorsPerGame: number | null;
  readonly lateRelaysPerGame: number | null;
  readonly estimated: boolean;
  readonly events: readonly { readonly kind: string; readonly playId: number | null; readonly yours: string | null; readonly film: string | null; readonly seconds: number | null; readonly estimated: boolean }[];
}

const pct = (s: ShareInput): number | null => (s === 'not_enough_yet' ? null : Math.round(s.value * 1000) / 10);

export function buildRoleReportView(r: RoleReportInput, events: readonly RoleEventInput[]): RoleReportView {
  return {
    games: r.games,
    accuracyPct: pct(r.accuracy),
    families: Object.entries(r.byFamily).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([family, s]) => ({ family, pct: pct(s), n: s === 'not_enough_yet' ? null : s.n })),
    medianSeconds: r.medianSeconds,
    adviceMatchedPct: pct(r.advice.matchedModel),
    adviceWorkedPct: pct(r.advice.workedOut),
    correctionsGiven: r.corrections.given,
    correctionsWorked: r.corrections.worked,
    signalErrorsPerGame: r.signalErrorsPerGame,
    lateRelaysPerGame: r.lateRelaysPerGame,
    estimated: r.estimated,
    events: events.map((e) => ({ kind: e.kind, playId: e.playId, yours: e.entry, film: e.truth, seconds: e.seconds, estimated: e.simulated })),
  };
}
