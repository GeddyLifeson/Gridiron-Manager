// Tuning constants and rule keys of the reference resolver (J1.6.3, build plan WP-08, contract D-09).
//
// Every number the resolver uses is a row here. `basis: 'bible'` means the named leaf states the value;
// the leaf's own status applies (build plan section 4: only points per game and the pressure ordering
// are Verified, every other J15 row is PROVISIONAL). `basis: 'assumption'` means no bible leaf states
// the value: it was chosen or fitted for this module and is not a football fact. Rows that come from a
// research file but not from a bible leaf are marked assumption and name the file in the comment.
import type { ParamFile, ParamTable, RuleKeyManifest, TuningParam } from '@gm/schema';

export const REFERENCE_RESOLVER_VERSION = '0.1.0';
/** Parameter names are `resolverRef.<group>.<name>`. */
export const PREFIX = 'resolverRef';

type Basis = 'bible' | 'assumption';
const rows: TuningParam[] = [];
function add(name: string, value: number, min: number, max: number, unit: string, basis: Basis, leaf: string, constrainedBy: string): void {
  rows.push({ name: `${PREFIX}.${name}`, value, min, max, unit, belongsTo: 'resolver.reference', basis, leaf, constrainedBy, status: 'starting' });
}
const bible = (name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string) => add(name, value, min, max, unit, 'bible', leaf, constrainedBy);
const assume = (name: string, value: number, min: number, max: number, unit: string, leaf: string, constrainedBy: string) => add(name, value, min, max, unit, 'assumption', leaf, constrainedBy);

// --- Rating shift (J1.6.3). The leaf states 0.1 and calls it an Assumption. ---
bible('rating.shiftSdPerZ', 0.1, 0, 0.5, 'sd_per_z', 'J1.6.3', 'Q1.7.3 rating-response sweep');

// --- League volumes used to turn per-game foul counts into per-play chances. ---
bible('volume.playsPerGame', 124.2, 100, 150, 'count', 'J15.2.1', 'game.scrimmagePlays');
bible('volume.dropbackShare', 0.576, 0.4, 0.7, 'ratio', 'J15.3.2', 'play.dropbackShare');
bible('volume.puntsPerGame', 8.0, 4, 12, 'count', 'J15.6.1', 'kick.puntsPerGame');
bible('volume.kickoffsPerGame', 10.1, 6, 14, 'count', 'J15.6.1', 'kick.kickoffsPerGame');

// --- Runs (J15.5.1). ---
export const RUN_QUANTILE_PROBS = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99] as const;
export const RUN_QUANTILE_NAMES = ['q05', 'q10', 'q25', 'q50', 'q75', 'q90', 'q95', 'q99'] as const;
const RUN_Q = [-2, 0, 1, 3, 6, 11, 14, 29];
RUN_QUANTILE_NAMES.forEach((n, i) => bible(`run.${n}`, RUN_Q[i]!, -10, 60, 'yd', 'J15.5.1', 'rush.gainQuantiles'));
// The table gives no minimum and no shape above the 99th percentile; `floorYd` and `tailMeanYd` close it.
// `shiftYd` moves the whole curve so that its open-field mean is the J15.5.1 "designed runs only" 4.29 yd
// (scrambles and kneels are separate plays here): the closed curve has mean 4.62, so the shift is -0.33.
assume('run.floorYd', -6, -15, -2, 'yd', 'J15.5.1', 'rush.gainQuantiles');
assume('run.tailMeanYd', 12, 2, 30, 'yd', 'J15.5.1', 'rush.gainQuantiles');
assume('run.shiftYd', -0.33, -3, 3, 'yd', 'J15.5.1', 'rush.yardsPerCarryDesigned');
bible('run.ypcAll', 4.52, 3, 6, 'yd', 'J15.5.1', 'rush.yardsPerCarry');
bible('run.ypcBox6', 4.87, 3, 7, 'yd', 'J15.5.1', 'rush.yardsPerCarryByBox');
bible('run.ypcBox7', 4.26, 3, 7, 'yd', 'J15.5.1', 'rush.yardsPerCarryByBox');
bible('run.ypcBox8', 3.84, 2, 7, 'yd', 'J15.5.1', 'rush.yardsPerCarryByBox');
bible('run.ypcBox9', 2.41, 1, 7, 'yd', 'J15.5.1', 'rush.yardsPerCarryByBox');
bible('run.fumbleLostShare', 0.0068, 0, 0.05, 'ratio', 'J15.5.1', 'rush.fumbleLostPerCarry');
assume('run.outOfBoundsShare', 0.08, 0, 0.5, 'ratio', 'J15.3.2', 'clock.elapsedPerPlay');

