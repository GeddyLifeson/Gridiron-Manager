// coach.record (O4.6.1, E9.1.2, N4): his seasons with the team's results, the record of work by family in
// words (`record.recordTab`, computed from the log when shown, never stored, E9.1.2 rule 1), and certified
// results (N4). A family with no event reads "no record" (empty lines); simulated events carry their flag
// (S8.1.1 edge case). No skill value or grade of the coach himself is shown (A3 ruling 21).
import { record } from '@gm/career';
import type { WorldEvent } from '@gm/schema';
import { t } from './text.ts';
import type { RecordFamily, RecordView, SeasonRecordRow } from './types.ts';

export interface SeasonInput {
  readonly season: number; readonly team: string; readonly jobTitle: string;
  readonly wins: number; readonly losses: number; readonly ties: number;
  /** The season's finish in words from the standings and postseason (C3), or null before it ends. */
  readonly finish: string | null;
}

export interface RecordInput {
  readonly rights: readonly string[];
  readonly seasons: readonly SeasonInput[];
  readonly record: record.DemonstratedRecord;
  /** Events the coach may see that the record names (the log, read through the filter). */
  readonly events: readonly WorldEvent[];
  readonly window: record.Window;
  readonly certified: readonly { readonly season: number; readonly result: string }[];
  readonly map?: record.EvidenceMap;
}

const words = (s: string): string => s.replace(/^recommendation:/, 'recommendation, ').replace(/[_.]/g, ' ');

export function familyLines(f: record.FamilyLine): string[] {
  if (f.status === 'no_record') return [];
  const out = f.kinds.map((k) => (k.checked > 0
    ? t('rec.kind.checked', { kind: words(k.key), matched: k.matched, checked: k.checked, events: k.events })
    : t('rec.kind', { kind: words(k.key), events: k.events })));
  if (f.simulated > 0) out.push(t('rec.simulated', { n: f.simulated }));
  return out;
}

export function buildRecordView(x: RecordInput): RecordView {
  const seasons: SeasonRecordRow[] = [...x.seasons]
    .sort((a, b) => a.season - b.season)
    .map((s) => ({ season: s.season, team: s.team, jobTitle: s.jobTitle, wins: s.wins, losses: s.losses, ties: s.ties, finish: s.finish ?? t('finish.none') }));
  const families: RecordFamily[] = record.recordTab(x.record, x.events, x.window, x.map).map((f) => ({ family: t(`family.${f.family}`), lines: familyLines(f) }));
  return { rights: [...x.rights], seasons, families, certified: x.certified.map((c) => ({ season: c.season, result: c.result })) };
}
