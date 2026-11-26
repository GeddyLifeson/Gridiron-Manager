// PV-13 icon set (presentation-build-plan.md 3.6 and 2.1; O6.2, O2.5.2, O2.5.3, MB-13, MB-15).
// Flat, thick-line, two-colour drawings in the 1970s and 1980s print and TV-graphics style. Every
// glyph is code: a few SVG primitives on a 24-unit grid, coloured only by token roles, so the set
// rebuilds from source and needs no licence row (plan section 5 covers asset files, not code).
//
// Roles (the two colours plus the page):
//   line   ink stroke, no fill            solid  ink fill, no stroke
//   shape  tone fill with an ink outline  tone   tone fill, no stroke
//   paper  page-colour fill (knock-out)   paperLine  page-colour stroke (knock-out line)
// `ink` is text.ink unless a glyph names another token; `tone` is the glyph's second colour.
// Every glyph carries a text label and the football information it gives (plan ground rule 2).

export type GlyphRole = 'line' | 'solid' | 'shape' | 'tone' | 'paper' | 'paperLine';

export type GlyphPart =
  | { role: GlyphRole; el: 'path'; d: string; w?: number; dash?: string }
  | { role: GlyphRole; el: 'circle'; cx: number; cy: number; r: number; w?: number }
  | { role: GlyphRole; el: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot?: number; w?: number }
  | { role: GlyphRole; el: 'rect'; x: number; y: number; width: number; height: number; rx?: number; w?: number };

export interface Glyph {
  id: string;
  /** Visible text label, always drawn with the icon or given as its accessible name. */
  label: string;
  /** The information the icon carries (plan ground rule 2). */
  carries: string;
  /** Token path of the second colour. */
  tone: string;
  /** Token path of the line colour; text.ink when absent. */
  ink?: string;
  parts: GlyphPart[];
}

/** Grid and line weight of the set: a 24-unit square, thick 2.5-unit lines (about 1/10 of the box). */
export const ICON_GRID = 24;
export const ICON_STROKE = 2.5;

const p = (role: GlyphRole, d: string, extra: { w?: number; dash?: string } = {}): GlyphPart => ({ role, el: 'path', d, ...extra });
const c = (role: GlyphRole, cx: number, cy: number, r: number, w?: number): GlyphPart => ({ role, el: 'circle', cx, cy, r, ...(w ? { w } : {}) });
const r = (role: GlyphRole, x: number, y: number, width: number, height: number, rx?: number): GlyphPart => ({ role, el: 'rect', x, y, width, height, ...(rx ? { rx } : {}) });

const CLOUD = 'M7 15.5a4 4 0 0 1 0-8h.3A5.5 5.5 0 0 1 17.8 9a3.25 3.25 0 0 1-.3 6.5z';
const THERMO = 'M9.5 14.6V5.5a2.5 2.5 0 0 1 5 0v9.1a4 4 0 1 1-5 0z';

