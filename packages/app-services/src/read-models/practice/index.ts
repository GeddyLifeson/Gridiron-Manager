// @gm/app-services, practice desk read model (G-65 over the career's practice desk, H3): the week's practices
// with their checks, the padded counter and the practice reports; plus the `practice.planner` source.
export * from './types.ts';
export { buildPracticeDeskView, plannerInput, plannerSource, weekPlans, type PracticeDeskContext, type PracticeDeskLike } from './model.ts';
export { practiceDeskSpec, PRACTICE_DESK_MODEL, PRACTICE_DESK_TASKS, type PracticeDeskSource, type PracticeDeskParams } from './spec.ts';
