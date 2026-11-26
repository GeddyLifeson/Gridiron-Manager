// PV-17 markup reader: a small tag-stack walk over React's static markup (it is well formed), enough to find
// every piece of text with the colour and background it is drawn in. No DOM library is installed, and the real
// browser pass (scripts/presentation-qa/screenshots.ts) checks the same thing on computed styles.
import { contrastRatio, tokenVariables, type ColourVisionId, type ThemeId } from '../../src/tokens/index.ts';

export interface TextRun { text: string; fg: string; bg: string; surface: string; tag: string }

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline', 'ellipse']);

/** Value of a CSS property in an inline style string, or null. Handles `var(a, var(b))` with commas inside. */
function prop(style: string, name: string): string | null {
  const re = new RegExp(`(?:^|;)\\s*${name}\\s*:`, 'i');
  const m = re.exec(style);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 0;
  const start = i;
  for (; i < style.length; i++) {
    const c = style[i]!;
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ';' && depth === 0) break;
  }
  return style.slice(start, i).trim();
}

/** Resolves `var(--x, fallback)` against a variable map; returns a #rrggbb colour or null if it is not a plain colour. */
export function resolveColour(value: string | null, vars: Readonly<Record<string, string>>): string | null {
  if (!value) return null;
  const v = value.trim();
  const m = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/i.exec(v);
  if (m) {
    const hit = vars[m[1]!];
    if (hit !== undefined) return resolveColour(hit, vars);
    return m[2] ? resolveColour(m[2], vars) : null;
  }
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  return null;
}

/** Every text run in `html`, with its inherited colour and nearest background (`pageBg` if none). */
export function textRuns(html: string, theme: ThemeId, vision: ColourVisionId): TextRun[] {
  const vars = tokenVariables({ theme, colourVision: vision });
  const pageBg = resolveColour('var(--gm-surface-bg)', vars)!;
  const ink = resolveColour('var(--gm-text-ink)', vars)!;
  const out: TextRun[] = [];
  const stack: { tag: string; fg: string; bg: string; surface: string }[] = [{ tag: 'body', fg: ink, bg: pageBg, surface: 'page' }];
  const re = /<(\/?)([a-z0-9]+)([^>]*?)(\/?)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[5] !== undefined) {
      const text = m[5].replace(/&amp;/g, '&').replace(/&#x27;/g, "'").trim();
      const top = stack[stack.length - 1]!;
      if (text && top.tag !== 'style' && top.tag !== 'title') out.push({ text, fg: top.fg, bg: top.bg, surface: top.surface, tag: top.tag });
      continue;
    }
    const closing = m[1] === '/', tag = m[2]!.toLowerCase(), attrs = m[3] ?? '';
    if (closing) { while (stack.length > 1 && stack.pop()!.tag !== tag) { /* unwind */ } continue; }
    if (VOID.has(tag) || m[4] === '/') continue;
    const parent = stack[stack.length - 1]!;
    const style = /style="([^"]*)"/.exec(attrs)?.[1]?.replace(/&quot;/g, '"').replace(/&#x27;/g, "'") ?? '';
    const fg = resolveColour(prop(style, 'color'), vars) ?? parent.fg;
    const bg = resolveColour(prop(style, 'background'), vars) ?? resolveColour(prop(style, 'background-color'), vars) ?? parent.bg;
    const surface = /data-surface="([^"]+)"/.exec(attrs)?.[1] ?? parent.surface;
    stack.push({ tag, fg, bg, surface });
  }
  return out;
}

export const ratio = contrastRatio;
