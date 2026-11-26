// PV-03 field art pass (plans/presentation-build-plan.md 2.1, 3.1, section 8; MB-3, MB-4; O2.3.1, O2.3.5).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveRuleSet } from '@gm/rules-data';
import {
  FieldRenderer, buildMarkings, markingsFor, markingStatus, PRO_MARKINGS, COLLEGE_MARKINGS, resolveTeamColours, fieldPalette,
  contrastRatio, mixColour, param, lastTick, stills, blockText, blockWidth, blockCellCount, fillBlockText, BLOCK_CHARS, GLYPH_ROWS, ADVANCE_COLS,
  mergeNotes, layoutNotes, noteLabel, buildParticles, particleCount, wetTint, PRECIP_KINDS,
  type FieldNote, type PlacedNote, type RenderOptions, type FilmPlay, type Orientation, type Zoom, type CosmeticDraw, type FieldWeather,
} from '../../src/field-view/index.ts';
import { fixturePlay, PRO, COLLEGE, RecordingContext } from './fixtures.ts';

const colours = resolveTeamColours({ primary: '#ffffff', alternate: '#000000' }, { primary: '#101010', alternate: '#ffffff' });
const base: RenderOptions = { mode: 'film', orientation: 'offenseUp', zoom: 'wide', userSide: 0, colours };
const FT = 1 / 3;
const ZOOMS: readonly Zoom[] = ['wide', 'tight', 'full'];
const ORIENTS: readonly Orientation[] = ['offenseUp', 'teamUp', 'broadcast'];
const SIZES: readonly [number, number][] = [[1920, 1080], [960, 600], [480, 320]];

/** A FIXTURE stand-in for the cosmetic display stream: a seeded LCG, not a game stream. */
function fakeCosmetic(seed: number): CosmeticDraw & { draws: number } {
  let s = seed >>> 0;
  return { draws: 0, uniform() { this.draws++; s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; } };
}

describe('pro and college markings (Rule 1-2 of each book; CR-G03-3)', () => {
  it('places the yard numbers at the rule-set rows for both levels', () => {
    for (const [level, file] of [['pro', 'pro_2026'], ['college', 'college_2026']] as const) {
      const rules = resolveRuleSet(file), m = markingsFor(level);
      expect(m.numbersBottomFromSidelineYd, level).toBeCloseTo(rules.num('field.numbers_bottom_from_sideline_ft') * FT, 9);
      expect(m.numbersBottomFromSidelineYd + m.numeralLengthYd, level).toBeCloseTo(rules.num('field.numbers_top_from_sideline_ft') * FT, 9);
      const g = level === 'pro' ? PRO : COLLEGE;
      const mk = buildMarkings(g, m);
      expect(mk.numbers[0]!.y - mk.numeralLengthYd / 2).toBeCloseTo(m.numbersBottomFromSidelineYd, 9);
    }
  });
  it('draws college sideline ticks 4 in from the sideline and no try line (NCAA 1-2-1-b, j)', () => {
    const pro = buildMarkings(PRO, PRO_MARKINGS), col = buildMarkings(COLLEGE, COLLEGE_MARKINGS);
    const nearSouth = (t: Float64Array) => { let lo = Infinity; for (let i = 1; i < t.length; i += 4) lo = Math.min(lo, t[i]!, t[i + 2]!); return lo; };
    expect(nearSouth(col.ticks)).toBeCloseTo(4 / 12 * FT, 3);
    expect(nearSouth(pro.ticks)).toBeCloseTo(8 / 12 * FT, 3);
    // Pro has two try lines more than its hash, sideline and yard-tick count; college has none.
    const perYardTicks = (t: Float64Array) => t.length / 4;
    expect(perYardTicks(pro.ticks) - perYardTicks(col.ticks)).toBe(2);
    expect(COLLEGE_MARKINGS.tryLineFromGoalLineYd).toBeNull();
  });
  it('prints both sets PROVISIONAL and names what the text does not state', () => {
    expect(markingStatus(PRO_MARKINGS)).toBe('PROVISIONAL');
    expect(markingStatus(COLLEGE_MARKINGS)).toBe('PROVISIONAL');
    expect(PRO_MARKINGS.assumed).toContain('inboundsHashLengthFt');
    expect(COLLEGE_MARKINGS.assumed).toEqual(['yardLineEveryYd', 'hashEveryYd']);
  });
  it('the renderer takes the college set', () => {
    const r = new FieldRenderer(fixturePlay({ geometry: COLLEGE }), COLLEGE, { ...base, markings: COLLEGE_MARKINGS });
    r.resize(960, 600);
    expect(() => r.draw(new RecordingContext())).not.toThrow();
  });
});

