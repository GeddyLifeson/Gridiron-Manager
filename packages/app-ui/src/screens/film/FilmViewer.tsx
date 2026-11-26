// The film viewer (O2.6.1, O2.6.2, N1.1). Field view on the left two thirds, the play's record on the
// right, a timeline with event ticks below. Keys: Space play and pause, Left and Right one tick, Shift
// with an arrow the previous or next event, Up and Down the previous or next play of the reel, R back
// to the snap, 1 to 4 speed, L loop, V the other camera angle, and A P G T C toggle the overlays.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FieldRenderer, fieldPalette, resolveTeamColours, type FieldGeometryLike, type TeamColours } from '../../field-view/index.ts';
import { resolveColours, v, type ThemeId, type ColourVisionId } from '../../tokens/index.ts';
import { FilmTransport, ReelCursor, FILM_SPEEDS } from './transport.ts';
import { VIEW_FRAMING, ViewMemory, type FilmView } from './views.ts';
import { buildOverlays, drawOverlays, LEGEND, OVERLAY_KEYS, OVERLAY_LAYERS, type OverlayLayer, type OverlayRole } from './overlays.ts';
import { toFilmPlay } from './wire.ts';
import type { FilmPlayDataLike, FilmScreenSource, OverlayLineLike } from './types.ts';

export interface FilmViewerProps {
  readonly source: FilmScreenSource;
  readonly playIds: readonly string[];
  readonly geometry: FieldGeometryLike;
  readonly home: TeamColours;
  readonly away: TeamColours;
  /** Position room whose view choice is remembered (N1.1.1). */
  readonly room?: string;
  readonly theme?: ThemeId;
  readonly colourVision?: ColourVisionId;
  readonly guesses?: (playId: string) => readonly OverlayLineLike[];
  readonly width?: number;
  readonly height?: number;
  readonly views?: ViewMemory;
}

const MS_PER_S = 1000, MAX_STEP_S = 0.25, OVERLAY_FONT_PX = 13;

