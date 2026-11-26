// Cap target: one pro club's contracts through the G-16 cap module (C6; CBA Arts. 7, 10, 12, 13). The rig signs,
// restructures, extends, cuts pay, releases and trades in any order, with boundary and hostile amounts, and moves
// the league year on, including far past the agreement's last year and back into history years. After every
// step the money must add up: proration sums to the bonuses, charges are whole non-negative cents, the team
// line sums to team salary, a release's dead money is exactly its parts, and a restructure moves money without
// creating or losing any.
import { stateHash } from '@gm/engine-core';
import { cap } from '@gm/league';
import { leagueRuleSet } from '../rules.ts';
import { boundaryNumber, isCount } from '../hostile.ts';
import type { Action, BreakTarget, Mode, Outcome, Rnd, Violation } from '../types.ts';

const OWNER = 'G-16 cap module (league/src/cap); rule values via the schema integrator';
const START_YEAR = 2026;
const M = (millions: number): number => Math.round(millions * 100_000_000);

interface Held { readonly contract: cap.CapContract; readonly credited: number; readonly signedYear: number }

export class CapTarget implements BreakTarget {
  readonly name = 'cap';
  readonly owner = OWNER;
  private readonly rules = leagueRuleSet('pro');
  private year = START_YEAR;
  private nextId = 1;
  private held = new Map<number, Held>();
  private dead: cap.OtherCharge[] = [];
  private designations = 0;
  private pending: Violation[] = [];

  async reset(): Promise<void> {
    this.year = START_YEAR; this.nextId = 1; this.held = new Map(); this.dead = []; this.designations = 0; this.pending = [];
  }

  private ids(): number[] { return [...this.held.keys()].sort((a, b) => a - b); }
  private min(credited: number, y = this.year): number { return cap.minimumSalary(this.rules, y, credited); }

  propose(mode: Mode, r: Rnd): Action {
    const ids = this.ids();
    const anyId = ids.length ? r.pick(ids) : 1;
    const amount = (lo: number, hi: number): number => (mode === 'legal' ? Math.round(lo + r.uniform() * (hi - lo)) : mode === 'boundary' ? boundaryNumber(r) : r.pick([-M(1), M(1e6), 0.5, -0.5, NaN, Infinity]));
    if (mode === 'out_of_order') {
      // Moves made at the wrong moment: a restructure of a past year, an extension signed years after the deal
      // ends, a release of a player already gone, time jumping to a history year or far past the agreement.
      const which = r.int(0, 4);
      if (which === 0) return { kind: 'restructure', mode, args: { id: anyId, year: this.year - r.int(1, 3), convert: M(1) } };
      if (which === 1) return { kind: 'extend', mode, args: { id: anyId, signedYear: this.year + r.int(6, 12), years: 1, base: M(2), bonus: M(5) } };
      if (which === 2) return { kind: 'release', mode, args: { id: r.chance(0.5) ? anyId : 9999, timing: 'after_june1', june1: true, reason: 'skill', basePaid: 0, earned: 0 } };
      if (which === 3) return { kind: 'setYear', mode, args: { year: r.pick([1996, 2025, 2031, 2045, 2100]) } };
      return { kind: 'trade', mode, args: { id: anyId, timing: r.pick(['on_or_before_june1', 'after_june1']), basePaid: M(50) } };
    }
    switch (r.int(0, 7)) {
      case 0: case 1: {
        const years = mode === 'legal' ? r.int(1, 5) : r.pick([0, 1, 6, 9]);
        const credited = mode === 'legal' ? r.int(0, 12) : r.pick([0, -1, 1.5, 40, NaN]);
        return { kind: 'sign', mode, args: { years, credited, base: amount(M(1.2), M(30)), bonus: amount(0, M(40)), offset: r.chance(0.5), guaranteed: r.chance(0.3) } };
      }
      case 2: return { kind: 'restructure', mode, args: { id: anyId, year: this.year, convert: amount(M(0.5), M(10)) } };
      case 3: return { kind: 'extend', mode, args: { id: anyId, signedYear: this.year, years: mode === 'legal' ? r.int(1, 3) : r.pick([0, 1, 8]), base: amount(M(1.2), M(20)), bonus: amount(0, M(20)) } };
      case 4: return { kind: 'payCut', mode, args: { id: anyId, year: this.year, base: amount(M(1.2), M(5)) } };
      case 5: return { kind: 'release', mode, args: { id: anyId, timing: r.pick(['on_or_before_june1', 'after_june1']), june1: r.chance(0.3), reason: r.pick(['skill', 'cap', 'injury']), basePaid: mode === 'legal' ? 0 : amount(0, M(5)), earned: mode === 'legal' ? 0 : amount(0, M(1)) } };
      case 6: return { kind: 'trade', mode, args: { id: anyId, timing: r.pick(['on_or_before_june1', 'after_june1']), basePaid: 0 } };
      default: return { kind: 'advanceYear', mode, args: {} };
    }
  }

