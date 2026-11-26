// G3.3.1 playbook size report: can the team know what the book asks of it? Inputs are the practice plan's
// team reps (H3), meeting units (H4) and the D9 decay per installed unit; this module stores no practice-hour
// value of its own. Knowledge shown is the staff's estimate (G5.4.1), never truth (K9).
import { param } from './params.ts';
import { partIdsOf } from './library.ts';
import type { Book, Playbook, PlayEntry } from './types.ts';

export interface SizeInputs {
  /** Weekly team reps from the practice plan (H3). */
  readonly teamReps: number;
  /** Meeting learning units available this week (H4). */
  readonly meetingUnits: number;
  /** Units one rep teaches (D9). */
  readonly unitsPerRep: number;
  /** D9 decay per week of one installed unit, in units (D9 owns the rate). */
  readonly decayPerUnit: number;
  /** New install planned this week, units (G5). */
  readonly newInstall: number;
  /** Plays in this week's plan (G6), for the readiness ceiling. */
  readonly planSize: number;
  /** Staff estimate of average knowledge by position group, 0 to 1 (G5.4.1). */
  readonly groupKnowledgeEstimate?: ReadonlyMap<string, number>;
  /** Players the staff believes are furthest behind, with an estimate each; mid-season signings first (edge case). */
  readonly playersBehind?: readonly { readonly personId: string; readonly estimate: number; readonly signedInSeason: boolean }[];
}

export type Warning = 'none' | 'amber' | 'red';

export interface SizeReport {
  readonly playsBySection: ReadonlyMap<string, number>;
  readonly partsByType: ReadonlyMap<string, number>;
  readonly totalUnits: number;
  readonly installedUnits: number;
  readonly readinessCeiling: number;
  readonly upkeep: number;
  readonly capacity: number;
  readonly warning: Warning;
  readonly warnings: readonly string[];
  /** Each section's share of upkeep, largest first: retiring the costliest is offered first (the user decides). */
  readonly sectionUpkeep: readonly { readonly section: string; readonly units: number; readonly share: number }[];
  readonly groupKnowledgeEstimate: ReadonlyMap<string, number>;
  readonly playersBehind: readonly string[];
}

const sectionKey = (p: PlayEntry) => `${p.book}/${p.section.join('/')}`;

/** Units a play costs to learn: its own units plus parts not yet counted for another play (parts are shared). */
function unitsOf(book: Playbook, plays: readonly PlayEntry[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const p of plays) {
    total += p.units;
    for (const id of partIdsOf(p)) {
      if (seen.has(id)) continue;
      seen.add(id);
      total += book.parts.get(id)?.units ?? 0;
    }
  }
  return total;
}

/** Readiness ceiling: plays fully practised this week = team reps / reps per play (G3.3.1; 180 reps gives 40). */
export function readinessCeiling(teamReps: number): number {
  return Math.floor(teamReps / param('size.repsPerPlayCeiling'));
}

export function sizeReport(book: Playbook, inp: SizeInputs, side?: Book): SizeReport {
  const plays = [...book.plays.values()].filter((p) => p.status !== 'retired' && (!side || p.book === side));
  const installed = plays.filter((p) => p.status === 'installed');
  const playsBySection = new Map<string, number>();
  for (const p of plays) playsBySection.set(sectionKey(p), (playsBySection.get(sectionKey(p)) ?? 0) + 1);
  const partsByType = new Map<string, number>();
  const used = new Set(plays.flatMap(partIdsOf));
  for (const id of [...used].sort()) {
    const t = book.parts.get(id)?.type ?? 'unknown';
    partsByType.set(t, (partsByType.get(t) ?? 0) + 1);
  }
  const totalUnits = unitsOf(book, plays);
  const installedUnits = unitsOf(book, installed);
  const upkeep = installedUnits * inp.decayPerUnit;
  const capacity = inp.meetingUnits + inp.teamReps * inp.unitsPerRep;
  const ceiling = readinessCeiling(inp.teamReps);
  const warnings: string[] = [];
  let warning: Warning = 'none';
  if (inp.planSize > ceiling) { warning = 'amber'; warnings.push(`plan of ${inp.planSize} plays is above the readiness ceiling of ${ceiling}`); }
  if (upkeep + inp.newInstall > capacity) { warning = 'red'; warnings.push(`upkeep ${upkeep.toFixed(1)} plus new install ${inp.newInstall.toFixed(1)} is above capacity ${capacity.toFixed(1)}`); }
  const bySection = new Map<string, PlayEntry[]>();
  for (const p of installed) bySection.set(sectionKey(p), [...(bySection.get(sectionKey(p)) ?? []), p]);
  // A section's upkeep is its marginal cost: what retiring it would save (shared parts stay with the rest).
  const sectionUpkeep = [...bySection.keys()].map((section) => {
    const rest = installed.filter((p) => sectionKey(p) !== section);
    const units = upkeep - unitsOf(book, rest) * inp.decayPerUnit;
    return { section, units, share: upkeep > 0 ? units / upkeep : 0 };
  }).sort((a, b) => b.units - a.units || (a.section < b.section ? -1 : 1));
  const behind = [...(inp.playersBehind ?? [])].sort((a, b) => Number(b.signedInSeason) - Number(a.signedInSeason) || a.estimate - b.estimate || (a.personId < b.personId ? -1 : 1));
  return {
    playsBySection, partsByType, totalUnits, installedUnits, readinessCeiling: ceiling, upkeep, capacity, warning, warnings, sectionUpkeep,
    groupKnowledgeEstimate: inp.groupKnowledgeEstimate ?? new Map(), playersBehind: behind.map((b) => b.personId),
  };
}

/** The slider (G3.3.1): upkeep if one section (a `sectionUpkeep` key such as "offense/run") were retired. Changes no knowledge value. */
export function upkeepWithout(book: Playbook, inp: SizeInputs, section: string, side?: Book): number {
  const keep = [...book.plays.values()].filter((p) => p.status === 'installed' && (!side || p.book === side) && sectionKey(p) !== section);
  return unitsOf(book, keep) * inp.decayPerUnit;
}
