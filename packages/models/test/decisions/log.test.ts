import { describe, expect, it } from 'vitest';
import { DecisionGrade } from '@gm/schema';
import { DECISION_TYPES, GAME_DECISION_TYPES, WEEK_DECISION_TYPES } from '../../src/decisions/catalogue.ts';
import { GENESIS_HASH, canonicalText, entryHash, verifyChain } from '../../src/decisions/chain.ts';
import { captureInformation } from '../../src/decisions/information.ts';
import { DecisionLog } from '../../src/decisions/log.ts';
import { attribute, recordProblems } from '../../src/decisions/record.ts';
import { coverageGaps, gameReport, patterns } from '../../src/decisions/report.ts';
import { toDecisionGrade } from '../../src/decisions/grade.ts';
import { sha256Hex } from '../../src/decisions/sha256.ts';
import { addDays, daysFromIso, isoFromDays } from '../../src/decisions/dates.ts';
import type { GameManagementView, LogEntry } from '../../src/decisions/types.ts';
import { BOSS, OC, SEGMENT, USER, record, viewFor } from './helpers.ts';

const ENC = new TextEncoder();

function fullLog(): DecisionLog {
  const log = DecisionLog.create(SEGMENT);
  DECISION_TYPES.forEach((d, i) => {
    const r = record(`d${i}`, d.type);
    log.appendDecision(r);
    const v = viewFor(r);
    log.appendModelView(r.id, v.view);
    if (v.truth) log.appendTruthView(r.id, v.truth);
  });
  return log;
}

describe('N3.2 catalogue', () => {
  it('holds every N3.2.1 and N3.2.2 type once', () => {
    expect(GAME_DECISION_TYPES).toHaveLength(17);
    expect(WEEK_DECISION_TYPES).toHaveLength(18);
    expect(new Set(DECISION_TYPES.map((d) => d.type)).size).toBe(35);
    const gm = GAME_DECISION_TYPES.filter((d) => d.view === 'game_management').map((d) => d.type);
    for (const t of ['fourth_down', 'try', 'timeout', 'challenge', 'penalty_acceptance', 'field_goal_attempt', 'kickoff_onside', 'punt_return_instructions']) expect(gm).toContain(t);
    for (const d of WEEK_DECISION_TYPES) expect(d.view).toBe('none');
  });

  it('records every decision type with the model view of its kind', () => {
    const log = fullLog();
    for (let i = 0; i < DECISION_TYPES.length; i++) {
      const v = log.view(`d${i}`);
      expect(v.modelView?.kind).toBe(DECISION_TYPES[i]!.view);
    }
    expect(verifyChain(log.entries).ok).toBe(true);
  });

  it('refuses a view of the wrong kind, a second view, and unknown decisions', () => {
    const log = DecisionLog.create(SEGMENT);
    log.appendDecision(record('x', 'fourth_down'));
    expect(() => log.appendModelView('x', { kind: 'none', followUps: [] })).toThrow();
    log.appendModelView('x', viewFor(record('x', 'fourth_down')).view);
    expect(() => log.appendModelView('x', viewFor(record('x', 'fourth_down')).view)).toThrow();
    expect(() => log.appendOutcome('nope', { result: null, luck: null })).toThrow();
    expect(() => log.appendFollowUp('x', { dueDate: '2027-10-31', people: [], bandsOverlapped: true })).toThrow();
    // A failed append leaves the log unchanged.
    expect(log.entries).toHaveLength(3);
  });
});

describe('N3.1.1 record', () => {
  it('validates records and reports problems', () => {
    expect(recordProblems(record('a', 'fourth_down'))).toEqual([]);
    expect(recordProblems(record('a', 'fourth_down', { chosen: 'zzz' }))).toHaveLength(1);
    expect(recordProblems(record('a', 'fourth_down', { owner: 'I2' }))[0]).toMatch(/owner/);
    expect(recordProblems(record('a', 'try', { notMade: true }))[0]).toMatch(/not made/);
    expect(recordProblems(record('a', 'timeout', { notMade: true }))).toEqual([]);
    expect(recordProblems(record('a', 'rule_breaking_act', { violationLogId: null }))[0]).toMatch(/violation_log/);
    expect(recordProblems(record('a', 'fourth_down', { time: { worldDate: '2027-10-03', gameId: null, playIndex: 3, period: null, gameClockTenths: null } })).length).toBeGreaterThan(0);
  });

  it('keeps a reversed call and its replacement, linked (edge case)', () => {
    const log = DecisionLog.create(SEGMENT);
    log.appendDecision(record('call1', 'offensive_play_call'));
    log.appendDecision(record('call2', 'offensive_play_call', { supersedes: 'call1' }));
    expect(log.view('call1').supersededBy).toEqual(['call2']);
    expect(() => log.appendDecision(record('call3', 'offensive_play_call', { supersedes: 'missing' }))).toThrow();
    expect(() => log.appendDecision(record('call1', 'offensive_play_call'))).toThrow();
  });

  it('attributes below head coach to the boss, delegated calls to the decider, and suggestions through the coordinator', () => {
    const owns = new Set(['offensive_play_call']);
    expect(attribute({ type: 'fourth_down', actor: { kind: 'user', personId: USER }, rungOwns: owns, deciderPersonId: USER, bossPersonId: BOSS }))
      .toEqual({ creditedPersonId: BOSS, basis: 'logged_under_boss', viaPersonId: USER });
    expect(attribute({ type: 'offensive_play_call', actor: { kind: 'staff', personId: OC }, rungOwns: owns, deciderPersonId: USER, bossPersonId: null }))
      .toEqual({ creditedPersonId: USER, basis: 'delegated', viaPersonId: OC });
    expect(attribute({ type: 'offensive_play_call', actor: { kind: 'user', personId: USER }, rungOwns: owns, deciderPersonId: USER, bossPersonId: null, suggestionFromPersonId: OC }).basis).toBe('suggestion_taken');
    expect(() => attribute({ type: 'fourth_down', actor: { kind: 'user', personId: USER }, rungOwns: owns, deciderPersonId: USER, bossPersonId: null })).toThrow();
  });
});

