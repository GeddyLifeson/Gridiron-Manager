// The only door a screen uses (K9.1.1, T4.4.1 acceptance 2, T4.4.5 acceptance 2, T4.5.2 acceptance 2).
// It reads public facts and the viewing staff's own board. It never reads true quality, true interest,
// firmness, influence weights, the commitment threshold, academic truth, or another school's `committable`.
import { publicOfferList, activeOffer } from './offers.ts';
import type { AcademicWord, BoardGrade, CircleRead, FirmnessWord, PositionGroup, RecruitingState, StaffRead } from './types.ts';

export interface ProspectPage {
  readonly personId: number;
  readonly classYear: number;
  readonly position: PositionGroup;
  readonly region: string;
  readonly heightIn: number;
  readonly weightLb: number;
  readonly source: 'high_school' | 'juco';
  readonly publicStars: number;
  readonly publicRank: number | null;
  /** Schools on his public offer list (as he or the press reports it). */
  readonly publicOffers: readonly number[];
  /** Public commitment or signing, if announced. */
  readonly publicStatus: { readonly kind: 'open' | 'committed' | 'signed'; readonly teamId: number | null };
  readonly grade: BoardGrade | null;
  readonly read: StaffRead | null;
  readonly circle: readonly CircleRead[];
  readonly firmness: { readonly word: FirmnessWord; readonly basis: string; readonly day: number } | null;
  readonly academics: { readonly word: AcademicWord; readonly basis: string; readonly day: number } | null;
  /** Our own offer and whether we said we would take his commitment now. Never another school's. */
  readonly ourOffer: { readonly day: number; readonly committable: boolean } | null;
}

/** Field names that hold truth. A static test proves none of them reaches a page. */
export const TRUTH_FIELDS = ['trueQuality', 'truePercentile', 'fortyS', 'circle.influence', 'prefs', 'openness', 'pleaser', 'dislikesNegative', 'commitThreshold', 'commitMargin', 'academics.coreGpa', 'impression', 'hcInvolvement', 'interest', 'favouriteTeamId', 'waitsForFebruary'] as const;

export function prospectPage(state: RecruitingState, viewerTeamId: number, prospectId: number): ProspectPage | null {
  const p = state.prospects[prospectId];
  const st = state.status[prospectId];
  if (!p || !st) return null;
  const b = state.boards[viewerTeamId];
  const own = activeOffer(state, prospectId, viewerTeamId);
  const kind = st.status === 'committed' ? 'committed' : st.status === 'signed' || st.status === 'enrolled' ? 'signed' : 'open';
  return {
    personId: p.personId, classYear: p.classYear, position: p.position, region: p.region, heightIn: p.heightIn, weightLb: p.weightLb,
    source: p.source, publicStars: p.publicStars, publicRank: p.publicRank, publicOffers: publicOfferList(state, prospectId),
    publicStatus: { kind, teamId: kind === 'open' ? null : st.teamId },
    grade: b?.grades[prospectId] ?? null,
    read: b?.reads[prospectId] ?? null,
    circle: b?.circles[prospectId] ?? [],
    firmness: b?.firmness[prospectId] ?? null,
    academics: b?.academics[prospectId] ?? null,
    ourOffer: own ? { day: own.day, committable: own.committable } : null,
  };
}
