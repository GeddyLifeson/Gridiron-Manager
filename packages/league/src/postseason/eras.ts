// Postseason formats by season (B12 era settings, C3.3.1 and C3.4.1 for the pro level, T3.5.1 for
// college). Each era is a set of rule values that replaces the postseason keys of the base league-rules
// file from its first season until the next era starts. Every value cites a fact row; the status is
// computed from that row's sources, never typed. An era is offered as a starting year only when every
// one of its values may ship (B12.3.2 open question: "a starting year is offered only where a sourced
// rule-set file for that year exists").
//
// The data lives in packages/league/data/postseason-eras.json. A season before the first era of its
// level has no sourced format, so `rulesForSeason` returns null and the caller must not offer it.
import erasJson from '../../data/postseason-eras.json' with { type: 'json' };
import type { RuleValues } from '../standings/types.ts';

export interface EraValue {
  readonly key: string;
  readonly value: number | string | boolean;
  readonly unit?: string;
  /** Row id in facts/*.json. */
  readonly factId: string;
}

export interface PostseasonEra {
  /** Stable id: level word and first season. */
  readonly id: string;
  readonly level: string;
  /** First season the format applies to. It runs until the next era of the same level starts. */
  readonly from: number;
  /** Text key of the era's name on the era-settings screen. */
  readonly nameKey: string;
  readonly values: readonly EraValue[];
}

interface EraFile { readonly module: string; readonly eras: readonly PostseasonEra[] }

export const POSTSEASON_ERAS: readonly PostseasonEra[] = (erasJson as EraFile).eras;

/** The era in force for a level and season, or null before the first sourced era. */
export function eraFor(level: string, seasonYear: number, eras: readonly PostseasonEra[] = POSTSEASON_ERAS): PostseasonEra | null {
  let best: PostseasonEra | null = null;
  for (const e of eras) if (e.level === level && e.from <= seasonYear && (best === null || e.from > best.from)) best = e;
  return best;
}

/** Last season of an era: the season before the next era of its level starts, or null while it is the current one. */
export function eraEnd(era: PostseasonEra, eras: readonly PostseasonEra[] = POSTSEASON_ERAS): number | null {
  const next = eras.filter((e) => e.level === era.level && e.from > era.from).map((e) => e.from);
  return next.length ? Math.min(...next) - 1 : null;
}

/** Base rule values with the postseason keys of the season's era laid over them; null when no era is sourced. */
export function rulesForSeason(base: RuleValues, level: string, seasonYear: number, eras: readonly PostseasonEra[] = POSTSEASON_ERAS): RuleValues | null {
  const era = eraFor(level, seasonYear, eras);
  if (!era) return null;
  const out: Record<string, number | string | boolean> = { ...base };
  for (const v of era.values) out[v.key] = v.value;
  return out;
}

/** Fact status words that a rule value may ship with (Q6.3.1). */
const SHIPPABLE: ReadonlySet<string> = new Set(['Verified', 'Rulebook only']);

/**
 * Whether an era may be offered as a starting year: every value's fact row must exist and carry a
 * shippable status. `statusOf` reads the status the fact register computed for a row id.
 */
export function eraOffered(era: PostseasonEra, statusOf: (factId: string) => string | null): { readonly offered: boolean; readonly short: readonly { readonly key: string; readonly factId: string; readonly status: string | null }[] } {
  const short = era.values.map((v) => ({ key: v.key, factId: v.factId, status: statusOf(v.factId) })).filter((x) => x.status === null || !SHIPPABLE.has(x.status));
  return { offered: short.length === 0, short };
}
