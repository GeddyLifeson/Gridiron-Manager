// E8.5.1 the permitted effects, and the test; E7.4.2 rule 4 and acceptance 3. Data the static
// dependency tests read. Health, family and sleep state inform the user's own career choices and the
// coach's hours; they never change a play, a player, a staff product, a decision grade, reputation or
// how a hiring party sees a candidate.

/** Packages that may never import the life module (E8.5.1 rule 3: B, D, F, G, I, J, N3/N4 grading and
 *  L1 to L3 live in these; E7.4.2 acceptance 3: J, D and L never read sleep debt). */
export const LIFE_FORBIDDEN_PACKAGES: readonly string[] = [
  'engine-core', 'engine-game', 'officiating', 'football-lang', 'football-content', 'resolver-reference',
  'coach-ai', 'models', 'rules-data', 'league', 'people', 'front-office',
];

/** Career modules allowed to import life (E8.5.1 rule 1): life itself, wealth (E6 costs and filing
 *  status), reputation (only the E5.5.2 own career summary), market (E2.5.2 own job view and an AI job
 *  choice, E2.7.2, E2.8.1, E2.3.4). A module added later for one of these leaves joins this list in
 *  its own PR; everything else, including owner confidence (E4) and hiring (E2.3.2), stays out. */
export const LIFE_PERMITTED_CAREER_MODULES: readonly string[] = ['life', 'wealth', 'reputation', 'market'];

/** Files of this module that may read sleep debt (E7.4.1 acceptance 3: E7.4.2, E8.1.1, the display). */
export const SLEEP_DEBT_READERS: readonly string[] = ['sleep.ts', 'week.ts', 'load.ts', 'index.ts'];

/** Shapes the observer filter treats as private to the coach (no owner, player or media audience). */
export const PRIVATE_LIFE_SHAPES: readonly string[] = [
  'CoachWeek', 'LedgerRow', 'HealthRecord', 'Warning', 'Checkup', 'Household', 'LifeEvent', 'RelocationRecord', 'Load',
];
