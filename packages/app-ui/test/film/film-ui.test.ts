// G-63 film screens: transport, views, overlays, wire and the truth audit. FIXTURE plays come from the
// field-view fixtures (made-up positions).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodeTrajectory } from '../../src/field-view/index.ts';
import { fixturePlay } from '../field-view/fixtures.ts';
import { FilmTransport, ReelCursor, markers, FILM_SPEEDS, ViewMemory, VIEW_FRAMING, buildOverlays, OVERLAY_LAYERS, fromBase64, toFilmPlay, type OverlayLayer } from '../../src/screens/film/index.ts';

const play = fixturePlay();
const frames = decodeTrajectory(play.trajectory);
const all = new Set<OverlayLayer>(OVERLAY_LAYERS);

describe('film transport (O2.6.1)', () => {
  it('stepping forward N then back N returns to the same frame', () => {
    const t = new FilmTransport(frames, play.ticksPerSecond, play.events);
    t.seek(t.first + 3);
    const start = t.tick;
    for (let i = 0; i < 7; i++) t.step(1);
    for (let i = 0; i < 7; i++) t.step(-1);
    expect(t.tick).toBe(start);
  });
  it('offers four speeds on keys 1 to 4 and refuses others', () => {
    const t = new FilmTransport(frames, play.ticksPerSecond, play.events);
    expect(FILM_SPEEDS).toEqual([0.25, 0.5, 1, 2]);
    t.speedKey(1); expect(t.speed).toBe(0.25);
    t.speedKey(4); expect(t.speed).toBe(2);
    expect(() => t.setSpeed(3)).toThrow();
  });
  it('plays at the chosen speed and stops at the end', () => {
    const t = new FilmTransport(frames, play.ticksPerSecond, play.events);
    t.speedKey(2); t.toggle();
    t.advance(1);
    expect(t.tick).toBeCloseTo(t.first + play.ticksPerSecond * 0.5, 6);
    expect(t.advance(1e6)).toBe(true);
    expect(t.tick).toBe(t.last);
    expect(t.playing).toBe(false);
  });
  it('loops from whistle back to the snap', () => {
    const t = new FilmTransport(frames, play.ticksPerSecond, play.events);
    const snap = t.markers.find((m) => m.kind === 'snap')!.tick, wh = t.markers.find((m) => m.kind === 'whistle')!.tick;
    t.loop = true; t.seek(wh - 0.5); t.toggle();
    expect(t.advance(1 / play.ticksPerSecond)).toBe(false);
    expect(t.tick).toBeGreaterThanOrEqual(snap);
    expect(t.tick).toBeLessThan(wh);
  });
  it('markers are in time order and jumps move between them', () => {
    const ms = markers(frames, play.events);
    expect(ms.map((m) => m.tick)).toEqual([...ms.map((m) => m.tick)].sort((a, b) => a - b));
    const t = new FilmTransport(frames, play.ticksPerSecond, play.events);
    t.rewind();
    t.jump(1);
    expect(ms.some((m) => m.tick === t.tick)).toBe(true);
    const at = t.tick;
    t.jump(-1);
    expect(t.tick).toBeLessThan(at);
  });
  it('reel cursor moves without passing either end', () => {
    const r = new ReelCursor(['a', 'b']);
    expect(r.previous()).toBe(false);
    expect(r.next()).toBe(true); expect(r.current).toBe('b');
    expect(r.next()).toBe(false);
    expect(() => new ReelCursor([])).toThrow();
  });
});

describe('film views (N1.1.1)', () => {
  it('opens on All-22 and remembers the choice per room', () => {
    const m = new ViewMemory();
    expect(m.get('ol')).toBe('all22');
    expect(m.toggle('ol')).toBe('endZone');
    expect(m.get('ol')).toBe('endZone');
    expect(m.get('db')).toBe('all22');
    expect(VIEW_FRAMING.all22.zoom).toBe('wide');
  });
});

describe('film overlays (N1.1.2)', () => {
  const base = { frames, events: play.events, ticksPerSecond: play.ticksPerSecond, annotation: null, pathSlots: [0], uptoTick: frames.firstTick + 5 };
  it('draws no assignment lines on opponent film', () => {
    const shapes = buildOverlays(all, { ...base, assignments: [], guesses: [] });
    expect(shapes.filter((s) => s.layer === 'assignments')).toEqual([]);
  });
  it('draws guesses dashed with their author, never as the call, and with no probability', () => {
    const pts = [{ x: 10, y: 10 }, { x: 15, y: 12 }];
    const shapes = buildOverlays(all, { ...base, assignments: [], guesses: [
      { slot: 12, words: 'deep half', points: pts, author: 'staff:7' },
      { slot: 13, words: 'man', points: pts, author: 'user' },
      { slot: 14, words: 'sneaky', points: pts, author: 'call' },
    ] });
    const g = shapes.filter((s) => s.layer === 'guesses');
    expect(g).toHaveLength(2);
    expect(g.every((s) => s.dashed)).toBe(true);
    expect(g[0]!.label).toContain('staff #7');
    expect(g[1]!.label).toContain('your guess');
    for (const s of shapes) expect(s.label ?? '').not.toMatch(/%|probab|confidence/i);
  });
  it('own calls draw solid with their words', () => {
    const shapes = buildOverlays(new Set(['assignments']), { ...base, assignments: [{ slot: 1, words: 'block the 3 technique', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], author: 'call' }], guesses: [] });
    expect(shapes).toEqual([expect.objectContaining({ dashed: false, label: 'block the 3 technique' })]);
  });
});

describe('film wire', () => {
  it('base64 decodes what Node encodes, and the record becomes a film play', () => {
    const bytes = play.trajectory.buffer;
    const b64 = Buffer.from(bytes).toString('base64');
    expect([...fromBase64(b64)]).toEqual([...bytes]);
    const fp = toFilmPlay({
      playId: 'g1p1', ticksPerSecond: play.ticksPerSecond,
      trajectory: { formatVersion: play.trajectory.formatVersion, firstTick: play.trajectory.firstTick, tickCount: play.trajectory.tickCount, base64: b64 },
      slots: play.slots.map((s) => ({ ...s, personId: 1 })), events: [...play.events], situation: { ...play.situation },
    } as never);
    expect(fp.visibility).toBe('user-visible');
    expect(decodeTrajectory(fp.trajectory).tickCount).toBe(frames.tickCount);
  });
});

describe('film screens hold no truth', () => {
  it('no truth symbol appears in the film screen source', () => {
    const dir = join(import.meta.dirname, '../../src/screens/film');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/PlayTruth|truthMark|trueBust|\.truth\b|@gm\/engine/);
    }
  });
});
