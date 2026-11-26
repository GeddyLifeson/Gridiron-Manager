// PV-07 sound recipes: coverage of plan section 4.2, levels at the loudness target, era and legal
// lines, and the recipes playing through the PV-06 engine.
import { describe, expect, it } from 'vitest';
import { AudioEngine, FakeAudioContext, MIX_BUSES, recipeSeconds } from '../../src/audio/engine/index.ts';
import {
  cadenceSoundId, contactSoundId, dbToGain, gustLevel, LOUDNESS_TARGET, loudestWindowRmsDb, peakDb, RECIPE_BY_ID, RECIPE_TRIMS,
  RECIPES, relaySoundId, renderRecipe, toSoundDefs, trimDb, windLevel,
} from '../../src/audio/recipes/index.ts';

/** Plan section 4.2, one entry per row (music is PV-11; a silent count has no sound). */
const SECTION_4_2: Record<string, string[]> = {
  'Crowd bed (and the pre-snap swell, which falls out of noise)': ['crowd.bed'],
  'Crowd reaction, ranked list (MB-7)': ['crowd.react.touchdown', 'crowd.react.turnover', 'crowd.react.bigGain', 'crowd.react.sack', 'crowd.react.flagAgainstHome', 'crowd.react.reviewReversal'],
  'Whistle: dead ball, foul stoppage, inadvertent': ['officials.whistle.deadBall', 'officials.whistle.stoppage', 'officials.whistle.inadvertent'],
  'Referee mic tone': ['officials.micTone'],
  'Snap cue': ['contact.snap'],
  'Contact by tier': ['contact.hit.tier1', 'contact.hit.tier2', 'contact.hit.tier3', 'contact.hit.tier4'],
  'Ball sounds': ['contact.ball.catch', 'contact.ball.drop', 'contact.ball.kickFoot', 'contact.ball.postHit'],
  'Cadence, hard count': ['cadence.voiced', 'cadence.hard'],
  'Call relay, clean and garbled': ['cadence.relay.clean', 'cadence.relay.garbled'],
  'Play clock tick': ['ui.playClockTick'],
  'Call confirm and hover tick': ['ui.callConfirm', 'ui.hoverTick'],
  'Alerts': ['ui.alert.injury', 'ui.alert.challengeWindow', 'ui.alert.timeout', 'ui.alert.twoMinute'],
  'Stadium ambience in stoppages': ['ambience.paChime', 'ambience.bandHit', 'ambience.organSting'],
  'Weather: rain, wind, gust': ['ambience.rain', 'ambience.wind', 'ambience.gust'],
  'Film room projector run (plan 2.1)': ['ambience.projector'],
};

/** Fixed-gain render at the trim only (mix level left out), as the loudness target is defined. */
function renderAtTrim(id: string, cents = 0): Float32Array {
  const r = RECIPE_BY_ID.get(id)!;
  return renderRecipe({ ...r.recipe, gain: dbToGain(trimDb(id)) }, { cents, sustained: r.bed === true });
}

describe('coverage of plan section 4.2', () => {
  it('every row has its recipes, and nothing else is in the table', () => {
    const wanted = Object.values(SECTION_4_2).flat();
    for (const id of wanted) expect(RECIPE_BY_ID.has(id), id).toBe(true);
    expect(RECIPES.map((r) => r.id).sort()).toEqual([...wanted].sort());
  });

  it('ids are unique and every recipe has a trim', () => {
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    for (const r of RECIPES) expect(typeof RECIPE_TRIMS[r.id], r.id).toBe('number');
    expect(Object.keys(RECIPE_TRIMS).sort()).toEqual(RECIPES.map((r) => r.id).sort());
  });

  it('every recipe names its information and era note, on a real mix bus', () => {
    for (const r of RECIPES) {
      expect(r.info.length, r.id).toBeGreaterThan(10);
      expect(r.era.length, r.id).toBeGreaterThan(10);
      expect(MIX_BUSES, r.id).toContain(r.bus);
      expect(r.recipe.layers.length, r.id).toBeGreaterThan(0);
    }
  });

  it('a silent count makes no sound; music is not a recipe', () => {
    expect(cadenceSoundId('silent')).toBeNull();
    expect(cadenceSoundId('voiced')).toBe('cadence.voiced');
    expect(cadenceSoundId('hard')).toBe('cadence.hard');
    expect(RECIPES.some((r) => r.bus === 'music')).toBe(false);
  });
});