// --- Dropbacks (J15.4.1, J15.4.2). Index r3..r7 is the number of rushers; 7 means seven or more. ---
export const RUSHER_NAMES = ['r3', 'r4', 'r5', 'r6', 'r7'] as const;
// J15.4.2 prints these sack rates; its verification note says they did not reproduce (Unverified).
[0.045, 0.064, 0.085, 0.100, 0.084].forEach((v, i) => bible(`pass.sackShare.${RUSHER_NAMES[i]!}`, v, 0, 0.3, 'ratio', 'J15.4.2', 'pass.sackRateByRushers'));
[0.202, 0.267, 0.359, 0.440, 0.488].forEach((v, i) => bible(`pass.pressureShare.${RUSHER_NAMES[i]!}`, v, 0, 0.9, 'ratio', 'J15.4.2', 'pass.pressureRateByRushers'));
bible('pass.sackShareAll', 0.069, 0, 0.2, 'ratio', 'J15.4.1', 'pass.sackRate');
bible('pass.sackLossMeanYd', 6.6, 2, 12, 'yd', 'J15.4.1', 'pass.sackLossMean');
assume('pass.sackLossSdYd', 3, 0.5, 8, 'yd', 'J15.4.1', 'pass.sackLossMean');
bible('pass.fumbleLostPerDropback', 0.008, 0, 0.05, 'ratio', 'J15.4.1', 'pass.fumbleLostPerDropback');
bible('pass.scrambleShare', 0.049, 0, 0.2, 'ratio', 'J15.4.1', 'pass.scrambleRate');
bible('pass.scrambleMeanYd', 7.5, 2, 15, 'yd', 'J15.4.1', 'pass.scrambleYards');
bible('pass.completionAll', 0.646, 0.4, 0.8, 'ratio', 'J15.4.1', 'pass.completionPct');
// J15.4.2 prints 40.9%; its verification note gives 49.0% under another base (Unverified).
bible('pass.completionUnderPressure', 0.409, 0.2, 0.7, 'ratio', 'J15.4.2', 'pass.completionUnderPressure');
bible('pass.yacMeanYd', 5.2, 2, 10, 'yd', 'J15.4.1', 'pass.yacPerCompletion');
bible('pass.throwawayPerDropback', 0.037, 0, 0.15, 'ratio', 'J15.4.1', 'pass.throwawayRate');
bible('pass.dropPerDropback', 0.034, 0, 0.15, 'ratio', 'J15.4.1', 'pass.dropRate');
bible('pass.timeToThrowS', 2.68, 1.5, 4, 's', 'J15.4.1', 'pass.timeToThrow');
// Depth-of-target bands of J15.4.1: behind the line, 0, 1 to 5, 6 to 10, 11 to 15, 16 to 20, 21 to 30, 31 and over.
export const DEPTH_BAND_NAMES = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'] as const;
/** Air-yard range of each band, low edge and width; the last band is open and uses `pass.deepTailMeanYd`. */
export const DEPTH_BAND_LOW = [-6, 0, 1, 6, 11, 16, 21, 31] as const;
export const DEPTH_BAND_WIDTH = [6, 1, 5, 5, 5, 5, 10, 0] as const;
[0.787, 0.699, 0.743, 0.628, 0.566, 0.520, 0.372, 0.291].forEach((v, i) => bible(`pass.completion.${DEPTH_BAND_NAMES[i]!}`, v, 0, 1, 'ratio', 'J15.4.1', 'pass.completionByDepth'));
[0.007, 0.007, 0.011, 0.021, 0.034, 0.044, 0.058, 0.081].forEach((v, i) => bible(`pass.interception.${DEPTH_BAND_NAMES[i]!}`, v, 0, 0.3, 'ratio', 'J15.4.1', 'pass.interceptionByDepth'));
// The bible gives no share of attempts by depth band. These eight shares are the solution closest to an
// even split that satisfies five J15.4.1 rows at once: shares sum to 1, completion 64.6%, interception
// 2.28%, 7.7 air yards per attempt, and 5.7 air yards per completion (10.9 minus 5.2 after the catch).
// They are a fit to those rows, not a measured target-depth distribution.
[0.2437, 0.1380, 0.1448, 0.1136, 0.1386, 0.1330, 0.0682, 0.0201].forEach((v, i) => assume(`pass.depthShare.${DEPTH_BAND_NAMES[i]!}`, v, 0, 1, 'ratio', 'J15.4.1', 'pass.airYardsPerAttempt'));
assume('pass.deepTailMeanYd', 8, 1, 20, 'yd', 'J15.4.1', 'pass.airYardsPerAttempt');
assume('pass.breakupShare', 0.4, 0, 1, 'ratio', 'J15.4.1', 'pass.contestedTargets');
assume('pass.outOfBoundsShare', 0.15, 0, 0.6, 'ratio', 'J15.3.2', 'clock.elapsedPerPlay');
assume('pass.interceptionReturnMeanYd', 12, 0, 30, 'yd', 'J15.7.2', 'drive.opponentTouchdownShare');
assume('rpo.passShare', 0.5, 0, 1, 'ratio', 'J1.6.3', 'play.dropbackShare');
assume('kneel.lossYd', 1, 0, 3, 'yd', 'J15.5.1', 'rush.yardsPerCarryOfficial');

