// WP-24 fast simulation: what a batch is made of (J14.6.1, J14.2.1, J13.3.2).
// A batch is a list of game indexes, a master seed, a rule set and one engine variant (resolver and
// parameter overrides). Every game seed comes from the master seed and the game index, never from the
// order games run in, so a batch gives the same result on 1 worker or 16.
import type {
  GameDeps, GameFlow, GameInput, GameResult, GameSummary, PlayByPlayRow, Resolver, StatsModule,
} from '@gm/schema';

/** Plain JSON: what may cross into a worker thread. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [k: string]: Json };

/**
 * One build of the engine for a batch or a diff (Q1.3.2 "two builds"). Inside one checkout a build is
 * a resolver plus parameter overrides; two git checkouts are compared by running each one's batch and
 * diffing the exported reports.
 */
export interface EngineVariant {
  /** Short name used in reports, for example `base` or `rushSpeed+0.1`. */
  readonly label: string;
  /** Resolver id from the registry (resolvers.ts). */
  readonly resolverId: Resolver['id'];
  /** Parameter overrides by name. An unknown name is an error, never a silent skip. */
  readonly paramOverrides?: Readonly<Record<string, number>>;
}

/**
 * Everything a batch needs to build games. A factory module exports `createGameFactory(options)`;
 * workers import it by URL, so the options must be plain JSON.
 */
export interface GameFactory {
  readonly ruleSetId: string;
  /** Self-contained input snapshot of one game (J14.2.1). */
  input(gameIndex: number, seedHex: string): GameInput;
  /** Dependencies for one game under one variant: the variant's resolver and parameter table. */
  deps(input: GameInput, variant: EngineVariant, resolver: Resolver): GameDeps;
  readonly flow: Pick<GameFlow, 'simulateGame'>;
  /** Present when the factory can turn games into play-by-play rows and summaries (calibration export). */
  readonly stats?: Pick<StatsModule, 'playByPlay' | 'summary'>;
  /** Optional resolvers of the factory's own (tests, experiments); undefined falls back to the registry. */
  resolver?(id: Resolver['id']): Resolver | undefined;
}

export type CreateGameFactory = (options: Json) => GameFactory;

/** Names a factory module and its options, so a worker can build the same factory. */
export interface FactoryRef {
  /** A `file:` URL or an absolute path of a module exporting `createGameFactory`. */
  readonly module: string;
  readonly options: Json;
}

export interface BatchRunSpec {
  readonly factory: FactoryRef;
  readonly variant: EngineVariant;
  /** 16 lower-case hex digits; game seeds derive from it and the game index (calibration `gameSeedHex`). */
  readonly masterSeedHex: string;
  /** Number of games; indexes 0 to games - 1 unless `indexes` is given. */
  readonly games: number;
  readonly indexes?: readonly number[];
  /** Seed groups for the calibration sample (Q2.3.1 ordering rows). 0 or absent: no sample kept. */
  readonly seedGroups?: number;
}

/** What one game leaves behind in a batch (J14.3.1 summary detail): enough to re-run it in full. */
export interface GameOutcome {
  readonly index: number;
  readonly gameId: number;
  readonly seedHex: string;
  readonly score: readonly [number, number];
  readonly plays: number;
  /** State hash after the last play (P1.1.5); empty for a game with no plays. */
  readonly finalStateHash: string;
  /** Hash of the canonical event list: the source of truth (J11.1.1). */
  readonly eventsHash: string;
  /** Hash of each play's truth record in order, resolver id and version left out, for the diff runner. */
  readonly truthHashes: readonly string[];
}

/** A game outcome plus the calibration rows, when the factory has a statistics module. */
export interface GameRun {
  readonly outcome: GameOutcome;
  readonly rows: readonly PlayByPlayRow[] | null;
  readonly summary: GameSummary | null;
}

export interface BatchReport {
  readonly ruleSetId: string;
  readonly variant: EngineVariant;
  readonly resolverVersion: string;
  readonly paramVersion: string;
  readonly masterSeedHex: string;
  /** Sorted by game index, whatever order the workers finished in. */
  readonly outcomes: readonly GameOutcome[];
  /** One hash over every outcome in index order: equal across worker counts (J13.3.2). */
  readonly batchHash: string;
  /** Calibration sample groups (index mod seedGroups), or null when not asked for. */
  readonly groups: readonly { readonly summaries: readonly GameSummary[]; readonly plays: readonly PlayByPlayRow[] }[] | null;
  readonly workers: number;
}

export type { GameResult };
