// C9.1.1 weekly honours: per competition and honour group, one offensive, one defensive and one special
// teams player of the week, chosen by a public-statistics score with bonuses for a win and a notable game,
// plus seeded noise. Award names are generic text keys (A6).
import content from './weekly.json' with { type: 'json' };
import { HONOUR, honourDraft, type DraftMeta, type HonourDraft } from './events.ts';
import { param } from './params.ts';
import type { GameLine, Uniform } from './types.ts';

export interface WeeklyContent {
  readonly categories: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly skillPositions: readonly string[];
}
export const WEEKLY_CONTENT: WeeklyContent = content;

export interface WeeklyPick {
  readonly competitionId: number; readonly groupId: number; readonly week: number; readonly category: string;
  readonly personId: number; readonly teamId: number; readonly position: string; readonly score: number;
}

/** Counting-stat score of one line in one category. Zero means the player did nothing the voters count. */
export function statScore(line: GameLine, weights: Readonly<Record<string, number>>): number {
  let s = 0;
  for (const [stat, w] of Object.entries(weights)) s += (line.totals[stat] ?? 0) * w;
  return s;
}

/** One pick per category per group per week. A group with few games still names winners (C9.1.1 edge case). */
export function pickWeekly(lines: readonly GameLine[], rng: Uniform, c: WeeklyContent = WEEKLY_CONTENT): WeeklyPick[] {
  const groups = new Map<string, GameLine[]>();
  for (const l of [...lines].sort((a, b) => a.competitionId - b.competitionId || a.groupId - b.groupId || a.week - b.week || a.personId - b.personId || a.gameId - b.gameId)) {
    if (l.postseason) continue;
    const k = `${l.competitionId}:${l.groupId}:${l.week}`;
    const g = groups.get(k) ?? [];
    g.push(l);
    groups.set(k, g);
  }
  const noise = param('weekly.noise');
  const out: WeeklyPick[] = [];
  for (const g of groups.values()) {
    for (const [category, weights] of Object.entries(c.categories)) {
      let best: WeeklyPick | null = null;
      for (const l of g) {
        const raw = statScore(l, weights);
        // Seeded noise is drawn for every line so the stream position does not depend on who did what.
        const n = (rng.next() + rng.next() - 1) * noise;
        if (raw <= 0) continue;
        const score = raw + (l.won ? param('weekly.winBonus') : 0)
          + ((l.gameNotability ?? 0) >= param('weekly.notableGameScore') ? param('weekly.notableBonus') : 0) + n;
        if (!best || score > best.score) {
          best = { competitionId: l.competitionId, groupId: l.groupId, week: l.week, category, personId: l.personId, teamId: l.teamId, position: l.position, score };
        }
      }
      if (best) out.push(best);
    }
  }
  return out;
}

export function weeklyDrafts(picks: readonly WeeklyPick[], meta: Omit<DraftMeta, 'competitionId' | 'teamId'>): HonourDraft[] {
  return picks.map((p) => honourDraft(HONOUR.weekly, { ...meta, competitionId: p.competitionId, teamId: p.teamId }, p.personId, 'honoured',
    { category: p.category, groupId: p.groupId, week: p.week, score: Math.round(p.score) }, [{ kind: 'team', id: p.teamId }]));
}

/** C9.1.1 acceptance: share of offensive winners at skill positions. */
export function skillShare(picks: readonly WeeklyPick[], c: WeeklyContent = WEEKLY_CONTENT): number {
  const off = picks.filter((p) => p.category === 'offense');
  return off.length === 0 ? 1 : off.filter((p) => c.skillPositions.includes(p.position)).length / off.length;
}
