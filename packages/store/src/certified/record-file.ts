// The coaching record data file (N4.4.1, P5.7.2): the record (built and verified by models `rating`),
// wrapped with the certified flag, the chain head and a content hash over the canonical text. The file
// is the export; the readable report is laid out from the same record by the UI.
import { canonicalJson } from '../snapshot/canonical-json.ts';

export const RECORD_FILE_FORMAT = 'gm.coaching-record-file.1';

export interface RecordFile {
  readonly fileFormat: typeof RECORD_FILE_FORMAT;
  /** P5.7.2: the coaching record carries the certified flag and the chain head. */
  readonly certified: boolean;
  readonly chainHead: string;
  readonly certifiedRuleset: string;
  readonly record: unknown;
  /** Hash of the canonical text of everything above. */
  readonly contentHash: string;
  /** Signature over the content hash when a signing service exists (P8.2.1, later); null in v1. */
  readonly signature: string | null;
}

export interface RecordFileDeps {
  /** Hash of UTF-8 text (the engine's `bytesHash` over the encoded text, or SHA-256). */
  hashText(text: string): string;
  /** The record's own checks (models `verifyRecord`). */
  verifyRecord(record: unknown): { readonly ok: boolean; readonly problems: readonly string[] };
  /** Reads the flag and head the record states, to match them against the wrapper. */
  describe(record: unknown): { readonly certified: boolean; readonly chainHead: string; readonly certifiedRuleset: string };
  /** Optional signer (none in v1). */
  sign?(contentHash: string): string;
}

function body(f: Omit<RecordFile, 'contentHash' | 'signature'>): string {
  return canonicalJson({ fileFormat: f.fileFormat, certified: f.certified, chainHead: f.chainHead, certifiedRuleset: f.certifiedRuleset, record: f.record });
}

export class RecordFileError extends Error {}

/** Writes the file text. Refuses a record that fails its own checks. */
export function writeRecordFile(record: unknown, deps: RecordFileDeps): string {
  const check = deps.verifyRecord(record);
  if (!check.ok) throw new RecordFileError(`record fails its checks: ${check.problems.join('; ')}`);
  const d = deps.describe(record);
  const base = { fileFormat: RECORD_FILE_FORMAT, certified: d.certified, chainHead: d.chainHead, certifiedRuleset: d.certifiedRuleset, record } as const;
  const contentHash = deps.hashText(body(base));
  const file: RecordFile = { ...base, contentHash, signature: deps.sign ? deps.sign(contentHash) : null };
  return canonicalJson(file);
}

export interface RecordFileCheck { readonly ok: boolean; readonly problems: readonly string[]; readonly file: RecordFile | null }

/** The published verification tool's file check (N4.4.1 acceptance: altering one record makes it fail). */
export function readRecordFile(text: string, deps: RecordFileDeps): RecordFileCheck {
  let file: RecordFile;
  try { file = JSON.parse(text) as RecordFile; } catch { return { ok: false, problems: ['not a JSON file'], file: null }; }
  const problems: string[] = [];
  if (file.fileFormat !== RECORD_FILE_FORMAT) problems.push(`unknown file format ${String(file.fileFormat)}`);
  if (deps.hashText(body(file)) !== file.contentHash) problems.push('content does not match its hash');
  const check = deps.verifyRecord(file.record);
  problems.push(...check.problems);
  try {
    const d = deps.describe(file.record);
    if (d.certified !== file.certified) problems.push('certified flag differs from the record');
    if (d.chainHead !== file.chainHead) problems.push('chain head differs from the record');
    if (d.certifiedRuleset !== file.certifiedRuleset) problems.push('certified ruleset differs from the record');
  } catch (e) {
    problems.push(`record unreadable: ${(e as Error).message}`);
  }
  return { ok: problems.length === 0, problems, file };
}
