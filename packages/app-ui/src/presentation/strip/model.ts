// PV-05 score strip model (plan section 3.4, O2.1.3, I9.3.2). Turns the public game state the console
// already holds into the strip's items. Pure: no clock, no random, no truth layer. Every item here is
// something a fan in the stands could read off the stadium board, and nothing else.
//
// The strip is drawn as a 1970s/80s stadium lamp board in the Classic skin (plan 2.1: no broadcast
// score box existed in the period), and as plain token text in every other look. Both read this model.

/** The 3.4 items the strip must always show. A test fails if a render leaves one out. */
export const STRIP_ITEMS = [
  'teams', 'score', 'quarter', 'gameClock', 'playClock', 'downDistance', 'ballSpot', 'timeouts', 'possession', 'noise', 'wind',
] as const;
export type StripItem = (typeof STRIP_ITEMS)[number];

/** A generated team as the strip shows it. Colours come from the team generator (two flat colours, A6). */
export interface StripTeam {
  /** Generated short name. The strip shows it in capitals and never adds a mark or logo. */
  readonly short: string;
  readonly primary: string;
  readonly secondary: string;
}

/** Input: the console's strip read model (G-60) plus the teams, possession and the feed's conditions. */
export interface StripInput {
  /** Indexed by side: side 0 is home (contract D-01). */
  readonly teams: readonly [StripTeam, StripTeam];
  readonly possession: 0 | 1 | null;
  /** 1 to 4, then 5 and up for overtime periods. */
  readonly quarter: number;
  /** Game clock as the console formats it, "m:ss" or "mm:ss". */
  readonly clock: string;
  readonly clockRunning: boolean;
  readonly score: readonly [number, number];
  /** Console text such as "3rd & 7" or "1st & Goal"; null on kicks and tries. */
  readonly downDistance: string | null;
  /** Console text such as "OWN 25" or "OPP 30". */
  readonly spot: string;
  readonly timeouts: readonly [number, number];
  /** Timeouts a team starts each half with. A rule value: the caller passes it from rules-data. */
  readonly timeoutsPerHalf: number;
  /** Play clock in tenths of a second; null while the ball is live or the clock is not running. */
  readonly playClockTenths: number | null;
  /** True from the snap to the whistle. */
  readonly live: boolean;
  /** The feed's conditions (PV-00): `noise` is null until CR-PV00-1 lands, then the base shows instead. */
  readonly noise: number | null;
  readonly noiseBase: number;
  readonly windMph: number;
  readonly gustMph: number;
  /** Degrees counter-clockwise from +x, the direction the wind blows toward (contract D-12). */
  readonly windDirDeg: number;
  /** Closed or fixed roof: the wind item reads "INDOORS". */
  readonly indoors: boolean;
}

export interface StripTeamView {
  readonly side: 0 | 1;
  readonly name: string;
  readonly primary: string;
  readonly secondary: string;
  readonly score: number;
  readonly hasBall: boolean;
  readonly timeoutsLeft: number;
  readonly timeoutsTotal: number;
}

/** Ten-step meter (plan 3.4: silent-count and relay pressure, J12.6.1). */
export const NOISE_SEGMENTS = 10;

export interface NoiseMeter {
  /** 0..NOISE_SEGMENTS lamps lit. */
  readonly lit: number;
  /** `engine` is the play's crowd noise; `venue` is the venue base, shown only until the engine sends noise. */
  readonly source: 'engine' | 'venue';
  /** Words for screen readers and the plain look. */
  readonly label: string;
}

export interface StripModel {
  /** Away on the left, home on the right, as stadium boards read. */
  readonly away: StripTeamView;
  readonly home: StripTeamView;
  readonly quarterLabel: string;
  readonly clock: string;
  readonly clockRunning: boolean;
  /** Whole seconds left (rounded up, as a play clock shows), or null when not shown. */
  readonly playClock: { readonly seconds: number; readonly under10: boolean } | null;
  readonly downDistance: string;
  readonly spot: string;
  readonly live: boolean;
  readonly noise: NoiseMeter;
  readonly wind: { readonly text: string; readonly dirDeg: number | null };
  /** One sentence with everything on the board, for the accessible name. */
  readonly summary: string;
}

/** Tenths under which the play clock counts as late (plan 3.4: banners never show under 10 s). */
export const PLAY_CLOCK_LATE_TENTHS = 100;

export function quarterLabel(q: number): string {
  if (q === 1) return '1ST';
  if (q === 2) return '2ND';
  if (q === 3) return '3RD';
  if (q === 4) return '4TH';
  const ot = q - 4;
  return ot <= 1 ? 'OT' : `${ot}OT`;
}

export function noiseMeter(noise: number | null, base: number): NoiseMeter {
  const source = noise === null ? 'venue' : 'engine';
  const level = Math.min(1, Math.max(0, noise ?? base));
  const lit = Math.round(level * NOISE_SEGMENTS);
  const label = source === 'engine'
    ? `Crowd noise ${lit} of ${NOISE_SEGMENTS}`
    : `Venue noise ${lit} of ${NOISE_SEGMENTS} (play-by-play crowd level not available yet)`;
  return { lit, source, label };
}

function windText(i: StripInput): { text: string; dirDeg: number | null } {
  if (i.indoors) return { text: 'INDOORS', dirDeg: null };
  const mph = Math.round(i.windMph);
  if (mph === 0) return { text: 'WIND CALM', dirDeg: null };
  const gust = Math.round(i.gustMph);
  return { text: gust > mph ? `WIND ${mph} G${gust}` : `WIND ${mph}`, dirDeg: i.windDirDeg };
}

function team(i: StripInput, side: 0 | 1): StripTeamView {
  const t = i.teams[side];
  return {
    side, name: t.short.toUpperCase(), primary: t.primary, secondary: t.secondary, score: i.score[side],
    hasBall: i.possession === side, timeoutsLeft: Math.max(0, Math.min(i.timeoutsPerHalf, i.timeouts[side])), timeoutsTotal: i.timeoutsPerHalf,
  };
}

export function stripModel(i: StripInput): StripModel {
  const home = team(i, 0), away = team(i, 1);
  const playClock = i.playClockTenths === null || i.live ? null
    : { seconds: Math.ceil(Math.max(0, i.playClockTenths) / 10), under10: i.playClockTenths < PLAY_CLOCK_LATE_TENTHS };
  const downDistance = (i.downDistance ?? '').toUpperCase();
  const spot = i.spot.toUpperCase();
  const noise = noiseMeter(i.noise, i.noiseBase);
  const wind = windText(i);
  const ql = quarterLabel(i.quarter);
  const ball = (t: StripTeamView) => (t.hasBall ? ', ball' : '');
  const summary = [
    `${away.name} ${away.score}${ball(away)}, ${home.name} ${home.score}${ball(home)}`,
    `${ql} quarter ${i.clock}${i.clockRunning ? ' running' : ' stopped'}`,
    playClock ? `play clock ${playClock.seconds}` : i.live ? 'ball live' : 'play clock off',
    downDistance || null, spot ? `ball on ${spot}` : null,
    `timeouts ${away.name} ${away.timeoutsLeft}, ${home.name} ${home.timeoutsLeft}`,
    noise.label, wind.text.toLowerCase(),
  ].filter(Boolean).join('; ');
  return { away, home, quarterLabel: ql, clock: i.clock, clockRunning: i.clockRunning, playClock, downDistance, spot, live: i.live, noise, wind, summary };
}
