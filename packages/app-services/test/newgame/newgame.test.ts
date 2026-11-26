// The new-game flow (Marlon 2026-11-26): history length up to 1869, the history played by the real game,
// rerun with a fresh seed, the coach confirmed against the world, and the world handed to the career.
// The world is a trimmed cut of the real content (4 clubs, 4 schools) so the real engine runs in seconds.
import { describe, expect, it } from 'vitest';
import * as career from '@gm/career';
import { generation, loop } from '@gm/world';
import { newgame } from '../../src/index.ts';

function trimmed(clubs: number, schools: number): newgame.AppWorldContent {
  const app = newgame.appWorldContent();
  const c = app.content;
  const keepClubs = c.pro.league.clubs.slice(0, clubs);
  const clubIds = new Set(keepClubs.map((x) => x.id));
  const conf = c.college.conferences[0]!;
  const schoolIds = new Set(conf.memberIds.slice(0, schools));
  return {
    ...app,
    content: {
      ...c,
      pro: { league: { ...c.pro.league, clubs: keepClubs }, stadiums: c.pro.stadiums.filter((s) => clubIds.has(s.clubId)), rivalries: c.pro.rivalries.filter((r) => clubIds.has(r.a) && clubIds.has(r.b)) },
      college: {
        ...c.college, conferences: [{ ...conf, memberIds: [...schoolIds] }], independents: [],
        schools: c.college.schools.filter((s) => schoolIds.has(s.id)), rivalries: c.college.rivalries.filter((r) => schoolIds.has(r.a) && schoolIds.has(r.b)),
      },
      collegeLevelsBySize: { full: ['college_top'], standard: ['college_top'], small: ['college_top'] },
    },
  };
}

const CONTENT = trimmed(4, 4);
const CHOICE: newgame.WorldChoice = { seedHex: '00000000000a11ce', size: 'small', historySeasons: 2, careerStartYear: 2026 };

describe('history length choices', () => {
  it('offers a few seasons up to the full span back to 1869, and refuses longer', () => {
    const c = newgame.historyChoices(2026);
    expect(c.at(-1)).toEqual({ seasons: 157, firstSeasonYear: 1869, full: true });
    expect(c.every((x, i) => i === 0 || x.seasons > c[i - 1]!.seasons)).toBe(true);
    expect(newgame.worldChoiceProblems({ ...CHOICE, historySeasons: 5 })).toEqual([]);
    expect(newgame.worldChoiceProblems({ ...CHOICE, historySeasons: 158 })[0]).toMatch(/1869/);
    expect(newgame.worldChoiceProblems({ ...CHOICE, seedHex: 'xyz' })[0]).toMatch(/seed/);
  });
  it('estimates from the baked data, marked provisional until the master run lands', () => {
    const e = newgame.estimate(newgame.FALLBACK_BAKED, { ...CHOICE, historySeasons: 10 });
    expect(e.provisional).toBe(true);
    expect(e.seconds).toBe(10 * newgame.MEASURED_SECONDS_PER_SEASON_SMALL);
  });
});

