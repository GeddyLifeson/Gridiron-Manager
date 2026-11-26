// Postseason: brackets for both levels, the college field, rankings, bowls, ceremonial home dates and
// the draft order hand-off (C3.4, C3.5, T3.4 to T3.6, T3.8). Entry point of the module.
export { RULE_KEYS, PARAMS, KEY, POSTSEASON_MODULE, GROUP_CONFERENCE, GROUP_NATIONAL } from './params.ts';
export { createBracket, recordWinner, pendingGames, roundLost, formatFromRules, formatProblems, designatedHomeGroup, type Bracket, type BracketFormat, type BracketGame, type BracketGroup } from './bracket.ts';
export { draftOrder, type DraftOrder, type DraftSlot } from './draft-order.ts';
export { selectCollegeField, type CollegeConference, type CollegeField, type FieldInput } from './college-field.ts';
export { resumes, committeeRanking, poll, type RankingInput, type Resume, type RankingLogEntry, type PollInput, type Uniform } from './rankings.ts';
export { selectBowls, countedWins, type BowlDef, type BowlTieIn, type BowlTeam, type BowlInput, type BowlGame, type BowlSelection } from './bowls.ts';
export { ceremonialDates, type HomeDate, type CeremonialDates } from './ceremonial.ts';
export { createPanel, panelPoll, type Voter, type VoterKind, type PanelSpec, type PollState, type PanelPollInput, type PanelPoll } from './voters.ts';
export { POSTSEASON_ERAS, eraFor, eraEnd, rulesForSeason, eraOffered, type PostseasonEra, type EraValue } from './eras.ts';
export { livePicture, type LiveInput, type LivePicture, type LiveProInput, type LiveCollegeInput, type LiveConference, type UniformFor } from './live.ts';
