// The question generator (H7.2.1, H7.2.2, L6.1, K8.7.1). A session asks one question at a time so the
// answer can shape the next: an evasive answer draws a follow-up, a contradiction draws a gotcha. The mix
// of question kinds starts from what real reporters ask (research.json); live events push their topics up
// by notability and recency; the session kind, the market, the outlet and each reporter's beat shift it.
// Every question names a public event or a general subject: nothing private is ever asked (privacy.ts).
import type { RandomStream } from '@gm/schema';
import { FOLLOW_UPS, HOSTILE_LEADS, RESEARCH, SESSIONS, TOPICS, topic, type Topic } from './catalogue.ts';
import { P } from './params.ts';
import { askable, FAULT_CODES, faultSuppressed } from './privacy.ts';
import type { AnswerKind, PressEvent, PressQuestion, PressSession, ReporterView, SessionState, Tone } from './types.ts';

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** e^x by (1 + x/32)^32: plain multiplication, identical on every platform (P1.1.1). */
function expish(x: number): number {
  const b = Math.max(0, 1 + x / 32);
  let r = 1;
  for (let i = 0; i < 32; i++) r *= b;
  return r;
}

/** Recency: halves every `recencyHalfLifeDays` (H7.2.2 rule 1, the same shape G-69 uses). */
export function recency(daysAgo: number): number {
  return 1 / (1 + Math.max(0, daysAgo) / P('recencyHalfLifeDays'));
}

/** Notability as the room weighs it: a leak makes the story bigger (H7.2.2 rule 3). */
export function salience(e: PressEvent): number {
  const n = clamp(e.notability + (e.fromLeak ? P('leakNotability') : 0), 0, 100);
  return (n / 100) * recency(e.daysAgo);
}

/** Realistic question count: the measured mean for the kind and level, scaled by market and minutes. */
export function questionCount(s: PressSession): number {
  if (s.settings.questionCount !== undefined) return clamp(Math.round(s.settings.questionCount), P('minQuestions'), P('maxQuestions'));
  const row = SESSIONS[s.kind];
  const lv = s.world.level;
  const measured = row.research !== undefined ? RESEARCH[lv].perSession[row.research] : undefined;
  let n = measured ?? row.questions[lv] ?? row.questions.pro ?? P('minQuestions');
  n *= 1 + P('market.questionsPerPoint') * (s.world.market - 3);
  if (s.minutes !== undefined) n = Math.min(n, s.minutes / P('minutesPerQuestion'));
  return clamp(Math.round(n), P('minQuestions'), P('maxQuestions'));
}

export function startSession(s: PressSession): SessionState {
  return { session: s, target: questionCount(s), asked: [], followUps: {}, done: false };
}

interface Candidate {
  readonly topic: Topic;
  readonly subjectKey: string;
  readonly event: PressEvent | null;
  readonly personId: number | null;
  readonly weight: number;
  readonly gotcha: boolean;
}

function topicAllowed(t: Topic, s: PressSession): boolean {
  if (t.level !== 'both' && t.level !== s.world.level) return false;
  const only = SESSIONS[s.kind].only;
  if (only && !only.includes(t.code)) return false;
  if (t.harm === 'personal' && !s.settings.personalTopics) return false;
  return true;
}

/** Every (topic, subject) the room could raise now, with its salience. Sorted for determinism. */
export function candidates(s: PressSession): Candidate[] {
  const out: Candidate[] = [];
  const events = [...s.events].sort((a, b) => a.id - b.id);
  const statements = [...s.statements].sort((a, b) => a.id - b.id);
  for (const t of TOPICS) {
    if (!topicAllowed(t, s)) continue;
    if (t.id === 'contradiction') {
      for (const st of statements) {
        if (st.contradictedBy === undefined) continue;
        const e = events.find((x) => x.id === st.contradictedBy);
        if (!e || !askable(t, e, s)) continue;
        out.push({ topic: t, subjectKey: `statement:${st.id}`, event: e, personId: e.personIds[0] ?? null, weight: Math.max(salience(e), 0.5) * recency(st.daysAgo), gotcha: true });
      }
      continue;
    }
    for (const e of events) {
      if (!t.triggers.includes(e.type) || !askable(t, e, s)) continue;
      out.push({ topic: t, subjectKey: `event:${e.id}`, event: e, personId: e.personIds[0] ?? null, weight: salience(e), gotcha: false });
    }
    if (t.evergreen) {
      const opp = (t.code === 'opponent_team' || t.code === 'opponent_player' || t.code === 'game_plan') ? s.world.nextOpponent : null;
      if ((t.code === 'opponent_team' || t.code === 'opponent_player' || t.code === 'game_plan') && opp === null) continue;
      out.push({ topic: t, subjectKey: opp !== null ? `team:${opp}` : `general:${t.id}`, event: null, personId: null, weight: P('evergreenSalience'), gotcha: false });
    }
  }
  return out;
}

