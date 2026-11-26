// Rule values the school reads, passed in by the caller from the save's rule set (manifest: RULE_KEYS in
// params.ts). The school never holds a rule value of its own.

export interface TeachingRules {
  /** `clock.play_clock_s` */
  readonly playClockS: number;
  /** `clock.play_clock_after_stoppage_s` */
  readonly playClockAfterStoppageS: number;
  /** `clock.two_minute_timeout`: the clock stops once at two minutes in each half. */
  readonly twoMinuteStop: boolean;
  /**
   * Game clock reading of that stop, seconds. The rule set has no key for the reading yet (owed to the
   * integrator, CR-G94-2); B1 and the A4.5 row term.two-minute-warning (Verified) put it at two minutes.
   */
  readonly twoMinuteMarkS: number;
  /** `timeout.per_half` */
  readonly timeoutsPerHalf: number;
  /** `comm.c2p_allowed` */
  readonly radioAllowed: boolean;
  /** `comm.c2p_cutoff_seconds` */
  readonly radioCutoffS: number;
}

/** Stop reading of the two-minute rule until the rule set carries it as a key (CR-G94-2). */
export const TWO_MINUTE_MARK_S = 120;

/** Build TeachingRules from a rule-set lookup. Throws on a missing or mistyped key. */
export function teachingRulesFrom(get: (key: string) => unknown): TeachingRules {
  const num = (k: string): number => { const v = get(k); if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`teaching: rule ${k} must be a number`); return v; };
  const bool = (k: string): boolean => { const v = get(k); if (typeof v !== 'boolean') throw new Error(`teaching: rule ${k} must be a boolean`); return v; };
  const radioAllowed = bool('comm.c2p_allowed');
  return {
    playClockS: num('clock.play_clock_s'),
    playClockAfterStoppageS: num('clock.play_clock_after_stoppage_s'),
    twoMinuteStop: bool('clock.two_minute_timeout'),
    twoMinuteMarkS: TWO_MINUTE_MARK_S,
    timeoutsPerHalf: num('timeout.per_half'),
    radioAllowed,
    radioCutoffS: radioAllowed ? num('comm.c2p_cutoff_seconds') : 0,
  };
}
