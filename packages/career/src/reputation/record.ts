// The reputation record (E5.1.1) as a fold over the event log (E5.1.2). The record is derived: deleting it
// and replaying the same rows rebuilds it exactly (E5.1.1 acceptance 2), and every log row names the world
// event that moved it (E5.1.2 acceptance). Nothing in areas J or D reads it (E5.1.1 rule 6): this module
// is in `career`, which no engine package may import (P1.2.1).
import type { ReputationRow, WorldEvent } from '@gm/schema';
import { PER_COMPETITION, bandOf, clampRegard, effectiveValue, keyOf, parseKey, type AudienceId, type AudienceKey, type Band } from './audiences.ts';
import { IMPACTS, TRANSFER, rowsFor, sizeFor, type ImpactRow, type ImpactTable, type TransferTable } from './impacts.ts';
import { paramWith, type Overrides } from './params.ts';

/** One audience's standing opinion of one coach. */
export interface Opinion {
  regard: number;
  known: number;
  peakKnown: number;
  /** Regard at the start of the current season, for the trend arrow. */
  seasonStartRegard: number;
  /** Last season year an event touched it (E5.1.1 rule 5 decays only quiet audiences). */
  lastTouchedYear: number | null;
}

/** A first impression from creation facts (E5.1.1 rule 1, E1.2, E1.3). Fades to nothing over two seasons. */
export interface FirstImpression {
  readonly subjectId: number;
  readonly audience: AudienceId;
  readonly competitionId: number | null;
  readonly known: number;
  readonly regardShift: number;
  readonly fromSeasonYear: number;
  readonly sourceEventId: number;
}

/** A reputation log row (E5.1.2): what happened, who noticed, which way. The user sees no sizes. */
export interface LogRow {
  readonly eventId: number;
  readonly subjectId: number;
  readonly kind: string;
  readonly key: string;
  readonly seasonYear: number;
  readonly direction: 'up' | 'down' | 'none';
  readonly regardDelta: number;
  readonly knownDelta: number;
}

export interface ReputationState {
  /** subject id to audience key to opinion. */
  readonly opinions: Map<number, Map<string, Opinion>>;
  readonly impressions: FirstImpression[];
  readonly log: LogRow[];
  /** `${subject}|${kind}` for once-only rows. */
  readonly onceApplied: Set<string>;
  /** Event id to the deltas it applied, for retractions. */
  readonly applied: Map<number, { subjectId: number; key: string; regardDelta: number }[]>;
  /** Transfer event ids already applied (E5.7.1: once). */
  readonly transfers: Set<number>;
  currentYear: number | null;
}

/** What the fold needs to know about the world, read at the event's date. */
export interface FoldContext {
  /** Rung of the subject when the event happened (E5.7.1 rule 1); null when not on the ladder. */
  rungOf(personId: number, e: WorldEvent): number | null;
  /** Leadership influence 0 to 1 of a player named on the event (L2), for how far players talk. */
  influenceOf?(personId: number): number;
  /** Level key of a competition (`levelOf`), for transfer weights. A label, never a branch. */
  levelKeyOf?(competitionId: number): string;
  readonly table?: ImpactTable;
  readonly transfer?: TransferTable;
  readonly params?: Overrides;
}

export function emptyState(): ReputationState {
  return { opinions: new Map(), impressions: [], log: [], onceApplied: new Set(), applied: new Map(), transfers: new Set(), currentYear: null };
}

function opinionOf(s: ReputationState, subjectId: number, key: string, o?: Overrides): Opinion {
  let m = s.opinions.get(subjectId);
  if (!m) { m = new Map(); s.opinions.set(subjectId, m); }
  let op = m.get(key);
  if (!op) {
    const n = paramWith(o)('record.neutral');
    op = { regard: n, known: 0, peakKnown: 0, seasonStartRegard: n, lastTouchedYear: null };
    m.set(key, op);
  }
  return op;
}