describe('mowing stripes (plan 3.1)', () => {
  it('fills every other 5-yard band between the goal lines', () => {
    const mk = buildMarkings(PRO);
    expect(mk.stripes.length).toBe(10);
    for (const [x0, x1] of mk.stripes) { expect(x1 - x0).toBeCloseTo(5, 9); expect(x0).toBeGreaterThanOrEqual(PRO.goalLineWestX); expect(x1).toBeLessThanOrEqual(PRO.goalLineEastX); }
  });
  it('stays very low contrast against the turf and keeps the lines readable on it', () => {
    for (const theme of ['light', 'dark'] as const) {
      const pal = fieldPalette(theme), stripe = mixColour(pal.turf, pal.lines, param('stripeMix'));
      expect(contrastRatio(stripe, pal.turf), theme).toBeLessThan(1.25);
      expect(contrastRatio(stripe, pal.turf), theme).toBeGreaterThan(1.02);
      expect(contrastRatio(pal.lines, stripe), theme).toBeGreaterThanOrEqual(3);
    }
  });
  it('is off when the high-contrast theme turns it off', () => {
    const pal = fieldPalette('high-contrast'), stripe = mixColour(pal.turf, pal.lines, param('stripeMix'));
    const draw = (stripes: boolean) => {
      const r = new FieldRenderer(fixturePlay(), PRO, { ...base, palette: pal, stripes });
      r.resize(960, 600); const ctx = new RecordingContext(); r.draw(ctx); return ctx.fills.filter((f) => f === stripe).length;
    };
    expect(draw(true)).toBeGreaterThan(0);
    expect(draw(false)).toBe(0);
  });
});

describe('block stencil face (plan 2.1)', () => {
  it('covers digits, letters and name punctuation, and measures what it draws', () => {
    for (const ch of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-.\'& ') expect(BLOCK_CHARS).toContain(ch);
    expect(blockText('St. Louis #9')).toBe('ST. LOUIS  9');
    expect(blockWidth('50', GLYPH_ROWS)).toBe(2 * ADVANCE_COLS - 1);
    expect(blockWidth('', 10)).toBe(0);
  });
  it('gives each digit and letter its own shape', () => {
    const shape = (ch: string) => { const c = new RecordingContext(); fillBlockText(c, ch, GLYPH_ROWS * 10); return JSON.stringify(c.rects.map((q) => [Math.round(q.x), Math.round(q.y), Math.round(q.w)])); };
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    expect(new Set(chars.split('').map(shape)).size).toBe(chars.length);
  });
  it('paints the yard numbers as stencil cells, not system text', () => {
    const r = new FieldRenderer(fixturePlay(), PRO, { ...base, zoom: 'full' });
    r.resize(1920, 1080);
    const ctx = new RecordingContext(); r.draw(ctx);
    const pal = fieldPalette();
    const numberCells = ctx.rects.filter((q) => q.fill === pal.numbers).length;
    const expected = buildMarkings(PRO).numbers.reduce((n, y) => n + blockCellCount(y.text), 0);
    expect(numberCells).toBeGreaterThanOrEqual(expected);
    expect(ctx.texts.some((t) => /^(10|20|30|40|50)$/.test(t.text) && t.font.startsWith('bold') && Number(/\d+/.exec(t.font)![0]) > 30)).toBe(false);
  });
});

