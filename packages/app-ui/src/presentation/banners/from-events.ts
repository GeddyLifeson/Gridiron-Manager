// PV-05: banner requests from the PV-00 presentation feed (rulings as called, never the truth layer,
// I9.3.2) and from the game events the feed does not carry (kickoff, quarter end, two-minute warning,
// timeout, challenge, injury timeout). The feed type is structural until app-services exports the
// presentation barrel (CR-PV00-6).
import type { BannerKind, BannerRequest, BannerSlots } from './queue.ts';

export type Side = 0 | 1;

/** The parts of app-services `PresentationFeed` this file reads. */
export interface FeedForBanners {
  readonly playId: string;
  readonly result: { readonly scoreAfter: readonly [number, number] };
  readonly cues: readonly ({ readonly kind: string; readonly seq: number } & ({ readonly kind: 'ruling'; readonly ruling: string; readonly favours: Side | null } | { readonly kind: Exclude<string, 'ruling'> }))[];
}

/** Penalty card (O2.4.3): the foul, the player's number, the enforcement and the accept or decline result. */
export interface PenaltyCard {
  readonly foul: string;
  readonly against: Side;
  readonly playerNumber: number | null;
  readonly enforcement: string;
  readonly outcome: 'accepted' | 'declined' | 'offsetting' | 'pending';
}

export interface BannerContext {
  /** Generated short names by side (side 0 is home). */
  readonly teams: readonly [string, string];
  /** The penalty as announced, when the play had one. */
  readonly penalty?: PenaltyCard;
  /** What the review looked at, as announced ("ruled a catch"). */
  readonly reviewText?: string;
}

const RULING_TO_KIND: Record<string, BannerKind | null> = {
  touchdown: 'touchdown', field_goal_good: 'field_goal_good', field_goal_missed: 'field_goal_missed', safety: 'safety',
  try_good: 'try_good', try_failed: 'try_failed', interception: 'turnover', fumble_lost: 'turnover', turnover_on_downs: 'turnover',
  sack: 'sack', touchback: 'touchback', penalty: 'penalty', review_upheld: 'review_upheld', review_reversed: 'review_reversed',
  // Shown on the strip, not as banners (cue table: strip_incomplete, strip_first_down).
  incomplete: null, first_down: null,
};

const TURNOVER_TEXT: Record<string, string> = { interception: 'INTERCEPTION', fumble_lost: 'FUMBLE LOST', turnover_on_downs: 'ON DOWNS' };

export function scoreSlots(teams: readonly [string, string], score: readonly [number, number]): BannerSlots {
  return { home: teams[0], away: teams[1], hs: score[0], as: score[1] };
}

export function penaltyLines(p: PenaltyCard, teams: readonly [string, string]): { detail: string; line2: string } {
  const who = p.playerNumber === null ? teams[p.against] : `#${p.playerNumber} ${teams[p.against]}`;
  const outcome = p.outcome === 'pending' ? 'ACCEPT OR DECLINE' : p.outcome.toUpperCase();
  return { detail: `${p.foul} ${who}`, line2: `${outcome}: ${p.enforcement}` };
}

export function bannersFromFeed(feed: FeedForBanners, ctx: BannerContext): BannerRequest[] {
  const out: BannerRequest[] = [];
  const base = scoreSlots(ctx.teams, feed.result.scoreAfter);
  for (const cue of feed.cues) {
    if (cue.kind !== 'ruling' || !('ruling' in cue)) continue;
    const kind = RULING_TO_KIND[cue.ruling];
    if (!kind) continue;
    const team = cue.favours === null ? '' : ctx.teams[cue.favours];
    const slots: BannerSlots = { ...base, team };
    if (kind === 'turnover') slots.detail = `${TURNOVER_TEXT[cue.ruling] ?? ''}${team ? `, ${team} BALL` : ''}`;
    if (kind === 'penalty') Object.assign(slots, ctx.penalty ? penaltyLines(ctx.penalty, ctx.teams) : { detail: 'PENALTY', line2: '' });
    if (kind === 'review_upheld' || kind === 'review_reversed') slots.detail = ctx.reviewText ?? '';
    out.push({ kind, key: `${feed.playId}:${cue.seq}`, slots });
  }
  return out;
}

/** Game events outside the play feed. `key` must be unique per event in the game (e.g. "q2:two_minute"). */
export type GameBannerEvent =
  | { readonly kind: 'kickoff'; readonly key: string }
  | { readonly kind: 'quarter_end'; readonly key: string; readonly quarterLabel: string }
  | { readonly kind: 'two_minute'; readonly key: string }
  | { readonly kind: 'timeout'; readonly key: string; readonly side: Side; readonly left: number }
  | { readonly kind: 'challenge'; readonly key: string; readonly side: Side; readonly what: string }
  | { readonly kind: 'injury'; readonly key: string; readonly side: Side; readonly playerNumber: number | null };

export function bannerForGameEvent(ev: GameBannerEvent, teams: readonly [string, string], score: readonly [number, number]): BannerRequest {
  const slots = scoreSlots(teams, score);
  switch (ev.kind) {
    case 'quarter_end': slots.detail = ev.quarterLabel === 'OT' || /OT$/.test(ev.quarterLabel) ? ev.quarterLabel : `${ev.quarterLabel} QUARTER`; break;
    case 'timeout': slots.team = teams[ev.side]; slots.detail = `${ev.left} LEFT`; break;
    case 'challenge': slots.detail = `${teams[ev.side]}: ${ev.what}`; break;
    case 'injury': slots.detail = ev.playerNumber === null ? teams[ev.side] : `${teams[ev.side]} #${ev.playerNumber}`; break;
    default: break;
  }
  return { kind: ev.kind, key: ev.key, slots };
}