/** E5.7.1 rule 1: the most an audience can hear of a coach at this rung, or zero. */
export function rungCap(rung: number | null, audience: AudienceId, o?: Overrides): number {
  const p = paramWith(o);
  const r = rung ?? 0;
  if (r >= p('rung.fullFrom')) return 1;
  const close = audience === 'players' || audience === 'recruits' || audience === 'peers';
  if (r >= p('rung.publicFrom')) return p('rung.publicReach');
  if (!close) return 0;
  if (r > p('rung.lowMax') && r <= p('rung.midMax')) return p('rung.midReach');
  return p('rung.lowReach');
}

/** Default reach of an event to an audience before the rung cap (E5.1.2 rule 3, E5.2.1 rule 1, E5.2.2, E5.2.3). */
export function defaultReach(r: ImpactRow, a: AudienceId, e: WorldEvent, ctx: FoldContext): number {
  if (r.reach !== undefined) return r.reach;
  const p = paramWith(ctx.params);
  const isPublic = e.witnesses.kind === 'public';
  if (a === 'players' || a === 'recruits') {
    if (isPublic) return 1;
    const player = e.actors.find((x) => x.role === 'player');
    const inf = player && ctx.influenceOf ? ctx.influenceOf(player.personId) : 0;
    return Math.min(1, p('players.spreadBase') + p('players.spreadPerInfluence') * inf);
  }
  if (a === 'peers') return p('reach.coaches');
  if (a === 'administrators_and_owners') return p('reach.owners');
  return isPublic ? 1 : 0;
}

function keyFor(r: ImpactRow, a: AudienceId, e: WorldEvent): AudienceKey {
  if (!PER_COMPETITION.has(a)) return { audience: a, competitionId: null, teamId: null };
  const teamId = a === 'fans' && r.fanBase ? e.where.teamId : null;
  return { audience: a, competitionId: e.competitionId, teamId };
}

function rollSeason(s: ReputationState, year: number, o?: Overrides): void {
  if (s.currentYear === null) { s.currentYear = year; return; }
  while (s.currentYear < year) { closeSeason(s, s.currentYear, o); s.currentYear += 1; }
}

function touch(s: ReputationState, subjectId: number, key: string, kind: string, e: WorldEvent, size: number, reach: number, o?: Overrides): void {
  const p = paramWith(o);
  const op = opinionOf(s, subjectId, key, o);
  const before = op.regard;
  const knownBefore = op.known;
  op.regard = clampRegard(op.regard + size * reach * (1 - p('update.knownDamping') * op.known), o);
  op.known = Math.min(1, op.known + p('update.knownPerReach') * reach);
  op.peakKnown = Math.max(op.peakKnown, op.known);
  op.lastTouchedYear = e.when.date.seasonYear;
  const regardDelta = op.regard - before;
  s.log.push({
    eventId: e.id, subjectId, kind, key, seasonYear: e.when.date.seasonYear,
    direction: regardDelta > 0 ? 'up' : regardDelta < 0 ? 'down' : 'none', regardDelta, knownDelta: op.known - knownBefore,
  });
  const list = s.applied.get(e.id) ?? [];
  list.push({ subjectId, key, regardDelta });
  s.applied.set(e.id, list);
}

function applyTransfer(s: ReputationState, e: WorldEvent, ctx: FoldContext): void {
  if (s.transfers.has(e.id) || !ctx.levelKeyOf) return;
  const from = e.payload.fromCompetitionId;
  const to = e.payload.toCompetitionId;
  if (typeof from !== 'number' || typeof to !== 'number') return;
  const subject = e.actors.find((a) => a.role === 'coach');
  if (!subject) return;
  s.transfers.add(e.id);
  const pair = `${ctx.levelKeyOf(from)}>${ctx.levelKeyOf(to)}`;
  const weights = (ctx.transfer ?? TRANSFER)[pair];
  const p = paramWith(ctx.params);
  const n = p('record.neutral');
  const m = s.opinions.get(subject.personId);
  if (!m) return;
  if (weights) {
    for (const [k, op] of m) {
      const w = weights[parseKey(k).audience];
      if (w === undefined) continue;
      op.regard = n + w * (op.regard - n);
    }
  }
  // Media and fans are new people at the new competition; only how well known he is carries (rule 2).
  for (const a of ['media', 'fans'] as const) {
    const old = m.get(keyOf({ audience: a, competitionId: from, teamId: null }));
    if (!old) continue;
    const nu = opinionOf(s, subject.personId, keyOf({ audience: a, competitionId: to, teamId: null }), ctx.params);
    nu.known = Math.max(nu.known, p('transfer.knownPublic') * old.known);
    nu.peakKnown = Math.max(nu.peakKnown, nu.known);
  }
}

