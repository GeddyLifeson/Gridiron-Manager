// The audiences that hold an opinion of a coach (E5.1.1, E5.2) and the band words the user sees.
// The contract's `Audience` enum (schema world/career.ts) names E5's "coaches" `peers` and "owners and
// executives" `administrators_and_owners`, and adds `recruits` (T4). This module uses the contract names.
import type { WorldDate } from '@gm/schema';
import { paramWith, type Overrides } from './params.ts';

export type AudienceId = 'players' | 'recruits' | 'peers' | 'administrators_and_owners' | 'media' | 'fans';
export const AUDIENCES: readonly AudienceId[] = ['players', 'recruits', 'peers', 'administrators_and_owners', 'media', 'fans'];

/** Media and fans are different people at each competition (E5.1.1 outputs, W-21); the rest are shared. */
export const PER_COMPETITION: ReadonlySet<AudienceId> = new Set(['media', 'fans']);

/** E5.1.1 rule 4 band words. */
export type Band = 'unknown' | 'doubted' | 'mixed' | 'respected' | 'admired';

/** One audience's opinion of one coach. `teamId` is a fan base (E5.2.5); null is the national value. */
export interface AudienceKey {
  readonly audience: AudienceId;
  readonly competitionId: number | null;
  readonly teamId: number | null;
}

export function keyOf(k: AudienceKey): string {
  return `${k.audience}|${k.competitionId ?? '-'}|${k.teamId ?? '-'}`;
}

export function parseKey(s: string): AudienceKey {
  const [audience, c, t] = s.split('|') as [AudienceId, string, string];
  return { audience, competitionId: c === '-' ? null : Number(c), teamId: t === '-' ? null : Number(t) };
}

/** E5.1.1 rule 2: an unknown coach is treated as neutral whatever his private regard. */
export function effectiveValue(regard: number, known: number, o?: Overrides): number {
  const p = paramWith(o);
  const n = p('record.neutral');
  return n + known * (regard - n);
}

/** E5.1.1 rule 4, read on the effective value. */
export function bandOf(regard: number, known: number, o?: Overrides): Band {
  const p = paramWith(o);
  if (known < p('band.unknownBelowKnown')) return 'unknown';
  const v = effectiveValue(regard, known, o);
  if (v < p('band.doubtedBelow')) return 'doubted';
  if (v <= p('band.mixedTo')) return 'mixed';
  if (v <= p('band.respectedTo')) return 'respected';
  return 'admired';
}

export function clampRegard(v: number, o?: Overrides): number {
  const p = paramWith(o);
  return Math.min(p('record.regardMax'), Math.max(p('record.regardMin'), v));
}

export function dateBefore(a: WorldDate, b: WorldDate): boolean {
  return a.seasonYear < b.seasonYear || (a.seasonYear === b.seasonYear && a.dayIndex < b.dayIndex);
}
