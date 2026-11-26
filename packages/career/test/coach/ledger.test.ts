// E10.1.1 statement and E10.4.1 consistency ledger acceptance.
import { describe, expect, it } from 'vitest';
import {
  emptyPhilosophy, stateCommitment, recordSpokenCommitment, dropCommitment, rewordCommitment, setText, presentDraft,
  buildLedger, ledgerEvents, warnBeforeDecision, consistencyMeasure, verdict, COMMITMENT_CATALOGUE, activeCommitments,
  type LedgerDecision, type Philosophy,
} from '../../src/coach/index.ts';

const ME = 900;
const day = (seasonYear: number, dayIndex = 0) => ({ seasonYear, dayIndex });
const must = (r: ReturnType<typeof stateCommitment>): Philosophy => { if (!r.ok) throw new Error(r.key); return r.philosophy; };

const depth = (id: number, y: number, promotedGrade: number, demotedGrade: number, extra: Partial<LedgerDecision> = {}): LedgerDecision =>
  ({ id, date: day(y, id), deciderId: ME, factsKnown: true, kind: 'depth_change', promotedId: 1, demotedId: 2, promotedGrade, demotedGrade, demotedIsStarOrHighPick: false, ...extra }) as LedgerDecision;

describe('E10.1.1 statement', () => {
  it('the catalogue is the nine entries Marlon approved on 2026-11-26', () => {
    expect(COMMITMENT_CATALOGUE.map((e) => e.id)).toEqual([
      'best_player_plays', 'rules_same_for_everyone', 'go_when_numbers_say_go', 'go_for_two_when_numbers_say',
      'run_to_win_fourth_quarter', 'young_players_real_snaps', 'tell_you_first', 'no_beating_ourselves', 'nobody_plays_hurt',
    ]);
  });

  it('every catalogue entry has a measure, and only catalogue entries can be committed', () => {
    for (const e of COMMITMENT_CATALOGUE) expect(e.measure).toBeTruthy();
    const r = stateCommitment(emptyPhilosophy(ME, false), 'win_every_game', 'team', day(2026));
    expect(r.ok).toBe(false);
  });

  it('at most eight active commitments', () => {
    let p = emptyPhilosophy(ME, false);
    const audiences = ['team', 'staff', 'owner', 'public'] as const;
    let n = 0;
    for (const e of COMMITMENT_CATALOGUE) for (const a of audiences) {
      const r = stateCommitment(p, e.id, a, day(2026));
      if (n < 8) { expect(r.ok).toBe(true); if (r.ok) p = r.philosophy; n = activeCommitments(p).length; }
      else expect(r.ok).toBe(false);
    }
    expect(activeCommitments(p).length).toBe(8);
  });

  it('saving a statement changes nothing outside the philosophy object', () => {
    const p0 = emptyPhilosophy(ME, false);
    const frozen = JSON.stringify(p0);
    const p1 = setText(must(stateCommitment(p0, 'best_player_plays', 'team', day(2026))), 'We compete.', day(2026));
    expect(JSON.stringify(p0)).toBe(frozen);
    expect(p1.text).toBe('We compete.');
  });

  it('a matching press statement is added to the public with a notice (rule 5)', () => {
    const r = recordSpokenCommitment(emptyPhilosophy(ME, false), 'go_when_numbers_say_go', 'press', day(2026, 10), null);
    expect(r.ok && r.noticeKey).toBe('philosophy.notice.held_to_what_you_said');
    expect(r.ok && r.philosophy.commitments[0]!.audience).toBe('public');
  });
});