export const GLYPHS: readonly Glyph[] = [
  // Game state and officiating
  { id: 'timeout', label: 'Timeout', carries: 'A timeout is called or available; paired with the count left', tone: 'state.caution',
    parts: [p('shape', 'M3 4h18v5h-6.5v11h-5V9H3z')] },
  { id: 'challenge', label: 'Challenge flag', carries: 'A coach challenge: thrown, available or spent', tone: 'state.bad',
    parts: [p('shape', 'M6 4h13l-3.5 4.5L19 13H6z'), p('line', 'M6 3v18')] },
  { id: 'penalty', label: 'Penalty flag', carries: 'A foul was called and where', tone: 'state.caution',
    parts: [p('shape', 'M6 8.5c3-2.5 5 1.5 8-1s4.5-2.5 6-1.5l-1 9.5c-1.5-1-3.5-1-6 1.5s-5-1-7 1.5z'), c('solid', 5.5, 8.5, 2.5)] },
  { id: 'whistle', label: 'Whistle', carries: 'The ball is dead; the play is over', tone: 'accent.default',
    parts: [r('shape', 9, 7.5, 12, 5), c('shape', 9, 14, 5.5), c('paper', 9, 14, 1.8)] },
  // Injury: a plus inside a ring, in the ink colour only. Never red, never a cross on a white
  // ground: the red cross on white is a protected emblem (Geneva Convention I arts. 38, 53;
  // 18 U.S.C. 706; British Red Cross "the emblem"). The emblem test in icons.test.ts enforces it.
  { id: 'injury', label: 'Injury', carries: 'A player is hurt or on the injury report', tone: 'text.ink',
    parts: [c('line', 12, 12, 9), p('line', 'M12 7.5v9M7.5 12h9')] },
  { id: 'review', label: 'Replay review', carries: 'A play is under review', tone: 'accent.default',
    parts: [r('shape', 3, 4, 18, 12, 1), p('paper', 'M10 7.2v5.6l4.8-2.8z'), p('line', 'M12 16v4M8 20.5h8')] },
  { id: 'possession', label: 'Possession', carries: 'Which team has the ball', tone: 'text.ink',
    parts: [p('solid', 'M4 20C4 11 11 4 20 4c0 9-7 16-16 16z'), p('paperLine', 'M9 15l6-6M9.8 11.6l2.6 2.6M11.6 9.8l2.6 2.6', { w: 1.6 })] },
  { id: 'game-clock', label: 'Game clock', carries: 'Time left in the quarter', tone: 'state.neutral',
    parts: [c('line', 12, 12, 9), p('line', 'M12 7v5l3.5 2')] },
  { id: 'play-clock', label: 'Play clock', carries: 'Time left to snap the ball', tone: 'state.caution',
    parts: [c('shape', 12, 13.5, 7.5), p('line', 'M10 2.5h4M12 2.5v3.5'), p('paperLine', 'M12 13.5l3-3')] },
  { id: 'scoreboard', label: 'Scoreboard', carries: 'The score and game situation', tone: 'state.neutral',
    parts: [r('shape', 3, 5, 18, 13, 1), c('paper', 7, 9.5, 1.3), c('paper', 11, 9.5, 1.3), c('paper', 15, 9.5, 1.3), c('paper', 7, 13.5, 1.3), c('paper', 11, 13.5, 1.3), c('paper', 15, 13.5, 1.3), p('line', 'M8 21h8')] },
  { id: 'substitution', label: 'Substitution', carries: 'Players going in and out', tone: 'text.ink',
    parts: [p('line', 'M4 8h15M15.5 4.5L19 8l-3.5 3.5M20 16H5M8.5 12.5L5 16l3.5 3.5')] },
  // Kicking
  { id: 'kickoff', label: 'Kickoff', carries: 'A kickoff or free kick', tone: 'state.caution',
    parts: [{ role: 'solid', el: 'ellipse', cx: 12, cy: 9, rx: 3.5, ry: 6 }, p('shape', 'M8.5 21l2-5.5h3l2 5.5z')] },
  { id: 'field-goal', label: 'Field goal', carries: 'A field goal or extra-point try', tone: 'text.ink',
    parts: [p('line', 'M6 3v9h12V3M12 12v9')] },
  { id: 'punt', label: 'Punt', carries: 'A punt', tone: 'text.ink',
    parts: [p('line', 'M3 20C6 9 14 6 19 9', { dash: '3 3' }), { role: 'solid', el: 'ellipse', cx: 19, cy: 12, rx: 2.5, ry: 4, rot: 30 }] },
  // Weather and conditions (J12)
  { id: 'wind', label: 'Wind', carries: 'Wind speed and direction for kicks and deep balls', tone: 'text.ink',
    parts: [p('line', 'M3 9h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 17h6')] },
  { id: 'clear', label: 'Clear', carries: 'Clear weather', tone: 'state.caution',
    parts: [c('shape', 12, 12, 4.5), p('line', 'M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8')] },
  { id: 'overcast', label: 'Overcast', carries: 'Cloud cover, no rain', tone: 'state.neutral',
    parts: [p('shape', CLOUD), p('line', 'M5 19.5h14')] },
  { id: 'rain', label: 'Rain', carries: 'Rain: wet ball and footing', tone: 'overlay.assignment',
    parts: [p('shape', CLOUD), p('line', 'M8 18.5l-1 3M12 18.5l-1 3M16 18.5l-1 3')] },
  { id: 'snow', label: 'Snow', carries: 'Snow: footing and visibility', tone: 'state.neutral',
    parts: [p('shape', CLOUD), c('solid', 8, 19.5, 1.4), c('solid', 12, 21, 1.4), c('solid', 16, 19.5, 1.4)] },
  { id: 'fog', label: 'Fog', carries: 'Fog: deep-ball and kick visibility', tone: 'text.ink',
    parts: [p('line', 'M3 7h13M7 12h14M3 17h13')] },
  { id: 'heat', label: 'Heat', carries: 'Hot conditions: fatigue rises faster', tone: 'state.bad',
    parts: [p('shape', THERMO), p('paperLine', 'M12 6v10'), p('line', 'M17 5h3M17 9h3')] },
  { id: 'cold', label: 'Cold', carries: 'Cold conditions: ball and hands', tone: 'overlay.assignment',
    parts: [p('line', THERMO), c('tone', 12, 17.6, 2.2), p('line', 'M17 5h3M17 9h3')] },
  { id: 'indoor', label: 'Indoor', carries: 'Game under a roof: no weather', tone: 'state.neutral',
    parts: [p('shape', 'M3 18a9 9 0 0 1 18 0z'), p('paperLine', 'M12 9.5V18M7.5 11.5L9 18M16.5 11.5L15 18', { w: 1.6 }), p('line', 'M2 18h20')] },
  { id: 'noise', label: 'Crowd noise', carries: 'Crowd noise level: silent count and relays', tone: 'state.neutral',
    parts: [p('shape', 'M3 9.5h4l5-4.5v14l-5-4.5H3z'), p('line', 'M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11')] },
  // Calls and interface states (O2.5.2, O2.5.3, MB-15)
  { id: 'confirm', label: 'Call sent', carries: 'The call went in', tone: 'state.good',
    parts: [c('shape', 12, 12, 9), p('paperLine', 'M7.5 12.5l3 3 6-6.5')] },
  { id: 'warning', label: 'Warning', carries: 'Something needs attention before the snap', tone: 'state.caution',
    parts: [p('shape', 'M12 3l10 17.5H2z'), p('paperLine', 'M12 9.5v5'), c('paper', 12, 17.4, 1.3)] },
  { id: 'not-allowed', label: 'Not allowed', carries: 'An illegal or unaffordable choice; shown with its reason', tone: 'state.bad',
    parts: [p('shape', 'M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z'), p('paperLine', 'M8.5 8.5l7 7M15.5 8.5l-7 7')] },
  { id: 'unavailable', label: 'Unavailable', carries: 'Not available now; the reason is shown beside it', tone: 'text.ink',
    parts: [c('line', 12, 12, 9), p('line', 'M5.6 18.4L18.4 5.6')] },
  { id: 'info', label: 'Information', carries: 'More detail is available', tone: 'overlay.assignment',
    parts: [c('shape', 12, 12, 9), p('paperLine', 'M12 11v6'), c('paper', 12, 7.6, 1.4)] },
  { id: 'lock', label: 'Locked', carries: 'Locked: cannot change now', tone: 'state.neutral',
    parts: [p('line', 'M8 10.5V7.5a4 4 0 0 1 8 0v3'), r('shape', 5, 10.5, 14, 10, 1.5), c('paper', 12, 15.5, 1.6)] },
  { id: 'unlock', label: 'Unlocked', carries: 'Open to change', tone: 'state.neutral',
    parts: [p('line', 'M8 10.5V7.5a4 4 0 0 1 7.7-1.5'), r('shape', 5, 10.5, 14, 10, 1.5), c('paper', 12, 15.5, 1.6)] },
  // Staff work and the week
  { id: 'headset', label: 'Headset', carries: 'Coach-to-player radio and booth talk', tone: 'overlay.assignment',
    parts: [p('line', 'M5 13a7 7 0 0 1 14 0M5 18c0 2 2 3 5 3h2'), r('shape', 3, 12, 4, 6, 1), r('shape', 17, 12, 4, 6, 1)] },
  { id: 'film', label: 'Film', carries: 'Game film and cut-ups', tone: 'state.neutral',
    parts: [c('shape', 12, 12, 9), c('paper', 12, 6.8, 2), c('paper', 16.9, 10.4, 2), c('paper', 15, 16.2, 2), c('paper', 9, 16.2, 2), c('paper', 7.1, 10.4, 2), c('solid', 12, 12, 1.2)] },
  { id: 'notebook', label: 'Notebook', carries: 'The coach\'s notebook', tone: 'accent.default',
    parts: [r('shape', 6, 3, 14, 18, 1), p('paperLine', 'M10 8h6M10 12h6M10 16h4', { w: 1.6 }), p('line', 'M3.5 7h4M3.5 12h4M3.5 17h4')] },
  { id: 'phone', label: 'Phone', carries: 'A call to take or make', tone: 'accent.default',
    parts: [p('shape', 'M6 3h3l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z')] },
  { id: 'messages', label: 'Messages', carries: 'Unread messages', tone: 'accent.default',
    parts: [r('shape', 3, 5.5, 18, 13, 1), p('paperLine', 'M4.5 7.5L12 13l7.5-5.5')] },
  { id: 'calendar', label: 'Calendar', carries: 'Dates and the week schedule', tone: 'state.neutral',
    parts: [r('shape', 3, 5, 18, 16, 1), p('paperLine', 'M3.5 10h17'), p('line', 'M8 3v4M16 3v4'), r('paper', 7, 13, 3, 3), r('paper', 14, 13, 3, 3)] },
  { id: 'practice', label: 'Practice', carries: 'Practice plan and drills', tone: 'state.caution',
    parts: [p('shape', 'M9.5 4h5l4 15h-13z'), p('paperLine', 'M8.5 13h7'), p('line', 'M3 20.5h18')] },
  { id: 'meeting', label: 'Meeting', carries: 'A meeting on the schedule', tone: 'team.home',
    parts: [c('shape', 8, 8, 3), c('shape', 16, 8, 3), p('shape', 'M2.5 20a5.5 5.5 0 0 1 11 0z'), p('shape', 'M10.5 20a5.5 5.5 0 0 1 11 0z')] },
  { id: 'player', label: 'Player', carries: 'A player: roster, depth chart', tone: 'team.home',
    parts: [c('shape', 12, 7, 3.8), p('shape', 'M4 21a8 8 0 0 1 16 0z')] },
  { id: 'contract', label: 'Contract', carries: 'A contract or offer', tone: 'state.neutral',
    parts: [p('shape', 'M5 3h10l4 4v14H5z'), p('paperLine', 'M8 10h8M8 13.5h8', { w: 1.6 }), p('paperLine', 'M8 17.5c1.5-2 2.5 1 4-1s2 1 4 0', { w: 1.6 })] },
  { id: 'scouting', label: 'Scouting', carries: 'Scouting reports and grades', tone: 'overlay.assignment',
    parts: [r('shape', 9.5, 8, 5, 5), c('shape', 7, 15.5, 4.5), c('shape', 17, 15.5, 4.5), c('paper', 6, 14.5, 1.3), c('paper', 16, 14.5, 1.3), p('line', 'M5 11V5h3M19 11V5h-3')] },
  { id: 'travel', label: 'Travel', carries: 'Travel and road trips', tone: 'state.neutral',
    parts: [r('shape', 3, 5, 18, 12, 2), r('paper', 5.5, 7.5, 5, 4), r('paper', 13.5, 7.5, 5, 4), c('solid', 7.5, 19, 2), c('solid', 16.5, 19, 2)] },
  { id: 'media', label: 'Media', carries: 'Press conference and media duties', tone: 'state.neutral',
    parts: [r('shape', 9, 3, 6, 11, 3), p('paperLine', 'M10.5 7h3M10.5 10h3', { w: 1.6 }), p('line', 'M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8')] },
  { id: 'trade', label: 'Trade', carries: 'A trade offer', tone: 'text.ink',
    parts: [p('line', 'M7 4v15M3.5 15.5L7 19l3.5-3.5M17 20V5M13.5 8.5L17 5l3.5 3.5')] },
  { id: 'stats', label: 'Statistics', carries: 'Stats and charts', tone: 'accent.default',
    parts: [r('shape', 4, 12, 4, 8), r('shape', 10, 6, 4, 14), r('shape', 16, 9, 4, 11), p('line', 'M2 21h20')] },
  { id: 'settings', label: 'Settings', carries: 'Settings', tone: 'state.neutral',
    parts: [p('line', 'M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22M4.9 4.9l2.5 2.5M16.6 16.6l2.5 2.5M4.9 19.1l2.5-2.5M16.6 7.4l2.5-2.5', { w: 3.5 }), c('shape', 12, 12, 6), c('paper', 12, 12, 2.3)] },
  { id: 'search', label: 'Search', carries: 'Find a screen, player or play', tone: 'text.ink',
    parts: [c('line', 10.5, 10.5, 6.5), p('line', 'M15.5 15.5L21 21', { w: 3.5 })] },
];

export const GLYPH_IDS = GLYPHS.map((g) => g.id);
export type GlyphId = string;

export function glyphById(id: string): Glyph {
  const g = GLYPHS.find((x) => x.id === id);
  if (!g) throw new Error(`unknown icon ${id}`);
  return g;
}
