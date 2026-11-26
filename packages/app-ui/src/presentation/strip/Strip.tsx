// PV-05 score strip (O2.1.3, plan 3.4 and 2.1). Always visible across the top of the console. Two looks
// over one model: `classic`, a 1970s/80s stadium lamp board (round lamps, segment clock digits) drawn by
// PV-18's era components; and `plain`, token text. The high-contrast theme always gets `plain` (plan 2.1:
// the skin carries no information and may never make information harder to read).
// Every 3.4 item carries a `data-item` attribute so the completeness test can find it.
import type { CSSProperties, ReactNode } from 'react';
import { v } from '../../tokens/index.ts';
import type { ThemeId } from '../../tokens/index.ts';
import { LampText, SegmentClock, eraVar } from './era-shim.ts';
import { NOISE_SEGMENTS, type StripModel, type StripTeamView } from './model.ts';

export type StripLook = 'classic' | 'plain';

/** The look actually drawn: Classic unless the theme is high contrast or the user picked plain. */
export function stripLook(theme: ThemeId, wanted: StripLook = 'classic'): StripLook {
  return theme === 'high-contrast' ? 'plain' : wanted;
}

const gap = 'calc(var(--gm-space) * 2)';

function Lamp({ on, hollow, look }: { on: boolean; hollow?: boolean; look: StripLook }): ReactNode {
  const onC = look === 'classic' ? eraVar('lampOn') : v('text.ink');
  const offC = look === 'classic' ? eraVar('lampOff') : v('line.default');
  const style: CSSProperties = {
    display: 'inline-block', width: '0.7em', height: '0.7em', borderRadius: '50%', marginRight: '0.2em',
    background: on && !hollow ? onC : 'transparent', border: `var(--gm-line-weight-medium) solid ${on ? onC : offC}`,
  };
  return <span aria-hidden="true" data-lamp={on ? 'on' : 'off'} style={style} />;
}

function Text({ look, text, alert }: { look: StripLook; text: string; alert?: boolean }): ReactNode {
  if (look === 'classic') return <LampText text={text} colour={alert ? 'alert' : 'on'} />;
  return <span aria-hidden="true" style={{ color: alert ? v('state.caution') : v('text.ink'), fontWeight: alert ? 700 : 400 }}>{text}</span>;
}

function Digits({ look, value, alert, big }: { look: StripLook; value: string; alert?: boolean; big?: boolean }): ReactNode {
  const size = big ? 'var(--gm-type-xl)' : 'var(--gm-type-lg)';
  if (look === 'classic') return <span style={{ fontSize: size }}><SegmentClock value={value} colour={alert ? 'alert' : 'on'} /></span>;
  return <span aria-hidden="true" style={{ fontSize: size, fontFeatureSettings: 'var(--gm-font-features)', fontWeight: 700, color: alert ? v('state.caution') : v('text.ink') }}>{value}</span>;
}

/** Possession mark: a triangle pointing at the team with the ball (shape, not colour). */
function BallMark({ look, show, pointLeft }: { look: StripLook; show: boolean; pointLeft: boolean }): ReactNode {
  const c = look === 'classic' ? eraVar('lampOn') : v('text.ink');
  const side = '0.4em solid transparent';
  const style: CSSProperties = {
    display: 'inline-block', width: 0, height: 0, borderTop: side, borderBottom: side, visibility: show ? 'visible' : 'hidden',
    ...(pointLeft ? { borderRight: `0.6em solid ${c}` } : { borderLeft: `0.6em solid ${c}` }),
  };
  return <span aria-hidden="true" data-item="possession" data-ball={show ? 'true' : 'false'} style={style} />;
}

