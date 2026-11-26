// PV-18 React components for the period display faces. SVG only, colours only through era CSS
// variables (`ev(...)`), so they work in every theme. Nothing animates: banners cut on and off.
import { createElement, type ReactElement } from 'react';
import { lampLayout, segmentCells, SEGMENTS, SEGMENT_POLYGONS, DIGIT_BOX, type LampOptions } from './lamp-font.ts';
import { cgLayout, lowerThirdLayout, CG_SHADOW, type CgLayout } from './cg-font.ts';
import { ev, type EraKey } from './theme.ts';
import type { LeaderCard } from './film.ts';

const svg = (w: number, h: number, label: string, children: ReactElement[], heightPx: number): ReactElement =>
  createElement('svg', {
    viewBox: `0 0 ${w} ${h}`, height: heightPx, width: (heightPx * w) / Math.max(h, 1),
    role: 'img', 'aria-label': label, preserveAspectRatio: 'xMinYMid meet',
  }, ...children);

/** Lamp colour: 'on' is the normal lamp, 'alert' the contrasting lamp (late play clock). Never the only signal. */
export type LampColour = 'on' | 'alert';
const litKey = (c: LampColour | undefined): EraKey => (c === 'alert' ? 'lampAlert' : 'lampOn');

export interface LampTextProps extends LampOptions { text: string; colour?: LampColour; sizePx?: number; heightPx?: number; lit?: 'lampOn' | 'lampAlert' }

/** Text on a lamp board: every cell is a round lamp, lit or unlit, on the panel colour. */
export function LampText(p: LampTextProps): ReactElement {
  const l = lampLayout(p.text, p);
  const pitch = 2, r = 0.8;
  const w = Math.max(l.cols, 1) * pitch + pitch, h = l.rows * pitch + pitch;
  const kids: ReactElement[] = [createElement('rect', { key: 'panel', x: 0, y: 0, width: w, height: h, fill: ev('lampPanel') })];
  l.lamps.forEach((lamp, i) => kids.push(createElement('circle', {
    key: i, cx: pitch + lamp.col * pitch, cy: pitch + lamp.row * pitch, r, fill: ev(lamp.on ? (p.lit ?? litKey(p.colour)) : 'lampOff'),
  })));
  return svg(w, h, p.text, kids, p.sizePx ?? p.heightPx ?? 28);
}

export interface SegmentClockProps { value: string; colour?: LampColour; sizePx?: number; heightPx?: number }

/** Seven-segment clock digits; unlit segments stay faintly visible, as on a period board. */
export function SegmentClock(p: SegmentClockProps): ReactElement {
  const cells = segmentCells(p.value);
  const on: EraKey = p.colour === 'alert' ? 'lampAlert' : 'segmentOn';
  const gap = 2, pad = 2;
  const kids: ReactElement[] = [];
  let x = pad;
  cells.forEach((cell, i) => {
    if (cell.kind === 'colon') {
      for (const cy of [6, 12]) kids.push(createElement('circle', { key: `${i}-${cy}`, cx: x + DIGIT_BOX.colonW / 2, cy: pad + cy, r: 1.1, fill: ev(cell.lit ? on : 'segmentOff') }));
      x += DIGIT_BOX.colonW + gap;
      return;
    }
    for (const s of SEGMENTS) {
      const pts = SEGMENT_POLYGONS[s].map(([px, py]) => `${x + px},${pad + py}`).join(' ');
      kids.push(createElement('polygon', { key: `${i}-${s}`, points: pts, fill: ev(cell.lit[s] ? on : 'segmentOff') }));
    }
    x += DIGIT_BOX.w + gap;
  });
  const w = x - gap + pad, h = DIGIT_BOX.h + 2 * pad;
  kids.unshift(createElement('rect', { key: 'panel', x: 0, y: 0, width: w, height: h, fill: ev('lampPanel') }));
  return svg(w, h, p.value.trim(), kids, p.sizePx ?? p.heightPx ?? 36);
}

function cgRuns(layout: CgLayout, x0: number, y0: number, fill: EraKey, key: string): ReactElement[] {
  return layout.runs.map((r, i) => createElement('rect', { key: `${key}${i}`, x: x0 + r.x, y: y0 + r.y, width: r.w, height: 1, fill: ev(fill) }));
}

export interface CgTextProps { text: string; heightPx?: number; bar?: 'cgBar' | 'cgBarAlt' | 'none' }

/** One line of caption text with its hard drop shadow, optionally on a flat bar. */
export function CgText(p: CgTextProps): ReactElement {
  const l = cgLayout(p.text);
  const pad = p.bar === 'none' ? 0 : 2;
  const w = l.cols + CG_SHADOW.dx + 2 * pad, h = l.rows + CG_SHADOW.dy + 2 * pad;
  const kids: ReactElement[] = [];
  if (p.bar !== 'none') kids.push(createElement('rect', { key: 'bar', x: 0, y: 0, width: w, height: h, fill: ev(p.bar ?? 'cgBar') }));
  kids.push(...cgRuns(l, pad + CG_SHADOW.dx, pad + CG_SHADOW.dy, 'cgShadow', 's'), ...cgRuns(l, pad, pad, 'cgText', 't'));
  return svg(w, h, p.text, kids, p.heightPx ?? 24);
}

export interface LowerThirdProps { lines: readonly string[]; heightPx?: number }

/** A period lower third: one to three caption lines on flat bars. Cut on and off by the banner queue; it never moves. */
export function LowerThird(p: LowerThirdProps): ReactElement {
  const l = lowerThirdLayout(p.lines);
  const lineH = l.rows / l.lines.length;
  const kids: ReactElement[] = [];
  l.lines.forEach((line, i) => {
    const barW = line.layout.cols + 2 * line.x + CG_SHADOW.dx;
    kids.push(createElement('rect', { key: `bar${i}`, x: 0, y: i * lineH, width: barW, height: lineH, fill: ev(line.bar) }));
    kids.push(...cgRuns(line.layout, line.x + CG_SHADOW.dx, line.y + CG_SHADOW.dy, 'cgShadow', `s${i}-`), ...cgRuns(line.layout, line.x, line.y, 'cgText', `t${i}-`));
  });
  return createElement('div', { 'data-era': 'lower-third', role: 'status', 'aria-label': p.lines.join('. ') },
    svg(l.cols, l.rows, p.lines.join('. '), kids, p.heightPx ?? 26 * l.lines.length));
}

export interface LeaderCardViewProps { card: LeaderCard; heightPx?: number }

/** Reel leader title card: a still, full-width card in the character-generator face. */
export function LeaderCardView(p: LeaderCardViewProps): ReactElement {
  const title = cgLayout(p.card.title);
  const sub = p.card.subtitle ? cgLayout(p.card.subtitle) : null;
  const w = Math.max(title.cols, sub?.cols ?? 0) + 16, h = sub ? 30 : 19;
  const cx = (cols: number) => Math.floor((w - cols) / 2);
  const kids: ReactElement[] = [createElement('rect', { key: 'bg', x: 0, y: 0, width: w, height: h, fill: ev(p.card.bg) })];
  kids.push(...cgRuns(title, cx(title.cols), 6, p.card.ink, 't'));
  if (sub) kids.push(...cgRuns(sub, cx(sub.cols), 17, p.card.ink, 'u'));
  return createElement('div', { 'data-era': 'leader', 'data-stock': p.card.stock },
    svg(w, h, [p.card.title, p.card.subtitle].filter(Boolean).join('. '), kids, p.heightPx ?? 120));
}
