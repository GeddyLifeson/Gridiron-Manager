// The print and export screen (O3.4.3, G7.9.2) prints what the game plan read model already holds: the
// sheet's print boxes at true page size, the wristband, the scripts, the head coach card and the plan. It
// reuses the game plan screen's view types, so the printed sheet comes from the same data as the console
// and the editor (G7.9.2: same renderer, box for box).
import TEXT from './text.json';
import type { GameplanView, PrintView } from '../gameplan/view.ts';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const prTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function pr(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export const DOCS = ['sheet', 'band', 'script', 'card', 'plan'] as const;
export type Doc = (typeof DOCS)[number];
export type Paper = PrintView['paper'];
export type PrintUi = GameplanView;

export type PrintIntent =
  | { kind: 'settings'; paper: Paper; keyHints: boolean; docs: readonly Doc[] }
  | { kind: 'print' }
  | { kind: 'export_sheet' };

/** Pages to print, from the address: a comma list, unknown names dropped, all pages when absent. */
export function docsFromView(view: Record<string, string>): Doc[] {
  if (view.docs === undefined) return [...DOCS];
  return view.docs.split(',').filter((d): d is Doc => (DOCS as readonly string[]).includes(d));
}
export function docsToView(docs: readonly Doc[]): string {
  return DOCS.filter((d) => docs.includes(d)).join(',');
}

/**
 * Classic look for paper (PV-18 Classic theme): the theme's cream ink becomes the paper and its dark ground
 * becomes the ink, so a sheet prints dark on light; the era's broadcast bars head each page. The values are
 * the Classic tokens, read by name, so a token change carries through to print.
 */
export const PAPER_TOKENS = {
  paper: 'text.ink', ink: 'surface.bg', rule: 'line.strong', faint: 'text.muted', bar: 'era.cgBar', barAlt: 'era.cgBarAlt', barInk: 'era.cgText', mark: 'accent.default',
} as const;
