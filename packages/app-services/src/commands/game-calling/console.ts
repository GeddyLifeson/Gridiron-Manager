// The game-day console's state machine (O2.2.1 to O2.2.4, O2.4.1 to O2.4.3, O2.5.3, I2.3.1 to I2.3.3, I2.4.1,
// I2.4.3, I3.1.1, I4.1.1). Input: key-map actions (the live key map resolves chords, so remapped keys work) and
// the host's clock reading. Output: commands for the world service. Pure: no wall clock is read here. The host
// passes the real time it measured (I2.1.2); the play clock is derived from it and only runs forward. There is
// no command that pauses, holds or slows it (R1.2.6 gate item 6).
import type { DecisionRequest } from '@gm/schema';
import { param } from './params.ts';
import { focusBox, gridOrder, type CallSheet, type Focus, type SheetEntry, type SheetKeys, type SheetSituation, type TagKind, type Unit, type Relay } from './sheet.ts';
import { RELAYS, TEMPOS, defenseMarkers, offenseMarkers, relayTenths, type ConsoleTempo, type Markers } from './cycle.ts';

type Table = Parameters<typeof param>[1];
export type Step = 'idle' | 'fourth' | 'select' | 'sent' | 'prompt';

export interface ConsoleConfig {
  readonly sheets: Readonly<Partial<Record<Unit, CallSheet>>>;
  readonly keys: Readonly<Partial<Record<Unit, SheetKeys>>>;
  /** Snap-count parts of the playbook (G4); the cadence key cycles them. Empty: the key does nothing. */
  readonly cadences: readonly string[];
  /** I2.3.1 single-press calling: selecting an entry confirms it. */
  readonly singlePress: boolean;
  /** O2.5.3 guard list (data). Certified games use every guard. */
  readonly guards: { readonly challenge: boolean; readonly lateTimeout: boolean };
  readonly defaultTempo: ConsoleTempo;
  readonly defaultRelay: Relay;
  readonly radioCutoffTenths: number | null;
  /** I2.3.6 "send queued calls at once" for hurry-up: a matching queued call is sent without a confirm. */
  readonly sendQueuedAtOnce?: boolean;
  readonly table?: Table;
}

/** I2.3.6: a queued next call, kept for one box of the sheet. */
export interface QueueEntry { readonly unit: Unit; readonly boxId: string; readonly entryId: string }

/** I4.1.1: the third-down pre-commit for the coming fourth down. */
export type Precommit = 'decide_then' | 'punt' | 'field_goal' | 'go';
export const PRECOMMITS: readonly Precommit[] = ['decide_then', 'punt', 'field_goal', 'go'];

/** What the host knows when it opens a request (the dead-ball record as the caller sees it). */
export interface OpenInput {
  readonly request: DecisionRequest;
  readonly situation: SheetSituation;
  /**
   * The request is a call on the last down (O2.4.2: go, punt or field goal; on defense: defense, punt return or
   * block). `own_kick` is a kick the team makes (kickoff, safety kick, the kicked try after the try choice) and
   * `opponent_kick` the other team's free kick: both open the special sheet on the box holding `kickKind`.
   */
  readonly kind: 'scrimmage' | 'fourth_down' | 'own_kick' | 'opponent_kick' | 'option';
  /** For `own_kick` the kick kind, for `opponent_kick` the return kind the focus looks for (schema KickKind, ReturnKind). */
  readonly kickKind?: string | null;
  readonly playClockTenths: number;
  readonly atMs: number;
  readonly personnelOnField: string;
  readonly insideTwoMinute: boolean;
  /** Worker legality, never computed in the UI (O2.4.1). */
  readonly legal: { readonly timeout: boolean; readonly challenge: boolean };
  readonly timeoutReason: string | null;
  readonly challengeReason: string | null;
  /** Expected offense set time for the defensive marker (I3.1.1). */
  readonly offenseSetTenths: number;
  readonly afterTimeout: boolean;
  /** The coordinator's or booth's suggestion for this snap (I2.6.1), an entry id. */
  readonly suggestion: string | null;
  /** The request belongs to the same dead-ball period as the last one: one team timeout per period (B1). */
  readonly sameDeadBall?: boolean;
  /** A turnover, score or penalty on the last play clears the next-call queue (I2.3.6). */
  readonly clearQueue?: boolean;
  /** The decision book's line for the coming fourth down, shown on third down (I4.1.1, I1.4.2); null when none. */
  readonly bookLine?: string | null;
}

