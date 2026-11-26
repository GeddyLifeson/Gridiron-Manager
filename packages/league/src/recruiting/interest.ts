// T4.4.1 interest, relationships and the staff read; T4.4.2 the people around the prospect.
// True interest is hidden: fit between what the prospect and his circle want and what the school is,
// shifted by relationships with the main recruiter, the head coach's involvement, and the impression
// visits and offers leave. A staff learns only from evidence events, written as words with a basis.
import unitsJson from './data/units.json' with { type: 'json' };
import { clamp, key2, powInt, type RecruitingContext } from './context.ts';
import { P } from './params.ts';
import { tieOf, tiesOfProspect } from './limits.ts';
import {
  PREFERENCE_KEYS, STANDING_WORDS,
  type ActionKind, type Board, type CircleMember, type CircleRead, type Edge, type Evidence, type EvidenceKind, type InfluenceWord,
  type PreferenceKey, type Prospect, type RecruitingState, type StaffRead, type StandingWord,
} from './types.ts';

const SCALE = unitsJson.scaleMax;

export function edgeOf(state: RecruitingState, fromId: number, toId: number): number {
  return state.edges[key2(fromId, toId)]?.strength ?? 0;
}

export function bumpEdge(state: RecruitingState, fromId: number, toId: number, delta: number, day: number): void {
  const k = key2(fromId, toId);
  const e: Edge = state.edges[k] ?? { fromId, toId, strength: 0, lastDay: day };
  e.strength = clamp(e.strength + delta, 0, SCALE);
  e.lastDay = day;
  state.edges[k] = e;
}

/** Score of one preference at one school for one member of the circle, 0 to 1 (T4.1.1 preferences). */
export function preferenceScore(state: RecruitingState, ctx: RecruitingContext, p: Prospect, teamId: number, m: CircleMember, key: PreferenceKey): number {
  const prog = ctx.programs.program(teamId);
  switch (key) {
    case 'distance': return p.region === prog.region ? 1 : P('fit.distanceAway');
    case 'playingTime': return clamp(ctx.programs.opportunity(teamId, p.position), 0, 1);
    case 'prestige': return clamp(prog.prestige / SCALE, 0, 1);
    case 'academics': return clamp(prog.academics / SCALE, 0, 1);
    case 'money': return clamp(prog.money / SCALE, 0, 1);
    case 'schemeFit': return clamp(ctx.programs.schemeFit(teamId, p.personId), 0, 1);
    case 'favourite': return p.favouriteTeamId === teamId ? 1 : 0;
    case 'relationship': {
      const t = state.ties[key2(p.personId, teamId)];
      const rec = t?.recruiterId ?? null;
      const edge = rec === null ? 0 : edgeOf(state, rec, m.memberId) / SCALE;
      const hc = edgeOf(state, prog.headCoachId, m.memberId) / SCALE;
      return clamp(edge + P('fit.headCoachEdgeShare') * hc + P('fit.hcInvolvementWeight') * (t?.hcInvolvement ?? 0), 0, 1);
    }
  }
}

/** Fit of a school for the whole circle, weighted by true influence (T4.4.2 rule 1). 0 to 1. */
export function fitOf(state: RecruitingState, ctx: RecruitingContext, p: Prospect, teamId: number): number {
  let fit = 0;
  for (const m of p.circle) {
    let s = 0;
    for (const key of PREFERENCE_KEYS) s += m.prefs[key] * preferenceScore(state, ctx, p, teamId, m, key);
    fit += m.influence * s;
  }
  return fit;
}

/** True interest, 0 to 100 (ProspectTeamState.interest). Truth: never shown (K9.1.1). */
export function trueInterest(state: RecruitingState, ctx: RecruitingContext, prospectId: number, teamId: number): number {
  const p = state.prospects[prospectId];
  if (!p) return 0;
  const t = state.ties[key2(prospectId, teamId)];
  const fit = fitOf(state, ctx, p, teamId);
  return clamp(SCALE * (P('interest.fitWeight') * fit + (t?.impression ?? 0)), 0, SCALE);
}

/** Schools that have touched the prospect this cycle (a tie exists), with true interest, best first. */
export function interestTable(state: RecruitingState, ctx: RecruitingContext, prospectId: number): { teamId: number; interest: number }[] {
  const out: { teamId: number; interest: number }[] = [];
  for (const t of tiesOfProspect(state, prospectId)) out.push({ teamId: t.teamId, interest: trueInterest(state, ctx, prospectId, t.teamId) });
  return out.sort((a, b) => b.interest - a.interest || a.teamId - b.teamId);
}

/** Where a school truly stands, in the staff's words (T4.4.1). Used to draw evidence, never shown. */
export function trueStanding(state: RecruitingState, ctx: RecruitingContext, prospectId: number, teamId: number): StandingWord {
  const table = interestTable(state, ctx, prospectId);
  const i = table.findIndex((r) => r.teamId === teamId);
  if (i < 0) return 'no_real_chance';
  const lead = table[0]!.interest;
  const ours = table[i]!.interest;
  if (i === 0) {
    const second = table[1]?.interest ?? 0;
    return ours - second >= P('word.leadGap') ? 'we_lead' : 'top_group';
  }
  const gap = lead - ours;
  return gap <= P('word.topGap') ? 'top_group' : gap <= P('word.mixGap') ? 'in_the_mix' : gap <= P('word.trailGap') ? 'trailing' : 'no_real_chance';
}

