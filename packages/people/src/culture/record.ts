// The culture record per program and club (X9.1.1), its generation (X9.5.1), the decider blend
// (X9.1.1 rule 3) and the reader table (X9.4.1).
//
// The working record keeps real numbers so that a 5 percent drift on an integer field (patience 1 to 6,
// tolerance 0 to 100) accumulates over seasons instead of rounding away; `toCultureRecord` rounds to the
// G-00 shape for storage (CR-G24-3 asks for real-valued fields). `resources` is not in the G-00 shape yet
// (CR-G24-2).
import type { CultureRecord } from '@gm/schema';
import { cp, type Draw } from './params.ts';

/** Staff size and budget band (X9.1.1 `resources`, read by X8.1.2). Content ids; Assumption. */
export const RESOURCE_BANDS = ['low', 'mid', 'high'] as const;
export type ResourceBand = (typeof RESOURCE_BANDS)[number];

export interface Expectation {
  readonly year: number;
  /** Target win-rate band (X9.2.1 rule 4). */
  readonly rateLow: number;
  readonly rateHigh: number;
  readonly winsLow: number;
  readonly winsHigh: number;
  readonly postseasonTarget: PostseasonTarget;
}

/** A postseason goal id. The level's own goals come from league-rules content (C2, T3); these two are level-free. */
export type PostseasonTarget = string;
export const POSTSEASON_NONE = 'none';
export const POSTSEASON_REPEAT = 'win_it_again';

export interface Culture {
  readonly teamId: number;
  labelPreferences: Record<string, number>;
  conductTolerance: Record<string, number>;
  patience: number;
  resources: ResourceBand;
  needWeightOverrides: Record<string, number>;
  expectation: Expectation;
  traditionStrength: number;
}

/** The G-00 `CultureRecord`, rounded where the shape holds integers. */
export function toCultureRecord(c: Culture): CultureRecord {
  const tol: Record<string, number> = {};
  for (const k of Object.keys(c.conductTolerance).sort()) tol[k] = Math.round(c.conductTolerance[k]!);
  const prefs: Record<string, number> = {};
  for (const k of Object.keys(c.labelPreferences).sort()) prefs[k] = c.labelPreferences[k]!;
  return {
    teamId: c.teamId,
    labelPreferences: prefs,
    conductTolerance: tol,
    patienceSeasons: Math.round(c.patience),
    needWeightOverrides: { ...c.needWeightOverrides },
    expectation: { year: c.expectation.year, winsLow: c.expectation.winsLow, winsHigh: c.expectation.winsHigh, postseasonTarget: c.expectation.postseasonTarget },
    traditionStrength: Math.round(c.traditionStrength),
  };
}

/** A [low, high) range to draw a field from. */
type Range = readonly [number, number];

/**
 * Generation ranges by level and resource band (X9.5.1: content, Assumption). Bigger programs start with
 * less patience and more tradition. The history run then earns the record into shape (X10.3.1).
 */
export interface GenerationBand {
  readonly patience: Range;
  readonly tolerance: Range;
  readonly preference: Range;
}
export const GENERATION: Readonly<Record<'pro' | 'college', Readonly<Record<ResourceBand, GenerationBand>>>> = {
  pro: {
    low: { patience: [2, 6], tolerance: [30, 70], preference: [-0.5, 0.5] },
    mid: { patience: [2, 5], tolerance: [30, 70], preference: [-0.5, 0.5] },
    high: { patience: [1, 4], tolerance: [25, 65], preference: [-0.5, 0.5] },
  },
  college: {
    low: { patience: [3, 6], tolerance: [30, 75], preference: [-0.5, 0.5] },
    mid: { patience: [2, 5], tolerance: [30, 70], preference: [-0.5, 0.5] },
    high: { patience: [1, 4], tolerance: [25, 65], preference: [-0.5, 0.5] },
  },
};

const drawIn = (r: Range, draw: Draw): number => r[0] + (r[1] - r[0]) * draw();

export interface GenerateInput {
  readonly teamId: number;
  readonly level: 'pro' | 'college';
  readonly resources: ResourceBand;
  /** L3 violation class ids of the level (content). */
  readonly violationClasses: readonly string[];
  /** Label ids the world's label engine can form (X2.2.1, content). */
  readonly labels: readonly string[];
  readonly firstYear: number;
  /** Games in a season at this level, for the win band. */
  readonly games: number;
  /** The `team.culture` stream (X9.5.1). */
  readonly draw: Draw;
}

