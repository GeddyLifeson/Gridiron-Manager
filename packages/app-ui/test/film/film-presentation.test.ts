// PV-12 film room presentation: one speed table, holds, spotlight, title cards, as run against as drawn,
// staff guesses with a confidence word, the telestrator, the film look port and the film-only route rule.
// FIXTURE plays come from the field-view fixtures (made-up positions).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { decodeTrajectory, SPEEDS, FILM_STUDY_SPEEDS } from '../../src/field-view/index.ts';
import { fixturePlay } from '../field-view/fixtures.ts';
import {
  FilmTransport, FILM_SPEEDS, buildOverlays, OVERLAY_KEYS, OVERLAY_LAYERS, LEGEND,
  FreezeHolds, slotAt, spotlightCircle, drawSpotlight, SPOTLIGHT, titleCard, TitleCardTimer, TITLE_CARD_S, quarterWord,
  asRunMisses, AS_RUN_MIN_YD, guessLabel, Telestrator, screenToField, drawCommand, eraseCommand, TELE_MIN_YD,
  stockFor, lookActive, filmFrame, frameCounter, drawFrameCounter, drawPlainCard, TAPE_FROM_SEASON,
  type FilmRecordWireLike, type OverlayLineLike,
} from '../../src/screens/film/index.ts';

const play = fixturePlay();
const frames = decodeTrajectory(play.trajectory);
const tps = play.ticksPerSecond;
const snapTick = play.events.find((e) => e.kind === 'snap')!.tick;
const whistleTick = [...play.events].reverse().find((e) => e.kind === 'whistle')!.tick;

/** Records canvas calls; enough of Canvas2DLike for the presentation draws. */
function fakeCtx() {
  const calls: string[] = [];
  const pts: [number, number][] = [];
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'top', globalAlpha: 1,
    save: () => calls.push('save'), restore: () => calls.push('restore'), beginPath: () => calls.push('begin'), closePath: () => calls.push('close'),
    moveTo: (x: number, y: number) => { calls.push('move'); pts.push([x, y]); }, lineTo: (x: number, y: number) => { calls.push('line'); pts.push([x, y]); },
    arc: () => calls.push('arc'), fill: () => calls.push('fill'), stroke: () => calls.push('stroke'), fillRect: () => calls.push('rect'),
    fillText: (t: string) => calls.push(`text:${t}`), setLineDash: () => {}, translate: () => {}, rotate: () => {}, scale: () => {},
  };
  return { ctx: ctx as never, calls, pts };
}
const cam = { sx: (x: number, _y: number) => 10 * x + 5, sy: (_x: number, y: number) => 300 - 10 * y, scale: 10 };
// A quarter-turned camera (offense up), as G-03 uses for the end-zone view.
const camTurned = { sx: (_x: number, y: number) => 8 * y + 40, sy: (x: number, _y: number) => 500 - 8 * x, scale: 8 };

function record(o: Partial<FilmRecordWireLike> = {}, base: Partial<FilmRecordWireLike['base']> = {}): FilmRecordWireLike {
  return {
    playId: 'g1p7', gameId: 1, playNumber: 7, kind: 'game', teams: [1, 2], viewerSide: 0, ticksPerSecond: tps,
    trajectory: { formatVersion: 1, firstTick: 0, tickCount: 1, base64: '' }, slots: [], events: [],
    situation: { lineOfScrimmageX: 35, lineToGainX: 42, attackDir: 1, offenseSide: 0 },
    base: { quarter: 3, odk: 'O', down: 2, distance: 7, yardLine: 35, hash: 'left', gainLoss: 4, playType: 'pass', playDirection: 'left', result: 'complete', motionDirection: null, offFormation: 'Trips right', backfield: null, offStrength: null, series: 4, efficiency: null, ...base },
    coaching: { values: {}, sources: {} }, assignments: [], epa: 0.31, clockTenths: 4200, offenseMargin: 3, ...o,
  };
}

describe('one speed table (PV-12)', () => {
  it('the film transport and the G-03 film playback read the same table, quarter to double', () => {
    expect(FILM_SPEEDS).toBe(FILM_STUDY_SPEEDS);
    expect(SPEEDS.film).toBe(FILM_STUDY_SPEEDS);
    expect([...SPEEDS.film]).toEqual([0.25, 0.5, 1, 2]);
  });
  it('no slow speed reaches a live game or the sideline replay', () => {
    expect(SPEEDS.live.some((s) => s < 1)).toBe(false);
    expect([...SPEEDS.replay]).toEqual([1]);
  });
});

