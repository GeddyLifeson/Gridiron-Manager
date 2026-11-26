// Fouls and injuries from play: tuning constants (bible J10, work package WP-22).
//
// Basis 'bible' means J10 states the number as a starting value (the leaf's own coefficients such as
// `2.0 * (-A - 0.6)`, the 0.3 s "could not stop" threshold, the 0.5 s kicker window, the 8 to 15 minute
// evaluation). J10 marks them starting values to be fitted, not measurements.
// Basis 'assumption' means this module's author chose the number because the leaf gives a direction
// and no size. Every intercept (`*.b0`) and every base injury hazard (`injury.h0.*`) is an Assumption
// by design: J10.1.1 and J10.6.1 say they are FITTED so that called rates (after B11's detection model)
// match the J15 per-game rows. NO ROW HERE IS A MEASURED FOOTBALL FACT. The measured rates J10 cites
// (offensive holding 2.25 flags per game, defensive pass interference 0.98, roughing the passer 0.35,
// face mask 0.30, about 15.6 Out episodes per team season, and the rest) are TARGETS named in
// `constrainedBy`; they are never typed into the model as outputs.
//
// Rule values (which fouls exist, the ineligible-downfield limit, the low-block zone) are read from
// the rule set by key only (RULE_KEYS below). No rule number appears in this module.
import type { ParamFile, ParamTable, RuleKeyManifest } from '@gm/schema';
import { defineParams, type ParamRow } from '../tick/param-util.ts';

const HOLD = 'J15 offensive holding 2.25 flags per game (2 of 3); J10.2.1 acceptance';
const FACE = 'J15 illegal use of hands to the face 0.22 per game (2 of 3)';
const BLK = 'J15 illegal block above the waist 0.19 per game (2 of 3); J10.2.2 acceptance';
const IDF = 'J15 ineligible downfield 0.25 per game (2 of 3); J10.2.3 acceptance';
const DPI = 'J15 defensive pass interference 0.98 per game (2 of 3); J10.3.1 acceptance';
const DH = 'J15 defensive holding 0.69 and illegal contact 0.26 per game (2 of 3)';
const OPI = 'J15 offensive pass interference 0.25 per game (2 of 3); J10.3.2 acceptance';
const RTP = 'J15 roughing the passer 0.35 per game (2 of 3); J10.4.1 acceptance';
const UNR = 'J15 unnecessary roughness 0.60 per game (2 of 3)';
const FM = 'J15 face mask 0.30 per game (2 of 3); horse collar, hip drop (1 flag in 2024), targeting (T12, Unverified)';
const KICK = 'J10.4.3: roughing the kicker 0.017, running into 0.025, fair catch interference 0.033, kick catch interference 0.010 per game (2 of 3, order of magnitude)';
const CON = 'J15 unsportsmanlike 0.11 and taunting 0.06 per game (2 of 3); J10.5.1 acceptance';
const L34 = 'L3.4.1 coach-controlled bounds (bible)';
const INJ = 'J10.6.1: about 15.6 Out episodes per team season (1 of 3); position shares (Unverified, R3)';
const CONC = 'J10.7.2 acceptance; D11 concussion rows';
const STRUCT = 'none: structural';
const SEV = 'B11 call model reads severity; J10.1.1';

