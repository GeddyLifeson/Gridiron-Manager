// The coaching record (N4.4.1, P5.7.2): what the user did, under what conditions, with the evidence.
// This file builds the record's data and verifies it; the store writes and reads the file around it
// (store/certified/record-file.ts) and supplies the certified state.
//
// Exports never contain truth fields (P5.7.2). The decision chain holds truth-view entries (N3.1.2), so
// they are exported as redacted stubs that keep their place and hash in the chain: the links still
// verify, and their content cannot be read. Every other entry is checked in full.
import { GENESIS_HASH, canonicalText, entryHash } from '../decisions/chain.ts';
import { DecisionLog } from '../decisions/log.ts';
import type { DecisionView, LogEntry } from '../decisions/types.ts';
import { limitsNote, type LimitsNote } from './limits.ts';
import { param } from './params.ts';
import type { RosterExpectation } from './roster.ts';
import { creditWeight, gameManagementLoss, type ComponentScore, type DecisionRecordProfile } from './score.ts';
import { componentForType } from './components.ts';

export const RECORD_FORMAT = 'gm.coaching-record.1';

export class RecordError extends Error {}

/** A truth-view entry with its content removed (P5.7.2). */
export interface RedactedEntry { readonly seq: number; readonly prevHash: string; readonly hash: string; readonly redacted: 'truth_view' }
export type ExportedEntry = LogEntry | RedactedEntry;

export function isRedacted(e: ExportedEntry): e is RedactedEntry {
  return (e as RedactedEntry).redacted !== undefined;
}

export interface JobHeld { readonly rung: string; readonly teamId: number; readonly from: string; readonly to: string | null }

export interface RecordConditions {
  readonly certified: boolean;
  readonly certifiedBrokenReason: string | null;
  /** Version of the certified ruleset file (N4.3.1 inputs). */
  readonly certifiedRuleset: string;
  /** Every game version the record spans (N4.4.1 edge case). */
  readonly gameVersions: readonly string[];
  /** P7.4.1: printed so two records are comparable only when checksums match or both have none. */
  readonly peoplePackChecksum: string | null;
  readonly seasons: readonly number[];
  readonly jobs: readonly JobHeld[];
}

export interface SeasonResult {
  readonly seasonYear: number;
  readonly teamId: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly pointMargin: number;
  readonly completed: boolean;
  /** Expected with this roster from the public strength estimate (shown in career). */
  readonly roster: RosterExpectation | null;
  /** The true-attribute version (N4.2.2): exported only for completed seasons, and only while the switch is on. */
  readonly rosterTrue?: RosterExpectation | null;
}

export interface EvidenceItem { readonly decisionId: string; readonly reason: 'chosen' | 'largest_loss' }

export interface CoachingRecord {
  readonly format: typeof RECORD_FORMAT;
  /** The only personal data: the name the user typed for the report (N4.4.1). */
  readonly name: string;
  readonly conditions: RecordConditions;
  readonly limits: LimitsNote;
  readonly components: readonly ComponentScore[];
  readonly headline: number | null;
  readonly results: readonly SeasonResult[];
  readonly evidence: readonly EvidenceItem[];
  /** Every decision credited to the coach (the data file holds all of them, not only the evidence). */
  readonly decisions: readonly DecisionView[];
  readonly chain: { readonly entries: readonly ExportedEntry[]; readonly head: string };
}

export interface RecordSwitches {
  /** N4.1.1 / N4.2.2 open question (Marlon): show the true-attribute roster line for completed seasons. Off until he decides. */
  readonly exportTrueRosterLine: boolean;
}

export const DEFAULT_SWITCHES: RecordSwitches = { exportTrueRosterLine: false };

export interface RecordInput {
  readonly name: string;
  readonly profile: DecisionRecordProfile;
  readonly entries: readonly LogEntry[];
  readonly conditions: RecordConditions;
  readonly results: readonly SeasonResult[];
  /** Decision reports the user picked, up to the evidence limit (N4.4.1). */
  readonly chosenEvidence: readonly string[];
  readonly switches?: RecordSwitches;
}

/** Redacts truth-view entries (P5.7.2). */
export function exportChain(entries: readonly LogEntry[]): ExportedEntry[] {
  return entries.map((e) => (e.payload.kind === 'truth_view' ? { seq: e.seq, prevHash: e.prevHash, hash: e.hash, redacted: 'truth_view' } : e));
}

export interface ExportedChainCheck { readonly ok: boolean; readonly firstBad: number | null; readonly reason: string | null }

/** Verifies an exported chain: every link, and the content of every entry that is not redacted. */
export function verifyExportedChain(entries: readonly ExportedEntry[]): ExportedChainCheck {
  let prev = GENESIS_HASH;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    if (e.seq !== i) return { ok: false, firstBad: i, reason: `entry ${i} has seq ${e.seq}` };
    if (e.prevHash !== prev) return { ok: false, firstBad: i, reason: `entry ${i} does not link to the previous hash` };
    if (isRedacted(e)) {
      if (i === 0) return { ok: false, firstBad: 0, reason: 'a chain starts with a segment entry' };
    } else {
      if (entryHash(e.seq, e.prevHash, e.payload) !== e.hash) return { ok: false, firstBad: i, reason: `entry ${i} content does not match its hash` };
      if (i === 0 && e.payload.kind !== 'segment') return { ok: false, firstBad: 0, reason: 'a chain starts with a segment entry' };
    }
    prev = e.hash;
  }
  return { ok: true, firstBad: null, reason: null };
}

