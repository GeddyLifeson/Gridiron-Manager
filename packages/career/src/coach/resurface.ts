// Resurfacing (E11.3.1): wherever a subject appears, its notes appear beside it without being asked.
// Matching is by subject id, exact, so a note on a coordinator follows him when he becomes a head
// coach elsewhere (rule 1). The panel stores nothing, never alters a note and never says whether a
// note is true (rules 5, acceptance 3). Old notes are never hidden or decayed (rule 4).
import { param } from './params.ts';
import { dayOrder, type WorldDay } from './philosophy.ts';
import { subjectKey, type Note, type Notebook, type Subject } from './notebook.ts';

/** What the world says about staffs, read through the caller (G-25 positions, G-22 history). */
export interface StaffLookup {
  /** People on a team's staff in a season who are resurfaced with it: head coach and coordinators (H2). */
  staffOf(teamId: number, seasonYear: number): readonly number[];
  /** Teams a person was on the staff of, by season (for "written about his old team", rule 2). */
  staffSeasonsOf(personId: number): readonly { readonly teamId: number; readonly seasonYear: number }[];
}

export type Surface =
  | 'scouting'     // game week: opponent team, its head coach and coordinators (H2)
  | 'crew'         // the crew announced for the game (I1)
  | 'person_page'  // any person's page or card (O4)
  | 'film'         // a play, concept or situation in film review or the decision log (N1, N3, G7)
  | 'job'          // an opening: team, owner, decision maker (E2.3.3)
  | 'game_day';    // the sideline tab: pinned notes only, current opponent and crew (O2)

export interface ResurfaceRequest {
  readonly surface: Surface;
  /** Subjects present on the screen. */
  readonly subjects: readonly Subject[];
  readonly now: WorldDay;
  /** The job he holds now, to say "when he was at another club" for old notes. */
  readonly currentTeamId: number | null;
}

export type MatchReason = 'direct' | 'staff_of_team' | 'old_team';

export interface PanelItem {
  /** The note exactly as written: the same object, never altered. */
  readonly note: Note;
  readonly reason: MatchReason;
  /** The subject that matched. */
  readonly via: Subject;
  /** Plain-words age for notes older than the limit (rule 4), else null. */
  readonly age: { readonly key: string; readonly seasons: number } | null;
}

export interface Panel {
  readonly items: readonly PanelItem[];
  /** How many more match beyond those shown ("more"). */
  readonly more: number;
  readonly total: number;
}

function ageOf(note: Note, req: ResurfaceRequest): PanelItem['age'] {
  const seasons = req.now.seasonYear - note.season;
  if (seasons <= param('oldNoteSeasons')) return null;
  const otherClub = note.authorJob.teamId !== req.currentTeamId;
  return { key: otherClub ? 'note.age.seasons_ago_other_club' : 'note.age.seasons_ago', seasons };
}

/** Index of notes by subject key, built once per notebook and reused across screens. */
export function indexNotes(nb: Notebook): ReadonlyMap<string, readonly Note[]> {
  const idx = new Map<string, Note[]>();
  for (const n of nb.notes) for (const s of n.subjects) {
    const k = subjectKey(s);
    const list = idx.get(k);
    if (list) list.push(n); else idx.set(k, [n]);
  }
  return idx;
}

/**
 * The "Your notes" panel for a screen. Order: pinned first, then newest; at most the shown limit before
 * "more" (rule 3). Game day shows pinned notes only (acceptance 2).
 */
export function resurface(nb: Notebook, req: ResurfaceRequest, staff: StaffLookup, idx: ReadonlyMap<string, readonly Note[]> = indexNotes(nb)): Panel {
  const found = new Map<number, PanelItem>();
  const addAll = (s: Subject, reason: MatchReason) => {
    for (const n of idx.get(subjectKey(s)) ?? []) if (!found.has(n.id)) found.set(n.id, { note: n, reason, via: s, age: ageOf(n, req) });
  };
  // Direct matches first, so a note found directly keeps reason "direct".
  for (const s of req.subjects) addAll(s, 'direct');
  // An opponent team brings its head coach and coordinators, with notes written when they were elsewhere.
  const expandsTeams = req.surface === 'scouting' || req.surface === 'game_day' || req.surface === 'job';
  if (expandsTeams) {
    for (const s of req.subjects) if (s.type === 'team' && typeof s.id === 'number') {
      for (const p of staff.staffOf(s.id, req.now.seasonYear)) addAll({ type: 'person', id: p }, 'staff_of_team');
    }
  }
  // Rule 2: a note on a team is offered when a coach who was on that staff that season appears.
  for (const s of req.subjects) if (s.type === 'person' && typeof s.id === 'number') {
    for (const { teamId, seasonYear } of staff.staffSeasonsOf(s.id)) {
      for (const n of idx.get(subjectKey({ type: 'team', id: teamId })) ?? []) {
        if (n.season === seasonYear && !found.has(n.id)) found.set(n.id, { note: n, reason: 'old_team', via: s, age: ageOf(n, req) });
      }
    }
  }
  let items = [...found.values()];
  if (req.surface === 'game_day') items = items.filter((i) => i.note.pinned);
  items.sort((a, b) => Number(b.note.pinned) - Number(a.note.pinned) || dayOrder(b.note.created.world, a.note.created.world) || b.note.id - a.note.id);
  const shown = param('resurfaceShown');
  return { items: items.slice(0, shown), more: Math.max(0, items.length - shown), total: items.length };
}