/**
 * Generate a culture record (X9.5.1). Fields are drawn in a fixed order (patience, then tolerances by sorted
 * class, then preferences by sorted label) so the same seed gives the same record. Tradition starts at 0
 * and the expectation at an even record until the history run sets them.
 */
export function generateCulture(g: GenerateInput): Culture {
  const band = GENERATION[g.level][g.resources];
  const patience = Math.min(cp('patience.max'), Math.max(cp('patience.min'), Math.floor(drawIn(band.patience, g.draw) + 0.5)));
  const conductTolerance: Record<string, number> = {};
  for (const k of [...g.violationClasses].sort()) conductTolerance[k] = Math.round(drawIn(band.tolerance, g.draw));
  const labelPreferences: Record<string, number> = {};
  for (const k of [...g.labels].sort()) labelPreferences[k] = drawIn(band.preference, g.draw);
  const half = cp('expect.bandWidth') / 2;
  return {
    teamId: g.teamId,
    labelPreferences,
    conductTolerance,
    patience,
    resources: g.resources,
    needWeightOverrides: {},
    expectation: { year: g.firstYear, rateLow: 0.5 - half, rateHigh: 0.5 + half, winsLow: Math.round((0.5 - half) * g.games), winsHigh: Math.round((0.5 + half) * g.games), postseasonTarget: POSTSEASON_NONE },
    traditionStrength: 0,
  };
}

/** Who is deciding, for the X9.1.1 rule 3 blend. */
export type DeciderRole = 'owner' | 'athletic_director' | 'other';

/**
 * Weight of the decider's own values against the team record (X9.1.1 rule 3): 60 percent person, 40
 * percent team for an owner; the reverse for an athletic director at a program with tradition above 70.
 * Every other decider uses the owner split (Assumption).
 */
export function blendWeights(role: DeciderRole, traditionStrength: number): { person: number; team: number } {
  const person = cp('blend.person');
  if (role === 'athletic_director' && traditionStrength > cp('blend.adTraditionAbove')) return { person: 1 - person, team: person };
  return { person, team: 1 - person };
}

/**
 * How much a decider prizes a label (X9.1.1 rule 2): the blend of his own preference and the team's.
 * A consumer multiplies a held label's weight by this.
 */
export function labelWeight(c: Culture, labelId: string, role: DeciderRole, personPreference: number): number {
  const w = blendWeights(role, c.traditionStrength);
  return w.person * personPreference + w.team * (c.labelPreferences[labelId] ?? 0);
}

/** The reader table of X9.4.1. Adding a reader is a content change here; a field with no reader fails the build. */
export const CULTURE_READERS: Readonly<Record<keyof Omit<Culture, 'teamId'>, readonly string[]>> = {
  labelPreferences: ['K8', 'K7', 'T4'],
  conductTolerance: ['L3', 'X5', 'K8'],
  patience: ['E4'],
  resources: ['X8.1.2', 'H', 'L'],
  needWeightOverrides: ['X5.1.1'],
  expectation: ['E4', 'E2', 'L6'],
  traditionStrength: ['X9.3.1', 'X9.1.1'],
};

/** Fields with no reader (X9.4.1 acceptance: must be empty). */
export function unreadFields(readers: Readonly<Record<string, readonly string[]>> = CULTURE_READERS): string[] {
  return Object.entries(readers).filter(([, r]) => r.length === 0).map(([f]) => f).sort();
}

/** Whether a reader may read a field (X9.4.1: only readers in the table). */
export function mayRead(field: keyof typeof CULTURE_READERS, reader: string): boolean {
  return CULTURE_READERS[field].includes(reader);
}

/**
 * The L3 and X5 reading of `conduct_tolerance` (X9.4.1): a coach's action on a violation is "far from the
 * culture" when the tolerance it implies (0 harshest, 100 ignored) differs from the record by more than 30.
 */
export function conductReading(c: Culture, violationClass: string, actionTolerance: number): 'in_line' | 'harsher' | 'softer' {
  const expected = c.conductTolerance[violationClass];
  if (expected === undefined) return 'in_line';
  const gap = actionTolerance - expected;
  if (gap > cp('reader.conductGap')) return 'softer';
  if (gap < -cp('reader.conductGap')) return 'harsher';
  return 'in_line';
}
