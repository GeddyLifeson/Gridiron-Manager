// React wrapper of the field renderer (I9.1, I9.3.1, O2.3.4). Draws on a canvas at the display rate;
// display time is the only clock it reads. Keys: S skips to the result, R plays the one sideline
// replay (games), Escape stops the replay, Z changes zoom. In film and practice also Space pauses,
// the arrow keys step one tick, comma and period change speed, and a slider scrubs.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FieldRenderer, type RenderOptions, type EndZoneMark } from './renderer.ts';
import { markingsFor } from './markings.ts';
import type { FieldNote } from './fieldText.ts';
import type { CosmeticDraw, FieldWeather } from './weather.ts';
import type { CueSwitches, FieldContact, FieldKick } from './cues.ts';
import type { FieldSurface } from '../presentation/era/theme.ts';
import { Playback, ReplayAllowance, SPEEDS, stills } from './playback.ts';
import { resolveTeamColours, fieldPalette } from './colours.ts';
import type { ThemeId, ColourVisionId } from '../tokens/index.ts';
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
  /** Theme and colour-vision palette from the settings (O5); colours come from the token file. */
  readonly theme?: ThemeId;
  readonly colourVision?: ColourVisionId;
  /** The venue's playing surface. The Classic theme paints period artificial turf or grass by it (plan 2.1). */
  readonly surface?: FieldSurface;
  readonly showPositionLetters?: boolean;
  /** Level of play: picks the pro or college field markings (Rule 1-2 of each book). Default pro. */
  readonly level?: 'pro' | 'college';
  /** Generated team names painted in the end zones, by the side defending each one. */
  readonly endZones?: { readonly west?: EndZoneMark; readonly east?: EndZoneMark };
  /** Public field text for the play (result yards, "UNDER REVIEW"); flags add "FLAG" themselves. */
  readonly notes?: readonly FieldNote[];
  /** The engine's conditions for the play, from the presentation feed. */
  readonly weather?: FieldWeather;
  /** The play's cosmetic display stream: the only source of rain and snow spots. */
  readonly cosmetic?: CosmeticDraw;
  /** The feed's tiered contact cues; leave out when the feed lists `contactTier` as missing. */
  readonly contacts?: readonly FieldContact[];
  /** The feed's kick and post-hit cues (PV-00 `kick`, `postHit`). */
  readonly kicks?: readonly FieldKick[];
  /** Per-cue display switches from the settings, by cue-table key (MB-17). */
  readonly cueSwitches?: CueSwitches;
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
  const palette = useMemo(() => fieldPalette(props.theme ?? 'light', props.colourVision ?? 'none', props.surface ?? 'grass'), [props.theme, props.colourVision, props.surface]);
  const colours = useMemo(() => resolveTeamColours(props.home, props.away, { colourBlindSafe: !!props.colourBlindSafe, palette }), [props.home, props.away, props.colourBlindSafe, palette]);
  // Stripes and weather particles are texture: the high-contrast theme drops them (plan 3.1, O5.5.1).
  const plain = props.theme === 'high-contrast';
  const options: RenderOptions = {
    mode, orientation, zoom, userSide, colours, palette, showPositionLetters: !!props.showPositionLetters,
    markings: markingsFor(props.level ?? 'pro'), stripes: !plain, weatherParticles: !plain,
    ...(props.endZones ? { endZones: props.endZones } : {}), ...(props.notes ? { notes: props.notes } : {}),
    ...(props.weather ? { weather: props.weather } : {}), ...(props.cosmetic ? { cosmetic: props.cosmetic } : {}),
    ...(props.contacts ? { contacts: props.contacts } : {}), ...(props.kicks ? { kicks: props.kicks } : {}), ...(props.cueSwitches ? { cueSwitches: props.cueSwitches } : {}),
    speed: props.speed ?? 1,
  };
  const renderer = useMemo(() => new FieldRenderer(play, geometry, options),
    [play, geometry, colours, palette, mode, userSide, props.showPositionLetters, props.level, props.endZones, props.notes, props.weather, props.cosmetic, props.contacts, props.kicks, props.cueSwitches, plain]);
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
      renderer.setSpeed(rp.speed);
      props.onReplayed?.(play.playId);
    } else if (k === 'Escape' && pb.mode === 'replay') pb.stop();
    else if (study && k === ' ') { if (pb.playing) pb.pause(); else pb.play(); }
    else if (study && (k === 'ArrowRight' || k === 'ArrowLeft')) { pb.step(k === 'ArrowRight' ? 1 : -1); renderer.reframe(pb.tick); }
    else if (k === ',' || k === '.') {
      const list = SPEEDS[pb.mode]; const i = list.indexOf(pb.speed);
      const next = list[Math.min(list.length - 1, Math.max(0, i + (k === '.' ? 1 : -1)))]!;
      pb.setSpeed(next);
      renderer.setSpeed(next);
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
