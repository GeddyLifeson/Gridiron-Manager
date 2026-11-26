// Fixture league and rule values for standings and postseason tests. FIXTURE values, not facts: each
// cites the research row it was taken from so the G-10 fact rows can be checked against it.
//   standings.tie_win_value 0.5: research/audit-r-schedule-tiebreak-playoffs.md 3e item 6 (2 of 3).
//   tiebreak.common_games_min 4: same file 3c step 3 (Verified).
//   tiebreak.restarts restart_on_three: 3b and 3d notes (1 of 3).
//   playoff.field_size 7: section 4 (Verified).
import type { ClubPlace, GameResult, RuleValues, TeamId, TieDraw } from '../../src/standings/index.ts';

export const PRO_RULES: RuleValues = {
  'standings.tie_win_value': 0.5,
  'tiebreak.common_games_min': 4,
  'tiebreak.restarts': 'restart_on_three',
  'playoff.field_size': 7,
};

/**
 * Two conferences of four divisions of four clubs. Conference 1: divisions 11 to 14, clubs 1 to 16
 * (division 11 = 1-4, 12 = 5-8, 13 = 9-12, 14 = 13-16). Conference 2: divisions 21 to 24, clubs 17 to 32.
 */
export function proLeague(): ClubPlace[] {
  const out: ClubPlace[] = [];
  for (let id = 1; id <= 32; id++) {
    const conf = id <= 16 ? 1 : 2;
    const div = conf * 10 + Math.floor(((id - 1) % 16) / 4) + 1;
    out.push({ id, conferenceId: conf, divisionId: div });
  }
  return out;
}

export class Games {
  private next = 1;
  readonly list: GameResult[] = [];
  /** home beats/loses to away by the score given. Touchdowns default to points / 7 rounded down. */
  add(home: TeamId, away: TeamId, hp: number, ap: number, opts: Partial<Pick<GameResult, 'touchdowns' | 'forfeit' | 'neutralSite' | 'phase' | 'week' | 'overtime'>> = {}): this {
    const id = this.next++;
    this.list.push({
      gameId: id, week: opts.week ?? id, phase: opts.phase ?? 'regular', teams: [home, away], points: [hp, ap],
      touchdowns: opts.touchdowns ?? [Math.floor(hp / 7), Math.floor(ap / 7)], overtime: opts.overtime ?? false,
      forfeit: opts.forfeit ?? false, neutralSite: opts.neutralSite ?? false,
    });
    return this;
  }
}

/** A draw that always returns the ids in the order given by `prefer`, then the rest ascending. */
export function fixedDraw(prefer: TeamId[] = []): TieDraw & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    draw(ids, label) {
      calls.push(label);
      return [...prefer.filter((p) => ids.includes(p)), ...ids.filter((i) => !prefer.includes(i))];
    },
  };
}

/** Deterministic uniform source for tests (a small LCG over integers; test code may use literals). */
export function lcg(seed: number): { next(): number } {
  let s = seed >>> 0;
  return { next() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; } };
}

/** A draw backed by the LCG: a seeded shuffle. */
export function seededDraw(seed: number): TieDraw {
  const r = lcg(seed);
  return {
    draw(ids) {
      const a = [...ids];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
      return a;
    },
  };
}
