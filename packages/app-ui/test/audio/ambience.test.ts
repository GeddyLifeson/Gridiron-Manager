import { describe, expect, it } from 'vitest';
import { AudioEngine, BUS_DEFAULTS, FakeAudioContext } from '../../src/audio/engine/index.ts';
import { AmbienceDriver, bedLevels, rainLevel, PERIOD_FACT_CLEARED, type AmbienceConditions } from '../../src/audio/ambience/index.ts';
import { toSoundDefs } from '../../src/audio/recipes/index.ts';

const open = (over: Partial<AmbienceConditions> = {}): AmbienceConditions => ({ windMph: 0, gustMph: 0, precip: 'none', roof: 'open', ...over });
const make = (on = true, gated = false) => {
  const ac = new FakeAudioContext();
  const engine = new AudioEngine(ac, { sounds: toSoundDefs({ includeGated: gated }), settings: { ambience: { volumePct: 100, on } } });
  return { ac, engine };
};

describe('ambience levels', () => {
  it('follows engine wind and precipitation, and a closed roof keeps the weather out', () => {
    expect(bedLevels(open()).wind).toBe(0);
    expect(bedLevels(open({ windMph: 30 })).wind).toBeCloseTo(1, 6);
    expect(bedLevels(open({ windMph: 15 })).wind).toBeGreaterThan(bedLevels(open({ windMph: 8 })).wind);
    expect(rainLevel('heavy_rain')).toBeGreaterThan(rainLevel('rain'));
    expect(rainLevel('rain')).toBeGreaterThan(rainLevel('light_rain'));
    expect(rainLevel('snow')).toBe(0);
    expect(bedLevels(open({ windMph: 30, precip: 'rain', roof: 'closed' }))).toEqual({ wind: 0, rain: 0 });
    expect(bedLevels(open({ windMph: 30, precip: 'rain', roof: 'fixed_dome' }))).toEqual({ wind: 0, rain: 0 });
  });
});

describe('ambience driver', () => {
  it('is silent under default settings: the ambience bus is off, no nodes', () => {
    const ac = new FakeAudioContext();
    const engine = new AudioEngine(ac, { sounds: toSoundDefs(), settings: BUS_DEFAULTS });
    expect(BUS_DEFAULTS.ambience.on).toBe(false);
    const d = new AmbienceDriver(engine);
    d.update(open({ windMph: 25, precip: 'rain' }));
    expect(ac.sources()).toHaveLength(0);
    expect(d.gust(open({ windMph: 10, gustMph: 30 }))).toBe(false);
    expect(d.stoppage('paChime')).toBe(false);
  });

  it('starts wind and rain beds, eases them, and stops them in calm dry air', () => {
    const { ac, engine } = make();
    const d = new AmbienceDriver(engine);
    d.update(open({ windMph: 20, precip: 'rain' }));
    const n = ac.sources().length;
    expect(n).toBeGreaterThan(0);
    d.update(open({ windMph: 25, precip: 'rain' }));
    expect(ac.sources()).toHaveLength(n); // eased, not restarted
    d.update(open());
    ac.advance(5);
    expect(ac.audibleAt(ac.currentTime)).toHaveLength(0);
  });

  it('plays a gust only when the engine gust is clearly above the wind, and never under a roof', () => {
    const { engine } = make();
    const d = new AmbienceDriver(engine);
    expect(d.gust(open({ windMph: 10, gustMph: 12 }))).toBe(false);
    expect(d.gust(open({ windMph: 10, gustMph: 25 }))).toBe(true);
    expect(d.gust(open({ windMph: 10, gustMph: 25, roof: 'closed' }))).toBe(false);
  });

  it('plays stings only in a stoppage', () => {
    const { engine } = make();
    const d = new AmbienceDriver(engine);
    d.setPlayLive(true);
    expect(d.stoppage('paChime')).toBe(false);
    d.setPlayLive(false);
    expect(d.stoppage('paChime')).toBe(true);
  });

  it('keeps the organ and band silent while the period fact is unverified', () => {
    expect(PERIOD_FACT_CLEARED).toBe(false);
    expect(toSoundDefs().some((s) => s.id === 'ambience.organSting' || s.id === 'ambience.bandHit')).toBe(false);
    const { engine } = make(true, true);
    const d = new AmbienceDriver(engine);
    expect(d.stoppage('organSting')).toBe(false);
    expect(d.stoppage('bandHit')).toBe(false);
    const cleared = new AmbienceDriver(make(true, true).engine, { periodFactCleared: true });
    expect(cleared.stoppage('organSting')).toBe(true);
  });
});