// --- Place kicks (J15.6.1, J9.4.1). Bands are kick distance in yards. ---
export const FG_BAND_NAMES = ['d0_29', 'd30_39', 'd40_44', 'd45_49', 'd50_54', 'd55'] as const;
/** Upper edge of each band but the last, exclusive. */
export const FG_BAND_UPPER = [30, 40, 45, 50, 55] as const;
[0.977, 0.936, 0.835, 0.743, 0.742, 0.593].forEach((v, i) => bible(`fg.make.${FG_BAND_NAMES[i]!}`, v, 0, 1, 'ratio', 'J15.6.1', 'kick.fieldGoalByDistance'));
bible('fg.holdDepthYd', 7, 6, 9, 'yd', 'J9.4.1', 'kick.fieldGoalByDistance');
bible('fg.operationS', 1.3, 1, 2, 's', 'J9.4.1', 'kick.operationTime');
// J11.7.1 prints 95.4%; the build plan (section 7) says to use the J15 row.
bible('try.kickMake', 0.951, 0.8, 1, 'ratio', 'J15.6.1', 'kick.extraPoint');
assume('fg.missWideMaxYd', 6, 0.5, 15, 'yd', 'J9.4.2', 'kick.fieldGoalByDistance');

// --- Punts (J15.6.1, J9.4.3, J9.5.1). ---
bible('punt.grossMeanYd', 47.3, 35, 55, 'yd', 'J15.6.1', 'kick.puntGross');
assume('punt.grossSdYd', 7, 1, 15, 'yd', 'J9.5.1', 'kick.puntGross');
bible('punt.kickDepthYd', 14, 12, 16, 'yd', 'J9.4.3', 'kick.puntBlocked');
bible('punt.hangS', 4.4, 3.5, 5.2, 's', 'J9.5.1', 'kick.puntHang');
assume('punt.operationS', 2.0, 1.6, 2.6, 's', 'J9.4.3', 'kick.puntBlocked');
bible('punt.blockedShare', 0.0046, 0, 0.03, 'ratio', 'J15.6.1', 'kick.puntBlocked');
bible('punt.touchbackShare', 0.074, 0, 0.3, 'ratio', 'J15.6.1', 'kick.puntTouchback');
// A punt that would carry inside `pinZoneYd` of the goal line becomes a touchback with the chance
// `touchbackWhenReached` and is otherwise placed between `pinMinYd` and `pinMaxYd` from the goal line.
// 0.22 gives about 7.4% touchbacks on punt spots spread evenly from the kicking team's 15 to the
// opponent's 40. That spread is generated, not measured: refit on the spots real games produce (WP-13).
assume('punt.pinZoneYd', 8, 0, 20, 'yd', 'J15.6.1', 'kick.puntTouchback');
assume('punt.touchbackWhenReached', 0.22, 0, 1, 'ratio', 'J15.6.1', 'kick.puntTouchback');
assume('punt.pinMinYd', 3, 0.5, 10, 'yd', 'J15.6.1', 'kick.puntInside20');
assume('punt.pinMaxYd', 14, 5, 25, 'yd', 'J15.6.1', 'kick.puntInside20');
// Outcome mix and return average: research/special-teams-rates.md (2022 to 2024, n=6,509). Not in a bible leaf.
assume('punt.returnedShare', 0.430, 0, 1, 'ratio', 'J9.5.2', 'kick.puntOutcomeMix');
assume('punt.fairCatchShare', 0.279, 0, 1, 'ratio', 'J9.5.2', 'kick.puntOutcomeMix');
assume('punt.outOfBoundsShare', 0.094, 0, 1, 'ratio', 'J9.5.2', 'kick.puntOutcomeMix');
assume('punt.downedShare', 0.119, 0, 1, 'ratio', 'J9.5.2', 'kick.puntOutcomeMix');
assume('punt.returnMeanYd', 9.44, 3, 20, 'yd', 'J9.5.2', 'kick.puntReturnAverage');
assume('punt.returnFloorYd', -2, -8, 0, 'yd', 'J9.5.2', 'kick.puntReturnAverage');

