// Step 8, needs and stress (X5) and their outcomes (X5.2.3), bound to the live world. Every active person in
// a seat (roster, job, off-ladder seat, owner or athletic director) gets one `people.needs` update a week,
// and one longer update at a season's first pass for the offseason (X5.2.1 edge case). What the world can
// measure feeds the need conditions; a need nothing measures yet reads as met (README PD-06). Team-level
// acts are drawn after every person is updated, by `weekOutcomes`.
import { needs } from '@gm/people';
import type { PersonState, WorldTier } from '@gm/schema';
import type { LiveWorld, StepContext, StepHandler } from '../loop/types.ts';
import { levelOfTeam, type TurnoverBinding } from '../turnover/binding.ts';
import { RULE_KEY } from '../turnover/params.ts';
import { cultureOf } from './culture.ts';
import { param } from './params.ts';
import { KEY, eventsFrom, recordsSoFar, seatClass, seats, startersOf, stateOf, winRate, type Seat } from './shared.ts';

/** One person's X5 record: the G-00 `PersonState` plus what the engine keeps beside it (CR-G23-1). */
export interface NeedsRecord {
  state: PersonState;
  memo: needs.StressMemo;
  coping: needs.CopingRecord | null;
  /** Prior formal acts, for the X5.2.4 spacing rules. */
  acts: needs.LastAct[];
  /** A meeting was asked for since the band was entered (X5.2.3 rule 2). */
  warned: boolean;
  /** First season the person was seen as a player, for the rookie class. */
  firstPlayerSeason: number | null;
}

export interface NeedsState {
  readonly people: Map<number, NeedsRecord>;
  /** Team id to people drawn for an act but held back by the team cap last week (X5.2.3 rule 6). */
  readonly deferred: Map<number, number[]>;
  /** The season's starters (D7.7.1 role rule), and the season they are for. */
  starters: number[];
  startersFor: number | null;
  cursor: number;
}

export function needsOf(world: LiveWorld): NeedsState {
  return stateOf<NeedsState>(world, KEY.needs, () => ({ people: new Map(), deferred: new Map(), starters: [], startersFor: null, cursor: 1 }));
}

/** Starters the needs step recorded for a season, or null (read by the edges step). */
export function recordedStarters(world: LiveWorld, seasonYear: number): ReadonlySet<number> | null {
  const s = needsOf(world);
  return s.startersFor === seasonYear ? new Set(s.starters) : null;
}

export interface NeedsBinding {
  readonly turnover: TurnoverBinding;
  /**
   * Whether the inner X5 rows (band changes, coping) are written for people of a team at this tier. Tiers
   * differ only in what is recorded (MA-66): the update runs for everyone either way. Default: tiers 1 and 2.
   */
  readonly recordInner?: (tier: WorldTier) => boolean;
}

const VETERAN_AGE = 30;

/** X5.2.3 acts a person may take off-screen today. Acts that change a roster or a job need their owner bound first (README PD-07). */
function legalActs(b: NeedsBinding, world: LiveWorld, seat: Seat): needs.FormalAct[] {
  if (seat.kind === 'player') {
    const level = levelOfTeam(world, seat.teamId);
    const drafted = (b.turnover.rule(level, RULE_KEY.draftRounds) ?? 0) > 0;
    return drafted ? ['trade_requested', 'effort_dropped'] : ['effort_dropped'];
  }
  if (seat.kind === 'decider') return [];
  return ['job_search_started'];
}

/** Witness rule of each X5 event type, as its type file sets it (needs NEEDS_EVENT_TYPES). */
function witnessesFor(type: string, personId: number, teamId: number) {
  const rule = needs.eventType(type)?.witnessRule ?? 'none';
  switch (rule) {
    case 'public': return { kind: 'public' as const };
    case 'team': return { kind: 'team' as const, teamId };
    case 'room': return { kind: 'room' as const, teamId, roomKey: 'team' };
    case 'people': return { kind: 'people' as const, personIds: [personId] };
    default: return { kind: 'none' as const };
  }
}

function emptyState(personId: number): PersonState {
  return { personId, needs: {}, stress: 0, stressBand: 'settled', lastAct: null, coping: null };
}

