// C2.3.1 Kickoff slots. Weeks are filled in order so each rest rule can read the previous week:
// a Thursday club played the previous Sunday, never Monday; at most two short-week Thursdays; no
// fewer than 3 days of rest; west-coast home games never early on Sunday; national games weighted by
// attractiveness between 0 and 7 per club. Week 18 stays unslotted until week 17 ends (C2.3.3).
import type { RandomStream } from '@gm/schema';
import type { DayCode, Pairing, ProClubInfo, ScheduleConfig, ScheduledGame, TeamId } from './types.ts';
import { DEFAULT_CONFIG } from './types.ts';
import type { IntlGame } from './pro-international.ts';
import { byYear, dayOffsetOf, daysBetween, ipow, zoneOffset } from './util.ts';

export interface SlotInput {
  readonly season: number;
  readonly pairings: readonly Pairing[];
  readonly weekOf: readonly number[];
  readonly clubs: readonly ProClubInfo[];
  readonly intl: readonly IntlGame[];
  readonly priorWins?: Readonly<Record<TeamId, number>>;
  readonly stars?: Readonly<Record<TeamId, number>>;
  readonly week1SundayDayIndex?: number;
}

interface SpecialSlot { day: DayCode; slot: string; kind: 'national' | 'international' }

const NIGHT_SLOTS = new Set(['thursday_night', 'sunday_night', 'monday_night', 'saturday_night', 'holiday_night', 'opener_night']);

/** Prime-time means a night kickoff (C2.3.1 acceptance counts clubs with none). */
export function isPrimeTime(g: ScheduledGame): boolean {
  return NIGHT_SLOTS.has(g.slot);
}