// --- Free kicks (J9.6.1, J9.6.2). The touchback share is rule-set dependent: 21.0% is the 2025 season, the
// only one played under the kickoff format of the 2026 pro rule set. A college table needs its own value. ---
bible('kickoff.touchbackShare', 0.21, 0, 0.9, 'ratio', 'J9.6.1', 'kick.kickoffTouchback');
// research/special-teams-rates.md: out of bounds 1.35% (2025, status Conflict), average return 25.95 yd (2025).
assume('kickoff.outOfBoundsShare', 0.0135, 0, 0.1, 'ratio', 'J9.6.1', 'kick.kickoffOutOfBounds');
assume('kickoff.catchMaxYd', 8, 0, 20, 'yd', 'J9.6.1', 'kick.kickoffStartYardline');
assume('kickoff.returnMinYd', 10, 0, 20, 'yd', 'J9.6.1', 'kick.kickoffReturnAverage');
assume('kickoff.returnTailMeanYd', 15.95, 5, 30, 'yd', 'J9.6.1', 'kick.kickoffReturnAverage');
assume('kickoff.outOfBoundsYd', 30, 5, 60, 'yd', 'J9.6.1', 'kick.kickoffOutOfBounds');
assume('kickoff.hangS', 4.0, 3, 5, 's', 'J9.6.1', 'kick.kickoffStartYardline');
// research/special-teams-rates.md: kicking team recovers 5.4% of onside kicks (2022 to 2024, n=149; 9.6% in 2025, n=52).
assume('onside.recoveryShare', 0.054, 0, 0.5, 'ratio', 'J9.6.2', 'kick.onsideRecovery');
assume('onside.travelYd', 12, 10, 20, 'yd', 'J9.6.2', 'kick.onsideRecovery');