function shift(word: StandingWord, steps: number): StandingWord {
  if (word === 'unknown') return word;
  const i = clamp(STANDING_WORDS.indexOf(word) + steps, 0, STANDING_WORDS.length - 1);
  return STANDING_WORDS[i]!;
}

export function emptyBoard(teamId: number, boardLine: number): Board {
  return { teamId, grades: {}, reads: {}, circles: {}, firmness: {}, academics: {}, boardLine, queue: [], builtClasses: [] };
}

export function boardOf(state: RecruitingState, teamId: number): Board {
  let b = state.boards[teamId];
  if (!b) { b = emptyBoard(teamId, P('board.defaultLine')); state.boards[teamId] = b; }
  return b;
}

function readOf(board: Board, prospectId: number): StaffRead {
  let r = board.reads[prospectId];
  if (!r) { r = { prospectId, teamId: board.teamId, standing: 'unknown', reasons: [], rivals: [], basis: null, asOf: null, evidence: [] }; board.reads[prospectId] = r; }
  return r;
}

/** Add one evidence event and rebuild the read from evidence only (T4.4.1 rules; acceptance 3). */
export function addEvidence(state: RecruitingState, teamId: number, prospectId: number, ev: Evidence): void {
  const r = readOf(boardOf(state, teamId), prospectId);
  r.evidence.push(ev);
  if (ev.signal !== null) { r.standing = ev.signal; r.basis = { kind: ev.kind, day: ev.day }; r.asOf = ev.day; }
  if (ev.reason) {
    r.reasons = r.reasons.filter((x) => x.key !== ev.reason!.key);
    r.reasons.push({ key: ev.reason.key, positive: ev.reason.positive, basis: ev.kind, day: ev.day });
  }
  if (ev.rivalTeamId !== null && !r.rivals.some((x) => x.teamId === ev.rivalTeamId)) r.rivals.push({ teamId: ev.rivalTeamId, basis: ev.kind, day: ev.day });
}

/**
 * What a person in the circle says in a contact (T4.4.1): our standing as he tells it. How openly he
 * speaks depends on his openness and how well he knows the recruiter; a pleaser tells every school what
 * it wants to hear. An AI staff member writing the read adds his own judgement error (K2 evaluation).
 */
export function statement(state: RecruitingState, ctx: RecruitingContext, prospectId: number, teamId: number, listenerId: number, speakerId: number, kind: EvidenceKind, day: number, aiJudgementError: number): Evidence {
  const p = state.prospects[prospectId]!;
  const r = ctx.rng(['read', prospectId, teamId, listenerId, day, speakerId]);
  const truth = trueStanding(state, ctx, prospectId, teamId);
  const familiarity = edgeOf(state, listenerId, speakerId) / SCALE;
  const openness = speakerId === prospectId ? p.openness : P('read.circleOpenness');
  const honest = r.chance(clamp(openness * (P('read.opennessFloor') + (1 - P('read.opennessFloor')) * familiarity), 0, 1));
  let word = truth;
  if (!honest) word = p.pleaser && speakerId === prospectId ? shift(truth, -1) : shift(truth, r.chance(P('half')) ? 1 : -1);
  if (aiJudgementError > 0 && r.chance(aiJudgementError)) word = shift(word, r.chance(P('half')) ? 1 : -1);
  // A reason and a rival, when he says them.
  let reason: Evidence['reason'] = null;
  let rival: number | null = null;
  const member = p.circle.find((m) => m.memberId === speakerId) ?? p.circle[0]!;
  if (r.chance(P('read.reasonShare'))) {
    const top = [...PREFERENCE_KEYS].sort((a, b) => member.prefs[b] - member.prefs[a])[r.int(0, 1)]!;
    reason = { key: top, positive: preferenceScore(state, ctx, p, teamId, member, top) >= P('half') };
  }
  if (r.chance(openness * P('read.rivalShare'))) {
    const leader = interestTable(state, ctx, prospectId).find((x) => x.teamId !== teamId);
    if (leader) rival = leader.teamId;
  }
  return { kind, day, byStaffId: listenerId, signal: word, rivalTeamId: rival, reason };
}

/** Influence in words from evidence (T4.4.2); a trusting high school coach gives an honest picture. */
export function readInfluence(state: RecruitingState, ctx: RecruitingContext, p: Prospect, m: CircleMember, listenerId: number, day: number, honest: boolean): CircleRead {
  const r = ctx.rng(['circle', p.personId, m.memberId, listenerId, day]);
  const words: InfluenceWord[] = ['decides', 'strong_say', 'some_say', 'little_say'];
  let i = m.influence >= P('circle.decidesLine') ? 0 : m.influence >= P('circle.strongLine') ? words.indexOf('strong_say') : m.influence >= P('circle.someLine') ? words.indexOf('some_say') : words.indexOf('little_say');
  if (!honest && r.chance(P('circle.misreadShare'))) i = clamp(i + (r.chance(P('half')) ? 1 : -1), 0, words.length - 1);
  const cares = [...PREFERENCE_KEYS].sort((a, b) => m.prefs[b] - m.prefs[a]).slice(0, Math.round(P('circle.caresShown')));
  return { memberId: m.memberId, relation: m.relation, influence: words[i]!, caresAbout: cares, basis: 'family_says', asOf: day };
}

