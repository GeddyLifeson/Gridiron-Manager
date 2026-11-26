// @gm/app-services, week commands (item 9): the press conference runs one question at a time, so each
// answer is a command that returns the session with the next question (O4.5.2, H7.2.1). The caller
// supplies the random stream (engine-core stream for the session block) and stores the result.
export { startPress, answerPress, blandAll, type PressConference } from '../../read-models/week/press.ts';