describe('a draft of the past, rerun, and the start', { timeout: 300_000 }, () => {
  const client = newgame.inlineClient({ binding: { content: CONTENT } });
  it('plays every season with the real game, reports progress, reruns with a fresh seed, never touches baked data, and starts the career', async () => {
    const bakedBefore = newgame.bakedFingerprint(newgame.FALLBACK_BAKED);
    const progress: newgame.Progress[] = [];
    const a = await client.run(CHOICE, 0, (p) => progress.push(p));
    // A first try that fails validation is redone once with seed plus 1 (X10.3.2); progress says which try.
    // (The trimmed world fails the rivalry check, so both tries run here and failedTwice is set.)
    const lastTry = progress.filter((p) => p.seedStep === a.seedStep);
    expect(lastTry.map((p) => p.done)).toEqual([1, 2]);
    expect(lastTry[0]!.seasonYear).toBe(2024);
    expect(progress.every((p) => p.champions.length >= 1)).toBe(true);
    expect(a.seasonsRun).toBe(2);
    expect(a.firstSeasonYear).toBe(2024);
    expect(a.seedHex).toBe(CHOICE.seedHex);
    expect(a.seasons.map((s) => s.seasonYear)).toEqual([2025, 2024]);
    expect(a.teams.length).toBeGreaterThan(0);
    expect(a.unbound.map((u) => u.step)).not.toContain('games');

    // Rerun: a new seed derived from the first, a different past.
    const b = await client.run(CHOICE, 1, () => {});
    expect(b.seedHex).toBe(loop.rerunSeedHex(CHOICE.seedHex, 1));
    expect(b.seedHex).not.toBe(a.seedHex);
    expect(b.worldCode).not.toBe(a.worldCode);
    expect(newgame.bakedFingerprint(newgame.FALLBACK_BAKED)).toBe(bakedBefore);

    // The legends browser over the draft: search finds teams; a team page opens.
    const s = await client.legends({ search: '' });
    expect(s.search!.rows.length).toBeGreaterThan(0);
    const team = b.teams[0]!;
    const page = await client.legends({ link: { kind: 'team', id: team.id } });
    expect(page.page!.link).toEqual({ kind: 'team', id: team.id });
    expect(page.names[`team:${team.id}`]).toBe(team.name);

    // The coach: a nobody start from an origin card passes the checks against this world.
    const opts = await client.coachOptions();
    expect(opts.teams.length).toBeGreaterThan(0);
    const choices: career.coach.CreationChoices = { ...career.coach.choicesFromOrigin('college_player_staying_on', 'college', 7), name: { first: 'Pat', last: 'Doe' } };
    const v = await client.validateCoach(choices);
    expect(v.problems).toEqual([]);
    const started = await client.start(choices, 'career-1');
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.start.careerStartYear).toBe(2026);
    expect(started.start.seedHex).toBe(b.seedHex);
    expect(started.start.rerun).toBe(1);
    expect(started.start.level).toBe('college');
    expect(started.start.ruleSetId).toBe('college_2026');
    expect(started.start.coach.name).toEqual({ first: 'Pat', last: 'Doe' });
    expect(started.world.date.seasonYear).toBe(2026);
    expect(started.world.teams.length).toBe(8);
    expect(loop.worldHash(started.world)).toBe(started.start.worldHash);
    expect(generation.decodeWorldCode(started.start.worldCode).ok).toBe(true);
  });

  it('the same choice and rerun give the same world (the history is a pure function of its seed)', () => {
    const one = newgame.runDraft(CHOICE, 0, { binding: { content: CONTENT } });
    const two = newgame.runDraft(CHOICE, 0, { binding: { content: CONTENT } });
    expect(loop.worldHash(two.built.world)).toBe(loop.worldHash(one.built.world));
  });
});

describe('the worker protocol', { timeout: 300_000 }, () => {
  it('crosses a structured-clone boundary and revives the same world', async () => {
    // A worker pair in one thread: each message is structured-cloned, as postMessage does.
    const spawn = (): newgame.WorkerLike => {
      const inside: { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null } = { postMessage: () => {}, onmessage: null };
      const outside: newgame.WorkerLike = {
        onmessage: null,
        postMessage: (m) => queueMicrotask(() => inside.onmessage?.({ data: structuredClone(m) })),
        terminate: () => { inside.onmessage = null; },
      };
      inside.postMessage = (m) => queueMicrotask(() => outside.onmessage?.({ data: structuredClone(m) }));
      newgame.serveWorker(inside, { binding: { content: CONTENT } });
      return outside;
    };
    const client = newgame.workerClient(spawn);
    const seen: newgame.Progress[] = [];
    const r = await client.run({ ...CHOICE, historySeasons: 1 }, 0, (p) => seen.push(p));
    expect(seen.filter((p) => p.seedStep === r.seedStep).map((p) => p.done)).toEqual([1]);
    expect(r.seasonsRun).toBe(1);
    const started = await client.start({ ...career.coach.choicesFromOrigin('college_player_staying_on', 'college', 7), name: { first: 'Pat', last: 'Doe' } }, 'career-1');
    expect(started.ok).toBe(true);
    if (started.ok) expect(loop.worldHash(started.world)).toBe(started.start.worldHash);
    // A cancel rejects what was pending and leaves a fresh worker that answers.
    const pending = client.run(CHOICE, 0, () => {});
    client.cancel();
    await expect(pending).rejects.toThrow(/cancelled/);
    expect((await client.choices(2026)).at(-1)!.seasons).toBe(157);
  });
});
