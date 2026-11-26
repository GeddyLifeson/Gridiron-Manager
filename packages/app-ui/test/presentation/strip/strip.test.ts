// PV-05 score strip: every plan 3.4 item is on the board in both looks, play clock lateness, noise meter
// source, high contrast falls back to plain, and no literal colour or mark sneaks into the strip.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { STRIP_ITEMS, Strip, stripLook, stripModel, noiseMeter, quarterLabel, type StripInput } from '../../../src/presentation/strip/index.ts';

const base: StripInput = {
  teams: [{ short: 'Harbor', primary: '#123456', secondary: '#abcdef' }, { short: 'Ridge', primary: '#654321', secondary: '#fedcba' }],
  possession: 1, quarter: 2, clock: '4:07', clockRunning: false, score: [10, 7], downDistance: '3rd & 7', spot: 'OWN 25',
  timeouts: [3, 1], timeoutsPerHalf: 3, playClockTenths: 214, live: false,
  noise: 0.72, noiseBase: 0.4, windMph: 12, gustMph: 18, windDirDeg: 90, indoors: false,
};

const render = (i: StripInput, look: 'classic' | 'plain') => renderToStaticMarkup(createElement(Strip, { model: stripModel(i), look }));

describe('strip model (plan 3.4)', () => {
  it('puts away on the left and home on the right with their scores, ball and timeouts', () => {
    const m = stripModel(base);
    expect(m.away).toMatchObject({ side: 1, name: 'RIDGE', score: 7, hasBall: true, timeoutsLeft: 1, timeoutsTotal: 3 });
    expect(m.home).toMatchObject({ side: 0, name: 'HARBOR', score: 10, hasBall: false, timeoutsLeft: 3 });
    expect(m.downDistance).toBe('3RD & 7');
    expect(m.spot).toBe('OWN 25');
  });
  it('rounds the play clock up and marks it late under 10 s, and hides it while the ball is live', () => {
    expect(stripModel(base).playClock).toEqual({ seconds: 22, under10: false });
    expect(stripModel({ ...base, playClockTenths: 99 }).playClock).toEqual({ seconds: 10, under10: true });
    expect(stripModel({ ...base, playClockTenths: 100 }).playClock?.under10).toBe(false);
    expect(stripModel({ ...base, live: true }).playClock).toBeNull();
  });
  it('labels quarters and overtime periods', () => {
    expect([1, 2, 3, 4, 5, 6].map(quarterLabel)).toEqual(['1ST', '2ND', '3RD', '4TH', 'OT', '2OT']);
  });
  it('reads the engine noise when present and says so when it falls back to the venue base', () => {
    expect(noiseMeter(0.72, 0.4)).toMatchObject({ lit: 7, source: 'engine' });
    const venue = noiseMeter(null, 0.4);
    expect(venue).toMatchObject({ lit: 4, source: 'venue' });
    expect(venue.label).toMatch(/not available/);
    expect(noiseMeter(1.4, 0).lit).toBe(10);
    expect(noiseMeter(-1, 0).lit).toBe(0);
  });
  it('shows wind with gusts, calm and indoors', () => {
    expect(stripModel(base).wind).toEqual({ text: 'WIND 12 G18', dirDeg: 90 });
    expect(stripModel({ ...base, windMph: 0.2 }).wind.text).toBe('WIND CALM');
    expect(stripModel({ ...base, indoors: true }).wind).toEqual({ text: 'INDOORS', dirDeg: null });
  });
  it('clamps timeouts to the per-half count passed from the rules', () => {
    expect(stripModel({ ...base, timeouts: [5, -1] }).home.timeoutsLeft).toBe(3);
    expect(stripModel({ ...base, timeouts: [5, -1] }).away.timeoutsLeft).toBe(0);
  });
  it('writes one summary sentence with every item for screen readers', () => {
    const s = stripModel(base).summary;
    for (const bit of ['RIDGE 7, ball', 'HARBOR 10', '2ND quarter 4:07', 'play clock 22', '3RD & 7', 'ball on OWN 25', 'timeouts RIDGE 1, HARBOR 3', 'Crowd noise 7 of 10', 'wind 12 g18']) expect(s).toContain(bit);
  });
});

describe('strip render', () => {
  for (const look of ['classic', 'plain'] as const) {
    it(`${look}: every 3.4 item is on the board`, () => {
      const html = render(base, look);
      for (const item of STRIP_ITEMS) expect(html, item).toContain(`data-item="${item}"`);
      expect(html).toContain('RIDGE');
      expect(html).toContain('4:07');
      expect(html).toContain(`data-look="${look}"`);
    });
    it(`${look}: items stay on the board with no possession, no play clock and no down`, () => {
      const html = render({ ...base, possession: null, playClockTenths: null, downDistance: null }, look);
      for (const item of STRIP_ITEMS) expect(html, item).toContain(`data-item="${item}"`);
    });
  }
  it('marks a late play clock with a box as well as colour', () => {
    const html = render({ ...base, playClockTenths: 50 }, 'classic');
    expect(html).toContain('data-late="true"');
    expect(html).toMatch(/data-late="true"[^>]*outline:[^;"]*solid/);
  });
  it('lights one lamp per timeout left and draws venue-base noise as hollow lamps', () => {
    const html = render({ ...base, noise: null }, 'classic');
    expect(html).toContain('data-noise-source="venue"');
    expect(html).toContain('NOISE BASE');
    const lit = (html.match(/data-lamp="on"/g) ?? []).length;
    expect(lit).toBe(1 + 3 + 4); // away timeouts + home timeouts + venue noise lamps
  });
  it('the possession triangle sits beside the team with the ball only', () => {
    const html = render(base, 'plain');
    expect((html.match(/data-ball="true"/g) ?? []).length).toBe(1);
  });
  it('high contrast always draws plain; other themes draw the chosen look', () => {
    expect(stripLook('high-contrast', 'classic')).toBe('plain');
    expect(stripLook('dark', 'classic')).toBe('classic');
    expect(stripLook('light', 'plain')).toBe('plain');
  });
});

describe('strip and banner sources (A6, O6.2.1)', () => {
  const dirs = ['strip', 'banners'].map((d) => join(__dirname, '../../../src/presentation', d));
  const files = dirs.flatMap((d) => readdirSync(d).map((f) => join(d, f)));
  it('carry no real league, broadcast or mark words', () => {
    const banned = /\bNFL\b|National Football League|\bNCAA\b|Fox Box|\bChyron\b|\bChiron\b|\bCBS\b|\bNBC\b|\bABC\b|\bESPN\b|Monday Night|NFL Films|Super Bowl|\bshield\b|\blogo\b/i;
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l));
      for (const l of lines) expect(banned.test(l), `${f}: ${l.trim()}`).toBe(false);
    }
  });
});