export interface Selection { readonly unit: Unit; readonly boxId: string; readonly entryId: string }

export interface SentCall {
  readonly requestId: number;
  readonly unit: Unit;
  readonly entry: SheetEntry;
  readonly tags: readonly string[];
  readonly personnel: string | null;
  readonly tempo: ConsoleTempo;
  readonly relay: Relay;
  readonly cadence: string | null;
  readonly acceptedAtPlayClockTenths: number;
  readonly committed: boolean;
}

export type ConsoleCommand =
  | { readonly type: 'call.commit'; readonly call: SentCall }
  | { readonly type: 'option.send'; readonly requestId: number; readonly optionId: string; readonly acceptedAtPlayClockTenths: number }
  | { readonly type: 'deadline.default'; readonly requestId: number }
  | { readonly type: 'timeout'; readonly atPlayClockTenths: number }
  | { readonly type: 'challenge'; readonly atPlayClockTenths: number }
  | { readonly type: 'booth.list' } | { readonly type: 'booth.ask' }
  | { readonly type: 'panel.tab'; readonly tab: number }
  | { readonly type: 'playbook.search' } | { readonly type: 'playback.skip' } | { readonly type: 'playback.replay_once' };

export interface ConsoleLogEntry { readonly atMs: number; readonly playClockTenths: number; readonly what: string; readonly detail?: string }

export interface ConsoleState {
  readonly cfg: ConsoleConfig;
  readonly open: (OpenInput & { readonly unit: Unit }) | null;
  readonly step: Step;
  readonly focus: Focus;
  readonly boxPrefix: { readonly codes: readonly string[]; readonly atMs: number } | null;
  readonly pendingBox: { readonly boxId: string; readonly atMs: number } | null;
  readonly armed: TagKind | 'personnel' | null;
  readonly personnelDigits: string;
  readonly selected: Selection | null;
  readonly tags: readonly string[];
  readonly preTags: readonly string[];
  readonly personnel: string | null;
  readonly tempo: ConsoleTempo;
  readonly relay: Relay;
  readonly cadence: string | null;
  readonly sent: SentCall | null;
  readonly timeoutThisDeadBall: boolean;
  readonly challengeThisDeadBall: boolean;
  readonly notice: string | null;
  readonly nowMs: number;
  readonly log: readonly ConsoleLogEntry[];
  /** I2.3.6 queued next calls (at most `queueMax`) and the box named for the next queue entry. */
  readonly queue: readonly QueueEntry[];
  readonly queueBox: { readonly boxId: string; readonly atMs: number } | null;
  /** I4.1.1 pre-commit made on third down, and the one this fourth down was alerted for. */
  readonly precommit: Precommit;
  readonly alerted: Precommit | null;
  /** The user changed his mind after the alerted unit started onto the field (I4.1.1). */
  readonly reversal: boolean;
}

export interface StepResult { readonly state: ConsoleState; readonly commands: readonly ConsoleCommand[]; readonly handled: boolean }

const NO_FOCUS: Focus = { boxId: null, how: 'none', empty: true };

export function initialConsole(cfg: ConsoleConfig): ConsoleState {
  return {
    cfg, open: null, step: 'idle', focus: NO_FOCUS, boxPrefix: null, pendingBox: null, armed: null, personnelDigits: '',
    selected: null, tags: [], preTags: [], personnel: null, tempo: cfg.defaultTempo, relay: cfg.defaultRelay, cadence: null,
    sent: null, timeoutThisDeadBall: false, challengeThisDeadBall: false, notice: null, nowMs: 0, log: [],
    queue: [], queueBox: null, precommit: 'decide_then', alerted: null, reversal: false,
  };
}

/** The play clock at a moment: the reading when the situation was shown minus the real time since (I2.1.2). */
export function playClockAt(s: ConsoleState, atMs: number): number {
  if (!s.open) return 0;
  return Math.max(0, s.open.playClockTenths - Math.floor((atMs - s.open.atMs) / 100));
}

function unitFor(o: OpenInput): Unit {
  if (o.kind === 'own_kick' || o.kind === 'opponent_kick') return 'special';
  if (o.request.type === 'opposing_call') return 'defense';
  return 'offense';
}

function sheetOf(s: ConsoleState, unit: Unit): CallSheet | null { return s.cfg.sheets[unit] ?? null; }

