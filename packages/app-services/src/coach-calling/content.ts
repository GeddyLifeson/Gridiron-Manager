// The playbook as the AI coordinators read it (K4, K3 over G1, G2, G3). Every play and defensive call of the
// full content set (WP-25: the 12 starter plays and 8 starter calls plus 26 plays and 9 calls) becomes a K4
// sheet call and a K3 call option. coach-ai may not import football-content (P1.2.1), so the mapping lives
// here, in a layer that may import both. Nothing here holds an outcome number: the payoffs are the coach's
// estimates, made by K3 preparation, never by content (G1.1.1).
import { calling, preparation } from '@gm/coach-ai';
import { full } from '@gm/football-content';
import { tendencies } from '@gm/models';
import type { CoverageFamily, OffensePlayKind } from '@gm/schema';

type PlayDef = (typeof full.FULL_PLAYS)[number];
type DefenseDef = (typeof full.FULL_DEFENSE)[number];
type SheetCall = calling.SheetCall;
type CallTags = calling.CallTags;
type CallOption = preparation.CallOption;
type PersonnelKey = NonNullable<SheetCall['personnel']>;

/** Kinds that throw the ball forward by design. An RPO may hand off, so it carries its own tag and not `pass`. */
const PASS_KINDS: ReadonlySet<OffensePlayKind> = new Set(['dropback_pass', 'quick_pass', 'play_action', 'movement_pass', 'screen']);
/** Coverage families that are man at the snap (F10.1). Two-man is man under two deep halves. */
const MAN_FAMILIES: ReadonlySet<CoverageFamily> = new Set(['cover0', 'cover1', 'two_man']);
/** Coverage families with two deep safeties (F10.1): Cover 2, Cover 4 (quarters), Cover 6 and two-man. */
const TWO_HIGH_FAMILIES: ReadonlySet<CoverageFamily> = new Set(['cover2', 'cover4', 'cover6', 'two_man']);
const PERSONNEL_KEYS: ReadonlySet<string> = new Set(['p10', 'p11', 'p12', 'p13', 'p21', 'p22']);

/** G1.1.1 personnel code ("11") to the profile's grouping key; any other grouping is 'other'. */
export function personnelKey(code: string): PersonnelKey {
  const k = `p${code}`;
  return (PERSONNEL_KEYS.has(k) ? k : 'other') as PersonnelKey;
}

/** The content the AI reads: every offensive play and defensive call by id. */
export interface ContentBook {
  readonly plays: ReadonlyMap<string, PlayDef>;
  readonly defense: ReadonlyMap<string, DefenseDef>;
}

/** The full content set (WP-25). Starter ids are kept, so a sheet written against the starter set still resolves. */
export function contentBook(): ContentBook {
  return {
    plays: new Map(full.FULL_PLAYS.map((p) => [p.id, p])),
    defense: new Map(full.FULL_DEFENSE.map((d) => [d.id, d])),
  };
}

/** Pressure as the charter counts it (N2.3.1, the models `chart.pressureRushers` mark). */
export function isPressure(def: DefenseDef): boolean { return tendencies.isPressure(def.rushers) === true; }

/** What a charter logs for a defensive call (G-74 `defenseLook`): the coverage family, with pressure marked. */
export function defenseLookClass(def: DefenseDef): string { return isPressure(def) ? `${def.coverageFamily}+pressure` : def.coverageFamily; }

/** K4.3.7 tags of an offensive play, read from its kind and intent. */
export function offenseTags(play: PlayDef): CallTags {
  const t: { -readonly [K in keyof CallTags]: CallTags[K] } = {};
  if (PASS_KINDS.has(play.kind)) t.pass = true;
  if (play.kind === 'play_action') t.playAction = true;
  if (play.kind === 'screen') t.screen = true;
  if (play.kind === 'rpo') t.rpo = true;
  if (play.intent === 'shot') t.deepShot = true;
  return t;
}

/** K4.3.7 tags of a defensive call, read from its coverage family, rushers and who rushes. */
export function defenseTags(def: DefenseDef): CallTags {
  const t: { -readonly [K in keyof CallTags]: CallTags[K] } = {};
  if (isPressure(def)) t.blitz = true;
  // Simulated pressure (F9): fewer than the pressure mark rush, but a second-level defender is one of them.
  else if (def.slots.some((s) => s.behavior === 'blitz')) t.simulatedPressure = true;
  if (MAN_FAMILIES.has(def.coverageFamily)) t.man = true;
  if (TWO_HIGH_FAMILIES.has(def.coverageFamily)) t.twoHigh = true;
  return t;
}