describe('levels (loudness target is an Assumption, measured as unweighted RMS)', () => {
  for (const r of RECIPES) {
    const cents = r.recipe.variantsCents ?? [0];
    it(`${r.id}: every pitch variant sits at the target and under the peak ceiling`, () => {
      for (const c of cents) {
        const x = renderAtTrim(r.id, c);
        const rms = loudestWindowRmsDb(x);
        expect(Math.abs(rms - LOUDNESS_TARGET.rmsDb), `${r.id} at ${c} cents: ${rms.toFixed(2)} dB`).toBeLessThanOrEqual(LOUDNESS_TARGET.toleranceDb);
        expect(peakDb(x), `${r.id} at ${c} cents peak`).toBeLessThanOrEqual(LOUDNESS_TARGET.peakDb);
      }
    });
  }

  it('mix levels are never above the target, and engine gains stay within 0 to 1', () => {
    for (const r of RECIPES) expect(r.mixDb, r.id).toBeLessThanOrEqual(0);
    for (const d of toSoundDefs({ includeGated: true })) {
      expect(d.recipe.gain!, d.id).toBeGreaterThan(0);
      expect(d.recipe.gain!, d.id).toBeLessThanOrEqual(1);
    }
  });

  it('contact tiers get louder in the mix with each tier (MB-9)', () => {
    const levels = [1, 2, 3, 4].map((t) => RECIPE_BY_ID.get(contactSoundId(t))!.mixDb);
    for (let i = 1; i < levels.length; i++) expect(levels[i]!).toBeGreaterThan(levels[i - 1]!);
  });

  it('a hard count is louder in the mix than a normal call', () => {
    expect(RECIPE_BY_ID.get('cadence.hard')!.mixDb).toBeGreaterThan(RECIPE_BY_ID.get('cadence.voiced')!.mixDb);
  });

  it('renders are the same bytes every time (fixed-seed noise, no platform random)', () => {
    for (const id of ['crowd.bed', 'contact.hit.tier3', 'officials.whistle.deadBall']) {
      expect(renderAtTrim(id)).toEqual(renderAtTrim(id));
    }
  });

  it('the level checks themselves measure known signals right', () => {
    const sr = 48_000;
    const sine = new Float32Array(sr).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sr));
    expect(peakDb(sine)).toBeCloseTo(-6.02, 1);
    expect(loudestWindowRmsDb(sine)).toBeCloseTo(-9.03, 1); // 0.5 / sqrt(2)
    expect(loudestWindowRmsDb(new Float32Array(100))).toBe(-Infinity);
  });
});

describe('selectors for the drivers', () => {
  it('relay quality and contact tier map to sounds; a bad tier throws', () => {
    expect(relaySoundId('clean')).toBe('cadence.relay.clean');
    expect(relaySoundId('garbled')).toBe('cadence.relay.garbled');
    expect(contactSoundId(4)).toBe('contact.hit.tier4');
    expect(() => contactSoundId(5)).toThrow();
    expect(() => contactSoundId(0)).toThrow();
  });

  it('wind and gust levels are silent in calm air, rise with speed and cap at 1', () => {
    expect(windLevel(0)).toBe(0);
    expect(gustLevel(0)).toBe(0);
    let prev = 0;
    for (const mph of [1, 5, 10, 15, 20, 25, 30]) { const l = windLevel(mph); expect(l).toBeGreaterThan(prev); prev = l; }
    expect(windLevel(30)).toBe(1);
    expect(windLevel(60)).toBe(1);
    expect(gustLevel(45)).toBe(1);
    expect(gustLevel(20)).toBeLessThan(gustLevel(40));
  });
});