/** Focus on the first box holding a kick or return of this kind (O2.4.2: after choosing, the matching sheet opens). */
function kickFocus(sheet: CallSheet | null, kickKind: string): Focus {
  if (!sheet) return NO_FOCUS;
  const b = gridOrder(sheet.boxes).find((x) => x.entries.some((e) => (e.call.unit === 'kick' && e.call.kickKind === kickKind) || (e.call.unit === 'return' && e.call.returnKind === kickKind)));
  return b ? { boxId: b.id, how: 'rule', empty: false } : focusBox(sheet, { down: null, distance: null, toGoal: 0, twoMinute: false, lastPlayOfHalf: false, scoreDiff: 0, personnel: null, suddenChange: false, noHuddle: false });
}

/** Opens a request: the situation is shown and the decision window starts (I2.1.1 stage 2). */
export function openRequest(prev: ConsoleState, o: OpenInput): ConsoleState {
  const unit = unitFor(o);
  const sameDeadBall = o.sameDeadBall === true;
  const base: ConsoleState = {
    ...prev, open: { ...o, unit }, boxPrefix: null, pendingBox: null, armed: null, personnelDigits: '', selected: null, tags: [], preTags: [],
    personnel: null, cadence: null, sent: null, notice: null, nowMs: o.atMs,
    timeoutThisDeadBall: sameDeadBall ? prev.timeoutThisDeadBall : false, challengeThisDeadBall: sameDeadBall ? prev.challengeThisDeadBall : false,
    tempo: o.situation.noHuddle && prev.tempo === 'huddle' ? 'no_huddle' : prev.tempo,
  };
  const log = [...prev.log, { atMs: o.atMs, playClockTenths: o.playClockTenths, what: 'open', detail: `${o.request.type}#${o.request.requestId}` }];
  // Prompts between plays (a challenge window, a penalty choice) leave the queue and the pre-commit alone.
  if (o.kind === 'option') return { ...base, step: 'prompt', focus: NO_FOCUS, log };
  const callBase: ConsoleState = { ...base, queue: [], queueBox: null, alerted: null, reversal: false, log };
  const userFourth = o.kind === 'fourth_down' && o.request.type === 'snapping_call';
  // I4.1.1: a third down opens a fresh pre-commit; the fourth down after it uses the one made.
  const precommit: Precommit = sameDeadBall && o.kind !== 'fourth_down' ? prev.precommit : 'decide_then';
  if (o.kind === 'fourth_down') {
    const carried = userFourth && prev.precommit !== 'decide_then' ? prev.precommit : null;
    const fourth: ConsoleState = { ...callBase, precommit, step: 'fourth', focus: NO_FOCUS };
    if (!carried) return fourth;
    const pick = carried === 'go' ? 1 : carried === 'punt' ? 2 : 3;
    const r = chooseUnit({ ...fourth, alerted: carried }, pick, o.atMs);
    return { ...r.state, notice: 'console.unitReady' };
  }
  const sheet = sheetOf(base, unit);
  const kick = (o.kind === 'own_kick' || o.kind === 'opponent_kick') && o.kickKind ? o.kickKind : null;
  const focus = kick ? kickFocus(sheet, kick) : sheet ? focusBox(sheet, o.situation) : NO_FOCUS;
  let s: ConsoleState = { ...callBase, precommit, step: 'select', focus, notice: focus.empty ? 'console.boxEmpty' : null };
  if (o.suggestion) s = { ...s, notice: s.notice ?? 'console.suggestionReady' };
  // I2.3.6: the queued call for the box that occurred is preselected; the others are cleared.
  const hit = o.clearQueue ? undefined : prev.queue.find((q) => q.unit === unit && q.boxId === focus.boxId);
  const e = hit ? entryById(sheet, hit.boxId, hit.entryId) : null;
  if (hit && e) {
    s = logged({ ...s, selected: { unit, boxId: hit.boxId, entryId: hit.entryId }, notice: e.replacement ? 'console.replacement' : 'console.queuedReady' }, o.atMs, 'queued_preselect', e.id);
    if (s.cfg.sendQueuedAtOnce && s.tempo === 'hurry_up' && !e.replacement) return send(s, o.atMs).state;
  }
  return s;
}

/** Offensive personnel identified (I3.1.1 stage 1): the defensive focus is recomputed with the group. */
export function personnelShown(s: ConsoleState, personnel: string, atMs: number): ConsoleState {
  if (!s.open || s.open.unit !== 'defense') return s;
  const situation = { ...s.open.situation, personnel };
  const sheet = sheetOf(s, 'defense');
  const focus = sheet && s.selected === null ? focusBox(sheet, situation) : s.focus;
  return { ...s, open: { ...s.open, situation }, focus, nowMs: atMs, log: [...s.log, { atMs, playClockTenths: playClockAt(s, atMs), what: 'personnel_shown', detail: personnel }] };
}

