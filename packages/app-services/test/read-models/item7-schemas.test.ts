// The draft room, free agency and recruiting board views (PRs 268, 257) parse through their @gm/schema
// read-model schemas (READ_MODELS draftRoom, freeAgency, recruitingBoard) in the states the screen tests
// build: a fresh draft, a pick on the clock, an offer; free agency before, in and after the window with an
// offer; the board, pool and portal lists after the staff watched film.
import { describe, expect, it } from 'vitest';
import { READ_MODELS, DraftRoomData, FreeAgencyData, RecruitingBoardData } from '@gm/schema';
import type { draft } from '@gm/league';
import { buildDraftRoomView, type DraftRoomInput } from '../../src/read-models/draft-room/index.ts';
import { buildFreeAgencyView } from '../../src/read-models/free-agency/index.ts';
import { buildRecruitingBoardView, type RecruitingBoardInput } from '../../src/read-models/recruiting/index.ts';
import { watchFilm, type RecruitingCommandContext } from '../../src/commands/recruiting/index.ts';
import { BOARD, CHART, NAMES as DNAMES, NEEDS, fresh, power, prospects, R, USER } from './draft-room/fixture.ts';
import { $, BEFORE, input as faInput, WINDOW } from './free-agency/fixture.ts';
import { D, NAMES, USER_STAFF, USER_TEAM, world, type World } from './recruiting/fixture.ts';

const SCHEMA = { draftRoom: DraftRoomData, freeAgency: FreeAgencyData, recruitingBoard: RecruitingBoardData } as const;
function parses(model: keyof typeof SCHEMA, data: unknown): void {
  expect(READ_MODELS[model], model).toBeDefined();
  const r = SCHEMA[model].safeParse(data);
  if (!r.success) throw new Error(`${model}: ${JSON.stringify(r.error.issues.slice(0, 4))}`);
}

describe('item 7 read models parse through their schemas (P1.3.2)', () => {
  it('draft room', () => {
    const input = (state: draft.DraftState, over: Partial<DraftRoomInput> = {}): DraftRoomInput => ({
      clubId: USER, state, rules: R, power: power('head_coach'), clubNames: DNAMES, prospects: prospects(), board: BOARD, needs: NEEDS,
      offers: [], chart: CHART, insistsMade: 0, stance: null, ...over,
    });
    const s = fresh();
    parses('draftRoom', buildDraftRoomView(input(s)));
    parses('draftRoom', buildDraftRoomView(input(s, { power: power('general_manager'), stance: { kind: 'insist', personId: null, trade: false }, insistsMade: 3 })));
    parses('draftRoom', null);
  });

  it('free agency', () => {
    parses('freeAgency', buildFreeAgencyView(faInput()));
    parses('freeAgency', buildFreeAgencyView(faInput({ now: WINDOW })));
    parses('freeAgency', buildFreeAgencyView(faInput({ now: BEFORE })));
    parses('freeAgency', buildFreeAgencyView(faInput({ offers: [{ personId: 501, years: 3, apyCents: $(10_000_000), guaranteedCents: $(15_000_000), status: 'open' }] })));
  });

  it('recruiting board', () => {
    const DAY = D('2026-05-06');
    const ALL = { evaluate: 'do_it', contact: 'do_it', visit: 'do_it', offer: 'do_it', plan: 'do_it' } as const;
    const input = (w: World, over: Partial<RecruitingBoardInput> = {}): RecruitingBoardInput => ({
      state: w.state, ctx: w.ctx, teamId: USER_TEAM, staffId: USER_STAFF, party: w.hook.party(USER_STAFF, USER_TEAM),
      day: DAY, classYear: 2027, rights: ALL, names: NAMES, ...over,
    });
    const w = world();
    const id = Object.values(w.state.prospects).filter((p) => p.classYear === 2027).sort((a, b) => (a.publicRank ?? 1e9) - (b.publicRank ?? 1e9))[1]!.personId;
    const cmd: RecruitingCommandContext = {
      state: w.state, ctx: w.ctx, hook: w.hook, teamId: USER_TEAM, staffId: USER_STAFF, day: DAY, rights: ALL,
      evaluationSkill: 0.6, competition: () => 0.8, isPositionCoach: () => true,
    };
    watchFilm(cmd, id, 'full_film');
    const board = buildRecruitingBoardView(input(w));
    expect(board.rows.some((r) => r.grade !== null)).toBe(true);
    parses('recruitingBoard', board);
    parses('recruitingBoard', buildRecruitingBoardView(input(w, { list: 'pool' })));
    parses('recruitingBoard', buildRecruitingBoardView(input(w, { portal: { window: { open: DAY - 3, close: DAY + 10 }, entries: [{ personId: 5, position: 'DB', fromTeamId: 4, enteredDay: DAY - 1 }] } })));
  });
});
