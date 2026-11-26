import { describe, expect, it } from 'vitest';
import { FieldRenderer, resolveTeamColours, type Orientation, type Zoom } from '../../src/field-view/index.ts';
import { fixturePlay, FORMATIONS, PRO, COLLEGE } from './fixtures.ts';

const colours = resolveTeamColours({ primary: '#ffffff', alternate: '#000000' }, { primary: '#101010', alternate: '#ffffff' });
const ORIENTATIONS: Orientation[] = ['offenseUp', 'teamUp', 'broadcast'];
const ZOOMS: Zoom[] = ['wide', 'tight', 'full'];
/** P6.2.1 display, and a small window. */
const VIEWS: [number, number][] = [[1920, 1080], [1280, 720], [960, 600]];

function make(o: Parameters<typeof fixturePlay>[0] = {}, orientation: Orientation = 'offenseUp', zoom: Zoom = 'wide', w = 1920, h = 1080, userSide: 0 | 1 = 0) {
  const play = fixturePlay(o);
  const r = new FieldRenderer(play, o.geometry ?? PRO, { mode: 'film', orientation, zoom, userSide, colours });
  r.resize(w, h, r.frames.firstTick);
  return r;
}

describe('field geometry on screen (O2.3.1)', () => {
  it('draws hash to hash at 18.5 ft within one pixel, at every zoom and orientation', () => {
    for (const o of ORIENTATIONS) for (const z of ZOOMS) for (const [w, h] of VIEWS) {
      const r = make({}, o, z, w, h);
      const c = r.camera, x = PRO.goalLineWestX + 30;
      const d = Math.hypot(c.sx(x, PRO.hashNorthY) - c.sx(x, PRO.hashSouthY), c.sy(x, PRO.hashNorthY) - c.sy(x, PRO.hashSouthY));
      expect(Math.abs(d - (18.5 / 3) * c.scale)).toBeLessThanOrEqual(1);
      // One uniform scale: a yard along the field is as long as a yard across it.
      const along = Math.hypot(c.sx(x + 1, 20) - c.sx(x, 20), c.sy(x + 1, 20) - c.sy(x, 20));
      const across = Math.hypot(c.sx(x, 21) - c.sx(x, 20), c.sy(x, 21) - c.sy(x, 20));
      expect(along).toBeCloseTo(across, 9);
    }
  });

  it('puts a marker at a known coordinate on the right yard line and side in all three orientations', () => {
    const p = fixturePlay();
    for (const o of ORIENTATIONS) {
      const r = make({}, o);
      const c = r.camera;
      const los = p.situation.lineOfScrimmageX;
      const centre = r.markerScreen(0); // the centre, 0.5 yd behind the ball at the field centre
      const yardLine = { x: c.sx(los - 0.5, 0), y: c.sy(los - 0.5, 0) };
      if (o === 'broadcast') {
        expect(Math.abs(centre.x - yardLine.x)).toBeLessThanOrEqual(1);
        // North sideline is up the screen.
        expect(c.sy(los, PRO.widthYd)).toBeLessThan(c.sy(los, 0));
      } else {
        expect(Math.abs(centre.y - yardLine.y)).toBeLessThanOrEqual(1);
        // Offense attacks up the screen: downfield is smaller screen y.
        expect(c.sy(los + 10, 26)).toBeLessThan(c.sy(los, 26));
      }
    }
  });

  it('turns the field for an offense attacking west, and "my team up" follows the user on defense', () => {
    const west = make({ attackDir: -1, losX: PRO.goalLineEastX - 25 });
    expect(west.camera.sy(50, 26)).toBeLessThan(west.camera.sy(60, 26));
    const teamUpDefense = make({}, 'teamUp', 'wide', 1920, 1080, 1);
    // The user (side 1) is on defense attacking west: west is up.
    expect(teamUpDefense.camera.sy(30, 26)).toBeLessThan(teamUpDefense.camera.sy(40, 26));
  });

  it('starts college plays from the college hashes', () => {
    const p = make({ geometry: PRO, ballY: PRO.hashSouthY });
    const c = make({ geometry: COLLEGE, ballY: COLLEGE.hashSouthY });
    expect(p.markerWorld(0).y).not.toBeCloseTo(c.markerWorld(0).y, 2);
    expect(COLLEGE.hashNorthY - COLLEGE.hashSouthY).toBeCloseTo(40 / 3, 9);
  });
});

describe('framing (I9.1.1)', () => {
  it('keeps all 22 markers in frame at the snap at default zoom for every test formation and spot', () => {
    const spots = [PRO.goalLineWestX + 2, PRO.goalLineWestX + 25, PRO.lengthYd / 2, PRO.goalLineEastX - 3];
    for (const formation of FORMATIONS) for (const losX of spots) for (const dir of [1, -1] as const) for (const ballY of [PRO.hashSouthY, PRO.centreY, PRO.hashNorthY]) {
      for (const [w, h] of VIEWS) {
        const r = make({ formation, losX, attackDir: dir, ballY }, 'offenseUp', 'wide', w, h);
        // Play forward through the pre-snap phase to the snap, as playback does.
        for (let t = r.frames.firstTick; t <= 0; t++) r.update(t, 0.1);
        const half = r.markerPx() / 2;
        for (let s = 0; s < 22; s++) {
          const m = r.markerScreen(s);
          expect(m.x - half, `${formation.name} los ${losX} dir ${dir} slot ${s}`).toBeGreaterThanOrEqual(0);
          expect(m.y - half, `${formation.name} los ${losX} dir ${dir} y ${ballY} view ${w} slot ${s}`).toBeGreaterThanOrEqual(0);
          expect(m.x + half).toBeLessThanOrEqual(w);
          expect(m.y + half).toBeLessThanOrEqual(h);
        }
      }
    }
  });

  it('shows the end zone in full near a goal line', () => {
    const r = make({ losX: PRO.goalLineEastX - 3 });
    expect(r.camera.inView(PRO.lengthYd, PRO.centreY)).toBe(true);
  });

  it('frames the tackle box in the tight copy: 30 yd wide, 20 yd deep around the ball', () => {
    const r = make({}, 'offenseUp', 'tight', 1920, 1080);
    const c = r.camera;
    const visW = 1920 / c.scale, visH = 1080 / c.scale;
    expect(visW).toBeGreaterThanOrEqual(30 - 1e-9);
    expect(visH).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(Math.min(visW - 30, visH - 20)).toBeCloseTo(0, 9);
  });

  it('follows the ball and widens on a kick to keep the landing spot in frame, easing the scale', () => {
    const r = make({ kick: true, formation: FORMATIONS[5]!, losX: PRO.goalLineWestX + 30 });
    const s0 = r.camera.scale;
    const scales: number[] = [];
    for (let t = r.frames.firstTick; t <= r.frames.firstTick + r.frames.tickCount - 1; t += 1 / 6) { r.update(t, 1 / 60); scales.push(r.camera.scale); }
    expect(r.camera.scale).toBeLessThan(s0);
    expect(r.camera.inView(PRO.goalLineWestX + 75, PRO.centreY)).toBe(true);
    // No jump: each frame changes the scale by at most the share eased over 0.3 s.
    let maxStep = 0;
    for (let i = 1; i < scales.length; i++) maxStep = Math.max(maxStep, Math.abs(scales[i]! - scales[i - 1]!));
    expect(maxStep).toBeLessThanOrEqual((s0 - r.camera.scale) / (0.3 * 60) + 1e-9);
  });
});
