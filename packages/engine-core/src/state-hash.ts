// State hash and hash chain (P1.1.5, P5.3.2).
import { canonicalBytes } from './canonical.ts';
import { hash64Hex, utf8 } from './hash.ts';

export function stateHash(state: unknown): string {
  return hash64Hex(canonicalBytes(state));
}

export interface ChainLink {
  readonly prev: string;
  readonly stateHash: string;
  readonly logSequence: number;
  readonly engineVersion: string;
  readonly parameterSetVersion: string;
}

export const CHAIN_GENESIS = '0000000000000000';

/** chain[n] = H(chain[n-1], stateHash, logSequence, engineVersion, parameterSetVersion) */
export function chainNext(link: ChainLink): string {
  return hash64Hex(canonicalBytes([link.prev, link.stateHash, link.logSequence, link.engineVersion, link.parameterSetVersion]));
}

export function bytesHash(b: Uint8Array): string {
  return hash64Hex(b);
}

export function textHash(s: string): string {
  return hash64Hex(utf8(s));
}
