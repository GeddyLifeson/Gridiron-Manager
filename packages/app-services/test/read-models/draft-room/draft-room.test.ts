// Item 7 draft room: the view (C7.3.1 board with taken players struck, running clock, picks, ticker; M4.5.1
// lean; C7.5.1 offer totals; M1.4.1 needs in words; MA-48 observed grades only) and the commands (L5.2.1
// authority, M4.5.1 stance logged for every pick, C7.3.1 rule 2 expiry, C7.2.3 trades).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { draft } from '@gm/league';
import { buildDraftRoomView, needWord, type DraftRoomInput } from '../../../src/read-models/draft-room/index.ts';
import { advanceDraft, answerOffer, boardWithVoice, makePick, stateVoice, voiceWeight, type DraftContext } from '../../../src/commands/draft-room/index.ts';
import { BOARD, boardRows, CHART, CLUBS, FILE_VALUES, fresh, NAMES, NEEDS, power, prospects, R, USER } from './fixture.ts';

const input = (state: draft.DraftState, over: Partial<DraftRoomInput> = {}): DraftRoomInput => ({
  clubId: USER, state, rules: R, power: power('head_coach'), clubNames: NAMES, prospects: prospects(), board: BOARD, needs: NEEDS,
  offers: [], chart: CHART, insistsMade: 0, stance: null, ...over,
});
const ctx = (state: draft.DraftState, holder: Parameters<typeof power>[0] = 'head_coach', delegated: Parameters<typeof power>[1] = []): DraftContext =>
  ({ clubId: USER, state, rules: R, power: power(holder, delegated) });
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const opts = (stance: draft.UserStance | null = null) => ({ boardFor: (_c: number, _r: number, a: readonly number[]) => boardRows(a), thinkSec: 30, dayStartSec: (d: number) => (d - 1) * 86400, stance, gmVoiceWeight: 0.5, insistsMade: 0 });

describe('fixture rule values', () => {
  it('match the league rule file', () => {
    const file = JSON.parse(readFileSync(new URL('../../../../rules-data/data/league/proleague_2026.json', import.meta.url), 'utf8')) as { values: { key: string; value: number; source?: string; factId?: string }[] };
    for (const row of FILE_VALUES) {
      const hit = file.values.find((v) => v.key === row.key);
      expect(hit?.value, row.key).toBe(row.value);
    }
  });
});

