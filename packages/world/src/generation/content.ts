// The content a world is built from (G-11 world data, G-18 name tables, G-10 league rules), as plain
// typed inputs. World generation never reads a file: the composition root passes these in, and
// `./default-content.ts` binds the repo's own JSON for the shells and tools.
import type { PersonRecord } from '@gm/schema';

export interface ContentStadium {
  readonly id: string; readonly name: string; readonly capacity: number; readonly roof: string;
  readonly surface: { readonly type: string }; readonly noiseFactor: number;
}
export interface ContentClub {
  readonly id: string; readonly city: string; readonly nickname: string; readonly abbreviation: string;
  readonly primaryColour: string; readonly secondaryColour: string; readonly divisionId: string; readonly stadiumId: string;
  readonly marketTier: number; readonly referenceLocationId: string;
}
export interface ContentProLeague {
  readonly league: {
    readonly id: string; readonly name: string;
    readonly conferences: readonly { readonly id: string; readonly name: string; readonly divisions: readonly { readonly id: string; readonly label: string }[] }[];
    readonly clubs: readonly ContentClub[];
  };
  readonly stadiums: readonly (ContentStadium & { readonly clubId: string; readonly altitudeM: number; readonly latitude: number; readonly longitude: number; readonly timeZone: string })[];
  readonly rivalries: readonly { readonly a: string; readonly b: string; readonly strength: number }[];
}
export interface ContentSchool {
  readonly id: string; readonly name: string; readonly place: string; readonly nickname: string; readonly abbreviation: string;
  readonly primaryColour: string; readonly secondaryColour: string; readonly conferenceId: string | null; readonly level: string;
  readonly region: string; readonly latitude: number; readonly longitude: number; readonly altitudeM: number; readonly timeZone: string;
  readonly referenceLocationId: string; readonly sizeTier: number; readonly footballHistoryLevel: number; readonly stadium: ContentStadium;
}
export interface ContentCollege {
  readonly levels: readonly { readonly id: string; readonly teams: number | null }[];
  readonly conferences: readonly { readonly id: string; readonly name: string; readonly level: string; readonly memberIds: readonly string[] }[];
  readonly independents: readonly string[];
  readonly schools: readonly ContentSchool[];
  readonly rivalries: readonly { readonly a: string; readonly b: string; readonly strength: number }[];
}
export interface ContentLocation { readonly id: string; readonly region: string; readonly lat: number; readonly lon: number; readonly elevationM: number; readonly timeZone: string }

/** Per competition level: rule ids, staff catalogue level and the numbers generation reads. Keyed by level so no code branches on a level word (P1.3.3). */
export interface LevelSpec {
  readonly ruleSetId: string;
  readonly leagueRulesId: string;
  /** Roster limit on the first day (C5.1.1 or T5.1.1), read from the league rules file by the caller. */
  readonly rosterLimit: number;
  /** Regular-season games per team, for the first culture expectation (X9.2.1). */
  readonly seasonGames: number;
  /** Position code to count on real rosters (./data/roster-mix.json). */
  readonly rosterMix: Readonly<Record<string, number>>;
  /** Staff limits by rule key (career positions `limitsFrom`). */
  readonly staffLimits: Readonly<Record<string, number>>;
  /** Boss chairs created with each team (L5, T9). */
  readonly bossChairs: readonly ('owner' | 'athletic_director' | 'president')[];
  /** Founding player ages: 'curve' is the X10.2.2 rule 1 quantile curve, 'class_years' is rule 2. */
  readonly ageModel: 'curve' | 'class_years';
  /**
   * Talent request for one founding player (D13.2.1), drawing from the slot's stream where the level uses tiers.
   * `programZ` is the team's program strength (founding `programStrength`, T12.2.1) where the level ranks
   * programs; a level that ignores it draws every team from one mix.
   */
  readonly talent: (s: import('@gm/schema').RandomStream, programZ?: number) => import('@gm/people').generator.Talent;
  /** Founding ranks this level's teams by program strength (college: T12.2.1 talent gap between programs). */
  readonly programStrength?: boolean;
  /** X1.2.1 population group for players at this level. */
  readonly playerGroup: string;
  /** L3 violation class ids of the level (content), for the culture record. */
  readonly violationClasses: readonly string[];
}

/**
 * A6.2.2 list, with its combination rule: an ordinary-word nickname is blocked only together with the
 * real team's place, and a real team city only together with a real nickname. Whole phrases (league,
 * conference, event and trophy names) are blocked wherever they appear.
 */
export interface BlockedTerms {
  readonly phrases: readonly string[];
  readonly realCities: readonly string[];
  readonly realNicknames: readonly string[];
  readonly schoolPairs: readonly { readonly school: string; readonly nickname: string }[];
}

export interface WorldContent {
  readonly contentVersion: string;
  readonly pro: ContentProLeague;
  readonly college: ContentCollege;
  readonly locations: readonly ContentLocation[];
  /** A6.2.2 blocked terms. A team identity that hits the list fails the build. */
  readonly blockedTerms: BlockedTerms;
  /** College level ids kept by each size preset, in order (X10.2.1 rule 2). The pro league is never shrunk. */
  readonly collegeLevelsBySize: Readonly<Record<string, readonly string[]>>;
  readonly levels: Readonly<Record<'pro' | 'college', LevelSpec>>;
  /** Regular-season games where a college level differs from its `LevelSpec` (T3.1.1), by level id. */
  readonly seasonGamesByLevelId?: Readonly<Record<string, number>>;
  /** Label ids the label engine can form (X2.2.1), for culture preferences. */
  readonly labelIds: readonly string[];
  /** Real jurisdiction tax profiles with draw weights (E6.2.2). Empty until the table is wired: places then carry none. */
  readonly taxProfiles: readonly { readonly id: string; readonly weight: number }[];
}

/** Names for generated people (G-18 tables bound by the caller). Returns a name that is no real current person's. */
export type PersonNameSource = (s: import('@gm/schema').RandomStream, birthYear: number) => PersonRecord['name'];
