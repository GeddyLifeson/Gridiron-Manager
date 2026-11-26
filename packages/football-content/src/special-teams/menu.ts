// The special-teams call menu (F12, I4, G7.7.2) for every rule set. Calls carry no outcome numbers: what a
// kick does is decided by J9 and the contests, from the players. Rule-dependent calls name the rule value they
// need (`when`), so one menu serves the pro dynamic kickoff and the college traditional kickoff alike.
import type { Basis, KickDef, ReturnDef, RuleCond, ScrimmageDef, SpecialCallDef } from './types.ts';

const b = (claim: string, status: Basis['status'], sources: readonly string[]): Basis => ({ claim, status, sources });
const NFL = 'st-nfl-rules-2026';
const NCAA = 'st-ncaa-rules-2026';
const DYNAMIC: RuleCond = { key: 'kickoff.format', is: 'dynamic' };
const TRADITIONAL: RuleCond = { key: 'kickoff.format', is: 'traditional' };
const MUST_DECLARE: RuleCond = { key: 'kickoff.onside_must_declare', is: true };
const SURPRISE_LEGAL: RuleCond = { key: 'kickoff.onside_must_declare', is: false };

// ---------------------------------------------------------------- shared claims
const DESIGN = b('Exact landing spots, depths and lane widths are design values for J9 and J4; no source gives them', 'Assumption', []);
const NO_WEDGE = b('A wedge of two or more blockers shoulder to shoulder is a foul at both levels (NFL 6-2-1(d) wedge block, NCAA illegal wedge formation), so no return here uses one', 'Rulebook only', [NFL, NCAA]);

const PUNT_FORMATION = b('The spread punt: interior line, wings just behind the line, a personal protector about 5 yd deep and two wide gunners (also called mules or flyers)', 'Verified', ['st-dummies-punt', 'st-lund-spread', 'st-sabock-spread', 'st-accorsi-spread']);
const PUNT_PROTECTION = b('Punt protection is man, zone or a zone-to-man mix, and the personal protector reads the rush and makes the call', 'Verified', ['st-stgeorge-spread', 'st-sabock-spread', 'st-accorsi-spread', 'st-dummies-punt']);
const PUNT_RELEASE = b('Who may release before the kick is a rule value: pro, only the end men and players outside them; college, everyone at the snap (punt.release)', 'Rulebook only', [NFL, NCAA]);
const PUNTER_DEPTH = b('Punter depth and operation time are starting values from F12.4.1, not from a source read here', 'Assumption', []);

const WALL = b('A wall return sets blockers in a line a few yards apart near one sideline and the returner runs to it; the side is called before the play, often by the punter\'s tendency', 'Verified', ['st-asep-wall', 'st-kracht-punt', 'st-booth-wall', 'st-wpi-return']);
const FAKE_SOUND = b('Every punt return must stay sound against a fake', 'Verified', ['st-afca-punt-return', 'st-asep-wall', 'st-wpi-return', 'st-teeter-return']);

const FG_PROTECTION = b('Field goal and try protection: linemen nearly foot to foot, each stepping inside, with wing backs set a yard deeper than the end', '2 of 3', ['st-donovan-fg', 'st-dummies-fg']);
const FG_OPERATION = b('The snap reaches the holder in about 1.3 s and the ball is airborne about 2 s after the snap (one page, high-school level); J9 owns the timing', '1 of 3', ['st-dummies-fg']);

const KO_RULES_DYNAMIC = b('Dynamic kickoff: kick from the 35; landing zone from the goal line to the 20; a kick into the end zone on the fly is a touchback at the 35; a ball that lands in the zone and is downed in the end zone comes out to the 20; short of the zone the receivers get the 40', 'Verified', [NFL, 'st-nflops-explainer', 'st-ap-2025', 'st-bechtold-ko']);
const KO_MUST_RETURN = b('A kick that lands and stays in the landing zone must be returned', '2 of 3', [NFL, 'st-nflops-explainer', 'st-nesbitt-ko']);
const KO_RULES_TRAD = b('College kickoff from the 35: touchback at the 25, and a fair catch inside the 25 is put at the 25', 'Verified', [NCAA, 'st-edwards-hudl', 'st-haddad-fc', 'st-grabowski-swanstrom']);
const KO_COVER = b('Kickoff coverage keeps lanes, with the widest men containing the ball and the next men keeping outside leverage', '2 of 3', ['st-afca-avoid', 'st-afca-monmouth']);

