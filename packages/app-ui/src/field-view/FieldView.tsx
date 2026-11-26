// React wrapper of the field renderer (I9.1, I9.3.1, O2.3.4). Draws on a canvas at the display rate;
// display time is the only clock it reads. Keys: S skips to the result, R plays the one sideline
// replay (games), Escape stops the replay, Z changes zoom. In film and practice also Space pauses,
// the arrow keys step one tick, comma and period change speed, and a slider scrubs.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FieldRenderer, type RenderOptions } from './renderer.ts';
import { Playback, ReplayAllowance, SPEEDS, stills } from './playback.ts';
import { resolveTeamColours } from './colours.ts';
import type { FieldGeometryLike, FilmPlay, FilmSide, Orientation, PlaybackMode, TeamColours, Zoom } from './types.ts';

export interface FieldViewProps {
  readonly play: FilmPlay;
  readonly geometry: FieldGeometryLike;
  readonly mode: Exclude<PlaybackMode, 'replay'>;
  readonly userSide: FilmSide;
  readonly home: TeamColours;
  readonly away: TeamColours;
  readonly orientation?: Orientation;
  readonly zoom?: Zoom;
  readonly speed?: number;
  readonly reducedMotion?: boolean;
  readonly colourBlindSafe?: boolean;
  readonly showPositionLetters?: boolean;
  /** Shared across plays of one game so only the last play can be replayed (I9.3.1). */
  readonly replays?: ReplayAllowance;
  readonly width?: number;
  readonly height?: number;
  /** "Playback finished": the call cycle's next display may begin (O2.3.4). */
  readonly onFinished?: () => void;
  /** A replay was used: the record gets a "replayed" mark (I9.3.1). */
  readonly onReplayed?: (playId: string) => void;
}

const ZOOMS: readonly Zoom[] = ['wide', 'tight', 'full'];
const MS_PER_S = 1000;
/** Longest display step fed to playback, so a stalled tab does not jump the play in one frame. */
const MAX_STEP_S = 0.25;

export function FieldView(props: FieldViewProps) {
  const { play, geometry, mode, userSide, width = 960, height = 600 } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState<Zoom>(props.zoom ?? 'wide');
  const [orientation] = useState<Orientation>(props.orientation ?? 'offenseUp');
  const [, setTick] = useState(0);
  const colours = useMemo(() => resolveTeamColours(props.home, props.away, { colourBlindSafe: !!props.colourBlindSafe }), [props.home, props.away, props.colourBlindSafe]);
  const options: RenderOptions = { mode, orientation, zoom, userSide, colours, showPositionLetters: !!props.showPositionLetters };
  const renderer = useMemo(() => new FieldRenderer(play, geometry, options), [play, geometry, colours, mode, userSide, props.showPositionLetters]);
  const replays = useMemo(() => props.replays ?? new ReplayAllowance(), [props.replays]);
  const pbRef = useRef<Playback | null>(null);

  useEffect(() => {
    const pb = new Playback(renderer.frames, play.ticksPerSecond, mode, props.speed ?? 1);
    pb.onFinished(() => props.onFinished?.());
    pbRef.current = pb;
    replays.newPlay(play.playId);
  }, [renderer]);

  useEffect(() => { renderer.setView(orientation, zoom); }, [renderer, orientation, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderer.resize(width, height, renderer.frames.firstTick);
    if (props.reducedMotion) {
      props.onFinished?.();
      return;
    }
    let raf = 0;
    let prev = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - prev) / MS_PER_S, MAX_STEP_S);
      prev = now;
      const pb = pbRef.current;
      if (pb) { pb.advance(dt); renderer.update(pb.tick, dt); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderer.draw(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [renderer, width, height, props.reducedMotion]);

  const study = mode === 'film' || mode === 'practice';
  const onKey = (e: React.KeyboardEvent) => {
    const pb = pbRef.current;
    if (!pb) return;
    const k = e.key;
    if (k === 's' || k === 'S') pb.skipToResult();
    else if ((k === 'z' || k === 'Z')) setZoom((z) => ZOOMS[(ZOOMS.indexOf(z) + 1) % ZOOMS.length]!);
    else if ((k === 'r' || k === 'R') && mode === 'live' && replays.canReplay(play.playId)) {
      const rp = replays.take(play.playId, renderer.frames, play.ticksPerSecond);
      renderer.reframe(renderer.frames.firstTick);
      pbRef.current = rp;
      props.onReplayed?.(play.playId);
    } else if (k === 'Escape' && pb.mode === 'replay') pb.stop();
    else if (study && k === ' ') { if (pb.playing) pb.pause(); else pb.play(); }
    else if (study && (k === 'ArrowRight' || k === 'ArrowLeft')) { pb.step(k === 'ArrowRight' ? 1 : -1); renderer.reframe(pb.tick); }
    else if (k === ',' || k === '.') {
      const list = SPEEDS[pb.mode]; const i = list.indexOf(pb.speed);
      const next = list[Math.min(list.length - 1, Math.max(0, i + (k === '.' ? 1 : -1)))]!;
      pb.setSpeed(next);
    } else return;
    e.preventDefault();
    setTick((t) => t + 1);
  };

  const f = renderer.frames;
  if (props.reducedMotion) return <StillsView renderer={renderer} play={play} width={width} height={height} />;
  return (
    <div className="field-view" tabIndex={0} onKeyDown={onKey} aria-label="Field view" style={{ outline: 'none', width }}>
      <canvas ref={canvasRef} style={{ width, height, display: 'block' }} data-testid="field-canvas" />
      {study && (
        <input
          type="range" aria-label="Scrub" min={f.firstTick} max={f.firstTick + f.tickCount - 1} step={1}
          value={Math.round(pbRef.current?.tick ?? f.firstTick)}
          onChange={(e) => { const pb = pbRef.current; if (pb) { pb.seek(Number(e.target.value)); renderer.reframe(pb.tick); setTick((t) => t + 1); } }}
          style={{ width: '100%' }}
        />
      )}
    </div>
  );
}

/** Reduced motion: three stills, snap, decisive moment and whistle, instead of playback (O2.3.4, O6.4.1). */
function StillsView({ renderer, play, width, height }: { renderer: FieldRenderer; play: FilmPlay; width: number; height: number }) {
  const refs = [useRef<HTMLCanvasElement | null>(null), useRef<HTMLCanvasElement | null>(null), useRef<HTMLCanvasElement | null>(null)];
  const shots = useMemo(() => stills(renderer.frames, play.events), [renderer, play]);
  const w = Math.floor(width / shots.length);
  useEffect(() => {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    shots.forEach((shot, i) => {
      const c = refs[i]?.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      c.width = Math.round(w * dpr); c.height = Math.round(height * dpr);
      renderer.resize(w, height, shot.tick);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderer.draw(ctx);
    });
  });
  return (
    <div className="field-view-stills" style={{ display: 'flex', gap: 0 }} aria-label="Field view stills">
      {shots.map((shot, i) => (
        <figure key={shot.label} style={{ margin: 0 }}>
          <canvas ref={refs[i]} style={{ width: w, height, display: 'block' }} />
          <figcaption style={{ textAlign: 'center' }}>{shot.label === 'snap' ? 'Snap' : shot.label === 'decisive' ? 'Decisive moment' : 'Whistle'}</figcaption>
        </figure>
      ))}
    </div>
  );
}
