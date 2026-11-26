// Game-day frame (I1, I8.2, I10): the pregame timeline and its locks, the game-day roster, conditions and
// kicking lines, final plan edits, captains and the toss, the pregame and postgame talks, halftime with the
// adjustment menu and uptake, the postgame handshake, game balls, injury update, news conference, first notes,
// day after, league office plays and film grading, and the records. Pure core: seeded draws come in from the
// caller's engine-core stream; rule values come in as `GameDayRules` read by key.
export { PARAMS, GAMEDAY_MODULE, RULE_KEYS } from './params.ts';
export type { GameDayRules } from './rules.ts';
export * from './math.ts';
export * from './timeline.ts';
export * from './roster.ts';
export * from './conditions.ts';
export * from './plan.ts';
export * from './toss.ts';
export * from './talks.ts';
export * from './halftime.ts';
export * from './attention.ts';
export * from './postgame.ts';
export * from './record.ts';
