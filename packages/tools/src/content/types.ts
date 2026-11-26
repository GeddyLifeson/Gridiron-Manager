// Shared shapes of the content pipeline (P4.1 to P4.4).
import type { RuleSet, ValidationFinding } from '@gm/schema';

/** Problem classes (P4.2.2 outputs): errors block use; flags ("illegal as drawn") and warnings are shown, never refused. */
export type Severity = 'error' | 'flag' | 'warning' | 'info';

export interface Problem {
  readonly severity: Severity;
  /** Stable code; the broken-file corpus test matches on it. README lists them. */
  readonly code: string;
  readonly packId: string;
  /** Path inside the pack, `/` separated. Empty for pack-level problems. */
  readonly file: string;
  /** JSON path inside the file. */
  readonly path: string;
  readonly message: string;
  readonly ruleKey?: string;
  readonly ruleSetId?: string;
}

/** One file as the platform hands it over. `bytes` is absent when the platform refused to read it (too big). */
export interface SourceFile {
  readonly path: string;
  readonly size: number;
  readonly bytes?: Uint8Array;
}

/** A pack as read from a folder, a zip, or a browser import (P4.1.1). Order of `files` does not matter. */
export interface PackSource {
  /** Where it came from, for messages only (folder path, file name). Never hashed. */
  readonly origin: string;
  readonly files: readonly SourceFile[];
  /** Problems the platform adapter found while reading (zip bombs, symlinks, path escapes). */
  readonly readProblems?: readonly Omit<Problem, 'packId'>[];
}

export interface Ref { readonly kind: string; readonly id: string; readonly path: string }

/** Level tags (P3.4.1): `both`, or the rule keys an item needs. */
export type LevelTags = readonly string[];

export type ItemStatus = 'ok' | 'illegal' | 'draft';

/** One loaded content item. Immutable: a reload makes new items and shares unchanged ones. */
export interface ContentItem {
  /** `${kind}/${id}`. */
  readonly key: string;
  readonly kind: string;
  readonly id: string;
  readonly packId: string;
  readonly file: string;
  readonly data: unknown;
  /** SHA-256 hex of the canonical form of `data` (P4.3.1). */
  readonly hash: string;
  readonly levelTags: LevelTags;
  /** 'illegal': legal under no active rule set, kept and flagged (P4.2.2). 'draft': the engine cannot run it yet. */
  readonly status: ItemStatus;
  /** Rule-set ids the item is legal under; null when no football check applies to its kind. */
  readonly legalUnder: readonly string[] | null;
}

export interface ManifestEntry { readonly packId: string; readonly version: string; readonly hash: string }

export interface ContentSet {
  /** Increments on every successful reload in one session. */
  readonly version: number;
  /** Hash over the manifest in load order (P4.3.1). */
  readonly hash: string;
  readonly manifest: readonly ManifestEntry[];
  readonly items: ReadonlyMap<string, ContentItem>;
  /** False once a logged override changed world-wide content in a running career (P4.4.1). */
  readonly certifiedEligible: boolean;
}

/** Football validation hook for one kind (P4.2.2). Implementations wrap @gm/football-lang (WP-10). */
export interface FootballCheck {
  readonly kind: string;
  check(item: ContentItem, rules: RuleSet, lookup: (kind: string, id: string) => ContentItem | undefined): readonly ValidationFinding[];
}
