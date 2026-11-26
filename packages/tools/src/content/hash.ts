// Content hashing and the manifest (P4.3.1). Each item is serialised canonically (sorted keys, fixed
// number bytes: @gm/engine-core canonicalBytes, the same layout state hashes use) and hashed with
// SHA-256. A pack hash covers its id, version and item hashes. The set hash covers the manifest in load
// order, so it changes when packs, versions, items or the override order change, and never with the
// order a platform lists files in.
import { canonicalBytes } from '@gm/engine-core';
import { sha256Hex } from './sha256.ts';
import type { ManifestEntry } from './types.ts';

export const HASH_ALGORITHM = 'sha256';

export function itemHash(data: unknown): string {
  return sha256Hex(canonicalBytes(data));
}

export function packHash(id: string, version: string, items: readonly { key: string; hash: string }[]): string {
  const sorted = [...items].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((i) => [i.key, i.hash]);
  return sha256Hex(canonicalBytes({ algorithm: HASH_ALGORITHM, id, version, items: sorted }));
}

export function setHash(manifest: readonly ManifestEntry[]): string {
  return sha256Hex(canonicalBytes({ algorithm: HASH_ALGORITHM, packs: manifest.map((m) => [m.packId, m.version, m.hash]) }));
}