describe('N3.1.2 information set', () => {
  it('changing scouting data after the decision leaves the record unchanged', () => {
    const scouting = { runRate: 0.41, sample: 212, notes: ['likes cover 3'] };
    const info = captureInformation([{ source: 'scouting.tendencies', visibility: 'own_team' }, { source: 'scouting.report', visibility: 'own_team' }], { 'scouting.tendencies': scouting, 'scouting.report': { pages: 4 } }, new Set(['scouting.tendencies']));
    const log = DecisionLog.create(SEGMENT);
    log.appendDecision(record('a', 'fourth_down', { information: info }));
    const before = canonicalText(log.view('a').record.information);
    scouting.runRate = 0.9;
    scouting.notes.push('changed');
    expect(canonicalText(log.view('a').record.information)).toBe(before);
    expect(info[1]!.viewed).toBe(false);
  });

  it('refuses hidden truth and undeclared viewed sources', () => {
    expect(() => captureInformation([{ source: 'opponent.call', visibility: 'truth' }], {}, new Set())).toThrow();
    expect(() => captureInformation([], {}, new Set(['x']))).toThrow();
  });

  it('keeps truth out of the review view', () => {
    const log = fullLog();
    const v = log.view('d4');
    expect(JSON.stringify(v)).not.toContain('engineForesight');
    expect(log.truthFor('d2')?.kind).toBe('play_call');
  });
});