describe('draft room view', () => {
  it('shows the running clock for the club on it and the user when he is up', () => {
    const v = buildDraftRoomView(input(fresh()));
    expect(v.clock).toMatchObject({ overall: 1, round: 1, clubId: 1, clubName: 'Ashford', userOnClock: false, limitSec: 8 * 60, secondsLeft: 8 * 60 });
    const s = draft.advance(fresh(), 100, R);
    expect(buildDraftRoomView(input(s)).clock?.secondsLeft).toBe(8 * 60 - 100);
    const s2 = ok(draft.submitPick(s, { clubId: 1, personId: 1000, atSec: 100 }, R)).state;
    const v2 = buildDraftRoomView(input(s2));
    expect(v2.clock).toMatchObject({ overall: 2, clubId: USER, userOnClock: true });
  });

  it('strikes taken players on the board with who took them, and lists the pick', () => {
    const s = ok(draft.submitPick(fresh(), { clubId: 1, personId: 1003, atSec: 10 }, R)).state;
    const v = buildDraftRoomView(input(s));
    expect(v.board[0]).toMatchObject({ rank: 1, personId: 1003, taken: { overall: 1, clubId: 1, clubName: 'Ashford' } });
    expect(v.board[1]!.taken).toBeNull();
    expect(v.picks).toEqual([expect.objectContaining({ overall: 1, personId: 1003, name: 'Prospect 1003', late: false, mine: false })]);
    expect(v.lean.map((l) => l.personId)).toEqual([1000, 1001, 1002]);
    expect(v.ticker[0]).toMatchObject({ kind: 'pick', clubName: 'Ashford', overall: 1, personName: 'Prospect 1003' });
  });

  it('MA-48: shows only grades someone assigned, with grader and looks; an unwatched player has no grade', () => {
    const v = buildDraftRoomView(input(fresh()));
    const g = v.board.find((b) => b.personId === 1000)!.grade;
    expect(g).toMatchObject({ state: 'graded', grader: 'area scout', n: 12 });
    expect(v.board.find((b) => b.personId === 1004)!.grade).toEqual({ state: 'unwatched' });
    // No board score, general manager value or need number reaches the view.
    const text = JSON.stringify(v);
    expect(text).not.toContain('"score"');
    expect(text).not.toContain('"value"');
    expect(text).not.toContain('"need"');
  });

  it('needs show as words with the coach\'s asks marked', () => {
    expect(buildDraftRoomView(input(fresh())).needs).toEqual([
      { position: 'OT', word: 'high', frame: 'now', coachAsked: true },
      { position: 'CB', word: 'some', frame: 'this_offseason', coachAsked: false },
      { position: 'WR', word: 'low', frame: 'next_year', coachAsked: false },
    ]);
    expect([needWord(0.6), needWord(0.3), needWord(0.29)]).toEqual(['high', 'some', 'low']);
  });

  it('lists the club\'s picks this year with slots and future picks without', () => {
    const v = buildDraftRoomView(input(fresh()));
    const now = v.held.filter((h) => h.year === 2027);
    expect(now.map((h) => h.overall)).toEqual([2, 6, 10, 14, 18, 22, 26]);
    expect(v.held.some((h) => h.year > 2027 && h.overall === null)).toBe(true);
  });

  it('C7.5.1: an offer card shows both sides\' chart totals and the personnel man\'s lean', () => {
    const s = fresh();
    const mine = s.order.find((o) => o.overall === 2)!.pickId;
    const theirs = s.order.filter((o) => o.overall === 3 || o.overall === 7).map((o) => o.pickId);
    const v = buildDraftRoomView(input(s, { offers: [{ id: 'o1', withClubId: 3, theyGive: theirs, theyGet: [mine] }] }));
    expect(v.offers[0]).toMatchObject({ withClubName: 'Carver', giveTotal: 2900, getTotal: 2800 + 2400, personnelLean: 'take', beforeClockEnds: false });
  });

  it('reads the power arrangement: decide, delegated, advise', () => {
    expect(buildDraftRoomView(input(fresh())).authority).toEqual({ field: 'final_say_draft', authority: 'decide', holder: 'head_coach' });
    expect(buildDraftRoomView(input(fresh(), { power: power('head_coach', ['final_say_draft']) })).authority.authority).toBe('delegated');
    expect(buildDraftRoomView(input(fresh(), { power: power('general_manager') })).authority).toMatchObject({ authority: 'advise', holder: 'general_manager' });
  });
});

