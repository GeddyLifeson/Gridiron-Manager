// PV-05 banner bar: a character-generator lower third in the Classic look (plan 2.1: blocky uppercase,
// hard drop shadow, flat bars, cut on and off with no motion), token text in the plain look. One bar at a
// time from the BannerQueue. Click or Escape skips it. The text is also an aria-live status line.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import { LowerThird } from '../strip/era-shim.ts';
import type { StripLook } from '../strip/Strip.tsx';
import type { BannerGate, BannerQueue, ShowingBanner } from './queue.ts';

export interface BannerBarProps {
  queue: BannerQueue;
  gate: BannerGate;
  look: StripLook;
  /** Wall clock in ms (plan section 6: banners are the one presentation part timed on the wall clock). */
  now?: () => number;
  /** Timer step in ms. */
  stepMs?: number;
}

/** Escape skips the bar (O1.3.1 keys pass through the shell; this listens only while a bar shows). */
export function isSkipKey(key: string): boolean { return key === 'Escape'; }

export function BannerView({ banner, look, onSkip }: { banner: ShowingBanner | null; look: StripLook; onSkip: () => void }): ReactNode {
  return (
    <div data-region="banner" style={{ minHeight: 0 }}>
      <p role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', margin: 0 }}>
        {banner ? banner.lines.join('. ') : ''}
      </p>
      {banner && (
        <button type="button" onClick={onSkip} data-banner={banner.kind} data-look={look} aria-label={`${banner.lines.join('. ')}. Skip`}
          style={{ all: 'unset', cursor: 'pointer', display: 'inline-block' }}>
          {look === 'classic'
            ? <LowerThird lines={banner.lines} />
            : (
              <span style={{ display: 'inline-block', background: v('surface.raised'), color: v('text.ink'), border: `var(--gm-line-weight-medium) solid ${v('line.strong')}`, padding: 'var(--gm-space) calc(var(--gm-space) * 3)' }}>
                {banner.lines.map((l, i) => <span key={i} style={{ display: 'block', fontWeight: i === 0 ? 700 : 400 }}>{l}</span>)}
              </span>
            )}
        </button>
      )}
    </div>
  );
}

export function BannerBar({ queue, gate, look, now = Date.now, stepMs = 100 }: BannerBarProps): ReactNode {
  const [banner, setBanner] = useState<ShowingBanner | null>(() => queue.step(now(), gate));
  const gateRef = useRef(gate);
  gateRef.current = gate;
  useEffect(() => {
    const id = window.setInterval(() => setBanner(queue.step(now(), gateRef.current)), stepMs);
    return () => window.clearInterval(id);
  }, [queue, now, stepMs]);
  useEffect(() => {
    if (!banner) return;
    const onKey = (e: KeyboardEvent) => { if (isSkipKey(e.key)) { queue.skip(now()); setBanner(queue.step(now(), gateRef.current)); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [banner, queue, now]);
  const skip = () => { queue.skip(now()); setBanner(queue.step(now(), gateRef.current)); };
  return <BannerView banner={banner} look={look} onSkip={skip} />;
}
