// E6.12.1 the firewall: money never changes football. This file is the data the static test reads.

/** Packages that may never import the wealth module, nor any career export that carries money. */
export const FORBIDDEN_PACKAGES: readonly string[] = [
  'engine-core', 'engine-game', 'officiating', 'football-lang', 'football-content', 'resolver-reference',
  'coach-ai', 'models', 'rules-data', 'league', 'people', 'front-office',
];

/** Career modules allowed to read wealth (E6.12.1 rule 3): the career summary (E5.5, in `reputation`)
 *  and household satisfaction (E8, in `life`). Job views of take-home (E2.5.2) and own retirement
 *  choices (E2.7.2, E2.8.1) read it through these same exports; market value and interviews (E2.4),
 *  owner confidence (E4) and the job-security model may not. */
export const PERMITTED_CAREER_MODULES: readonly string[] = ['wealth', 'reputation', 'life'];

/** Names of the money shapes the firewall protects (E6.12.1 rule 1). */
export const PROTECTED_SHAPES: readonly string[] = [
  'BalanceSheet', 'LedgerEntry', 'Liability', 'Holdings', 'Home', 'Lease', 'SecurityView', 'SecurityStatus', 'LifestyleState', 'LifestyleTier',
];

/** Shown on the Money screen (E6.12.1). */
export const FIREWALL_LINE = 'Your finances do not affect your team';