describe('end zone team names (plan 3.1, A6)', () => {
  it('paints each generated name in its side colour, with the line colour when the colour fails 3:1', () => {
    const pal = fieldPalette();
    const dark = resolveTeamColours({ primary: pal.endZone, alternate: pal.endZone }, { primary: '#ffffff', alternate: '#ffffff' });
    const c = { ...dark, sides: [pal.endZone, '#ffffff'] as [string, string] };
    const r = new FieldRenderer(fixturePlay({ losX: PRO.goalLineWestX + 5 }), PRO, { ...base, colours: c, zoom: 'full', endZones: { west: { text: 'HARBOR CITY', side: 0 }, east: { text: 'Plainsmen', side: 1 } } });
    r.resize(1920, 1080);
    const ctx = new RecordingContext(); r.draw(ctx);
    expect(ctx.rects.filter((q) => q.fill === '#ffffff').length).toBeGreaterThanOrEqual(blockCellCount('PLAINSMEN'));
    expect(ctx.rects.filter((q) => q.fill === pal.lines).length).toBeGreaterThanOrEqual(blockCellCount('HARBOR CITY'));
    expect(ctx.rects.some((q) => q.fill === pal.endZone)).toBe(false);
  });
  it('keeps the name inside the end zone with the 4 ft clearance at every orientation', () => {
    const mk = buildMarkings(PRO);
    for (const o of ORIENTS) {
      const r = new FieldRenderer(fixturePlay(), PRO, { ...base, orientation: o, zoom: 'full', endZones: { west: { text: 'NORTHFIELD MINERS', side: 0 } } });
      r.resize(1920, 1080);
      const ctx = new RecordingContext(); r.draw(ctx);
      // Text cell sizes are bounded by the clear depth: height <= (10 yd - 2 x 4 ft) x the fraction.
      const maxH = (mk.endZones[0]![1] - mk.endZones[0]![0] - 2 * mk.endZoneClearYd) * param('endZoneTextFrac') * r.camera.scale;
      const pal = fieldPalette(), want = contrastRatio(colours.sides[0], pal.endZone) >= 3 ? colours.sides[0] : pal.lines;
      const numberCells = buildMarkings(PRO).numbers.reduce((n, y) => n + blockCellCount(y.text), 0);
      // Names are painted before the yard numbers (same white in this theme).
      const all = ctx.rects.filter((q) => q.fill === want);
      expect(all.length).toBe(blockCellCount('NORTHFIELD MINERS') + numberCells);
      const cells = all.slice(0, blockCellCount('NORTHFIELD MINERS'));
      for (const q of cells) expect(q.h).toBeLessThanOrEqual(maxH / GLYPH_ROWS + 1e-9);
    }
  });
});

