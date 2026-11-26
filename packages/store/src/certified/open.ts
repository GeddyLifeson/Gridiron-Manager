// Opening a certified career (P8.1.1, P8.1.2, N4.3.1). The save core already refuses a file whose state
// hash chain does not verify (P5.3.2, SaveDamagedError) and drops certification on a recovery that loses
// commands (P5.8.1). This adds the certified load checks: the copy counter, the decision-log chain, and any
// breaking events the application found (content signatures, a truth build). Once false the flag stays false.
import type { SaveCoreDeps, SaveOptions } from '../save/types.ts';
import { SaveFile } from '../save/save-file.ts';
import type { SqlDriver } from '../driver.ts';
import { breakTextKey, type BreakReason } from './conditions.ts';
import { checkAndAdvance, type IdentityIndex } from './identity.ts';

/** The decision log's chain check (models `verifyChain`), handed in because the store imports only schema. */
export type DecisionChainCheck = () => Promise<{ readonly ok: boolean; readonly reason: string | null }> | { readonly ok: boolean; readonly reason: string | null };

export interface CertifiedLoadChecks {
  readonly index: IdentityIndex;
  readonly decisionChain: DecisionChainCheck;
  /** Breaking events found by the application before the load (P8.1.1). */
  readonly breaks?: readonly BreakReason[];
}

export interface CertifiedOpen<S> {
  readonly save: SaveFile<S>;
  /** Set when this load ended certification; shown to the user once (P8.1.1). */
  readonly broken: { readonly reason: BreakReason; readonly textKey: string; readonly detail: string | null } | null;
}

export async function openCertified<S>(driver: SqlDriver, deps: SaveCoreDeps<S>, checks: CertifiedLoadChecks, options: SaveOptions = {}): Promise<CertifiedOpen<S>> {
  const save = await SaveFile.open(driver, deps, options);
  if (!save.header().certified) return { save, broken: null };
  let reason: BreakReason | null = checks.breaks?.[0] ?? null;
  let detail: string | null = null;
  if (!reason) {
    const id = await checkAndAdvance(driver, checks.index);
    if (!id.ok) { reason = 'older_copy'; detail = id.reason === 'no_identity' ? 'no career identity' : `file session ${id.identity!.session}, index ${id.indexSession}`; }
  }
  if (!reason) {
    const c = await checks.decisionChain();
    if (!c.ok) { reason = 'decision_chain_failed'; detail = c.reason; }
  }
  if (!reason) return { save, broken: null };
  await save.breakCertification(detail ? `${reason}: ${detail}` : reason);
  return { save, broken: { reason, textKey: breakTextKey(reason), detail } };
}

/** "Save a copy" (P8.1.2): the copy is uncertified. Call on the copy's SaveFile after it is written. */
export async function markCopy<S>(copy: SaveFile<S>): Promise<void> {
  await copy.breakCertification('copy_saved');
}
