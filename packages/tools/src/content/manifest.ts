// Pack manifest `pack.json` (P4.1.1): id, name, version, author, contentSchemaVersion, requires[],
// kinds[], optional signature (P7.4.1). `overrides` is this package's answer to P4.1.1's "declared
// override": the item keys (`kind/id`) a pack replaces on purpose. Without it, two packs defining the
// same id is a load error naming both.
import { arr, int, obj, opt, str } from './shape.ts';

export const PACK_ID = /^[a-z][a-z0-9-]{1,63}$/;
export const VERSION = /^\d+\.\d+\.\d+$/;
export const CORE_PACK_ID = 'core';

export interface PackManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly contentSchemaVersion: number;
  /** Other packs and the minimum version of each. */
  readonly requires: readonly { readonly id: string; readonly version: string }[];
  /** Top-level kinds the pack uses (P4.1.1 folder names). */
  readonly kinds: readonly string[];
  readonly overrides?: readonly string[];
  /** Certified packs carry a signature (P7.4.1); checking it is G-95's. */
  readonly signature?: string;
}

export const PackManifestShape = obj({
  id: str({ re: PACK_ID }),
  name: str({ min: 1 }),
  version: str({ re: VERSION }),
  author: str({ min: 1 }),
  contentSchemaVersion: int({ min: 1 }),
  requires: arr(obj({ id: str({ re: PACK_ID }), version: str({ re: VERSION }) })),
  kinds: arr(str({ min: 1 })),
  overrides: opt(arr(str({ re: /^[a-z][a-z0-9/_-]*\/[a-z0-9][a-z0-9_.:-]*$/ }))),
  signature: opt(str()),
});

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}
