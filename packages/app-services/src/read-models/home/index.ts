// @gm/app-services, office (home) read model (G-72): today view, inbox and decision queue, advancing time
// (O1.2.1, O1.2.2, O1.2.3).
export * from './types.ts';
export { buildHomeView, buildToday, inboxRows, orderInbox, weightOf, advanceOptions, type DayPlan, type BlockInput } from './model.ts';
export { homeSpec, HOME_MODEL, HOME_TASKS, type DayPlanSource } from './spec.ts';
