// Commands of the draft room (item 7; C7.3.1, C7.2.3, M4.5.1, M3.6.2, L5.2.1). Every action checks the
// `final_say_draft` field first. With final say the user's pick is the pick and he takes or refuses offers
// himself; without it he mentions, recommends, insists or stays silent, and the holder's general manager
// (G-76) picks with that voice weighed in. The pick clock always runs (C7.3.1 rule 5): there is no pause
// command, and AI clubs pick through the same league draft event (G-34) the user's club does.
import type { RuleSet } from '@gm/schema';
import { draft, market } from '@gm/league';
import { gm } from '@gm/front-office';
import { authorityFor } from '../../read-models/draft-room/authority.ts';
import { ownerOfSelection } from '../../read-models/draft-room/model.ts';
import { param } from '../../read-models/draft-room/params.ts';
import type { DraftOffer } from '../../read-models/draft-room/model.ts';

export interface DraftContext {
  readonly clubId: number;
  readonly state: draft.DraftState;
  readonly rules: RuleSet;
  readonly power: gm.Power;
}

export interface DraftRefusal { readonly ok: false; readonly rule: string; readonly message: string; readonly fix: string }
const refuse = (rule: string, message: string, fix: string): DraftRefusal => ({ ok: false, rule, message, fix });

/** A request to the holder of the draft field (L5.2.2): the user's action when he lacks final say. */
export interface DraftRequest {
  readonly kind: 'take_offer' | 'decline_offer';
  readonly offerId: string;
  readonly holder: gm.Holder;
}

export type DraftOutcome =
  | { readonly ok: true; readonly kind: 'filed'; readonly state: draft.DraftState }
  | { readonly ok: true; readonly kind: 'request'; readonly request: DraftRequest }
  | DraftRefusal;

const notYours = (ctx: DraftContext): DraftRefusal => {
  const a = authorityFor(ctx.power, 'final_say_draft');
  return a.authority === 'delegated'
    ? refuse('L5.2.1', 'you handed the draft to your personnel man', 'take the draft back before you pick')
    : refuse('L5.2.1', `the ${a.holder} holds final say on the draft in this job`, 'recommend or insist on the player instead');
};

/** C7.3.1: the user files his club's pick himself. Only with final say (L5.2.1 acceptance). */
export function makePick(ctx: DraftContext, personId: number, atSec: number): DraftOutcome {
  if (authorityFor(ctx.power, 'final_say_draft').authority !== 'decide') return notYours(ctx);
  const r = draft.submitPick(ctx.state, { clubId: ctx.clubId, personId, atSec, decidedBy: 'user', stance: { kind: 'made' } }, ctx.rules);
  return r.ok ? { ok: true, kind: 'filed', state: r.state } : refuse(r.rule, r.message, r.fix);
}

/**
 * M4.5.1: without final say the user states a stance for the club's next pick. It is held until the club
 * picks, and the pick's log entry carries it (silence when none was stated).
 */
export function stateVoice(ctx: DraftContext, stance: draft.UserStance): { readonly ok: true; readonly stance: draft.UserStance } | DraftRefusal {
  if (stance.kind === 'made') return refuse('M4.5.1', 'only a pick you file yourself is "made"', 'mention, recommend or insist instead');
  if (authorityFor(ctx.power, 'final_say_draft').authority === 'decide') return refuse('L5.2.1', 'you hold final say: your choice is the pick', 'make the pick');
  if (stance.kind !== 'silent' && stance.personId !== null && !ctx.state.available.includes(stance.personId)) {
    return refuse('C7.3.1', `player ${stance.personId} is not available`, 'name a player still on the board');
  }
  return { ok: true, stance };
}

/**
 * M3.6.2 rule 2 and M4.4.1 rule 4: the weight of the user's voice with the general manager. `gmVoiceWeight`
 * is his `coachVoiceWeight` (G-76 profile, L5 trust and contract terms). Each further insist in one draft
 * weighs less (market `insistWeight`); there is no cap.
 */
export function voiceWeight(stance: draft.UserStance, gmVoiceWeight: number, insistsMade: number): number {
  if (stance.kind === 'silent' || stance.kind === 'made') return 0;
  const strength = param(`draft_room.voice_${stance.kind}`);
  const k = stance.kind === 'insist' ? market.insistWeight(insistsMade + 1) : 1;
  return Math.min(1, Math.max(0, gmVoiceWeight * strength * k));
}

/**
 * K7.4.3 rule 2, the same blend `gm.buildBoard` gives a scouted player: the named player's place moves toward
 * first by the voice weight; equal places go to him, then to the general manager's own order.
 */
