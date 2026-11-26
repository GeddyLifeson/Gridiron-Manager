// Every sound in plan section 4.2 as a synthesized recipe in the audio engine's format (PV-06), styled
// on 1970s and 1980s pro football (plan section 2.1). No samples, no real voices, no songs or chants,
// no league, team or broadcast sounds.
//
// Tone and timbre numbers (frequencies, rates, filters) are sound-design choices tuned for legibility.
// They are not facts about the period and carry no game information of their own. Each recipe's
// loudness trim is in `trims.json`, written by `scripts/audio/calibrate-recipes.ts`.
//
// Menu music is PV-11 (`../music/`), not a recipe here. A silent count makes no sound, so it has no
// recipe (`cadenceSoundId('silent')` returns null).

import type { Envelope, FilterSpec, RecipeLayer } from '../engine/types.ts';
import type { RecipeEntry } from './types.ts';

const env = (attack: number, hold: number, release: number): Envelope => ({ attack, hold, release });
const lp = (freq: number, q = 0): FilterSpec => ({ type: 'lowpass', freq, q });
const hp = (freq: number, q = 0): FilterSpec => ({ type: 'highpass', freq, q });
const bp = (freq: number, q: number, freqEnd?: number): FilterSpec => (freqEnd === undefined ? { type: 'bandpass', freq, q } : { type: 'bandpass', freq, q, freqEnd });
const noise = (colour: 'white' | 'pink' | 'brown', e: Envelope, gain: number, filter?: FilterSpec, offset?: number): RecipeLayer =>
  ({ source: { kind: 'noise', colour }, env: e, gain, ...(filter ? { filter } : {}), ...(offset ? { offset } : {}) });
const osc = (wave: 'sine' | 'square' | 'sawtooth' | 'triangle', freq: number, e: Envelope, gain: number, more: { freqEnd?: number; lfo?: { rate: number; depth: number }; filter?: FilterSpec; offset?: number } = {}): RecipeLayer => ({
  source: { kind: 'osc', wave, freq, ...(more.freqEnd !== undefined ? { freqEnd: more.freqEnd } : {}), ...(more.lfo ? { lfo: more.lfo } : {}) },
  env: e, gain, ...(more.filter ? { filter: more.filter } : {}), ...(more.offset ? { offset: more.offset } : {}),
});

/** Bed envelope for the one-shot render; the engine holds beds after the attack (`buildSustained`). */
const BED = env(0.25, 3.5, 0.25);
/** Five pitch variants, symmetric (MB-9: "a few pitch variants"). */
const variants = (c: number): number[] => [-c, -c / 2, 0, c / 2, c];

// ---- Crowd ---------------------------------------------------------------------------------------
// Period crowd: a wide murmur band rolled off above about 5 kHz, like a crowd heard through period
// stadium and broadcast audio.

const crowdBed: RecipeEntry = {
  id: 'crowd.bed', bus: 'crowd', phase: 'v1', bed: true,
  info: 'Crowd noise level. PV-08 sets the bed level to the engine noise value, so the sound is the meter (J12.6.1).',
  era: 'Band-limited murmur, like a period stadium crowd.',
  recipe: { layers: [noise('pink', BED, 1, bp(900, 0.5)), noise('brown', BED, 0.6, lp(5000))] },
  mixDb: 0,
};

function reaction(id: string, info: string, priority: number, s: { rise: number; hold: number; fall: number; band: number; q: number; roar: number }): RecipeEntry {
  return {
    id, bus: 'crowd', phase: 'v2', info, priority,
    era: 'A swell of the period crowd; no chants, words or songs.',
    recipe: {
      layers: [noise('pink', env(s.rise, s.hold, s.fall), 1, bp(s.band, s.q)), noise('white', env(s.rise * 1.2, s.hold, s.fall), s.roar, bp(s.band * 2.2, 0.8))],
      variantsCents: variants(60),
    },
    mixDb: -2, minGapMs: 1500, rateGroup: 'crowd.react',
  };
}

