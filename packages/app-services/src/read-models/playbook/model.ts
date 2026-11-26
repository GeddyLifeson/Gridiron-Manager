// Playbook library read model (G-67 screens; O3.3.1 over G3 and G4). Builds the dense table, the section
// tree, the family view with its gaps, the word list with its warnings, the size report and the lock
// state of every control from the team's book. Readiness is the staff's estimate (G5.4.1), never truth.
import { playbook as pb } from '@gm/football-content';
import type { PlaybookFilter, PlaybookView, PlaybookRow, PlaybookLocks, PlaybookFamily, PlaybookWord, PlaybookOption } from './types.ts';

/** Call records (N3): average result and sample size per play, when the host has them. */
export interface CallRecord { readonly avgResult: number; readonly sample: number }

export interface PlaybookInput {
  readonly teamId: number;
  readonly side: pb.Book;
  readonly book: pb.Playbook;
  readonly words: pb.WordList;
  readonly template: pb.Template;
  readonly holder: pb.Holder;
  readonly usage: (playId: string) => pb.PlayUsage | undefined;
  readonly records?: (playId: string) => CallRecord | undefined;
  readonly links?: readonly pb.RoleLink[];
  readonly size?: pb.SizeInputs;
  /** Coach-to-player cutoff from the rule set (radioRules), for latest-start times. */
  readonly cutoffS: number | null;
  readonly filter?: PlaybookFilter;
}

const word = (words: pb.WordList, id: string | undefined): string => (id ? words.entries.get(id)?.word ?? id : '');

const ACTIONS: readonly pb.PlaybookAction[] = ['view', 'draft_play', 'edit_group_coaching_points', 'edit_side_playbook', 'build_plan_and_sheet', 'approve', 'draw_scout_cards'];

export function locksFor(holder: pb.Holder, side: pb.Book): PlaybookLocks {
  const out: Record<string, { allowed: boolean; heldBy: string | null; suggest: boolean }> = {};
  for (const a of ACTIONS) {
    const r = pb.access(holder, a, side);
    out[a] = r.allowed ? { allowed: true, heldBy: null, suggest: false } : { allowed: false, heldBy: r.heldBy, suggest: r.suggest };
  }
  return out as PlaybookLocks;
}

function filters(f: PlaybookFilter | undefined, side: pb.Book): pb.Filters {
  return {
    book: side,
    formation: f?.formation ?? undefined, concept: f?.concept ?? undefined, personnel: f?.personnel ?? undefined,
    role: (f?.role ?? undefined) as pb.Role | undefined, situation: f?.situation ?? undefined, status: (f?.status ?? undefined) as pb.PlayStatus | undefined,
    readinessAtLeast: f?.readinessAtLeast ?? undefined, includeRetired: f?.includeRetired ?? false, text: f?.text || undefined,
  };
}

function rowOf(inp: PlaybookInput, play: pb.PlayEntry): PlaybookRow {
  const r = pb.renderCall(inp.book, inp.words, inp.template, { playId: play.id, tags: [] });
  const w = pb.lengthWarning(r, inp.words, inp.cutoffS, false);
  const u = inp.usage(play.id);
  const rec = inp.records?.(play.id);
  return {
    id: play.id, call: r.text, family: pb.familyKey(play), section: play.section.join('/'),
    personnel: word(inp.words, play.parts.personnel), formation: word(inp.words, play.parts.formation ?? play.parts.front),
    concept: word(inp.words, play.parts.concept ?? play.parts.run ?? play.parts.coverage ?? play.parts.scheme),
    protection: word(inp.words, play.parts.protection ?? play.parts.pressure), tags: play.tags.map((t) => word(inp.words, t)),
    status: play.status, role: play.role, readinessEstimate: u?.readinessEstimate ?? null, called: u?.called ?? 0, lastCalledWeek: u?.lastCalledWeek ?? null,
    avgResult: rec && rec.sample > 0 ? rec.avgResult : null, sample: rec?.sample ?? 0,
    lengthS: Math.round(w.lengthS * 100) / 100, words: w.words, overLimit: w.overSeconds || w.overWords, latestStartS: w.latestStartS === null ? null : Math.round(w.latestStartS * 10) / 10,
  };
}

