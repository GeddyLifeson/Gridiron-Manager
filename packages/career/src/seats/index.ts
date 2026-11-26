// G-79 game day below head coach (S5, O7.4). Entry point of packages/career/src/seats: the head coach's game-day
// sheet and headset channels, the sideline seats (substitution, signals, the position coach between series), the
// booth seats (booth eyes, charting, game-management advice), the coordinator calling for someone else, the role
// log, and the seat layouts. Pure core: seeded draws come in as `() => number`; rule values come in as `SeatRules`.
export { PARAMS, SEATS_MODULE, RULE_KEYS, sp, type SeatRules } from './params.ts';
export * from './sheet.ts';
export * from './channels.ts';
export * from './sideline.ts';
export * from './booth.ts';
export * from './advice.ts';
export * from './coordinator.ts';
export * from './record.ts';
export * from './layout.ts';
export * from './game.ts';
