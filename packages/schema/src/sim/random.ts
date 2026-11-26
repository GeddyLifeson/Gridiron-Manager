// Simulation contract, part 2: randomness and deterministic math as interfaces (J13.1.1, J13.2.1,
// J13.3.1). Packages that may not import @gm/engine-core (officiating, resolver-reference,
// football-lang: P1.2.1) receive these through their inputs. @gm/engine-core supplies the only
// implementations (`streamSource`, `DMATH`). No package writes its own generator or math.

/** The stream object of J13.1.1. `Stream` in @gm/engine-core satisfies it. */
export interface RandomStream {
  readonly name: string;
  /** Raw 32-bit outputs drawn so far. A stream depends only on its key and this count (J13.2.1). */
  readonly draws: number;
  nextU32(): number;
  /** Uniform in [0, 1). Exactly two raw outputs. */
  uniform(): number;
  /** Standard normal. Exactly four raw outputs. */
  normal(): number;
  chance(p: number): boolean;
  /** Index by weight. Exactly one uniform. */
  pick(weights: readonly number[]): number;
  /** Integer in [lo, hi]. Exactly one uniform. */
  int(lo: number, hi: number): number;
}

/**
 * Stream catalogue for a game (J13.2.1). A new stream needs a row in J13.2.1 first, then a name here.
 * `distant` is retired and reserved: it is listed so nobody reuses the name.
 */
export const STREAM_NAMES = [
  'weather', 'gust', 'officials', 'mental', 'perception', 'presnap', 'contest', 'qb', 'carrier', 'ball',
  'foul', 'injury', 'coachAI', 'between', 'toss', 'forecast', 'footing', 'distant', 'resolver',
] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

/**
 * Scope fields in the order J13.2.1 gives for each stream. Every scope starts with the game id.
 * Example: contest is [game, play, lowerPlayerId, higherPlayerId, contestType].
 */
export const STREAM_SCOPE: Readonly<Record<StreamName, readonly string[]>> = {
  weather: ['game', 'quarter'],
  gust: ['game', 'play'],
  officials: ['game', 'play', 'official'],
  mental: ['game', 'play', 'player'],
  perception: ['game', 'play', 'player'],
  presnap: ['game', 'play', 'team'],
  contest: ['game', 'play', 'lowerPlayerId', 'higherPlayerId', 'contestType'],
  qb: ['game', 'play', 'player'],
  carrier: ['game', 'play', 'player'],
  ball: ['game', 'play', 'flightIndex'],
  foul: ['game', 'play', 'player', 'foulType'],
  injury: ['game', 'play', 'player'],
  coachAI: ['game', 'play', 'team', 'decisionType'],
  between: ['game', 'play'],
  toss: ['game', 'tossIndex'],
  forecast: ['game', 'daysBeforeKickoff'],
  footing: ['game', 'play', 'player'],
  distant: ['game'],
  resolver: ['game', 'play'],
};

export type ScopeValue = number | string;

/**
 * Opens a keyed stream. The source is already bound to the world seed (J13.4.1); the caller passes
 * the stream name and the scope fields in STREAM_SCOPE order. Asking twice for the same key gives the
 * same sequence from the start, by design (J13.1.1).
 */
export type StreamSource = (name: StreamName, scope: readonly ScopeValue[]) => RandomStream;

/** The engine-owned math of J13.3.1. Platform transcendental functions are banned in core code (P1.1.1). */
export interface DeterministicMath {
  sin(x: number): number;
  cos(x: number): number;
  atan2(y: number, x: number): number;
  exp(x: number): number;
  log(x: number): number;
  pow(x: number, y: number): number;
  sqrt(x: number): number;
  /** Built on exp with clamping at plus and minus 30 (J13.3.1). */
  logistic(x: number): number;
}
