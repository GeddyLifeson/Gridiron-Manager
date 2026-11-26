// The starting playbook built from the WP-15 starter content: every starter play and defensive call becomes
// a book entry with shared parts. Words are the starter content's own names (their sources are in
// starter/sources.ts); "Kill" is the sourced kill word (G4.6.1, Verified). Per-family word sets for a full
// book arrive with the full content set (WP-25) and the glossary links (G-93).
import { STARTER, FORMATION_BY_ID, type DefenseDef, type PlayDef, type Slot } from '../starter/index.ts';
import { addPlay, emptyBook, withParts } from './library.ts';
import type { LookSlot, Part, PlayEntry, Playbook } from './types.ts';

const SECTION_OF_KIND: Readonly<Record<PlayDef['kind'], string>> = {
  run: 'run', draw: 'run', qb_run: 'run', dropback_pass: 'dropback', quick_pass: 'quick', play_action: 'play_action',
  movement_pass: 'movement', screen: 'screen', rpo: 'rpo', trick: 'trick',
  // Clock plays (kneel, spike) live with the two-minute and end-of-game calls.
  kneel: 'two_minute', spike: 'two_minute',
};

/** Short formation words from the starter formation names (F2). */
const FORMATION_WORD: Readonly<Record<string, string>> = {
  gun_2x2_11: 'Gun Doubles', gun_trips_right_11: 'Gun Trips', uc_singleback_11: 'Singleback', uc_i_form_21: 'I Form',
};