describe('era and legal lines (plan 2.1 and A6)', () => {
  it('the organ waits for the period fact, the band is cleared (F-presentation-era-0001), and both are off by default', () => {
    expect(RECIPE_BY_ID.get('ambience.organSting')!.gate).toBe('period-fact');
    expect(RECIPE_BY_ID.get('ambience.bandHit')!.gate).toBeUndefined();
    for (const id of ['ambience.organSting', 'ambience.bandHit']) expect(RECIPE_BY_ID.get(id)!.offByDefault, id).toBe(true);
    const playable = toSoundDefs().map((d) => d.id);
    expect(playable).not.toContain('ambience.organSting');
    expect(playable).toContain('ambience.bandHit');
    expect(toSoundDefs({ includeGated: true }).map((d) => d.id)).toContain('ambience.organSting');
  });

  it('optional sounds are off by default (O5.3.2): play clock tick, hover tick, stadium, projector', () => {
    for (const id of ['ui.playClockTick', 'ui.hoverTick', 'ambience.paChime', 'ambience.projector']) expect(RECIPE_BY_ID.get(id)!.offByDefault, id).toBe(true);
  });

  it('the whistle is a pea-whistle warble (pitch wobble on every blast)', () => {
    for (const id of ['officials.whistle.deadBall', 'officials.whistle.stoppage', 'officials.whistle.inadvertent']) {
      const tones = RECIPE_BY_ID.get(id)!.recipe.layers.filter((l) => l.source.kind === 'osc');
      expect(tones.length, id).toBeGreaterThan(0);
      for (const t of tones) expect(t.source.kind === 'osc' && (t.source.lfo?.depth ?? 0) > 0, id).toBe(true);
    }
  });

  it('no league, team, broadcast or film-company names in any recipe text', () => {
    const banned = /\bNFL\b|NFL Films|Super Bowl|Monday Night|\bCBS\b|\bNBC\b|\bABC\b|\bESPN\b|\bFox\b/i;
    for (const r of RECIPES) expect(`${r.info} ${r.era}`, r.id).not.toMatch(banned);
  });
});

describe('plays through the PV-06 engine', () => {
  it('every playable recipe registers and plays from its synthesized source', () => {
    const ctx = new FakeAudioContext();
    const engine = new AudioEngine(ctx, { sounds: toSoundDefs() });
    let t = 0;
    for (const d of toSoundDefs()) {
      if (RECIPE_BY_ID.get(d.id)!.bed) continue;
      t += 10;
      const out = engine.play(d.id, { when: t, variantDraw: 0.5 });
      expect(out.played, d.id).toBe(true);
      if (out.played) expect(out.endsAt - out.startsAt, d.id).toBeCloseTo(recipeSeconds(d.recipe), 6);
    }
  });

  it('beds start as held beds on their bus', () => {
    const ctx = new FakeAudioContext();
    const engine = new AudioEngine(ctx, { sounds: toSoundDefs() });
    for (const r of RECIPES.filter((x) => x.bed)) {
      const def = toSoundDefs().find((d) => d.id === r.id)!;
      const h = engine.startBed(r.id, { bus: def.bus as 'crowd' | 'ambience', recipe: def.recipe }, 1, 0.5);
      expect(h, r.id).toBeTruthy();
    }
  });

  it('contact tiers share one limiter, so a pile-up is one sound (MB-9)', () => {
    const ctx = new FakeAudioContext();
    const engine = new AudioEngine(ctx, { sounds: toSoundDefs() });
    expect(engine.play(contactSoundId(2), { when: 1 }).played).toBe(true);
    const second = engine.play(contactSoundId(4), { when: 1.05 });
    expect(second.played).toBe(false);
  });
});