function countBy<T>(xs: readonly T[], key: (x: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
}

/** Weight of each code for this reporter now: measured base share, session, live events, beat, repetition. */
export function codeWeights(state: SessionState, reporter: ReporterView, cands: readonly Candidate[]): Map<string, number> {
  const s = state.session;
  const share = RESEARCH[s.world.level].share;
  const mult = SESSIONS[s.kind].mult ?? {};
  const asked = countBy(state.asked, (q) => q.code);
  const byCode = new Map<string, Candidate[]>();
  for (const c of cands) byCode.set(c.topic.code, [...(byCode.get(c.topic.code) ?? []), c]);
  const out = new Map<string, number>();
  for (const [code, cs] of byCode) {
    const base = Math.max(share[code] ?? 0, P('floorShare'));
    const eventPeak = cs.reduce((m, c) => (c.event !== null ? Math.max(m, c.weight) : m), 0);
    let w = (base + P('eventShare') * eventPeak) * (mult[code] ?? 1);
    w *= reporter.beat[code] ?? 1;
    let k = asked.get(code) ?? 0;
    while (k-- > 0) w *= P('repeatCodePenalty');
    if (w > 0) out.set(code, w);
  }
  return out;
}

/** Pressure on the room's tone: losses, hot seat, goodwill, this reporter, the market, a poor decision. */
export function pressure(s: PressSession, r: ReporterView, e: PressEvent | null): number {
  const w = s.world;
  let x = 0;
  if (w.streak < 0) x += P('tone.lossStep') * Math.min(-w.streak, P('tone.lossCap'));
  if (w.streak > 0) x -= P('tone.winStep') * Math.min(w.streak, P('tone.lossCap'));
  if (w.hotSeat) x += P('tone.hotSeat');
  x += P('tone.goodwill') * (50 - w.goodwill) / 50;
  x += P('tone.trust') * (50 - r.trust) / 50;
  x += P('tone.controversy') * (r.controversy - 0.5) * 2;
  x += P('tone.market') * (w.market - 3);
  if (e?.judgedPoor) x += P('tone.judgedPoor');
  x += SESSIONS[s.kind].toneShift ?? 0;
  return x;
}

/** Tone shares: the measured mix, tilted by pressure, with a floor so a hostile question is always possible. */
export function toneShares(s: PressSession, r: ReporterView, e: PressEvent | null, faultHeld: boolean): Record<Tone, number> {
  const base = RESEARCH[s.world.level].tone;
  const x = pressure(s, r, e);
  const raw: Record<Tone, number> = {
    soft: base.soft * expish(-x),
    neutral: base.neutral,
    probing: base.probing * expish(x),
    hostile: (base.hostile + P('tone.hostileFloor')) * expish(2 * x),
  };
  if (faultHeld) { raw.neutral += raw.probing + raw.hostile; raw.probing = 0; raw.hostile = 0; }
  const total = raw.soft + raw.neutral + raw.probing + raw.hostile;
  return { soft: raw.soft / total, neutral: raw.neutral / total, probing: raw.probing / total, hostile: raw.hostile / total };
}

const TONES: readonly Tone[] = ['soft', 'neutral', 'probing', 'hostile'];

function pickReporter(state: SessionState, rng: RandomStream): ReporterView {
  const rs = [...state.session.reporters].sort((a, b) => a.id - b.id);
  const asked = countBy(state.asked, (q) => String(q.reporterId));
  const last = state.asked[state.asked.length - 1]?.reporterId;
  const w = rs.map((r) => {
    let x = Math.max(0.1, r.reach);
    let k = asked.get(String(r.id)) ?? 0;
    while (k-- > 0) x *= 0.6;
    if (r.id === last && rs.length > 1) x *= 0.3;
    return x;
  });
  return rs[rng.pick(w)]!;
}

/** Fill a wording from the event's public words and the world's names. */
export function render(template: string, s: PressSession, e: PressEvent | null, personId: number | null): string {
  const w = s.world;
  const words = e?.words ?? {};
  const defaults: Record<string, string> = {
    player: personId !== null ? w.names[personId] ?? 'that player' : 'that player',
    opponent: w.nextOpponent !== null ? w.names[w.nextOpponent] ?? 'this opponent' : 'this opponent',
    staff: 'your staff', detail: 'that situation', stat: 'those numbers',
    team: w.names[w.teamId] ?? 'the team', record: `${w.wins}-${w.losses}`,
  };
  return template.replace(/\{(\w+)\}/g, (_, k: string) => words[k] ?? defaults[k] ?? k);
}

/** A wording reads well only when each placeholder it uses has a real value (no "why was that player..." when a name exists elsewhere). */
function fits(template: string, s: PressSession, e: PressEvent | null, personId: number | null): boolean {
  const words = e?.words ?? {};
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    const k = m[1]!;
    if (words[k] !== undefined) continue;
    if (k === 'player' && personId !== null && s.world.names[personId] !== undefined) continue;
    if (k === 'opponent' && s.world.nextOpponent !== null) continue;
    if (k === 'team' || k === 'record') continue;
    return false;
  }
  return true;
}