describe('aftermath beat (MB-3, O2.3.5)', () => {
  it('shows the dead-ball spot and gained line from the whistle to the end, and not before', () => {
    const play = fixturePlay();
    const r = new FieldRenderer(play, PRO, base);
    r.resize(960, 600);
    const whistle = play.events.find((e) => e.kind === 'whistle')!.tick;
    const f = r.frames;
    for (let t = f.firstTick; t <= lastTick(f) + 5; t++) {
      r.update(t, 1 / 60);
      const a = r.aftermathShown();
      if (t < whistle) expect(a, `tick ${t}`).toBeNull();
      else {
        expect(a, `tick ${t}`).not.toBeNull();
        const i = (whistle - f.firstTick);
        expect(a!.x).toBeCloseTo(f.ballX[i]!, 9);
        expect(a!.y).toBeCloseTo(f.ballY[i]!, 9);
      }
    }
  });
  it('keeps the line of scrimmage and line to gain with it until the next play is loaded', () => {
    const play = fixturePlay();
    const r = new FieldRenderer(play, PRO, base);
    r.resize(960, 600);
    r.update(lastTick(r.frames) + 100, 1 / 60);
    expect(r.aftermathShown()).not.toBeNull();
    expect(() => r.draw(new RecordingContext())).not.toThrow();
  });
  it('the whistle still of reduced motion shows it', () => {
    const play = fixturePlay();
    const r = new FieldRenderer(play, PRO, base);
    const w = stills(r.frames, play.events).find((s) => s.label === 'whistle')!;
    r.resize(400, 300, w.tick);
    expect(r.aftermathShown()).not.toBeNull();
  });
  it('a play with no whistle event uses the last stored tick', () => {
    const p = fixturePlay();
    const play: FilmPlay = { ...p, events: p.events.filter((e) => e.kind !== 'whistle') };
    const r = new FieldRenderer(play, PRO, base);
    r.resize(960, 600, lastTick(r.frames) - 1);
    expect(r.aftermathShown()).toBeNull();
    r.update(lastTick(r.frames), 0);
    expect(r.aftermathShown()!.fromTick).toBe(lastTick(r.frames));
  });
});

describe('field text (MB-4)', () => {
  it('merges repeats into one label with a count', () => {
    const notes: FieldNote[] = [{ text: 'FLAG', x: 30, y: 20, fromTick: 5 }, { text: 'flag', x: 40, y: 10, fromTick: 9 }, { text: 'UNDER REVIEW', x: 30, y: 20 }];
    expect(mergeNotes(notes, 4).map(noteLabel)).toEqual(['UNDER REVIEW']);
    expect(mergeNotes(notes, 6).map(noteLabel)).toEqual(['UNDER REVIEW', 'FLAG']);
    const m = mergeNotes(notes, 9);
    expect(m.map(noteLabel)).toEqual(['UNDER REVIEW', 'FLAG X2']);
    expect(m[1]!.x).toBe(30);
  });
  it('adds FLAG for each flag event from its tick', () => {
    const play = fixturePlay();
    const p2: FilmPlay = { ...play, events: [...play.events, { kind: 'flag', tick: 28, x: play.situation.lineOfScrimmageX, y: 10 }] };
    const r = new FieldRenderer(p2, PRO, base);
    r.resize(960, 600, 19); const ctx = new RecordingContext();
    r.draw(ctx); expect(r.notesPlaced().map((b) => b.text)).toEqual([]);
    r.update(20, 0); r.draw(ctx); expect(r.notesPlaced().map((b) => b.text)).toEqual(['FLAG']);
    r.update(30, 0); r.draw(ctx); expect(r.notesPlaced().map((b) => b.text)).toEqual(['FLAG X2']);
  });
  it('is one pixel size at every zoom, orientation and view size, and never stacks', () => {
    const play = fixturePlay();
    const los = play.situation.lineOfScrimmageX;
    // Clustered notes at nearly the same spot: the hardest case for stacking.
    const notes: FieldNote[] = [
      { text: '+7', x: los + 7, y: 20 }, { text: 'UNDER REVIEW', x: los + 7.2, y: 20.1 }, { text: '1ST DOWN', x: los + 7, y: 19.8 },
      { text: 'FUMBLE', x: los + 6.8, y: 20.3 }, { text: 'SAFETY', x: los + 7.1, y: 20 },
    ];
    const heights = new Set<number>();
    for (const zoom of ZOOMS) for (const orientation of ORIENTS) for (const [w, h] of SIZES) {
      const r = new FieldRenderer(play, PRO, { ...base, zoom, orientation, notes });
      r.resize(w, h, 30);
      r.draw(new RecordingContext());
      const boxes = r.notesPlaced();
      expect(boxes.length).toBe(6); // five notes and the fixture's flag
      for (const b of boxes) heights.add(Math.round(b.h * 1000));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        const apart = Math.abs(a.cx - b.cx) * 2 >= a.w + b.w || Math.abs(a.cy - b.cy) * 2 >= a.h + b.h;
        expect(apart, `${zoom} ${orientation} ${w}x${h}: ${a.text} / ${b.text}`).toBe(true);
      }
    }
    expect(heights.size).toBe(1);
  });
  it('layout clears avoid boxes too', () => {
    const avoid: PlacedNote[] = [{ text: 'strip', cx: 100, cy: 80, w: 400, h: 40 }];
    const out = layoutNotes(mergeNotes([{ text: 'FLAG', x: 0, y: 0 }], 0), () => ({ x: 100, y: 100 }), 16, 3, avoid);
    expect(Math.abs(out[0]!.cy - 80) * 2).toBeGreaterThanOrEqual(out[0]!.h + 40);
  });
});

