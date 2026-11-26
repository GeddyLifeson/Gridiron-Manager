// The slice of G-80 (career/market) a scripted career needs, as a structural type. career/market is on
// main but not yet in the @gm/career barrel (CR-G80-1), and headless may import only package entry
// points (P1.2.2). Once the barrel line lands, `career.market` satisfies `MarketPort` as it is and is
// passed straight to `runCareer` (CR-G89-1). Until then `standInMarket` mirrors the G-80 formulas and
// its starting values, so runs made today keep their shape when the real module is swapped in.

export interface MarketValueInputs {
  readonly rung: number;
  readonly path: number;
  readonly results: number;
  readonly workRating: number;
  readonly reputation: number;
  readonly agentReach: number;
  readonly bossTakesCredit: boolean;
}

export interface FiringContextLike {
  readonly firstHeadJob: boolean;
  readonly seasonsInJob: number;
  readonly rosterQuality: number;
  readonly forCause: boolean;
}

export interface CareerSpotLike { readonly rung: number; readonly prestige: number }

export type FitLineLike = 'step_up' | 'lateral' | 'step_down' | 'step_down_title_up_level' | 'well_above';

export interface MarketPort {
  marketValue(v: MarketValueInputs): number;
  valueAfterTimeOut(value: number, yearsOut: number, oldTeamCollapsed: boolean): number;
  comebackRung(lastRung: number, fullYearsOut: number): number;
  firingRegard(c: FiringContextLike): { peers: number; owners: number; payContinues: boolean };
  jobValue(rung: number, prestige: number): number;
  fitLine(opening: CareerSpotLike, current: CareerSpotLike | null): FitLineLike;
}

// G-80 starting values (career/src/market/params.ts, E2.2.2, E2.4.1, E2.7, S7.3.1), copied for the stand-in.
const RUNG_VALUES = [0, 5, 10, 18, 25, 35, 45, 60, 70, 100] as const;
const PRESTIGE_MAX = 40;
const c = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Stand-in for career.market with the same formulas (E2.2.2, E2.4.1, E2.7.1, E2.7.2, S7.3.1). */
export const standInMarket: MarketPort = {
  marketValue(v) {
    const results = c(v.results, 0, 1) * (v.bossTakesCredit ? 0.5 : 1);
    if (v.rung <= 6) return 100 * (0.6 * c(v.path, 0, 100) / 100 + 0.2 * results + 0.2 * c(v.workRating, 0, 1));
    return 100 * (0.4 * results + 0.35 * c(v.reputation, 0, 1) + 0.15 * c(v.agentReach, 0, 1) + 0.1 * c(v.path, 0, 100) / 100);
  },
  valueAfterTimeOut(value, yearsOut, oldTeamCollapsed) {
    const y = Math.max(0, yearsOut);
    let kept = 1;
    for (let i = 0; i < Math.floor(y); i++) kept *= 0.85;
    kept *= 1 - 0.15 * (y - Math.floor(y));
    const lost = value * (1 - kept);
    return value - lost * (oldTeamCollapsed ? 0.5 : 1);
  },
  comebackRung(lastRung, fullYearsOut) {
    return fullYearsOut >= 2 ? Math.max(0, lastRung - 1) : lastRung;
  },
  firingRegard(f) {
    let k = 1;
    if (f.firstHeadJob && f.seasonsInJob <= 2 && f.rosterQuality < 0.4) k = 0.4;
    else if (f.rosterQuality > 0.6) k = 1.5;
    return { peers: -10 * k, owners: -15 * k, payContinues: !f.forCause };
  },
  jobValue(rung, prestige) {
    return (RUNG_VALUES[c(Math.round(rung), 0, 9)] ?? 0) + c(prestige, 0, PRESTIGE_MAX);
  },
  fitLine(opening, current) {
    const d = this.jobValue(opening.rung, opening.prestige) - (current ? this.jobValue(current.rung, current.prestige) : 0);
    if (d > 30) return 'well_above';
    if (Math.abs(d) <= 5) return 'lateral';
    if (d > 0) return current && opening.rung < current.rung ? 'step_down_title_up_level' : 'step_up';
    return 'step_down';
  },
};
