// Sideline information flow (I7.2.1, I7.2.3, I7.5.1, O2.1.3, I6.3) with the coach's own delay (E7.4.2).
// A message reaches the coach when the speaker has worked it out (his latency, by skill, from K6) plus the
// seconds the coach's tiredness adds. Full text comes only from his current headset channel and from the
// people beside him on the bench; other channels show a headline count. One line at a time: higher
// priority replaces lower, and a replaced message waits unread in the list.
import { param } from './params.ts';
import { CHANNELS, type CoachInput, type InjuryReportInput, type InjuryRowView, type LiveGameInput, type MessageView, type SidelineMessage, type SidelineView } from './types.ts';

/** Real second the coach takes the message in. */
export const arrivalS = (m: { producedAtS: number; latencyS: number }, coach: Pick<CoachInput, 'infoDelayS'>): number =>
  m.producedAtS + m.latencyS + coach.infoDelayS;

const audible = (m: SidelineMessage, coach: CoachInput) => m.channel === 'sideline' || m.channel === coach.channel;

/** Clip to one line (O2.1.3). The full text stays in the list. */
export function clip(text: string, max = param('game_management.booth_line_chars')): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function buildSideline(live: LiveGameInput, messages: readonly SidelineMessage[], coach: CoachInput): SidelineView {
  const read = new Set(coach.read);
  const arrived = messages
    .map((m) => ({ m, at: arrivalS(m, coach) }))
    .filter((x) => x.at <= live.realTimeS)
    .sort((a, b) => b.at - a.at || (a.m.id < b.m.id ? -1 : 1));
  const view = (m: SidelineMessage): MessageView => ({
    id: m.id, channel: m.channel, kind: m.kind, speakerRole: m.speakerRole, speakerName: m.speakerName, text: m.text,
    ageInPlays: m.aboutPlay === null ? null : Math.max(0, live.playIndex - m.aboutPlay), read: read.has(m.id),
  });
  const heard = arrived.filter((x) => audible(x.m, coach));
  let line: SidelineView['line'] = null;
  let best: { m: SidelineMessage; at: number } | null = null;
  for (const x of heard) if (!read.has(x.m.id) && (best === null || x.m.priority > best.m.priority)) best = x; // newest first, so ties keep the latest
  if (best) line = { ...view(best.m), clipped: clip(best.m.text) };
  const headlines = CHANNELS.filter((c) => c !== coach.channel)
    .map((c) => ({ channel: c, count: arrived.filter((x) => x.m.channel === c && !read.has(x.m.id)).length }))
    .filter((h) => h.count > 0);
  return {
    channel: coach.channel,
    line,
    list: heard.slice(0, param('game_management.message_list')).map((x) => view(x.m)),
    headlines,
    infoDelayS: coach.infoDelayS,
  };
}

/** The injury list tab: the trainer's latest word that has reached the coach, per player (I7.2.3, I6.3). */
export function buildInjuries(live: LiveGameInput, reports: readonly InjuryReportInput[], coach: CoachInput): InjuryRowView[] {
  const latest = new Map<number, { r: InjuryReportInput; at: number }>();
  for (const r of reports) {
    const at = arrivalS(r, coach);
    if (at > live.realTimeS) continue;
    const cur = latest.get(r.playerId);
    if (!cur || r.revision > cur.r.revision) latest.set(r.playerId, { r, at });
  }
  return [...latest.values()]
    .sort((a, b) => b.at - a.at || a.r.playerId - b.r.playerId)
    .map(({ r }) => ({ playerId: r.playerId, name: r.name, position: r.position, bodyPart: r.bodyPart, word: r.word, revised: r.revision > 0, replacedBy: r.replacedBy }));
}