function wording(t: Topic, tone: Tone, rng: RandomStream, s: PressSession, e: PressEvent | null, personId: number | null): { list: 'n' | 'p'; i: number; text: string } {
  const list = tone === 'probing' || tone === 'hostile' ? 'p' : 'n';
  const xs = t[list];
  const good = xs.map((x, k) => (fits(x, s, e, personId) ? k : -1)).filter((k) => k >= 0);
  const i = good.length > 0 ? good[rng.pick(good.map(() => 1))]! : rng.pick(xs.map(() => 1));
  const lead = tone === 'hostile' ? HOSTILE_LEADS[rng.pick(HOSTILE_LEADS.map(() => 1))]! : '';
  const body = xs[i]!;
  return { list, i, text: lead === '' ? body : lead + body.charAt(0).toLowerCase() + body.slice(1) };
}

function makeQuestion(state: SessionState, c: Candidate, r: ReporterView, rng: RandomStream, followUpOf: number | null, tone?: Tone, text?: string): PressQuestion {
  const s = state.session;
  const held = faultSuppressed(s) && FAULT_CODES.has(c.topic.code);
  let t: Tone;
  if (tone !== undefined) t = held && (tone === 'probing' || tone === 'hostile') ? 'neutral' : tone;
  else if (c.gotcha && !held) t = rng.chance(P('gotchaShare')) ? 'hostile' : 'probing';
  else {
    const sh = toneShares(s, r, c.event, held);
    t = TONES[rng.pick(TONES.map((x) => sh[x]))]!;
  }
  const wd = wording(c.topic, t, rng, s, c.event, c.personId);
  return {
    n: state.asked.length + 1, code: c.topic.code, topicId: c.topic.id, subjectKey: c.subjectKey,
    eventId: c.event?.id ?? null, personId: c.personId, reporterId: r.id, tone: t, followUpOf, gotcha: c.gotcha,
    harm: c.event && c.event.harm !== 'none' ? c.event.harm : c.topic.harm,
    textKey: followUpOf !== null ? `press.followup.${c.topic.id}` : `press.${c.topic.id}.${wd.list}.${wd.i}`,
    text: render(text ?? wd.text, s, c.event, c.personId),
  };
}

/** Chance the room presses the last answer (research follow-up rate times the answer's multiplier). */
export function followUpChance(state: SessionState, last: PressQuestion, answer: AnswerKind): number {
  if ((state.followUps[last.subjectKey] ?? 0) >= P('followUp.maxPerSubject')) return 0;
  const base = RESEARCH[state.session.world.level].followup;
  let p = base * P(`followUp.${answer}`);
  if (last.tone === 'probing' || last.tone === 'hostile' || last.gotcha) p *= P('followUp.hotMult');
  return clamp(p, 0, P('followUp.cap'));
}

