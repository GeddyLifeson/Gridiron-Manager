// The break-test engine: drives one target for one seed, checks the oracle and the invariants after every
// step, saves and reloads at random moments, replays the run to check determinism, and shrinks each new
// finding to the shortest action list that still shows it.
import { rndFor } from './rnd.ts';
import { MODES, type Action, type BreakTarget, type Finding, type FindingKind, type Mode, type RunOptions, type TargetReport, type Violation } from './types.ts';

const RELOAD: Action = { kind: '$reload', mode: 'out_of_order', args: {} };

interface Hit { kind: FindingKind; code: string; message: string; detail?: Readonly<Record<string, unknown>> }

/** Plays a list of actions from reset and returns what it hit at each step, plus the state hash after each step. */
async function play(t: BreakTarget, seedHex: string, actions: readonly Action[], stopAtCode?: string): Promise<{ hits: { step: number; hit: Hit }[]; hashes: string[]; accepted: number; refused: number; reloads: number }> {
  const hits: { step: number; hit: Hit }[] = [];
  const hashes: string[] = [];
  let accepted = 0, refused = 0, reloads = 0;
  await t.reset(seedHex);
  for (let i = 0; i < actions.length; i++) {
    const out = await step(t, actions[i]!);
    accepted += out.accepted; refused += out.refused; reloads += out.reload;
    for (const h of out.hits) hits.push({ step: i, hit: h });
    hashes.push(out.hash);
    if (stopAtCode && out.hits.some((h) => h.code === stopAtCode)) break;
  }
  return { hits, hashes, accepted, refused, reloads };
}

async function step(t: BreakTarget, a: Action): Promise<{ hits: Hit[]; hash: string; accepted: number; refused: number; reload: number }> {
  const hits: Hit[] = [];
  if (a.kind === '$reload') {
    try {
      const before = t.hash();
      const problems = (await t.reload?.()) ?? [];
      for (const p of problems) hits.push({ kind: 'save', code: p.code, message: p.message, ...(p.detail ? { detail: p.detail } : {}) });
      const after = t.hash();
      if (after !== before) hits.push({ kind: 'save', code: 'reload.state_changed', message: 'The state after a save and reload hashes differently from the state before it.', detail: { before, after } });
    } catch (e) {
      hits.push(crash('reload', e));
    }
    return { hits, hash: safeHash(t), accepted: 0, refused: 0, reload: 1 };
  }
  let expected: string | null | undefined;
  try { expected = t.expect(a); } catch (e) { hits.push(crash(`oracle ${a.kind}`, e)); expected = undefined; }
  const before = safeHash(t);
  let accepted = 0, refused = 0;
  try {
    const out = await t.apply(a);
    if (out.accepted) {
      accepted = 1;
      if (typeof expected === 'string') hits.push({ kind: 'accepted_illegal', code: `accepted:${a.kind}:${slug(expected)}`, message: `${a.kind} was accepted but must be refused: ${expected}`, detail: { args: a.args } });
    } else {
      refused = 1;
      if (expected === null) hits.push({ kind: 'refused_legal', code: `refused:${a.kind}:${slug(out.reason)}`, message: `${a.kind} was refused but is legal: ${out.reason}`, detail: { args: a.args } });
      const after = safeHash(t);
      if (after !== before) hits.push({ kind: 'invariant', code: `refused_changed_state:${a.kind}`, message: `${a.kind} was refused but the state changed anyway.`, detail: { reason: out.reason } });
    }
  } catch (e) {
    hits.push(crash(a.kind, e));
  }
  let vs: Violation[] = [];
  try { vs = t.invariants(); } catch (e) { hits.push(crash('invariants', e)); }
  for (const v of vs) hits.push({ kind: 'invariant', code: v.code, message: v.message, ...(v.detail ? { detail: v.detail } : {}) });
  return { hits, hash: safeHash(t), accepted, refused, reload: 0 };
}

function safeHash(t: BreakTarget): string {
  try { return t.hash(); } catch (e) { return `hash threw: ${firstLine((e as Error).message)}`; }
}

function crash(where: string, e: unknown): Hit {
  const err = e instanceof Error ? e : new Error(String(e));
  return { kind: 'crash', code: `crash:${where}:${firstLine(err.message)}`, message: `${where} threw: ${firstLine(err.message)}`, detail: { stack: (err.stack ?? '').split('\n').slice(0, 6).join('\n') } };
}

export function firstLine(s: string): string {
  return (s.split('\n')[0] ?? '').replace(/\d+(\.\d+)?/g, 'N').slice(0, 140);
}

export function slug(s: string): string {
  return firstLine(s).toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
}

function pickMode(r: ReturnType<typeof rndFor>, w: RunOptions['modeWeights']): Mode {
  const total = w.reduce((s, x) => s + x, 0);
  let u = r.uniform() * total;
  for (let i = 0; i < MODES.length; i++) { u -= w[i]!; if (u < 0) return MODES[i]!; }
  return MODES[0];
}

