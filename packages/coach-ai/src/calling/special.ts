// K4.6.1 kicking-game calls: the specific kick, return, rush or fake once K5 has chosen the kind of
// play. The same mix idea with a small menu. Values are the coordinator's own estimates (K3.2.1), in
// win probability; wind and surface reach him through those estimates (J12, J9).
import type { Draws } from '../profile/draws.ts';
import { drawIndex, floorPossible, normalise, softmax } from './mix.ts';
import { param } from './params.ts';
import type { CallMath } from './types.ts';

export interface SpecialOption {
  readonly callId: string;
  /** Estimated win-probability gain over the plain call of this kind, in his own estimate. */
  readonly estimatedGain: number;
  /** A fake. Its share is the coordinator's floor share, and only while he thinks it gains. */
  readonly fake: boolean;
  /** Floor share for a fake from the coordinator's system (content, per G7.7.2). Ignored for other options. */
  readonly fakeShare?: number;
}

export interface SpecialResult { readonly callId: string; readonly mix: readonly number[]; readonly draw: number }

/** The mix over a kicking-game menu. Ordinary options share what the fakes leave, by estimated gain. */
export function specialTeamsMix(menu: readonly SpecialOption[], math: CallMath): number[] {
  if (menu.length === 0) throw new Error('specialTeamsMix: empty menu');
  const plainAt = menu.map((o, i) => (o.fake ? -1 : i)).filter((i) => i >= 0);
  const qPlain = plainAt.length > 0 ? softmax(plainAt.map((i) => menu[i]!.estimatedGain), param('special.temperature'), math) : [];
  const q = menu.map(() => 0);
  plainAt.forEach((i, k) => { q[i] = qPlain[k]!; });
  const plain = menu.map((o) => !o.fake);
  // A fake he rates as losing keeps only the floor every possible call has (A3 ruling 22).
  const fakes = menu.map((o) => (o.fake && o.estimatedGain > 0 ? Math.max(0, o.fakeShare ?? 0) : 0));
  const fakeTotal = Math.min(0.95, fakes.reduce((a, x) => a + x, 0));
  const anyPlain = plain.some(Boolean);
  const mix = menu.map((_, i) => (plain[i] ? q[i]! * (1 - fakeTotal) : fakes[i]!));
  return floorPossible(anyPlain ? mix : normalise(fakes));
}

/** One uniform selects the call. */
export function callSpecialTeams(menu: readonly SpecialOption[], draws: Draws, math: CallMath): SpecialResult {
  const mix = specialTeamsMix(menu, math);
  const draw = draws.uniform();
  return { callId: menu[drawIndex(mix, draw)]!.callId, mix, draw };
}
