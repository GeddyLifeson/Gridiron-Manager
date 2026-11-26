// Accessibility (G-98: O5.5.1, O5.5.2). The checks the O5.5 acceptance criteria name, and the
// behaviour flags the screens read. No option here pauses or slows game time (Marlon, 2026-11-25:
// the play clock always runs in games); timing aids change how input is read, never the clock.
import { settings } from '@gm/app-services';
import { COLOUR_VISION_IDS, THEME_IDS, checkContrast, type ContrastFailure } from '../../tokens/tokens.ts';
import CUES from './cues.json' with { type: 'json' };

type Values = Record<string, settings.SettingValue>;

// ---- Vision (O5.5.1) ----

/** The O5.5.1 automated contrast check: every token pair in every theme and colour-vision palette. */
export function contrastAudit(): { combos: number; failures: ContrastFailure[] } {
  return { combos: THEME_IDS.length * COLOUR_VISION_IDS.length, failures: checkContrast() };
}

// ---- Sound and its visual twin (O5.5.2) ----

export interface AudioCue { id: string; sound: string; visual: string; switch: string; pendingSwitch?: string; bible: string[] }
export const AUDIO_CUES: readonly AudioCue[] = (CUES as { cues: AudioCue[] }).cues;

/** Problems in the cue table: a sound with no visual twin, or a switch the settings schema lacks. */
export function cueTableProblems(cues: readonly AudioCue[] = AUDIO_CUES): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const c of cues) {
    if (ids.has(c.id)) out.push(`${c.id}: listed twice`);
    ids.add(c.id);
    if (!c.visual.trim()) out.push(`${c.id}: no visual cue`);
    if (!settings.SETTINGS_BY_KEY.has(c.switch)) out.push(`${c.id}: switch ${c.switch} is not a setting`);
  }
  return out;
}

// ---- Motion (O5.5.2) ----

export interface MotionFlags {
  /** Stills in place of playback (FieldView `reducedMotion`). */
  stills: boolean;
  /** Eased camera moves. Off under reduced motion. */
  easedCamera: boolean;
  boldMarkers: boolean;
  thickFieldLines: boolean;
  /** Focus ring width in CSS pixels. */
  focusRingPx: number;
}

/** Focus ring widths in CSS pixels (Assumption, design choice; no bible value). */
export const FOCUS_RING_PX = { standard: 2, large: 3, larger: 4 } as const;

export function motionFlags(v: Values): MotionFlags {
  const reduced = v['accessibility.reducedMotion'] === true;
  return {
    stills: reduced,
    easedCamera: !reduced,
    boldMarkers: v['accessibility.boldMarkers'] === true,
    thickFieldLines: v['accessibility.thickFieldLines'] === true,
    focusRingPx: FOCUS_RING_PX[(v['accessibility.focusHighlight'] ?? 'standard') as keyof typeof FOCUS_RING_PX] ?? FOCUS_RING_PX.standard,
  };
}

// ---- Timing aids (O5.5.2) ----

/** The console's chord timeout is 1.5 s (O2.2.2; G-60 param console.chordTimeoutTenths). Long and longer are Assumption multiples. */
export const CHORD_TIMEOUT_BASE_MS = 1500;
export const CHORD_TIMEOUT_FACTOR = { standard: 1, long: 2, longer: 3 } as const;
/** Hold-to-confirm length: standard is the O2.5.3 hold (G-60 param console.guardHoldTenths = 4); long doubles it (Assumption). */
export const HOLD_TO_CONFIRM_MS = { off: 0, standard: 400, long: 800 } as const;
/** Single-switch scan step (Assumption: one item per second, a common default of switch-access tools). */
export const SCAN_STEP_MS = 1000;

export interface InputAids {
  chordTimeoutMs: number;
  holdToConfirmMs: number;
  stickyModifiers: boolean;
  switchScanning: boolean;
  scanStepMs: number;
}

export function inputAids(v: Values): InputAids {
  const chord = (v['accessibility.chordTimeout'] ?? 'standard') as keyof typeof CHORD_TIMEOUT_FACTOR;
  const hold = (v['accessibility.holdToConfirm'] ?? 'off') as keyof typeof HOLD_TO_CONFIRM_MS;
  return {
    chordTimeoutMs: CHORD_TIMEOUT_BASE_MS * (CHORD_TIMEOUT_FACTOR[chord] ?? 1),
    holdToConfirmMs: HOLD_TO_CONFIRM_MS[hold] ?? 0,
    stickyModifiers: v['accessibility.stickyModifiers'] === true,
    switchScanning: v['accessibility.switchScanning'] === true,
    scanStepMs: SCAN_STEP_MS,
  };
}

