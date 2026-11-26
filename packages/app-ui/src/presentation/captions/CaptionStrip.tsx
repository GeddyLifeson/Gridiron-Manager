// PV-14: the captions strip view. A polite live region, so a screen reader reads each new line once
// without interrupting. Lines are cut on and off with no motion (O6.4.1).
import { createElement, type ReactElement } from 'react';
import { v } from '../../tokens/index.ts';
import { lineText, type CaptionLine } from './captions.ts';

export interface CaptionStripProps { lines: readonly CaptionLine[]; visible: boolean }

export function CaptionStrip(props: CaptionStripProps): ReactElement | null {
  if (!props.visible) return null;
  return createElement('div', {
    role: 'log', 'aria-live': 'polite', 'aria-label': 'Sound captions', 'data-captions': true,
    style: { display: 'flex', flexDirection: 'column', gap: 'var(--gm-space)', color: v('text.ink'), background: v('surface.panel'), padding: 'var(--gm-space)' },
  }, ...props.lines.map((l) => createElement('span', { key: `${l.fromMs}-${l.text}` }, lineText(l))));
}
