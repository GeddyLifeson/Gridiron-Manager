// League-rules files (C5, C6, T5): roster, cap, staff and schedule values per level, each citing a fact
// row like the rule sets do. Loaded here so the browser app and the tools read the same files (the tools
// used to read them by path). A lookup merges a level's league files; the caller adds its rule set.
import proLeague from '../../data/league/proleague_2026.json' with { type: 'json' };
import proScheduleStaff from '../../data/league/proleague_schedule_staff_2026.json' with { type: 'json' };
import collegeLeague from '../../data/league/collegeleague_2026.json' with { type: 'json' };
import collegeScheduleStaff from '../../data/league/collegeleague_schedule_staff_2026.json' with { type: 'json' };

export interface LeagueRulesValue { readonly key: string; readonly value: unknown; readonly unit?: string; readonly factId?: string }
export interface LeagueRulesFile { readonly ruleset_id: string; readonly level: string; readonly season_year: number; readonly values: readonly LeagueRulesValue[] }

export const LEAGUE_RULES_FILES: readonly LeagueRulesFile[] = [
  proLeague, proScheduleStaff, collegeLeague, collegeScheduleStaff,
] as unknown as readonly LeagueRulesFile[];

/** Numeric league-rules values of a level ('pro' or 'college'), by key. A key in two files of one level is an error. */
export function leagueNumbers(level: 'pro' | 'college'): ReadonlyMap<string, number> {
  const m = new Map<string, number>();
  for (const f of LEAGUE_RULES_FILES) {
    if (f.level !== level) continue;
    for (const v of f.values) {
      if (typeof v.value !== 'number') continue;
      if (m.has(v.key)) throw new Error(`league rules: ${v.key} is set twice for ${level}`);
      m.set(v.key, v.value);
    }
  }
  return m;
}
