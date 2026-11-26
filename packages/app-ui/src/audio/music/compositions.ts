// Menu music scores (PV-11, MB-11). Four short original loops in a 1970s and 1980s pro football
// style: brass, timpani and marching snare for the title, a TV-sports funk vamp for the week hub,
// strings and horn for the career screens, bright brass for the offseason. Original melodies and
// progressions written for this game; no quotation of, or imitation of, any specific piece or
// composer (plan section 2.1).
//
// These are the source of truth. `scripts/music/compose.ts` writes them to MusicXML and MuseScore
// Studio renders the audio files the game plays (Marlon 2026-11-26: "use muse studio for the music").
//
// Note grammar, one bar per `|`-separated chunk, 4/4 time, sixteenth = 1 unit, 16 units a bar:
//   `Bb4:q.`  pitch (letter, optional b or #, octave) : length (w h q e s, optional dot)
//   `r:h`     rest      `x:e` hit on an unpitched part      `D4+F4+A4:q` chord

export type MusicTrackId = 'title' | 'weekHub' | 'career' | 'offseason';

export interface PartScore {
  name: string;
  /** MusicXML instrument-sound id (MuseScore maps it to a sound). */
  sound: string;
  /** General MIDI program 1-128, or for unpitched parts the GM drum key + 1. */
  midiProgram?: number;
  midiUnpitched?: number;
  clef: 'G' | 'F' | 'percussion';
  /** Velocity 1-127 used by the renderer (MusicXML `dynamics` attribute). */
  velocity: number;
  bars: string[];
}

export interface Composition {
  id: MusicTrackId;
  title: string;
  /** Quarter notes per minute. */
  bpm: number;
  /** Key signature as fifths (negative = flats). */
  fifths: number;
  parts: PartScore[];
}

export const BEATS_PER_BAR = 4;
export const UNITS_PER_BEAT = 4;

// ---- helpers for repeated patterns ----