function applyRetraction(s: ReputationState, e: WorldEvent, ctx: FoldContext): void {
  if (e.causeId === null) return;
  const orig = s.applied.get(e.causeId);
  if (!orig) return;
  const share = paramWith(ctx.params)('update.retractionShare');
  for (const d of orig) {
    const op = opinionOf(s, d.subjectId, d.key, ctx.params);
    const before = op.regard;
    op.regard = clampRegard(op.regard - share * d.regardDelta, ctx.params);
    const delta = op.regard - before;
    s.log.push({ eventId: e.id, subjectId: d.subjectId, kind: 'retraction', key: d.key, seasonYear: e.when.date.seasonYear, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'none', regardDelta: delta, knownDelta: 0 });
  }
}

/** Apply one logged world event (E5.1.2 rule 2). Rows must arrive in log order. */
export function applyEvent(s: ReputationState, e: WorldEvent, ctx: FoldContext): void {
  const table = ctx.table ?? IMPACTS;
  rollSeason(s, e.when.date.seasonYear, ctx.params);
  if (table.transferEventTypes.includes(e.type)) applyTransfer(s, e, ctx);
  if (table.retractionTypes.includes(e.type)) applyRetraction(s, e, ctx);
  for (const r of rowsFor(table, e)) {
    if (r.partyOnly) continue;
    for (const actor of e.actors.filter((a) => a.role === r.subjectRole)) {
      const onceKey = `${actor.personId}|${r.kind}`;
      if (r.once && s.onceApplied.has(onceKey)) continue;
      if (r.once) s.onceApplied.add(onceKey);
      const rung = ctx.rungOf(actor.personId, e);
      for (const a of Object.keys(r.sizes) as AudienceId[]) {
        const reach = Math.min(defaultReach(r, a, e, ctx), rungCap(rung, a, ctx.params));
        if (reach <= 0) continue;
        touch(s, actor.personId, keyOf(keyFor(r, a, e)), r.kind, e, sizeFor(r, a, e), reach, ctx.params);
      }
    }
  }
}

/** Seed first impressions from creation facts (E5.1.1 rule 1), clamped to the bible caps. */
export function addImpression(s: ReputationState, imp: FirstImpression, o?: Overrides): void {
  const p = paramWith(o);
  const cap = p('impression.regardMax');
  s.impressions.push({
    ...imp,
    known: Math.min(p('impression.knownMax'), Math.max(0, imp.known)),
    regardShift: Math.max(-cap, Math.min(cap, imp.regardShift)),
  });
}

/** Season close (E5.1.1 rule 5, E5.2.5): quiet audiences drift toward neutral; fans drift toward media. */
export function closeSeason(s: ReputationState, year: number, o?: Overrides): void {
  const p = paramWith(o);
  const n = p('record.neutral');
  for (const m of s.opinions.values()) {
    for (const [k, op] of m) {
      if (op.lastTouchedYear !== year) {
        const share = parseKey(k).audience === 'fans' ? p('decay.fansQuietSeason') : p('decay.quietSeason');
        op.regard += share * (n - op.regard);
      }
    }
    for (const [k, op] of m) {
      const key = parseKey(k);
      if (key.audience !== 'fans') continue;
      const media = m.get(keyOf({ audience: 'media', competitionId: key.competitionId, teamId: null }));
      if (media) op.regard += p('fans.towardMedia') * (media.regard - op.regard);
    }
    for (const op of m.values()) {
      op.known = Math.max(op.known, p('known.floorShareOfPeak') * op.peakKnown);
      op.seasonStartRegard = op.regard;
    }
  }
}