/** Effect sizes of a contact on relationships and impression (T4.4.1), before weekly diminishing returns. */
export function contactGains(kind: ActionKind): { edge: number; impression: number } {
  switch (kind) {
    case 'call': return { edge: P('edge.call'), impression: P('impression.call') };
    case 'message': return { edge: P('edge.message'), impression: P('impression.message') };
    case 'contact_off_campus': case 'contact_on_campus': return { edge: P('edge.inPerson'), impression: P('impression.inPerson') };
    case 'home_visit': return { edge: P('edge.homeVisit'), impression: P('impression.homeVisit') };
    case 'unofficial_visit': return { edge: P('edge.inPerson'), impression: P('impression.unofficialVisit') };
    case 'camp': return { edge: P('edge.camp'), impression: P('impression.camp') };
    case 'evaluation': case 'official_visit': return { edge: 0, impression: 0 };
  }
}

/** Apply a contact's normal effect: relationships, impression, head coach involvement, evidence (T4.4.1, T4.4.2). */
export function applyContact(
  state: RecruitingState, ctx: RecruitingContext,
  act: { kind: ActionKind; teamId: number; staffId: number; prospectId: number; day: number; withMemberId?: number | undefined },
  opts: { reach: number; aiJudgementError: number },
): void {
  const p = state.prospects[act.prospectId];
  if (!p) return;
  const t = tieOf(state, act.prospectId, act.teamId);
  if (t.recruiterId === null && act.staffId !== ctx.programs.program(act.teamId).headCoachId) t.recruiterId = act.staffId;
  const g = contactGains(act.kind);
  // contactsThisWeek already counts this act (recordUsage ran first): the k-th contact gets decay^(k-1).
  const dim = powInt(P('contact.weeklyDecay'), Math.max(0, t.contactsThisWeek - 1));
  const isHc = ctx.programs.program(act.teamId).headCoachId === act.staffId;
  const hcMult = isHc ? P('contact.headCoachMultiplier') : 1;
  const targets = act.kind === 'home_visit' ? p.circle.filter((m) => m.relation !== 'hs_coach').map((m) => m.memberId)
    : [act.withMemberId ?? act.prospectId];
  for (const id of targets) bumpEdge(state, act.staffId, id, g.edge * dim * opts.reach * hcMult, act.day);
  t.impression = clamp(t.impression + g.impression * dim * opts.reach * hcMult, P('impression.floor'), P('impression.cap'));
  if (isHc && act.kind !== 'message') t.hcInvolvement = clamp(t.hcInvolvement + P('contact.hcInvolvementStep'), 0, 1);
  if (act.kind === 'evaluation') return;
  // Evidence: what was said in the contact, by whom.
  const speaker = act.withMemberId ?? act.prospectId;
  const member = p.circle.find((m) => m.memberId === speaker);
  const kind: EvidenceKind = member?.relation === 'hs_coach' ? 'hs_coach_says' : member && member.relation !== 'self' ? 'family_says' : isHc ? 'said_to_head_coach' : 'said_to_recruiter';
  addEvidence(state, act.teamId, act.prospectId, statement(state, ctx, act.prospectId, act.teamId, act.staffId, speaker, kind, act.day, opts.aiJudgementError));
  // The circle fills as contacts reveal it (T4.4.2): those met, and who decides as the coach tells it.
  const board = boardOf(state, act.teamId);
  const known = board.circles[act.prospectId] ?? [];
  const met = act.kind === 'home_visit' ? p.circle.filter((m) => m.relation !== 'hs_coach') : member ? [member] : [];
  const trusting = member?.relation === 'hs_coach' && edgeOf(state, act.staffId, member.memberId) >= P('circle.hsCoachTrustLine');
  const reveal = trusting ? p.circle : met;
  for (const m of reveal) {
    const read = readInfluence(state, ctx, p, m, act.staffId, act.day, trusting);
    const i = known.findIndex((x) => x.memberId === m.memberId);
    if (i >= 0) known[i] = read; else known.push(read);
  }
  board.circles[act.prospectId] = known;
}

/** Weekly decay of impression and of edges with no contact (T4.4.1 "firmness decays if contact lapses"). */
export function decayWeek(state: RecruitingState): void {
  for (const t of Object.values(state.ties)) t.impression *= P('impression.weeklyRetain');
  for (const e of Object.values(state.edges)) e.strength *= P('edge.weeklyRetain');
}

/** The prospect's circle as the staff knows it. Empty for a staff that has made no contact (T4.4.2 acceptance 3). */
export function circleRead(state: RecruitingState, teamId: number, prospectId: number): readonly CircleRead[] {
  return state.boards[teamId]?.circles[prospectId] ?? [];
}
