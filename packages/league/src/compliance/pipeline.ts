// The weekly order of the pipeline (L8.2.5): detection draws, false accusations, then cases that fall
// due are resolved. Called once per world week by the season loop (G-12 / world package).
import type { WorldDate, WorldTier } from '@gm/schema';
import { detectionWeek, falseAccusationWeek } from './detect.ts';
import { resolveDueCases } from './penalty.ts';
import type { ComplianceContext, ComplianceState, EventSink } from './types.ts';

export function complianceWeek(
  state: ComplianceState, date: WorldDate, teamIds: readonly number[], ctx: ComplianceContext, sink: EventSink,
  meta: { readonly tier: WorldTier; readonly source: 'sim' | 'history_run' | 'user' },
): ComplianceState {
  let s = detectionWeek(state, date, ctx, sink, meta);
  s = falseAccusationWeek(s, teamIds, date, ctx, sink, meta);
  return resolveDueCases(s, date, ctx, sink, meta);
}
