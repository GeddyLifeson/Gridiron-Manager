// PV-14: the no-flashing rule (plan section 7, A-6). The rule values are Verified against WCAG 2.2
// SC 2.3.1, ITU-R BT.1702-3 and Ofcom's flashing-images guidance (see src/presentation/flash/flash.ts).
import { describe, expect, it } from 'vitest';
import { FLASH_RULE, FlashGuard, MAX_CHANGES_PER_WINDOW, checkFlashes, isSaturatedRed, maxInWindow, type FlashSample } from '../../../src/presentation/flash/index.ts';
import { FieldRenderer, SPEEDS, fieldPalette, lastTick, relativeLuminance, resolveTeamColours, type Canvas2DLike, type FilmEvent } from '../../../src/field-view/index.ts';
import { THEME_IDS } from '../../../src/tokens/index.ts';
import { fixturePlay, PRO } from '../../field-view/fixtures.ts';

/** A square wave between two luminances at `hz`, sampled at 60 frames a second for `seconds`. */
function square(hz: number, lo: number, hi: number, seconds = 2, fps = 60): FlashSample[] {
  const out: FlashSample[] = [];
  for (let f = 0; f < seconds * fps; f++) {
    const tMs = (f * 1000) / fps;
    out.push({ tMs, lum: Math.floor((tMs / 1000) * hz * 2) % 2 === 0 ? lo : hi });
  }
  return out;
}

describe('flash rule values (Verified, 3 sources)', () => {
  it('holds the verified numbers and their sources', () => {
    expect(FLASH_RULE.maxFlashesPerSecond).toBe(3);
    expect(FLASH_RULE.windowMs).toBe(1000);
    expect(MAX_CHANGES_PER_WINDOW).toBe(6);
    expect(FLASH_RULE.minLuminanceChange).toBe(0.1);
    expect(FLASH_RULE.darkerBelow).toBe(0.8);
    expect(FLASH_RULE.saturatedRedRatio).toBe(0.8);
    expect(FLASH_RULE.status).toBe('Verified');
    expect(FLASH_RULE.sources).toHaveLength(3);
  });
});

describe('flash checker', () => {
  it('passes three flashes a second and fails four', () => {
    expect(checkFlashes(square(3, 0.05, 0.9)).ok).toBe(true);
    const four = checkFlashes(square(4, 0.05, 0.9));
    expect(four.ok).toBe(false);
    expect(four.maxFlashesPerSecond).toBe(4);
  });
  it('passes isolated single, double or triple flashes', () => {
    expect(checkFlashes(square(3, 0, 1, 1)).ok).toBe(true);
  });
  it('ignores changes under 10% of maximum relative luminance', () => {
    expect(checkFlashes(square(10, 0.3, 0.39)).ok).toBe(true);
    expect(checkFlashes(square(10, 0.3, 0.4)).ok).toBe(false);
  });
  it('ignores changes whose darker image is at or above 0.80', () => {
    expect(checkFlashes(square(10, 0.8, 1)).ok).toBe(true);
    expect(checkFlashes(square(10, 0.79, 1)).ok).toBe(false);
  });
  it('counts a slow ramp like a step', () => {
    const s: FlashSample[] = [];
    for (let f = 0; f < 120; f++) s.push({ tMs: f * (1000 / 60), lum: 0.5 + 0.4 * Math.sin((f / 60) * 2 * Math.PI * 5) });
    expect(checkFlashes(s).ok).toBe(false);
  });
  it('counts saturated red changes at any luminance', () => {
    expect(isSaturatedRed(255, 0, 0)).toBe(true);
    expect(isSaturatedRed(200, 30, 20)).toBe(true);
    expect(isSaturatedRed(200, 100, 0)).toBe(false);
    const red = square(5, 0.2, 0.2).map((x, i) => ({ ...x, red: Math.floor(i / 6) % 2 === 0 }));
    const r = checkFlashes(red);
    expect(r.maxChangesPerSecond).toBe(0);
    expect(r.ok).toBe(false);
  });
  it('counts changes in a half-open one-second window', () => {
    expect(maxInWindow([0, 999, 1000, 1999])).toBe(2);
    expect(maxInWindow([])).toBe(0);
  });
});

describe('flash guard (onset limiter)', () => {
  it('lets at most three onsets into any second, per key', () => {
    const g = new FlashGuard();
    const ok = [0, 100, 200, 300, 999, 1000, 1101].map((t) => g.allow('a', t));
    expect(ok).toEqual([true, true, true, false, false, true, true]);
    expect(g.allow('b', 300)).toBe(true);
    expect(g.nextAllowed('a', 1150)).toBe(1200);
  });
  it('a guarded strobe passes the checker', () => {
    const g = new FlashGuard();
    const s: FlashSample[] = [];
    let onUntil = -1;
    for (let f = 0; f < 600; f++) {
      const t = (f * 1000) / 60;
      if (f % 6 === 0 && t >= onUntil && g.allow('x', t)) onUntil = t + 50;
      s.push({ tMs: t, lum: t < onUntil ? 1 : 0 });
    }
    expect(checkFlashes(s).ok).toBe(true);
  });
});