const ONSIDE_TYPES = b('Onside kick types: a high bounce (lob) toward the sideline, a hard drive along the ground, and a drag or dribble kick; a hands team of sure-handed players mirrors the kicking team', 'Verified', ['st-guy-onside', 'st-asep-onside', 'st-karafantis-onside']);
const ONSIDE_DECLARED = b('Pro: the kicking team must declare an onside kick to the referee before the play clock starts, at any time in the game (2026 6-1-6); eight or nine receivers stand in the 15 yd setup zone; an untouched kick beyond the zone is the receivers\' ball', 'Rulebook only', [NFL]);
const ONSIDE_2025 = b('The 2025 rule let only a trailing team declare; 2026 removed that condition. The 2026 primary text governs', '2 of 3', [NFL, 'st-nflops-explainer', 'st-ap-2025']);
const TEN_YARDS = b('The kicking team may recover only after the ball goes 10 yd or a receiver touches it', 'Rulebook only', [NFL, NCAA]);

const FAKES_EXIST = b('Punt teams carry fakes, runs and passes out of the punt look, and practise them weekly', 'Verified', ['st-stgeorge-spread', 'st-accorsi-spread', 'st-haddad-punt', 'st-loebach-fake']);
const FAKE_LOOK = b('The look a fake needs (an uncovered man, a rush that leaves the edge) is a design value for G7.7.2; no source fixes it', 'Assumption', []);
const FAKE_SHARE = b('The fake floor share (0.01) is a coordinator design value for K4.6.1, of the order of the 0.85% of pro punt snaps that were fakes in 2022 to 2024 (research/special-teams-rates.md, play-by-play)', 'Assumption', []);
const FG_FAKES = b('Field goal teams fake out of the kick look, including the swinging gate and a shift to regular offense, and the defense must be ready for them', '2 of 3', ['st-erb-fgblock', 'st-dummies-fg']);

// ---------------------------------------------------------------- builders
const kick = (d: Omit<KickDef, 'unit'>): KickDef => ({ unit: 'kick', ...d });
const ret = (d: Omit<ReturnDef, 'unit'>): ReturnDef => ({ unit: 'return', ...d });
const scrim = (d: Omit<ScrimmageDef, 'unit'>): ScrimmageDef => ({ unit: 'offense', ...d });
const SIDES = ['left', 'right'] as const;
const word = (side: string): string => side[0]!.toUpperCase() + side.slice(1);