  expect(a: Action): string | null | undefined {
    const g = a.args;
    const h = this.held.get(g['id'] as number);
    const money = (k: string): boolean => isCount(g[k]);
    switch (a.kind) {
      case 'sign': return undefined; // the cap module has no signing entry; the rig's own ledger checks it
      case 'restructure':
        if (!h) return undefined;
        if (!money('convert') || (g['convert'] as number) === 0) return 'the converted amount must be whole positive cents';
        // restructure() takes the year it acts in as "now"; the rig's out-of-order restructure is the caller's claim, not a module rule.
        return undefined;
      case 'extend':
        if (!h) return undefined;
        if (!money('base') || !money('bonus')) return 'money must be whole non-negative cents';
        if ((g['signedYear'] as number) > h.contract.years[h.contract.years.length - 1]!.leagueYear) return 'an extension cannot be signed after the contract has ended';
        return undefined;
      case 'payCut':
        if (!h) return undefined;
        return money('base') ? undefined : 'a new base must be whole non-negative cents';
      case 'release': case 'trade':
        if (!h) return undefined;
        if (!money('basePaid') || (a.kind === 'release' && !money('earned'))) return 'amounts paid must be whole non-negative cents';
        return undefined;
      default: return undefined;
    }
  }

  async apply(a: Action): Promise<Outcome> {
    const g = a.args;
    const h = this.held.get(g['id'] as number);
    switch (a.kind) {
      case 'advanceYear': {
        this.year += 1; this.designations = 0;
        this.dead = this.dead.filter((d) => !d.label.startsWith(`dead ${this.year - 1} `));
        // A contract whose last year has passed expires: the player is a free agent and leaves the books.
        for (const [id, x] of [...this.held]) if (x.contract.years[x.contract.years.length - 1]!.leagueYear < this.year) this.held.delete(id);
        return { accepted: true };
      }
      case 'setYear': this.year = g['year'] as number; return { accepted: true };
      case 'sign': {
        const n = g['years'] as number;
        if (!Number.isSafeInteger(n) || n < 1) return { accepted: false, reason: 'no contract years' };
        if (!isCount(g['base']) || !isCount(g['bonus'])) return { accepted: false, reason: 'the rig signs whole non-negative cents only' };
        if (!isCount(g['credited'])) return { accepted: false, reason: 'credited seasons are a whole number from 0' };
        if (!Number.isSafeInteger((g['base'] as number) * n + (g['bonus'] as number))) return { accepted: false, reason: 'the contract total is too large to keep exactly' };
        const guarantee = g['guaranteed'] ? cap.FULLY_GUARANTEED : cap.NOT_GUARANTEED;
        const years = Array.from({ length: n }, (_, i) => cap.plainYear(this.year + i, g['base'] as number, guarantee));
        const bonus = g['bonus'] as number;
        const c: cap.CapContract = {
          id: this.nextId, form: 'veteran' as cap.CapContract['form'], years, offset: g['offset'] as boolean,
          tranches: bonus > 0 ? [{ amountCents: bonus, firstLeagueYear: this.year, paidLeagueYear: this.year, source: 'signing', guarantee: cap.FULLY_GUARANTEED }] : [],
        };
        // The cap module has no "sign" entry: legality of a new deal is the minimum salary and room under the cap.
        const min = this.min(g['credited'] as number);
        if (!((g['base'] as number) >= min)) return { accepted: false, reason: 'base below the minimum salary' };
        this.held.set(this.nextId++, { contract: c, credited: g['credited'] as number, signedYear: this.year });
        return { accepted: true };
      }
      case 'restructure': {
        if (!h) return { accepted: false, reason: 'no such contract' };
        const before = cap.totalValueCents(h.contract);
        const r = cap.restructure(h.contract, g['year'] as number, g['convert'] as number, h.credited, this.rules);
        if (!r.ok) return { accepted: false, reason: r.reason };
        const after = cap.totalValueCents(r.contract);
        if (after !== before) this.pending.push({ code: 'restructure.money_changed', message: 'A restructure changed the contract\'s total value; it must only move money between salary and bonus.', detail: { before, after } });
        this.held.set(h.contract.id, { ...h, contract: r.contract });
        return { accepted: true };
      }
      case 'extend': {
        if (!h) return { accepted: false, reason: 'no such contract' };
        const last = h.contract.years[h.contract.years.length - 1]!.leagueYear;
        const n = g['years'] as number;
        const years = Array.from({ length: Math.max(0, Number.isSafeInteger(n) ? n : 0) }, (_, i) => cap.plainYear(last + 1 + i, g['base'] as number));
        const r = cap.extend(h.contract, g['signedYear'] as number, years, g['bonus'] as number);
        if (!r.ok) return { accepted: false, reason: r.reason };
        this.held.set(h.contract.id, { ...h, contract: r.contract });
        return { accepted: true };
      }
      case 'payCut': {
        if (!h) return { accepted: false, reason: 'no such contract' };
        const r = cap.payCut(h.contract, this.year, new Map([[g['year'] as number, g['base'] as number]]), h.credited, this.rules);
        if (!r.ok) return { accepted: false, reason: r.reason };
        this.held.set(h.contract.id, { ...h, contract: r.contract });
        return { accepted: true };
      }
      case 'release': {
        if (!h) return { accepted: false, reason: 'no such contract' };
        const input: cap.ReleaseInput = {
          leagueYear: this.year, timing: g['timing'] as cap.LeaveTiming, basePaidCents: g['basePaid'] as number, earnedThisYearCents: g['earned'] as number,
          reason: g['reason'] as cap.ReleaseReason, june1Designation: g['june1'] as boolean, designationsUsed: this.designations,
        };
        const r = cap.releaseCharges(h.contract, input, this.rules);
        if (!r.ok) return { accepted: false, reason: r.reason };
        const parts = r.prorationCents + r.guaranteedOwedCents + input.basePaidCents + input.earnedThisYearCents;
        const total = [...r.byYear.values()].reduce((s, v) => s + v, 0);
        if (total !== parts) this.pending.push({ code: 'release.dead_money_parts', message: 'Dead money by year does not add up to proration plus guaranteed money owed plus what was already paid and earned.', detail: { total, parts } });
        const remaining = cap.remainingProration(h.contract, this.year, this.rules);
        if (r.prorationCents !== remaining) this.pending.push({ code: 'release.proration_lost', message: 'A release accelerated a different amount of proration from what remained on the contract.', detail: { accelerated: r.prorationCents, remaining } });
        for (const [y, v] of r.byYear) if (!isCount(v)) this.pending.push({ code: 'release.dead_money_not_cents', message: 'A release produced dead money that is not whole non-negative cents.', detail: { year: y, value: String(v) } });
        if (input.june1Designation) this.designations += 1;
        for (const [y, v] of r.byYear) this.dead.push({ label: `dead ${y} contract ${h.contract.id}`, amountCents: v, kind: 'dead' });
        this.held.delete(h.contract.id);
        return { accepted: true };
      }
      case 'trade': {
        if (!h) return { accepted: false, reason: 'no such contract' };
        const r = cap.tradeCharges(h.contract, { leagueYear: this.year, timing: g['timing'] as cap.LeaveTiming, basePaidCents: g['basePaid'] as number, earnedThisYearCents: 0 }, this.rules);
        const vals = Object.entries(r).filter(([, v]) => typeof v === 'number');
        for (const [k, v] of vals) if (!Number.isFinite(v as number) || !Number.isSafeInteger(v as number)) this.pending.push({ code: 'trade.not_cents', message: `A trade produced ${k} that is not whole cents.`, detail: { field: k, value: String(v) } });
        this.held.delete(h.contract.id);
        return { accepted: true };
      }
      default: return { accepted: false, reason: `unknown action ${a.kind}` };
    }
  }