export function needsStep(b: NeedsBinding): StepHandler {
  const recordInner = b.recordInner ?? ((t: WorldTier) => t <= 2);
  return (ctx: StepContext) => {
    const { world } = ctx;
    const state = needsOf(world);
    const year = world.date.seasonYear;
    const firstPass = world.week === 0;
    if (firstPass && state.startersFor !== year) {
      state.starters = [...startersOf(world, b.turnover)].sort((x, y) => x - y);
      state.startersFor = year;
      // Inactive and dead people run no weekly systems (X12.1.3 rule 1): their X5 records go.
      for (const id of [...state.people.keys()]) if (world.status.get(id) !== 'active') state.people.delete(id);
    }
    const starters = new Set(state.starters);
    const weeks = firstPass ? param('needs.offseasonWeeks') : 1;

    // Relief this week from the log (X5.1.2 relief sources) and from this week's games.
    const relief = new Map<number, string[]>();
    const addRelief = (id: number, src: string) => { const l = relief.get(id); if (l) l.push(src); else relief.set(id, [src]); };
    for (const e of eventsFrom(world, state.cursor)) {
      if (e.type === 'player_signed') for (const s of e.subjects) if (s.kind === 'person') { addRelief(s.id, 'contract_signed'); addRelief(s.id, 'roster_spot_secured'); }
    }
    state.cursor = world.log.nextId;
    const wonThisWeek = new Set<number>();
    for (const g of world.results) {
      if (g.week !== world.week || g.homePoints === g.awayPoints) continue;
      wonThisWeek.add(g.homePoints > g.awayPoints ? g.homeTeamId : g.awayTeamId);
    }
    const records = recordsSoFar(world);
    const lastSeason = world.seasons[world.seasons.length - 1];
    const winMet = (teamId: number): number => {
      const now = winRate(records.get(teamId));
      if (now !== null) return now;
      return winRate(lastSeason?.records[teamId]) ?? 0.5;
    };

    const all = seats(world);
    const byTeam = new Map<number, number[]>();
    for (const [id, seat] of all) { const l = byTeam.get(seat.teamId); if (l) l.push(id); else byTeam.set(seat.teamId, [id]); }
    let updated = 0, innerRows = 0, acts = 0, meetings = 0;
    const bands: Record<string, number> = { settled: 0, unsettled: 0, unhappy: 0, at_breaking_point: 0 };

    for (const teamId of [...byTeam.keys()].sort((x, y) => x - y)) {
      const draw = ctx.open('needs', [teamId]);
      const d = () => draw.uniform();
      const tier = ctx.tierOfTeam(teamId);
      const culture = cultureOf(world, teamId);
      const rows = needs.applyCultureOverrides(needs.STARTING_CLASS_WEIGHTS, culture?.needWeightOverrides);
      const candidates: needs.ActCandidate[] = [];
      for (const id of byTeam.get(teamId)!.sort((x, y) => x - y)) {
        const p = world.people.get(id);
        const seat = all.get(id)!;
        if (!p || world.status.get(id) !== 'active' || id === world.userPersonId || p.origin === 'user') continue;
        const rec = state.people.get(id) ?? { state: emptyState(id), memo: needs.EMPTY_MEMO, coping: null, acts: [], warned: false, firstPlayerSeason: null };
        const traits = needs.engineTraits(p);
        const age = year - p.birthDate.seasonYear;

        let kind: needs.PersonKind; const classIds: string[] = [];
        const conditions: Record<string, needs.NeedCondition> = {};
        const met = (needId: string, value: number, sources?: string[]) => { conditions[needId] = sources ? { met: value, reliefSources: sources } : { met: value }; };
        const rs = relief.get(id) ?? [];
        if (seat.kind === 'player') {
          kind = 'player';
          if (rec.firstPlayerSeason === null) rec.firstPlayerSeason = year;
          const starter = starters.has(id);
          classIds.push(starter ? 'starter' : 'backup');
          if (rec.firstPlayerSeason === year) classIds.push('rookie');
          if (age >= VETERAN_AGE) classIds.push('veteran');
          met('playing_time', starter ? 1 : param('needs.backupPlayingTimeMet'), starter && firstPass ? ['named_starter'] : undefined);
          met('security', 1, rs.filter((s) => s === 'roster_spot_secured'));
          met('pay', 1, rs.filter((s) => s === 'contract_signed'));
        } else if (seat.kind === 'job') {
          const c = seatClass(seat.job.positionId);
          kind = c.kind; classIds.push(c.classId);
          met('security', world.staffContractEndYear.get(id) === year ? param('needs.lastContractSeasonSecurityMet') : 1);
        } else if (seat.kind === 'off_ladder') {
          kind = 'staff'; classIds.push('support_staff');
        } else {
          kind = 'owner'; classIds.push('owner');
        }
        met('winning', winMet(teamId), wonThisWeek.has(teamId) ? ['game_won'] : undefined);

        const weights = needs.needWeights({ kind, classIds, facets: traits.facets, values: traits.values, isUser: false }, needs.STARTING_NEEDS, rows);
        const up = needs.updatePerson({
          person: { id, origin: p.origin, age }, state: rec.state, memo: rec.memo, coping: rec.coping,
          needs: needs.STARTING_NEEDS, weights, conditions, references: {}, events: [], facets: traits.facets,
          hasWarmEdge: false, copingAddressed: false, weeks, today: world.date,
        }, d);
        updated++;
        const bandChanged = up.state.stressBand !== rec.state.stressBand;
        const next: NeedsRecord = { ...rec, state: up.state, memo: up.memo, coping: up.coping, warned: bandChanged ? false : rec.warned };
        state.people.set(id, next);
        bands[up.state.stressBand] = (bands[up.state.stressBand] ?? 0) + 1;
        if (recordInner(tier)) {
          for (const ev of up.events) {
            ctx.emit({ type: ev.type, date: world.date, teamId, subjects: [{ kind: 'person', id }], payload: ev.payload, witnesses: witnessesFor(ev.type, id, teamId), tier });
            innerRows++;
          }
        }
        if (up.state.stressBand === 'unhappy' || up.state.stressBand === 'at_breaking_point') {
          candidates.push({
            personId: id, stress: up.state.stress, band: up.state.stressBand as needs.StressBand, memo: up.memo, needLevels: up.state.needs, weights,
            loyalty: traits.facets.loyalty ?? 50, candor: traits.facets.candor ?? 50, isProtected: needs.isProtected(p), isUser: false,
            legalActs: legalActs(b, world, seat), lastAct: rec.acts[rec.acts.length - 1] ?? null, actHistory: rec.acts, warned: rec.warned,
          });
        }
      }
      if (candidates.length === 0) { state.deferred.delete(teamId); continue; }
      const out = needs.weekOutcomes(candidates, d, false, state.deferred.get(teamId) ?? []);
      if (out.deferred.length > 0) state.deferred.set(teamId, [...out.deferred]); else state.deferred.delete(teamId);
      for (const o of out.outcomes) {
        const rec = state.people.get(o.personId)!;
        if (o.kind === 'meeting_requested') {
          meetings++;
          state.people.set(o.personId, { ...rec, warned: true });
          ctx.emit({ type: o.kind, date: world.date, teamId, subjects: [{ kind: 'person', id: o.personId }], payload: { need: o.needId }, witnesses: witnessesFor(o.kind, o.personId, teamId), tier });
          continue;
        }
        acts++;
        const act: needs.LastAct = { week: rec.memo.week, kind: o.kind };
        state.people.set(o.personId, {
          ...rec, acts: [...rec.acts, act].slice(-8),
          state: { ...rec.state, stress: needs.applyRelease(rec.state.stress), lastAct: { date: world.date, kind: o.kind } },
        });
        ctx.emit({
          type: o.kind, date: world.date, teamId, subjects: [{ kind: 'person', id: o.personId }],
          payload: { need: o.needId, finalStraw: o.finalStraw }, witnesses: witnessesFor(o.kind, o.personId, teamId), tier,
        });
      }
    }
    return { updated, tracked: state.people.size, innerRows, acts, meetings, ...Object.fromEntries(Object.entries(bands).map(([k, v]) => [`band_${k}`, v])) };
  };
}