describe('weather layer (plan 3.1, J12, section 6)', () => {
  const rain: FieldWeather = { precip: 'rain', windMph: 15, windDirDeg: 90 };
  it('draws the particle spots only from the cosmetic stream, the same for the same stream', () => {
    const a = buildParticles(rain, fakeCosmetic(7))!, b = buildParticles(rain, fakeCosmetic(7))!, c = buildParticles(rain, fakeCosmetic(8))!;
    expect(Array.from(a.u)).toEqual(Array.from(b.u));
    expect(Array.from(a.u)).not.toEqual(Array.from(c.u));
    expect(a.u.length).toBe(particleCount('rain'));
    expect(buildParticles(rain, undefined)).toBeNull();
    expect(buildParticles({ ...rain, roof: 'fixed_dome' }, fakeCosmetic(7))).toBeNull();
    expect(buildParticles({ ...rain, precip: 'none' }, fakeCosmetic(7))).toBeNull();
    expect(buildParticles({ ...rain, precip: 'heavy_snow' }, fakeCosmetic(7))!.kind).toBe('snow');
  });
  it('scales with the precipitation and tints only a wet, open field', () => {
    expect(particleCount('none')).toBe(0);
    expect(particleCount('light_rain')).toBeLessThan(particleCount('rain'));
    expect(particleCount('rain')).toBeLessThan(particleCount('heavy_rain'));
    expect(particleCount('snow')).toBeLessThan(particleCount('heavy_snow'));
    for (const p of PRECIP_KINDS) expect(wetTint({ precip: p, windMph: 0, windDirDeg: 0, roof: 'closed' })).toBe(0);
    expect(wetTint({ precip: 'none', windMph: 0, windDirDeg: 0 })).toBe(0);
    expect(wetTint({ precip: 'heavy_rain', windMph: 0, windDirDeg: 0 })).toBeGreaterThan(wetTint({ precip: 'light_rain', windMph: 0, windDirDeg: 0 }));
  });
  it('never moves a marker or the ball, and a replayed play shows the same rain', () => {
    const play = fixturePlay();
    const dry = new FieldRenderer(play, PRO, base), wet = new FieldRenderer(play, PRO, { ...base, weather: rain, cosmetic: fakeCosmetic(3) });
    const again = new FieldRenderer(play, PRO, { ...base, weather: rain, cosmetic: fakeCosmetic(3) });
    for (const r of [dry, wet, again]) r.resize(960, 600);
    const f = dry.frames;
    for (let t = f.firstTick; t <= lastTick(f); t++) {
      const ctxs = [dry, wet, again].map((r) => { r.update(t, 1 / 60); const c = new RecordingContext(); r.draw(c); return c; });
      for (let s = 0; s < 22; s++) expect(wet.markerScreen(s)).toEqual(dry.markerScreen(s));
      expect(ctxs[1]!.arcs).toEqual(ctxs[0]!.arcs);
      expect(ctxs[2]!.calls).toBe(ctxs[1]!.calls);
    }
    expect(Array.from(wet.weatherParticles()!.v)).toEqual(Array.from(again.weatherParticles()!.v));
  });
  it('holds still when play time holds still (paused or stepped film)', () => {
    const snow = new FieldRenderer(fixturePlay(), PRO, { ...base, weather: { precip: 'snow', windMph: 5, windDirDeg: 0 }, cosmetic: fakeCosmetic(1) });
    snow.resize(960, 600, 10);
    const a = new RecordingContext(), b = new RecordingContext();
    snow.draw(a); snow.update(10, 0.5); snow.draw(b);
    expect(b.rects).toEqual(a.rects);
  });
  it('the particle switch removes the particles and keeps the wet tint', () => {
    const r = new FieldRenderer(fixturePlay(), PRO, { ...base, weather: { precip: 'heavy_snow', windMph: 0, windDirDeg: 0 }, cosmetic: fakeCosmetic(1), weatherParticles: false });
    r.resize(960, 600, 10);
    const ctx = new RecordingContext(); r.draw(ctx);
    expect(ctx.rects.filter((q) => q.w === 3 && q.h === 3).length).toBe(0);
  });
});