describe('E10.4.1 words against deeds', () => {
  const base = must(stateCommitment(emptyPhilosophy(ME, false), 'best_player_plays', 'team', day(2025)));

  it('row counts equal the number of linked decision records (acceptance 1)', () => {
    const ds = [depth(1, 2025, 80, 70), depth(2, 2025, 60, 70), depth(3, 2026, 75, 75), depth(4, 2026, 50, 90)];
    const [row] = buildLedger(base, ds, day(2026));
    expect(row!.honoured).toBe(2);
    expect(row!.broken).toBe(2);
    expect(row!.recentBroken).toEqual([4, 2]);
    expect(row!.consistency).toBe(0.5);
  });

  it('a decision made with the contrary fact hidden is never a break (acceptance 3)', () => {
    const [row] = buildLedger(base, [depth(1, 2025, 50, 90, { factsKnown: false })], day(2026));
    expect(row!.broken).toBe(0);
    expect(ledgerEvents(base, depth(1, 2025, 50, 90, { factsKnown: false }))).toEqual([]);
    expect(warnBeforeDecision(base, depth(1, 2025, 50, 90, { factsKnown: false }))).toEqual([]);
  });

  it('one discipline case produces no second event here (acceptance 2: L3.3.1 owns the one event)', () => {
    const p = must(stateCommitment(base, 'rules_same_for_everyone', 'team', day(2025)));
    const d: LedgerDecision = { id: 9, date: day(2025, 50), deciderId: ME, factsKnown: true, kind: 'discipline_case', playerId: 5, consistent: false, l3EventId: 77 };
    expect(ledgerEvents(p, d)).toEqual([]);
    const row = buildLedger(p, [d], day(2026)).find((r) => r.catalogueId === 'rules_same_for_everyone')!;
    expect(row.broken).toBe(1);
    expect(row.fromL3).toBe(true);
  });

  it('a commitment with no relevant decisions shows "not yet tested"; dropped ones stay in the history', () => {
    const p = dropCommitment(must(stateCommitment(base, 'tell_you_first', 'team', day(2025))), 'tell_you_first', day(2026));
    const rows = buildLedger(p, [], day(2026));
    expect(rows.map((r) => r.status)).toEqual(['not_yet_tested', 'not_yet_tested']);
    expect(rows[1]!.dropped).toEqual(day(2026));
    expect(p.events.map((e) => e.kind)).toEqual(['stated', 'stated', 'dropped']);
  });

  it('decisions before stating or after dropping do not count', () => {
    const p = dropCommitment(base, 'best_player_plays', day(2026, 100));
    const [row] = buildLedger(p, [depth(1, 2024, 10, 90), depth(2, 2026, 10, 90), { ...depth(3, 2026, 10, 90), date: day(2026, 200) }], day(2026));
    expect(row!.broken).toBe(1);
  });

  it('a room-level commitment is tested only on decisions that were his (E10.5.2 acceptance)', () => {
    const [row] = buildLedger(base, [depth(1, 2025, 10, 90, { deciderId: 1234 }), depth(2, 2025, 10, 90)], day(2026));
    expect(row!.broken).toBe(1);
  });

  it('a break emits a trust event to the involved player; an honour that cost something emits a positive one (rules 3, 4)', () => {
    const broke = ledgerEvents(base, depth(5, 2026, 40, 80));
    expect(broke).toEqual([{ kind: 'commitment_broken', catalogueId: 'best_player_plays', decisionId: 5, witnesses: 'player_and_witnesses', involvedPersonIds: [2, 1], madeInPerson: false }]);
    expect(ledgerEvents(base, depth(6, 2026, 80, 40))).toEqual([]);
    expect(ledgerEvents(base, depth(7, 2026, 80, 40, { demotedIsStarOrHighPick: true }))[0]!.kind).toBe('commitment_honoured_at_cost');
  });

  it('a commitment made in person to the player marks the event as in person', () => {
    const p = must(recordSpokenCommitment(base, 'tell_you_first', 'one_on_one', day(2025), 44));
    const d: LedgerDecision = { id: 8, date: day(2026), deciderId: ME, factsKnown: true, kind: 'roster_notice', playerId: 44, toldFirst: false };
    expect(ledgerEvents(p, d)[0]!.madeInPerson).toBe(true);
  });

  it('the decision screen shows one warning line before a break and never blocks', () => {
    const p = rewordCommitment(base, 'best_player_plays', 'The best man plays.', day(2025));
    const w = warnBeforeDecision(p, depth(1, 2026, 60, 80));
    expect(w).toEqual([{ catalogueId: 'best_player_plays', key: 'ledger.warning.best_player_plays', wording: 'The best man plays.' }]);
    expect(warnBeforeDecision(p, depth(1, 2026, 80, 60))).toEqual([]);
  });

  it('fourth down only tests decisions the model rated go by the margin; a draft statement emits nothing', () => {
    const p = must(stateCommitment(emptyPhilosophy(ME, false), 'go_when_numbers_say_go', 'public', day(2026)));
    const fd = (id: number, went: boolean, adv: number): LedgerDecision => ({ id, date: day(2026, id), deciderId: ME, factsKnown: true, kind: 'fourth_down', went, goAdvantageEp: adv });
    expect(verdict('go_when_numbers_say_go', fd(1, false, 0.1))).toBeNull();
    expect(verdict('go_when_numbers_say_go', fd(2, false, 1.2))).toBe('broken');
    expect(verdict('go_when_numbers_say_go', fd(3, true, 1.2))).toBe('honoured');
    const draft: Philosophy = { ...p, draft: true };
    expect(ledgerEvents(draft, fd(2, false, 1.2))).toEqual([]);
    expect(ledgerEvents(presentDraft(draft, day(2026)), fd(2, false, 1.2)).length).toBe(1);
  });

  it('the N2.8 measure sums the rows; the ledger never mutates the decisions it reads (rule 7)', () => {
    const ds = [depth(1, 2025, 80, 70), depth(2, 2025, 60, 70)];
    const before = JSON.stringify(ds);
    expect(consistencyMeasure(buildLedger(base, ds, day(2026)))).toEqual({ honoured: 1, broken: 1, share: 0.5 });
    expect(JSON.stringify(ds)).toBe(before);
    expect(consistencyMeasure([]).share).toBeNull();
  });
});