// --- Fouls (J15.7.1). Per-game values are accepted penalties, both teams. `committedPerAccepted` scales them
// up to committed acts, because officiating (B11) misses some and coaches decline some. ---
assume('foul.committedPerAccepted', 1.2, 1, 2, 'ratio', 'J15.7.1', 'foul.acceptedPerGame');
assume('foul.pointOfAttackShare', 0.5, 0, 1, 'ratio', 'J10.1.1', 'foul.acceptedPerGame');

/** When in a play a foul type can happen in this resolver. */
export type FoulWindow =
  | 'pre_snap_dead'   // kills the play before the snap
  | 'at_snap'         // at the snap; the play runs on
  | 'scrimmage'       // any live scrimmage play
  | 'dropback'        // any play that is a dropback
  | 'pass_attempt'    // a forward pass was thrown
  | 'throwaway'       // an incomplete pass thrown away
  | 'kick_return'     // a punt or free kick that was returned
  | 'after_play';     // after the ball is dead

export interface FoulRow {
  /** Set when the catalogue splits this stat type by the side that fouls: the id used for each side. `id` then only names the rate. */
  readonly bySide?: { readonly snapping: string; readonly opposing: string };
  /** Catalogue id (D-06): the rule key is `foul.<id>.exists`. WP-01 owns the catalogue; rename here if it differs. */
  readonly id: string;
  readonly when: FoulWindow;
  /** 'snapping' is the team that snaps or kicks, 'opposing' the other, 'either' is an even draw. */
  readonly by: 'snapping' | 'opposing' | 'either';
  /** Accepted penalties per game, both teams (J15.7.1). */
  readonly perGame: number;
}

/** The 22 types J15.7.1 lists. Ids follow the bible where it names one (dpi, opi, def_holding, illegal_contact, ineligible_downfield_pass, intentional_grounding). */
export const FOUL_ROWS: readonly FoulRow[] = [
  { id: 'false_start', when: 'pre_snap_dead', by: 'snapping', perGame: 2.30 },
  { id: 'offensive_holding', when: 'scrimmage', by: 'snapping', perGame: 2.25 },
  { id: 'dpi', when: 'pass_attempt', by: 'opposing', perGame: 0.98 },
  { id: 'def_holding', when: 'dropback', by: 'opposing', perGame: 0.69 },
  { id: 'unnecessary_roughness', when: 'after_play', by: 'either', perGame: 0.60 },
  { id: 'delay_of_game', when: 'pre_snap_dead', by: 'snapping', perGame: 0.59 },
  { id: 'offside', when: 'at_snap', by: 'opposing', perGame: 0.54 },
  { id: 'roughing_passer', when: 'pass_attempt', by: 'opposing', perGame: 0.35 },
  { id: 'neutral_zone_infraction', when: 'pre_snap_dead', by: 'opposing', perGame: 0.33 },
  { id: 'face_mask', when: 'scrimmage', by: 'opposing', perGame: 0.30 },
  { id: 'illegal_formation', when: 'at_snap', by: 'snapping', perGame: 0.29 },
  { id: 'illegal_contact', when: 'dropback', by: 'opposing', perGame: 0.26 },
  { id: 'opi', when: 'pass_attempt', by: 'snapping', perGame: 0.25 },
  { id: 'ineligible_downfield_pass', when: 'pass_attempt', by: 'snapping', perGame: 0.25 },
  { id: 'illegal_use_of_hands', when: 'scrimmage', by: 'either', perGame: 0.22, bySide: { snapping: 'illegal_use_of_hands_offense', opposing: 'illegal_use_of_hands_defense' } },
  { id: 'illegal_block_in_back', when: 'kick_return', by: 'opposing', perGame: 0.19 },
  { id: 'intentional_grounding', when: 'throwaway', by: 'snapping', perGame: 0.16 },
  { id: 'too_many_on_field', when: 'at_snap', by: 'opposing', perGame: 0.15 },
  { id: 'illegal_shift', when: 'at_snap', by: 'snapping', perGame: 0.15 },
  { id: 'encroachment', when: 'pre_snap_dead', by: 'opposing', perGame: 0.12 },
  { id: 'unsportsmanlike', when: 'after_play', by: 'either', perGame: 0.11 },
  { id: 'taunting', when: 'after_play', by: 'either', perGame: 0.06 },
];
for (const f of FOUL_ROWS) bible(`foul.perGame.${f.id}`, f.perGame, 0, 5, 'count', 'J15.7.1', `foul.perGame.${f.id}`);