function entryById(sheet: CallSheet | null, boxId: string, entryId: string): SheetEntry | null {
  return sheet?.boxes.find((b) => b.id === boxId)?.entries.find((e) => e.id === entryId) ?? null;
}

export function selectedEntry(s: ConsoleState): SheetEntry | null {
  return s.selected ? entryById(sheetOf(s, s.selected.unit), s.selected.boxId, s.selected.entryId) : null;
}

/** The latest-call marker for the call as it stands (I2.1.1, I3.1.1). Moves on every key that changes the call. */
export function markers(s: ConsoleState): Markers | null {
  if (!s.open) return null;
  const e = selectedEntry(s);
  const spoken = (e?.spokenTenths ?? 0) + (e ? e.tags.filter((t) => s.tags.includes(t.id)).reduce((a, t) => a + t.spokenTenths, 0) : 0);
  const want = s.personnel ?? (e && e.call.unit === 'offense' ? e.call.personnelCode : null);
  const substitution = want !== null && want !== s.open.personnelOnField;
  const kick = e && e.call.unit === 'kick' ? e.call.kickKind : null;
  if (s.open.unit === 'special' && s.open.kind === 'fourth_down' && (kick === 'punt' || kick === 'field_goal')) {
    return { latestTenths: relayTenths(s.relay, spoken, s.cfg.table) + unitChangeTenths(kick, s.alerted, s.reversal, s.cfg.table) + param('minPresnapTenths', s.cfg.table), radioTenths: null };
  }
  if (s.open.unit === 'defense') {
    return defenseMarkers({ spokenTenths: spoken, relay: s.relay, offenseSetTenths: s.open.offenseSetTenths, substitution, atSideline: s.open.afterTimeout }, s.cfg.table);
  }
  return offenseMarkers({ spokenTenths: spoken, relay: s.relay, tempo: s.tempo, substitution, afterTimeout: s.open.afterTimeout, radioCutoffTenths: s.cfg.radioCutoffTenths }, s.cfg.table);
}

/**
 * I4.1.1 stage 5 for a kicking unit on fourth down: dead ball to set when alerted, more when not, and the full
 * run-off and run-on when the user changed his mind after the alerted unit started out.
 */
export function unitChangeTenths(kick: 'punt' | 'field_goal', alerted: Precommit | null, reversal: boolean, t?: Table): number {
  const base = param(kick === 'punt' ? 'puntUnitTenths' : 'fieldGoalUnitTenths', t);
  const wasAlerted = alerted === kick;
  return base + (wasAlerted ? 0 : param('unalertedUnitTenths', t)) + (reversal ? param('reversalTenths', t) : 0);
}

function logged(s: ConsoleState, atMs: number, what: string, detail?: string): ConsoleState {
  return { ...s, nowMs: atMs, log: [...s.log, { atMs, playClockTenths: playClockAt(s, atMs), what, ...(detail === undefined ? {} : { detail }) }] };
}

function send(s: ConsoleState, atMs: number): StepResult {
  const e = selectedEntry(s);
  if (!s.open || !s.selected || !e) return { state: { ...s, notice: 'console.nothingSelected' }, commands: [], handled: true };
  const call: SentCall = {
    requestId: s.open.request.requestId, unit: s.selected.unit, entry: e, tags: s.tags, personnel: s.personnel, tempo: s.tempo,
    relay: s.relay, cadence: s.cadence, acceptedAtPlayClockTenths: playClockAt(s, atMs), committed: false,
  };
  // A relay the call is not installed for falls back to the radio (or the messenger without radio) (I2.4.1).
  const relayOk = (s.relay === 'wristband' && e.onBand) || (s.relay === 'signals' && e.signal) || s.relay === 'messenger' || (s.relay === 'radio' && s.cfg.radioCutoffTenths !== null);
  const fixed: SentCall = relayOk ? call : { ...call, relay: s.cfg.radioCutoffTenths !== null ? 'radio' : 'messenger' };
  const next = logged({ ...s, step: 'sent', sent: fixed, armed: null, pendingBox: null, boxPrefix: null, notice: relayOk ? null : 'console.relayFallback' }, atMs, 'confirm', e.id);
  return settle(next, atMs);
}

