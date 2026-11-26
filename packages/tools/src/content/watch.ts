// Development builds: saving a content file on disk reloads it (P4.4.1). Desktop development only; a
// shipped career never watches files. Changes are gathered for a short quiet period so an editor's
// save-as-rename counts once, then staged; the store swaps the new set between plays.
import { watch, existsSync, readFileSync, statSync, type FSWatcher } from 'node:fs';
import { join, sep } from 'node:path';
import type { ContentStore, FileChange, StageResult } from './reload.ts';

/** Quiet period before a burst of file events is staged. Tooling only, not a game number. */
export const WATCH_QUIET_MS = 150;

export function watchPackFolder(dir: string, store: ContentStore, onResult: (r: StageResult, files: readonly string[]) => void, quietMs = WATCH_QUIET_MS): { close(): void } {
  const changed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    const paths = [...changed].sort();
    changed.clear();
    const changes: FileChange[] = paths.map((p) => {
      const full = join(dir, p);
      return { path: p, bytes: existsSync(full) && statSync(full).isFile() ? new Uint8Array(readFileSync(full)) : null };
    });
    if (changes.length) onResult(store.stage(dir, changes), paths);
  };
  const w: FSWatcher = watch(dir, { recursive: true }, (_ev, name) => {
    if (!name) return;
    const rel = name.toString().split(sep).join('/');
    if (rel.split('/').some((s) => s.startsWith('.'))) return;
    changed.add(rel);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, quietMs);
  });
  return { close() { if (timer) clearTimeout(timer); w.close(); } };
}
