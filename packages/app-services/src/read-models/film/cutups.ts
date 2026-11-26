// Building and sharing a cut-up (N1.2.2). A reel is an ordered list of play references with notes and
// an audience. It keeps working after its season is archived: it holds ids, not copies.
import { param } from './params.ts';
import type { FilmLibrary, ReelTemplate } from './library.ts';
import type { CutUp } from './schemas.ts';

export type Audience = CutUp['audience'];

export function buildCutUp(lib: FilmLibrary, id: string, title: string, playIds: readonly string[], notes: Readonly<Record<string, string>> = {}, audience: Audience = { kind: 'none', id: null }): CutUp {
  const ids = playIds.filter((p, i) => playIds.indexOf(p) === i);
  return {
    id, title, playIds: ids,
    notes: Object.fromEntries(Object.entries(notes).filter(([k]) => ids.includes(k))),
    audience,
    unchartedPlays: lib.unchartedCount(ids),
    overAttention: ids.length > param('cutup.attentionPlays'),
  };
}

/** A standard reel for a team: instant on own film; uncharted opponent plays are counted (N1.2.2). */
export function reelFromTemplate(lib: FilmLibrary, t: ReelTemplate, teamId: number, id = `${t.id}:${teamId}`): CutUp {
  return buildCutUp(lib, id, t.title, lib.query(t.filter(teamId)).map((r) => r.playId));
}

export function sendCutUp(c: CutUp, audience: Audience): CutUp { return { ...c, audience }; }

/** What a meeting reads from a reel it is shown (H4): the concepts on it, for the knowledge gain rules there. */
export function reelConcepts(lib: FilmLibrary, c: CutUp): string[] {
  const out = new Set<string>();
  for (const id of c.playIds) { const v = lib.get(id)?.coaching.values.concept; if (v) out.add(v); }
  return [...out].sort();
}