export function assignSlots(input: SlotInput, rng: RandomStream, cfg: ScheduleConfig = DEFAULT_CONFIG): { games: ScheduledGame[]; log: string[] } {
  const S = cfg.slots;
  const W = cfg.pro.weeks.count;
  const log: string[] = [];
  const clubOf = new Map(input.clubs.map((c) => [c.id, c] as const));
  const intlOf = new Map(input.intl.map((g) => [g.pairing, g] as const));
  const yearRow = byYear(S.byYear as Record<string, { week1: { day: string; slot: string; kind: string }[]; holidays: { week: number; day: string; slot: string; count: number }[] }>, input.season);
  const times = S.kickoffEtMinutes as Record<string, number>;

  // Attractiveness (C2.3.1 inputs: last season's wins, market tier, stars).
  const maxWins = Math.max(1, ...input.clubs.map((c) => input.priorWins?.[c.id] ?? 0));
  const maxMarket = Math.max(1, ...input.clubs.map((c) => c.marketTier));
  const A = S.attractiveness;
  const attr = new Map(input.clubs.map((c) => [c.id,
    A.winWeight * (input.priorWins?.[c.id] ?? 0) / maxWins + A.marketWeight * c.marketTier / maxMarket + A.starWeight * (input.stars?.[c.id] ?? 0)] as const));

  const national = new Map<TeamId, number>();
  const shortThu = new Map<TeamId, number>();
  const last = new Map<TeamId, { week: number; off: number }>();
  const byWeek = new Map<number, number[]>();
  input.weekOf.forEach((w, i) => { if (!byWeek.has(w)) byWeek.set(w, []); byWeek.get(w)!.push(i); });
  const weekGame = new Map<string, number>();
  input.weekOf.forEach((w, i) => { const p = input.pairings[i]!; weekGame.set(`${p.home}@${w}`, i); weekGame.set(`${p.away}@${w}`, i); });

  const out: ScheduledGame[] = new Array(input.pairings.length);
  const make = (i: number, w: number, day: DayCode, slot: string, nat: boolean, intl: IntlGame | null): ScheduledGame => {
    const p = input.pairings[i]!;
    const off = dayOffsetOf(day, cfg);
    const home = clubOf.get(p.home)!;
    return {
      id: `g.${input.season}.${w}.${p.home}.${p.away}`,
      season: input.season, phase: 'regular', week: w, home: p.home, away: p.away,
      venueId: intl ? intl.venueId : home.venueId, neutral: intl !== null, international: intl !== null,
      region: intl ? intl.region : null, kind: p.kind, conferenceGame: p.kind !== 'inter_rotation' && p.kind !== 'extra',
      day, dayOffset: off,
      dayIndex: input.week1SundayDayIndex === undefined ? null : input.week1SundayDayIndex + (w - 1) * cfg.time.daysPerWeek + off,
      slot, kickoffEtMinutes: slot === 'tbd' ? null : times[slot] ?? null, venueZone: intl ? intl.zone : home.zone,
      national: nat, flexEligible: w >= cfg.flex.sundayNight.limitedFirst && w < W, status: 'scheduled',
    };
  };
  const record = (g: ScheduledGame) => {
    for (const t of [g.home, g.away]) {
      last.set(t, { week: g.week, off: g.dayOffset });
      if (g.national) national.set(t, (national.get(t) ?? 0) + 1);
    }
  };

  for (let w = 1; w <= W; w++) {
    const ids = byWeek.get(w) ?? [];
    if (w === W) {
      for (const i of ids) out[i] = make(i, w, 'sun', 'tbd', false, intlOf.get(i) ?? null);
      continue;
    }
    const open = new Set(ids);
    const done: ScheduledGame[] = [];
    // International games keep their own slot.
    for (const i of ids) {
      const ig = intlOf.get(i);
      if (!ig) continue;
      const special = w === 1 ? yearRow.week1.find((s) => s.kind === 'international') : undefined;
      const g = special && ig.fixedWeek === w
        ? make(i, w, special.day as DayCode, special.slot, true, ig)
        : make(i, w, 'sun', ig.region === 'europe' ? 'international_morning' : 'sunday_late', true, ig);
      done.push(g);
      open.delete(i);
    }
    const specials: SpecialSlot[] = [];
    if (w === 1) for (const s of yearRow.week1) if (s.kind === 'opener') specials.push({ day: s.day as DayCode, slot: s.slot, kind: 'national' });
    const hol = yearRow.holidays.filter((h) => h.week === w);
    for (const h of hol) for (let k = 0; k < h.count; k++) specials.push({ day: h.day as DayCode, slot: h.slot, kind: 'national' });
    const holidayThursdayNight = hol.some((h) => h.day === 'thu' && NIGHT_SLOTS.has(h.slot));
    if (w >= S.thursdayFirstWeek && w <= S.thursdayLastWeek && !holidayThursdayNight) specials.push({ day: 'thu', slot: 'thursday_night', kind: 'national' });
    const sat = (S.saturdayGamesByWeek as Record<string, number>)[String(w)] ?? 0;
    for (let k = 0; k < sat; k++) specials.push({ day: 'sat', slot: k === 0 ? 'saturday' : 'saturday_night', kind: 'national' });
    if (w <= S.sundayNightLastWeek) specials.push({ day: 'sun', slot: 'sunday_night', kind: 'national' });
    if (w <= S.mondayNightLastWeek) specials.push({ day: 'mon', slot: 'monday_night', kind: 'national' });

    for (const sp of specials) {
      const off = dayOffsetOf(sp.day, cfg);
      const early = off < dayOffsetOf('sun', cfg);
      const cand: number[] = [];
      const weights: number[] = [];
      for (const i of open) {
        const p = input.pairings[i]!;
        let ok = true;
        let weight = ipow((attr.get(p.home) ?? 0) + (attr.get(p.away) ?? 0), A.pickPower);
        for (const t of [p.home, p.away]) {
          if ((national.get(t) ?? 0) >= S.maxNationalGames) { ok = false; break; }
          const prev = last.get(t);
          if (prev) {
            const rest = daysBetween(prev.week, prev.off, w, off, cfg);
            if (rest < S.minRestDays) { ok = false; break; }
            // Thursday (and the Wednesday holiday game): previous game Sunday or earlier, never Monday.
            if (early && sp.day !== 'sat' && sp.day !== 'fri' && prev.week === w - 1 && prev.off > dayOffsetOf('sun', cfg)) { ok = false; break; }
            const isShort = early && sp.day !== 'sat' && rest <= cfg.time.daysPerWeek - S.minRestDays;
            if (isShort && (shortThu.get(t) ?? 0) >= S.maxShortWeekThursdays) { ok = false; break; }
          }
          weight /= 1 + A.usagePenalty * (national.get(t) ?? 0);
        }
        if (!ok) continue;
        if (sp.day === 'thu') {
          const span = Math.abs(zoneOffset(clubOf.get(p.home)!.zone, cfg) - zoneOffset(clubOf.get(p.away)!.zone, cfg));
          if (span > S.thursdayMaxZoneSpan) weight /= S.thursdayZoneWeight;
        }
        if (sp.day === 'mon') {
          const nextAway = weekGame.get(`${p.away}@${w + 1}`);
          if (nextAway !== undefined && input.pairings[nextAway]!.away === p.away) weight /= S.mondayRoadNextWeight;
        }
        cand.push(i);
        weights.push(weight > 0 ? weight : Number.MIN_VALUE);
      }
      if (cand.length === 0) { log.push(`week ${w}: no eligible game for ${sp.slot} on ${sp.day}`); continue; }
      const i = cand[rng.pick(weights)]!;
      const g = make(i, w, sp.day, sp.slot, true, null);
      const p = input.pairings[i]!;
      for (const t of [p.home, p.away]) {
        const prev = last.get(t);
        if (prev && early && sp.day !== 'sat' && daysBetween(prev.week, prev.off, w, off, cfg) <= cfg.time.daysPerWeek - S.minRestDays) {
          shortThu.set(t, (shortThu.get(t) ?? 0) + 1);
        }
      }
      done.push(g);
      open.delete(i);
    }
    // Sunday afternoon: west-coast homes are always late; the rest of the late window by weighted draw.
    const noEarly = new Set(S.noEarlyZones);
    const rest = [...open];
    const forced = rest.filter((i) => noEarly.has(clubOf.get(input.pairings[i]!.home)!.zone));
    const free = rest.filter((i) => !forced.includes(i));
    const target = rng.int(S.sundayLateMin, S.sundayLateMax);
    const late = new Set(forced);
    while (late.size < target && free.length > 0) {
      const ws = free.map((i) => { const p = input.pairings[i]!; return (attr.get(p.home) ?? 0) + (attr.get(p.away) ?? 0) + Number.MIN_VALUE; });
      const k = rng.pick(ws);
      late.add(free[k]!);
      free.splice(k, 1);
    }
    for (const i of rest) done.push(make(i, w, 'sun', late.has(i) ? 'sunday_late' : 'sunday_early', false, null));
    // Record in day order so the next week's rest checks see each club's last game.
    done.sort((a, b) => a.dayOffset - b.dayOffset);
    for (const g of done) {
      const i = input.pairings.findIndex((p, k) => input.weekOf[k] === w && p.home === g.home && p.away === g.away);
      out[i] = g;
      record(g);
    }
  }
  return { games: out, log };
}
