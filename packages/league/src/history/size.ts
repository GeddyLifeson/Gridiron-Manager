// Size report for the event log (X2.4.1 outputs: "size report to P6"). Bytes are canonical JSON as UTF-8,
// before compression, so the figure is an upper bound on the stored size.
import type { WorldEvent } from '@gm/schema';
import { canonicalJson, utf8Length } from './hash.ts';
import { SEASONS_IN_SIZE_BUDGET, SIZE_BUDGET_BYTES_AT_SEASON_30 } from './params.ts';

export interface SizeReport {
  readonly rows: number;
  readonly bytes: number;
  readonly seasons: number;
  readonly bytesBySeason: Readonly<Record<string, number>>;
  readonly rowsBySeason: Readonly<Record<string, number>>;
  readonly bytesByTier: Readonly<Record<string, number>>;
  readonly bytesByType: Readonly<Record<string, number>>;
  /** Budget for this many seasons, scaled from the season-30 line (params.ts). */
  readonly budgetBytes: number;
  readonly withinBudget: boolean;
}

function add(m: Record<string, number>, k: string | number, v: number): void { m[String(k)] = (m[String(k)] ?? 0) + v; }

export function sizeReport(rows: readonly WorldEvent[]): SizeReport {
  const bySeason: Record<string, number> = {};
  const rowsBySeason: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let bytes = 0;
  for (const r of rows) {
    const b = utf8Length(canonicalJson(r));
    bytes += b;
    add(bySeason, r.when.date.seasonYear, b);
    add(rowsBySeason, r.when.date.seasonYear, 1);
    add(byTier, r.tier, b);
    add(byType, r.type, b);
  }
  const seasons = Object.keys(bySeason).length;
  const budgetBytes = (SIZE_BUDGET_BYTES_AT_SEASON_30 / SEASONS_IN_SIZE_BUDGET) * seasons;
  return { rows: rows.length, bytes, seasons, bytesBySeason: bySeason, rowsBySeason, bytesByTier: byTier, bytesByType: byType, budgetBytes, withinBudget: bytes <= budgetBytes };
}
