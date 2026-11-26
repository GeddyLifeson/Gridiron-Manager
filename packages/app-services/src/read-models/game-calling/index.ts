// Read model of the game-day console (G-60, O2.1.1 regions). Plain data the screen draws: the situation strip,
// the call sheet panel with key hints and readiness marks, the call builder line, the sideline panel and the
// hint bar. Only what the caller may know enters (O2.1.2, I7, K9): the dead-ball record, the user's own sheet
// and staff estimates, the opponent's personnel once shown, booth notes as K6 wrote them. No truth-class field,
// no opponent call object and no true rating reaches it; people are described by observed grades only (A3
// ruling 21). The specs are registered with the observer once the game-day state sits in the observed world
// (integrator request in DECISIONS.md).
import {
  markers, playClockAt, selectedEntry, gridOrder, param,
  type ConsoleState, type Unit,
} from '../../commands/game-calling/index.ts';

/** The public fields of the dead-ball record the strip reads (GameState `pub` fields, I2.2.1). */
export interface StripInput {
  readonly period: number;
  readonly clockTenths: number;
  readonly clockRunning: boolean;
  readonly score: readonly [number, number];
  readonly down: number | null;
  readonly distance: number | null;
  /** Yard line as the caller says it: own 25, opponent 40, midfield. */
  readonly spot: { readonly side: 'own' | 'opp' | 'mid'; readonly yard: number };
  readonly hash: 'left' | 'middle' | 'right';
  readonly timeoutsLeft: readonly [number, number];
  /** Play clock length this down (40 or 25 s from the rule set); the strip says when the short clock runs. */
  readonly playClockLengthTenths: number;
  readonly shortClock: boolean;
}

export interface BoothNote { readonly role: string; readonly text: string; readonly agePlays: number }
export interface TendencyLine { readonly text: string; readonly sample: number }

export interface ConsoleViewInput {
  readonly console: ConsoleState;
  readonly atMs: number;
  readonly strip: StripInput;
  readonly personnelOnField: string;
  /** The opponent's personnel once shown (I2.2.3); null before. Their alignment is never text (O2.1.2). */
  readonly opponentPersonnel: string | null;
  readonly booth: BoothNote | null;
  readonly tendency: TendencyLine | null;
  readonly challengesLeft: number;
  /** Live key map: action to its display chord, so remapped keys show (O2.5.2). */
  readonly keyFor: (action: string) => string | null;
  /** The call as a coach says it (G4 renderCall through the playbook); defaults to the sheet label. */
  readonly callText?: (label: string, tagLabels: readonly string[], personnel: string | null) => string;
}

export interface EntryView { readonly id: string; readonly label: string; readonly key: string | null; readonly readiness: 'ready' | 'shaky' | 'not_installed'; readonly replacement: string | null; readonly selected: boolean }
export interface BoxView { readonly id: string; readonly title: string; readonly row: number; readonly col: number; readonly letter: string; readonly focused: boolean; readonly empty: boolean; readonly count: number; readonly entries: readonly EntryView[]; readonly tooMany: boolean }
export interface ControlView { readonly left: number; readonly enabled: boolean; readonly reason: string | null; readonly key: string | null }

export interface ConsoleView {
  readonly unit: Unit | null;
  readonly step: ConsoleState['step'];
  readonly strip: {
    readonly quarter: number; readonly clock: string; readonly clockRunning: boolean; readonly score: readonly [number, number];
    readonly downDistance: string | null; readonly spot: string; readonly hash: string; readonly timeouts: readonly [number, number];
    readonly playClockTenths: number; readonly latestTenths: number | null; readonly radioTenths: number | null; readonly late: boolean;
    readonly shortClock: boolean; readonly playClockLengthTenths: number;
  };
  readonly sheet: { readonly boxes: readonly BoxView[]; readonly focusHow: string };
  readonly callLine: { readonly text: string; readonly spokenTenths: number; readonly tags: readonly string[]; readonly personnel: string | null; readonly substitution: boolean; readonly sent: boolean; readonly committed: boolean; readonly relay: string } | null;
  readonly sideline: {
    readonly personnel: string; readonly opponentPersonnel: string | null; readonly booth: BoothNote | null; readonly tendency: TendencyLine | null;
    readonly tempo: string; readonly relay: string; readonly cadence: string | null; readonly timeout: ControlView; readonly challenge: ControlView;
  };
  readonly prompt: { readonly kind: 'options' | 'fourth'; readonly options: readonly { readonly key: string | null; readonly labelKey: string; readonly isDefault: boolean }[] } | null;
  readonly hint: readonly { readonly key: string; readonly action: string }[];
  readonly notice: string | null;
  /** I2.3.6 queued next calls: the box and the call, in the order queued. */
  readonly queue: readonly { readonly box: string; readonly label: string }[];
  /** I4.1.1 third-down pre-commit with the decision book's line; null off third down. */
  readonly precommit: { readonly choice: string; readonly bookLine: string | null; readonly key: string | null } | null;
  /** I4.1.1 the fourth-down unit was alerted on third down (`alerted`) or the user changed his mind (`reversal`). */
  readonly unitAlert: { readonly alerted: string | null; readonly reversal: boolean } | null;
}

const HINTS: Record<string, readonly string[]> = {
  select: ['call.entry_1', 'call.flip', 'call.motion_tag', 'call.protection_tag', 'call.route_tag', 'call.personnel', 'call.confirm', 'call.timeout', 'call.tempo_cycle', 'call.relay_cycle', 'call.precommit_cycle'],
  sent: ['call.clear', 'call.timeout', 'call.challenge', 'booth.list', 'call.precommit_cycle'],
  prompt: ['call.entry_1', 'call.confirm', 'call.timeout'],
  fourth: ['call.entry_1', 'call.timeout'],
  idle: ['call.timeout', 'call.challenge', 'booth.list', 'playback.skip'],
};