  invariants(): Violation[] {
    const out = this.pending; this.pending = [];
    let lineTotal = 0;
    for (const h of [...this.held.values()]) {
      const c = h.contract;
      const tranches = c.tranches.reduce((s, t) => s + t.amountCents, 0);
      const sched = [...cap.prorationSchedule(c, this.rules).values()].reduce((s, v) => s + v, 0);
      if (sched !== tranches && Number.isFinite(tranches)) out.push({ code: 'proration.does_not_sum', message: 'The proration schedule does not add up to the bonuses being prorated: money appears or disappears.', detail: { contract: c.id, schedule: sched, bonuses: tranches } });
      const maxYears = this.rules.num('cap.proration_max_years');
      for (const t of c.tranches) {
        const ys = cap.prorationYears(c, t, this.rules);
        if (ys.length > maxYears) out.push({ code: 'proration.too_many_years', message: `A bonus is prorated over ${ys.length} years (limit ${maxYears}).` });
        if (ys.length === 0 && t.amountCents > 0) out.push({ code: 'proration.no_years', message: 'A bonus has no year to be prorated into: its money never reaches the cap.', detail: { contract: c.id, source: t.source, first: t.firstLeagueYear, last: c.years[c.years.length - 1]!.leagueYear } });
      }
      for (const y of c.years) {
        const ch = cap.yearCharge(c, y.leagueYear, this.rules).totalCents;
        if (!isCount(ch)) out.push({ code: 'charge.not_cents', message: 'A cap charge is not whole non-negative cents.', detail: { contract: c.id, year: y.leagueYear, charge: String(ch) } });
        if (y.base.amountCents < 0) out.push({ code: 'salary.negative', message: 'A contract year carries a negative salary.', detail: { contract: c.id, year: y.leagueYear } });
      }
      lineTotal += cap.yearCharge(c, this.year, this.rules).totalCents;
    }
    const dead = this.dead.filter((d) => d.label.startsWith(`dead ${this.year} `));
    let pos: cap.TeamCapPosition | null = null;
    try {
      pos = cap.teamCapPosition({ leagueYear: this.year, phase: 'season', contracts: [...this.held.values()].map((h) => ({ contract: h.contract, player: { creditedSeasons: h.credited, undraftedRookie: false } })), other: dead, adjustmentCents: 0 }, this.rules);
    } catch (e) {
      out.push({ code: 'team_cap.throws', message: `The team cap position cannot be computed for league year ${this.year >= 2031 ? 'after 2030' : this.year < 2026 ? 'before 2026' : this.year}: ${(e as Error).message.replace(/\d{4}/g, 'YYYY')}` });
    }
    if (pos) {
      const sum = pos.lines.reduce((s, l) => s + l.chargeCents, 0);
      if (sum !== pos.teamSalaryCents) out.push({ code: 'team_cap.lines_do_not_sum', message: 'Team salary differs from the sum of its lines.' });
      const expect = lineTotal + dead.reduce((s, d) => s + d.amountCents, 0);
      if (Number.isFinite(expect) && pos.teamSalaryCents !== expect) out.push({ code: 'team_cap.missing_charges', message: 'Team salary differs from the contracts plus dead money on the books.', detail: { teamSalary: pos.teamSalaryCents, expected: expect } });
      if (pos.roomCents !== pos.capCents + pos.adjustmentCents - pos.teamSalaryCents) out.push({ code: 'team_cap.room_arithmetic', message: 'Room is not cap plus adjustments minus team salary.' });
    }
    return out;
  }

  hash(): string {
    const plain = { year: this.year, held: this.ids().map((id) => ({ id, h: JSON.stringify(this.held.get(id), (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)) })), dead: this.dead.map((d) => [d.label, String(d.amountCents)]), designations: this.designations };
    return stateHash(plain as never);
  }

  unreachable() {
    return [
      { code: 'cap.no_world_ledger', message: 'No club cap ledger lives in the world yet (contracts, dead money and designations are not world state), so the cap target keeps its own ledger over the G-16 functions. Phase 2 points it at the world once C6 state is bound.' },
      { code: 'cap.no_cash_ledger', message: 'No cash payments are recorded in the world (E3, E6), so money conservation across a season (cap charge versus cash paid versus club budget) cannot be checked end to end.' },
    ];
  }

  async close(): Promise<void> { /* nothing held outside memory */ }
}
