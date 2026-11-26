import { describe, expect, it } from 'vitest';
import { FieldRenderer, OverlaySourceError, resolveTeamColours, lastTick, type FilmPlay } from '../../src/field-view/index.ts';
import { fixturePlay, PRO, RecordingContext } from './fixtures.ts';

const colours = resolveTeamColours({ primary: '#ffffff', alternate: '#000000' }, { primary: '#101010', alternate: '#ffffff' });
const opts = { mode: 'live' as const, orientation: 'offenseUp' as const, zoom: 'wide' as const, userSide: 0 as const, colours };

describe('field renderer (I9.1, O2.3, O6.4.1)', () => {
  it('draws every marker at the stored position at each tick boundary', () => {
    const r = new FieldRenderer(fixturePlay(), PRO, opts);
    r.resize(1920, 1080);
    const f = r.frames;
    for (let t = f.firstTick; t <= lastTick(f); t++) {
      r.update(t, 0.1);
      for (let s = 0; s < 22; s++) {
        const i = (t - f.firstTick) * 22 + s;
        expect(r.markerWorld(s)).toEqual({ x: f.x[i], y: f.y[i] });
      }
    }
  });

  it('draws all 22 numbers, inside markers at the default view and as larger labels when markers are small', () => {
    const r = new FieldRenderer(fixturePlay(), PRO, opts);
    r.resize(1920, 1080, 0);
    const ctx = new RecordingContext();
    r.draw(ctx);
    const jerseys = new Set(fixturePlay().slots.map((s) => String(s.jersey)));
    const drawn = ctx.texts.filter((t) => jerseys.has(t.text) && !/^bold \d+px/.test(t.font) === false);
    expect(new Set(drawn.map((t) => t.text)).size).toBe(jerseys.size);
    expect(r.markerPx()).toBeGreaterThanOrEqual(14);
    const small = new FieldRenderer(fixturePlay(), PRO, { ...opts, zoom: 'full' });
    small.resize(400, 300, 0);
    expect(small.markerPx()).toBeLessThan(14);
    const ctx2 = new RecordingContext();
    small.draw(ctx2);
    const labels = ctx2.texts.filter((t) => jerseys.has(t.text));
    expect(labels.length).toBeGreaterThanOrEqual(22);
    expect(labels.every((t) => t.font.includes('14px'))).toBe(true);
  });

  it('shows a cue only while its event is on screen', () => {
    const play = fixturePlay();
    const r = new FieldRenderer(play, PRO, opts);
    r.resize(1280, 720);
    for (let t = r.frames.firstTick; t <= lastTick(r.frames); t += 1 / 6) {
      r.update(t, 1 / 60);
      for (const c of r.cuesShown()) {
        expect(play.events).toContain(c.event);
        expect(t).toBeGreaterThanOrEqual(c.event.tick);
      }
    }
  });

  it('refuses a play that is not tagged user-visible during a game (I9.3.2)', () => {
    const bad = { ...fixturePlay(), visibility: 'truth' } as unknown as FilmPlay;
    expect(() => new FieldRenderer(bad, PRO, opts)).toThrow(OverlaySourceError);
    expect(() => new FieldRenderer(bad, PRO, { ...opts, mode: 'replay' })).toThrow(OverlaySourceError);
  });

  it('receives positions, facings, movement, the ball, the roster and visible events only (O2.3.3, J1.6.2)', () => {
    const play = fixturePlay();
    expect(Object.keys(play).sort()).toEqual(['events', 'playId', 'situation', 'slots', 'ticksPerSecond', 'trajectory', 'visibility']);
    expect(Object.keys(play.slots[0]!).sort()).toEqual(['jersey', 'role', 'side', 'slot']);
    expect(Object.keys(play.situation).sort()).toEqual(['attackDir', 'lineOfScrimmageX', 'lineToGainX', 'offenseSide']);
    for (const e of play.events) for (const k of Object.keys(e)) expect(['kind', 'tick', 'x', 'y', 'slots']).toContain(k);
  });

  it('builds and draws a frame well inside the 60 fps budget (P6.2, O2.3.4 acceptance 2: CPU side only)', () => {
    const r = new FieldRenderer(fixturePlay(), PRO, opts);
    r.resize(1920, 1080);
    const ctx = new RecordingContext();
    ctx.record = false;
    const f = r.frames, frames = 2000;
    for (let i = 0; i < 200; i++) { r.update(f.firstTick + (i % f.tickCount), 1 / 60); r.draw(ctx); }
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) { r.update(f.firstTick + ((i / 6) % f.tickCount), 1 / 60); r.draw(ctx); }
    const msPerFrame = (performance.now() - t0) / frames;
    console.log(`field-view frame build and draw calls: ${msPerFrame.toFixed(3)} ms per frame, ${ctx.calls / frames} context calls per frame`);
    expect(msPerFrame).toBeLessThan(16.7 / 4);
  });
});