/**
 * A 2D context that measures the luminance drawn at probe points: each fill or stroke in the field's
 * cue colour, whose last arc or move point is within `radiusPx` of a probe, lays its colour over the
 * turf at the current alpha. Markers and lines in other colours are not cues and are left out.
 */
class ProbeContext implements Canvas2DLike {
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
  lineWidth = 1; font = ''; textAlign: CanvasTextAlign = 'start'; textBaseline: CanvasTextBaseline = 'alphabetic'; globalAlpha = 1;
  private px = 0; private py = 0;
  readonly lum: number[];
  constructor(private readonly probes: { x: number; y: number }[], private readonly cue: string, private readonly turfLum: number, private readonly radiusPx: number) {
    this.lum = probes.map(() => turfLum);
  }
  frame(): void { this.lum.fill(this.turfLum); }
  private paint(style: unknown): void {
    if (String(style).toLowerCase() !== this.cue.toLowerCase()) return;
    const L = relativeLuminance(this.cue);
    this.probes.forEach((p, i) => {
      if (Math.hypot(p.x - this.px, p.y - this.py) <= this.radiusPx) this.lum[i] = this.lum[i]! * (1 - this.globalAlpha) + L * this.globalAlpha;
    });
  }
  save() {} restore() {} beginPath() {} closePath() {}
  moveTo(x: number, y: number) { this.px = x; this.py = y; }
  lineTo() {}
  arc(x: number, y: number) { this.px = x; this.py = y; }
  fill() { this.paint(this.fillStyle); }
  stroke() { this.paint(this.strokeStyle); }
  fillRect() {} fillText() {} setLineDash() {} translate() {} rotate() {} scale() {}
}

// Team colours that are not the cue colour, so markers never read as cues in the probe.
const colours = resolveTeamColours({ primary: '#7a1f1f', alternate: '#e0e0e0' }, { primary: '#1f3a7a', alternate: '#f0f0f0' });

/** Plays `events` on the fixture play at `speed`, 60 frames a second, and checks every event spot. */
function fieldFlashes(theme: (typeof THEME_IDS)[number], speed: number, events?: FilmEvent[]) {
  const base = fixturePlay();
  const play = events ? { ...base, events } : base;
  // The cue colour moved by one unit of blue so the probe can tell cues (and contact bars) from yard
  // lines and officials drawn in the same token colour. The luminance change is under 0.001.
  const base0 = fieldPalette(theme);
  const n = parseInt(base0.cue.slice(1), 16);
  const pal = { ...base0, cue: `#${((n & 0xff) > 0 ? n - 1 : n + 1).toString(16).padStart(6, '0')}` };
  const r = new FieldRenderer(play, PRO, { mode: 'film', orientation: 'offenseUp', zoom: 'wide', userSide: 0, colours, palette: pal });
  r.resize(1280, 720, 0);
  const f = r.frames;
  const tps = play.ticksPerSecond;
  const fps = 60;
  const spots = play.events.map((e) => ({ x: r.camera.sx(e.x, e.y), y: r.camera.sy(e.x, e.y) }));
  const ctx = new ProbeContext(spots, pal.cue, relativeLuminance(pal.turf), 40);
  const series: FlashSample[][] = spots.map(() => []);
  const ticks = lastTick(f) - f.firstTick;
  const frames = Math.ceil((ticks / tps / speed) * fps);
  for (let k = 0; k <= frames; k++) {
    const tMs = (k * 1000) / fps;
    r.update(f.firstTick + (tMs / 1000) * tps * speed, 1 / fps);
    ctx.frame();
    r.draw(ctx);
    ctx.lum.forEach((l, i) => series[i]!.push({ tMs, lum: l }));
  }
  return series.map((s) => checkFlashes(s));
}

describe('the field view never flashes more than three times a second (measured)', () => {
  const speeds = [...new Set([...SPEEDS.film, ...SPEEDS.live])];
  for (const theme of THEME_IDS) {
    it(`fixture play, ${theme} theme, every playback speed`, () => {
      for (const speed of speeds) {
        const reports = fieldFlashes(theme, speed);
        for (const rep of reports) expect(rep.ok, `${theme} x${speed}: ${rep.maxFlashesPerSecond} flashes`).toBe(true);
        // The probe sees the cues: at least one spot changes luminance (otherwise the test proves nothing).
        expect(reports.some((rep) => rep.changes.length > 0), `${theme} x${speed}`).toBe(true);
      }
    });
  }
});

describe('the field probe catches a strobe (so the measured test above can fail)', () => {
  it('fumble flashes at one spot every 0.5 s of engine time, at double speed, fail', () => {
    const base = fixturePlay();
    // A spot well behind the line, away from the contact bars of the engaged linemen.
    const snap = base.events[0]!;
    const spot = { x: snap.x - 20, y: snap.y + 15 };
    const strobe: FilmEvent[] = [];
    for (let t = 0; t < 30; t += 5) strobe.push({ kind: 'fumble', tick: t, x: spot.x, y: spot.y });
    const reports = fieldFlashes('light', 2, strobe);
    expect(reports.some((rep) => !rep.ok)).toBe(true);
  });
});