// ---------------------------------------------------------------- punt
const PUNTS: SpecialCallDef[] = [
  kick({ id: 'st.punt.spread', name: 'Spread punt', sheetKind: 'punt', kickKind: 'punt', direction: null, trajectory: 'deep', protection: 'spread', when: [], ruleFacts: ['F-rule-0123', 'F-rule-0124'],
    summary: 'Base punt from the spread formation: the protector sets the protection, the gunners release, the punter kicks for distance with hang time.',
    basis: [PUNT_FORMATION, PUNT_PROTECTION, PUNT_RELEASE, PUNTER_DEPTH] }),
  kick({ id: 'st.punt.shield', name: 'Shield punt', sheetKind: 'punt', kickKind: 'punt', direction: null, trajectory: 'deep', protection: 'shield', when: [], ruleFacts: ['F-rule-0123', 'F-rule-0124'],
    summary: 'Three big blockers form a shield in front of the punter, the sides block man, the centre releases free; built against the blocked punt.',
    basis: [b('A three-man shield in front of the punter, man blocking on the sides, the centre free to release', '1 of 3', ['st-holt-shield']),
      b('The shield is an alternative to the spread punt formation', '2 of 3', ['st-holt-shield', 'st-accorsi-spread']), PUNT_RELEASE, PUNTER_DEPTH] }),
  kick({ id: 'st.punt.rugby', name: 'Rugby punt', sheetKind: 'punt', kickKind: 'punt', direction: null, trajectory: 'rugby', protection: 'spread', when: [], ruleFacts: ['F-rule-0123', 'F-rule-0124'],
    summary: 'The punter takes lateral steps before kicking a low, rolling ball: coverage gets downfield and the ball is hard to field, at the cost of distance.',
    basis: [b('In a rugby punt the punter moves before kicking, which helps the coverage get downfield', '2 of 3', ['st-mckenna-rugby', 'st-haddad-punt']),
      b('A rugby kick is hard to read and field because of its low hang time and roll', '1 of 3', ['st-mckenna-rugby']), PUNT_FORMATION, PUNT_RELEASE] }),
  ...SIDES.map((side) => kick({ id: `st.punt.directional_${side}`, name: `Directional punt ${side}`, sheetKind: 'punt', kickKind: 'punt', direction: side, trajectory: 'deep', protection: 'spread', when: [], ruleFacts: ['F-rule-0123', 'F-rule-0124'],
    summary: `Punt aimed outside the hash toward the ${side} sideline so the coverage defends two-thirds of the field.`,
    basis: [b('A directional punt lands outside the hash toward the called sideline and uses the sideline to shrink the return', 'Verified', ['st-sabock-spread', 'st-guy-punting', 'st-hewitt-punt']), PUNT_FORMATION, DESIGN] })),
  kick({ id: 'st.punt.pooch', name: 'Pooch punt', sheetKind: 'punt', kickKind: 'punt', direction: null, trajectory: 'pooch', protection: 'spread', when: [], ruleFacts: ['F-rule-0129'],
    summary: 'Short punt from plus territory, kicked for hang time so the coverage can down it or force a fair catch inside the 20 without a touchback.',
    basis: [b('A short placement punt aims to stop the ball inside the 20 and keep it out of the end zone', '2 of 3', ['st-guy-punting', 'st-hewitt-punt']),
      b('Trajectory: one source has the pooch raised for hang time, the other drives the corner kick low and out of bounds', 'Conflict', ['st-hewitt-punt', 'st-guy-punting']), PUNT_FORMATION] }),
  ...SIDES.map((side) => kick({ id: `st.punt.coffin_${side}`, name: `Coffin corner ${side}`, sheetKind: 'punt', kickKind: 'punt', direction: side, trajectory: 'line', protection: 'spread', when: [], ruleFacts: ['F-rule-0129'],
    summary: `Plus-territory punt driven toward the ${side} corner to go out of bounds or be downed short of the goal line.`,
    basis: [b('A coffin corner punt is placed to go out of bounds or be downed near the corner, avoiding a touchback', '2 of 3', ['st-guy-punting', 'st-hewitt-punt']), PUNT_FORMATION, DESIGN] })),
  scrim({ id: 'st.punt.fake_pp_pass', name: 'Fake punt: protector pass', sheetKind: 'punt', from: 'punt', fake: true, playKind: 'quick_pass', requiredLook: 'wing released uncovered', fakeShare: 0.01, when: [], ruleFacts: [],
    summary: 'Direct snap to the personal protector, who runs at the line and passes to the released wing.',
    basis: [b('Direct snap to the personal protector, a run fake, then a short pass to the released wingback', '1 of 3', ['st-loebach-fake']), FAKES_EXIST, FAKE_LOOK, FAKE_SHARE] }),
  scrim({ id: 'st.punt.fake_punter_pass', name: 'Fake punt: punter pass', sheetKind: 'punt', from: 'punt', fake: true, playKind: 'dropback_pass', requiredLook: 'gunner or slot uncovered', fakeShare: 0.01, when: [], ruleFacts: [],
    summary: 'The punter takes the snap as on a punt and throws to an uncovered gunner or slot.',
    basis: [b('Punt teams pass out of the punt look, including a hot throw to an uncovered slot', 'Verified', ['st-stgeorge-spread', 'st-accorsi-spread', 'st-haddad-punt']),
      b('The punter is the passer', '1 of 3', ['st-haddad-punt']), FAKE_LOOK, FAKE_SHARE] }),
  scrim({ id: 'st.punt.fake_run', name: 'Fake punt: run', sheetKind: 'punt', from: 'punt', fake: true, playKind: 'run', requiredLook: 'rush leaves the edge open', fakeShare: 0.01, when: [], ruleFacts: [],
    summary: 'A run out of the punt look by the punter or a back, against a return that rushes and leaves the edge.',
    basis: [b('Punt teams run out of the punt look', '2 of 3', ['st-accorsi-spread', 'st-haddad-punt']),
      b('Who carries (punter, protector or wing) is set by the design; one source names the punter', '1 of 3', ['st-haddad-punt']), FAKE_LOOK, FAKE_SHARE] }),
];

// ---------------------------------------------------------------- punt return
const PUNT_RETURNS: SpecialCallDef[] = [
  ...SIDES.map((side) => ret({ id: `st.pr.wall_${side}`, name: `Wall return ${side}`, sheetKind: 'punt_return', returnKind: 'punt_return', direction: side, safe: false, when: [], ruleFacts: [],
    summary: `Hold up the gunners, then build a wall near the ${side} sideline; the returner catches and runs to the wall.`,
    basis: [WALL, b('At least one player rushes the punter on a wall return; a pressure side and a pin side are named', '2 of 3', ['st-asep-wall', 'st-wpi-return']), FAKE_SOUND] })),
  ret({ id: 'st.pr.middle', name: 'Middle return', sheetKind: 'punt_return', returnKind: 'punt_return', direction: 'middle', safe: false, when: [], ruleFacts: [],
    summary: 'Every blocker takes inside leverage on his man and the returner gets vertical up the middle.',
    basis: [b('A middle return: each blocker has inside leverage on his man and the returner gets vertical as soon as possible', '1 of 3', ['st-afca-punt-return']),
      b('Return blockers work their man from the side of the called return', '2 of 3', ['st-afca-punt-return', 'st-teeter-return']), FAKE_SOUND] }),
  ret({ id: 'st.pr.block', name: 'Punt block', sheetKind: 'punt_return', returnKind: 'punt_block', direction: null, safe: false, when: [], ruleFacts: [],
    summary: 'Overload a gap of the protection and send the rushers on a direct course to the block point in front of the punter\'s foot.',
    basis: [b('Rushers take a direct course to the block point, where the ball leaves the punter\'s foot; pressure from one side forces the kick', '2 of 3', ['st-rogers-block', 'st-wpi-return']),
      b('Overloading a gap with two rushers', '1 of 3', ['st-rogers-block']), b('How many rush (eight or more in F12.5.1) is a design value', 'Assumption', [])] }),
  ret({ id: 'st.pr.safe', name: 'Punt safe', sheetKind: 'punt_return', returnKind: 'punt_return', direction: null, safe: true, when: [], ruleFacts: [],
    summary: 'Defensive personnel stay on and every lineman is covered at the line; used when a fake is likely, with a fair catch the usual result.',
    basis: [b('A safe return when a fake punt is likely, keeping the linemen covered at the line', '1 of 3', ['st-kracht-punt']),
      b('Defend possible fakes with defensive personnel', '2 of 3', ['st-teeter-return', 'st-kracht-punt']), FAKE_SOUND] }),
];