describe('freeze holds', () => {
  it('stops on a hold, resumes past it on the next play press, and removes it on a second toggle', () => {
    const t = new FilmTransport(frames, tps, play.events);
    const h = new FreezeHolds();
    const at = snapTick + 5;
    expect(h.toggle(at)).toBe(true);
    t.seek(snapTick); t.toggle();
    expect(h.advance(t, 10 / tps)).toBe(false);
    expect(t.tick).toBe(at);
    expect(t.playing).toBe(false);
    expect(h.frozenAt).toBe(at);
    t.toggle();
    h.advance(t, 2 / tps);
    expect(t.tick).toBeCloseTo(at + 2, 6);
    expect(h.frozenAt).toBe(null);
    expect(h.toggle(at)).toBe(false);
    expect(h.list).toEqual([]);
  });
  it('catches a hold on the loop pass from the whistle back to the snap', () => {
    const t = new FilmTransport(frames, tps, play.events);
    const h = new FreezeHolds();
    h.toggle(snapTick + 1);
    t.loop = true; t.seek(whistleTick - 0.5); t.toggle();
    h.advance(t, 3 / tps);
    expect(t.tick).toBe(snapTick + 1);
    expect(t.playing).toBe(false);
  });
  it('a paused film does not move', () => {
    const t = new FilmTransport(frames, tps, play.events);
    const h = new FreezeHolds();
    h.toggle(snapTick + 2);
    expect(h.advance(t, 1)).toBe(false);
    expect(t.tick).toBe(t.first);
  });
});

describe('spotlight', () => {
  it('the bright circle sits on the player at that tick, including between ticks', () => {
    const tick = snapTick + 3.5;
    const p = slotAt(frames, 0, tick);
    const c = spotlightCircle(frames, cam, 0, tick);
    expect(c.x).toBeCloseTo(cam.sx(p.x, p.y), 9);
    expect(c.y).toBeCloseTo(cam.sy(p.x, p.y), 9);
    expect(c.r).toBe(SPOTLIGHT.radiusYd * cam.scale);
    const a = slotAt(frames, 0, snapTick + 3), b = slotAt(frames, 0, snapTick + 4);
    expect(p.x).toBeCloseTo((a.x + b.x) / 2, 9);
  });
  it('dims with one filled path holding the frame and an opposite-wound hole, then rings the player', () => {
    const { ctx, calls, pts } = fakeCtx();
    drawSpotlight(ctx, 200, 100, { x: 50, y: 50, r: 10 }, { scrim: 'a', ring: 'b' });
    expect(calls.filter((c) => c === 'fill')).toHaveLength(1);
    expect(calls).toContain('arc');
    // Outer rectangle runs clockwise on screen (positive signed area with y down); the hole runs the other way.
    const area = (q: [number, number][]) => q.reduce((s, [x, y], i) => { const [x2, y2] = q[(i + 1) % q.length]!; return s + x * y2 - x2 * y; }, 0);
    expect(Math.sign(area(pts.slice(0, 4)))).toBe(-Math.sign(area(pts.slice(4))));
  });
});

describe('title cards', () => {
  it('names reel, quarter, down and distance, spot and formation in the leader style', () => {
    const c = titleCard(record(), 2, 9, 'good');
    expect(c.head).toBe('REEL 2  3RD QTR');
    expect(c.lines[0]).toBe('2ND & 7  BALL ON 35');
    expect(c.lines).toContain('TRIPS RIGHT');
    expect(c.lines).toContain('PLAY 2 OF 9');
    expect(c.spoken).toMatch(/^Clip 2 of 9, 3rd qtr/);
    expect(quarterWord(5)).toBe('OVERTIME');
  });
  it('shows the call only on our own film and never a grade, value or probability', () => {
    const own = titleCard(record(), 1, 1, 'Spider 2 Y Banana');
    expect(own.lines).toContain('CALL: SPIDER 2 Y BANANA');
    const opp = titleCard(record({ viewerSide: null }), 1, 1, 'Spider 2 Y Banana');
    expect(opp.lines.join(' ')).not.toMatch(/CALL/);
    for (const c of [own, opp]) expect([c.head, ...c.lines, c.spoken].join(' ')).not.toMatch(/%|EPA|grade|rating|probab/i);
  });
  it('goal to go and plays without a down read plainly', () => {
    expect(titleCard(record({}, { distance: 0, down: 1 }), 1, 1).lines[0]).toMatch(/^1ST & GOAL/);
    expect(titleCard(record({}, { down: null, playType: 'kick_off' }), 1, 1).lines[0]).toMatch(/^KICK OFF/);
  });
  it('holds each new clip for the card time, once, and a key skips it', () => {
    const t = new TitleCardTimer();
    t.clip('a', true);
    expect(t.tick(TITLE_CARD_S / 2)).toBe(true);
    expect(t.tick(TITLE_CARD_S)).toBe(false);
    t.clip('a', true);
    expect(t.showing).toBe(false);
    t.clip('b', true);
    expect(t.showing).toBe(true);
    t.skip();
    expect(t.showing).toBe(false);
    t.clip('c', false);
    expect(t.showing).toBe(false);
  });
  it('the plain card draws every line', () => {
    const { ctx, calls } = fakeCtx();
    const c = titleCard(record(), 1, 3);
    drawPlainCard(ctx, 300, 200, c, { panel: 'p', ink: 'i' }, 16);
    expect(calls.filter((x) => x.startsWith('text:'))).toEqual([c.head, ...c.lines].map((l) => `text:${l}`));
  });
});