function mmss(tenths: number): string {
  const s = Math.floor(tenths / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function buildConsoleView(i: ConsoleViewInput): ConsoleView {
  const c = i.console;
  const unit = c.open?.unit ?? null;
  const sheet = unit ? c.cfg.sheets[unit] ?? null : null;
  const keys = unit ? c.cfg.keys[unit] ?? null : null;
  const m = markers(c);
  const clock = playClockAt(c, i.atMs);
  const sel = c.selected;
  const boxes: BoxView[] = sheet && keys ? gridOrder(sheet.boxes).map((b) => {
    const focused = c.focus.boxId === b.id;
    const shown = focused ? b.entries : b.entries.slice(0, 1);
    return {
      id: b.id, title: b.title, row: b.row, col: b.col, letter: (keys.box[b.id] ?? []).map((k) => k.slice(3)).join(''), focused,
      empty: b.entries.length === 0, count: b.entries.length, tooMany: b.entries.length > param('boxWarnEntries', c.cfg.table),
      entries: shown.map((e) => ({ id: e.id, label: e.label, key: keys.entry[e.id]?.replace(/^(Digit|Key)/, '') ?? null, readiness: e.readiness, replacement: e.replacement, selected: sel?.entryId === e.id })),
    };
  }) : [];
  const e = selectedEntry(c);
  const tagLabels = e ? e.tags.filter((t) => c.tags.includes(t.id)).map((t) => t.label) : [];
  const personnel = c.personnel ?? (e && e.call.unit === 'offense' ? e.call.personnelCode : null);
  const callLine = e ? {
    text: i.callText ? i.callText(e.label, tagLabels, c.personnel) : [c.personnel, e.label, ...tagLabels].filter(Boolean).join(' '),
    spokenTenths: e.spokenTenths + e.tags.filter((t) => c.tags.includes(t.id)).reduce((a, t) => a + t.spokenTenths, 0),
    tags: tagLabels, personnel, substitution: personnel !== null && personnel !== i.personnelOnField,
    sent: c.sent !== null, committed: c.sent?.committed ?? false, relay: c.sent?.relay ?? c.relay,
  } : null;
  const req = c.open?.request;
  const prompt = c.step === 'prompt' && req
    ? { kind: 'options' as const, options: req.options.map((o, n) => ({ key: n < 10 ? String((n + 1) % 10) : null, labelKey: o.labelKey, isDefault: o.optionId === req.defaultOptionId })) }
    : c.step === 'fourth' && req
      ? { kind: 'fourth' as const, options: (req.type === 'opposing_call' ? ['console.defense', 'console.puntReturn', 'console.fieldGoalBlock'] : ['console.go', 'console.punt', 'console.fieldGoal']).map((labelKey, n) => ({ key: String(n + 1), labelKey, isDefault: false })) }
      : null;
  const s = i.strip;
  return {
    unit, step: c.step,
    strip: {
      quarter: s.period, clock: mmss(s.clockTenths), clockRunning: s.clockRunning, score: s.score,
      downDistance: s.down === null ? null : `${s.down} & ${s.distance ?? '-'}`,
      spot: s.spot.side === 'mid' ? '50' : `${s.spot.side === 'own' ? 'own' : 'opp'} ${s.spot.yard}`, hash: s.hash, timeouts: s.timeoutsLeft,
      playClockTenths: clock, latestTenths: m?.latestTenths ?? null, radioTenths: m?.radioTenths ?? null,
      late: m !== null && c.sent === null && clock < m.latestTenths, shortClock: s.shortClock, playClockLengthTenths: s.playClockLengthTenths,
    },
    sheet: { boxes, focusHow: c.focus.how },
    callLine,
    sideline: {
      personnel: i.personnelOnField, opponentPersonnel: i.opponentPersonnel, booth: i.booth, tendency: i.tendency,
      tempo: c.tempo, relay: c.relay, cadence: c.cadence,
      timeout: { left: s.timeoutsLeft[0], enabled: !!c.open?.legal.timeout && !c.timeoutThisDeadBall, reason: c.open?.timeoutReason ?? null, key: i.keyFor('call.timeout') },
      challenge: { left: i.challengesLeft, enabled: !!c.open?.legal.challenge && !c.challengeThisDeadBall, reason: c.open?.challengeReason ?? null, key: i.keyFor('call.challenge') },
    },
    prompt,
    hint: (HINTS[c.step] ?? []).map((action) => ({ action, key: i.keyFor(action) ?? '' })).filter((h) => h.key !== ''),
    notice: c.notice,
    queue: c.queue.map((q) => {
      const b = c.cfg.sheets[q.unit]?.boxes.find((x) => x.id === q.boxId);
      return { box: b?.title ?? q.boxId, label: b?.entries.find((e) => e.id === q.entryId)?.label ?? q.entryId };
    }),
    precommit: c.open && c.open.request.type === 'snapping_call' && c.open.situation.down === 3 && c.open.kind !== 'option'
      ? { choice: `console.precommit.${c.precommit}`, bookLine: c.open.bookLine ?? null, key: i.keyFor('call.precommit_cycle') } : null,
    unitAlert: c.open?.kind === 'fourth_down' ? { alerted: c.alerted, reversal: c.reversal } : null,
  };
}
export * from './session-view.ts';
export * from './game-day-setup.ts';