/**
 * Commits a sent call to the worker once it can no longer be recalled: at the latest-call marker, at the
 * engine's deadline, or at once when no marker lies ahead (O2.2.3 recall window).
 */
export function settle(s: ConsoleState, atMs: number): StepResult {
  if (!s.open || !s.sent || s.sent.committed) return { state: s, commands: [], handled: false };
  const clock = playClockAt(s, atMs);
  const m = markers(s);
  const latest = Math.max(m?.latestTenths ?? 0, s.open.request.deadlinePlayClockTenths ?? 0);
  if (clock > latest && s.sent.acceptedAtPlayClockTenths > latest) return { state: s, commands: [], handled: false };
  const sent = { ...s.sent, committed: true };
  return { state: logged({ ...s, sent }, atMs, 'commit'), commands: [{ type: 'call.commit', call: sent }], handled: true };
}

/** Time passes (the host's frame). The deadline applies the default when no call was made (J11.6.1, I3.1.3). */
export function tick(s: ConsoleState, atMs: number): StepResult {
  if (!s.open || s.step === 'idle') return { state: { ...s, nowMs: atMs }, commands: [], handled: false };
  if (s.sent) return settle({ ...s, nowMs: atMs }, atMs);
  const deadline = s.open.request.deadlinePlayClockTenths;
  // A prompt with a fixed window (penalty choice, toss) closes after that much real time (J11.6.1).
  const win = s.open.request.windowTenths;
  const windowShut = deadline === null && win !== null && atMs - s.open.atMs >= win * 100;
  if ((deadline !== null && playClockAt(s, atMs) <= deadline) || windowShut) {
    const st = logged({ ...s, step: 'idle', notice: 'console.playingDefault' }, atMs, 'deadline');
    return { state: st, commands: [{ type: 'deadline.default', requestId: s.open.request.requestId }], handled: true };
  }
  return { state: { ...s, nowMs: atMs }, commands: [], handled: false };
}

function guarded(s: ConsoleState, kind: 'challenge' | 'timeout', held: boolean, atMs: number): boolean {
  if (!s.open) return false;
  const on = kind === 'challenge' ? s.cfg.guards.challenge : s.cfg.guards.lateTimeout && s.open.insideTwoMinute;
  if (!on || held) return false;
  return playClockAt(s, atMs) >= param('guardMinClockTenths', s.cfg.table); // never under 3 s (O2.5.3 edge)
}

function selectEntry(s: ConsoleState, boxId: string, entryId: string, atMs: number): StepResult {
  const unit = s.open!.unit;
  const e = entryById(sheetOf(s, unit), boxId, entryId);
  if (!e) return { state: s, commands: [], handled: false };
  const tags = s.preTags.filter((id) => e.tags.some((t) => t.id === id));
  let st = logged({ ...s, selected: { unit, boxId, entryId }, focus: { ...s.focus, boxId }, tags, preTags: [], pendingBox: null, boxPrefix: null }, atMs, 'select', e.id);
  if (s.cfg.singlePress) return send(st, atMs);
  st = { ...st, notice: e.replacement ? 'console.replacement' : null };
  return { state: st, commands: [], handled: true };
}

function toggleTag(s: ConsoleState, kind: TagKind, n: number): ConsoleState {
  const e = selectedEntry(s);
  const pool = e ? e.tags.filter((t) => t.kind === kind) : [];
  const tag = pool[n];
  if (!tag) return { ...s, armed: null, notice: 'console.noSuchTag' };
  const list = s.selected ? s.tags : s.preTags;
  const on = list.includes(tag.id);
  // Two tags in one group conflict (I2.3.2 edge): the new one replaces the old.
  const groupIds = new Set((e?.tags ?? []).filter((t) => t.group === tag.group).map((t) => t.id));
  const next = on ? list.filter((x) => x !== tag.id) : [...list.filter((x) => !groupIds.has(x)), tag.id];
  return s.selected ? { ...s, tags: next, armed: null, notice: tag.installed ? null : 'console.tagNotInstalled' } : { ...s, preTags: next, armed: null };
}

function digitOf(action: string | undefined): number | null {
  const m = action ? /^call\.entry_(\d)$/.exec(action) : null;
  return m ? Number(m[1]) : null;
}