describe('as run against as drawn', () => {
  /** A call line that follows slot 0's real path, shifted sideways by `off` yards. */
  function drawnFor(slot: number, off: number): OverlayLineLike {
    const pts = [];
    for (let t = snapTick; t <= whistleTick; t++) { const p = slotAt(frames, slot, t); pts.push({ x: p.x, y: p.y + off }); }
    return { slot, words: 'run the drawn route', points: pts, author: 'call' };
  }
  it('measures how far the run went off the drawn line', () => {
    const m = asRunMisses(frames, play.events, [drawnFor(0, 2.5)]);
    expect(m).toHaveLength(1);
    expect(m[0]!.offYd).toBeGreaterThan(2.4);
    expect(m[0]!.offYd).toBeLessThanOrEqual(2.5 + 1e-9);
    expect(m[0]!.tick).toBeGreaterThanOrEqual(snapTick);
    expect(m[0]!.tick).toBeLessThanOrEqual(whistleTick);
  });
  it('a run on the line is not marked, and guesses or opponent film give nothing', () => {
    expect(asRunMisses(frames, play.events, [drawnFor(0, 0)])).toEqual([]);
    expect(asRunMisses(frames, play.events, [drawnFor(0, AS_RUN_MIN_YD / 2)])).toEqual([]);
    expect(asRunMisses(frames, play.events, [{ ...drawnFor(0, 5), author: 'staff:2' }])).toEqual([]);
    const shapes = buildOverlays(new Set(['asRun']), { frames, events: play.events, ticksPerSecond: tps, assignments: [], guesses: [], annotation: null, pathSlots: [], uptoTick: whistleTick });
    expect(shapes).toEqual([]);
  });
  it('is its own overlay layer with a key and a legend line', () => {
    expect(OVERLAY_LAYERS).toContain('asRun');
    expect(OVERLAY_KEYS.x).toBe('asRun');
    expect(LEGEND.asRun).toMatch(/drawn line/);
    const shapes = buildOverlays(new Set(['asRun']), { frames, events: play.events, ticksPerSecond: tps, assignments: [drawnFor(0, 3)], guesses: [], annotation: null, pathSlots: [], uptoTick: whistleTick });
    expect(shapes.map((s) => s.kind)).toEqual(['line', 'text']);
    expect(shapes[1]!.label).toMatch(/^3\.0 yd off$/);
  });
});

describe('staff guesses carry a confidence word, never a number', () => {
  const pts = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
  it('adds the H2 word when the staff gave one', () => {
    expect(guessLabel({ slot: 1, words: 'Cover 3', points: pts, author: 'staff:3', confidence: 'fair' })).toBe('Cover 3 (staff guess, staff #3, fair read)');
    expect(guessLabel({ slot: 1, words: 'man', points: pts, author: 'user' })).toBe('man (your guess)');
  });
  it('drops anything that is not one of the words', () => {
    const l = guessLabel({ slot: 1, words: 'Cover 3', points: pts, author: 'staff:3', confidence: '0.72' });
    expect(l).not.toMatch(/0\.72|%|probab/);
  });
});