// ---------------------------------------------------------------- field goal, try, two-point
const FIELD_GOALS: SpecialCallDef[] = [
  kick({ id: 'st.fg.field_goal', name: 'Field goal', sheetKind: 'field_goal', kickKind: 'field_goal', direction: null, trajectory: null, protection: null, when: [], ruleFacts: ['F-rule-0127', 'F-rule-0128', 'F-rule-1227', 'F-rule-1228'],
    summary: 'Base field goal: tight protection, snap, hold and kick. A miss goes to the defense by the rule set\'s miss-spot rule.',
    basis: [FG_PROTECTION, FG_OPERATION, b('The missed field goal spot is a rule value (pro: spot of the kick, not inside the 20; college: previous spot, not inside the 20)', 'Rulebook only', [NFL, NCAA])] }),
  kick({ id: 'st.fg.try_kick', name: 'Extra point', sheetKind: 'field_goal', kickKind: 'try_kick', direction: null, trajectory: null, protection: null, when: [], ruleFacts: ['F-rule-0033', 'F-rule-0034', 'F-rule-0029', 'F-rule-0030'],
    summary: 'Try by kick for one point, snapped where the rule set says (pro the 15, college the 3).',
    basis: [FG_PROTECTION, b('Try kick snap spot and points are rule values', 'Rulebook only', [NFL, NCAA])] }),
  kick({ id: 'st.fg.fair_catch_kick', name: 'Fair catch kick', sheetKind: 'field_goal', kickKind: 'fair_catch_kick', direction: null, trajectory: null, protection: null, when: [{ key: 'fg.fair_catch_kick', is: true }], ruleFacts: ['F-rule-0125', 'F-rule-0126'],
    summary: 'After a fair catch the team may try a free place kick or drop kick for a field goal from the spot, with no rush.',
    basis: [b('A free kick for a field goal after a fair catch is legal at both levels', 'Rulebook only', [NFL, NCAA])] }),
  scrim({ id: 'st.fg.fake_holder_run', name: 'Fake field goal: holder run', sheetKind: 'field_goal', from: 'field_goal', fake: true, playKind: 'run', requiredLook: 'edge rushers inside the wing', fakeShare: 0.01, when: [], ruleFacts: [],
    summary: 'The holder takes the snap and runs for the edge the block unit leaves.',
    basis: [FG_FAKES, b('The holder as the runner', 'Assumption', []), FAKE_LOOK, FAKE_SHARE] }),
  scrim({ id: 'st.fg.fake_holder_pass', name: 'Fake field goal: holder pass', sheetKind: 'field_goal', from: 'field_goal', fake: true, playKind: 'movement_pass', requiredLook: 'wing or end released uncovered', fakeShare: 0.01, when: [], ruleFacts: [],
    summary: 'The holder rises and throws to the wing or end who releases.',
    basis: [FG_FAKES, b('The holder as the passer and the wing or end as the target', 'Assumption', []), FAKE_LOOK, FAKE_SHARE] }),
  scrim({ id: 'st.fg.swinging_gate', name: 'Swinging gate', sheetKind: 'field_goal', from: 'field_goal', fake: true, playKind: 'trick', requiredLook: 'defense does not match the gate', fakeShare: 0.01, when: [], ruleFacts: [],
    summary: 'The line and backs set wide to one side of a lone snapper; the snap goes to whoever the defense leaves unmatched, or the unit shifts back to kick.',
    basis: [FG_FAKES, b('The swinging gate is a named field goal fake', '1 of 3', ['st-erb-fgblock']), b('Its alignment and options are design values', 'Assumption', []), FAKE_SHARE] }),
];