function prompt(s: ConsoleState, action: string | undefined, atMs: number): StepResult {
  const req = s.open!.request;
  const d = digitOf(action);
  let optionId: string | null = null;
  if (d !== null) optionId = req.options[(d === 0 ? 10 : d) - 1]?.optionId ?? null;
  else if (action === 'call.confirm') optionId = req.defaultOptionId;
  if (optionId === null) return { state: s, commands: [], handled: false };
  const at = playClockAt(s, atMs);
  return { state: logged({ ...s, step: 'idle' }, atMs, 'option', optionId), commands: [{ type: 'option.send', requestId: req.requestId, optionId, acceptedAtPlayClockTenths: at }], handled: true };
}

/** O2.4.2: go, punt, field goal on fourth down; on defense, defense, punt return or field goal block. One key each. */
function chooseUnit(s: ConsoleState, d: number | null, atMs: number): StepResult {
  if (d === null || !s.open) return { state: s, commands: [], handled: false };
  const open = s.open;
  const pick = open.request.type === 'opposing_call'
    ? ({ 1: ['defense', null], 2: ['special', 'punt_return'], 3: ['special', 'field_goal_block'] } as Record<number, [Unit, string | null]>)[d]
    : ({ 1: ['offense', null], 2: ['special', 'punt'], 3: ['special', 'field_goal'] } as Record<number, [Unit, string | null]>)[d];
  if (!pick) return { state: s, commands: [], handled: false };
  const [unit, kick] = pick;
  const sheet = sheetOf(s, unit);
  const focus = kick ? kickFocus(sheet, kick) : sheet ? focusBox(sheet, open.situation) : NO_FOCUS;
  const chosen: Precommit = kick === 'punt' ? 'punt' : kick === 'field_goal' ? 'field_goal' : 'go';
  // A different unit after the alerted one started out is a reversal (I4.1.1); a kick unit preselects its first call.
  const reversal = s.reversal || (s.alerted !== null && s.alerted !== chosen && backedOut(s));
  const first = kick && focus.boxId ? sheet?.boxes.find((b) => b.id === focus.boxId)?.entries[0] ?? null : null;
  const selected = first ? { unit, boxId: focus.boxId!, entryId: first.id } : null;
  return { state: logged({ ...s, open: { ...open, unit }, step: 'select', focus, reversal, selected, tags: [], personnel: null }, atMs, 'unit', kick ?? unit), commands: [], handled: true };
}

/** The user backed out of the alerted unit since this request opened. */
function backedOut(s: ConsoleState): boolean {
  for (let i = s.log.length - 1; i >= 0; i--) { const w = s.log[i]!.what; if (w === 'unit_back') return true; if (w === 'open') return false; }
  return false;
}

/** I4.1.1: on third down the offense's caller cycles the pre-commit for the coming fourth down. */
function precommitCycle(s: ConsoleState, atMs: number): StepResult {
  const o = s.open;
  if (!o || o.request.type !== 'snapping_call' || o.situation.down !== 3) return { state: { ...s, notice: 'console.precommitThirdOnly' }, commands: [], handled: true };
  const next = PRECOMMITS[(PRECOMMITS.indexOf(s.precommit) + 1) % PRECOMMITS.length]!;
  return { state: logged({ ...s, precommit: next, notice: null }, atMs, 'precommit', next), commands: [], handled: true };
}

/**
 * I2.3.6: while the call is relayed and the play runs, a box letter then an entry key queue that entry for that
 * box. One entry per box, at most `queueMax`. The live key map's digits name the entry, as in the box itself.
 */
function queueKey(s: ConsoleState, action: string | undefined, code: string, atMs: number): StepResult {
  const none: StepResult = { state: s, commands: [], handled: false };
  const unit = s.sent?.unit ?? s.open?.unit;
  if (!unit) return none;
  const sheet = sheetOf(s, unit);
  const keys = s.cfg.keys[unit];
  if (!sheet || !keys) return none;
  if (s.queueBox) {
    const box = sheet.boxes.find((b) => b.id === s.queueBox!.boxId);
    const hit = box?.entries.find((e) => keys.entry[e.id] === code);
    if (hit) {
      const rest = s.queue.filter((q) => !(q.unit === unit && q.boxId === box!.id));
      if (rest.length >= param('queueMax', s.cfg.table)) return { state: { ...s, queueBox: null, notice: 'console.queueFull' }, commands: [], handled: true };
      return { state: logged({ ...s, queue: [...rest, { unit, boxId: box!.id, entryId: hit.id }], queueBox: null, boxPrefix: null, notice: null }, atMs, 'queue', hit.id), commands: [], handled: true };
    }
  }
  if (/^Key[A-Z]$/.test(code) && action === undefined) {
    const codes = [...(s.boxPrefix?.codes ?? []), code];
    const exact = Object.entries(keys.box).find(([, c]) => c.length === codes.length && c.every((x, i) => x === codes[i]));
    if (exact) return { state: { ...s, queueBox: { boxId: exact[0], atMs }, boxPrefix: null }, commands: [], handled: true };
    const prefix = Object.values(keys.box).some((c) => c.length > codes.length && c.slice(0, codes.length).every((x, i) => x === codes[i]));
    if (prefix) return { state: { ...s, boxPrefix: { codes, atMs } }, commands: [], handled: true };
  }
  return none;
}