export function boardWithVoice(board: readonly gm.BoardRow[], stance: draft.UserStance, weight: number): gm.BoardRow[] {
  const named = stance.kind === 'silent' || stance.kind === 'made' ? null : stance.personId;
  if (named === null || weight <= 0 || !board.some((r) => r.personId === named)) return [...board];
  return board
    .map((r, i) => ({ r, own: i + 1, blended: r.personId === named ? (1 - weight) * (i + 1) + weight : i + 1, pushed: r.personId === named ? 1 : 0 }))
    .sort((a, b) => a.blended - b.blended || b.pushed - a.pushed || a.own - b.own)
    .map((x, i) => ({ ...x.r, rank: i + 1 }));
}

/**
 * C7.2.3: take or refuse a pick trade offered to the club. With final say it is filed through the league
 * draft event (a trade involving the pick on the clock must finish before that clock runs out); without
 * it, it becomes a request to the holder.
 */
export function answerOffer(ctx: DraftContext, offer: DraftOffer, take: boolean, atSec: number): DraftOutcome {
  const a = authorityFor(ctx.power, 'final_say_draft');
  if (a.authority !== 'decide') return { ok: true, kind: 'request', request: { kind: take ? 'take_offer' : 'decline_offer', offerId: offer.id, holder: a.holder } };
  if (!take) return { ok: true, kind: 'filed', state: draft.advance(ctx.state, Math.max(atSec, ctx.state.nowSec), ctx.rules) };
  const r = draft.tradeDuringDraft(ctx.state, { id: offer.id, clubs: [ctx.clubId, offer.withClubId], firstGives: offer.theyGet, secondGives: offer.theyGive }, atSec, ctx.rules);
  return r.ok ? { ok: true, kind: 'filed', state: r.state } : refuse(r.rule, r.message, r.fix);
}

/** The clock always runs: the host moves time forward with the world clock (C7.3.1 rule 5). */
export function tick(ctx: DraftContext, toSec: number): draft.DraftState {
  return draft.advance(ctx.state, toSec, ctx.rules);
}

export interface AdvanceOptions {
  /** Each club's board for the round over the players still available (G-76 `buildBoard`). */
  readonly boardFor: (clubId: number, round: number, available: readonly number[]) => readonly gm.BoardRow[];
  /** Seconds a club takes to pick (G-76 `draftDecider`). */
  readonly thinkSec: number;
  readonly dayStartSec: (day: number) => number;
  /** The user's stance for the club's next pick (advise mode), or null for silence. */
  readonly stance: draft.UserStance | null;
  /** The general manager's `coachVoiceWeight`. */
  readonly gmVoiceWeight: number;
  readonly insistsMade: number;
}

/**
 * Runs the draft until the user's club must decide or the draft ends (C7.3.1 rule 6). AI clubs pick with
 * their general managers' boards (G-76). The user's club: with final say the run stops for his pick, and only
 * after his clock expires does his personnel man fill the slot (C7.3.1 rule 2, M4.5.1 acceptance); delegated,
 * the personnel man picks; without final say the holder's general manager picks with the user's voice
 * weighed in, and the pick's log entry carries the stance (silence included).
 */
export function advanceDraft(ctx: DraftContext, opt: AdvanceOptions): { readonly state: draft.DraftState; readonly awaitingUser: boolean } {
  const authority = authorityFor(ctx.power, 'final_say_draft').authority;
  const club = gm.draftDecider(opt.boardFor, opt.thinkSec);
  const advisedBy = (stance: draft.UserStance): draft.DraftDecider => ({
    choose: (view) => {
      const board = opt.boardFor(view.clubId, view.selection.round, view.state.available);
      const moved = boardWithVoice(board, stance, voiceWeight(stance, opt.gmVoiceWeight, opt.insistsMade));
      const pick = moved.find((r) => view.state.available.includes(r.personId))?.personId ?? view.state.available[0];
      if (pick === undefined) throw new Error('draft-room: the pool is empty');
      return { personId: pick, thinkSec: opt.thinkSec, stance };
    },
  });
  const delegated: draft.DraftDecider = { choose: (view) => ({ ...club.choose(view), stance: { kind: 'silent' } }) };
  // The stated stance answers one pick: the run stops at the club's next pick so the user can answer again.
  let stance = opt.stance;
  return draft.runDraft(ctx.state, {
    dayStartSec: opt.dayStartSec,
    deciderFor: (clubId, late) => {
      if (clubId !== ctx.clubId) return club;
      if (authority === 'decide') return late ? delegated : null;
      if (authority === 'delegated') return delegated;
      // Without final say the holder picks: with the user's answer, or in silence once the clock ran out.
      if (late) return advisedBy({ kind: 'silent' });
      if (stance === null) return null;
      const d = advisedBy(stance);
      stance = null;
      return d;
    },
  }, ctx.rules);
}

/** The user's club is on the clock now. */
export function userOnClock(ctx: DraftContext): boolean {
  return ctx.state.onClock !== null && ownerOfSelection(ctx.state, ctx.state.onClock) === ctx.clubId;
}
