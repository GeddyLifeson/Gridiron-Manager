// PV-14: captions strip, visual twins for every engine sound, and the no-flashing limit on the strip.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RECIPES } from '../../../src/audio/recipes/recipes.ts';
import { CUE_TABLE, cueSound } from '../../../src/presentation/cues/cue-table.ts';
import { CAPTION_HOLD_MS, CaptionStrip, CaptionStripView, RECIPE_CUE_SOUND, allCaptions, captionForRow, captionForSound, captionsVisible, lineText } from '../../../src/presentation/captions/index.ts';
import { checkFlashes, type FlashSample } from '../../../src/presentation/flash/index.ts';

describe('every engine sound has a visual twin and a caption (O5.5.2)', () => {
  it('maps every PV-07 recipe to a cue-table sound on the same bus', () => {
    for (const r of RECIPES) {
      const id = RECIPE_CUE_SOUND[r.id];
      expect(id, r.id).toBeDefined();
      const s = cueSound(id!);
      expect(s, `${r.id} -> ${id}`).toBeDefined();
      expect(s!.bus, r.id).toBe(r.bus);
      expect(captionForSound(r.id), r.id).toBe(s!.caption);
    }
  });
  it('the map names no recipe that does not exist', () => {
    const ids = new Set(RECIPES.map((r) => r.id));
    for (const k of Object.keys(RECIPE_CUE_SOUND)) expect(ids.has(k), k).toBe(true);
  });
  it('the row of each mapped sound has a visual that is not switched by an audio setting', () => {
    for (const id of new Set(Object.values(RECIPE_CUE_SOUND))) {
      const row = CUE_TABLE.rows.find((r) => r.sounds.some((s) => s.id === id));
      expect(row, id).toBeDefined();
      expect(row!.visual.cue, id).toMatch(/^[a-z0-9_]+$/);
      // Turning a sound off must never take its visual twin away.
      expect(row!.visual.switch.startsWith('audio.'), `${row!.id} visual switch ${row!.visual.switch}`).toBe(false);
    }
  });
  it('no cue-table visual is switched by an audio setting', () => {
    for (const r of CUE_TABLE.rows) expect(r.visual.switch.startsWith('audio.'), r.id).toBe(false);
  });
});

describe('caption text', () => {
  it('names sounds by engine id or table id, and the silent count by its row', () => {
    expect(captionForSound('officials.whistle.deadBall')).toBe('whistle');
    expect(captionForSound('cadence.hard')).toBe('hard count');
    expect(captionForSound('whistle')).toBe('whistle');
    expect(captionForSound('no.such.sound')).toBeNull();
    expect(captionForRow('cadence_silent')).toBe('silent count');
  });
  it('lists each caption once', () => {
    const all = allCaptions();
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain('silent count');
  });
});

describe('when the strip shows', () => {
  it('auto shows it only when the player hears nothing', () => {
    expect(captionsVisible('auto', { masterOn: true, masterVolumePct: 100 })).toBe(false);
    expect(captionsVisible('auto', { masterOn: false, masterVolumePct: 100 })).toBe(true);
    expect(captionsVisible('auto', { masterOn: true, masterVolumePct: 0 })).toBe(true);
    expect(captionsVisible('on', { masterOn: true, masterVolumePct: 100 })).toBe(true);
    expect(captionsVisible('off', { masterOn: false, masterVolumePct: 0 })).toBe(false);
  });
});

describe('caption strip', () => {
  it('shows a line on the event time and drops it after the hold', () => {
    const s = new CaptionStrip();
    s.sound('officials.whistle.deadBall', 1000);
    expect(s.lines(1000).map(lineText)).toEqual(['whistle']);
    expect(s.lines(1000 + CAPTION_HOLD_MS)).toEqual([]);
  });
  it('folds repeats into one line with a count (a pile-up is one line)', () => {
    const s = new CaptionStrip();
    for (let t = 0; t < 500; t += 50) s.sound('contact.hit.tier3', t);
    const lines = s.lines(500);
    expect(lines).toHaveLength(1);
    expect(lineText(lines[0]!)).toBe('hard contact x10');
  });
  it('names a silent count', () => {
    const s = new CaptionStrip();
    expect(s.row('cadence_silent', 0)).toBe(true);
    expect(s.lines(0).map(lineText)).toEqual(['silent count']);
  });
  it('keeps at most three lines, newest last', () => {
    const s = new CaptionStrip();
    ['contact.snap', 'cadence.hard', 'officials.whistle.deadBall', 'crowd.react.touchdown'].forEach((id, i) => s.sound(id, i * 400));
    expect(s.lines(1600).map(lineText)).toEqual(['hard count', 'whistle', 'crowd cheers touchdown']);
  });
  it('never lets more than three lines appear in any second, and delays rather than drops within the hold', () => {
    const s = new CaptionStrip();
    const ids = ['contact.snap', 'cadence.hard', 'cadence.voiced', 'officials.whistle.deadBall', 'contact.ball.catch', 'crowd.react.bigGain'];
    ids.forEach((id, i) => s.sound(id, i * 50));
    const onsets: number[] = [];
    const seen = new Set<string>();
    for (let t = 0; t <= 3000; t += 10) for (const l of s.lines(t)) { const k = `${l.fromMs}|${l.text}`; if (!seen.has(k)) { seen.add(k); onsets.push(l.fromMs); } }
    expect(seen.size).toBe(ids.length);
    for (const t of onsets) expect(onsets.filter((u) => u >= t && u < t + 1000).length).toBeLessThanOrEqual(3);
  });
  it('the strip measured as a light region passes the flash checker under a burst of sounds', () => {
    const s = new CaptionStrip();
    const ids = RECIPES.map((r) => r.id);
    for (let i = 0; i < 200; i++) s.sound(ids[i % ids.length]!, i * 30);
    const samples: FlashSample[] = [];
    let last = '';
    let lum = 0.05;
    for (let t = 0; t <= 9000; t += 1000 / 60) {
      // Each change of the visible text is treated as a full-strength luminance swing (worst case).
      const now = s.lines(t).map((l) => `${l.fromMs}|${l.text}`).join(',');
      if (now !== last) { lum = lum === 0.05 ? 0.95 : 0.05; last = now; }
      samples.push({ tMs: t, lum });
    }
    expect(checkFlashes(samples).ok).toBe(true);
  });
  it('has no clock or randomness of its own: same input, same lines', () => {
    const run = () => { const s = new CaptionStrip(); ['contact.snap', 'cadence.hard', 'contact.snap'].forEach((id, i) => s.sound(id, i * 100)); return s.lines(300); };
    expect(run()).toEqual(run());
  });
});

describe('caption strip view', () => {
  it('is a polite live region and renders nothing when hidden', () => {
    const s = new CaptionStrip();
    s.sound('cadence.hard', 0);
    const html = renderToStaticMarkup(createElement(CaptionStripView, { lines: s.lines(0), visible: true }));
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('hard count');
    expect(renderToStaticMarkup(createElement(CaptionStripView, { lines: s.lines(0), visible: false }))).toBe('');
  });
});
