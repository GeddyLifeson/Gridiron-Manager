// Collects findings and stage records for one career. A finding with the same code in the same area is kept
// once per career with a count, so a breach that repeats on every play does not drown the report.
import type { Area, Finding, FindingKind, StageRecord } from './types.ts';

export class Recorder {
  readonly findings: Finding[] = [];
  readonly stages: StageRecord[] = [];
  private readonly seen = new Map<string, number>();
  season: number | null = null;

  constructor(readonly seedHex: string) {}

  add(kind: FindingKind, area: Area, code: string, message: string, owner: string, detail?: Record<string, unknown>): void {
    const key = `${area}|${code}`;
    const at = this.seen.get(key);
    if (at !== undefined) {
      const f = this.findings[at]!;
      const count = ((f.detail?.['count'] as number | undefined) ?? 1) + 1;
      this.findings[at] = { ...f, detail: { ...f.detail, count } };
      return;
    }
    this.seen.set(key, this.findings.length);
    this.findings.push({ kind, area, code, message, owner, seedHex: this.seedHex, season: this.season, ...(detail ? { detail } : {}) });
  }

  /** Runs one stage. A throw is a crash finding, never a lost career. */
  async stage(area: Area, owner: string, fn: () => Promise<string> | string): Promise<boolean> {
    const t0 = performance.now();
    try {
      const summary = await fn();
      this.stages.push({ area, season: this.season, ok: true, ms: Math.round(performance.now() - t0), summary });
      return true;
    } catch (e) {
      const err = e as Error;
      this.add('crash', area, `crash:${firstLine(err.message)}`, `${area} threw: ${firstLine(err.message)}`, owner, { stack: (err.stack ?? '').split('\n').slice(0, 8).join('\n') });
      this.stages.push({ area, season: this.season, ok: false, ms: Math.round(performance.now() - t0), summary: `threw: ${firstLine(err.message)}` });
      return false;
    }
  }
}

function firstLine(s: string): string {
  return (s.split('\n')[0] ?? '').replace(/\d{3,}/g, 'N').slice(0, 160);
}
