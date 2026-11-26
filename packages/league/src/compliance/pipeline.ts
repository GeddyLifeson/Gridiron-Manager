// The weekly order of the pipeline (L8.2.5): detection draws, false accusations, then cases that fall
// due are resolved. Called once per world week by the season loop (G-12 / world package).
import type { WorldDate, WorldTier } from '@gm/schema';
import { detectWindowYears, detectionWeek, falseAccusationWeek } from './detect.ts';
import { resolveDueCases } from './penalty.ts';
import { retireSpent } from './log.ts';
import type { ComplianceContext, ComplianceState, EventSink } from './types.ts';

export function complianceWeek(
  state: ComplianceState, date: WorldDate, teamIds: readonly number[], ctx: ComplianceContext, sink: EventSink,
  meta: { readonly tier: WorldTier; readonly source: 'sim' | 'history_run' | 'user' },
): ComplianceState {
  // Acts past the window, the cooldown and any open case are read by no step below: they go to the archive.
  let s = retireSpent(state, date, detectWindowYears(ctx));
  s = detectionWeek(s, date, ctx, sink, meta);
  s = falseAccusationWeek(s, teamIds, date, ctx, sink, meta);
  return resolveDueCases(s, date, ctx, sink, meta);
}
