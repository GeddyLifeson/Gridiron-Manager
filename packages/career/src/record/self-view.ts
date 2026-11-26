// How the coach sees his own record (E9.2.2): three views side by side, and last season's self-assessment
// beside the record for the same subject, with no comment. Nothing here is stored and nothing changes when
// a self-assessment is written (acceptance).
import type { WorldEvent } from '@gm/schema';
import type { Note } from '../coach/notebook.ts';
import { isFamily, type FamilyId } from './families.ts';
import type { DemonstratedRecord } from './record.ts';
import { recordTab, type FamilyLine, type KindLine, type Window } from './summary.ts';
import type { EvidenceMap } from './events.ts';

/** Who can see a row: former colleagues through what they witnessed, the public through public rows (E5.3.2). */
export interface ViewFilters {
  colleaguesSaw(e: WorldEvent): boolean;
  publicSaw?(e: WorldEvent): boolean;
}

export interface ThreeViews {
  readonly full: readonly FamilyLine[];
  readonly colleagues: readonly FamilyLine[];
  readonly public: readonly FamilyLine[];
}

function restrict(r: DemonstratedRecord, keep: ReadonlySet<number>): DemonstratedRecord {
  const f = (o: DemonstratedRecord['eventIds']) => Object.fromEntries(Object.entries(o).map(([k, ids]) => [k, ids.filter((id) => keep.has(id))])) as unknown as DemonstratedRecord['eventIds'];
  return { personId: r.personId, eventIds: f(r.eventIds), simulatedEventIds: f(r.simulatedEventIds), refused: [] };
}

export function threeViews(record: DemonstratedRecord, events: readonly WorldEvent[], w: Window, filters: ViewFilters, map?: EvidenceMap): ThreeViews {
  const pub = filters.publicSaw ?? ((e: WorldEvent) => e.witnesses.kind === 'public');
  const col = new Set(events.filter((e) => filters.colleaguesSaw(e)).map((e) => e.id));
  const pubIds = new Set(events.filter(pub).map((e) => e.id));
  return {
    full: recordTab(record, events, w, map),
    colleagues: recordTab(restrict(record, col), events, w, map),
    public: recordTab(restrict(record, pubIds), events, w, map),
  };
}

/**
 * A self-assessment's measure: a family id, or `family:kind` for one sub-line (for example
 * `decisions:fourth_down`). Anything else matches no measure and the comparison is simply absent.
 */
export function parseMeasure(m: string | null): { family: FamilyId; kind: string | null } | null {
  if (!m) return null;
  const [fam, kind] = m.split(':', 2) as [string, string | undefined];
  return isFamily(fam) ? { family: fam, kind: kind ?? null } : null;
}

export interface SelfAssessmentPair {
  readonly noteId: number;
  readonly noteSeason: number;
  readonly measure: string;
  /** The note itself, for display only (E11.1.1 acceptance 3: nothing else reads its text). */
  readonly note: Note;
  /** The record for the same subject over the season the note was about. No verdict is attached. */
  readonly record: FamilyLine | KindLine | null;
}

/**
 * E9.2.2: a year later, his note beside the record for the same subject. Notes are self notes with a
 * measure, written in season `currentSeason - 1`. No note: no comparison (edge case).
 */
export function selfAssessmentPairs(notes: readonly Note[], record: DemonstratedRecord, events: readonly WorldEvent[], currentSeason: number, map?: EvidenceMap): SelfAssessmentPair[] {
  const season = currentSeason - 1;
  const tab = recordTab(record, events, { fromSeason: season, toSeason: season }, map);
  const out: SelfAssessmentPair[] = [];
  for (const n of [...notes].sort((a, b) => a.id - b.id)) {
    if (n.kind !== 'self' || n.season !== season) continue;
    const m = parseMeasure(n.subjectMeasure);
    if (!m) continue;
    const line = tab.find((l) => l.family === m.family)!;
    const rec = m.kind === null ? line : line.kinds.find((k) => k.key === m.kind) ?? null;
    out.push({ noteId: n.id, noteSeason: n.season, measure: n.subjectMeasure!, note: n, record: rec });
  }
  return out;
}