export interface SheetCallOpts { readonly planWeight?: number; readonly tempoMenu?: boolean }

/**
 * A play as a K4 sheet call. Its look class is the play's content id, which is what a team's own charting
 * logs as the concept (models `tendencies` record: `concept = playContentId`).
 */
export function offenseSheetCall(play: PlayDef, o: SheetCallOpts = {}): SheetCall {
  return { callId: play.id, lookClass: play.id, tags: offenseTags(play), personnel: personnelKey(play.personnel), planWeight: o.planWeight ?? 1, tempoMenu: o.tempoMenu ?? true };
}

export function defenseSheetCall(def: DefenseDef, o: SheetCallOpts = {}): SheetCall {
  return { callId: def.id, lookClass: defenseLookClass(def), tags: defenseTags(def), personnel: null, planWeight: o.planWeight ?? 1, tempoMenu: o.tempoMenu ?? true };
}

/** A sheet call for any content id, or null when the book has no such play or call. */
export function sheetCallOf(book: ContentBook, callId: string, o: SheetCallOpts = {}): SheetCall | null {
  const p = book.plays.get(callId);
  if (p) return offenseSheetCall(p, o);
  const d = book.defense.get(callId);
  return d ? defenseSheetCall(d, o) : null;
}

/** Tag words a K3 call option carries (the K4.3.7 tag names that are true). */
const tagWords = (t: CallTags): string[] => Object.entries(t).filter(([, v]) => v === true).map(([k]) => k).sort();

/**
 * K3 call options for the planner (G-74 `CallOption`). The concept family, the row of the K3 prior table, is
 * the play's G1.1.1 kind for offense and the coverage family (pressure marked) for defense until the concept
 * family table exists (G-74 PriorTable, content build not done). Readiness and carry-over are the staff's
 * estimates and come in from the week (G5.4.1, G5.3.2); `fits` is null (any situation) because content has no
 * situation list yet, only an intent word.
 */
export function callOptions(book: ContentBook, readiness: (callId: string) => number = () => 1, carryOver: (callId: string) => boolean = () => false): CallOption[] {
  const out: CallOption[] = [];
  for (const p of book.plays.values()) {
    out.push({ callId: p.id, unit: 'offense', conceptFamily: p.kind, kind: p.kind, tags: tagWords(offenseTags(p)), fits: null, readiness: readiness(p.id), carryOver: carryOver(p.id), pairings: [] });
  }
  for (const d of book.defense.values()) {
    out.push({ callId: d.id, unit: 'defense', conceptFamily: defenseLookClass(d), kind: d.coverageFamily, tags: tagWords(defenseTags(d)), fits: null, readiness: readiness(d.id), carryOver: carryOver(d.id), pairings: [] });
  }
  return out;
}

/**
 * Which sheet calls fit a K5 order (`joinK5` fits). Kneel and spike are the content kinds. A call that
 * cannot end in an incompletion is one with no designed forward pass (B5: an incomplete pass needs a
 * forward pass). Staying in bounds is read as a run aimed between the tackles, a kneel or a draw: an
 * Assumption (DECISIONS.md), since the content has no sideline tag.
 */
export function contentFits(book: ContentBook): calling.CallFits {
  const kind = (c: SheetCall): OffensePlayKind | null => book.plays.get(c.callId)?.kind ?? null;
  const noForwardPass = (c: SheetCall) => { const k = kind(c); return k === 'run' || k === 'draw' || k === 'qb_run' || k === 'kneel'; };
  const inside = (c: SheetCall) => {
    const p = book.plays.get(c.callId);
    if (!p) return false;
    return p.kind === 'kneel' || p.kind === 'draw' || ((p.kind === 'run' || p.kind === 'qb_run') && (p.runDirection === 'middle' || p.runDirection === null));
  };
  return {
    kneel: (c) => kind(c) === 'kneel',
    spike: (c) => kind(c) === 'spike',
    constraint: { avoid_incompletion: noForwardPass, stay_in_bounds: inside },
  };
}
