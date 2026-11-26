// The question catalogue (topics.json), the session table (sessions.json) and the measured real-world mix
// (research.json, backed by facts.json). Topics come from classified real transcripts (research/press/);
// the wording is design. Every research code has at least one topic, so every kind of question a real
// reporter asked can be asked here.
import type { HarmClass } from '@gm/schema';
import topicsJson from './topics.json' with { type: 'json' };
import sessionsJson from './sessions.json' with { type: 'json' };
import researchJson from './research.json' with { type: 'json' };
import { SESSION_KINDS, type Level, type SessionKind, type Tone } from './types.ts';

/** The 41 question codes of the research taxonomy (research/press/taxonomy.md). */
export const QUESTION_CODES = [
  'result_overall', 'specific_play', 'decision_call', 'play_calling_role', 'unit_performance', 'player_performance',
  'qb_performance', 'qb_change', 'depth_chart', 'injury_status', 'roster_move', 'trade', 'contract', 'draft_free_agency',
  'opponent_team', 'opponent_player', 'opponent_coach', 'rivalry_history', 'scheme_philosophy', 'game_plan', 'practice_prep',
  'culture_leadership', 'discipline_conduct', 'officiating_rules', 'penalties', 'job_security', 'coach_career_self', 'staff',
  'standings_stakes', 'schedule_travel_weather', 'fans_crowd', 'media_reports', 'recruiting', 'transfer_nil',
  'off_field_player', 'personal_family', 'social_issue', 'player_safety_health', 'analytics_stats', 'milestone_record', 'other',
] as const;
export type QuestionCode = (typeof QUESTION_CODES)[number];

export interface Topic {
  readonly id: string;
  readonly code: QuestionCode;
  readonly level: 'both' | Level;
  readonly evergreen: boolean;
  readonly harm: HarmClass;
  readonly triggers: readonly string[];
  /** Neutral and soft wordings. */
  readonly n: readonly string[];
  /** Probing and hostile wordings. */
  readonly p: readonly string[];
}

export interface SessionRow {
  readonly research?: string;
  readonly questions: Readonly<Partial<Record<Level, number>>>;
  readonly gameDay?: number;
  readonly mult?: Readonly<Record<string, number>>;
  readonly only?: readonly string[];
  readonly toneShift?: number;
}

export interface LevelResearch {
  readonly share: Readonly<Record<string, number>>;
  readonly tone: Readonly<Record<Tone, number>>;
  readonly followup: number;
  readonly perSession: Readonly<Record<string, number>>;
}

type RawTopic = Omit<Topic, 'evergreen' | 'code'> & { evergreen: number; code: string };

export const TOPICS: readonly Topic[] = (topicsJson.topics as RawTopic[]).map((t) => ({ ...t, code: t.code as QuestionCode, evergreen: t.evergreen === 1 }));
export const HOSTILE_LEADS: readonly string[] = topicsJson.hostileLeads;
export const FOLLOW_UPS: Readonly<Record<string, readonly string[]>> = topicsJson.followUps;
export const SESSIONS: Readonly<Record<SessionKind, SessionRow>> = sessionsJson.sessions as Record<SessionKind, SessionRow>;
export const RESEARCH: Readonly<Record<Level, LevelResearch>> = researchJson.levels as unknown as Record<Level, LevelResearch>;

/** Every PressEvent type some topic listens for. The world runner maps its event rows onto these. */
export const TRIGGER_TYPES: readonly string[] = [...new Set(TOPICS.flatMap((t) => t.triggers))].sort();

const BY_ID = new Map(TOPICS.map((t) => [t.id, t] as const));
export function topic(id: string): Topic {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`press: unknown topic ${id}`);
  return t;
}

/** Content checks: run by the test and by the content build. Empty means the catalogue is sound. */
export function catalogueProblems(): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const t of TOPICS) {
    if (ids.has(t.id)) out.push(`topic ${t.id}: duplicate id`);
    ids.add(t.id);
    if (!(QUESTION_CODES as readonly string[]).includes(t.code)) out.push(`topic ${t.id}: unknown code ${t.code}`);
    if (t.n.length === 0 || t.p.length === 0) out.push(`topic ${t.id}: needs neutral and pointed wordings`);
    if (!t.evergreen && t.triggers.length === 0) out.push(`topic ${t.id}: neither evergreen nor triggered, so it can never be asked`);
  }
  for (const c of QUESTION_CODES) if (!TOPICS.some((t) => t.code === c)) out.push(`code ${c}: no topic`);
  for (const k of SESSION_KINDS) {
    const s = SESSIONS[k];
    if (!s) { out.push(`session ${k}: missing`); continue; }
    for (const c of [...Object.keys(s.mult ?? {}), ...(s.only ?? [])]) {
      if (!(QUESTION_CODES as readonly string[]).includes(c)) out.push(`session ${k}: unknown code ${c}`);
    }
  }
  for (const lv of ['pro', 'college'] as const) {
    const r = RESEARCH[lv];
    for (const c of Object.keys(r.share)) if (!(QUESTION_CODES as readonly string[]).includes(c)) out.push(`research ${lv}: unknown code ${c}`);
  }
  return out;
}
