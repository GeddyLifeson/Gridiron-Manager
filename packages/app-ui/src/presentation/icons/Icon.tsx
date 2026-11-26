// PV-13: the icon component. An icon is never shown alone: its text label is visible beside it,
// or (label="hidden", for tight rows that already print the same words) it is the accessible name.
// A disabled icon must carry its reason, which is always visible (MB-15).
import { createElement, type ReactElement } from 'react';
import { ICON_GRID, glyphById } from './glyphs.ts';
import { glyphNodes, holdRing, type IconState } from './icons.ts';
import { v } from '../../tokens/index.ts';

interface IconBase { id: string; sizePx?: number; label?: 'visible' | 'hidden' }
export type IconProps =
  | (IconBase & { state?: 'normal' | 'active' })
  | (IconBase & { state: 'holding'; holdFraction: number })
  | (IconBase & { state: 'disabled'; reason: string });

export function Icon(props: IconProps): ReactElement {
  const g = glyphById(props.id);
  const state: IconState = props.state ?? 'normal';
  const size = props.sizePx ?? ICON_GRID;
  const nodes = glyphNodes(g, state);
  if (props.state === 'holding') nodes.push(holdRing(props.holdFraction));
  const svg = createElement('svg', {
    viewBox: `0 0 ${ICON_GRID} ${ICON_GRID}`, width: size, height: size, 'aria-hidden': true, focusable: 'false',
  }, ...nodes.map((n, i) => createElement(n.tag, { key: i, ...n.attrs })));
  const showLabel = props.label !== 'hidden';
  return createElement('span', {
    'data-icon': g.id, 'data-state': state, role: 'img',
    'aria-label': props.state === 'disabled' ? `${g.label}: ${props.reason}` : g.label,
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 'var(--gm-space)',
      color: v(state === 'disabled' ? 'text.muted' : 'text.ink'),
      fontWeight: state === 'active' ? 700 : 400,
      borderBottom: state === 'active' ? `var(--gm-line-weight-thick) solid ${v('accent.default')}` : undefined,
    },
  },
  svg,
  showLabel ? createElement('span', { 'aria-hidden': true }, g.label) : null,
  props.state === 'disabled' ? createElement('span', { 'aria-hidden': true, 'data-reason': true }, `(${props.reason})`) : null);
}