// --- Live duration of a play. No bible leaf gives these; they only fill `liveDurationTenths`. ---
assume('time.snapToHandoffS', 0.8, 0.3, 2, 's', 'J11.4.1', 'clock.elapsedPerPlay');
assume('time.carryBaseS', 1.5, 0.5, 4, 's', 'J11.4.1', 'clock.elapsedPerPlay');
assume('time.carryPerYardS', 0.13, 0.05, 0.3, 's_per_yd', 'J11.4.1', 'clock.elapsedPerPlay');
assume('time.sackS', 4.2, 2, 7, 's', 'J11.4.1', 'clock.elapsedPerPlay');
assume('time.flightBaseS', 0.4, 0.1, 1, 's', 'J9.1.1', 'clock.elapsedPerPlay');
assume('time.flightPerYardS', 0.045, 0.02, 0.1, 's_per_yd', 'J9.1.1', 'clock.elapsedPerPlay');
assume('time.kneelS', 2.0, 1, 4, 's', 'J11.4.1', 'clock.elapsedPerPlay');
assume('time.spikeS', 1.5, 1, 3, 's', 'J11.4.1', 'clock.elapsedPerPlay');

// --- Cosmetic geometry (lateral placement of spots; no rule or rate depends on it) and player cost. ---
assume('geom.runLateralYd', 6, 0, 20, 'yd', 'J1.1.2', 'none: placement only');
assume('geom.passLateralYd', 15, 0, 26, 'yd', 'J1.1.2', 'none: placement only');
assume('geom.dropbackDepthYd', 7, 3, 12, 'yd', 'J1.1.2', 'none: placement only');
assume('delta.energyPerPlay', 0.004, 0, 0.05, 'ratio', 'D10.1.1', 'D10 freshness across a drive');

/** The module's parameter file (D-09). The integrator merges it into the game's ParamTable. */
export const PARAMS: ParamFile = { module: 'resolver.reference', version: REFERENCE_RESOLVER_VERSION, params: rows };

/**
 * The rule keys this module reads: only whether each foul type exists at the level (D-06). Everything
 * else that depends on the rules (field size, spots, the kind of play) arrives in the play input.
 */
export function foulRowIds(f: FoulRow): readonly string[] { return f.bySide ? [f.bySide.snapping, f.bySide.opposing] : [f.id]; }
export const RULE_KEYS: RuleKeyManifest = FOUL_ROWS.flatMap(foulRowIds).map((id) => ({
  key: `foul.${id}.exists`,
  type: 'boolean' as const,
  meaning: `Whether the foul "${id}" exists in this rule set (B8.1.1 catalogue).`,
  ownerLeaf: 'B8.1.2',
  readBy: ['resolver-reference/resolver'],
}));

/** A ParamTable over this module's own file, for tests and for use before the merged table exists. */
export function referenceParamTable(overrides: Readonly<Record<string, number>> = {}): ParamTable {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.name, r.value);
  for (const k of Object.keys(overrides)) {
    const full = k.startsWith(`${PREFIX}.`) ? k : `${PREFIX}.${k}`;
    if (!map.has(full)) throw new Error(`unknown reference resolver parameter ${k}`);
    map.set(full, overrides[k]!);
  }
  return {
    version: REFERENCE_RESOLVER_VERSION,
    num(name: string): number {
      const v = map.get(name);
      if (v === undefined) throw new Error(`unknown parameter ${name}`);
      return v;
    },
    has: (name: string) => map.has(name),
  };
}
