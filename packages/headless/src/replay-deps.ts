import { stateHash, chainNext, canonicalBytes, bytesHash, CHAIN_GENESIS } from '@gm/engine-core';
import { applyCommand } from '@gm/league';
import type { ReplayDeps } from '@gm/store';

/** Same deps as app-services' replayDeps, built from core packages only (headless may not import app packages other than store). */
export function replayDeps(): ReplayDeps {
  return { apply: (w, cmd) => applyCommand(w, cmd), stateHash, eventsHash: (e) => bytesHash(canonicalBytes(e)), chainNext, genesis: CHAIN_GENESIS };
}
