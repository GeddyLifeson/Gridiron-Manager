// coach.job_market (O7.6.1, E2.3, E2.5, S6.5, E4.4.1, E2.7.2): the openings he knows of with how each fits his
// path (`market.fitLine`), his applications, interviews and offers, the signs about his own seat or his boss's
// he has seen (facts with a date and a source, never a "hot seat" label, E4.4.1), and the year-out choices
// when he holds no job (`market.ACTIVITY`). Level prestige, program strength and his market value are the
// core's inputs and never reach the view; an offer card shows only what an assistant can learn (S6.5.1).
import { market } from '@gm/career';
import type { WorldDate } from '@gm/schema';
import { t } from './text.ts';
import type { JobMarketView, OfferCardView, OpeningView, SignSeen, YearOutOption } from './types.ts';

export interface OpeningLabel { readonly team: string; readonly level: string; readonly title: string; readonly payCents: number | null }

export interface OfferInput {
  readonly offer: market.OfferRecord;
  readonly card: market.OfferCard;
  readonly team: string;
  readonly title: string;
}

export interface SignInput { readonly sign: market.Sign; readonly date: WorldDate; readonly source: 'inbox' | 'news' | 'agent' | 'staff' }

export interface JobMarketInput {
  readonly rights: readonly string[];
  /** His place now (rung, level prestige) or null when he holds no job; the best seat he has held. */
  readonly current: market.CareerSpot | null;
  readonly window: { readonly open: boolean; readonly until: WorldDate | null; readonly next: WorldDate | null };
  readonly openings: readonly market.Opening[];
  /** Team, level, seat title and posted pay of an opening, as the board shows them. */
  readonly label: (o: market.Opening) => OpeningLabel;
  readonly filter?: market.BoardFilter;
  readonly applications: readonly market.Application[];
  readonly interviews: readonly { readonly openingId: number; readonly date: WorldDate; readonly with: string; readonly stage: string }[];
  readonly offers: readonly OfferInput[];
  readonly signs: readonly SignInput[];
  readonly today: WorldDate;
  readonly dateText: (d: WorldDate) => string;
}

const SEEN_STAGES: ReadonlySet<market.SearchStage> = new Set(['open', 'interviewing', 'offer_out']);
const LIVE_OFFER: ReadonlySet<market.OfferState> = new Set(['live', 'agreed_in_principle']);

export function buildJobMarketView(x: JobMarketInput): JobMarketView {
  const applied = new Set(x.applications.map((a) => a.openingId));
  const openings: OpeningView[] = market.boardRows(x.openings, x.filter ?? {})
    .filter((o) => SEEN_STAGES.has(o.stage))
    .map((o) => {
      const l = x.label(o);
      return {
        id: o.id, level: l.level, team: l.team, rung: o.rung, title: l.title, side: o.side, region: o.region,
        party: o.party, reason: o.reason, stage: o.stage, payCents: l.payCents,
        fit: market.fitLine({ rung: o.rung, prestige: o.prestige }, x.current), applied: applied.has(o.id),
      };
    });
  const offers: OfferCardView[] = x.offers
    .map((o) => ({ ...o, offer: market.expireIfLate(o.offer, x.today) }))
    .filter((o) => LIVE_OFFER.has(o.offer.state))
    .map((o) => ({
      offerId: o.offer.id, team: o.team, level: o.card.level, title: o.title, rung: o.card.rung,
      salaryCents: o.card.salaryCents, years: o.card.years, callsPlays: o.card.callsPlays,
      bossReportKeys: [...o.card.bossReportKeys], staffSecurityKey: o.card.staffSecurityKey,
      whatChanges: [...o.card.whatChanges], offsetNote: o.card.offsetNote,
      deadline: x.dateText(fromDayNo(o.offer.deadlineDay)), state: o.offer.state,
    }));
  const signs: SignSeen[] = [...x.signs]
    .sort((a, b) => dayNo(b.date) - dayNo(a.date))
    .map((s) => ({ sign: s.sign, date: x.dateText(s.date), source: t(`source.${s.source}`) }));
  const yearOut: YearOutOption[] | null = x.current === null
    ? market.YEAR_OUT_ACTIVITIES.map((id) => ({ id, weeklyHours: market.ACTIVITY[id].weeklyHours, onField: market.ACTIVITY[id].onField }))
    : null;
  return {
    rights: [...x.rights],
    windowOpen: x.window.open,
    windowLine: x.window.open
      ? (x.window.until ? t('window.open', { date: x.dateText(x.window.until) }) : '')
      : (x.window.next ? t('window.closed', { date: x.dateText(x.window.next) }) : ''),
    openings,
    applications: x.applications.map((a) => ({ openingId: a.openingId, route: a.route, date: x.dateText(a.date), response: a.response === 'pending' ? null : t(`app.${a.response}`) })),
    interviews: x.interviews.map((i) => ({ openingId: i.openingId, date: x.dateText(i.date), with: i.with, stage: i.stage })),
    offers, signs, yearOut,
  };
}

// The offers module numbers days as seasonYear * 1000 + dayIndex (market/offers.ts `dayNo`).
const dayNo = (d: WorldDate): number => d.seasonYear * 1000 + d.dayIndex;
const fromDayNo = (n: number): WorldDate => ({ seasonYear: Math.floor(n / 1000), dayIndex: n % 1000 });
