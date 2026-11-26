// Hot reload (P4.4.1). Content sets are immutable and versioned. A reload validates, builds a new set
// that shares unchanged items, and swaps it between plays, never mid-play. A reload that fails keeps the
// old set and reports. In a running career, world-wide content (rule sets, league rules, world
// generators, models) may change only through a logged, non-certified override; the user's own
// playbook edits arrive as commands (EditPlay) and call `stage` like any editor.
import type { ValidationFinding } from '@gm/schema';
import { loadPacks, normalisePath, type LoadOptions, type LoadResult } from './load.ts';
import { defaultRegistry, type KindRegistry } from './kinds.ts';
import { registerUiKinds } from './ui.ts';
import type { ContentItem, ContentSet, PackSource, Problem } from './types.ts';

export type ReloadMode = 'dev' | 'editor' | 'career';

export interface FileChange {
  /** Path inside the pack. */
  readonly path: string;
  /** New bytes, or null to delete the file. */
  readonly bytes: Uint8Array | null;
}

export interface OverrideLog { readonly reason: string; readonly packOrigin: string; readonly files: readonly string[]; readonly fromSetHash: string; readonly toSetHash: string }

export interface StageResult {
  readonly accepted: boolean;
  /** Version of the staged set, or of the kept set when refused. */
  readonly version: number;
  readonly problems: readonly Problem[];
  /** True when the new set waits for the current play to end. */
  readonly pending: boolean;
  /** Present when a logged override changed world-wide content; the caller writes it to the command log. */
  readonly override?: OverrideLog;
  /** Item keys whose hash changed, appeared or went away. */
  readonly changed: readonly string[];
}

export interface ContentStoreOptions extends Omit<LoadOptions, 'reuse' | 'version' | 'footballCache' | 'certifiedEligible'> {
  readonly mode: ReloadMode;
}

export class ContentStore {
  private sources: PackSource[];
  private live: ContentSet;
  private pendingSet: ContentSet | null = null;
  private inPlay = false;
  private readonly cache = new Map<string, readonly ValidationFinding[]>();
  private readonly archive = new Map<string, ContentItem>();
  private readonly listeners = new Set<(s: ContentSet) => void>();
  private readonly registry: KindRegistry;
  private versionCounter: number;

  private constructor(sources: PackSource[], set: ContentSet, private readonly opts: ContentStoreOptions) {
    this.sources = sources;
    this.live = set;
    this.versionCounter = set.version;
    this.registry = opts.registry ?? registerUiKinds(defaultRegistry());
    this.remember(set);
  }

  /** Loads the initial set. Returns the load result when it fails. */
  static open(sources: readonly PackSource[], opts: ContentStoreOptions): { store: ContentStore | null; result: LoadResult } {
    const cache = new Map<string, readonly ValidationFinding[]>();
    const result = loadPacks(sources, { ...opts, footballCache: cache, version: 1 });
    if (!result.set) return { store: null, result };
    const store = new ContentStore([...sources], result.set, opts);
    for (const [k, v] of cache) store.cache.set(k, v);
    return { store, result };
  }

  /** The set new plays should use. Holders of an older set keep it; it never changes under them. */
  current(): ContentSet { return this.live; }
  hasPending(): boolean { return this.pendingSet !== null; }

  /** Any item this session has loaded, by hash, so records of earlier plays keep resolving (P4.4.1 edge case). */
  itemByHash(hash: string): ContentItem | undefined { return this.archive.get(hash); }

  onSwap(f: (s: ContentSet) => void): () => void { this.listeners.add(f); return () => this.listeners.delete(f); }

  /** The game calls these around every play; a staged set waits for `endPlay`. */
  beginPlay(): void { this.inPlay = true; }
  endPlay(): void {
    this.inPlay = false;
    if (this.pendingSet) this.swap(this.pendingSet);
  }

