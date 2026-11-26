// K7.4.4 trades: proposals and answers. One code path answers an AI club and the user (rule 2). Legality is
// the market module's (`checkTrade`, C8.4.1); this file only decides. Every opinion is the general manager's
// own and persistent, players are judged by what they add to a lineup, and a deal is taken only when his
// own roster worth rises, so no chain of deals with one general manager can run in a circle (Q4.3.1).
import { market } from '@gm/league';
import type { GmProfile } from './profile.ts';
import { P } from './params.ts';
import { playerWorth, rosterDelta } from './value.ts';
import { clamp, sum, type ClubId, type PersonId, type PlayerView, type ValueContext } from './types.ts';

/** A pick as an asset. `chartPoints` is the league chart value (C7.5.1, `draft.pickValue`); the caller prices it. */
export interface PickAsset {
  readonly ref: market.PickRef;
  readonly chartPoints: number;
  /** Where the slot sits in a draft: 0 first overall, 1 last. A future pick uses its expected slot. */
  readonly slotShare: number;
}

/** His own version of the chart (C7.5.1 rule 3): bent by `pickValueCurve`, lifted or cut by `draftVsVeteran`. */
export function ownPickPoints(gm: GmProfile, p: PickAsset, clubWindow: market.CompetitiveWindow, currentSeason: number): number {
  const bend = 1 + gm.philosophy.pickValueCurve * P('trade.curveBend') * (p.slotShare + p.slotShare - 1);
  const lean = 1 + gm.philosophy.draftVsVeteran * P('trade.pickLean');
  return market.adjustForWindow({ kind: 'pick', id: pickId(p.ref), points: p.chartPoints * bend * lean, season: p.ref.season }, clubWindow, currentSeason);
}

export const pickId = (r: market.PickRef): string => `${r.season}-${r.round}-${r.originalClubId}`;

/** One side of a deal, as that side's general manager sees it. */
export interface SideView {
  readonly gm: GmProfile;
  readonly clubId: ClubId;
  readonly otherGmId: PersonId;
  readonly window: market.CompetitiveWindow;
  readonly currentSeason: number;
  /** His estimates of his own roster. */
  readonly roster: readonly PlayerView[];
  /** His estimates of the players he would receive. */
  readonly receives: readonly PlayerView[];
  readonly gives: readonly PersonId[];
  readonly picksIn: readonly PickAsset[];
  readonly picksOut: readonly PickAsset[];
  /** Players the head coach named as core (M5.4.1), already weighed by `market.coreNameWeight`. */
  readonly coachCore: readonly PersonId[];
  /** Chart points one win is worth (C7.5.1 chart fitted in career value; supplied with the chart). */
  readonly pointsPerWin: number;
}

export interface Answer {
  readonly valuation: market.Valuation;
  /** What he thinks he could get elsewhere for what he gives (rule 2, `marketRead`), in points. */
  readonly hold: number;
  readonly accepts: boolean;
  readonly reason: 'gain' | 'no_gain' | 'better_elsewhere' | 'untouchable';
}

/** Sd of his error about what others would pay (K7.1.1 reader of `marketRead`), as a share. */
export function marketReadSd(marketRead: number): number {
  return P('trade.readSdBase') * clamp(1 - P('trade.readSdPerZ') * marketRead, P('trade.readSdMinFactor'), P('trade.readSdMaxFactor'));
}

/**
 * Rule 2: accepted when his estimated gain is positive by his own valuation, after his estimate of better
 * offers. Never accepts a deal that lowers his own roster worth (acceptance), whoever proposes it.
 */