describe('purity of the field view (plan section 6)', () => {
  it('uses no platform random and no wall clock in the drawing files', () => {
    const dir = join(__dirname, '../../src/field-view');
    for (const f of readdirSync(dir).filter((x) => /\.ts$/.test(x))) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|crypto\.getRandomValues|Date\.now|performance\.now/);
    }
  });
});

describe('frame budget with the art on (P6.2, CPU side only)', () => {
  it('still builds and draws a frame well inside 60 fps with stripes, names, notes and heavy rain', () => {
    const play = fixturePlay();
    const r = new FieldRenderer(play, PRO, {
      ...base, zoom: 'full', weather: { precip: 'heavy_rain', windMph: 20, windDirDeg: 45 }, cosmetic: fakeCosmetic(9),
      endZones: { west: { text: 'HARBOR CITY MARINERS', side: 0 }, east: { text: 'PLAINSMEN', side: 1 } },
      notes: [{ text: '+7', x: play.situation.lineOfScrimmageX + 7, y: 20 }, { text: 'UNDER REVIEW', x: play.situation.lineOfScrimmageX, y: 20 }],
    });
    r.resize(1920, 1080);
    const ctx = new RecordingContext(); ctx.record = false;
    const f = r.frames, frames = 2000;
    for (let i = 0; i < 200; i++) { r.update(f.firstTick + (i % f.tickCount), 1 / 60); r.draw(ctx); }
    ctx.calls = 0;
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) { r.update(f.firstTick + ((i / 6) % f.tickCount), 1 / 60); r.draw(ctx); }
    const ms = (performance.now() - t0) / frames;
    console.log(`field art frame: ${ms.toFixed(3)} ms per frame, ${ctx.calls / frames} context calls per frame`);
    expect(ms).toBeLessThan(16.7 / 4);
  });
});

describe('Classic theme turf by venue surface (PV-18 field-surfaces.json, plan 2.1)', () => {
  it('Classic paints the period artificial turf or grass by surface; plain themes ignore the surface', async () => {
    const { fieldPalette, fieldSurfaceFor } = await import('../../src/field-view/index.ts');
    const { SURFACE_COLOURS } = await import('../../src/presentation/era/index.ts');
    const art = fieldPalette('classic', 'none', 'artificial'), grass = fieldPalette('classic', 'none', 'grass');
    expect([art.turf, art.endZone, art.surround]).toEqual([SURFACE_COLOURS.artificial.turf, SURFACE_COLOURS.artificial.endZone, SURFACE_COLOURS.artificial.surround]);
    expect(grass.turf).toBe(SURFACE_COLOURS.grass.turf);
    expect(fieldPalette('dark', 'none', 'artificial').turf).toBe(fieldPalette('dark', 'none', 'grass').turf);
    expect(fieldSurfaceFor('artificial')).toBe('artificial');
    expect(fieldSurfaceFor('natural')).toBe('grass');
    expect(fieldSurfaceFor(undefined)).toBe('grass');
  });
});
