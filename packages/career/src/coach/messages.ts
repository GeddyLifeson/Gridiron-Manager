// Decisions are messages (plans/head-coach-nuance.md item 3; E10.4.1 words against deeds, L2.4.2 how messages
// travel, H4.2.3 tone fit). A team-meeting line, a press answer, a discipline call, a depth-chart change and a
// fourth-down choice are all read by the people they touch, each in his own way. Going for it on fourth down says
// "I trust you" to the offense and "I don't" to the defense. A press answer that contradicts last week's
// team-meeting line costs credibility with the room that heard both. Timing matters: the Monday after a loss is
// not Saturday night.
//
// This is the reading rule only. The shared "message" event every system emits waits on the schema change through
// "Integrate: schema, gate and saves (3)"; until then callers build `Message` values themselves. L2.4.2 routing
// through leaders reads `readings` per audience; the E10.4.1 ledger keeps commitments, this keeps what was said.
import { param } from './params.ts';

/** Who reads a message: a unit's rooms, the leaders, the staff, the owner, the press, the opponent's film room. */
export type MessageAudience = 'offense' | 'defense' | 'special_teams' | 'leaders' | 'staff' | 'owner' | 'media' | 'opponent';

export type MessageSource = 'team_meeting' | 'press' | 'discipline' | 'depth_chart' | 'fourth_down' | 'one_on_one';
export type Tone = 'demanding' | 'supportive' | 'neutral';

/** One thing a message says to someone: a stance (+1 for, -1 against) on a topic, towards an audience or a person. */
export interface Claim {
  readonly topic: string;
  readonly stance: 1 | -1;
  readonly towards: MessageAudience;
  /** The person it is about, when it is about one (a starter, a disciplined player). */
  readonly aboutId?: number;
  /** Share of full weight (a kick says less than a go). */
  readonly weight?: number;
}

export interface Message {
  readonly id: string;
  /** Week index in the career and day of the week, 0 Monday to 6 Sunday. */
  readonly week: number;
  readonly day: number;
  readonly source: MessageSource;
  /** Said where anyone can hear it (press, a public decision) or inside the building. */
  readonly public: boolean;
  /** Who heard it first-hand. A public message is heard by everyone. */
  readonly heardBy: readonly MessageAudience[];
  readonly tone: Tone;
  /** The team lost its last game and this is the week after it. */
  readonly afterLoss: boolean;
  readonly claims: readonly Claim[];
}

const ALL: readonly MessageAudience[] = ['offense', 'defense', 'special_teams', 'leaders', 'staff', 'owner', 'media', 'opponent'];

/** Everyone who heard a message. */
export function hearers(m: Message): readonly MessageAudience[] {
  return m.public ? ALL : m.heardBy;
}

/** A fourth-down choice as a message: going trusts the offense and doubts the defense; a kick says the reverse, quietly. */
export function fourthDownMessage(o: { readonly id: string; readonly week: number; readonly day: number; readonly go: boolean; readonly afterLoss?: boolean }): Message {
  const w = o.go ? 1 : param('message.kickShare');
  const s: 1 | -1 = o.go ? 1 : -1;
  return {
    id: o.id, week: o.week, day: o.day, source: 'fourth_down', public: true, heardBy: [], tone: 'neutral', afterLoss: o.afterLoss ?? false,
    claims: [
      { topic: 'trust', stance: s, towards: 'offense', weight: w },
      { topic: 'trust', stance: s === 1 ? -1 : 1, towards: 'defense', weight: w * param('message.otherUnitShare') },
    ],
  };
}

/** H4.2.3 generalised: how well the timing fits the tone. The Monday after a loss and the eve of a game differ. */
export function timingFactor(m: Pick<Message, 'day' | 'tone' | 'afterLoss'>): number {
  if (m.tone === 'neutral') return 1;
  if (m.afterLoss && m.day <= 1) return param(`message.timing.mondayAfterLoss.${m.tone}`);
  if (m.day >= 5) return param(`message.timing.gameEve.${m.tone}`);
  return 1;
}

/** Trust change in each audience the message speaks to (claims towards it), scaled by timing. */
export function readings(m: Message): Partial<Record<MessageAudience, number>> {
  const heard = new Set(hearers(m));
  const out: Partial<Record<MessageAudience, number>> = {};
  const t = timingFactor(m);
  for (const c of m.claims) {
    if (!heard.has(c.towards)) continue;
    out[c.towards] = (out[c.towards] ?? 0) + c.stance * (c.weight ?? 1) * param('message.readTrust') * t;
  }
  return out;
}

export interface Contradiction {
  readonly earlier: string;
  readonly later: string;
  readonly topic: string;
  readonly towards: MessageAudience;
  readonly aboutId: number | null;
  /** One said inside the building and the other outside. */
  readonly publicPrivate: boolean;
  /** Audiences that heard both. */
  readonly heardBoth: readonly MessageAudience[];
}

/**
 * Pairs of messages within the window that take opposite stances on the same topic towards the same audience
 * (and the same person, when about one). Messages are taken in order of week, day and id.
 */
export function contradictions(messages: readonly Message[]): Contradiction[] {
  const win = param('message.windowWeeks');
  const ms = [...messages].sort((a, b) => a.week - b.week || a.day - b.day || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: Contradiction[] = [];
  for (let j = 0; j < ms.length; j++) {
    for (let i = 0; i < j; i++) {
      const a = ms[i]!, b = ms[j]!;
      if (b.week - a.week > win) continue;
      for (const ca of a.claims) for (const cb of b.claims) {
        if (ca.topic !== cb.topic || ca.towards !== cb.towards || (ca.aboutId ?? null) !== (cb.aboutId ?? null) || ca.stance === cb.stance) continue;
        const hb = new Set(hearers(b));
        const heardBoth = hearers(a).filter((x) => hb.has(x));
        if (heardBoth.length === 0) continue;
        out.push({ earlier: a.id, later: b.id, topic: ca.topic, towards: ca.towards, aboutId: ca.aboutId ?? null, publicPrivate: a.public !== b.public, heardBoth });
      }
    }
  }
  return out;
}

/** Trust each audience loses over a set of contradictions (E10.4.1 rule 3: a small L1 trust event per witness). */
export function contradictionCost(cs: readonly Contradiction[]): Partial<Record<MessageAudience, number>> {
  const out: Partial<Record<MessageAudience, number>> = {};
  for (const c of cs) {
    const size = param('message.contradictionTrust') * (c.publicPrivate ? param('message.publicPrivateScale') : 1);
    for (const a of c.heardBoth) out[a] = (out[a] ?? 0) - size;
  }
  return out;
}
