// The bounded violation log (log.ts): appends without copying when the log is held, spent acts retire to the
// archive, and neither changes any draw, event, case, record entry or penalty order.
import { describe, expect, it } from 'vitest';
import {
  P, aiResponse, archivedCases, archivedRows, certifiedViolations, commitAct, complianceWeek, decideViolation, detectionWeek,
  falseAccusationWeek, findRow, isLogHeld, ownLog, releaseLog, resolveDueCases, retireSpent, type ComplianceState,
} from '../../src/compliance/index.ts';
import { D, META, MemorySink, PRO_VALUES, act, ctx, emptyCompliance, party, realStreams, ruleSet } from './fixtures.ts';
import { ComplianceStateSchema } from './proposed-schemas.ts';

const pro = ruleSet(PRO_VALUES);

describe('appending without copying', () => {
  it('a held log takes each act in place; an unheld one is copied and the old state never changes', () => {
    let held = ownLog(emptyCompliance());
    const arr = held.log;
    for (let i = 0; i < 5; i++) {
      const r = commitAct(held, act({ classId: 'tampering_players', actor: party(10 + i, 'general_manager', 1), date: D(2026, i) }), pro, new MemorySink());
      if (!r.ok) throw new Error(r.reason);
      held = r.state;
    }
    expect(held.log).toBe(arr);
    expect(held.log).toHaveLength(5);
    held = releaseLog(held);
    expect(isLogHeld(held)).toBe(false);
    const before = held;
    const r = commitAct(before, act({ classId: 'tampering_players', date: D(2026, 9) }), pro, new MemorySink());
    if (!r.ok) throw new Error(r.reason);
    expect(before.log).toHaveLength(5);
    expect(r.state.log).toHaveLength(6);
    expect(r.state.log).not.toBe(before.log);
  });

  it('held and copied runs give the same rows, events and decisions', () => {
    const run = (hold: boolean) => {
      const sink = new MemorySink();
      const conduct = realStreams(7, 'conduct');
      let s = hold ? ownLog(emptyCompliance()) : emptyCompliance();
      const decisions: string[] = [];
      for (let i = 0; i < 400; i++) {
        const person = 100 + (i % 5);
        const date = D(2026 + Math.floor(i / 50), (i * 3) % 360);
        const d = decideViolation(s, { classId: 'tampering_players', gain: 1, pDetectPerceived: 0, penaltyPerceived: 0 },
          { personId: person, origin: 'generated', ruleRespectZ: -3, riskTolerance: 100, candor: 40, pressure: 1 }, date, conduct);
        decisions.push(d.reason);
        if (!d.commit) continue;
        const r = commitAct(s, act({ classId: 'tampering_players', actor: party(person, 'general_manager', 1 + (i % 4)), date }), pro, sink);
        if (r.ok) s = r.state;
      }
      return { log: JSON.stringify(releaseLog(s).log), events: JSON.stringify(sink.events), decisions };
    };
    const a = run(true);
    const b = run(false);
    expect(a.decisions.filter((x) => x === 'cooldown').length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
});

describe('retiring spent acts', () => {
  it('moves acts past the window and the cooldown to the archive; keeps young acts and acts in open cases', () => {
    let s = emptyCompliance();
    for (const [year, actor] of [[2020, 11], [2021, 12], [2030, 13]] as const) {
      const r = commitAct(s, act({ classId: 'tampering_players', actor: party(actor, 'general_manager', 1), date: D(year, 10) }), pro, new MemorySink());
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
    }
    // Row 2 sits in an open case: it stays live however old it is.
    s = { ...s, log: s.log.map((r) => (r.id === 2 ? { ...r, caseId: 1 } : r)),
      cases: [{ id: 1, teamId: 1, body: 'league', rowIds: [2], opened: D(2021, 20), resolveBy: D(2031, 0), response: 'fight', falseAccusation: false, status: 'open', outcome: null }] };
    const out = retireSpent(s, D(2030, 20), 5);
    expect(out.log.map((r) => r.id)).toEqual([2, 3]);
    expect(archivedRows(out).map((r) => r.id)).toEqual([1]);
    expect(findRow(out, 1)?.actor.personId).toBe(11);
    expect(certifiedViolations(out, 11).map((r) => r.id)).toEqual([1]);
    ComplianceStateSchema.parse(out);
    // Nothing spent: the same live rows, no archive chunk added.
    const again = retireSpent(out, D(2030, 21), 5);
    expect(again.log).toBe(out.log);
    expect(again.archive).toBe(out.archive);
  });

  it('commitAct sweeps only after the live log has doubled, and keeps every act younger than the floor window', () => {
    let s = ownLog(emptyCompliance());
    const n = P('retire_min_rows') + 10;
    const sink = new MemorySink();
    for (let i = 0; i < n; i++) {
      const year = 2000 + Math.floor((i * 40) / n);
      const r = commitAct(s, act({ classId: 'tampering_players', actor: party(1000 + i, 'general_manager', 1 + (i % 30)), date: D(year, i % 300) }), pro, sink);
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
    }
    s = releaseLog(s);
    const last = s.log[s.log.length - 1]!.date.seasonYear;
    expect(archivedRows(s).length).toBeGreaterThan(0);
    expect(s.log.length + archivedRows(s).length).toBe(n);
    for (const r of archivedRows(s)) expect(last - r.date.seasonYear).toBeGreaterThanOrEqual(P('retire_window_floor_years'));
    expect(s.retireAt).toBeGreaterThanOrEqual(P('retire_min_rows'));
  });

  it('30 seasons of the weekly pipeline: identical events, cases, record and orders with and without retiring', () => {
    const run = (retire: boolean) => {
      const sink = new MemorySink();
      const c = ctx({ rules: pro, enforcement: realStreams(11, 'enforcement'), respond: () => aiResponse(40) });
      let s: ComplianceState = emptyCompliance();
      const teams = Array.from({ length: 20 }, (_, i) => i + 1);
      for (let year = 2026; year < 2056; year += 1) {
        for (const t of teams.slice(0, 6)) {
          const r = commitAct(s, act({ classId: 'tampering_players', actor: party(100 + t, 'general_manager', t), knew: [500 + t], date: D(year, 40) }), pro, sink);
          if (r.ok) s = r.state;
        }
        for (let w = 0; w < 52; w += 1) {
          const date = D(year, w * P('days_per_week'));
          if (retire) s = complianceWeek(s, date, teams, c, sink, META);
          else s = resolveDueCases(falseAccusationWeek(detectionWeek(s, date, c, sink, META), teams, date, c, sink, META), date, c, sink, META);
        }
      }
      return { s, sink };
    };
    const a = run(true);
    const b = run(false);
    expect(archivedRows(a.s).length).toBeGreaterThan(0);
    expect(archivedCases(a.s).length).toBeGreaterThan(0);
    expect(a.s.log.length).toBeLessThan(b.s.log.length);
    expect(JSON.stringify(a.sink.events)).toBe(JSON.stringify(b.sink.events));
    expect(a.s.record).toEqual(b.s.record);
    expect(a.s.orders).toEqual(b.s.orders);
    const byId = <T extends { id: number }>(xs: readonly T[]) => [...xs].sort((x, y) => x.id - y.id);
    expect(byId([...archivedRows(a.s), ...a.s.log])).toEqual(byId(b.s.log));
    expect(byId([...archivedCases(a.s), ...a.s.cases])).toEqual(byId(b.s.cases));
    ComplianceStateSchema.parse(a.s);
  });
});