// Priority follows MB-7's ranked list: touchdown, turnover, review reversal, sack, flag against the
// home team, big gain.
const crowdReactions: RecipeEntry[] = [
  reaction('crowd.react.touchdown', 'The ruling on the field is a touchdown.', 60, { rise: 0.35, hold: 2.2, fall: 1.4, band: 1100, q: 0.6, roar: 0.5 }),
  reaction('crowd.react.turnover', 'The ruling on the field is a turnover.', 50, { rise: 0.2, hold: 1.6, fall: 1.2, band: 1200, q: 0.7, roar: 0.55 }),
  reaction('crowd.react.reviewReversal', 'A review reversed the ruling on the field.', 40, { rise: 0.15, hold: 1.2, fall: 1.0, band: 1000, q: 0.7, roar: 0.4 }),
  reaction('crowd.react.sack', 'The ruling on the field is a sack.', 30, { rise: 0.12, hold: 0.9, fall: 0.9, band: 1250, q: 0.8, roar: 0.45 }),
  // Disapproval: lower, narrower and slower than a cheer.
  reaction('crowd.react.flagAgainstHome', 'A flag went against the home team.', 20, { rise: 0.5, hold: 1.4, fall: 1.0, band: 380, q: 0.8, roar: 0.25 }),
  reaction('crowd.react.bigGain', 'The play gained a lot of ground.', 10, { rise: 0.4, hold: 1.0, fall: 1.0, band: 1050, q: 0.6, roar: 0.35 }),
];

// ---- Officials -----------------------------------------------------------------------------------
// Pea whistle (plan 2.1: pea whistles before the pealess design first used professionally in 1987).
// The pea rattling in the chamber gives the trill: a fast pitch warble on a high tone, plus breath.

function peaWhistle(id: string, info: string, blasts: { at: number; len: number }[]): RecipeEntry {
  const layers: RecipeLayer[] = [];
  for (const b of blasts) {
    const e = env(0.012, b.len, 0.04);
    layers.push(osc('sine', 3150, e, 0.8, { lfo: { rate: 28, depth: 90 }, offset: b.at }));
    layers.push(osc('sine', 6300, e, 0.12, { lfo: { rate: 28, depth: 90 }, offset: b.at }));
    layers.push(noise('white', e, 0.3, bp(3150, 4), b.at));
  }
  return { id, bus: 'officials', phase: 'v1', info, era: 'Pea-whistle trill (a warble), as officials used in the period.', recipe: { layers, variantsCents: variants(40) }, mixDb: 0, minGapMs: 250, rateGroup: 'whistle' };
}

const officials: RecipeEntry[] = [
  peaWhistle('officials.whistle.deadBall', 'The play is over (engine whistle tick).', [{ at: 0, len: 0.45 }]),
  // Longer for a foul or timeout stoppage, so the two differ by ear as well as by caption.
  peaWhistle('officials.whistle.stoppage', 'Play is stopped for a foul or a timeout.', [{ at: 0, len: 0.9 }]),
  // Short repeated blasts, where the engine models an inadvertent whistle.
  peaWhistle('officials.whistle.inadvertent', 'An inadvertent whistle killed the play.', [{ at: 0, len: 0.12 }, { at: 0.24, len: 0.12 }, { at: 0.48, len: 0.12 }]),
  {
    id: 'officials.micTone', bus: 'officials', phase: 'v1', ducksCrowd: true,
    info: 'A ruling is coming. The announcement is text on the booth line, never a voice.',
    era: 'Stadium PA switch-on: a click, a short hum and two soft notes through a narrow horn speaker.',
    recipe: {
      layers: [
        noise('white', env(0.001, 0, 0.02), 0.6, hp(1500)),
        osc('square', 120, env(0.01, 0.5, 0.15), 0.08, { filter: lp(600) }),
        osc('triangle', 784, env(0.01, 0.1, 0.25), 0.5, { filter: bp(1400, 0.7), offset: 0.12 }),
        osc('triangle', 659, env(0.01, 0.1, 0.3), 0.5, { filter: bp(1400, 0.7), offset: 0.36 }),
      ],
    },
    mixDb: -3, minGapMs: 1000,
  },
];

// ---- Contact -------------------------------------------------------------------------------------
// Pads and helmets: a low body thump plus a short mid crack that grows with the J6 tier (1 to 4).

