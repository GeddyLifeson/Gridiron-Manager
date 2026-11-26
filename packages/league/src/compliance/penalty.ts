// Step 5 of L8.2.5: punish. Reads the class's penalty keys (C11.2.4, L8.2.1, L8.2.3, T9.5.3 rows via
// G-10's rule values). Empty keys use the default tier ladder and never invent a dollar figure.
// Escalation by the league record (L8.2.3), cooperation one tier lower (L8.2.5), head coach
// responsibility up the chain (T9.5.1 rule 5, K6.6.1 rule 3). Identical for the user and for AI:
// nothing here reads who is the user.
import type { RuleSet, WorldDate } from '@gm/schema';
import { violationClass, type ViolationClass } from './catalogue.ts';
import { K, P, TIERS, type Tier } from './params.ts';
import { hasPenaltyTable } from './act.ts';
import { groupOf } from './roles.ts';
import { onOrBefore, yearsBetween } from './dates.ts';
import { EVENT, draft, nameable } from './events.ts';
import type { WorldTier } from '@gm/schema';
import type {
  CaseRow, ComplianceContext, ComplianceState, EventSink, LeagueRecordEntry, PartyKey, PartyRef, PenaltyOrder, ViolationLogRow,
} from './types.ts';

function opt(rules: RuleSet, key: string): number | null { return rules.keys().includes(key) ? rules.num(key) : null; }
function flag(rules: RuleSet, key: string): boolean { return rules.keys().includes(key) ? rules.bool(key) : false; }

/** A prior finding of the same class against the same party within the repeat window (C11.2.4, L8.2.3). */
export function isRepeat(record: readonly LeagueRecordEntry[], party: PartyKey, classId: string, date: WorldDate): boolean {
  return record.some((e) => e.party.kind === party.kind && e.party.id === party.id && e.classId === classId
    && onOrBefore(e.date, date) && yearsBetween(e.date, date) <= P('repeat_window_years'));
}

/** Default ladder step (L8.2.5): minor starts one step above a warning, major two; repeat +1; cooperation -1. */
export function ladderTier(severity: 'major' | 'minor', repeat: boolean, mitigated: boolean): Tier {
  let i = TIERS.indexOf(severity === 'minor' ? 'fine_tier_1' : 'fine_tier_2');
  if (repeat) i += 1;
  if (mitigated) i -= 1;
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, i))]!;
}

function tierOrder(t: Tier, party: PartyKey, teamId: number, rules: RuleSet): PenaltyOrder {
  if (t === 'warning') return { kind: 'warning', party };
  if (t === 'suspension') return party.kind === 'person' ? { kind: 'suspension', personId: party.id, games: null } : { kind: 'warning', party };
  if (t === 'pick') return { kind: 'pick_forfeit', teamId, round: null };
  return { kind: 'fine', party, cents: opt(rules, K.tierCents(t)), tier: t, mayBeRepaidByClub: party.kind === 'team' };
}

interface Parties {
  /** Persons who acted or ordered (penalised as actors). */
  readonly persons: readonly PartyRef[];
  /** A head coach answerable for staff (T9.5.1 rule 5), when not already an actor. */
  readonly responsible: PartyRef | null;
}

function partiesOf(row: ViolationLogRow, c: ViolationClass, ctx: ComplianceContext, date: WorldDate): Parties {
  const persons = nameable([row.actor, row.orderedBy], EVENT.penalty);
  let responsible: PartyRef | null = null;
  if (c.superiorResponsible && flag(ctx.rules, K.headCoachResponsible)) {
    // Responsibility follows where it happened: the head coach of the club at the time of the act.
    const hc = ctx.headCoachOf(row.actor.teamId, row.date) ?? ctx.headCoachOf(row.actor.teamId, date);
    if (hc && !persons.some((p) => p.personId === hc.personId)) responsible = nameable([hc], EVENT.penalty)[0] ?? null;
  }
  return { persons, responsible };
}