describe('draft room commands', () => {
  it('with final say the run stops at the user\'s pick and his pick is filed as made', () => {
    const r = advanceDraft(ctx(fresh()), opts());
    expect(r.awaitingUser).toBe(true);
    expect(r.state.made[0]?.clubId).toBe(1);
    const filed = ok(makePick(ctx(r.state), 1010, r.state.nowSec + 60));
    expect(filed.kind).toBe('filed');
    if (filed.kind !== 'filed') return;
    expect(filed.state.log.at(-1)).toMatchObject({ overall: 2, personId: 1010, stance: { kind: 'made' }, decidedBy: 'user' });
  });

  it('without final say a pick is refused and the user states a stance instead', () => {
    const s = advanceDraft(ctx(fresh(), 'general_manager'), opts()).state;
    expect(makePick(ctx(s, 'general_manager'), 1010, s.nowSec)).toMatchObject({ ok: false, rule: 'L5.2.1' });
    expect(stateVoice(ctx(s, 'general_manager'), { kind: 'insist', personId: 1010, trade: false })).toMatchObject({ ok: true });
    expect(stateVoice(ctx(s), { kind: 'insist', personId: 1010, trade: false })).toMatchObject({ ok: false, rule: 'L5.2.1' });
  });

  it('M4.5.1: the general manager picks with the voice weighed in, and the log carries the stance', () => {
    const c0 = ctx(fresh(), 'general_manager');
    const waiting = advanceDraft(c0, opts());
    expect(waiting.awaitingUser).toBe(true);
    // Silence: the general manager takes his own top player.
    const silent = advanceDraft(ctx(waiting.state, 'general_manager'), opts({ kind: 'silent' }));
    expect(silent.state.log[0]).toMatchObject({ overall: 2, stance: { kind: 'silent' }, decidedBy: 'club' });
    // An insist for his second man moves the pick when the voice is strong enough.
    const insisted = advanceDraft(ctx(waiting.state, 'general_manager'), { ...opts({ kind: 'insist', personId: 1001, trade: false }), gmVoiceWeight: 1 });
    expect(insisted.state.log[0]).toMatchObject({ personId: 1001, stance: { kind: 'insist', personId: 1001 } });
    // The run stops again at the user's next pick so he can answer.
    expect(insisted.awaitingUser).toBe(true);
  });

  it('voice strength orders mention < recommend < insist, and later insists weigh less', () => {
    const w = (k: 'mention' | 'recommend' | 'insist', made = 0) => voiceWeight({ kind: k, personId: 1, trade: false }, 0.6, made);
    expect(w('mention')).toBeLessThan(w('recommend'));
    expect(w('recommend')).toBeLessThan(w('insist'));
    expect(w('insist', 10)).toBeLessThan(w('insist', 0));
    expect(voiceWeight({ kind: 'silent' }, 0.6, 0)).toBe(0);
    const rows = boardRows(BOARD);
    expect(boardWithVoice(rows, { kind: 'insist', personId: 1005, trade: false }, 1)[0]!.personId).toBe(1005);
    expect(boardWithVoice(rows, { kind: 'insist', personId: 1005, trade: false }, 0)[0]!.personId).toBe(1003);
  });

  it('C7.3.1 rule 2: after the user\'s clock expires his personnel man fills the slot', () => {
    const waiting = advanceDraft(ctx(fresh()), opts()).state;
    const expired = draft.advance(waiting, waiting.nowSec + 8 * 60 + 1, R);
    expect(buildDraftRoomView(input(expired)).userExpired).toBe(true);
    const r = advanceDraft(ctx(expired), opts());
    const entry = r.state.log.find((e) => e.overall === 2);
    expect(entry).toMatchObject({ decidedBy: 'fallback_after_expiry', late: true });
  });

  it('delegated: the personnel man picks without stopping', () => {
    const r = advanceDraft(ctx(fresh(), 'head_coach', ['final_say_draft']), opts());
    expect(r.state.log[0]).toMatchObject({ overall: 2, stance: { kind: 'silent' } });
  });

  it('C7.2.3: with final say an offer is filed as a trade; without it, it is a request', () => {
    const s = fresh();
    const mine = s.order.find((o) => o.overall === 2)!.pickId;
    const theirs = s.order.filter((o) => o.overall === 3 || o.overall === 7).map((o) => o.pickId);
    const offer = { id: 'o1', withClubId: 3, theyGive: theirs, theyGet: [mine] };
    const filed = ok(answerOffer(ctx(s), offer, true, 5));
    expect(filed.kind).toBe('filed');
    if (filed.kind === 'filed') expect(draft.pickById(filed.state.ledger, mine)?.ownerClubId).toBe(3);
    expect(answerOffer(ctx(s, 'owner'), offer, true, 5)).toMatchObject({ ok: true, kind: 'request', request: { kind: 'take_offer', holder: 'owner' } });
  });

  it('runs a whole draft for four clubs with every user pick logged', () => {
    let s = fresh();
    for (let guard = 0; guard < 100 && !draft.isComplete(s); guard++) {
      const r = advanceDraft(ctx(s), opts());
      s = r.state;
      if (r.awaitingUser && s.onClock !== null) {
        const f = ok(makePick(ctx(s), s.available[0]!, s.nowSec + 1));
        if (f.kind === 'filed') s = f.state;
      }
    }
    expect(draft.isComplete(s)).toBe(true);
    expect(s.log.filter((e) => e.clubId === USER).length).toBe(7);
    expect(s.made.length).toBe(CLUBS.length * 7);
  });
});