function hit(tier: 1 | 2 | 3 | 4): RecipeEntry {
  const k = tier / 4;
  return {
    id: `contact.hit.tier${tier}`, bus: 'contact', phase: 'v2',
    info: `How hard the hit was: contest tier ${tier} of 4 from the engine (J6). It never says who won.`,
    era: 'Dry pad thump, no modern cinematic boom.',
    recipe: {
      layers: [
        osc('sine', 95 + 25 * k, env(0.002, 0, 0.14 + 0.1 * k), 1, { freqEnd: 45 }),
        noise('brown', env(0.001, 0, 0.09 + 0.06 * k), 0.5 + 0.3 * k, lp(700 + 500 * k)),
        noise('white', env(0.0005, 0, 0.03 + 0.02 * k), 0.15 + 0.35 * k * k, bp(1800 + 600 * k, 1.2)),
      ],
      variantsCents: variants(150),
    },

    // Each tier up is 3 dB louder in the mix, so tiers stay apart by ear (tuned by ear).
    mixDb: -9 + 3 * (tier - 1),
    // All tiers share one limiter: a pile-up is one sound (MB-9).
    minGapMs: 250, rateGroup: 'contact.hit',
  };
}

const contact: RecipeEntry[] = [
  {
    id: 'contact.snap', bus: 'contact', phase: 'v1', info: 'The play started (engine snap tick).',
    era: 'A short low thump of the ball leaving the ground.',
    recipe: { layers: [osc('sine', 140, env(0.002, 0, 0.08), 1, { freqEnd: 70 }), noise('brown', env(0.001, 0, 0.05), 0.4, lp(900))], variantsCents: variants(60) },
    mixDb: -8, minGapMs: 500,
  },
  hit(1), hit(2), hit(3), hit(4),
  {
    id: 'contact.ball.catch', bus: 'contact', phase: 'v2', info: 'The pass was caught.',
    era: 'Leather slap into hands.',
    recipe: { layers: [noise('white', env(0.001, 0, 0.055), 1, bp(1300, 1.5)), osc('sine', 220, env(0.001, 0, 0.065), 0.5, { freqEnd: 150 })], variantsCents: variants(80) },
    mixDb: -8, minGapMs: 200, rateGroup: 'contact.ball',
  },
  {
    id: 'contact.ball.drop', bus: 'contact', phase: 'v2', info: 'The ball hit the ground: dropped or incomplete.',
    era: 'Dull bounce on grass or period artificial turf.',
    recipe: {
      layers: [
        osc('sine', 180, env(0.002, 0, 0.1), 1, { freqEnd: 90 }),
        osc('sine', 160, env(0.002, 0, 0.08), 0.45, { freqEnd: 85, offset: 0.22 }),
        noise('pink', env(0.001, 0, 0.06), 0.3, lp(1200)),
      ],
      variantsCents: variants(80),
    },
    mixDb: -10, minGapMs: 200, rateGroup: 'contact.ball',
  },
  {
    id: 'contact.ball.kickFoot', bus: 'contact', phase: 'v2', info: 'The kick was struck (engine kick event).',
    era: 'Hollow boot-on-leather pop.',
    recipe: { layers: [osc('sine', 260, env(0.001, 0, 0.07), 1, { freqEnd: 110 }), noise('white', env(0.0005, 0, 0.035), 0.6, bp(900, 1))], variantsCents: variants(60) },
    mixDb: -6, minGapMs: 300, rateGroup: 'contact.ball',
  },
  {
    id: 'contact.ball.postHit', bus: 'contact', phase: 'v2', info: 'The ball hit an upright or the crossbar.',
    era: 'Metal goalpost ring: a few inharmonic partials dying away.',
    recipe: {
      layers: [
        osc('sine', 523, env(0.001, 0.02, 1.2), 0.6),
        osc('sine', 1397, env(0.001, 0.01, 0.8), 0.35),
        osc('sine', 2711, env(0.001, 0, 0.4), 0.2),
        noise('white', env(0.0005, 0, 0.025), 0.4, bp(2500, 2)),
      ],
    },
    mixDb: -4, minGapMs: 500,
  },
];

// ---- Cadence -------------------------------------------------------------------------------------
// Voice-like tones with no words: a buzz through two vowel-like bands. A hard count is a sharper,
// higher and louder bark.

const syllable = (f0: number, f1: number, b1: number, b2: number, hold: number, attack: number, g2: number): RecipeLayer[] => [
  osc('sawtooth', f0, env(attack, hold, 0.06), 1, { freqEnd: f1, filter: bp(b1, 2.5) }),
  osc('sawtooth', f0, env(attack, hold, 0.06), g2, { freqEnd: f1, filter: bp(b2, 3) }),
];

