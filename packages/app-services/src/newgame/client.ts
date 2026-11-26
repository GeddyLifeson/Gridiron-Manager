// The new-game flow's service, run where the history is played. The history takes minutes to hours, so
// the browser runs it in a Web Worker (P2.1.2) and the screen talks to it by messages; tests and the
// tools run the same handler in the calling thread. One protocol, so both paths cannot differ.
import * as career from '@gm/career';
import { loop, turnover } from '@gm/world';
import { FALLBACK_BAKED, type BakedHistory } from './baked.ts';
import type { BindingOptions } from './binding.ts';
import { draftLegends, draftSearchIndex, type DraftLegendsData, type DraftLegendsQuery } from './legends.ts';
import {
  estimate, historyChoices, reviewOf, runDraft, startCareer, validateCoach, creationWorld,
  type CareerStart, type Draft, type DraftReview, type Estimate, type HistoryChoice, type Progress, type WorldChoice,
} from './session.ts';

/** Teams and head coaches of the draft the coach step offers (first team, mentors). */
export interface CoachOptions {
  readonly teams: readonly { readonly id: number; readonly name: string; readonly level: 'pro' | 'college'; readonly vacant: boolean }[];
  readonly headCoaches: readonly { readonly personId: number; readonly name: string; readonly team: string; readonly firstSeason: number; readonly lastSeason: number | null }[];
}

export type Request =
  | { readonly op: 'choices'; readonly careerStartYear: number }
  | { readonly op: 'estimate'; readonly choice: WorldChoice; readonly benchmarkRatio?: number }
  | { readonly op: 'run'; readonly choice: WorldChoice; readonly rerun: number }
  | { readonly op: 'coachOptions' }
  | { readonly op: 'validateCoach'; readonly choices: career.coach.CreationChoices }
  | { readonly op: 'legends'; readonly query: DraftLegendsQuery }
  | { readonly op: 'start'; readonly choices: career.coach.CreationChoices; readonly saveName: string };

export type Message =
  | { readonly id: number; readonly kind: 'progress'; readonly progress: Progress }
  | { readonly id: number; readonly kind: 'done'; readonly value: unknown }
  | { readonly id: number; readonly kind: 'error'; readonly message: string };

export type StartReply =
  | { readonly ok: true; readonly start: CareerStart; readonly world: loop.PackedWorld }
  | { readonly ok: false; readonly problems: readonly career.coach.CreationProblem[]; readonly notices: readonly career.coach.CreationNotice[] };

export interface HandlerOptions { readonly baked?: BakedHistory; readonly now?: () => number; readonly binding?: Omit<BindingOptions, 'onSeason'> }

/**
 * The handler: keeps the current draft and answers requests. `post` receives every message (progress
 * while a run goes, then one done or error). Synchronous: in a worker the run blocks only the worker.
 */
export function createHandler(post: (m: Message) => void, opts: HandlerOptions = {}): (id: number, req: Request) => void {
  const baked = opts.baked ?? FALLBACK_BAKED;
  let draft: Draft | null = null;
  let index: ReturnType<typeof draftSearchIndex> | null = null;
  const need = (): Draft => { if (!draft) throw new Error('no history has been generated yet'); return draft; };
  const answer = (req: Request, id: number): unknown => {
    switch (req.op) {
      case 'choices': return historyChoices(req.careerStartYear) satisfies HistoryChoice[];
      case 'estimate': return estimate(baked, req.choice, req.benchmarkRatio ?? 1) satisfies Estimate;
      case 'run': {
        draft = null; index = null;
        draft = runDraft(req.choice, req.rerun, { onProgress: (progress) => post({ id, kind: 'progress', progress }), ...(opts.now ? { now: opts.now } : {}), ...(opts.binding ? { binding: opts.binding } : {}) });
        return reviewOf(draft) satisfies DraftReview;
      }
      case 'coachOptions': {
        const d = need(), w = d.built.world;
        const cw = creationWorld(w, d.choice.careerStartYear);
        const vacant = new Set(cw.vacantTeamIds);
        const nameOfTeam = (id: number) => w.teams.find((t) => t.id === id)?.identity.name ?? `team ${id}`;
        return {
          teams: cw.teams.map((t) => ({ id: t.id, name: nameOfTeam(t.id), level: t.level, vacant: vacant.has(t.id) })).sort((a, b) => a.name.localeCompare(b.name)),
          headCoaches: cw.headStints.filter((s) => (s.lastSeason ?? d.choice.careerStartYear) - s.firstSeason >= 1).map((s) => {
            const p = w.people.get(s.personId);
            return { personId: s.personId, name: p ? `${p.name.first} ${p.name.last}` : `person ${s.personId}`, team: nameOfTeam(s.teamId), firstSeason: s.firstSeason, lastSeason: s.lastSeason };
          }),
        } satisfies CoachOptions;
      }
      case 'validateCoach': return validateCoach(need(), req.choices);
      case 'legends': {
        const w = need().built.world;
        if (req.query.search !== undefined && !index) index = draftSearchIndex(w);
        return draftLegends(w, req.query, index ?? undefined) satisfies DraftLegendsData;
      }
      case 'start': {
        const r = startCareer(need(), req.choices, req.saveName);
        return (r.ok ? { ok: true, start: r.start, world: loop.packWorld(r.world) } : r) satisfies StartReply;
      }
    }
  };
  return (id, req) => {
    try { post({ id, kind: 'done', value: answer(req, id) }); }
    catch (e) { post({ id, kind: 'error', message: e instanceof Error ? e.message : String(e) }); }
  };
}