const TWO_POINT_SPOT = b('Two-point snap spot and points are rule values (pro the 2, college the 3)', 'Rulebook only', [NFL, NCAA]);
const TWO_POINT: SpecialCallDef[] = [
  scrim({ id: 'st.two.pick', name: 'Two-point pick', sheetKind: 'try', from: 'try', fake: false, playKind: 'quick_pass', requiredLook: null, fakeShare: null, when: [], ruleFacts: ['F-rule-0035', 'F-rule-0036'],
    summary: 'A rub or pick route combination that frees a quick target to the flat against tight man coverage.',
    basis: [b('Pick or rub routes give quick open targets to the flat and beat tight man coverage near the goal line', '2 of 3', ['st-bowen-2pt', 'st-leister-goalline']), TWO_POINT_SPOT] }),
  scrim({ id: 'st.two.sprint_out', name: 'Two-point sprint out', sheetKind: 'try', from: 'try', fake: false, playKind: 'movement_pass', requiredLook: null, fakeShare: null, when: [], ruleFacts: ['F-rule-0035', 'F-rule-0036'],
    summary: 'The quarterback sprints or boots out to create a throwing lane and reads a quick out to a corner route.',
    basis: [b('Moving the quarterback (sprint or boot) creates throwing lanes; a sprint-out reads quick out to corner', '2 of 3', ['st-bowen-2pt', 'st-leister-goalline']), TWO_POINT_SPOT] }),
  scrim({ id: 'st.two.fade', name: 'Two-point fade', sheetKind: 'try', from: 'try', fake: false, playKind: 'quick_pass', requiredLook: null, fakeShare: null, when: [], ruleFacts: ['F-rule-0035', 'F-rule-0036'],
    summary: 'A fade to the best outside receiver isolated on one side.',
    basis: [b('A fade is a two-point play when an elite receiver is isolated', '1 of 3', ['st-bowen-2pt']), TWO_POINT_SPOT] }),
  scrim({ id: 'st.two.jumbo_play_action', name: 'Two-point jumbo play action', sheetKind: 'try', from: 'try', fake: false, playKind: 'play_action', requiredLook: null, fakeShare: null, when: [], ruleFacts: ['F-rule-0035', 'F-rule-0036'],
    summary: 'Heavy personnel shows the run and throws behind the defenders who bite, often to a tight end.',
    basis: [b('Jumbo play action and tight end isolation as two-point plays', '1 of 3', ['st-bowen-2pt']), TWO_POINT_SPOT] }),
  scrim({ id: 'st.two.qb_power', name: 'Two-point quarterback power or option', sheetKind: 'try', from: 'try', fake: false, playKind: 'qb_run', requiredLook: null, fakeShare: null, when: [], ruleFacts: ['F-rule-0035', 'F-rule-0036'],
    summary: 'The quarterback is a runner: quarterback power or a read option, adding a blocker or a read to the count.',
    basis: [b('The option series and quarterback power as two-point plays', '1 of 3', ['st-bowen-2pt']), TWO_POINT_SPOT] }),
  scrim({ id: 'st.two.power', name: 'Two-point power run', sheetKind: 'try', from: 'try', fake: false, playKind: 'run', requiredLook: null, fakeShare: null, when: [], ruleFacts: ['F-rule-0035', 'F-rule-0036'],
    summary: 'Base power game with two backs: power, counter or lead.',
    basis: [b('The base power game (power, counter, lead) with two backs on the field', '1 of 3', ['st-bowen-2pt']), TWO_POINT_SPOT] }),
];

// ---------------------------------------------------------------- field goal block
const FG_BLOCKS: SpecialCallDef[] = [
  ...SIDES.map((side) => ret({ id: `st.fgb.edge_${side}`, name: `Edge block ${side}`, sheetKind: 'field_goal_block', returnKind: 'field_goal_block', direction: side, safe: false, when: [], ruleFacts: [],
    summary: `A fast rusher aligned wide on the ${side} edge skins the wing and goes to the block point in front of the holder.`,
    basis: [b('The edge rusher lines up wide for the angle, stays tight to the end blocker and goes to the block point about 3 yd in front of the holder', 'Verified', ['st-erb-fgblock', 'st-ratledge-fgblock', 'st-mcmahon-fgblock'])] })),
  ret({ id: 'st.fgb.middle', name: 'Middle block', sheetKind: 'field_goal_block', returnKind: 'field_goal_block', direction: 'middle', safe: false, when: [], ruleFacts: [],
    summary: 'Power rushers drive the guards back toward the holder and jumpers go up for a low kick.',
    basis: [b('Middle penetration: drive the guard back toward the holder, put the best rushers inside, and jump with hands up against a low kick', 'Verified', ['st-erb-fgblock', 'st-ratledge-fgblock', 'st-dummies-fg'])] }),
  ret({ id: 'st.fgb.safe', name: 'Field goal safe', sheetKind: 'field_goal_block', returnKind: 'field_goal_block', direction: null, safe: true, when: [], ruleFacts: [],
    summary: 'Rush without exposure and keep players in position for a fake or to return a short miss.',
    basis: [b('A safe block keeps players in position for a miss or a fake', '1 of 3', ['st-erb-fgblock']),
      b('Inside players contain in case of a fake field goal', '2 of 3', ['st-erb-fgblock', 'st-dummies-fg'])] }),
];