const cadence: RecipeEntry[] = [
  {
    id: 'cadence.voiced', bus: 'cadence', phase: 'v1',
    info: 'A cadence call on the engine cadence tick: snap timing can be heard.',
    era: 'Wordless shouted syllable. On the road under high noise the crowd bed masks it through the mix.',
    recipe: { layers: syllable(150, 130, 700, 1150, 0.12, 0.015, 0.6), variantsCents: variants(30) },
    mixDb: -4, minGapMs: 120, rateGroup: 'cadence',
  },
  {
    id: 'cadence.hard', bus: 'cadence', phase: 'v1',
    info: 'A hard count: an accented call meant to draw the defense offside.',
    era: 'The same voice, barked.',
    recipe: { layers: syllable(185, 150, 800, 1300, 0.16, 0.005, 0.75), variantsCents: variants(30) },
    mixDb: 0, minGapMs: 120, rateGroup: 'cadence',
  },
  {
    id: 'cadence.relay.clean', bus: 'cadence', phase: 'v1', info: 'The call reached the huddle.',
    era: 'Two clean rising tones, like a period sideline headset beep.',
    recipe: { layers: [osc('sine', 880, env(0.005, 0.09, 0.03), 0.8), osc('sine', 1175, env(0.005, 0.11, 0.04), 0.8, { offset: 0.13 })] },
    mixDb: -8, minGapMs: 500, rateGroup: 'relay',
  },
  {
    id: 'cadence.relay.garbled', bus: 'cadence', phase: 'v1', info: 'The call did not get in cleanly (garbled relay, I2.4.1).',
    era: 'The same tones broken into fragments and buried in radio hiss.',
    recipe: {
      layers: [
        ...[0, 0.05, 0.13, 0.2].map((at, i) => osc('sine', i < 2 ? 880 : 1108, env(0.003, 0.018, 0.006), 0.7, { offset: at })),
        noise('white', env(0.01, 0.26, 0.04), 0.35, bp(2000, 0.8)),
      ],
    },
    mixDb: -8, minGapMs: 500, rateGroup: 'relay',
  },
];

// ---- Interface -----------------------------------------------------------------------------------

function alert(id: string, info: string, notes: number[], step: number): RecipeEntry {
  return {
    id, bus: 'ui', phase: 'v1', info, ducksCrowd: true,
    era: 'Square-wave buzzer notes, like period electronic scoreboards and sideline gear.',
    recipe: { layers: notes.map((freq, i) => osc('square', freq, env(0.004, step * 0.55, 0.03), 0.5, { filter: lp(2400), offset: i * step })) },
    mixDb: -6, minGapMs: 800,
  };
}

const ui: RecipeEntry[] = [
  {
    id: 'ui.playClockTick', bus: 'ui', phase: 'v1', offByDefault: true, ducksCrowd: true,
    info: 'Under 10 seconds on the play clock (with a visible pulse).',
    era: 'Mechanical clock tick.',
    recipe: { layers: [noise('white', env(0.0005, 0, 0.014), 1, bp(3000, 3))] },
    mixDb: -14, minGapMs: 120,
  },
  {
    id: 'ui.callConfirm', bus: 'ui', phase: 'v1', info: 'The call was taken (two-note confirm).',
    era: 'Soft two-note chime.',
    recipe: { layers: [osc('triangle', 660, env(0.004, 0, 0.13), 0.8), osc('triangle', 990, env(0.004, 0, 0.17), 0.8, { offset: 0.09 })] },
    mixDb: -10, minGapMs: 120, rateGroup: 'ui.input',
  },
  {
    id: 'ui.hoverTick', bus: 'ui', phase: 'v1', offByDefault: true, info: 'Focus moved to another control (optional).',
    era: 'Faint relay click.',
    recipe: { layers: [noise('white', env(0.0005, 0, 0.008), 1, hp(2500))] },
    mixDb: -22, minGapMs: 120, rateGroup: 'ui.input',
  },
  alert('ui.alert.injury', 'A player is hurt: a decision may be needed.', [523, 415], 0.22),
  alert('ui.alert.challengeWindow', 'The challenge window is open.', [698, 880, 698], 0.12),
  alert('ui.alert.timeout', 'A timeout was called.', [587, 587], 0.16),
  alert('ui.alert.twoMinute', 'Two-minute warning.', [784, 659, 523], 0.15),
];

// ---- Ambience ------------------------------------------------------------------------------------