const ROWS = [
  // J10.1.1 common
  ['zDiscipline', 0.4, 0.1, 1, 'logit/z', 'bible', 'J10.2.1', HOLD],
  // A committed foul's severity: base + gain * how badly the contest was lost + spread * (u - 0.5), clipped 0 to 1.
  ['severity.base', 0.35, 0, 1, 'ratio', 'assumption', 'J10.1.1', SEV],
  ['severity.gain', 0.4, 0, 1, 'ratio', 'assumption', 'J10.1.1', SEV],
  ['severity.spread', 0.5, 0, 1, 'ratio', 'assumption', 'J10.1.1', SEV],
  ['severity.flagrant', 0.9, 0.7, 1, 'ratio', 'assumption', 'J10.4.2', 'B8 disqualification rules'],
  // Sight lines (B11.2.1 visibility): bodies within this distance of the act.
  ['sight.radiusYd', 2.5, 1, 5, 'yd', 'assumption', 'J10.1.1', 'B11 call model'],
  ['sight.crowded', 2, 1, 4, 'count', 'assumption', 'J10.1.1', 'B11 call model'],
  ['sight.pile', 5, 3, 8, 'count', 'assumption', 'J10.1.1', 'B11 call model'],
  ['poaYd', 3, 1, 6, 'yd', 'assumption', 'J10.1.1', 'B11 call model'],
  // Borderline legal acts (B11.3.2 rule 1): within this margin of a geometric limit.
  ['borderlineYd', 0.3, 0.05, 1, 'yd', 'assumption', 'J10.2.3', 'B11.3.2 false-flag rate'],
  ['contactGapYd', 0.25, 0, 0.6, 'yd', 'assumption', 'J10.4.1', STRUCT],

  // J10.2.1 offensive holding: per-tick hazard while A < -0.6 and the defender is within reach.
  ['hold.aOpen', -0.6, -0.9, -0.3, 'A', 'bible', 'J10.2.1', HOLD],
  ['hold.b0', -6.2, -10, -2, 'logit', 'assumption', 'J10.2.1', HOLD],
  ['hold.gGap', 2.0, 0.5, 4, 'logit/A', 'bible', 'J10.2.1', HOLD],
  ['hold.gDesperation', 0.3, 0, 1, 'logit', 'bible', 'J10.2.1', HOLD],
  ['hold.desperationS', 0.5, 0.2, 1, 's', 'bible', 'J10.2.1', HOLD],
  ['hold.reachYd', 1.5, 0.8, 2.5, 'yd', 'assumption', 'J10.2.1', STRUCT],
  ['hold.resetA', -0.2, -0.5, 0, 'A', 'bible', 'J10.2.1', 'J10.2.1 acceptance'],
  ['hold.effectS', 0.5, 0.2, 1, 's', 'bible', 'J10.2.1', 'J10.2.1 acceptance'],
  ['face.b0Blocker', -8.5, -12, -4, 'logit', 'assumption', 'J10.1.1', FACE],
  ['face.b0Defender', -8.5, -12, -4, 'logit', 'assumption', 'J10.1.1', FACE],

  // J10.2.2 illegal blocks in space.
  ['block.behindDeg', 110, 90, 150, 'deg', 'bible', 'J10.2.2', BLK],
  ['block.lowShare', 0.08, 0, 0.3, 'ratio', 'assumption', 'J10.2.2', BLK],
  ['block.avoidB0', 0.6, -2, 3, 'logit', 'assumption', 'J10.2.2', BLK],
  ['block.avoidPerZ', 0.5, 0, 1.5, 'logit/z', 'assumption', 'J10.2.2', BLK],
  // How far from the ball the tackle box reaches sideways and back (geometry for the low-block key).
  ['block.boxHalfWidthYd', 4, 3, 6, 'yd', 'assumption', 'J10.2.2', STRUCT],

  // J10.3.1 coverage fouls.
  ['dpi.b0', -3.6, -7, 0, 'logit', 'assumption', 'J10.3.1', DPI],
  ['dpi.gNotLocated', 1.2, 0, 3, 'logit', 'bible', 'J10.3.1', DPI],
  ['dpi.gTrailing', 0.8, 0, 2, 'logit/yd', 'bible', 'J10.3.1', DPI],
  ['dpi.gEarly', 0.5, 0, 2, 'logit', 'bible', 'J10.3.1', DPI],
  ['dpi.gBallSkills', 0.3, 0, 1, 'logit/z', 'bible', 'J10.3.1', DPI],
  // Both players located the ball: J10.3.1 edge case "near zero".
  ['dpi.gBothLocated', -4, -8, -1, 'logit', 'assumption', 'J10.3.1', 'J10.3.1 acceptance'],
  ['dpi.contactYd', 1.2, 0.5, 2, 'yd', 'assumption', 'J10.3.1', STRUCT],
  ['dpi.earlyS', 0.3, 0.1, 0.6, 's', 'assumption', 'J10.3.1', DPI],
  ['dpi.deliberateSeverity', 0.85, 0.6, 1, 'ratio', 'assumption', 'J10.3.1', 'B13.5.1, K1.3.3'],
  ['dpi.catchCut', 0.5, 0, 1, 'ratio', 'assumption', 'J10.3.1', DPI],
  ['dh.b0', -5.2, -9, -1, 'logit', 'assumption', 'J10.3.1', DH],
  ['dh.trailYd', 0.4, 0, 1, 'yd', 'assumption', 'J10.3.1', DH],
  ['dh.gBeaten', 2.0, 0, 4, 'logit/yd', 'assumption', 'J10.3.1', DH],
  ['dh.gPress', 0.3, 0, 1, 'logit/z', 'assumption', 'J10.3.1', DH],
  ['dh.contactYd', 1.2, 0.5, 2, 'yd', 'assumption', 'J10.3.1', STRUCT],
  ['dh.contactShare', 0.4, 0, 1, 'ratio', 'assumption', 'J10.3.1', DH],
  ['opi.b0', -4.5, -8, -1, 'logit', 'assumption', 'J10.3.2', OPI],
  ['opi.gLowSep', 1.0, 0, 3, 'logit/yd', 'assumption', 'J10.3.2', OPI],
  ['opi.sepYd', 1.0, 0.3, 2, 'yd', 'assumption', 'J10.3.2', OPI],
  ['opi.pickB0', -2.5, -6, 0, 'logit', 'assumption', 'J10.3.2', OPI],

  // J10.4.1 roughing the passer and late hits.
  ['late.couldNotStopS', 0.3, 0.1, 0.6, 's', 'bible', 'J10.4.1', RTP],
  ['late.formB0', -5, -9, -1, 'logit', 'assumption', 'J10.4.1', RTP],
  ['late.formPerZ', 0.4, 0, 1, 'logit/z', 'assumption', 'J10.4.1', RTP],
  ['late.pullB0', 1.5, -1, 4, 'logit', 'assumption', 'J10.4.1', RTP],
  ['late.pullPerZ', 0.6, 0, 1.5, 'logit/z', 'assumption', 'J10.4.1', RTP],
  ['late.pullPerS', 3, 0, 8, 'logit/s', 'assumption', 'J10.4.1', RTP],
  ['late.windowS', 1.5, 0.5, 3, 's', 'assumption', 'J10.4.1', UNR],
  ['late.watchYd', 3, 1, 6, 'yd', 'assumption', 'J10.4.1', UNR],
  ['late.watchYps', 3, 1, 6, 'yd/s', 'assumption', 'J10.4.1', UNR],

  // J10.4.2 dangerous contact: one intercept per form.
  ['form.b0.face_mask', -6.0, -10, -2, 'logit', 'assumption', 'J10.4.2', FM],
  ['form.b0.horse_collar', -6.5, -10, -2, 'logit', 'assumption', 'J10.4.2', FM],
  ['form.b0.hip_drop', -9.0, -13, -4, 'logit', 'assumption', 'J10.4.2', FM],
  ['form.b0.helmet_use', -7.5, -11, -3, 'logit', 'assumption', 'J10.4.2', UNR],
  ['form.b0.defenseless_player', -7.0, -11, -3, 'logit', 'assumption', 'J10.4.2', UNR],
  ['form.b0.targeting', -6.0, -10, -2, 'logit', 'assumption', 'J10.4.2', 'T12 targeting rate (Unverified)'],
  ['form.gEnergy', 0.6, 0, 2, 'logit', 'assumption', 'J10.4.2', FM],
  ['form.gLunge', 0.8, 0, 2, 'logit', 'assumption', 'J10.4.2', FM],
  ['form.gBehind', 1.5, 0, 3, 'logit', 'assumption', 'J10.4.2', FM],
  ['form.gDefenseless', 1.5, 0, 3, 'logit', 'assumption', 'J10.4.2', FM],
  ['form.gTechnique', 0.4, 0, 1, 'logit/z', 'assumption', 'J10.4.2', FM],
  ['form.gAggression', 0.5, 0, 1.5, 'logit', 'assumption', 'J10.4.2', FM],
  ['form.lungeYps', 7, 4, 10, 'yd/s', 'assumption', 'J10.4.2', STRUCT],
  ['form.defenselessS', 0.5, 0.2, 1, 's', 'assumption', 'J10.4.2', STRUCT],

  // J10.4.3 fouls on kicks.
  ['kick.windowS', 0.5, 0.2, 1, 's', 'bible', 'J10.4.3', KICK],
  ['kick.b0', -1.0, -4, 2, 'logit', 'assumption', 'J10.4.3', KICK],
  ['kick.gClosing', 1.5, 0, 3, 'logit/(yd/s)', 'bible', 'J10.4.3', KICK],
  ['kick.gBlockIt', 0.5, 0, 1.5, 'logit', 'bible', 'J10.4.3', KICK],
  ['kick.closingFreeYps', 3, 1, 6, 'yd/s', 'assumption', 'J10.4.3', KICK],
  ['kick.roughSeverity', 0.6, 0.3, 0.9, 'ratio', 'assumption', 'J10.4.3', 'J10.4.3 acceptance (running into several times roughing)'],
  ['kci.b0', -2.0, -6, 1, 'logit', 'assumption', 'J10.4.3', KICK],
  ['kci.gEarly', 1.5, 0, 4, 'logit/s', 'assumption', 'J10.4.3', KICK],
  ['kci.gAware', 0.4, 0, 1, 'logit/z', 'assumption', 'J10.4.3', KICK],
  ['kci.contactYd', 1.0, 0.5, 2, 'yd', 'assumption', 'J10.4.3', STRUCT],
  ['kci.catchableYd', 3, 1, 6, 'yd', 'assumption', 'J10.4.3', STRUCT],

  // J10.5.1 conduct after the whistle.
  ['conduct.b0', -9.0, -13, -5, 'logit', 'assumption', 'J10.5.1', CON],
  ['conduct.gWeight', 1.0, 0, 2, 'logit', 'assumption', 'J10.5.1', CON],
  ['conduct.gComposure', 0.5, 0, 1.5, 'logit/z', 'assumption', 'J10.5.1', CON],
  ['conduct.gRetaliation', 3.0, 0, 6, 'logit', 'assumption', 'J10.5.1', CON],
  ['conduct.nearYd', 5, 2, 10, 'yd', 'assumption', 'J10.5.1', STRUCT],
  ['conduct.bigHit', 1.6, 1, 3, 'ratio', 'assumption', 'J10.5.1', STRUCT],
  ['conduct.closeMargin', 8, 3, 17, 'points', 'assumption', 'J10.5.1', STRUCT],
  ['conduct.shareTaunt', 0.35, 0, 1, 'ratio', 'assumption', 'J10.5.1', CON],
  ['conduct.shareStrike', 0.15, 0, 1, 'ratio', 'assumption', 'J10.5.1', CON],

  // L3.4.1 team layer: bounds only. The value comes from the game layer each play; it is clamped here.
  ['team.defCoverageMin', 0.9, 0.9, 0.9, 'ratio', 'bible', 'L3.4.1', L34],
  ['team.defCoverageMax', 1.1, 1.1, 1.1, 'ratio', 'bible', 'L3.4.1', L34],
  ['team.postPlayMin', 0.925, 0.925, 0.925, 'ratio', 'bible', 'L3.4.1', L34],
  ['team.postPlayMax', 1.075, 1.075, 1.075, 'ratio', 'bible', 'L3.4.1', L34],

  // J10.6.1 injury hazard: P = h0[m] * group[m] * exp(a1 (E - 1) + a2 f^2 + a3 load + a4 prior + a5 hurt - a6 zDur + a7 surface + a8 ageOver).
  ['injury.h0.contact_lower', 0.0016, 0, 0.02, 'per exposure', 'assumption', 'J10.6.1', INJ],
  ['injury.h0.contact_upper', 0.0012, 0, 0.02, 'per exposure', 'assumption', 'J10.6.1', INJ],
  ['injury.h0.head_impact', 0.0005, 0, 0.01, 'per exposure', 'assumption', 'J10.6.1', INJ],
  ['injury.h0.noncontact_sprint', 0.0008, 0, 0.01, 'per exposure', 'assumption', 'J10.6.1', INJ],
  ['injury.h0.noncontact_cut', 0.0004, 0, 0.01, 'per exposure', 'assumption', 'J10.6.1', INJ],
  ['injury.h0.overuse', 0.002, 0, 0.02, 'per play', 'assumption', 'J10.6.1', INJ],
  ['injury.a1', 0.5, 0, 1.5, '1/energy', 'assumption', 'J10.6.1', INJ],
  ['injury.a2', 1.2, 0, 3, '1/f^2', 'assumption', 'J10.6.1', 'J10.6.1 acceptance 2 (rise above fatigue 0.7)'],
  ['injury.a3', 0.6, 0, 2, '1/load', 'assumption', 'J10.6.1', 'J10.6.1 acceptance 2 (rise with load excess)'],
  ['injury.a4', 0.7, 0, 2, 'log', 'assumption', 'J10.6.1', 'J10.6.1: hamstring recurrence about 15% (3 sources of mixed relevance)'],
  ['injury.a5', 0.3, 0, 1, 'log', 'assumption', 'J10.6.1', INJ],
  ['injury.a6', 0.3, 0, 1, '1/z', 'assumption', 'J10.6.1', INJ],
  // J10.6.1: "a7 starts at 0 until research settles it" (turf question is a Conflict).
  ['injury.a7', 0, 0, 0.5, 'log', 'bible', 'J10.6.1', 'J10.6.1 turf question (Conflict)'],
  ['injury.a8', 0.05, 0, 0.2, '1/yr', 'assumption', 'J10.6.1', INJ],
  ['injury.peakAge', 27, 24, 31, 'yr', 'assumption', 'J10.6.1', 'D8 aging curves'],
  // Kickers and punters: "near-zero contact exposure" (J10.6.1 edge case) comes from exposure; this scales the rest.
  ['injury.specialistContact', 0.3, 0.05, 1, 'ratio', 'assumption', 'J10.6.1', INJ],
  ['injury.sprintShare', 0.92, 0.8, 0.98, 'ratio', 'assumption', 'J10.6.1', STRUCT],
  ['injury.cutYps2', 9, 5, 15, 'yd/s^2', 'assumption', 'J10.6.1', STRUCT],
  ['injury.cutRefractoryS', 0.5, 0.2, 1, 's', 'assumption', 'J10.6.1', STRUCT],
  ['injury.blockEnergy', 0.6, 0.1, 1.5, 'ratio', 'assumption', 'J10.6.1', STRUCT],
  // Severity seed below this: he finishes the play (J10.7.1).
  ['injury.finishSeed', 0.45, 0, 1, 'ratio', 'assumption', 'J10.7.1', 'D11 severity mapping'],
  // J10.6.2 wear: a non-injuring exposure adds its energy to the region's soreness.
  ['wear.sprintLoad', 0.2, 0, 1, 'energy', 'assumption', 'J10.6.2', 'J10.6.2 acceptance'],
  ['wear.cutLoad', 0.15, 0, 1, 'energy', 'assumption', 'J10.6.2', 'J10.6.2 acceptance'],

  // J10.7.2 concussion evaluation.
  ['concussion.energy', 1.4, 0.8, 3, 'ratio', 'assumption', 'J10.6.1', CONC],
  ['concussion.detectB0', 0.5, -2, 3, 'logit', 'assumption', 'J10.7.2', CONC],
  ['concussion.detectPerE', 1.0, 0, 3, 'logit/energy', 'assumption', 'J10.7.2', CONC],
  ['concussion.detectSigns', 2.5, 0, 5, 'logit', 'assumption', 'J10.7.2', CONC],
  ['concussion.minS', 480, 300, 900, 's', 'bible', 'J10.7.2', CONC],
  ['concussion.maxS', 900, 480, 1500, 's', 'bible', 'J10.7.2', CONC],
  ['concussion.missedDInjuryZ', 1.0, 0, 3, 'z', 'assumption', 'J10.7.2', CONC],
] as const satisfies readonly ParamRow[];

