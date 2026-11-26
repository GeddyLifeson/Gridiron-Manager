// G-45 locker room: leaders and discipline (bible L2.2, L2.3, L2.5, L2.6, L3). Entry point of
// packages/career/src/locker-room. Pure core: randomness comes in as a `Draw` from an engine-core stream.
// Reads the G-24 records (people/relationships ties and influence, people/culture strength) as plain values;
// sends the coach's own over-limit acts to the G-28 pipeline (league/compliance) through an `ActSink`.
export { PARAMS, LOCKER_ROOM_MODULE, lp, type Draw } from './params.ts';
export * from './keys.ts';
export * from './rules.ts';
export * from './violations.ts';
export * from './acts.ts';
export * from './fines.ts';
export * from './conduct.ts';
export * from './grievance.ts';
export * from './consistency.ts';
export * from './modifier.ts';
export * from './college.ts';
export * from './leaders.ts';
export * from './veterans.ts';
export * from './trouble.ts';
export * from './rung.ts';
