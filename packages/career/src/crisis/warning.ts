// L9.1.3 early warning. Most trouble is visible to someone first; whether it reaches the coach depends
// on who trusts him. No awareness value is stored on the coach: every chance is read from other
// people's records toward him at the moment of the draw.
import type { WorldDate } from '@gm/schema';
import { compliance } from '@gm/league';
import type { CrisisCatalogue } from './catalogue.ts';
import { param } from './params.ts';
import type { StreamFor } from './events.ts';

/** A trigger one stage before it fires: a breakpoint near, a tie falling, a queued crisis, a pending story. */
export interface PendingTrigger {
  readonly key: string;
  readonly teamId: number;
  readonly aboutId: number;
  readonly health: boolean;
  /** The date the trigger would fire if nothing is done. */
  readonly fires: WorldDate;
}

/** One person who knows of it and has a channel to the coach. */
export type Channel =
  | { readonly kind: 'council'; readonly personId: number; readonly trust: number; readonly councilMetOn: WorldDate | null }
  | { readonly kind: 'position_coach'; readonly personId: number; readonly reportUp: number }
  | { readonly kind: 'open_door'; readonly personId: number; readonly trust: number; readonly openDoorThisWeek: boolean }
  | { readonly kind: 'medical'; readonly personId: number }
  | { readonly kind: 'reporter'; readonly personId: number; readonly goodwillBand: number };

export interface Warning {
  readonly about: number;
  readonly key: string;
  readonly sourceId: number;
  readonly sourceKind: Channel['kind'];
  /** The source's familiarity with the subject, 0 to 100, shown as a word by the screen. */
  readonly confidence: number;
  readonly leadDays: number;
  readonly arrives: WorldDate;
  readonly falseAlarm: boolean;
}

/** The chance one channel passes a pending trigger on this week (L9.1.3 rules, starting values). */
export function passOnChance(ch: Channel, pending: Pick<PendingTrigger, 'health'>, date: WorldDate): number {
  switch (ch.kind) {
    case 'council': {
      if (ch.councilMetOn === null) return 0;
      const since = compliance.daysBetween(ch.councilMetOn, date);
      if (since < 0 || since > param('warning.councilMeetingWindowDays')) return 0;
      return clamp01(ch.trust / param('warning.councilTrustDivisor'));
    }
    case 'position_coach':
      return Math.max(param('warning.reportUpMin'), Math.min(param('warning.reportUpMax'), ch.reportUp));
    case 'open_door':
      return ch.openDoorThisWeek ? clamp01((ch.trust - param('warning.openDoorTrustFloor')) / param('warning.openDoorTrustSpan')) : 0;
    case 'medical':
      return pending.health ? param('warning.medicalHealthShare') : 0;
    case 'reporter':
      return ch.goodwillBand >= param('warning.reporterBandFloor') ? param('warning.reporterTopBandsShare') : 0;
  }
}

function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }

/**
 * Draw the warnings for one pending trigger. Each channel draws on its own keyed stream. The first
 * channel (in the order given) that passes it on delivers it; lead time is drawn from the catalogue.
 * A delivered warning may bring one false alarm about another person, at the rate that makes the
 * catalogue's false-alarm share of all warnings false (L9.1.3 "wrong at a starting 10 percent").
 */
export function drawWarnings(
  cat: CrisisCatalogue,
  pending: PendingTrigger,
  channels: readonly Channel[],
  familiarity: (sourceId: number, aboutId: number) => number,
  falseAlarmCandidates: readonly number[],
  date: WorldDate,
  stream: StreamFor,
): Warning[] {
  const day = compliance.dayNumber(date);
  for (const ch of channels) {
    const s = stream(['crisis', 'warning', pending.teamId, pending.key, ch.personId, day]);
    if (!s.chance(passOnChance(ch, pending, date))) continue;
    const lead = s.int(cat.warning.leadDays.min, cat.warning.leadDays.max);
    const until = compliance.daysBetween(date, pending.fires);
    const leadDays = Math.max(0, Math.min(lead, until));
    const out: Warning[] = [{ about: pending.aboutId, key: pending.key, sourceId: ch.personId, sourceKind: ch.kind, confidence: familiarity(ch.personId, pending.aboutId), leadDays, arrives: date, falseAlarm: false }];
    const share = cat.warning.falseAlarmShare.value;
    const others = falseAlarmCandidates.filter((id) => id !== pending.aboutId);
    if (others.length > 0 && share < 1 && s.chance(share / (1 - share))) {
      const about = others[s.int(0, others.length - 1)]!;
      out.push({ about, key: `${pending.key}:false_alarm`, sourceId: ch.personId, sourceKind: ch.kind, confidence: familiarity(ch.personId, about), leadDays, arrives: date, falseAlarm: true });
    }
    return out;
  }
  return [];
}