export type FoulsInjuriesParamName = (typeof ROWS)[number][0];
export type FoulsInjuriesParams = Readonly<Record<FoulsInjuriesParamName, number>>;

export const MODULE = 'foulsInjuries';
export const PARAMS: ParamFile = defineParams(MODULE, '0.1.0', ROWS);

/** Resolve once per play, never inside the tick. */
export function foulsInjuriesParams(t: ParamTable): FoulsInjuriesParams {
  const out: Record<string, number> = {};
  for (const row of ROWS) out[row[0]] = t.num(`${MODULE}.${row[0]}`);
  return out as FoulsInjuriesParams;
}

/** The fouls this module commits (J10.2 to J10.5). Each one's hazard is disabled when `foul.<id>.exists` is false. */
export const LIVE_FOULS = [
  'offensive_holding', 'kick_holding', 'illegal_use_of_hands_offense', 'illegal_use_of_hands_defense',
  'illegal_block_in_back', 'block_below_waist', 'ineligible_downfield_pass',
  'dpi', 'def_holding', 'illegal_contact', 'opi',
  'roughing_passer', 'unnecessary_roughness',
  'face_mask', 'horse_collar', 'hip_drop', 'helmet_use', 'defenseless_player', 'targeting',
  'running_into_kicker', 'roughing_kicker', 'roughing_holder', 'kick_catch_interference', 'fair_catch_interference',
  'unsportsmanlike', 'taunting', 'striking',
] as const;
export type LiveFoulId = (typeof LIVE_FOULS)[number];
/** J10.4.2 forms in draw order. The order is part of the result: changing it changes golden hashes. */
export const CONTACT_FORMS = ['face_mask', 'horse_collar', 'hip_drop', 'helmet_use', 'defenseless_player', 'targeting'] as const;

