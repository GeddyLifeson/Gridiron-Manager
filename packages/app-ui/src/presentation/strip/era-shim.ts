// TEMPORARY stand-in for PV-18's era package (`../era/index.ts`), with the same names and props, so PV-05
// builds before PV-18 lands. When PV-18 merges, this file becomes `export * from '../era/index.ts'` and
// nothing else changes. It draws nothing period-specific: plain monospace text in the era CSS variables,
// each falling back to a design token so the strip still reads with no era variables set.
import { createElement, type ReactElement } from 'react';
import { cssVar, v } from '../../tokens/index.ts';

/**
 * PV-18's `era` token group (`v('era.lampOn')` is `var(--gm-era-lamp-on)`), with a plain token as the CSS
 * fallback while main has no era group yet.
 */
export const eraVar = (name: EraColour): string => `var(${cssVar(`era.${name}`)}, ${v(ERA_FALLBACK[name])})`;

export type EraColour = 'lampOn' | 'lampOff' | 'lampAlert' | 'lampPanel' | 'segmentOn' | 'segmentOff' | 'cgBar' | 'cgBarAlt' | 'cgText' | 'cgShadow';

const ERA_FALLBACK: Record<EraColour, string> = {
  lampOn: 'text.ink', lampOff: 'line.default', lampAlert: 'state.caution', lampPanel: 'surface.panel',
  segmentOn: 'text.ink', segmentOff: 'line.default', cgBar: 'surface.raised', cgBarAlt: 'surface.panel', cgText: 'text.ink', cgShadow: 'surface.bg',
};

const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

export function LampText(p: { text: string; colour?: 'on' | 'alert'; sizePx?: number }): ReactElement {
  return createElement('span', {
    'aria-hidden': true, 'data-era': 'lamp',
    style: { fontFamily: MONO, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: p.sizePx, color: eraVar(p.colour === 'alert' ? 'lampAlert' : 'lampOn') },
  }, p.text.toUpperCase());
}

export function SegmentClock(p: { value: string; sizePx?: number; colour?: 'on' | 'alert' }): ReactElement {
  return createElement('span', {
    'aria-hidden': true, 'data-era': 'segment',
    style: { fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: p.sizePx, color: eraVar(p.colour === 'alert' ? 'lampAlert' : 'segmentOn') },
  }, p.value);
}

export function LowerThird(p: { lines: readonly string[] }): ReactElement {
  return createElement('div', {
    'aria-hidden': true, 'data-era': 'cg',
    style: { display: 'inline-block', background: eraVar('cgBar'), color: eraVar('cgText'), fontFamily: MONO, fontWeight: 700, textTransform: 'uppercase', padding: 'calc(var(--gm-space) * 2) calc(var(--gm-space) * 4)', textShadow: `2px 2px 0 ${eraVar('cgShadow')}` },
  }, ...p.lines.map((l, i) => createElement('div', { key: i, style: i > 0 ? { background: eraVar('cgBarAlt') } : undefined }, l.toUpperCase())));
}
