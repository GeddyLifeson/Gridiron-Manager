// Every real-world number in this module, with where it comes from (project rule: every number is
// sourced from cited research, otherwise it is a named Assumption). Statuses are copied from the fact
// register (facts/measured-rate.json) or the research file named; they are never typed from memory.
// Values that are design starting points carry status 'Assumption' and say which leaf states them.

export type SourceStatus = 'Verified' | '2 of 3' | '1 of 3' | 'Unverified' | 'Conflict' | 'Assumption';

export interface SourcedNumber {
  readonly value: number;
  readonly status: SourceStatus;
  /** Fact register row, when one exists. */
  readonly factId?: string;
  /** Bible leaf or research file that states the value. */
  readonly citation: string;
}

const fact = (value: number, factId: string, status: SourceStatus, citation: string): SourcedNumber => ({ value, factId, status, citation });
const assume = (value: number, citation: string): SourcedNumber => ({ value, status: 'Assumption', citation });

const RK1 = 'research/audit-r-calibration-verify.md section 13 Rk1 (nflverse 2022-24, 96 team-seasons)';

/** Pro league means the population's system priors must reproduce (K2.1.2, J15.3.2, J15.8.3). */
export const PRO_TARGETS = {
  shotgun: fact(0.7, 'F-measured-rate-0064', '1 of 3', 'J15.3.2'),
  noHuddle: fact(0.105, 'F-measured-rate-0065', '1 of 3', 'J15.3.2'),
  /** PFF definition (score within 3, outside two- and four-minute situations), 2024. The 55.2% in K2.1.2 is retired (J15.3.2 verification pass). */
  neutralPass: fact(0.573, 'F-measured-rate-0068', '2 of 3', 'J15.3.2, J15.8.3'),
  playAction: fact(0.215, 'F-measured-rate-0259', '1 of 3', 'J15.8.3, K4.3.7'),
  screen: fact(0.096, 'F-measured-rate-0263', '1 of 3', 'J15.8.3'),
  motion: fact(0.44, 'F-measured-rate-0267', '1 of 3', 'J15.8.3'),
  /** Five or more rushers. No register row yet: research file only. */
  blitz: { value: 0.256, status: '1 of 3', citation: RK1 } as SourcedNumber,
  p11: fact(0.632, 'F-measured-rate-0231', '1 of 3', 'J15.8.3'),
  p12: fact(0.213, 'F-measured-rate-0232', '1 of 3', 'J15.8.3'),
  p21: fact(0.073, 'F-measured-rate-0233', '1 of 3', 'J15.8.3'),
  p13: fact(0.037, 'F-measured-rate-0234', '1 of 3', 'J15.8.3'),
  p22: fact(0.02, 'F-measured-rate-0235', '1 of 3', 'J15.8.3'),
  p10: fact(0.008, 'F-measured-rate-0236', '1 of 3', 'J15.8.3'),
} as const;

/** Real team-level spreads (estimated true SD across team-seasons), K2.3.1 rule 3. */
export const PRO_TEAM_SPREADS = {
  /** Under the win-probability 20 to 80 definition (mean 51.6%), used for the spread only. */
  neutralPass: { value: 0.047, status: '1 of 3', citation: RK1 } as SourcedNumber,
  playAction: { value: 0.047, status: '1 of 3', citation: RK1 } as SourcedNumber,
  blitz: { value: 0.069, status: '1 of 3', citation: RK1 } as SourcedNumber,
} as const;

/** Coach-decision rates owed to the engine batch run (K2.3.1 rule 2), listed so the report shows them. */
export const DECISION_TARGETS_OWED = {
  fourthDownPunt: fact(0.553, 'F-measured-rate-0056', '1 of 3', 'J15.3.2'),
  fourthDownFieldGoal: fact(0.253, 'F-measured-rate-0057', '1 of 3', 'J15.3.2'),
  fourthDownGo: fact(0.194, 'F-measured-rate-0058', '1 of 3', 'J15.3.2'),
  timeoutsPerGameBothTeams: fact(7.7, 'F-measured-rate-0017', '1 of 3', 'J15.8.3'),
  twoPointAttemptsPerGameBothTeams: fact(0.48, 'F-measured-rate-0069', '1 of 3', 'J15.3.2'),
  collegeFourthDownGo: fact(0.251, 'F-measured-rate-0328', '1 of 3', 'T12.4.1, K2.1.3'),
} as const;