const ambience: RecipeEntry[] = [
  {
    id: 'ambience.paChime', bus: 'ambience', phase: 'v2', offByDefault: true, info: 'None beyond setting: a stoppage PA chime.',
    era: 'Generic three-note PA chime through a horn speaker, with a bowl echo.',
    recipe: {
      layers: [523, 659, 784].flatMap((f, i) => [
        osc('sine', f, env(0.005, 0.05, 0.9), 0.7, { filter: bp(1200, 0.6), offset: i * 0.32 }),
        osc('sine', f, env(0.01, 0.05, 0.8), 0.25, { filter: bp(1200, 0.6), offset: i * 0.32 + 0.11 }),
      ]),
    },
    mixDb: -10, minGapMs: 5000, rateGroup: 'stadium',
  },
  {
    id: 'ambience.bandHit', bus: 'ambience', phase: 'v2', offByDefault: true,
    info: 'None beyond setting: a generic band hit in a stoppage, never a real song.',
    era: 'One brass-and-drum stab. Allowed since F-presentation-era-0001 is Verified; still off until the player turns it on.',
    recipe: {
      layers: [
        ...[233, 294, 349, 466].map((f) => osc('sawtooth', f, env(0.03, 0.3, 0.3), 0.3, { filter: lp(2200, 1), lfo: { rate: 5.5, depth: 8 } })),
        noise('brown', env(0.002, 0, 0.2), 0.6, lp(300)),
      ],
    },
    mixDb: -10, minGapMs: 5000, rateGroup: 'stadium',
  },
  {
    id: 'ambience.organSting', bus: 'ambience', phase: 'v2', offByDefault: true, gate: 'period-fact',
    info: 'None beyond setting: a stadium organ sting in a stoppage, never a real song or chant.',
    era: 'An original rising organ figure (square and sine stack). Waits for PV-10 (plan 2.1).',
    recipe: {
      layers: [392, 494, 587, 784].flatMap((f, i) => [
        osc('square', f, env(0.01, 0.55 - i * 0.1, 0.2), 0.25, { filter: lp(3000), lfo: { rate: 6.5, depth: 6 }, offset: i * 0.14 }),
        osc('sine', f / 2, env(0.01, 0.55 - i * 0.1, 0.2), 0.3, { offset: i * 0.14 }),
      ]),
    },
    mixDb: -10, minGapMs: 5000, rateGroup: 'stadium',
  },
  {
    id: 'ambience.rain', bus: 'ambience', phase: 'v2', bed: true, info: 'It is raining (engine weather state): wet ball and footing.',
    era: 'Steady hiss with a low patter.',
    recipe: { layers: [noise('white', BED, 0.7, hp(1800)), noise('pink', BED, 0.6, lp(600))] },
    mixDb: -6,
  },
  {
    id: 'ambience.wind', bus: 'ambience', phase: 'v2', bed: true,
    info: 'Wind strength from the engine wind speed (J12.3.1); PV-10 sets the bed level with windLevel().',
    era: 'Low rushing band with a slow howl.',
    recipe: { layers: [noise('brown', BED, 1, bp(400, 0.9)), osc('sine', 330, BED, 0.05, { lfo: { rate: 0.2, depth: 300 }, filter: bp(400, 2) })] },
    mixDb: -4,
  },
  {
    id: 'ambience.gust', bus: 'ambience', phase: 'v2',
    info: 'A gust from the engine gust value (J12.3.1); PV-10 plays it at gustLevel().',
    era: 'A rising and falling rush over the wind bed.',
    recipe: { layers: [noise('pink', env(0.8, 0.4, 1.2), 1, bp(450, 0.7, 900))], variantsCents: variants(100) },
    mixDb: -4, minGapMs: 1500,
  },
  {
    id: 'ambience.projector', bus: 'ambience', phase: 'v2', bed: true, offByDefault: true,
    info: 'None beyond setting: film room only, a 16mm projector running (plan 2.1).',
    // A 24 Hz square through a bandpass clicks on each edge: the shutter and claw clatter.
    era: 'Motor hum plus the shutter clatter of a 16mm projector at 24 frames a second.',
    recipe: { layers: [osc('square', 24, BED, 0.5, { filter: bp(2200, 1.5) }), noise('white', BED, 0.15, bp(3500, 1)), osc('triangle', 120, BED, 0.25), noise('brown', BED, 0.3, lp(400))] },
    mixDb: -12,
  },
];

export const RECIPES: readonly RecipeEntry[] = [crowdBed, ...crowdReactions, ...officials, ...contact, ...cadence, ...ui, ...ambience];
