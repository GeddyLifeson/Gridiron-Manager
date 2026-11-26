// Career screen read-model shapes (G-85; O7.1.1, O7.2, O7.6.1, O4.6). Structural copies of the core views
// (career/ladder `SeatView`, `AssignmentRow`; career/market `Opening`, `OfferCard`, `Sign`, `ACTIVITY`),
// because app-ui imports only the app-services entry point. Every number shown is a count, money, a date
// or a result from the logs; no skill value, level number or projected grade reaches these screens
// (E9.1.2, A3 ruling 21, MA-48).

export type ScreenState = 'yours' | 'assigned' | 'suggest' | 'read';

/** Rights the seat holds; a control renders only when its command is in here (O7.1.1). */
export interface Rights { readonly rights: readonly string[] }

export interface AssignmentRowView {
  readonly dutyId: string; readonly title: string; readonly leaf: string;
  readonly assignedBy: 'boss' | 'self';
  readonly due: { readonly day: string; readonly time: string } | null;
  readonly hoursEst: number; readonly state: ScreenState;
  readonly status: 'open' | 'submitted' | 'graded' | 'late';
  readonly screenId: string; readonly command: string | null;
  /** Graded results come back with a mark and one line (O7.2.1). */
  readonly grade?: { readonly mark: string; readonly feedback: string } | null;
}
export interface AssignmentsView extends Rights {
  readonly jobTitle: string; readonly bossName: string | null;
  readonly freeHours: number; readonly rows: readonly AssignmentRowView[];
}

// ---------- coach.career (O7.6.1, O4.6.1) ----------

export interface LadderRungView { readonly rung: number; readonly title: string; readonly current: boolean; readonly held: boolean }
export interface CareerStint { readonly season: number; readonly endSeason: number | null; readonly jobTitle: string; readonly team: string; readonly level: string; readonly how: string }
export interface NetworkPerson { readonly name: string; readonly together: string; readonly nowJob: string; readonly nowTeam: string; readonly imported: boolean }
export interface ReputationLine { readonly group: 'players' | 'coaches' | 'owners' | 'media' | 'fans'; readonly word: string; readonly reasons: readonly string[] }
export interface CareerView extends Rights {
  readonly name: string; readonly level: string; readonly jobTitle: string;
  readonly ladder: { readonly college: readonly LadderRungView[]; readonly pro: readonly LadderRungView[] };
  readonly history: readonly CareerStint[];
  readonly network: readonly NetworkPerson[];
  readonly reputation: readonly ReputationLine[];
  /** Graduate assistant term (S3.3.4) when he holds that seat: classes and years left in words. */
  readonly enrolment: { readonly line: string } | null;
}

// ---------- coach.job_market (O7.6.1, E2.3, S6.5, E4.4.1, E2.7.2) ----------

export type FitLine = 'step_up' | 'lateral' | 'step_down' | 'step_down_title_up_level' | 'well_above';
export interface OpeningView {
  readonly id: number; readonly level: string; readonly team: string; readonly rung: number; readonly title: string;
  readonly side: string; readonly region: string; readonly party: string; readonly reason: string; readonly stage: string;
  readonly payCents: number | null; readonly fit: FitLine; readonly applied: boolean;
}
export interface OfferCardView {
  readonly offerId: number; readonly team: string; readonly level: string; readonly title: string; readonly rung: number;
  readonly salaryCents: number; readonly years: number; readonly callsPlays: boolean;
  readonly bossReportKeys: readonly string[]; readonly staffSecurityKey: 'stable' | 'uncertain' | 'likely_purge';
  readonly whatChanges: readonly string[]; readonly offsetNote: boolean;
  readonly deadline: string; readonly state: string;
}
export interface SignSeen { readonly sign: string; readonly date: string; readonly source: string }
export interface YearOutOption { readonly id: string; readonly weeklyHours: number; readonly onField: boolean }
export interface JobMarketView extends Rights {
  /** The hiring calendar gates the screen (S6, E2): outside a window the board still shows, applying waits. */
  readonly windowOpen: boolean; readonly windowLine: string;
  readonly openings: readonly OpeningView[];
  readonly applications: readonly { readonly openingId: number; readonly route: string; readonly date: string; readonly response: string | null }[];
  readonly interviews: readonly { readonly openingId: number; readonly date: string; readonly with: string; readonly stage: string }[];
  readonly offers: readonly OfferCardView[];
  readonly signs: readonly SignSeen[];
  /** Year-out choices, shown only when he holds no job. */
  readonly yearOut: readonly YearOutOption[] | null;
}

// ---------- coach.contract (O4.6.1, E3) ----------

export interface ContractView extends Rights {
  readonly team: string | null; readonly jobTitle: string | null;
  readonly terms: readonly { readonly label: string; readonly value: string }[];
  readonly yearsLeft: number | null;
  readonly clauses: readonly string[];
}

// ---------- coach.record (O4.6.1, E9.1.2, N4) ----------

export interface SeasonRecordRow { readonly season: number; readonly team: string; readonly jobTitle: string; readonly wins: number; readonly losses: number; readonly ties: number; readonly finish: string }
export interface RecordFamily { readonly family: string; readonly lines: readonly string[] }
export interface RecordView extends Rights {
  readonly seasons: readonly SeasonRecordRow[];
  /** Demonstrated record in words, computed from the logs when shown; empty family reads "no record". */
  readonly families: readonly RecordFamily[];
  readonly certified: readonly { readonly season: number; readonly result: string }[];
}

// ---------- coach.finance (O4.6.2, E6) ----------

export interface MoneyRange { readonly lowCents: number; readonly midCents: number; readonly highCents: number }
export interface FinanceView extends Rights {
  readonly currency: string;
  readonly netWorth: readonly { readonly date: string; readonly cents: number }[];
  readonly income: readonly { readonly source: string; readonly cents: number }[];
  readonly taxes: readonly { readonly place: string; readonly cents: number }[];
  readonly spending: readonly { readonly item: string; readonly cents: number }[];
  readonly holdings: readonly { readonly name: string; readonly risk: string; readonly valueCents: number; readonly returnPct: number }[];
  readonly advisers: readonly { readonly name: string; readonly feeLine: string }[];
  readonly offers: readonly { readonly id: string; readonly kind: string; readonly terms: string; readonly deadline: string }[];
  readonly plan: { readonly savingRatePct: number; readonly risk: string };
  /** Every projection shows a range (O4.6.2). */
  readonly projection: { readonly years: number; readonly range: MoneyRange } | null;
}

// ---------- coach.life (O4.6.3, E7, E8) ----------

export interface LifeView extends Rights {
  readonly week: string;
  readonly hours: readonly { readonly task: string; readonly hours: number }[];
  readonly hoursAvailable: number;
  readonly sleep: { readonly word: string; readonly trend: 'better' | 'same' | 'worse' };
  readonly energy: { readonly word: string; readonly trend: 'better' | 'same' | 'worse' };
  readonly health: readonly string[];
  readonly family: readonly { readonly event: string; readonly date: string; readonly owed: string | null }[];
  readonly template: readonly { readonly task: string; readonly hours: number }[];
  /** Every active effect of his state, each with what it touches (O4.6.3 acceptance). */
  readonly effects: readonly { readonly id: string; readonly line: string }[];
}