const READ_BY = ['engine-core/fouls-injuries'];
const exists = (id: string, leaf: string) => ({ key: `foul.${id}.exists`, type: 'boolean' as const, meaning: `The foul ${id} exists at this level`, ownerLeaf: leaf, readBy: READ_BY });
const LEAF: Readonly<Record<LiveFoulId, string>> = {
  offensive_holding: 'B8.2.1', kick_holding: 'B6', illegal_use_of_hands_offense: 'B8.2.1', illegal_use_of_hands_defense: 'B8.2.2',
  illegal_block_in_back: 'B8.2.3', block_below_waist: 'B8.2.3', ineligible_downfield_pass: 'B5.3.2',
  dpi: 'B5.4.4', def_holding: 'B5.4.2', illegal_contact: 'B5.4.1', opi: 'B5.4.4',
  roughing_passer: 'B8.3.2', unnecessary_roughness: 'B8.3.3',
  face_mask: 'B8.3.3', horse_collar: 'B8.3.3', hip_drop: 'B8.3.3', helmet_use: 'B8.3.3', defenseless_player: 'B8.3.3', targeting: 'B13.8.1',
  running_into_kicker: 'B8.3.3', roughing_kicker: 'B8.3.3', roughing_holder: 'B8.3.3', kick_catch_interference: 'B6.4.2', fair_catch_interference: 'B6.4.2',
  unsportsmanlike: 'B8.4.2', taunting: 'B8.4.2', striking: 'B8.3.3',
};

