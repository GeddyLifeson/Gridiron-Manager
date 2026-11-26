// Mapping a scored game decision onto the world contract's `world:DecisionGrade` row (P3.3.2), so the
// save core can fill the `decisionGrades` table before the full N3 record is in the contract (CR-G31-1).
import type { DecisionGrade } from '@gm/schema';
import type { DecisionView } from './types.ts';

/** Null for decisions outside a game snap or without a scored view. */
export function toDecisionGrade(v: DecisionView): DecisionGrade | null {
  const r = v.record;
  const mv = v.modelView;
  if (r.time.gameId === null || r.time.playIndex === null || !mv || mv.kind === 'none') return null;
  if (mv.kind === 'game_management') {
    return {
      gameId: r.time.gameId,
      playIndex: r.time.playIndex,
      actorPersonId: r.attribution.creditedPersonId,
      decisionType: r.type,
      optionTaken: r.chosen,
      options: mv.options.map((o) => ({ optionId: o.optionId, value: o.value, uncertainty: (o.high - o.low) / 2 })),
      modelId: mv.modelId,
    };
  }
  return {
    gameId: r.time.gameId,
    playIndex: r.time.playIndex,
    actorPersonId: r.attribution.creditedPersonId,
    decisionType: r.type,
    optionTaken: r.chosen,
    options: [{ optionId: r.chosen, value: mv.foresight, uncertainty: 0 }],
    modelId: mv.modelId,
  };
}