const CYCLE = <T>(list: readonly T[], cur: T | null): T | null => (list.length === 0 ? null : list[(cur === null ? 0 : list.indexOf(cur) + 1) % list.length]!);

/**
 * One key. `action` is what the live key map resolved the chord to (undefined when nothing is bound);
 * `code` is the physical key, used for box letters and letter entry keys (O2.2.2); `held` is a hold past the
 * guard time (O2.5.3).
 */
export function pressKey(s0: ConsoleState, action: string | undefined, code: string, held: boolean, atMs: number): StepResult {
  let s: ConsoleState = { ...s0, nowMs: atMs };
  const none: StepResult = { state: s, commands: [], handled: false };
  if (!s.open) return none;
  const chordMs = param('chordTimeoutTenths', s.cfg.table) * 100;
  if (s.pendingBox && atMs - s.pendingBox.atMs > chordMs) s = { ...s, pendingBox: null };
  if (s.boxPrefix && atMs - s.boxPrefix.atMs > chordMs) s = { ...s, boxPrefix: null };
  const clock = playClockAt(s, atMs);
  const open = s.open!;

  // Controls live in every step.
  switch (action) {
    case 'call.timeout': {
      if (!open.legal.timeout || s.timeoutThisDeadBall) return { state: { ...s, notice: open.timeoutReason ?? 'console.timeoutNotLegal' }, commands: [], handled: true };
      if (guarded(s, 'timeout', held, atMs)) return { state: { ...s, notice: 'console.holdToConfirm' }, commands: [], handled: true };
      return { state: logged({ ...s, timeoutThisDeadBall: true }, atMs, 'timeout'), commands: [{ type: 'timeout', atPlayClockTenths: clock }], handled: true };
    }
    case 'call.challenge': {
      if (!open.legal.challenge || s.challengeThisDeadBall) return { state: { ...s, notice: open.challengeReason ?? 'console.challengeNotLegal' }, commands: [], handled: true };
      if (guarded(s, 'challenge', held, atMs)) return { state: { ...s, notice: 'console.holdToConfirm' }, commands: [], handled: true };
      return { state: logged({ ...s, challengeThisDeadBall: true }, atMs, 'challenge'), commands: [{ type: 'challenge', atPlayClockTenths: clock }], handled: true };
    }
    case 'booth.list': return { state: s, commands: [{ type: 'booth.list' }], handled: true };
    case 'booth.ask': return { state: logged(s, atMs, 'booth_ask'), commands: [{ type: 'booth.ask' }], handled: true };
    case 'playbook.search': return { state: s, commands: [{ type: 'playbook.search' }], handled: true };
    case 'playback.skip': return { state: s, commands: [{ type: 'playback.skip' }], handled: true };
    case 'playback.replay_once': return { state: s, commands: [{ type: 'playback.replay_once' }], handled: true };
    case 'call.tempo_cycle': return { state: logged({ ...s, tempo: CYCLE(TEMPOS, s.tempo)! }, atMs, 'tempo'), commands: [], handled: true };
    case 'call.relay_cycle': return { state: logged({ ...s, relay: CYCLE(RELAYS, s.relay)! }, atMs, 'relay'), commands: [], handled: true };
    case 'call.cadence_cycle': return s.cfg.cadences.length ? { state: { ...s, cadence: CYCLE(s.cfg.cadences, s.cadence) }, commands: [], handled: true } : none;
    default: break;
  }
  const tab = action ? /^panel\.tab_(\d)$/.exec(action) : null;
  if (tab) return { state: s, commands: [{ type: 'panel.tab', tab: Number(tab[1]) }], handled: true };

  if (s.step === 'prompt') return prompt(s, action, atMs);
  if (s.step === 'fourth') return chooseUnit(s, digitOf(action), atMs);
  if (s.step === 'idle') return none;

  if (s.step === 'sent') {
    // Recall until the latest-call marker, at the time cost of a new call (O2.2.3, I2.1.3).
    if (action === 'call.clear' && s.sent && !s.sent.committed) return { state: logged({ ...s, step: 'select', sent: null }, atMs, 'recall'), commands: [], handled: true };
    if (action === 'call.clear') return { state: logged({ ...s, queue: [], queueBox: null }, atMs, 'queue_clear'), commands: [], handled: true };
    if (action === 'call.precommit_cycle') return precommitCycle(s, atMs);
    return queueKey(s, action, code, atMs);
  }

  // Step 'select'.
  const unit = open.unit;
  const sheet = sheetOf(s, unit);
  const keys = s.cfg.keys[unit];
  if (!sheet || !keys) return none;
  const d = digitOf(action);

  if (s.armed === 'personnel' && d !== null) {
    const digits = s.personnelDigits + String(d);
    if (digits.length < 2) return { state: { ...s, personnelDigits: digits }, commands: [], handled: true };
    return { state: logged({ ...s, personnel: digits, personnelDigits: '', armed: null }, atMs, 'personnel', digits), commands: [], handled: true };
  }
  if (s.armed && s.armed !== 'personnel' && d !== null) return { state: toggleTag(s, s.armed, (d === 0 ? 10 : d) - 1), commands: [], handled: true };

  if (action === 'call.precommit_cycle') return precommitCycle(s, atMs);
  // I4.1.1: back out of the alerted unit to the fourth-down choice; a different unit then costs the reversal.
  if (action === 'call.clear' && open.kind === 'fourth_down' && s.alerted !== null && !s.reversal) {
    return { state: logged({ ...s, step: 'fourth', selected: null, focus: NO_FOCUS }, atMs, 'unit_back'), commands: [], handled: true };
  }
  switch (action) {
    case 'call.personnel': return { state: { ...s, armed: 'personnel', personnelDigits: '' }, commands: [], handled: true };
    case 'call.flip': return { state: toggleTag(s, 'flip', 0), commands: [], handled: true };
    case 'call.motion_tag': return { state: { ...s, armed: 'motion' }, commands: [], handled: true };
    case 'call.protection_tag': return { state: { ...s, armed: 'protection' }, commands: [], handled: true };
    case 'call.route_tag': return { state: { ...s, armed: 'route' }, commands: [], handled: true };
    case 'call.confirm': return send(s, atMs);
    case 'call.clear': return { state: { ...s, selected: null, tags: [], preTags: [], personnel: null, armed: null, notice: null }, commands: [], handled: true };
    case 'call.take_suggestion': {
      const id = open.suggestion;
      const box = id ? sheet.boxes.find((b) => b.entries.some((e) => e.id === id)) : undefined;
      return box && id ? selectEntry(s, box.id, id, atMs) : { state: { ...s, notice: 'console.noSuggestion' }, commands: [], handled: true };
    }
    default: break;
  }

  // Entry keys: in the box just named by its letter, else in the focused box (O2.2.2).
  const inBox = s.pendingBox?.boxId ?? s.focus.boxId;
  if (inBox) {
    const box = sheet.boxes.find((b) => b.id === inBox);
    const hit = box?.entries.find((e) => keys.entry[e.id] === code && (code.startsWith('Digit') || s.pendingBox !== null));
    if (hit) return selectEntry(s, inBox, hit.id, atMs);
  }
  // Box letters (one or two codes).
  if (/^Key[A-Z]$/.test(code) && action === undefined) {
    const codes = [...(s.boxPrefix?.codes ?? []), code];
    const exact = Object.entries(keys.box).find(([, c]) => c.length === codes.length && c.every((x, i) => x === codes[i]));
    if (exact) return { state: logged({ ...s, pendingBox: { boxId: exact[0], atMs }, boxPrefix: null, focus: { boxId: exact[0], how: 'rule', empty: (sheet.boxes.find((b) => b.id === exact[0])?.entries.length ?? 0) === 0 } }, atMs, 'box', exact[0]), commands: [], handled: true };
    const prefix = Object.values(keys.box).some((c) => c.length > codes.length && c.slice(0, codes.length).every((x, i) => x === codes[i]));
    if (prefix) return { state: { ...s, boxPrefix: { codes, atMs } }, commands: [], handled: true };
  }
  return none;
}
