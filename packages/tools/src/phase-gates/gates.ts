// R1.2.3 to R1.2.6 phase gates (phases 2 to 5), one row per numbered gate item, each bound to the check that
// runs it. Phase 0 is `npm run check`, phase 1 is `npm run gate`, phase 6 is the season gate
// (`headless/src/season-gate/cli.ts gate`). Every level-tagged suite runs under both rule sets.
import { aiDecisionRates, battery, command, factsAtThree, missing, vitest, type CheckResult, type RunContext } from './checks.ts';

export interface GateItem {
  readonly phase: number;
  readonly leaf: string;
  readonly item: number;
  readonly text: string;
  /** Who owns the missing part (module or thread). */
  readonly owner: string;
  readonly run: (ctx: RunContext) => CheckResult;
}

const LANG = ['packages/football-lang/test/lang/validate.test.ts', 'packages/football-lang/test/legality/generators.test.ts', 'packages/football-lang/test/legality/cases.test.ts'];
const CONTENT = ['packages/football-content/test/starter/starter.test.ts', 'packages/football-content/test/full/full.test.ts', 'packages/football-content/test/full/more.test.ts', 'packages/football-content/test/college/college.test.ts'];

export const GATE_ITEMS: readonly GateItem[] = [
  // Phase 2 (R1.2.3)
  { phase: 2, leaf: 'R1.2.3', item: 1, text: 'Q1.2.1: every shipped play and call validates; Q1.1.3 legality generators pass under both rule sets', owner: 'football-lang, football-content', run: () => vitest([...LANG, ...CONTENT]) },
  { phase: 2, leaf: 'R1.2.3', item: 2, text: 'Every shipped formation draws with the A4.4.1 symbols, checked against stored reference images', owner: 'O6.3 field view (app-ui field-view)', run: () => missing('No test compares formation drawings with stored reference images: no test names A4.4.1 or reference images (searched packages/*/test).') },
  { phase: 2, leaf: 'R1.2.3', item: 3, text: 'A play can be stepped through with each player\'s assignment shown', owner: 'O2.3 field view / G-63 film', run: () => missing('No test steps a play with each player\'s assignment shown (searched app-ui and app-services tests for assignment stepping).') },
  { phase: 2, leaf: 'R1.2.3', item: 4, text: 'The interface framework choice is final (P1.4.1)', owner: 'Marlon / architect (record in scripts/release/data/evidence.json)', run: () => missing('A decision record, not a test: needs an evidence.json entry for bible:P1.4.1 with three confirmations.') },
  // Phase 3 (R1.2.4)
  { phase: 3, leaf: 'R1.2.4', item: 1, text: 'Q1.7.1 contest tests pass for every pass-game contest', owner: 'engine-core contests', run: () => vitest(['packages/engine-core/test/contest/contests.test.ts', 'packages/engine-core/test/contest/common.test.ts']) },
  { phase: 3, leaf: 'R1.2.4', item: 2, text: 'Q1.7.2 play level: passing targets by depth band match (rows measured first, R3.2.1)', owner: 'calibration (headless calibration-play) + data research', run: () => factsAtThree('measured-rate.json', /depth|air yards|deep pass|short pass/i, 'pass depth-band targets') },
  { phase: 3, leaf: 'R1.2.4', item: 3, text: 'Q3.2.1 pass game and Q3.2.2 pressure and protection items pass in direction and ordering', owner: 'battery bindings (season-gate battery) after WP-23', run: (c) => battery(['Q3.2.1', 'Q3.2.2'], c) },
  { phase: 3, leaf: 'R1.2.4', item: 4, text: 'Q1.7.3 rating-response sweeps are monotonic for pass contests', owner: 'headless `sweep` subcommand (listed as later in headless/src/cli.ts)', run: () => missing('The headless `sweep` subcommand is not built (cli.ts lists it under "later").') },
  { phase: 3, leaf: 'R1.2.4', item: 5, text: 'P6.1.1 play budget met', owner: 'G-97 bench', run: () => command(['packages/headless/src/cli.ts', 'bench', '--tier', 'change'], 'change-tier bench against the stored baseline') },
  { phase: 3, leaf: 'R1.2.4', item: 6, text: 'Q5.1.1 football review started if reviewers exist; else evidence level 0, not blocking', owner: 'Q5 coach validation', run: () => ({ status: 'NOT_BLOCKING', evidence: 'No reviewers are recorded (R2.2.2): the gate records evidence level 0 (Q5.5.1) and does not block.' }) },
  // Phase 4 (R1.2.5)
  { phase: 4, leaf: 'R1.2.5', item: 1, text: 'Q1.7.2 play and game level pass with the tick engine in place of the reference resolver, both rule sets', owner: 'WP-23 tick resolver; integrator wires it into batch resolvers', run: () => missing('The batch resolver table has no tick resolver ("tick: () => TICK_RESOLVER" is commented out in headless/src/batch/resolvers.ts), so no game runs on the tick engine.') },
  { phase: 4, leaf: 'R1.2.5', item: 2, text: 'Q3.2.3 run game items pass', owner: 'battery bindings after WP-23', run: (c) => battery(['Q3.2.3'], c) },
  { phase: 4, leaf: 'R1.2.5', item: 3, text: 'Q1.3.2 diff runner: tick engine and reference resolver agree on game-level distributions', owner: 'headless diff + WP-23', run: () => { const t = vitest(['packages/headless/test/diff/diff.test.ts']); return t.status === 'PASS' ? { status: 'NOT_RUN', evidence: `${t.evidence}. The diff runner works, but there is no tick resolver to compare with the reference.` } : t; } },
  { phase: 4, leaf: 'R1.2.5', item: 4, text: 'Foul and injury rates from play meet their J10 and J15 rows', owner: 'calibration + data research', run: () => factsAtThree('measured-rate.json', /penalt|foul|injur/i, 'foul and injury rate targets') },
  { phase: 4, leaf: 'R1.2.5', item: 5, text: 'Q1.3.1 still passes', owner: 'schema integrator (golden)', run: () => command(['packages/headless/src/cli.ts', 'gate'], 'headless golden gate') },
  // Phase 5 (R1.2.6)
  { phase: 5, leaf: 'R1.2.6', item: 1, text: 'Q4.1.1, Q4.1.2, Q4.2.1, Q4.2.2: no dominant strategy, no information leak', owner: 'G-86 exploit search', run: () => vitest(['packages/headless/test/exploit/exploit.test.ts']) },
  { phase: 5, leaf: 'R1.2.6', item: 2, text: 'Q1.4.1 and Q1.4.2: the AI and the screens read no hidden truth', owner: 'observer (app-services), D6 scouting', run: () => vitest(['packages/app-services/test/observer/audit.test.ts', 'packages/app-services/test/observer/filter.test.ts', 'packages/people/test/scouting/no-truth.test.ts']) },
  { phase: 5, leaf: 'R1.2.6', item: 3, text: 'Q3.2.4 game management items pass', owner: 'battery bindings (win probability model, G-59 policy seat)', run: (c) => battery(['Q3.2.4'], c) },
  { phase: 5, leaf: 'R1.2.6', item: 4, text: 'AI decision rates (fourth down, two-point tries, timeouts) meet their J15 rows; modern fourth-down rates at three sources first', owner: 'coach AI K4/K5 binding + data research (fourth-down rows)', run: (c) => {
    const f = factsAtThree('measured-rate.json', /fourth|4th|two-point/i, 'fourth-down and two-point targets');
    const m = aiDecisionRates(c);
    const status = f.status === 'PROVISIONAL' || f.status === 'MISSING' ? f.status : m.status;
    return { status, levels: f.levels ?? {}, evidence: `${f.evidence}. ${m.evidence}` };
  } },
  { phase: 5, leaf: 'R1.2.6', item: 5, text: 'Q1.5.2: a full game played start to finish by keyboard alone', owner: 'G-60 console', run: () => vitest(['packages/app-services/test/game-calling/full-game.test.ts', 'packages/tools/test/playtest/playtest.test.ts']) },
  { phase: 5, leaf: 'R1.2.6', item: 6, text: 'No command or setting stops or slows the play clock outside the rule book\'s stoppages', owner: 'G-60 console, G-98 settings', run: () => { const t = vitest(['packages/app-services/test/game-calling/full-game.test.ts', 'packages/officiating/test/clock/clock.test.ts']); return t.status === 'PASS' ? { status: 'PROVISIONAL', evidence: `${t.evidence}. The keyboard game proves the clock runs through every key, but no test sweeps every command and setting (G-98 settings, game management panel) against the play clock.` } : t; } },
];
