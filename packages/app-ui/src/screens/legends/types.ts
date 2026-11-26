// The legends read-model data as the screen draws it. Same shapes as app-services/src/read-models/legends
// (schemas in its test folder until CR-G84-1 moves them to @gm/schema); app-ui imports only the
// app-services entry point, so the shapes are written here too.

export type PageKind = 'person' | 'team' | 'game' | 'competition_season' | 'trophy' | 'record' | 'position';
export interface Link { kind: PageKind; id: number }
export type SourceMark =
  | { via: 'public' }
  | { via: 'witnessed' }
  | { via: 'told'; sourcePersonId: number | null; seasonYear: number; dayIndex: number; reported: boolean };

export interface PageLine {
  eventId: number; type: string; seasonYear: number; dayIndex: number; textKey: string;
  params: Record<string, string | number | boolean | null>; links: Link[]; notability: number | null; mark: SourceMark; reversed: boolean;
}
export interface PageData {
  link: Link; seasonYear: number | null; labels: string[]; years: { first: number; last: number } | null; summariesOnly: boolean; empty: boolean;
  seasons: { seasonYear: number; notable: PageLine[]; lines: PageLine[] }[];
  tabs: { id: string; count: number }[];
}

export interface ChronicleEntry { eventId: number; type: string; notability: number | null; guaranteed: boolean }
export interface ChronicleData {
  competitionId: number; seasonYear: number; summary: { textKey: string; params: Record<string, string | number> } | null;
  sections: { section: 'preseason' | 'week' | 'postseason' | 'offseason'; week: number; entries: ChronicleEntry[]; more: ChronicleEntry[] }[];
  seasonLevelOnly: boolean;
}

export interface EraData {
  competitionId: number | null;
  blocks: {
    index: number; firstSeason: number; lastSeason: number; partial: boolean;
    teams: { teamId: number; wins: number; losses: number; ties: number; winShare: number | null; titles: number; conferenceTitles: number; headCoaches: number[]; dynasty: boolean; seasonsSinceTitle: number | null; seasonsSinceWinningSeason: number | null }[];
    rates: { teamGames: number; pointsPerTeamGame: number; passShare: number; yardsPerPlay: number; turnoversPerTeamGame: number; penaltiesPerTeamGame: number } | null;
    topEventIds: number[]; ruleMarkers: { seasonYear: number; ruleSetId: string }[];
  }[];
}

export interface TreeNode {
  personId: number; parentId: number; level: number;
  underParent: { teamId: number; role: string; firstSeason: number; lastSeason: number; hireEventIds: number[] }[];
  laterChairs: { teamId: number; role: string; level: string; firstSeason: number; lastSeason: number }[];
  becameHeadCoach: boolean; expanded: boolean;
}
export interface TreeData { rootId: number; nodes: TreeNode[]; depth: number; headCoachesProduced: number; producedByLevel: Record<string, number> }

export interface RivalryData {
  teamA: number; teamB: number; exists: boolean;
  page: {
    teamA: number; teamB: number; winsA: number; winsB: number; ties: number;
    first: { eventId: number; seasonYear: number } | null; last: { eventId: number; seasonYear: number } | null;
    current: { teamId: number | null; games: number }; longest: { teamId: number | null; games: number };
    largestA: { gameId: number; eventId: number; margin: number; seasonYear: number } | null; largestB: { gameId: number; eventId: number; margin: number; seasonYear: number } | null;
    byVenue: { venueId: number | null; meetings: number; winsA: number; winsB: number; ties: number }[];
    topGameEventIds: number[]; coaches: { personId: number; teamId: number; wins: number; losses: number; ties: number }[]; trophyKey: string | null;
  } | null;
}

export interface RecordRow { rank: number; holderId: number; value: number; teamId: number; seasonYear: number; gameId: number | null; imported: boolean }
export interface RecordsData {
  competitionId: number | null; teamId: number | null; postseason: boolean;
  lists: { categoryId: string; scope: 'game' | 'season' | 'career'; postseason: boolean; minimum: { per: string; value: number; perTeamGame: boolean; factId: string } | null; thisWorld: RecordRow[]; allTime: RecordRow[]; vacated: RecordRow[] }[];
}

export interface SearchData {
  text: string;
  rows: { kind: 'person' | 'team' | 'competition_season' | 'trophy'; id: number; first: string; last: string; birthYear: number | null; role: string | null; lastTeamId: number | null; match: 'exact' | 'prefix' | 'fuzzy' | 'all' }[];
}

export const LEGENDS_TABS = ['page', 'chronicle', 'eras', 'tree', 'rivalry', 'records', 'search'] as const;
export type LegendsTab = (typeof LEGENDS_TABS)[number];

/** Data for the screen; a model not yet loaded is null and its tab shows a waiting line. */
export interface LegendsData {
  page: PageData | null;
  chronicle: ChronicleData | null;
  eras: EraData | null;
  tree: TreeData | null;
  rivalry: RivalryData | null;
  records: RecordsData | null;
  search: SearchData | null;
  /** Display names by link key (`person:12`), from the public read models; ids show when a name is missing. */
  names: Record<string, string>;
  /** Event line templates by text key, from the content template store (G-08). */
  lineText: Record<string, string>;
}