/**
 * Rule keys read. All exist in the WP-01 dictionary except the two marked OPTIONAL: those are read only
 * when the rule set carries them (`rules.keys()`), and the hazard they gate stays off until then. They
 * are requested from the rule-key research thread.
 */
export const RULE_KEYS: RuleKeyManifest = [
  ...LIVE_FOULS.map((id) => exists(id, LEAF[id])),
  { key: 'foul.ineligible_downfield.yards', type: 'number', unit: 'yd', meaning: 'Farthest an ineligible may be beyond the line when a forward pass that crosses it is thrown', ownerLeaf: 'B13.1.2', readBy: READ_BY },
  { key: 'foul.low_block.rule', type: 'option', options: ['tight_end_box_only', 'tackle_box_only'], meaning: 'Where a low block is legal', ownerLeaf: 'B13.12.1', readBy: READ_BY },
];
/** OPTIONAL keys (not yet in the dictionary): read only when present. */
export const OPTIONAL_RULE_KEYS = {
  /** Depth beyond the line at which contact on a receiver becomes illegal contact (pro Rule 8-4). */
  contactZone: 'foul.illegal_contact.zone_yd',
  /** Depth beyond the line at which an offensive block before the pass is offensive interference (pro Rule 8-5). */
  pickDepth: 'foul.opi.block_depth_yd',
} as const;
