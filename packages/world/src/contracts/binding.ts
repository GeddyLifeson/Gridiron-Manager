// What the composition root gives the contracts module, and the league rules it reads (C6). Kept apart
// from step.ts so the front office (turnover) can read rules through it without importing the step.
import type { RuleSet } from '@gm/schema';
import type { LiveWorld } from '../loop/types.ts';
import type { Level, RuleRead } from '../turnover/binding.ts';

export interface ContractsBinding {
  readonly rule: RuleRead;
  /** Names of the rule keys a level holds: the cap module reads the minimum salary bands from key names. */
  readonly keys: (level: Level) => readonly string[];
  /** The rules year every league year reads (MO-02: today's rules throughout). */
  readonly rulesYear: number;
  /** A club the world must not write contracts for (for example the user's club once the career module owns it). */
  readonly skipTeam?: (world: LiveWorld, teamId: number) => boolean;
  /**
   * C8.3.1 rule 4 time factor of the world's free agent signings, given the season. Absent, 1: the world signs
   * its free agents in one pass at the opening of the market, the first wave (PC-12). A caller holding the
   * calendar passes `market.timeFactor(at, market.marketDates(...))`.
   */
  readonly marketTime?: (seasonYear: number) => number;
}

/** A RuleSet over the binding's reader for one level, with its key names, for the league cap module. */
export function ruleSetFor(b: ContractsBinding, level: Level): RuleSet {
  const num = (k: string): number => {
    const v = b.rule(level, k);
    if (v === undefined) throw new Error(`league ${level} holds no rule ${k}`);
    return v;
  };
  return { id: `world:${level}`, level: level as RuleSet['level'], seasonYear: b.rulesYear, num, bool: (k) => num(k) !== 0, opt: (k) => String(num(k)), keys: () => [...b.keys(level)] };
}