function followUp(state: SessionState, last: PressQuestion, answer: AnswerKind, rng: RandomStream): PressQuestion {
  const s = state.session;
  const t = topic(last.topicId);
  const e = last.eventId !== null ? s.events.find((x) => x.id === last.eventId) ?? null : null;
  const c: Candidate = { topic: t, subjectKey: last.subjectKey, event: e, personId: last.personId, weight: 1, gotcha: last.gotcha };
  const sameReporter = s.reporters.find((r) => r.id === last.reporterId) ?? s.reporters[0]!;
  const r = s.reporters.length > 1 && rng.chance(0.35) ? pickReporter(state, rng) : sameReporter;
  const tone: Tone = answer === 'direct' ? (last.tone === 'soft' ? 'neutral' : last.tone) : (last.tone === 'hostile' ? 'hostile' : 'probing');
  const lines = FOLLOW_UPS[answer] ?? FOLLOW_UPS.direct!;
  const fitting = t.p.filter((x) => fits(x, s, e, last.personId));
  const pool = fitting.length > 0 ? fitting : t.p;
  const again = pool[rng.pick(pool.map(() => 1))]!;
  const line = lines[rng.pick(lines.map(() => 1))]!.replace('{again}', again);
  return makeQuestion(state, c, r, rng, last.n, tone, line);
}

/** H7.2.2 acceptance 1: a quarterback change is the first question of the next session. */
function forcedFirst(state: SessionState, cands: readonly Candidate[]): Candidate | null {
  if (state.asked.length > 0) return null;
  const qb = cands.filter((c) => c.topic.id === 'qb_starter' && c.event?.type === 'qb_change');
  return qb.sort((a, b) => b.weight - a.weight || a.subjectKey.localeCompare(b.subjectKey))[0] ?? null;
}

/**
 * Ask the next question. `lastAnswer` is how the coach answered the previous one (null for the first).
 * Returns the new state and the question, or null when the session is over.
 */
export function ask(state: SessionState, rng: RandomStream, lastAnswer: AnswerKind | null): { state: SessionState; question: PressQuestion | null } {
  if (state.done || state.asked.length >= state.target || state.session.reporters.length === 0) return { state: { ...state, done: true }, question: null };
  const last = state.asked[state.asked.length - 1];
  let q: PressQuestion | null = null;
  if (last && lastAnswer !== null && rng.chance(followUpChance(state, last, lastAnswer))) q = followUp(state, last, lastAnswer, rng);
  if (!q) {
    const cands = candidates(state.session);
    const forced = forcedFirst(state, cands);
    const r = pickReporter(state, rng);
    if (forced) q = makeQuestion(state, forced, r, rng, null);
    else {
      const cw = codeWeights(state, r, cands);
      if (cw.size === 0) return { state: { ...state, done: true }, question: null };
      const codes = [...cw.keys()].sort();
      const code = codes[rng.pick(codes.map((k) => cw.get(k)!))]!;
      const asked = countBy(state.asked, (x) => x.subjectKey);
      const inCode = cands.filter((c) => c.topic.code === code);
      const ws = inCode.map((c) => {
        let w = c.weight;
        let k = asked.get(c.subjectKey) ?? 0;
        while (k-- > 0) w *= P('repeatSubjectPenalty');
        return w;
      });
      q = makeQuestion(state, inCode[rng.pick(ws)]!, r, rng, null);
    }
  }
  const followUps = q.followUpOf !== null ? { ...state.followUps, [q.subjectKey]: (state.followUps[q.subjectKey] ?? 0) + 1 } : state.followUps;
  const asked = [...state.asked, q];
  return { state: { ...state, asked, followUps, done: asked.length >= state.target }, question: q };
}

/** Run a whole session with an answer policy (AI coaches, tests, the one-click bland default). */
export function runSession(s: PressSession, rng: RandomStream, answerer: (q: PressQuestion) => AnswerKind): PressQuestion[] {
  let st = startSession(s);
  let last: AnswerKind | null = null;
  for (;;) {
    const r = ask(st, rng, last);
    st = r.state;
    if (!r.question) break;
    last = answerer(r.question);
  }
  return [...st.asked];
}