const NOTE_ORDER = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** MIDI number of a pitch like `Bb4` (C4 = 60). */
export function midiOf(pitch: string): number {
  const m = /^([A-G])([b#]?)(-?\d)$/.exec(pitch);
  if (!m) throw new Error(`bad pitch ${pitch}`);
  const alter = m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0;
  return (Number(m[3]) + 1) * 12 + LETTER_SEMITONE[m[1]!]! + alter;
}

/** Pitch name for a MIDI number, flats except F# and C#. */
export function pitchOf(midi: number): string {
  return `${NOTE_ORDER[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

const up = (p: string, semis: number): string => pitchOf(midiOf(p) + semis);
const bars = (s: string): string[] => s.split('|').map((b) => b.trim());

/** Funk bass bar: root, octave pop, fifth and seventh walk-up. */
const funkBass = (root: string): string =>
  `${root}:e r:e ${up(root, 12)}:e ${root}:e r:e ${up(root, 7)}:e ${up(root, 10)}:e ${up(root, 12)}:e`;

/** Root-fifth bass in quarters. */
const twoFeel = (root: string): string => `${root}:q ${up(root, 7)}:q ${root}:q ${up(root, 7)}:q`;

/** Broken-chord piano bar in eighths. */
const arp = (root: string, third: number): string =>
  `${root}:e ${up(root, 7)}:e ${up(root, 12)}:e ${up(root, 12 + third)}:e ${up(root, 12)}:e ${up(root, 7)}:e ${root}:e ${up(root, 7)}:e`;

// ---- the four loops ----

const TITLE: Composition = {
  id: 'title',
  title: 'Kickoff Fanfare',
  bpm: 116,
  fifths: -2,
  parts: [
    { name: 'Trumpets', sound: 'brass.trumpet', midiProgram: 57, clef: 'G', velocity: 100, bars: bars(
      'Bb4:q. F4:e Bb4:q D5:q | Eb5:h. D5:e C5:e | D5:q. Bb4:e G4:q Bb4:q | C5:w | ' +
      'Bb4:q. F4:e Bb4:q D5:q | G5:h. F5:e Eb5:e | Eb5:q. D5:e C5:q Eb5:q | D5:h C5:h') },
    { name: 'Horns', sound: 'brass.french-horn', midiProgram: 61, clef: 'G', velocity: 88, bars: bars(
      'D4:w | G4:w | G4:w | A4:w | F4:w | G4:w | G4:w | A4:h F4:h') },
    { name: 'Trombones', sound: 'brass.trombone', midiProgram: 58, clef: 'F', velocity: 88, bars: bars(
      'F3:w | Bb3:w | Bb3:w | A3:w | F3:w | Bb3:w | C4:h A3:h | A3:h C4:h') },
    { name: 'Tuba', sound: 'brass.tuba', midiProgram: 59, clef: 'F', velocity: 90, bars: bars(
      'Bb1:h F2:h | Eb2:h Bb1:h | G2:h D2:h | F2:h C2:h | Bb1:h F2:h | Eb2:h Bb1:h | C2:h F2:h | F2:h C2:h') },
    { name: 'Timpani', sound: 'drum.timpani', midiProgram: 48, clef: 'F', velocity: 96, bars: bars(
      'Bb2:q r:q F2:q r:q | r:w | r:w | F2:q r:q F2:q F2:q | Bb2:q r:q F2:q r:q | r:w | r:h F2:q r:q | F2:e F2:e F2:q F2:h') },
    { name: 'Snare Drum', sound: 'drum.snare-drum', midiUnpitched: 39, clef: 'percussion', velocity: 84, bars: Array(8).fill(
      'x:e x:s x:s x:e x:e x:e x:s x:s x:e x:e') },
  ],
};

const WEEK_HUB: Composition = {
  id: 'weekHub',
  title: 'Monday Meeting',
  bpm: 100,
  fifths: -1,
  parts: [
    { name: 'Electric Piano', sound: 'keyboard.piano.electric', midiProgram: 5, clef: 'G', velocity: 80, bars: [
      'F4+A4+C5+E5', 'F4+B4+E5', 'F4+A4+C5+E5', 'F4+B4+E5', 'D4+F4+A4', 'C4+E4+G4', 'Bb3+D4+F4', 'C#4+G4+B4',
    ].map((c) => `r:e ${c}:e r:q r:e ${c}:e ${c}:q`) },
    { name: 'Electric Bass', sound: 'pluck.bass.electric', midiProgram: 34, clef: 'F', velocity: 96, bars: [
      funkBass('D2'), funkBass('G2'), funkBass('D2'), funkBass('G2'),
      funkBass('Bb1'), funkBass('A1'), funkBass('G1'), funkBass('A1'),
    ] },
    { name: 'Trumpets', sound: 'brass.trumpet', midiProgram: 57, clef: 'G', velocity: 92, bars: bars(
      'r:w | r:h r:e B4:e D5:e F5:e | r:w | r:h r:e B4:e D5:e F5:e | r:w | r:h r:e C5:e E5:e G5:e | r:w | r:h C#5:e E5:e G5:q') },
    { name: 'Kick Drum', sound: 'drum.bass-drum', midiUnpitched: 37, clef: 'percussion', velocity: 100, bars: Array(8).fill(
      'x:q r:e x:e r:q x:q') },
    { name: 'Snare Drum', sound: 'drum.snare-drum', midiUnpitched: 39, clef: 'percussion', velocity: 90, bars: Array(8).fill(
      'r:q x:q r:q x:q') },
    { name: 'Hi-hat', sound: 'metal.hi-hat', midiUnpitched: 43, clef: 'percussion', velocity: 70, bars: Array(8).fill(
      'x:e x:e x:e x:e x:e x:e x:e x:e') },
  ],
};

const CAREER: Composition = {
  id: 'career',
  title: 'The Long Road',
  bpm: 76,
  fifths: -1,
  parts: [
    { name: 'Horn', sound: 'brass.french-horn', midiProgram: 61, clef: 'G', velocity: 84, bars: bars(
      'A4:h. G4:e F4:e | G4:q. E4:e G4:h | F4:h. A4:q | Bb4:h D5:h | C5:h. A4:q | Bb4:q A4:q G4:h | F4:q G4:q A4:q Bb4:q | G4:w') },
    { name: 'Strings', sound: 'strings.group', midiProgram: 49, clef: 'F', velocity: 72, bars: bars(
      'F3+C4+F4:w | E3+G3+C4:w | D3+F3+A3:w | Bb2+F3+D4:w | A2+F3+C4:w | G2+D3+Bb3:w | Bb2+F3+D4:w | C3+G3+E4:w') },
    { name: 'Piano', sound: 'keyboard.piano', midiProgram: 1, clef: 'F', velocity: 64, bars: [
      arp('F2', 4), arp('C3', 4), arp('D3', 3), arp('Bb2', 4), arp('F2', 4), arp('G2', 3), arp('Bb2', 4), arp('C3', 4),
    ] },
  ],
};

const OFFSEASON: Composition = {
  id: 'offseason',
  title: 'Two-a-Days',
  bpm: 108,
  fifths: 1,
  parts: [
    { name: 'Trumpets', sound: 'brass.trumpet', midiProgram: 57, clef: 'G', velocity: 96, bars: bars(
      'D5:e D5:e B4:e D5:e G5:q D5:q | E5:q. B4:e E5:q G5:q | E5:e E5:e C5:e E5:e G5:q E5:q | F#5:h. D5:q | ' +
      'D5:e D5:e B4:e D5:e G5:q D5:q | F#5:q. D5:e B4:q D5:q | E5:q G5:q F#5:q A5:q | F#5:h A4:h') },
    { name: 'Trombones', sound: 'brass.trombone', midiProgram: 58, clef: 'F', velocity: 84, bars: bars(
      'B3:h D4:h | B3:h G3:h | C4:h E4:h | D4:h A3:h | B3:h D4:h | B3:h F#3:h | G3:h A3:h | A3:h F#3:h') },
    { name: 'Electric Bass', sound: 'pluck.bass.electric', midiProgram: 34, clef: 'F', velocity: 92, bars: [
      twoFeel('G2'), twoFeel('E2'), twoFeel('C2'), twoFeel('D2'), twoFeel('G2'), twoFeel('B1'), twoFeel('C2'), twoFeel('D2'),
    ] },
    { name: 'Kick Drum', sound: 'drum.bass-drum', midiUnpitched: 37, clef: 'percussion', velocity: 96, bars: Array(8).fill(
      'x:q r:q x:q r:q') },
    { name: 'Snare Drum', sound: 'drum.snare-drum', midiUnpitched: 39, clef: 'percussion', velocity: 88, bars: Array(8).fill(
      'r:q x:q r:e x:e x:q') },
  ],
};

export const COMPOSITIONS: readonly Composition[] = [TITLE, WEEK_HUB, CAREER, OFFSEASON];

// ---- parsing ----

export interface ParsedNote {
  /** Empty for a rest; one entry per chord note; `['x']` for an unpitched hit. */
  pitches: string[];
  units: number;
  type: 'whole' | 'half' | 'quarter' | 'eighth' | '16th';
  dotted: boolean;
}

const LENGTHS: Record<string, { units: number; type: ParsedNote['type'] }> = {
  w: { units: 16, type: 'whole' }, h: { units: 8, type: 'half' }, q: { units: 4, type: 'quarter' },
  e: { units: 2, type: 'eighth' }, s: { units: 1, type: '16th' },
};

export function parseBar(bar: string): ParsedNote[] {
  return bar.split(/\s+/).filter(Boolean).map((tok) => {
    const [head, len] = tok.split(':');
    const m = /^([whqes])(\.?)$/.exec(len ?? '');
    if (!head || !m) throw new Error(`bad note ${tok}`);
    const base = LENGTHS[m[1]!]!;
    const dotted = m[2] === '.';
    const units = dotted ? base.units * 1.5 : base.units;
    if (!Number.isInteger(units)) throw new Error(`length too short to dot: ${tok}`);
    const pitches = head === 'r' ? [] : head === 'x' ? ['x'] : head.split('+');
    for (const p of pitches) if (p !== 'x') midiOf(p);
    return { pitches, units, type: base.type, dotted };
  });
}

/** Problems with a composition (wrong bar lengths, part bar counts that differ). Empty when fine. */
export function checkComposition(c: Composition): string[] {
  const out: string[] = [];
  const n = c.parts[0]?.bars.length ?? 0;
  for (const p of c.parts) {
    if (p.bars.length !== n) out.push(`${c.id}/${p.name}: ${p.bars.length} bars, expected ${n}`);
    p.bars.forEach((b, i) => {
      const units = parseBar(b).reduce((s, x) => s + x.units, 0);
      if (units !== BEATS_PER_BAR * UNITS_PER_BEAT) out.push(`${c.id}/${p.name} bar ${i + 1}: ${units} units, expected 16`);
    });
    if ((p.midiProgram === undefined) === (p.midiUnpitched === undefined)) out.push(`${c.id}/${p.name}: needs exactly one of midiProgram or midiUnpitched`);
  }
  return out;
}

export const barCount = (c: Composition): number => c.parts[0]?.bars.length ?? 0;

/** Exact loop length in seconds: the player loops here, so the render's reverb tail is cut. */
export const loopSeconds = (c: Composition): number => (barCount(c) * BEATS_PER_BAR * 60) / c.bpm;