describe('telestrator', () => {
  it('screen to field inverts the camera, straight and quarter-turned', () => {
    for (const c of [cam, camTurned]) {
      const inv = screenToField(c);
      for (const [x, y] of [[0, 0], [37.5, 12.25], [110, 53.3]] as const) {
        const p = inv(c.sx(x, y), c.sy(x, y));
        expect(p.x).toBeCloseTo(x, 9); expect(p.y).toBeCloseTo(y, 9);
      }
    }
  });
  it('draws only with a tool and a stopped film; arrows and circles keep two points', () => {
    const t = new Telestrator();
    expect(t.begin({ x: 0, y: 0 }, true)).toBe(false);
    t.cycle(); t.cycle();
    expect(t.tool).toBe('arrow');
    expect(t.begin({ x: 0, y: 0 }, false)).toBe(false);
    expect(t.begin({ x: 0, y: 0 }, true)).toBe(true);
    t.move({ x: 1, y: 1 }); t.move({ x: 4, y: 3 });
    expect(t.end()).toEqual({ shape: 'arrow', points: [{ x: 0, y: 0 }, { x: 4, y: 3 }] });
    t.begin({ x: 0, y: 0 }, true); t.move({ x: TELE_MIN_YD / 4, y: 0 });
    expect(t.end()).toBe(null);
    t.cycle(); t.cycle();
    expect(t.tool).toBe(null);
  });
  it('a finished drawing is the G-63 FilmDraw command, so it saves with the play and its cut-ups', () => {
    const c = drawCommand('g1p7', { shape: 'circle', points: [{ x: 1, y: 2 }, { x: 3, y: 2 }] });
    expect(c).toEqual({ type: 'FilmDraw', payload: { playId: 'g1p7', shape: 'circle', points: [{ x: 1, y: 2 }, { x: 3, y: 2 }] } });
    expect(eraseCommand('g1p7', 0)).toEqual({ type: 'FilmEraseDrawing', payload: { playId: 'g1p7', index: 0 } });
    const cmds = readFileSync(join(import.meta.dirname, '../../../app-services/src/commands/film/index.ts'), 'utf8');
    expect(cmds).toMatch(/case 'FilmDraw':.*shape: p\.shape, points: p\.points/);
    expect(cmds).toMatch(/case 'FilmEraseDrawing':.*p\.index/);
  });
});

describe('film look (plan 2.1; PV-18 supplies grain through the port)', () => {
  it('16mm before 1986, videotape from 1986', () => {
    expect(TAPE_FROM_SEASON).toBe(1986);
    expect(stockFor(1985)).toBe('16mm');
    expect(stockFor(1986)).toBe('videotape');
    expect(stockFor(1920)).toBe('16mm');
  });
  it('grain and vignette are off under reduced motion, high contrast and plain film', () => {
    expect(lookActive({ reducedMotion: false, highContrast: false, plainFilm: false })).toBe(true);
    expect(lookActive({ reducedMotion: true, highContrast: false, plainFilm: false })).toBe(false);
    expect(lookActive({ reducedMotion: false, highContrast: true, plainFilm: false })).toBe(false);
    expect(lookActive({ reducedMotion: false, highContrast: false, plainFilm: true })).toBe(false);
  });
  it('frame counter: film frames at 24 a second, tape timecode at 30', () => {
    expect(filmFrame(10 + tps, 10, tps, '16mm')).toBe(24);
    expect(frameCounter(123, '16mm')).toBe('FR 00123');
    expect(frameCounter(30 * 64 + 3, 'videotape')).toBe('00:01:04:03');
    const { ctx, calls } = fakeCtx();
    drawFrameCounter(ctx, 300, 200, 'FR 00001', { panel: 'p', ink: 'i' }, 12);
    expect(calls).toContain('text:FR 00001');
  });
});

describe('film room only (route rule: none of this reaches the live field)', () => {
  const src = join(import.meta.dirname, '../../src');
  const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f) && statSync(join(src, f)).isFile());
  it('only the film screens, the package barrel and the route table import the film screens or their presentation', () => {
    for (const f of files) {
      const rel = relative(src, join(src, f)).replace(/\\/g, '/');
      // routes.ts binds each screen package's route factory to its id (P1.2.2); it mounts no film drawing on the live field.
      if (rel.startsWith('screens/film/') || rel === 'index.ts' || rel === 'routes.ts') continue;
      const text = readFileSync(join(src, f), 'utf8');
      expect(text, rel).not.toMatch(/screens\/film|film\/presentation/);
    }
  });
  it('the live field view and game screens use no film presentation names', () => {
    for (const f of files.filter((x) => /^(field-view|screens\/game-calling|screens\/game-frame)\//.test(x.replace(/\\/g, '/')))) {
      const text = readFileSync(join(src, f), 'utf8');
      expect(text, f).not.toMatch(/FreezeHolds|drawSpotlight|Telestrator|titleCard|asRunMisses|FilmLookPort/);
    }
  });
  it('the cue table keeps the film counter and projector film-only', () => {
    const table = JSON.parse(readFileSync(join(src, 'presentation/cues/cue-table.json'), 'utf8')) as { rows?: unknown[] } & Record<string, unknown>;
    const text = JSON.stringify(table);
    expect(text).toMatch(/"id":"film_projector"/);
    expect(text).toMatch(/"cue":"film_frame_counter","where":"film"/);
  });
});