/** Size of the coach effect (K2.3.2): measured by the batch harness once K3 to K5 exist. */
export const COACH_EFFECT = {
  winsPer16GamesLow: { value: 0.5, status: '1 of 3', citation: 'K2.3.2 rule 2 (Goff et al. 2019, cited secondhand)' } as SourcedNumber,
  winsPer16GamesHigh: { value: 1.2, status: '1 of 3', citation: 'K2.3.2 rule 2 (Goff et al. 2019, cited secondhand)' } as SourcedNumber,
  winsPer16GamesPoint: fact(0.85, 'F-measured-rate-0274', '1 of 3', 'J15.9.1'),
} as const;

/** Named starting values. Each is a design Assumption stated in the leaf cited. */
export const ASSUMPTIONS = {
  /** K2.2.1 rule 1: a former quarterback leans offense at weight 0.8 (applied to every offensive position). */
  offenseLeanFromOffensivePlayer: assume(0.8, 'K2.2.1 rule 1'),
  /** K2.2.1 rule 3: individual noise SD on behaviour parameters, in z. */
  behaviorNoiseSd: assume(0.5, 'K2.2.1 rule 3'),
  /** K2.2.1 rule 4 correlations. */
  corrFourthDownWithRiskTolerance: assume(-0.5, 'K2.2.1 rule 4'),
  corrPreparationWithWorkHabits: assume(0.4, 'K2.2.1 rule 4'),
  corrAnalyticsTrustWithAge: assume(-0.3, 'K2.2.1 rule 4'),
  /** K2.2.1 rule 5: first-year play caller's `adjustment` and `clockManagement` mean offset, in z. */
  firstYearCallerOffset: assume(-0.5, 'K2.2.1 rule 5'),
  /** K2.2.1 rule 5: wider spread for parameters a person has not yet used (multiplier on SD). */
  unusedParameterSpread: assume(1.2, 'K2.2.1 rule 5 ("wider spread", size not stated)'),
  /** K2.3.2 rule 5: college behaviour spread is 1.25 times pro until T12 gives a band. */
  collegeBehaviorSpread: assume(1.25, 'K2.3.2 rule 5'),
  /** X1.2.1 rule 2: 75 to 80% of a facet in 40 to 60 implies SD about 8.3 facet points (10 / 1.2). */
  facetPointsPerZ: assume(8.3, 'X1.2.1 rule 2 (neutral band share)'),
  /** K2.5.2 rule 4: tendencies inherit at weight 0.25 from mentors. */
  tendencyInheritWeight: assume(0.25, 'K2.5.2 rule 4'),
  /** K2.5.1 rule 2: growth per season in use, mean and SD in z, halved after 5 seasons in role. */
  growthMean: assume(0.1, 'K2.5.1 rule 2'),
  growthSd: assume(0.1, 'K2.5.1 rule 2'),
  growthHalvingSeasons: assume(5, 'K2.5.1 rule 2'),
  /** K2.5.1 rule 3: age decline starts at 62, -0.05 z per season on adjustment and preparation. */
  declineStartAge: assume(62, 'K2.5.1 rule 3'),
  declinePerSeason: assume(-0.05, 'K2.5.1 rule 3'),
  /** K2.5.1 rule 4: tendency step toward the best-scoring value, 10% of the gap. */
  tendencyLearnStep: assume(0.1, 'K2.5.1 rule 4'),
  /** K2.5.1 rule 6: chance per rate field per season of adopting a seen element, moving 25% of the way. */
  systemAdoptChance: assume(0.05, 'K2.5.1 rule 6'),
  systemAdoptStep: assume(0.25, 'K2.5.1 rule 6'),
  /** K2.1.5 rules 3 and 4: memory half-life in seasons and rows kept per caller. */
  memoryHalfLifeSeasons: assume(2, 'K2.1.5 rule 3'),
  memoryRowsPerCaller: assume(40, 'K2.1.5 rule 4'),
} as const;