  /**
   * Applies file changes to one pack (identified by its source origin) and stages the result.
   * `override` is required in career mode for world-wide kinds; using it makes the set non-certified.
   */
  stage(packOrigin: string, changes: readonly FileChange[], override?: { reason: string }): StageResult {
    const base = this.pendingSet ?? this.live;
    const idx = this.sources.findIndex((s) => s.origin === packOrigin);
    const refuse = (problems: Problem[]): StageResult => ({ accepted: false, version: base.version, problems, pending: this.pendingSet !== null, changed: [] });
    if (idx < 0) return refuse([{ severity: 'error', code: 'reload.unknown_pack', packId: packOrigin, file: '', path: '', message: `no loaded pack from ${packOrigin}` }]);

    const worldWide = changes.filter((c) => this.registry.forPath(normalisePath(c.path).path)?.worldWide);
    if (this.opts.mode === 'career' && worldWide.length && !override) {
      return refuse(worldWide.map((c) => ({ severity: 'error' as const, code: 'reload.world_content_blocked', packId: packOrigin, file: c.path, path: '', message: 'rule sets and other world-wide content cannot change in a running career except through a logged, non-certified override (P4.4.1)' })));
    }

    const src = this.sources[idx]!;
    const files = new Map(src.files.map((f) => [normalisePath(f.path).path, f]));
    for (const c of changes) {
      const p = normalisePath(c.path).path;
      if (c.bytes === null) files.delete(p);
      else files.set(p, { path: p, size: c.bytes.length, bytes: c.bytes });
    }
    const nextSources = [...this.sources];
    nextSources[idx] = { ...src, files: [...files.values()] };
    const usesOverride = this.opts.mode === 'career' && worldWide.length > 0;
    const result = loadPacks(nextSources, {
      ...this.opts, registry: this.registry, reuse: base.items, footballCache: this.cache,
      version: this.versionCounter + 1, certifiedEligible: base.certifiedEligible && !usesOverride,
    });
    if (!result.set) return refuse([...result.problems]);

    this.versionCounter++;
    this.sources = nextSources;
    const changed = diffKeys(base, result.set);
    const out: StageResult = {
      accepted: true, version: result.set.version, problems: result.problems, pending: this.inPlay, changed,
      ...(usesOverride ? { override: { reason: override!.reason, packOrigin, files: worldWide.map((c) => c.path), fromSetHash: base.hash, toSetHash: result.set.hash } } : {}),
    };
    if (this.inPlay) this.pendingSet = result.set;
    else this.swap(result.set);
    return out;
  }

  private swap(s: ContentSet): void {
    this.live = s;
    this.pendingSet = null;
    this.remember(s);
    for (const f of this.listeners) f(s);
  }

  private remember(s: ContentSet): void {
    for (const it of s.items.values()) if (!this.archive.has(it.hash)) this.archive.set(it.hash, it);
  }
}

export function diffKeys(a: ContentSet, b: ContentSet): string[] {
  const out = new Set<string>();
  for (const [k, v] of a.items) if (b.items.get(k)?.hash !== v.hash) out.add(k);
  for (const k of b.items.keys()) if (!a.items.has(k)) out.add(k);
  return [...out].sort();
}

/** Compiled forms of content (P6.3.1) cached by item hash, so a reload recompiles only what changed. */
export class CompileCache<T> {
  private readonly byHash = new Map<string, T>();
  private compiles = 0;
  get(item: ContentItem, compile: (item: ContentItem) => T): T {
    let v = this.byHash.get(item.hash);
    if (v === undefined) { v = compile(item); this.byHash.set(item.hash, v); this.compiles++; }
    return v;
  }
  /** Drops entries no item of `set` uses. Call after a swap, between plays. */
  retain(set: ContentSet): void {
    const live = new Set([...set.items.values()].map((i) => i.hash));
    for (const h of [...this.byHash.keys()]) if (!live.has(h)) this.byHash.delete(h);
  }
  get size(): number { return this.byHash.size; }
  get compileCount(): number { return this.compiles; }
}