// ---------------------------------------------------------------- kickoff
const KICKOFFS: SpecialCallDef[] = [
  // Pro dynamic format
  kick({ id: 'st.ko.dyn_touchback', name: 'Kickoff: touchback', sheetKind: 'kickoff', kickKind: 'kickoff', direction: null, trajectory: 'deep', when: [DYNAMIC], ruleFacts: ['F-rule-0105', 'F-rule-0111'],
    summary: 'Kick into the end zone on the fly: no return, ball at the touchback spot (the 35 in 2026).',
    basis: [KO_RULES_DYNAMIC, b('The 2025 change of the touchback from the 30 to the 35 was made because the old spot did not punish kicking it out', '2 of 3', ['st-ap-2025', 'st-locker-ko'])] }),
  kick({ id: 'st.ko.dyn_landing_deep', name: 'Kickoff: deep landing zone', sheetKind: 'kickoff', kickKind: 'kickoff', direction: null, trajectory: 'high', when: [DYNAMIC], ruleFacts: ['F-rule-1199', 'F-rule-0113'],
    summary: 'High kick that lands just short of the goal line: a return is forced, and if it bounces in and is downed the ball comes out only to the 20.',
    basis: [KO_RULES_DYNAMIC, KO_MUST_RETURN, b('A kick dropped at the 5 that bounces into the end zone puts the receivers at the 20', '1 of 3', ['st-bechtold-ko']), DESIGN] }),
  kick({ id: 'st.ko.dyn_line_drive', name: 'Kickoff: line drive into the zone', sheetKind: 'kickoff', kickKind: 'kickoff', direction: null, trajectory: 'ground', when: [DYNAMIC], ruleFacts: ['F-rule-1199', 'F-rule-1211'],
    summary: 'Low, knuckling squib-style kick into the landing zone, not too near the goal line, that the returners must field; a mis-hit short of the zone gives the 40.',
    basis: [KO_RULES_DYNAMIC, b('Low knuckleball or squib-style kicks into the landing zone that must be fielded, giving the coverage time', 'Verified', ['st-bechtold-ko', 'st-nesbitt-ko', 'st-nflops-explainer']), DESIGN] }),
  // College traditional format
  kick({ id: 'st.ko.deep', name: 'Kickoff: deep', sheetKind: 'kickoff', kickKind: 'kickoff', direction: null, trajectory: 'deep', when: [TRADITIONAL], ruleFacts: ['F-rule-0106', 'F-rule-0112'],
    summary: 'Normal deep kick for a touchback or a long return against full coverage.',
    basis: [KO_RULES_TRAD, b('Deep kicks are one of the kickoff types a return team must handle', 'Verified', ['st-wyrick-kr', 'st-fore-kr', 'st-edwards-hudl']), KO_COVER] }),
  kick({ id: 'st.ko.squib', name: 'Kickoff: squib', sheetKind: 'kickoff', kickKind: 'kickoff', direction: 'middle', trajectory: 'ground', when: [TRADITIONAL], ruleFacts: ['F-rule-0106', 'F-rule-0118'],
    summary: 'Low bouncing kick, usually down the middle, to keep the ball from a dangerous returner and throw off the return\'s timing; out of bounds is costly.',
    basis: [b('Squib kicks avoid the best returner and throw off the return\'s timing; teams usually squib down the middle', 'Verified', ['st-coiner-squib', 'st-fore-kr', 'st-berson-kr', 'st-wyrick-kr']),
      b('A squib out of bounds gives the receivers good field position', '1 of 3', ['st-coiner-squib']), KO_COVER] }),
  kick({ id: 'st.ko.sky', name: 'Kickoff: sky', sheetKind: 'kickoff', kickKind: 'kickoff', direction: null, trajectory: 'high', when: [TRADITIONAL], ruleFacts: ['F-rule-0106', 'F-rule-0116'],
    summary: 'Very high, short kick that forces a fair catch or a tackle at the catch; a fair catch inside the 25 still comes out to the 25.',
    basis: [b('A sky kick is kicked as high as possible a short way downfield to force a fair catch or a tackle at the spot', '2 of 3', ['st-coiner-squib', 'st-haddad-fc']),
      b('Sky kicks are one of the kickoff types a return team must handle', 'Verified', ['st-wyrick-kr', 'st-coiner-squib', 'st-haddad-fc']), KO_RULES_TRAD] }),
  kick({ id: 'st.ko.pooch', name: 'Kickoff: pooch', sheetKind: 'kickoff', kickKind: 'kickoff', direction: null, trajectory: 'pooch', when: [TRADITIONAL], ruleFacts: ['F-rule-0106', 'F-rule-0116'],
    summary: 'Higher, shorter kick to around the 15 that puts the ball in front of the deep returners and invites a fair catch.',
    basis: [b('Pooch kicks (one source: landing about the 15) are a kickoff type return teams prepare for', 'Verified', ['st-edwards-hudl', 'st-fore-kr', 'st-wyrick-kr']), KO_RULES_TRAD, KO_COVER] }),
  ...SIDES.map((side) => kick({ id: `st.ko.directional_${side}`, name: `Kickoff: directional ${side}`, sheetKind: 'kickoff', kickKind: 'kickoff', direction: side, trajectory: 'deep', when: [TRADITIONAL], ruleFacts: ['F-rule-0106', 'F-rule-0118'],
    summary: `Deep kick placed toward the ${side} side so the coverage has the sideline as help.`,
    basis: [b('Directional kicks to the left or right are a kickoff type return teams prepare for', '2 of 3', ['st-edwards-hudl', 'st-wyrick-kr']), KO_RULES_TRAD, KO_COVER, DESIGN] })),
];