function familyView(inp: PlaybookInput): PlaybookFamily[] {
  const links = inp.links ?? [];
  return pb.families(inp.book, inp.filter?.includeRetired ?? false)
    .filter((f) => f.plays.some((id) => inp.book.plays.get(id)?.book === inp.side))
    .map((f) => {
      const bases = f.plays.filter((id) => inp.book.plays.get(id)?.role === 'base');
      const gaps = bases.filter((id) => !links.some((l) => l.base === id && inp.book.plays.get(l.answer)?.role === 'complement'));
      return { key: f.key, plays: [...f.plays], gaps };
    });
}

function wordView(inp: PlaybookInput): PlaybookWord[] {
  const problems = pb.checkWords(inp.words, [['audible', 'check'], ['audible', 'dummy']]);
  const used = new Map<string, number>();
  for (const p of inp.book.plays.values()) if (p.status !== 'retired') for (const id of pb.partIdsOf(p)) used.set(id, (used.get(id) ?? 0) + 1);
  return [...inp.words.entries.values()].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.word < b.word ? -1 : 1)).map((e) => ({
    partId: e.partId, type: e.type, word: e.word, syllables: pb.syllablesOf(e), usedBy: used.get(e.partId) ?? 0,
    duplicate: problems.some((p) => p.kind === 'duplicate' && (p.a === e.partId || p.b === e.partId)),
    soundsLike: problems.filter((p) => p.kind === 'confusion' && (p.a === e.partId || p.b === e.partId)).map((p) => (p.a === e.partId ? p.b : p.a)),
  }));
}

function optionsOf(inp: PlaybookInput): PlaybookView['options'] {
  const pick = (slots: readonly pb.CallSlot[]): PlaybookOption[] => {
    const ids = new Set<string>();
    for (const p of inp.book.plays.values()) if (p.book === inp.side && p.status !== 'retired') for (const k of slots) { const id = p.parts[k]; if (id) ids.add(id); }
    return [...ids].map((id) => ({ id, word: word(inp.words, id) })).sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
  };
  return { formation: pick(['formation']), concept: pick(['concept', 'run', 'coverage']), personnel: pick(['personnel']) };
}

/** Build the library view (O3.3.1). Filters return exactly what the G3.5.1 search returns. */
export function buildPlaybookView(inp: PlaybookInput): PlaybookView {
  const parse = pb.buildIndex(inp.book, inp.words, inp.template);
  const ix = pb.buildSearchIndex(inp.book, inp.words, parse);
  const hits = pb.search(ix, filters(inp.filter, inp.side), inp.usage);
  const sectionCounts = new Map<string, number>();
  for (const p of inp.book.plays.values()) if (p.book === inp.side && (inp.filter?.includeRetired || p.status !== 'retired')) sectionCounts.set(p.section.join('/'), (sectionCounts.get(p.section.join('/')) ?? 0) + 1);
  const size = inp.size ? pb.sizeReport(inp.book, inp.size, inp.side) : null;
  return {
    teamId: inp.teamId, side: inp.side,
    sections: [...sectionCounts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, count]) => ({ key, count })),
    rows: hits.map((p) => rowOf(inp, p)),
    total: [...inp.book.plays.values()].filter((p) => p.book === inp.side).length,
    families: familyView(inp),
    words: wordView(inp),
    size: size ? { readinessCeiling: size.readinessCeiling, upkeep: round(size.upkeep), capacity: round(size.capacity), warning: size.warning, warnings: [...size.warnings], sectionUpkeep: size.sectionUpkeep.map((s) => ({ section: s.section, units: round(s.units), share: round(s.share) })) } : null,
    locks: locksFor(inp.holder, inp.side),
    filter: inp.filter ?? {},
    options: optionsOf(inp),
  };
}

const round = (x: number) => Math.round(x * 100) / 100;
