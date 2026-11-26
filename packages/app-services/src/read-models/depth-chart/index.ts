// @gm/app-services, depth chart read model (team.depth_chart): units and packages with job lists, the
// lineup on the field now, staff shares, special teams load, the emergency card, battles, and the depth
// map the played game reads (M2, I6.1). `applyDepthEdit` applies the screen's edits.
export * from './types.ts';
export { buildDepthChartView, simDepthFor, unitOrder, availability, EMERGENCY_NEEDS, type DepthChartInput, type BattleInput, type PlayerCard } from './model.ts';
export { applyDepthEdit, type EditResult } from './edit.ts';