// ---------------------------------------------------------------- onside
const ONSIDES: SpecialCallDef[] = [
  kick({ id: 'st.onside.high_bounce', name: 'Onside: high bounce', sheetKind: 'onside', kickKind: 'onside_kick', direction: 'right', trajectory: 'onside_high_bounce', when: [], ruleFacts: ['F-rule-1217', 'F-rule-1218', 'F-rule-0119', 'F-rule-0120'],
    summary: 'The kick is driven into the ground so it bounces high past the 10-yard line toward the sideline for a jump ball. Declared where the rule set requires it.',
    basis: [ONSIDE_TYPES, b('The high-bounce or lob kick angles toward the sideline, bounces off the ground and goes high', '2 of 3', ['st-guy-onside', 'st-asep-onside']), TEN_YARDS] }),
  kick({ id: 'st.onside.drive', name: 'Onside: drive', sheetKind: 'onside', kickKind: 'onside_kick', direction: 'middle', trajectory: 'onside_drive', when: [], ruleFacts: ['F-rule-1217', 'F-rule-1218', 'F-rule-0119', 'F-rule-0120'],
    summary: 'A hard kick along the ground, kept below the front receiver\'s head, aimed at the front line.',
    basis: [ONSIDE_TYPES, b('The drive is a common onside kick: hit hard along the ground but not so hard that it jumps over the front returner', 'Verified', ['st-guy-onside', 'st-karafantis-onside', 'st-asep-onside']), TEN_YARDS] }),
  kick({ id: 'st.onside.dribble', name: 'Onside: dribble', sheetKind: 'onside', kickKind: 'onside_kick', direction: 'left', trajectory: 'onside_dribble', when: [], ruleFacts: ['F-rule-1217', 'F-rule-1218', 'F-rule-0119', 'F-rule-0120'],
    summary: 'A slow, soft drag kick that rolls so the kicking team arrives as it reaches 10 yards.',
    basis: [ONSIDE_TYPES, b('The drag or dribble kick; slow, soft kicks and rollers are what the front line must recover', '2 of 3', ['st-guy-onside', 'st-asep-onside']), TEN_YARDS] }),
  kick({ id: 'st.onside.surprise', name: 'Onside: surprise', sheetKind: 'onside', kickKind: 'onside_kick', direction: 'right', trajectory: 'onside_high_bounce', when: [SURPRISE_LEGAL], ruleFacts: ['F-rule-0120', 'F-rule-1218'],
    summary: 'Line up as for a normal kickoff and kick onside without warning; legal only where onside kicks need no declaration.',
    basis: [b('An onside kick can be a surprise; kicking teams lined up as if kicking deep and kicked onside', 'Verified', ['st-guy-onside', 'st-nflops-onside-2019', 'st-asep-onside']),
      b('College has no declaration rule for onside kicks; the pro game requires one', 'Rulebook only', [NFL, NCAA]), TEN_YARDS] }),
];

