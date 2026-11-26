import { spawnSync } from 'node:child_process';

export function headCommit(root: string): string {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}

export function sourceDirty(root: string): boolean {
  const r = spawnSync('git', ['status', '--porcelain', '--', 'packages', 'facts', 'golden', 'shells', 'content', 'scripts'], { cwd: root, encoding: 'utf8' });
  return r.status !== 0 || r.stdout.trim() !== '';
}

export function trackedFiles(root: string): string[] {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.split('\0').filter(Boolean) : [];
}

/** Two hashes name the same commit when one is a prefix of the other (at least 7 characters). */
export function sameCommit(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const x = a.trim().toLowerCase(), y = b.trim().toLowerCase();
  if (x.length < 7 || y.length < 7) return false;
  return x.startsWith(y) || y.startsWith(x);
}
