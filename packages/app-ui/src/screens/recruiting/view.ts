// The parts of the recruiting board read model (app-services read-models/recruiting) this screen shows, and
// the intents it sends back. Declared here because app-ui imports only the app-services entry point, which
// re-exports the read model once the integrator adds its barrel line (CR-RB-3).
import TEXT from './text.json';

const STRINGS: Record<string, string> = (TEXT as { strings: Record<string, string> }).strings;
export const hasRbText = (id: string): boolean => Object.prototype.hasOwnProperty.call(STRINGS, id);
export const rbTextIds = (): string[] => Object.keys(STRINGS);
/** The string for an id with `{slot}` filled; an unknown id shows itself so a gap is visible. */
export function rb(id: string, slots: Record<string, string | number> = {}): string {
  const s = STRINGS[id];
  if (s === undefined) return id;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in slots ? String(slots[k]) : m));
}

export const TABS = ['board', 'pool', 'calendar', 'numbers', 'area', 'violations', 'portal'] as const;
export type Tab = (typeof TABS)[number];

type Button = 'do_it' | 'suggest';
export type RightButton = Button | 'none';
export type Verb = 'evaluate' | 'contact' | 'visit' | 'offer' | 'plan';

export interface UiGrade {
  value: number; scaleMax: number; grader: 'first_pass' | 'position_coach'; lastLookDay: number | null;
  looks: readonly { kind: string; count: number }[]; confidence: 'firm' | 'fair' | 'thin';
  band: Readonly<Record<string, number>>; measured: { heightIn: number; weightLb: number; fortyS: number } | null; userGrade: number | null;
}
export interface UiAction {
  kind: string; verb: Verb; hours: number; button: Button; breaches: readonly string[];
  warning: { classId: string; ruleText: string; body: string; penaltyText: string } | null;
}
export interface UiRow {
  personId: number; name: string; classYear: number; position: string; region: string; heightIn: number; weightLb: number;
  source: 'high_school' | 'juco'; publicStars: number; publicRank: number | null;
  status: { kind: 'open' | 'committed' | 'signed'; team: string | null; ours: boolean };
  grade: UiGrade | null;
  read: { standing: string; basis: string | null; asOf: number | null; reasons: readonly { key: string; positive: boolean; basis: string; day: number }[]; rivals: readonly { team: string; basis: string; day: number }[] } | null;
  circle: readonly { memberId: number; name: string; relation: string; influence: string; caresAbout: readonly string[]; basis: string }[];
  firmness: { word: string; basis: string; day: number } | null;
  academics: { word: string; basis: string; day: number } | null;
  ourOffer: { day: number; committable: boolean } | null;
  otherOffers: readonly string[];
  visits: { official: readonly number[]; unofficial: readonly number[] };
  inQueue: boolean;
  nextContactDay: number | null;
  actions: readonly UiAction[];
}
export interface RecruitingUi {
  teamId: number; day: number; classYear: number; period: string | null; model: string | null; hoursLeft: number | null;
  rights: Readonly<Record<Verb, RightButton>>;
  list: 'board' | 'pool' | 'offered' | 'queue';
  filter: { position: string | null; region: string | null; source: string | null };
  rows: readonly UiRow[]; total: number;
  counts: { onBoard: number; watched: number; offers: number; committed: number; signed: number };
  numbers: {
    rows: readonly { position: string; returning: number; target: number; committed: number; signed: number; offersOut: number; open: number; heldForTransfer: number }[];
    returning: number; incoming: number; total: number; limit: number | null; signeeCap: number | null; placesOpen: number | null;
  };
  calendar: {
    from: number; to: number; stretches: readonly { from: number; to: number; period: string | null }[];
    signing: { earlyOpen: number | null; earlyClose: number | null; february: number | null }; visitsHosted: number; visitCap: number | null;
  };
  area: readonly { region: string; prospects: number; graded: number; offered: number; committedToUs: number }[];
  violations: readonly { logId: number; day: number; actor: string; prospect: string | null; rules: readonly string[] }[];
  portal: { available: boolean; window: { open: number; close: number } | null; openNow: boolean; rows: readonly { personId: number; name: string; position: string; fromTeam: string; enteredDay: number }[] };
}

/** What the screen asks the host to do. The host turns each into an app-services recruiting command. */
export type RecruitingIntent =
  | { kind: 'act'; act: string; prospectId: number; goAhead: boolean }
  | { kind: 'film'; prospectId: number; look: 'first_pass_film' | 'full_film' }
  | { kind: 'offer'; prospectId: number; committable: boolean }
  | { kind: 'set_committable'; prospectId: number; committable: boolean }
  | { kind: 'withdraw'; prospectId: number }
  | { kind: 'queue'; prospectId: number }
  | { kind: 'grade'; prospectId: number; grade: number }
  | { kind: 'filter'; position: string | null; region: string | null; source: string | null };

/** Calendar day number to an ISO date, for display only (the read model speaks in day numbers). */
export type DayLabel = (day: number) => string;