export function answer(s: SideView, ctx: ValueContext): Answer {
  const toPoints = (wins: number) => wins * s.pointsPerWin;
  const line = (v: PlayerView) => {
    const raw = toPoints(playerWorth(s.gm, v, ctx).surplus);
    return { id: String(v.personId), raw, adjusted: market.adjustForWindow({ kind: 'player', id: String(v.personId), points: raw, age: v.age }, s.window, s.currentSeason) };
  };
  const giveSet = new Set(s.gives);
  const recvLines = s.receives.map(line);
  const giveLines = s.roster.filter((v) => giveSet.has(v.personId)).map(line);
  const windowCut = sum(recvLines.map((l) => l.raw - l.adjusted));
  const players = toPoints(rosterDelta(s.gm, s.roster, s.receives, s.gives, ctx)) - windowCut;
  const pick = (p: PickAsset) => { const pts = ownPickPoints(s.gm, p, s.window, s.currentSeason); return { id: pickId(p.ref), raw: p.chartPoints, adjusted: pts }; };
  const pin = s.picksIn.map(pick), pout = s.picksOut.map(pick);
  const receivePoints = sum(recvLines.map((l) => l.adjusted)) + sum(pin.map((l) => l.adjusted));
  const givePoints = sum(giveLines.map((l) => l.adjusted)) + sum(pout.map((l) => l.adjusted));
  const net = players + sum(pin.map((l) => l.adjusted)) - sum(pout.map((l) => l.adjusted));
  const untouchable = market.untouchables(s.roster.map((v) => ({ personId: v.personId, surplusPoints: toPoints(playerWorth(s.gm, v, ctx).surplus) })), s.coachCore);
  const untouchableAsked = s.gives.map(String).filter((id) => untouchable.has(id));
  // What he believes the market would add for his side. The error is his own and the same on every ask.
  const key = s.gives[0] ?? s.picksOut[0]?.ref.round ?? 0;
  const read = 1 + ctx.draw('market', s.gm.personId, key) * marketReadSd(s.gm.behavior.marketRead);
  const past = s.gm.memory.dealsWith[s.otherGmId];
  const grudge = past && past.net < 0 ? 1 + P('trade.grudge') : 1;
  // What he gives is worth what his roster loses without it (the lineup, not the name) plus the picks.
  const giveWorth = Math.max(0, -toPoints(rosterDelta(s.gm, s.roster, [], s.gives, ctx))) + sum(pout.map((l) => l.adjusted));
  const hold = P('trade.holdShare') * giveWorth * Math.max(0, read) * grudge;
  const reason: Answer['reason'] = untouchableAsked.length ? 'untouchable' : net <= 0 ? 'no_gain' : net <= hold ? 'better_elsewhere' : 'gain';
  const valuation: market.Valuation = {
    clubId: s.clubId, clubWindow: s.window, receives: [...recvLines, ...pin], gives: [...giveLines, ...pout],
    receivePoints, givePoints, net, accepts: reason === 'gain', untouchableAsked,
  };
  return { valuation, hold, accepts: reason === 'gain', reason };
}

/** What a proposing general manager knows of another club: its picks and his own estimates of its players. */
export interface PartnerBook { readonly clubId: ClubId; readonly gmId: PersonId; readonly roster: readonly PlayerView[]; readonly picks: readonly PickAsset[] }

export interface Proposal { readonly proposal: market.TradeProposal; readonly myNet: number; readonly theirNetAsIGuess: number }

/**
 * Rule 1: propose when a player would add more to another roster than he adds here, by a margin, and a
 * matching return exists. The other side's gain is his own guess from public rosters (K7.4.3 rule 4); the
 * other general manager answers with his own numbers. Rule 4: at most `trade.weeklyProposals` a week.
 */
export function proposals(me: Omit<SideView, 'receives' | 'gives' | 'picksIn' | 'picksOut' | 'otherGmId'>, partners: readonly PartnerBook[], ctx: ValueContext, alreadyThisWeek = 0): Proposal[] {
  const left = Math.max(0, P('trade.weeklyProposals') - alreadyThisWeek);
  if (left === 0) return [];
  const toPoints = (wins: number) => wins * me.pointsPerWin;
  const untouchable = market.untouchables(me.roster.map((v) => ({ personId: v.personId, surplusPoints: toPoints(playerWorth(me.gm, v, ctx).surplus) })), me.coachCore);
  const found: Proposal[] = [];
  for (const v of me.roster) {
    if (untouchable.has(String(v.personId))) continue;
    const loss = -toPoints(rosterDelta(me.gm, me.roster, [], [v.personId], ctx));
    for (const partner of [...partners].sort((a, b) => a.clubId - b.clubId)) {
      if (partner.clubId === me.clubId) continue;
      const theirGain = toPoints(rosterDelta(me.gm, partner.roster, [v], [], ctx));
      if (theirGain <= Math.max(0, loss) * (1 + P('trade.proposeMargin')) || theirGain <= 0) continue;
      // His opening ask: the best pick of theirs that, by his guess, still leaves them ahead.
      const fits = partner.picks
        .map((p) => ({ p, mine: ownPickPoints(me.gm, p, me.window, me.currentSeason) }))
        .filter((x) => x.mine > loss && x.p.chartPoints < theirGain)
        .sort((a, b) => a.p.chartPoints - b.p.chartPoints || (pickId(a.p.ref) < pickId(b.p.ref) ? -1 : 1));
      const ask = fits[fits.length - 1];
      if (!ask) continue;
      found.push({
        proposal: { clubA: me.clubId, clubB: partner.clubId, aSends: { players: [v.personId], picks: [], rights: [] }, bSends: { players: [], picks: [ask.p.ref], rights: [] } },
        myNet: ask.mine - loss, theirNetAsIGuess: theirGain - ask.p.chartPoints,
      });
    }
  }
  return found.sort((a, b) => b.myNet - a.myNet || a.proposal.clubB - b.proposal.clubB).slice(0, left);
}