/** A worker as the client sees it (the DOM Worker, or anything with the same three members). */
export interface WorkerLike {
  postMessage(m: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  terminate(): void;
}

/** The generated world as the career receives it. */
export type StartedWorld = loop.LiveWorld;

export type StartOutcome =
  | { readonly ok: true; readonly start: CareerStart; readonly world: loop.LiveWorld }
  | { readonly ok: false; readonly problems: readonly career.coach.CreationProblem[]; readonly notices: readonly career.coach.CreationNotice[] };

/** What the screen calls. Every call is async; `run` reports progress; `cancel` stops a run at once. */
export interface NewGameClient {
  choices(careerStartYear: number): Promise<HistoryChoice[]>;
  estimate(choice: WorldChoice, benchmarkRatio?: number): Promise<Estimate>;
  run(choice: WorldChoice, rerun: number, onProgress: (p: Progress) => void): Promise<DraftReview>;
  coachOptions(): Promise<CoachOptions>;
  validateCoach(choices: career.coach.CreationChoices): Promise<career.coach.Validation>;
  legends(query: DraftLegendsQuery): Promise<DraftLegendsData>;
  start(choices: career.coach.CreationChoices, saveName: string): Promise<StartOutcome>;
  /** Stop a run in progress; the draft it was making is dropped. */
  cancel(): void;
}

function revive(r: StartReply): StartOutcome {
  return r.ok ? { ok: true, start: r.start, world: loop.unpackWorld(r.world, { eventTypes: turnover.TURNOVER_EVENT_TYPES }) } : r;
}

/** The client over a worker made by `spawn` (a fresh one after a cancel). The worker script calls `serveWorker`. */
export function workerClient(spawn: () => WorkerLike): NewGameClient {
  let worker = spawn();
  let next = 1;
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void; progress?: (p: Progress) => void }>();
  const wire = (w: WorkerLike) => {
    w.onmessage = (e) => {
      const m = e.data as Message;
      const p = pending.get(m.id);
      if (!p) return;
      if (m.kind === 'progress') { p.progress?.(m.progress); return; }
      pending.delete(m.id);
      if (m.kind === 'done') p.resolve(m.value); else p.reject(new Error(m.message));
    };
  };
  wire(worker);
  const call = <T>(req: Request, progress?: (p: Progress) => void): Promise<T> => new Promise<T>((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, ...(progress ? { progress } : {}) });
    worker.postMessage({ id, req });
  });
  return {
    choices: (careerStartYear) => call({ op: 'choices', careerStartYear }),
    estimate: (choice, benchmarkRatio) => call({ op: 'estimate', choice, ...(benchmarkRatio === undefined ? {} : { benchmarkRatio }) }),
    run: (choice, rerun, onProgress) => call({ op: 'run', choice, rerun }, onProgress),
    coachOptions: () => call({ op: 'coachOptions' }),
    validateCoach: (choices) => call({ op: 'validateCoach', choices }),
    legends: (query) => call({ op: 'legends', query }),
    start: async (choices, saveName) => revive(await call<StartReply>({ op: 'start', choices, saveName })),
    cancel: () => {
      worker.terminate();
      for (const p of pending.values()) p.reject(new Error('cancelled'));
      pending.clear();
      worker = spawn();
      wire(worker);
    },
  };
}

/** The worker side: wire a worker global scope to the handler. */
export function serveWorker(scope: { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null }, opts: HandlerOptions = {}): void {
  const handle = createHandler((m) => scope.postMessage(m), opts);
  scope.onmessage = (e) => { const { id, req } = e.data as { id: number; req: Request }; handle(id, req); };
}

/**
 * The same service in the calling thread (tests, the headless tools, a fallback where workers are absent).
 * A run blocks the caller until it ends; cancel has no effect mid-run.
 */
export function inlineClient(opts: HandlerOptions = {}): NewGameClient {
  let next = 1;
  let out: Message[] = [];
  const handle = createHandler((m) => out.push(m), opts);
  const call = async <T>(req: Request, progress?: (p: Progress) => void): Promise<T> => {
    const id = next++;
    out = [];
    handle(id, req);
    let result: Message | undefined;
    for (const m of out) { if (m.kind === 'progress') progress?.(m.progress); else result = m; }
    if (!result) throw new Error('no answer');
    if (result.kind === 'error') throw new Error(result.message);
    return (result as { value: unknown }).value as T;
  };
  return {
    choices: (careerStartYear) => call({ op: 'choices', careerStartYear }),
    estimate: (choice, benchmarkRatio) => call({ op: 'estimate', choice, ...(benchmarkRatio === undefined ? {} : { benchmarkRatio }) }),
    run: (choice, rerun, onProgress) => call({ op: 'run', choice, rerun }, onProgress),
    coachOptions: () => call({ op: 'coachOptions' }),
    validateCoach: (choices) => call({ op: 'validateCoach', choices }),
    legends: (query) => call({ op: 'legends', query }),
    start: async (choices, saveName) => revive(await call<StartReply>({ op: 'start', choices, saveName })),
    cancel: () => {},
  };
}