// ---------------------------------------------------------------- kickoff return and hands team
const KICK_RETURNS: SpecialCallDef[] = [
  ret({ id: 'st.kr.dyn_middle', name: 'Kick return middle (setup zone)', sheetKind: 'kickoff_return', returnKind: 'kick_return', direction: 'middle', safe: false, when: [DYNAMIC], ruleFacts: ['F-rule-1205', 'F-rule-1199'],
    summary: 'Nine or more in the setup zone block the men across from them as the ball lands; one of two returners fields, the other leads.',
    basis: [b('At least nine receivers line up in the setup zone (the 35 to the 30) and up to two returners in the landing zone; nobody moves until the ball lands or is touched', '2 of 3', [NFL, 'st-nflops-explainer', 'st-bechtold-ko']),
      b('Teams now build return schemes to manufacture returns under the dynamic format', '1 of 3', ['st-locker-ko']), b('Blocking rules and direction are design values', 'Assumption', []), NO_WEDGE] }),
  ...SIDES.map((side) => ret({ id: `st.kr.dyn_${side}`, name: `Kick return ${side} (setup zone)`, sheetKind: 'kickoff_return', returnKind: 'kick_return', direction: side, safe: false, when: [DYNAMIC], ruleFacts: ['F-rule-1205', 'F-rule-1199'],
    summary: `Setup-zone blockers turn their men away from the ${side} side and the returner takes the crease toward it.`,
    basis: [b('At least nine receivers line up in the setup zone and up to two returners in the landing zone', '2 of 3', [NFL, 'st-nflops-explainer', 'st-bechtold-ko']), b('Side returns under the dynamic format', 'Assumption', []), NO_WEDGE] })),
  ret({ id: 'st.kr.middle', name: 'Kick return middle', sheetKind: 'kickoff_return', returnKind: 'kick_return', direction: 'middle', safe: false, when: [TRADITIONAL], ruleFacts: ['F-rule-1035', 'F-rule-1036'],
    summary: 'The most common return: bulk up the middle, each blocker on a numbered cover man, the returner straight up the field.',
    basis: [b('The middle return is the most common choice, with the bulk of the blockers in the middle of the field', 'Verified', ['st-berson-kr', 'st-fore-kr', 'st-kracht-kick', 'st-wyrick-kr']), NO_WEDGE] }),
  ...SIDES.map((side) => ret({ id: `st.kr.sideline_${side}`, name: `Kick return ${side}`, sheetKind: 'kickoff_return', returnKind: 'kick_return', direction: side, safe: false, when: [TRADITIONAL], ruleFacts: ['F-rule-1035', 'F-rule-1036'],
    summary: `Sideline return to the ${side}: the blockers seal the coverage inside and the returner runs for the ${side} sideline.`,
    basis: [b('Right and left sideline returns, including a sideline return to the side a pooch kick goes', '2 of 3', ['st-kracht-kick', 'st-fore-kr']), NO_WEDGE] })),
  ret({ id: 'st.kr.reverse', name: 'Kick return reverse', sheetKind: 'kickoff_return', returnKind: 'kick_return', direction: null, safe: false, when: [TRADITIONAL], ruleFacts: ['F-rule-1035', 'F-rule-1036'],
    summary: 'The catcher starts one way and hands to the crossing second returner going to the other sideline.',
    basis: [b('A reverse can be run toward either sideline', '1 of 3', ['st-berson-kr']), b('Cross and reverse returns exist; one source found them poor', '2 of 3', ['st-berson-kr', 'st-wyrick-kr']), NO_WEDGE] }),
  ret({ id: 'st.kr.hands', name: 'Hands team', sheetKind: 'hands_team', returnKind: 'hands_team', direction: null, safe: true, when: [], ruleFacts: ['F-rule-1219', 'F-rule-1220'],
    summary: 'Sure-handed players mirror the kicking team; the front line lets hard low kicks through and takes slow ones, and the deep men stay ready for a deep or squib kick.',
    basis: [b('The hands team is a select group of sure-handed players that mirrors the kickoff team', '1 of 3', ['st-asep-onside']),
      b('The hands team must also handle deep and squib kicks, not just onside kicks', '2 of 3', ['st-grabowski-swanstrom', 'st-asep-onside']), ONSIDE_DECLARED, ONSIDE_2025] }),
];

/** Every special-teams call. Ids are content ids (`callContentId`), stable once published. */
export const SPECIAL_CALLS: readonly SpecialCallDef[] = [...PUNTS, ...PUNT_RETURNS, ...FIELD_GOALS, ...TWO_POINT, ...FG_BLOCKS, ...KICKOFFS, ...ONSIDES, ...KICK_RETURNS];

/** Rule-set conditions the menu reads (so tests and the integrator can check the keys exist). */
export const MENU_CONDITIONS: readonly RuleCond[] = [DYNAMIC, TRADITIONAL, MUST_DECLARE, SURPRISE_LEGAL, { key: 'fg.fair_catch_kick', is: true }];