/** Names that would mean an option touches game time. No flag object may carry one (O5.5.2 rule). */
export const CLOCK_KEYS = ['pause', 'paused', 'gameSpeed', 'clockScale', 'playClock', 'gameClock', 'timeScale', 'slowMotion'] as const;

// ---- Sticky modifiers (O5.5.2) ----

export type Modifier = 'Ctrl' | 'Alt' | 'Shift' | 'Meta';
export interface StickyState { latched: Modifier[] }
export interface KeyPress { code: string; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean }

const MOD_CODES: Record<string, Modifier> = {
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: 'Meta', MetaRight: 'Meta',
};

/**
 * One modifier press latches it; pressing it again releases it. The next ordinary key carries every
 * latched modifier and clears the latch. Returns the key event to pass on, or null while latching.
 */
export function stickyStep(s: StickyState, e: KeyPress): { state: StickyState; emit: KeyPress | null } {
  const mod = MOD_CODES[e.code];
  if (mod) {
    const latched = s.latched.includes(mod) ? s.latched.filter((m) => m !== mod) : [...s.latched, mod];
    return { state: { latched }, emit: null };
  }
  const has = (m: Modifier) => s.latched.includes(m);
  return {
    state: { latched: [] },
    emit: { code: e.code, ctrlKey: !!e.ctrlKey || has('Ctrl'), altKey: !!e.altKey || has('Alt'), shiftKey: !!e.shiftKey || has('Shift'), metaKey: !!e.metaKey || has('Meta') },
  };
}

// ---- Single-switch scanning (O5.5.2) ----

export interface ScanState { level: 'box' | 'entry'; box: number; entry: number }
export type ScanInput = 'step' | 'press';
export type ScanOutput = { kind: 'none' } | { kind: 'select'; box: number; entry: number };

/**
 * Scanning over the call sheet: the highlight steps through boxes on each `step` (the caller sends one
 * every scanStepMs of wall time); a press enters the box, steps then move through its entries, and a
 * second press selects. Scanning reads input only: it never holds or slows the play clock.
 */
export function scanStep(s: ScanState, input: ScanInput, boxSizes: readonly number[]): { state: ScanState; out: ScanOutput } {
  if (boxSizes.length === 0) return { state: s, out: { kind: 'none' } };
  if (input === 'step') {
    if (s.level === 'box') return { state: { ...s, box: (s.box + 1) % boxSizes.length }, out: { kind: 'none' } };
    // Entries 0..n-1, then one extra stop (n) that backs out to the box level when pressed.
    const n = boxSizes[s.box] ?? 0;
    return { state: { ...s, entry: (s.entry + 1) % (n + 1) }, out: { kind: 'none' } };
  }
  if (s.level === 'box') return { state: { level: 'entry', box: s.box, entry: 0 }, out: { kind: 'none' } };
  const n = boxSizes[s.box] ?? 0;
  if (s.entry >= n) return { state: { level: 'box', box: s.box, entry: 0 }, out: { kind: 'none' } };
  return { state: { level: 'box', box: s.box, entry: 0 }, out: { kind: 'select', box: s.box, entry: s.entry } };
}

// ---- Labels (O5.5.2 acceptance 1) ----

export interface UnlabelledControl { tag: string; snippet: string }

/**
 * Finds interactive controls in rendered markup that have no accessible name: no aria-label, no
 * aria-labelledby, no wrapping or `for` label, and (for buttons) no text. Works on server-rendered
 * HTML so every screen's test can run it.
 */
export function findUnlabelledControls(html: string): UnlabelledControl[] {
  const out: UnlabelledControl[] = [];
  const labelFor = new Set([...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]!));
  // Controls wrapped by a <label>…</label> are named by it.
  const wrapped = new Set<number>();
  for (const m of html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)) {
    const start = m.index! + m[0].indexOf('>') + 1;
    for (const c of m[1]!.matchAll(/<(input|select|textarea)\b/g)) wrapped.add(start + c.index!);
  }
  for (const m of html.matchAll(/<(button|input|select|textarea)\b([^>]*)>/g)) {
    const [whole, tag, attrs] = m as unknown as [string, string, string];
    if (/\btype="hidden"/.test(attrs)) continue;
    if (/\baria-label="[^"]+"/.test(attrs) || /\baria-labelledby="[^"]+"/.test(attrs)) continue;
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    if (id && labelFor.has(id)) continue;
    if (wrapped.has(m.index!)) continue;
    if (tag === 'button') {
      const end = html.indexOf('</button>', m.index!);
      const inner = html.slice(m.index! + whole.length, end).replace(/<[^>]+>/g, '').trim();
      if (inner) continue;
    }
    out.push({ tag, snippet: whole.slice(0, 80) });
  }
  return out;
}