/** Penalty orders and record entries for one detected row. */
export function penaltiesFor(
  row: ViolationLogRow, c: CaseRow, record: readonly LeagueRecordEntry[], ctx: ComplianceContext, date: WorldDate,
): { orders: PenaltyOrder[]; entries: LeagueRecordEntry[] } {
  const cls = violationClass(row.classId);
  const rules = ctx.rules;
  const { persons, responsible } = partiesOf(row, cls, ctx, date);
  const team: PartyKey = { kind: 'team', id: row.actor.teamId };
  const coop = (c.response === 'cooperate' || c.response === 'self_report') && flag(rules, K.cooperationReducesTier);
  const orders: PenaltyOrder[] = [];
  const entries: LeagueRecordEntry[] = [];
  const enter = (party: PartyKey, repeat: boolean) => entries.push({ caseId: c.id, rowId: row.id, party, classId: cls.id, severity: row.severity, date, repeat });
  const teamRepeat = isRepeat(record, team, cls.id, date);
  const keyed = row.severity === 'major' && hasPenaltyTable(rules, cls);
  const ck = (f: string) => K.classField(cls.id, f);
  // Commissioner discretion (C11.2.4 edge case): one draw per row, keyed by case and row.
  const halved = cls.commissionerDiscretion && ctx.enforcement(['commissioner', c.id, row.id]).chance(P('first_offence_halved_chance'));

  const fine = (party: PartyKey, firstKey: string, repeatKey: string, repeat: boolean, mayRepay: boolean) => {
    const step = repeat && !coop ? 'repeat' : 'first';
    let cents = opt(rules, step === 'repeat' ? repeatKey : firstKey);
    if (cents === null) return;
    const first = !repeat;
    if ((coop && first) || (halved && first)) cents = Math.floor(cents * P('mitigation_fine_factor'));
    if (cents > 0) orders.push({ kind: 'fine', party, cents, tier: null, mayBeRepaidByClub: mayRepay });
  };
  const suspension = (p: PartyRef, repeat: boolean, isResponsible: boolean) => {
    const g = opt(rules, ck(repeat && !coop ? 'suspension_games_repeat' : 'suspension_games_first'));
    if (g === null || g <= 0) return;
    const games = isResponsible && ctx.monitoring(row.actor.teamId) >= P('monitoring_mitigation_min') ? Math.floor(g * P('mitigation_fine_factor')) : g;
    if (games > 0) orders.push({ kind: 'suspension', personId: p.personId, games });
  };

  const people: { p: PartyRef; isResponsible: boolean }[] = [
    ...persons.map((p) => ({ p, isResponsible: false })),
    ...(responsible ? [{ p: responsible, isResponsible: true }] : []),
  ];

  if (keyed) {
    for (const { p, isResponsible } of people) {
      const key: PartyKey = { kind: 'person', id: p.personId };
      const rep = isRepeat(record, key, cls.id, date);
      const g = groupOf(p.role);
      // The coach's fine may not be repaid by the club (C11.2.4 rule 2).
      fine(key, ck(`fine_${g}_first_cents`), ck(`fine_${g}_repeat_cents`), rep, false);
      suspension(p, rep, isResponsible);
      const sc = opt(rules, ck('show_cause_years'));
      if (sc !== null && sc > 0) orders.push({ kind: 'show_cause', personId: p.personId, years: sc });
      enter(key, rep);
    }
    fine(team, ck('club_fine_first_cents'), ck('club_fine_repeat_cents'), teamRepeat, true);
    const round = opt(rules, ck(teamRepeat && !coop ? 'pick_round_repeat' : 'pick_round_first'));
    if (round !== null && round > 0) orders.push({ kind: 'pick_forfeit', teamId: team.id, round });
    const cancel = rules.keys().includes(ck('practice_cancel')) ? rules.opt(ck('practice_cancel')) : 'none';
    if (cancel !== 'none') orders.push({ kind: 'practice_cancelled', teamId: team.id, what: cancel });
    const prob = opt(rules, ck('probation_years'));
    if (prob !== null && prob > 0) orders.push({ kind: 'probation', teamId: team.id, years: prob });
  } else {
    for (const { p } of people) {
      const key: PartyKey = { kind: 'person', id: p.personId };
      const rep = isRepeat(record, key, cls.id, date);
      orders.push(tierOrder(ladderTier(row.severity, rep, coop), key, team.id, rules));
      enter(key, rep);
    }
    if (cls.clubAct) orders.push(tierOrder(ladderTier(row.severity, teamRepeat, coop), team, team.id, rules));
    if (row.severity === 'minor') {
      orders.push({ kind: 'rules_education', teamId: team.id });
      // T9.5.3 rule 2a: a detected minor violation suspends the responsible head coach at 56 / 2,233.
      const hc = responsible ?? people.find((x) => x.p.role === 'head_coach')?.p ?? null;
      if (hc && ctx.enforcement(['minor_suspension', c.id, row.id]).chance(P('minor_suspension_chance'))) {
        orders.push({ kind: 'suspension', personId: hc.personId, games: P('minor_suspension_games') });
      }
    }
  }
  enter(team, teamRepeat);
  return { orders, entries };
}

interface Meta { readonly tier: WorldTier; readonly source: 'sim' | 'history_run' | 'user' }

/** Close every case due on or before `date`: findings, record entries, orders, and public events. */
export function resolveDueCases(state: ComplianceState, date: WorldDate, ctx: ComplianceContext, sink: EventSink, meta: Meta): ComplianceState {
  let s = state;
  for (const c of state.cases) {
    if (c.status !== 'open' || !onOrBefore(c.resolveBy, date)) continue;
    const rows = s.log.filter((r) => c.rowIds.includes(r.id));
    const orders: PenaltyOrder[] = [];
    let record = s.record;
    for (const r of rows) {
      const out = penaltiesFor(r, c, record, ctx, date);
      orders.push(...out.orders);
      record = [...record, ...out.entries];
      const named = nameable([r.actor, r.orderedBy], EVENT.detected);
      sink.append(draft(EVENT.detected, { date, competitionId: r.competitionId, teamId: c.teamId, ...meta },
        named.map((p) => ({ personId: p.personId, role: p.role })), [{ kind: 'team', id: c.teamId }],
        { caseId: c.id, classId: r.classId, severity: r.severity, logId: r.id }, { kind: 'public' }, r.eventId));
    }
    const outcome = rows.length ? 'finding' : 'no_finding';
    // A finding ends in `penalty_imposed`; an inquiry with nothing behind it closes with no penalty (L8.2.5).
    sink.append(draft(rows.length ? EVENT.penalty : EVENT.closed, { date, competitionId: rows[0]?.competitionId ?? null, teamId: c.teamId, ...meta }, [],
      [{ kind: 'team', id: c.teamId }], rows.length ? { caseId: c.id, orders: orders.length } : { caseId: c.id }, { kind: 'public' }, null));
    s = {
      ...s,
      record,
      orders: [...s.orders, ...orders.map((order) => ({ caseId: c.id, order }))],
      cases: s.cases.map((x) => (x.id === c.id ? { ...x, status: 'closed', outcome } : x)),
    };
  }
  return s;
}