function TeamBlock({ t, look, mirror }: { t: StripTeamView; look: StripLook; mirror: boolean }): ReactNode {
  const swatch = (
    <span aria-hidden="true" style={{ display: 'inline-flex', flexDirection: 'column', width: '0.5em', height: '1.4em' }}>
      <span style={{ flex: 1, background: t.primary }} />
      <span style={{ flex: 1, background: t.secondary }} />
    </span>
  );
  const name = <span data-item="teams"><Text look={look} text={t.name} /></span>;
  const score = <span data-item="score"><Digits look={look} value={String(t.score)} big /></span>;
  const tos = (
    <span data-item="timeouts" aria-hidden="true" title={`${t.timeoutsLeft} timeouts`}>
      {Array.from({ length: t.timeoutsTotal }, (_, k) => <Lamp key={k} on={k < t.timeoutsLeft} look={look} />)}
    </span>
  );
  const parts = [<BallMark key="b" look={look} show={t.hasBall} pointLeft={mirror} />, <span key="s">{swatch}</span>, <span key="n">{name}</span>, <span key="c">{score}</span>, <span key="t">{tos}</span>];
  return <span data-team={t.side} style={{ display: 'inline-flex', alignItems: 'center', gap }}>{mirror ? parts.reverse() : parts}</span>;
}

function Noise({ m, look }: { m: StripModel; look: StripLook }): ReactNode {
  return (
    <span data-item="noise" data-noise-source={m.noise.source} title={m.noise.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--gm-space)' }}>
      <Text look={look} text={m.noise.source === 'engine' ? 'NOISE' : 'NOISE BASE'} />
      <span aria-hidden="true">{Array.from({ length: NOISE_SEGMENTS }, (_, k) => <Lamp key={k} on={k < m.noise.lit} hollow={m.noise.source === 'venue'} look={look} />)}</span>
    </span>
  );
}

function Wind({ m, look }: { m: StripModel; look: StripLook }): ReactNode {
  const c = look === 'classic' ? eraVar('lampOn') : v('text.ink');
  return (
    <span data-item="wind" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--gm-space)' }}>
      {m.wind.dirDeg !== null && (
        <svg aria-hidden="true" viewBox="-6 -6 12 12" width="1em" height="1em" style={{ transform: `rotate(${-m.wind.dirDeg}deg)` }}>
          <path d="M -5 0 L 3 0 M 0 -3 L 4 0 L 0 3" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <Text look={look} text={m.wind.text} />
    </span>
  );
}

export interface StripProps { model: StripModel; look: StripLook }

export function Strip({ model: m, look }: StripProps): ReactNode {
  const bg = look === 'classic' ? eraVar('lampPanel') : v('surface.panel');
  const pc = m.playClock;
  return (
    <div role="region" aria-label="Score board" data-look={look} data-region="strip"
      style={{ background: bg, display: 'flex', flexDirection: 'column', gap: 'var(--gm-space)', padding: 'var(--gm-space) calc(var(--gm-space) * 3)', whiteSpace: 'nowrap', overflow: 'hidden', fontSize: 'var(--gm-type-md)' }}>
      <p style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', margin: 0 }} aria-live="off">{m.summary}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap }}>
        <TeamBlock t={m.away} look={look} mirror={false} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
          <span data-item="quarter"><Text look={look} text={m.quarterLabel} /></span>
          <span data-item="gameClock" data-running={m.clockRunning ? 'true' : 'false'}><Digits look={look} value={m.clock} big /></span>
          <span data-item="playClock" data-late={pc?.under10 ? 'true' : 'false'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--gm-space)', padding: '0 var(--gm-space)', outline: pc?.under10 ? `var(--gm-line-weight-thick) solid ${look === 'classic' ? eraVar('lampAlert') : v('state.caution')}` : 'none' }}>
            {pc ? <Digits look={look} value={String(pc.seconds)} alert={pc.under10} /> : <Text look={look} text={m.live ? 'LIVE' : '--'} />}
          </span>
        </span>
        <TeamBlock t={m.home} look={look} mirror />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap }}>
        <span data-item="downDistance"><Text look={look} text={m.downDistance || '--'} /></span>
        <span data-item="ballSpot"><Text look={look} text={m.spot ? `BALL ON ${m.spot}` : '--'} /></span>
        <Noise m={m} look={look} />
        <Wind m={m} look={look} />
      </div>
    </div>
  );
}
