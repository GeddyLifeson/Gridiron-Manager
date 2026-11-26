// G-80 job market, hiring and firing (bible E2.3 to E2.8, E4.4, E4.6, E4.7.1, S6, S7). Entry point of
// packages/career/src/market. Builds on career/staff (windows, permission, diverse counts), career/positions
// (seats, cascade, interims) and career/contract (pay owed, offset, buyouts). Confidence and the firing
// decision are front-office/stakeholders (G-77), passed in as values.
export * from './params.ts';
export * from './keys.ts';
export * from './facts.ts';
export * from './board.ts';
export * from './score.ts';
export * from './value.ts';
export * from './offers.ts';
export * from './hotseat.ts';
export * from './saving.ts';
export * from './exits.ts';
export * from './events.ts';