/** Runs one target for one seed. Never throws: everything becomes a finding. */
export async function runTarget(t: BreakTarget, seedHex: string, o: RunOptions): Promise<TargetReport> {
  const t0 = performance.now();
  const findings = new Map<string, Finding>();
  const add = (h: Hit, stepIdx: number): void => {
    const key = `${h.kind}|${h.code}`;
    const f = findings.get(key);
    if (f) { findings.set(key, { ...f, count: f.count + 1 }); return; }
    findings.set(key, { kind: h.kind, target: t.name, code: h.code, message: h.message, owner: t.owner, seedHex, count: 1, step: stepIdx, ...(h.detail ? { detail: h.detail } : {}) });
  };

  const log: Action[] = [];
  const hashes: string[] = [];
  let accepted = 0, refused = 0, reloads = 0;
  try {
    await t.reset(seedHex);
  } catch (e) {
    add(crash('reset', e), -1);
    return { target: t.name, seedHex, steps: 0, accepted, refused, reloads, findings: [...findings.values()], ms: Math.round(performance.now() - t0) };
  }
  for (const u of t.unreachable()) add({ kind: 'unreachable', code: u.code, message: u.message }, -1);
  const r = rndFor(seedHex, t.name, ['run']);
  for (let i = 0; i < o.steps; i++) {
    let a: Action;
    if (t.reload && r.chance(o.reloadChance)) a = RELOAD;
    else {
      const mode = pickMode(r, o.modeWeights);
      try { a = t.propose(mode, r); } catch (e) { add(crash(`propose ${mode}`, e), i); continue; }
    }
    log.push(a);
    const out = await step(t, a);
    accepted += out.accepted; refused += out.refused; reloads += out.reload;
    hashes.push(out.hash);
    for (const h of out.hits) add(h, log.length - 1);
  }

  if (t.finish) {
    try { for (const v of await t.finish()) add({ kind: 'invariant', code: v.code, message: v.message, ...(v.detail ? { detail: v.detail } : {}) }, log.length - 1); }
    catch (e) { add(crash('finish', e), log.length - 1); }
  }

  if (o.replay) {
    try {
      const again = await play(t, seedHex, log);
      const at = hashes.findIndex((h, i) => again.hashes[i] !== h);
      if (at >= 0) {
        add({ kind: 'nondeterministic', code: 'replay.diverged', message: `Replaying the same ${log.length} actions from the same seed gave a different state at step ${at} (${log[at]!.kind}).`, detail: { step: at, action: log[at]!.kind, first: hashes[at], replay: again.hashes[at] } }, at);
      }
    } catch (e) {
      add(crash('replay', e), -1);
    }
  }

  if (o.shrink) {
    for (const [key, f] of findings) {
      if (f.step < 0 || f.kind === 'unreachable' || f.kind === 'nondeterministic') continue;
      try {
        const repro = await shrink(t, seedHex, log.slice(0, f.step + 1), f.code, o.shrinkBudget);
        if (repro) findings.set(key, { ...f, repro });
      } catch { /* a shrink that throws keeps the finding without a repro */ }
    }
  }
  try { await t.close(); } catch (e) { add(crash('close', e), -1); }
  return { target: t.name, seedHex, steps: log.length, accepted, refused, reloads, findings: [...findings.values()], ms: Math.round(performance.now() - t0) };
}

/** Delta debugging (ddmin) over the action list: the shortest list found that still hits `code`. */
export async function shrink(t: BreakTarget, seedHex: string, actions: readonly Action[], code: string, budget: number): Promise<readonly Action[] | null> {
  let spent = 0;
  const hits = async (xs: readonly Action[]): Promise<boolean> => {
    spent++;
    const r = await play(t, seedHex, xs, code);
    return r.hits.some((h) => h.hit.code === code);
  };
  // Most findings show on their own step: try the last action alone first.
  const last = actions.slice(-1);
  if (await hits(last)) return last;
  if (!(await hits(actions))) return null;
  let cur = [...actions];
  let n = 2;
  while (cur.length >= 2 && spent < budget) {
    const size = Math.ceil(cur.length / n);
    let reduced = false;
    for (let i = 0; i < n && spent < budget; i++) {
      const without = [...cur.slice(0, i * size), ...cur.slice((i + 1) * size)];
      if (without.length > 0 && (await hits(without))) { cur = without; n = Math.max(n - 1, 2); reduced = true; break; }
    }
    if (!reduced) { if (n >= cur.length) break; n = Math.min(cur.length, n * 2); }
  }
  return cur;
}

/** Replays a written-down repro (for the report and for regression tests). */
export async function replayRepro(t: BreakTarget, seedHex: string, actions: readonly Action[]): Promise<readonly string[]> {
  const r = await play(t, seedHex, actions);
  return [...new Set(r.hits.map((h) => h.hit.code))];
}