describe('N3.5.1 integrity', () => {
  it('SHA-256 matches the FIPS 180-2 vectors', () => {
    expect(sha256Hex(ENC.encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(ENC.encode(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(ENC.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('changing any stored entry breaks verification of the chain', () => {
    const log = fullLog();
    log.appendOutcome('d4', { result: { converted: false }, luck: { expected: 0.55, actual: 0 } });
    const entries = log.entries;
    expect(verifyChain(entries).ok).toBe(true);
    for (let i = 0; i < entries.length; i++) {
      const copy: LogEntry[] = JSON.parse(JSON.stringify(entries));
      const p = copy[i]!.payload as unknown as Record<string, unknown>;
      p.tampered = true;
      const c = verifyChain(copy);
      expect(c.ok).toBe(false);
      expect(c.firstBad).toBe(i);
    }
    // Re-hashing a changed entry still breaks the link from the next one.
    const copy: LogEntry[] = JSON.parse(JSON.stringify(entries));
    (copy[1]!.payload as { record: { chosen: string } }).record.chosen = 'b';
    copy[1] = { ...copy[1]!, hash: entryHash(1, copy[1]!.prevHash, copy[1]!.payload) };
    expect(verifyChain(copy).firstBad).toBe(2);
    // Dropping an entry breaks it too.
    expect(verifyChain(entries.filter((_, i) => i !== 2)).ok).toBe(false);
  });

  it('replaying a stored log reproduces identical records and hashes', () => {
    const log = fullLog();
    const stored: LogEntry[] = JSON.parse(JSON.stringify(log.entries));
    const again = DecisionLog.load(stored);
    expect(again.headHash).toBe(log.headHash);
    expect(canonicalText(again.views())).toBe(canonicalText(log.views()));
    expect(fullLog().headHash).toBe(log.headHash);
    (stored[1]!.payload as unknown as { record: { chosen: string } }).record.chosen = 'b';
    expect(() => DecisionLog.load(stored)).toThrow();
  });

  it('records reloads and version segments with links', () => {
    const log = fullLog();
    const firstSeg = log.entries[0]!.hash;
    log.appendReload(5, 'save-3');
    const seg = log.startSegment({ gameVersion: '0.2.0', seed: 'seed-1', settings: { certified: true } });
    expect(seg.payload.kind === 'segment' && seg.payload.previousSegmentHash).toBe(firstSeg);
    expect(() => log.appendReload(9999, 'x')).toThrow();
    expect(verifyChain(log.entries).ok).toBe(true);
    expect(log.entries[0]!.prevHash).toBe(GENESIS_HASH);
    expect(Object.isFrozen(log.entries[1]!.payload)).toBe(true);
  });
});

describe('N3.4 review data', () => {
  function gm(id: string, playIndex: number, value: [number, number], half: number, chosen: 'a' | 'b'): [ReturnType<typeof record>, GameManagementView] {
    const r = record(id, 'fourth_down', { chosen, time: { worldDate: '2027-10-03', gameId: 7, playIndex, period: 2, gameClockTenths: 100 } });
    const best = value[0] >= value[1] ? 'a' : 'b';
    const vc = chosen === 'a' ? value[0] : value[1];
    const vb = Math.max(value[0], value[1]);
    const cost = vb - vc;
    const margin = 2 * half;
    const cls = best === chosen ? (Math.abs(value[0] - value[1]) > margin ? 'clearly_right' : 'toss_up') : cost > margin ? 'clearly_wrong' : 'toss_up';
    return [r, { kind: 'game_management', modelId: 'm', chosen, best, cost, margin, class: cls, lacks: [], options: [
      { optionId: 'a', value: value[0], low: value[0] - half, high: value[0] + half, sparse: false },
      { optionId: 'b', value: value[1], low: value[1] - half, high: value[1] + half, sparse: false },
    ] }];
  }

  it('game report totals equal the sums of its listed records, toss-ups excluded', () => {
    const log = DecisionLog.create(SEGMENT);
    for (const [r, v] of [gm('w', 1, [0.3, 0.5], 0.02, 'a'), gm('r', 2, [0.6, 0.4], 0.02, 'a'), gm('t', 3, [0.5, 0.52], 0.02, 'a')]) {
      log.appendDecision(r);
      log.appendModelView(r.id, v);
    }
    const pc = record('p', 'offensive_play_call', { time: { worldDate: '2027-10-03', gameId: 7, playIndex: 4, period: 2, gameClockTenths: 90 }, timeTaken: { tenthsFromPrompt: 200, playClockLeftTenths: 20 } });
    log.appendDecision(pc);
    log.appendModelView('p', viewFor(pc).view);
    const rep = gameReport(log.views(), 7, { situationOf: () => '1st_10', lateCallTenths: 50 });
    const listed = rep.management.filter((m) => m.class !== 'toss_up').reduce((s, m) => s + m.delta, 0);
    expect(rep.managementTotal).toBeCloseTo(listed, 12);
    expect(rep.managementTotal).toBeCloseTo(-0.2 + 0.2, 12);
    expect(rep.largest).toHaveLength(3);
    expect(rep.calling).toEqual([{ situation: '1st_10', calls: 1, meanForesight: 0.12, meanPredictability: 0.3 }]);
    expect(rep.time.lateCalls).toBe(1);
    expect(coverageGaps(log.views(), { gameId: 7, calledSnaps: [4, 5], fourthDowns: [1, 2, 3], tries: [9] })).toEqual(['snap 5: no play call record', 'snap 9: no try record']);
  });

  it('states no pattern from fewer than the minimum', () => {
    const log = DecisionLog.create(SEGMENT);
    for (let i = 0; i < 7; i++) {
      const [r, v] = gm(`p${i}`, i, [0.3, 0.5], 0.01, 'a');
      log.appendDecision(r);
      log.appendModelView(r.id, v);
    }
    const bucket = () => '4th_short_midfield';
    expect(patterns(log.views(), bucket, Math.sqrt)).toEqual([]);
    const [r, v] = gm('p7', 7, [0.3, 0.5], 0.01, 'a');
    log.appendDecision(r);
    log.appendModelView(r.id, v);
    const ps = patterns(log.views(), bucket, Math.sqrt);
    expect(ps).toHaveLength(1);
    expect(ps[0]!.decisions).toBe(8);
    expect(ps[0]!.chosen).toEqual({ a: 8 });
    expect(ps[0]!.modelFavoured).toEqual({ b: 8 });
  });

  it('maps scored game decisions onto the world DecisionGrade row', () => {
    const log = fullLog();
    let mapped = 0;
    for (const v of log.views()) {
      const g = toDecisionGrade(v);
      if (g) { DecisionGrade.parse(g); mapped++; }
    }
    expect(mapped).toBe(GAME_DECISION_TYPES.filter((d) => d.view !== 'none').length);
  });
});

describe('dates', () => {
  it('agrees with known days', () => {
    expect(daysFromIso('1970-01-01')).toBe(0);
    expect(daysFromIso('2000-03-01')).toBe(11017);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2023-02-28', 1)).toBe('2023-03-01');
    expect(addDays('2027-12-30', 28)).toBe('2028-01-27');
    for (let d = -800000; d < 800000; d += 997) expect(daysFromIso(isoFromDays(d))).toBe(d);
  });
});
