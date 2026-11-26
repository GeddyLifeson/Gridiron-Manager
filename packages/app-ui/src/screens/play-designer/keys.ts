// Keyboard-only drawing (O3.1.2 acceptance 2): a pure map from a key press to designer commands, so a
// play can be built from scratch without a pointer and the mapping is testable.
//   Not drawing: a letter selects the player wearing that position letter; Tab and Shift+Tab step
//   through the players; arrows nudge the selected player (Alt holds off snapping); Space puts him on
//   or off the line; Enter starts a route, Shift+Enter a motion; Delete clears his path.
//   Drawing: digits set the next leg's length in yards; arrows add a leg (up = upfield, Shift turns the
//   arrow 45 degrees clockwise, so Shift+Up is up and to the right); Enter finishes; Escape cancels.
//   Always: Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo, Ctrl+M flip (mirror).
import type { DesignerCommand } from './types.ts';

export interface KeyPress { readonly key: string; readonly shift?: boolean; readonly ctrl?: boolean; readonly alt?: boolean }

const ARROW_DIR: Readonly<Record<string, number>> = { ArrowUp: 0, ArrowRight: 2, ArrowDown: 4, ArrowLeft: 6 };
const ARROW_NUDGE: Readonly<Record<string, readonly [number, number]>> = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };

/** `legDigits` is what was typed for the current leg so far ('' none); returns the commands and the new digits. */
export function keyCommands(k: KeyPress, drawing: boolean, legDigits = ''): { commands: DesignerCommand[]; legDigits: string } {
  const none = { commands: [] as DesignerCommand[], legDigits };
  if (k.ctrl) {
    const key = k.key.toLowerCase();
    if (key === 'z') return { commands: [{ type: k.shift ? 'redo' : 'undo' }], legDigits: '' };
    if (key === 'y') return { commands: [{ type: 'redo' }], legDigits: '' };
    if (key === 'm') return { commands: [{ type: 'mirror' }], legDigits: '' };
    return none;
  }
  if (drawing) {
    if (/^[0-9]$/.test(k.key)) {
      const digits = (legDigits + k.key).slice(-2);
      return { commands: [{ type: 'draw_leg_length', yd: Number(digits) }], legDigits: digits };
    }
    const dir = ARROW_DIR[k.key];
    if (dir !== undefined) return { commands: [{ type: 'draw_leg', dir: dir + (k.shift ? 1 : 0), kind: 'cut' }], legDigits: '' };
    if (k.key === 'Enter') return { commands: [{ type: 'draw_end', behavior: null, free: !!k.alt }], legDigits: '' };
    if (k.key === 'Escape') return { commands: [{ type: 'draw_cancel' }], legDigits: '' };
    return none;
  }
  const nudge = ARROW_NUDGE[k.key];
  if (nudge) return { commands: [{ type: 'nudge', dDepth: nudge[0], dLateral: nudge[1], free: !!k.alt }], legDigits: '' };
  if (k.key === 'Tab') return { commands: [{ type: 'select_next', step: k.shift ? -1 : 1 }], legDigits: '' };
  if (k.key === ' ') return { commands: [{ type: 'toggle_line' }], legDigits: '' };
  if (k.key === 'Enter') return { commands: [{ type: 'draw_begin', target: k.shift ? 'motion' : 'path' }], legDigits: '' };
  if (k.key === 'Delete' || k.key === 'Backspace') return { commands: [{ type: 'clear_path' }], legDigits: '' };
  if (k.key === 'Escape') return { commands: [{ type: 'select', role: null }], legDigits: '' };
  if (/^[a-zA-Z]$/.test(k.key)) return { commands: [{ type: 'select_letter', letter: k.key }], legDigits: '' };
  return none;
}
