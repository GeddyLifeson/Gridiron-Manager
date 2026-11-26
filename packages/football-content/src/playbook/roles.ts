// G3.2.1 base, complement, constraint: role links, the playbook review, and the booth's reaction report.
// Roles are the user's labels; nothing here changes simulation.
import { param } from './params.ts';
import type { PlayEntry, Playbook, PlayUsage, Role } from './types.ts';

/** A link: the base play, the defensive reaction it draws, and the answer play that punishes it. */
export interface RoleLink { readonly base: string; readonly reaction: string; readonly answer: string }

/** Role history per play: (season, role) pairs, so a base play can become a constraint later (edge case). */
export type RoleHistory = ReadonlyMap<string, readonly { readonly season: number; readonly role: Role }[]>;

export function recordRole(history: RoleHistory, playId: string, season: number, role: Role): RoleHistory {
  const next = new Map(history);
  const list = [...(next.get(playId) ?? [])].filter((r) => r.season !== season);
  list.push({ season, role });
  list.sort((a, b) => a.season - b.season);
  next.set(playId, list);
  return next;
}

export function addLink(book: Playbook, links: readonly RoleLink[], link: RoleLink): RoleLink[] {
  const base = book.plays.get(link.base);
  const answer = book.plays.get(link.answer);
  if (!base || !answer) throw new Error(`link names a play not in the book (${link.base}, ${link.answer})`);
  if (base.role !== 'base') throw new Error(`${link.base} is ${base.role}, not base`);
  if (answer.role !== 'complement' && answer.role !== 'constraint') throw new Error(`${link.answer} is ${answer.role}; answers are complements or constraints`);
  if (!link.reaction.trim()) throw new Error('a link names the defensive reaction it punishes');
  if (links.some((l) => l.base === link.base && l.answer === link.answer && l.reaction === link.reaction)) return [...links];
  return [...links, link];
}

export interface Review {
  readonly baseWithoutComplement: readonly string[];
  readonly reactionsWithoutAnswer: readonly { readonly base: string; readonly reaction: string }[];
  readonly constraintsNeverCalled: readonly string[];
  /** Share of shot plays in the plan, and whether it is above the review threshold. */
  readonly shotShare: number;
  readonly shotFlag: boolean;
}

/**
 * The playbook review (G3.2.1). `reactions` lists reactions the user (or self-scout, G8) expects against a
 * base play; one with no linked answer is reported. `plan` is the plan's play ids for the shot share.
 */
export function review(book: Playbook, links: readonly RoleLink[], usage: (id: string) => PlayUsage | undefined, reactions: readonly { readonly base: string; readonly reaction: string }[] = [], plan: readonly string[] = []): Review {
  const live = [...book.plays.values()].filter((p) => p.status !== 'retired');
  const baseWithoutComplement = live.filter((p) => p.role === 'base' && !links.some((l) => l.base === p.id && book.plays.get(l.answer)?.role === 'complement')).map((p) => p.id).sort();
  const reactionsWithoutAnswer = reactions.filter((r) => !links.some((l) => l.base === r.base && l.reaction === r.reaction));
  const games = param('roles.constraintNeverCalledGames');
  const constraintsNeverCalled = live.filter((p) => p.role === 'constraint' && p.status === 'installed').filter((p) => {
    const u = usage(p.id);
    return !!u && u.called === 0 && u.gamesInstalled >= games;
  }).map((p) => p.id).sort();
  const planPlays = plan.map((id) => book.plays.get(id)).filter((p): p is PlayEntry => !!p);
  const shots = planPlays.filter((p) => p.role === 'shot').length;
  const shotShare = planPlays.length ? shots / planPlays.length : 0;
  return { baseWithoutComplement, reactionsWithoutAnswer, constraintsNeverCalled, shotShare, shotFlag: shotShare > param('roles.shotShareMax') };
}

/** What the booth saw on one call of a base play: the reactions observed (I7). */
export interface CallObservation { readonly playId: string; readonly reactions: readonly string[] }

/**
 * Booth reaction report (G3.2.1): a reaction is reported when it was seen on at least `roles.reactionSeen`
 * of the last `roles.reactionWindow` calls of the linked base play. Returns the answer plays to highlight,
 * as reminders only.
 */
export function boothReport(links: readonly RoleLink[], history: readonly CallObservation[]): { readonly base: string; readonly reaction: string; readonly answers: readonly string[]; readonly seen: number }[] {
  const recent = param('roles.reactionWindow');
  const need = param('roles.reactionSeen');
  const out: { base: string; reaction: string; answers: string[]; seen: number }[] = [];
  const bases = [...new Set(links.map((l) => l.base))].sort();
  for (const base of bases) {
    const calls = history.filter((h) => h.playId === base).slice(-recent);
    const reactions = [...new Set(links.filter((l) => l.base === base).map((l) => l.reaction))].sort();
    for (const reaction of reactions) {
      const seen = calls.filter((c) => c.reactions.includes(reaction)).length;
      if (seen >= need) out.push({ base, reaction, seen, answers: links.filter((l) => l.base === base && l.reaction === reaction).map((l) => l.answer).sort() });
    }
  }
  return out;
}