export function FilmViewer(props: FilmViewerProps) {
  const { source, geometry, width = 900, height = 560, room = 'team' } = props;
  const reel = useMemo(() => new ReelCursor(props.playIds), [props.playIds]);
  const [playId, setPlayId] = useState(reel.current);
  const views = useMemo(() => props.views ?? new ViewMemory(), [props.views]);
  const [view, setView] = useState<FilmView>(views.get(room));
  const [layers, setLayers] = useState<ReadonlySet<OverlayLayer>>(new Set(['assignments']));
  const [selected, setSelected] = useState<number | null>(null);
  const [, redraw] = useState(0);
  const data: FilmPlayDataLike = useMemo(() => source.play(playId), [source, playId]);
  const play = useMemo(() => toFilmPlay(data.record), [data]);
  const theme = props.theme ?? 'light', vision = props.colourVision ?? 'none';
  const palette = useMemo(() => fieldPalette(theme, vision), [theme, vision]);
  const overlayColours = useMemo(() => resolveColours(theme, vision).overlay as Record<OverlayRole, string>, [theme, vision]);
  const colours = useMemo(() => resolveTeamColours(props.home, props.away, { colourBlindSafe: false, palette }), [props.home, props.away, palette]);
  const userSide = data.record.viewerSide ?? data.record.situation.offenseSide;
  const renderer = useMemo(() => new FieldRenderer(play, geometry, { mode: 'film', ...VIEW_FRAMING[view], userSide, colours, palette }), [play, geometry, colours, palette, userSide]);
  const transport = useMemo(() => new FilmTransport(renderer.frames, play.ticksPerSecond, play.events), [renderer, play]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => { renderer.setView(VIEW_FRAMING[view].orientation, VIEW_FRAMING[view].zoom); }, [renderer, view]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    renderer.resize(width, height, transport.tick);
    let raf = 0, prev = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - prev) / MS_PER_S, MAX_STEP_S);
      prev = now;
      const ended = transport.advance(dt);
      renderer.update(transport.tick, dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderer.draw(ctx);
      const shapes = buildOverlays(layers, {
        frames: renderer.frames, events: play.events, ticksPerSecond: play.ticksPerSecond,
        assignments: data.record.assignments, guesses: props.guesses?.(playId) ?? [], annotation: data.annotation,
        pathSlots: selected === null ? data.record.slots.map((s) => s.slot) : [selected], uptoTick: transport.tick,
      });
      drawOverlays(ctx, renderer.camera, shapes, overlayColours, OVERLAY_FONT_PX);
      // A reel moves to the next clip without a menu (N1.1.1).
      if (ended && reel.next()) setPlayId(reel.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [renderer, transport, width, height, layers, selected, data, overlayColours]);

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === ' ') transport.toggle();
    else if (k === 'ArrowRight' || k === 'ArrowLeft') { const d = k === 'ArrowRight' ? 1 : -1; if (e.shiftKey) transport.jump(d); else transport.step(d); renderer.reframe(transport.tick); }
    else if (k === 'ArrowDown') { if (reel.next()) setPlayId(reel.current); }
    else if (k === 'ArrowUp') { if (reel.previous()) setPlayId(reel.current); }
    else if (k === 'r' || k === 'R') { transport.rewind(); renderer.reframe(transport.tick); }
    else if (k === '1' || k === '2' || k === '3' || k === '4') transport.speedKey(Number(k) as 1 | 2 | 3 | 4);
    else if (k === 'l' || k === 'L') transport.loop = !transport.loop;
    else if (k === 'v' || k === 'V') setView(views.toggle(room));
    else if (OVERLAY_KEYS[k.toLowerCase()]) { const layer = OVERLAY_KEYS[k.toLowerCase()]!; setLayers((s) => { const n = new Set(s); if (n.has(layer)) n.delete(layer); else n.add(layer); return n; }); }
    else return;
    e.preventDefault();
    redraw((t) => t + 1);
  };

  const r = data.record, b = r.base;
  const span = Math.max(1, transport.last - transport.first);
  const own = r.viewerSide !== null;
  return (
    <div className="film-viewer" tabIndex={0} onKeyDown={onKey} aria-label="Film viewer" style={{ display: 'flex', gap: 12, outline: 'none' }}>
      <div style={{ flex: 2 }}>
        <canvas ref={canvasRef} style={{ width, height, display: 'block' }} data-testid="film-canvas" aria-label={`${VIEW_FRAMING[view].label} view`} />
        <div className="film-timeline" aria-label="Timeline" style={{ position: 'relative', height: 18, background: v('surface.raised'), width }}>
          {transport.markers.map((m) => (
            <button key={m.kind} title={m.kind} aria-label={`Jump to ${m.kind}`} onClick={() => { transport.jumpTo(m.kind); renderer.reframe(transport.tick); redraw((t) => t + 1); }}
              style={{ position: 'absolute', left: `${((m.tick - transport.first) / span) * 100}%`, width: 3, height: 18, padding: 0, border: 0, background: v('accent.default') }} />
          ))}
        </div>
        <input type="range" aria-label="Scrub" min={transport.first} max={transport.last} step={1} value={Math.round(transport.tick)} style={{ width }}
          onChange={(e) => { transport.seek(Number(e.target.value)); renderer.reframe(transport.tick); redraw((t) => t + 1); }} />
        <p className="gm-line">{VIEW_FRAMING[view].label} · speed {transport.speed}x{transport.loop ? ' · loop' : ''} · play {reel.position + 1} of {reel.playIds.length} · keys 1 to {FILM_SPEEDS.length} set speed</p>
      </div>
      <aside style={{ flex: 1, color: v('text.ink'), background: v('surface.panel'), padding: 8 }} aria-label="Play record">
        <h3>Q{b.quarter} {b.down ? `${b.down} and ${b.distance ?? '?'}` : b.playType} at the {Math.round(b.yardLine)}</h3>
        <p>Result: {b.result.replace(/_/g, ' ')}, {b.gainLoss} yd{r.epa === null ? '' : `, EPA ${r.epa.toFixed(2)}`}</p>
        <p>Formation {b.offFormation ?? 'unknown'}, personnel {r.coaching.values.personnel ?? 'not charted'}</p>
        <p>Coverage {r.coaching.values.coverage ?? 'not charted'} ({sourceWord(r.coaching.sources.coverage)}), front {r.coaching.values.front ?? 'not charted'}</p>
        {own && data.breakdown && data.breakdown.call && <p>Staff on the call: {data.breakdown.call}</p>}
        {data.breakdown && data.breakdown.outcome.visibleLuck.length > 0 && <p>Seen on film: {data.breakdown.outcome.visibleLuck.join(', ').replace(/_/g, ' ')}</p>}
        {data.responsibility && <p>Bust: {jerseyOf(r, data.responsibility.personId)}, {data.responsibility.cause} ({data.responsibility.by === 'user' ? 'your call' : 'position coach'})</p>}
        {data.annotation.note && <p>Note: {data.annotation.note}</p>}
        {(data.annotation.tags.length > 0 || data.annotation.causeTags.length > 0) && <p>Tags: {[...data.annotation.causeTags, ...data.annotation.tags].join(', ')}</p>}
        <label>Player <select value={selected ?? ''} onChange={(e) => setSelected(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">All paths</option>
          {r.slots.map((s) => <option key={s.slot} value={s.slot}>#{s.jersey} {s.role}</option>)}
        </select></label>
        {selected !== null && <p>{r.assignments.find((a) => a.slot === selected)?.words ?? (own ? 'No drawn assignment for this player' : 'Opponent: assignment not known from film')}</p>}
        <ul aria-label="Overlay legend">
          {OVERLAY_LAYERS.map((l) => <li key={l} style={{ opacity: layers.has(l) ? 1 : 0.5 }}>{LEGEND[l]}</li>)}
        </ul>
      </aside>
    </div>
  );
}

function sourceWord(s: string | undefined): string {
  return s === 'call' ? 'our call' : s === 'staff' ? 'staff chart' : s === 'user' ? 'your chart' : 'not charted';
}
function jerseyOf(r: FilmPlayDataLike['record'], personId: number | null): string {
  if (personId === null) return 'nobody (scheme)';
  const s = r.slots.find((x) => x.personId === personId);
  return s ? `#${s.jersey} ${s.role}` : 'unknown player';
}
