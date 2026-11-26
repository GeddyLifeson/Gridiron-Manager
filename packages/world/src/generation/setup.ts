// X10.1.1: the world setup record. One record per world, immutable after creation, read by every
// generator. It holds world choices only: nothing in it may change an outcome for or against the user.
import { hash64Hex, seedFromHex, utf8, type WorldSeed } from '@gm/engine-core';
import { history } from '@gm/league';
import { param } from './params.ts';
import { bytesToHex, sha256 } from './sha256.ts';

export const SIZE_PRESETS = ['full', 'standard', 'small'] as const;
export type SizePreset = (typeof SIZE_PRESETS)[number];

/** A loaded people pack, named by id with its content hash (U7). */
export interface PackRef { readonly id: string; readonly contentHashHex: string }

export interface SetupRecord {
  /** 16 lowercase hex digits (J13.4.1). */
  readonly seedHex: string;
  readonly size: SizePreset;
  /** Seasons of pre-career history (X10.1.1 presets, or any whole number a preset list later allows). */
  readonly historySeasons: number;
  readonly packs: readonly PackRef[];
  /** X14.3.1 career-curve dial, 0 to 1. Null when no pack is loaded (the dial is hidden). */
  readonly careerCurveDial: number | null;
  /** B12 rulebook era id. */
  readonly rulebookEra: string;
  /** B12 era progression through the history run (X10.3.1 rule 4). */
  readonly eraProgression: boolean;
  /** First season of the world (the first history season, or the career start when history is 0). */
  readonly firstSeasonYear: number;
}

export const SETUP_FIELDS: readonly (keyof SetupRecord)[] = [
  'seedHex', 'size', 'historySeasons', 'packs', 'careerCurveDial', 'rulebookEra', 'eraProgression', 'firstSeasonYear',
];

/** X10.1.1 rule 1 and its acceptance: words no setup field may carry. There is one difficulty. */
export const FORBIDDEN_SETUP_WORDS: readonly string[] = [
  'difficulty', 'modifier', 'bonus', 'boost', 'handicap', 'slider', 'trait', 'label', 'advantage', 'luck', 'cheat', 'assist', 'outcome',
];

export function historyPresets(): readonly number[] {
  return [param('history.blank'), param('history.short'), param('history.default'), param('history.long')];
}

/** A seed from text (X10.1.1 "seed (text or random)"). A random seed is drawn by the shell, never in core. */
export function seedHexFromText(text: string): string {
  return hash64Hex(utf8(text));
}

/** Static check of a setup shape (the X10.1.1 acceptance runs it over the screen definition too). */
export function setupFieldProblems(fields: readonly string[]): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const low = f.toLowerCase();
    for (const w of FORBIDDEN_SETUP_WORDS) if (low.includes(w)) out.push(`setup field ${f}: a world option may not offer ${w} (X10.1.1 rule 1)`);
    if (!(SETUP_FIELDS as readonly string[]).includes(f)) out.push(`setup field ${f}: not a world option (X10.1.1)`);
  }
  return out;
}

export function setupProblems(s: SetupRecord): string[] {
  const out = setupFieldProblems(Object.keys(s));
  if (!/^[0-9a-f]{16}$/.test(s.seedHex)) out.push('seedHex: 16 lowercase hex digits');
  if (!SIZE_PRESETS.includes(s.size)) out.push(`size: one of ${SIZE_PRESETS.join(', ')}`);
  if (!Number.isInteger(s.historySeasons) || s.historySeasons < 0) out.push('historySeasons: a whole number, 0 or more');
  if (!Number.isInteger(s.firstSeasonYear)) out.push('firstSeasonYear: a whole year');
  const ids = s.packs.map((p) => p.id);
  if (new Set(ids).size !== ids.length) out.push('packs: a pack is listed twice');
  for (const p of s.packs) if (!/^[0-9a-f]{8,}$/.test(p.contentHashHex)) out.push(`pack ${p.id}: content hash needs at least 8 hex digits`);
  if (s.packs.length === 0 && s.careerCurveDial !== null) out.push('careerCurveDial: hidden when no pack is loaded (X10.1.1 edge case)');
  if (s.careerCurveDial !== null && !(s.careerCurveDial >= 0 && s.careerCurveDial <= 1)) out.push('careerCurveDial: 0 to 1 (X14.3.1)');
  if (s.rulebookEra.length === 0) out.push('rulebookEra: a B12 era id');
  return out;
}

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as Record<string, unknown>)) deepFreeze(x);
  }
  return v;
}

/** Validate, sort the packs by id, and freeze (X10.1.1 rule 3: immutable after creation). */
export function createSetup(input: SetupRecord): SetupRecord {
  const problems = setupProblems(input);
  if (problems.length > 0) throw new Error(`world setup refused: ${problems.join('; ')}`);
  const packs = [...input.packs].map((p) => ({ id: p.id, contentHashHex: p.contentHashHex.toLowerCase() })).sort((a, b) => (a.id < b.id ? -1 : 1));
  return deepFreeze({
    seedHex: input.seedHex, size: input.size, historySeasons: input.historySeasons, packs,
    careerCurveDial: input.careerCurveDial, rulebookEra: input.rulebookEra, eraProgression: input.eraProgression,
    firstSeasonYear: input.firstSeasonYear,
  });
}

/** The canonical text of a setup record: sorted keys, no spaces (the G-22 canonical form). */
export function canonicalSetup(s: SetupRecord): string {
  return history.canonicalJson(s);
}

/** SHA-256 over the canonical setup record, as hex (X10.1.2 rule 1 takes its first 64 bits). */
export function setupHashHex(s: SetupRecord): string {
  return bytesToHex(sha256(utf8(canonicalSetup(s))));
}

export function setupSeed(s: SetupRecord): WorldSeed {
  return seedFromHex(s.seedHex);
}

/** WorldRecord.generatorOptions takes scalars only; this flattens the record for it. */
export function setupAsGeneratorOptions(s: SetupRecord): Record<string, string | number | boolean> {
  return {
    size: s.size, historySeasons: s.historySeasons, packs: s.packs.map((p) => `${p.id}:${p.contentHashHex}`).join(','),
    careerCurveDial: s.careerCurveDial ?? -1, rulebookEra: s.rulebookEra, eraProgression: s.eraProgression,
    firstSeasonYear: s.firstSeasonYear, setupHash: setupHashHex(s),
  };
}
