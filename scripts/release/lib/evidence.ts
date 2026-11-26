// Tracked checks pass only on a recorded verification at the commit under test with three independent confirmations
// (masterclaude rule 10: one source agreeing is not proof; reading the code is not a check).
import { existsSync, readFileSync } from 'node:fs';
import type { EvidenceRecord, CheckStatus } from './types.ts';
import { sameCommit } from './git.ts';

export const EVIDENCE_FILE = 'scripts/release/data/evidence.json';
export const MIN_CONFIRMATIONS = 3;

export function loadEvidence(path: string): EvidenceRecord[] {
  if (!existsSync(path)) return [];
  const d = JSON.parse(readFileSync(path, 'utf8')) as { records?: EvidenceRecord[] };
  return d.records ?? [];
}

export function judgeEvidence(checkId: string, records: readonly EvidenceRecord[], commit: string, dirty: boolean): { status: CheckStatus; detail: string } | null {
  const mine = records.filter((r) => r.check === checkId);
  if (!mine.length) return null;
  const here = mine.filter((r) => sameCommit(r.commit, commit));
  if (!here.length) return { status: 'STALE', detail: `evidence only from other commits: ${mine.map((r) => `${r.commit.slice(0, 9)} ${r.result}`).join(', ')}` };
  const last = here[here.length - 1]!;
  if (last.result === 'fail') return { status: 'FAIL', detail: `recorded fail by ${last.by} on ${last.date}${last.notes ? `: ${last.notes}` : ''}` };
  const conf = last.confirmations.filter((c) => c.trim().length > 0);
  if (conf.length < MIN_CONFIRMATIONS) return { status: 'PENDING', detail: `recorded pass has ${conf.length} of ${MIN_CONFIRMATIONS} independent confirmations` };
  if (dirty) return { status: 'PENDING', detail: 'recorded pass, but the working tree has uncommitted source changes' };
  return { status: 'PASS', detail: `verified by ${last.by} on ${last.date}: ${conf.join('; ')}` };
}
