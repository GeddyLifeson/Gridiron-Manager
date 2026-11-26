// Tuning constants and rule keys of the coaching school (G-94, bible N5.1, N5.3 to N5.6).
// Every "starting" number in N5 is a row here; values the bible does not give are marked assumption.
import type { ParamFile, RuleKeyManifest, TuningParam } from '@gm/schema';

/** Rule values the school reads (callers pass them in a TeachingRules object; see `rules.ts`). */
export const RULE_KEYS: RuleKeyManifest = [
  { key: 'clock.play_clock_s', type: 'number', unit: 's', meaning: 'Play clock after a play that ends with the clock running (N5.3.1 rep length, N5.3.3 kneel arithmetic).', ownerLeaf: 'B1', readBy: ['app-services.teaching'] },
  { key: 'clock.play_clock_after_stoppage_s', type: 'number', unit: 's', meaning: 'Play clock after an administrative stoppage (N5.3.1 rep after a timeout).', ownerLeaf: 'B1', readBy: ['app-services.teaching'] },
  { key: 'clock.two_minute_timeout', type: 'boolean', meaning: 'The clock stops at two minutes in each half (pro two-minute warning, college two-minute timeout) (N5.3.3).', ownerLeaf: 'B1', readBy: ['app-services.teaching'] },
  { key: 'timeout.per_half', type: 'number', unit: 'count', meaning: 'Charged team timeouts per half (N5.3.3 problem bounds).', ownerLeaf: 'B1', readBy: ['app-services.teaching'] },
  { key: 'comm.c2p_allowed', type: 'boolean', meaning: 'Coach-to-player helmet radio is allowed (N5.3.1: radio cut-off or signals).', ownerLeaf: 'B13.13.1', readBy: ['app-services.teaching'] },
  { key: 'comm.c2p_cutoff_seconds', type: 'number', unit: 's', meaning: 'Play clock reading at which the helmet radio cuts off (N5.3.1 rule 1).', ownerLeaf: 'B13.13.1', readBy: ['app-services.teaching'] },
];

const rows: TuningParam[] = [];
function add(name: string, value: number, min: number, max: number, unit: string, basis: 'bible' | 'assumption', leaf: string, constrainedBy: string): void {
  rows.push({ name: `teaching.${name}`, value, min, max, unit, belongsTo: 'app-services.teaching', basis, leaf, constrainedBy, status: 'starting' });
}

// N5.1.1: placement test "starting 20 questions and 6 scenarios".
add('placementQuestions', 20, 1, 100, 'count', 'bible', 'N5.1.1', 'N5.1.1: about 20 minutes');
add('placementScenarios', 6, 0, 50, 'count', 'bible', 'N5.1.1', 'N5.1.1: about 20 minutes');
// N5.1.2 rule 1: "starting 200 seeds".
add('scenarioSeeds', 200, 10, 10000, 'count', 'bible', 'N5.1.2', 'N5.1.2 acceptance: stored best answer with margin and seed count');
// N5.1.2 rule 2: no credit beyond "3 win-probability points or 0.5 expected points lost".
add('zeroCreditWp', 0.03, 0.005, 0.2, 'ratio', 'bible', 'N5.1.2', 'N5.1.2 rule 2');
add('zeroCreditEp', 0.5, 0.05, 3, 'points', 'bible', 'N5.1.2', 'N5.1.2 rule 2');
// N5.1.2 rule 3: pass at 70 percent; mastered at 90 percent on two attempts with different draws.
add('passShare', 0.7, 0.3, 1, 'ratio', 'bible', 'N5.1.2', 'N5.1.2 rule 3');
add('masteredShare', 0.9, 0.5, 1, 'ratio', 'bible', 'N5.1.2', 'N5.1.2 rule 3');
add('masteredAttempts', 2, 1, 10, 'count', 'bible', 'N5.1.2', 'N5.1.2 rule 3');
// N5.1.2 rule 4: the pack holds "starting 5 times" the situations one attempt uses.
add('packMultiple', 5, 2, 50, 'ratio', 'bible', 'N5.1.2', 'N5.1.2 acceptance: two attempts differ at least 80 percent of the time');
// N5.2.1: underline goes after the term is opened "a starting 2 times".
add('underlineOpens', 2, 1, 20, 'count', 'bible', 'N5.2.1', 'N5.2.1');
// N5.3.1: a session is "a starting 20 reps".
add('callSpeedReps', 20, 5, 100, 'count', 'bible', 'N5.3.1', 'N5.3.1: about 10 minutes');
// N5.3.2: "a starting 15 clips"; rule 3: "starting 50 percent weak areas".
add('recognitionClips', 15, 5, 100, 'count', 'bible', 'N5.3.2', 'N5.3.2');
add('weakShare', 0.5, 0, 1, 'ratio', 'bible', 'N5.3.2', 'N5.3.2 acceptance: weak-area weighting changes the next mix');
// N5.3.4: "a starting 12 looks".
add('protectionLooks', 12, 4, 100, 'count', 'bible', 'N5.3.4', 'N5.3.4');
// N5.3.3 kneel arithmetic. N5 gives no figure for how much game clock a kneel takes from snap to dead ball,
// nor how much play clock an offense leaves when it snaps. Module author's starting values; the engine's
// kneel play replaces them in the acceptance run (1,000 problems equal to engine simulation; owed, README).
add('kneelPlaySeconds', 2, 0, 10, 's', 'assumption', 'N5.3.3', 'N5.3.3 acceptance: stored answer equals engine simulation of the kneels');
add('snapMarginSeconds', 1, 0, 10, 's', 'assumption', 'N5.3.3', 'N5.3.3 acceptance: stored answer equals engine simulation of the kneels');
// N5.4.1 rule 4: "improved" when the rate over the next "starting 6 games" falls inside the band.
add('improveGames', 6, 1, 40, 'count', 'bible', 'N5.4.1', 'N5.4.1 rule 4');
// N5.6.1: "why" may be asked "a starting 3 times per game review".
add('whyPerReview', 3, 0, 20, 'count', 'bible', 'N5.6.1', 'N5.6.1 rule 3: asking costs staff time');
// N5.6.1 rule 1: "the top reason codes that fired". N5 gives no count; a full answer gives this many,
// a low-openness coach the top one only (edge case). Module author's starting value.
add('whyReasons', 3, 1, 10, 'count', 'assumption', 'N5.6.1', 'N5.6.1 acceptance: every answer maps to stored reason codes');

export const PARAMS: ParamFile = { module: 'app-services.teaching', version: 'g94.1', params: rows };

export function param(name: string): number {
  const r = rows.find((x) => x.name === `teaching.${name}`);
  if (!r) throw new Error(`unknown parameter teaching.${name}`);
  return r.value;
}
