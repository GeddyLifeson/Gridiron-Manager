// G-54 coaching skills record (bible E9, S8). Entry point of packages/career/src/record. The user's coach
// has no skill value of any kind: this module holds the record of what he has demonstrated (event ids and
// history facts), the views computed from it when shown, the "new to you" gaps of a new seat, and the
// E9.1.3 rule for what a formula reads when the coach is the user. The integrator adds one namespaced
// re-export line to the package barrel (`export * as record from './record/index.ts'`).
export * from './params.ts';
export * from './families.ts';
export * from './events.ts';
export * from './record.ts';
export * from './facts.ts';
export * from './summary.ts';
export * from './gaps.ts';
export * from './term.ts';
export * from './self-view.ts';
export * from './validate.ts';