function scoredLossOf(d: DecisionView): number {
  const id = componentForType(d.record.type);
  if (!id || !d.modelView || d.modelView.kind !== 'game_management' || d.supersededBy.length) return 0;
  return gameManagementLoss(d.modelView);
}

/** The largest scored losses among the credited decisions (N4.4.1: always included). */
export function largestLosses(decisions: readonly DecisionView[], count = param('evidenceForcedLosses')): string[] {
  return decisions
    .map((d) => ({ id: d.record.id, loss: scoredLossOf(d) }))
    .filter((x) => x.loss > 0)
    .sort((a, b) => b.loss - a.loss || (a.id < b.id ? -1 : 1))
    .slice(0, count)
    .map((x) => x.id);
}

/**
 * Evidence: the user's picks (at most the limit) plus the largest scored losses, which the export screen
 * cannot remove (N4.4.1 acceptance). A forced item the user also picked is listed once, as a loss.
 */
export function selectEvidence(chosen: readonly string[], decisions: readonly DecisionView[]): EvidenceItem[] {
  if (chosen.length > param('evidenceUserMax')) throw new RecordError(`at most ${param('evidenceUserMax')} chosen decision reports (N4.4.1)`);
  const known = new Set(decisions.map((d) => d.record.id));
  for (const id of chosen) if (!known.has(id)) throw new RecordError(`evidence ${id} is not a decision credited to this coach`);
  const forced = largestLosses(decisions);
  const forcedSet = new Set(forced);
  const out: EvidenceItem[] = forced.map((decisionId) => ({ decisionId, reason: 'largest_loss' }));
  const seen = new Set<string>();
  for (const id of chosen) if (!forcedSet.has(id) && !seen.has(id)) { seen.add(id); out.push({ decisionId: id, reason: 'chosen' }); }
  return out;
}

function stripTrueRoster(r: SeasonResult, on: boolean): SeasonResult {
  const { rosterTrue, ...rest } = r;
  return on && r.completed && rosterTrue ? { ...rest, rosterTrue } : rest;
}

export function buildRecord(input: RecordInput): CoachingRecord {
  const name = input.name.trim();
  if (!name) throw new RecordError('the report needs the name the user types (N4.4.1)');
  const log = DecisionLog.load(input.entries);
  const decisions = log.views().filter((d) => {
    const w = creditWeight(d, input.profile.personId);
    return w !== null && w !== 'delegated';
  });
  const switches = input.switches ?? DEFAULT_SWITCHES;
  return {
    format: RECORD_FORMAT,
    name,
    conditions: input.conditions,
    limits: limitsNote(input.profile),
    components: input.profile.components,
    headline: input.profile.headline,
    results: input.results.map((r) => stripTrueRoster(r, switches.exportTrueRosterLine)),
    evidence: selectEvidence(input.chosenEvidence, decisions),
    decisions,
    chain: { entries: exportChain(input.entries), head: log.headHash },
  };
}

export interface RecordCheck { readonly ok: boolean; readonly problems: readonly string[] }

/** The checks the published verification tool runs on a record (N4.4.1 acceptance). */
export function verifyRecord(rec: CoachingRecord): RecordCheck {
  const problems: string[] = [];
  if (rec.format !== RECORD_FORMAT) problems.push(`unknown record format ${String(rec.format)}`);
  const c = verifyExportedChain(rec.chain.entries);
  if (!c.ok) problems.push(`decision chain: ${c.reason}`);
  const last = rec.chain.entries[rec.chain.entries.length - 1];
  if ((last ? last.hash : GENESIS_HASH) !== rec.chain.head) problems.push('chain head does not match the last entry');
  const inChain = new Map<string, string>();
  for (const e of rec.chain.entries) if (!isRedacted(e) && e.payload.kind === 'decision') inChain.set(e.payload.record.id, canonicalText(e.payload.record));
  const ids = new Set<string>();
  for (const d of rec.decisions) {
    ids.add(d.record.id);
    const t = inChain.get(d.record.id);
    if (t === undefined) problems.push(`decision ${d.record.id} is not in the chain`);
    else if (t !== canonicalText(d.record)) problems.push(`decision ${d.record.id} differs from the chain`);
  }
  const evidence = new Set(rec.evidence.map((e) => e.decisionId));
  for (const id of evidence) if (!ids.has(id)) problems.push(`evidence ${id} is not among the decisions`);
  for (const id of largestLosses(rec.decisions)) if (!evidence.has(id)) problems.push(`largest loss ${id} is missing from the evidence`);
  if (rec.evidence.filter((e) => e.reason === 'chosen').length > param('evidenceUserMax')) problems.push('too many chosen decision reports');
  for (const r of rec.results) if (r.rosterTrue && !r.completed) problems.push(`season ${r.seasonYear}: true-attribute roster line on an unfinished season`);
  return { ok: problems.length === 0, problems };
}