/** The teaching part of each starter play: its run scheme or pass concept, named as the starter names it. */
const TEACHING: Readonly<Record<string, { readonly type: 'run' | 'concept'; readonly content: string; readonly word: string; readonly protection?: { readonly content: string; readonly word: string; readonly isDefault?: boolean }; readonly tags?: readonly { readonly content: string; readonly word: string }[] }>> = {
  run_inside_zone_right: { type: 'run', content: 'insideZone', word: 'Inside Zone' },
  dropback_four_verticals: { type: 'concept', content: 'fourVerticals', word: 'Four Verticals', protection: { content: 'baseDropback', word: 'Base', isDefault: true } },
  quick_stick: { type: 'concept', content: 'stick', word: 'Stick', protection: { content: 'baseDropback', word: 'Base', isDefault: true } },
  play_action_deep_cross: { type: 'concept', content: 'playActionDeepCross', word: 'Deep Cross', protection: { content: 'sevenManPlayAction', word: 'Seven Man' } },
  movement_boot_flood: { type: 'concept', content: 'bootFlood', word: 'Flood', protection: { content: 'bootleg', word: 'Boot' } },
  screen_slow_rb: { type: 'concept', content: 'slowScreen', word: 'Slow Screen' },
  rpo_zone_bubble: { type: 'run', content: 'insideZone', word: 'Inside Zone', tags: [{ content: 'bubble', word: 'Bubble' }] },
  draw_rb: { type: 'run', content: 'draw', word: 'Draw' },
  qb_zone_read: { type: 'run', content: 'zoneRead', word: 'Zone Read' },
  trick_flea_flicker: { type: 'concept', content: 'fleaFlicker', word: 'Flea Flicker', protection: { content: 'sevenManPlayAction', word: 'Seven Man' } },
  kneel_victory: { type: 'run', content: 'kneel', word: 'Victory' },
  spike_clock: { type: 'concept', content: 'spike', word: 'Spike' },
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function look(slots: readonly Slot[]): LookSlot[] {
  return slots.map((s) => {
    const first = s.path?.[0];
    const move: [number, number] = first ? [first.px - s.at[0], first.py - s.at[1]] : [0, 0];
    return { role: s.role, at: [s.at[0], s.at[1]], move };
  });
}

/** Learning units of a play: the mean authored load of its slots (G1.7.1 owns the real count; load defaults to 1). */
function unitsOf(slots: readonly Slot[]): number {
  let t = 0;
  for (const s of slots) t += s.load ?? 1;
  return Math.round((t / slots.length) * 100) / 100;
}

export interface StarterBook { readonly book: Playbook; readonly killPartId: string }

/** Build the starting playbook from the starter content (G3.4.1: starting systems seed books). */
export function starterBook(teamId: string): StarterBook {
  const parts = new Map<string, Part>();
  const part = (p: Part): string => { if (!parts.has(p.id)) parts.set(p.id, p); return p.id; };
  const kill = part({ id: 'kill.kill', type: 'kill', content: 'kill', words: { descriptive: 'Kill' } });
  part({ id: 'strength.right', type: 'strength', content: 'right', words: { descriptive: 'Right' } });
  part({ id: 'strength.left', type: 'strength', content: 'left', words: { descriptive: 'Left' } });
  const plays: PlayEntry[] = [];
  for (const def of STARTER.plays) {
    const f = FORMATION_BY_ID.get(def.formationId)!;
    const runners = f.players.filter((p) => !['LT', 'LG', 'C', 'RG', 'RT', 'Q'].includes(p.role)).length;
    const backs = f.players.filter((p) => ['R', 'F'].includes(p.role)).length;
    const pers = part({ id: `personnel.${def.personnel}`, type: 'personnel', content: def.personnel, words: { descriptive: def.personnel } });
    const form = part({ id: `formation.${f.id}`, type: 'formation', content: f.id, words: { descriptive: FORMATION_WORD[f.id] ?? f.name }, runners, backs, units: 1 });
    const t = TEACHING[def.id];
    if (!t) throw new Error(`starter play ${def.id} has no teaching part`);
    const teach = part({ id: `${t.type}.${slug(t.content)}`, type: t.type, content: t.content, words: { descriptive: t.word }, units: 1 });
    const slots: Record<string, string> = { personnel: pers, formation: form, strength: 'strength.right', [t.type]: teach };
    if (t.protection) slots.protection = part({ id: `protection.${slug(t.protection.content)}`, type: 'protection', content: t.protection.content, words: { descriptive: t.protection.word }, isDefault: t.protection.isDefault, units: 1 });
    const tags = (t.tags ?? []).map((g) => part({ id: `tag.${slug(g.content)}`, type: 'tag', content: g.content, words: { descriptive: g.word }, units: 0.5 }));
    plays.push({
      id: def.id, book: 'offense', section: [SECTION_OF_KIND[def.kind]], labels: [def.kind], status: 'valid', parts: slots, tags,
      role: def.intent, units: unitsOf(def.slots), beats: [], situations: [], look: look(def.slots), origin: `starter:${def.id}`,
    });
  }
  for (const def of STARTER.defense) plays.push(defenseEntry(def, part));
  let book = withParts(emptyBook(teamId), [...parts.values()]);
  for (const p of plays) book = addPlay(book, p);
  return { book, killPartId: kill };
}

const COVERAGE_WORD: Readonly<Record<string, string>> = {
  cover0: 'Cover 0', cover1: 'Cover 1', cover2: 'Cover 2', cover3: 'Cover 3', cover4: 'Cover 4', cover6: 'Cover 6', two_man: '2 Man', other: 'Tampa 2',
};

function defenseEntry(def: DefenseDef, part: (p: Part) => string): PlayEntry {
  const front = def.package.split(',')[0]!.trim();
  const frontId = part({ id: `front.${slug(front)}`, type: 'front', content: front, words: { descriptive: front }, units: 1 });
  const coverage = part({ id: `coverage.${def.id}`, type: 'coverage', content: def.id, words: { descriptive: COVERAGE_WORD[def.coverageFamily] ?? def.name }, units: 1 });
  const slots: Record<string, string> = { front: frontId, coverage };
  if (def.rushers > 4) slots.pressure = part({ id: `pressure.${def.rushers}_man`, type: 'pressure', content: `${def.rushers}_man`, words: { descriptive: `${def.rushers} Man` }, units: 1 });
  return {
    id: def.id, book: 'defense', section: [front, def.rushers > 4 ? 'pressure' : 'coverage'], labels: [def.coverageFamily], status: 'valid', parts: slots, tags: [],
    role: 'base', units: unitsOf(def.slots), beats: [], situations: [], look: look(def.slots), origin: `starter:${def.id}`,
  };
}