/** Replay the whole log into a fresh record (E5.1.1 acceptance 2). */
export function replay(rows: readonly WorldEvent[], ctx: FoldContext, impressions: readonly FirstImpression[] = []): ReputationState {
  const s = emptyState();
  for (const imp of impressions) addImpression(s, imp, ctx.params);
  for (const e of rows) applyEvent(s, e, ctx);
  return s;
}

/** The value an audience acts on, with any fading first impression (E5.1.1 rules 1 and 2). */
export interface Standing {
  readonly key: AudienceKey;
  readonly regard: number;
  readonly known: number;
  readonly effective: number;
  readonly band: Band;
  readonly trend: number;
}

export function standing(s: ReputationState, subjectId: number, key: AudienceKey, asOfYear: number, o?: Overrides): Standing {
  const p = paramWith(o);
  const op = s.opinions.get(subjectId)?.get(keyOf(key));
  const n = p('record.neutral');
  let regard = op?.regard ?? n;
  let known = op?.known ?? 0;
  for (const imp of s.impressions) {
    if (imp.subjectId !== subjectId || imp.audience !== key.audience || imp.competitionId !== key.competitionId) continue;
    const fade = Math.max(0, 1 - (asOfYear - imp.fromSeasonYear) / p('impression.fadeSeasons'));
    regard += imp.regardShift * fade;
    known = Math.max(known, imp.known * fade);
  }
  regard = clampRegard(regard, o);
  return { key, regard, known, effective: effectiveValue(regard, known, o), band: bandOf(regard, known, o), trend: op ? op.regard - op.seasonStartRegard : 0 };
}

/** The panel's "three events that moved it most" for one audience in one season (E5.1.1). */
export function topEvents(s: ReputationState, subjectId: number, key: AudienceKey, seasonYear: number, o?: Overrides): number[] {
  const k = keyOf(key);
  const n = paramWith(o)('panel.topEvents');
  const byEvent = new Map<number, number>();
  for (const r of s.log) if (r.subjectId === subjectId && r.key === k && r.seasonYear === seasonYear) byEvent.set(r.eventId, (byEvent.get(r.eventId) ?? 0) + r.regardDelta);
  return [...byEvent.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0] - b[0]).slice(0, n).map(([id]) => id);
}

/**
 * Contract rows (`world:ReputationRow`). Fan bases (E5.2.5 `regard.fans[team]`) have no key in the
 * contract yet, so they are returned apart (CR-G52-1 asks for a nullable `teamId`).
 */
export function toRows(s: ReputationState, subjectId: number, seasonYear: number, o?: Overrides): { rows: ReputationRow[]; fanBases: { teamId: number; competitionId: number | null; standing: Standing }[] } {
  const rows: ReputationRow[] = [];
  const fanBases: { teamId: number; competitionId: number | null; standing: Standing }[] = [];
  const m = s.opinions.get(subjectId);
  if (!m) return { rows, fanBases };
  for (const k of [...m.keys()].sort()) {
    const key = parseKey(k);
    const st = standing(s, subjectId, key, seasonYear, o);
    if (key.teamId !== null) { fanBases.push({ teamId: key.teamId, competitionId: key.competitionId, standing: st }); continue; }
    rows.push({
      personId: subjectId, audience: key.audience, competitionId: key.competitionId,
      // The contract stores regard as a whole number on the 0 to 100 scale; the fold keeps full precision.
      regard: Math.round(st.regard), known: st.known, trend: st.trend, evidenceEventIds: topEvents(s, subjectId, key, seasonYear, o),
    });
  }
  return { rows, fanBases };
}

/** E5.1.2 acceptance: every log row points to an event id that exists in the save. */
export function untracedRows(s: ReputationState, eventIds: ReadonlySet<number>): LogRow[] {
  return s.log.filter((r) => !eventIds.has(r.eventId));
}

/** E5.2.1: how a new roster first receives him: the audience value blended with first-hand opinions in the room. */
export function startingTrust(playersEffective: number, firstHand: readonly { influence: number; trust: number }[], o?: Overrides): number {
  const p = paramWith(o);
  const base = p('players.trustBase') + p('players.trustPerValue') * playersEffective;
  let num = base;
  let den = 1;
  for (const f of firstHand) { num += f.influence * f.trust; den += f.influence; }
  return num / den;
}
