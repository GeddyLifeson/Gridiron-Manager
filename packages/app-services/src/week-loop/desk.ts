// The week screens' desk (item 2d): the seat's open game week (SeatWeekLoop) read through the week screens' read
// models (item 9: schedule H1, meetings H4, travel H8, documents H9, press sessions H7.2), plus the user's edits
// to them. The desk holds only what the user changed (agendas, night-before tones, document moves, the documents
// detail, a travel choice); everything else is the loop's week as it stands. Views show words, minutes and
// counts only: no attention value, document quality or seeded error leaves here (K9).
//
// Not here yet, and said so on the screens by a null view:
//   - Travel for an away week needs the trip (zones, flight and road hours, altitudes). The host supplies it;
//     without one the travel view is null for an away week. A chosen plan is recorded, not yet applied to the
//     loop's week (wk.applyTravel moves blocks; the loop owns its week).
//   - A live press conference needs the press corps (generated reporters, front-office press). The host
//     supplies the session; without one the media screen lists the week's sessions only.
//   - Staff do not write documents as the week runs yet: documents move only by the user's actions.
import { calendar, week as wk } from '@gm/league';
import type { press } from '@gm/front-office';
import type { RandomStream } from '@gm/schema';
import { season as seasons } from '@gm/world';
import {
  buildDocumentsView, buildMeetingsView, buildPressView, buildTravelView,
  type AgendaInput, type DocumentsView, type MeetingsView, type PressView, type TravelInput, type TravelView,
} from '../read-models/week/index.ts';
import { answerPress, blandAll, startPress, type PressConference } from '../commands/week/index.ts';
import type { SeatWeekLoop } from './week-loop.ts';
import { P } from './params.ts';

type RuleLookup = Parameters<typeof wk.weekLookup>[0];

/** The league rules for the week checks (H1.1.2), built from the league-rules file values as the season builds them. */
export function weekRules(values: readonly { key: string; value: unknown }[], level: 'pro' | 'college'): RuleLookup {
  const base = calendar.lookupFromValues(values);
  return wk.weekLookup(level === 'pro' ? calendar.calendarLookup(base) : base, level);
}

/** What the host knows that the season does not hold yet. */
export interface WeekDeskHost {
  readonly rules: RuleLookup;
  /** Countable-hours regime (H1.5.2): college. */
  readonly countable: boolean;
  /** The trip of an away week (H8): the season holds no geography for travel yet. */
  trip?(loop: SeatWeekLoop): Omit<TravelInput, 'week' | 'chosen'> | null;
  /** A press session for a media block (front-office press with the press corps), and its stream. */
  pressSession?(loop: SeatWeekLoop, blockId: string): { readonly session: press.PressSession; readonly rng: RandomStream } | null;
}

/** The leader role the head coach fills (H4.1.1): he edits what he leads. */
const USER_ROLES = ['head_coach'] as const;
/** The documents' author when the user takes one to write himself. */
const USER_AUTHOR = 'head_coach';

interface WeekEdits {
  agendas: Record<string, AgendaInput[]>;
  tones: Record<string, string>;
  docs: wk.Document[] | null;
  sentBack: Set<string>;
  detail: 'all' | 'exceptions';
  travel: wk.PlanType | null;
  press: { blockId: string; pc: PressConference; rng: RandomStream } | null;
}

export type DeskResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };
const OK: DeskResult = { ok: true };
const no = (reason: string): DeskResult => ({ ok: false, reason });

export class WeekDesk {
  private readonly edits = new Map<string, WeekEdits>();

  constructor(private readonly loop: () => SeatWeekLoop | null, private readonly host: WeekDeskHost) {}

  private open(): { loop: SeatWeekLoop; e: WeekEdits } | null {
    const loop = this.loop();
    if (!loop || loop.isFinished) return null;
    const id = loop.week.weekId;
    let e = this.edits.get(id);
    if (!e) {
      e = { agendas: {}, tones: {}, docs: null, sentBack: new Set(), detail: 'all', travel: null, press: null };
      this.edits.set(id, e);
    }
    return { loop, e };
  }

  /** The week's documents (H9.1.1): created once per week from the type table, then moved by the user's actions. */
  private docs(loop: SeatWeekLoop, e: WeekEdits): wk.Document[] {
    if (!e.docs) {
      const due = wk.selfScoutDue(weeksSinceBye(loop), seasons.comingOffBye(loop.ctx));
      e.docs = wk.createWeekDocuments(loop.week, { groups: P('documents.groups'), planScale: 1, countable: this.host.countable, selfScoutDue: due });
    }
    return e.docs;
  }

  // ---- views ----

  schedule(): wk.WeekScheduleView | null {
    const o = this.open();
    if (!o) return null;
    const now = o.loop.now();
    const findings = wk.checkWeek(o.loop.week, { rules: this.host.rules });
    return wk.scheduleView(o.loop.week, findings, this.docs(o.loop, o.e).map((d) => wk.documentView(d, now)));
  }

  meetings(): MeetingsView | null {
    const o = this.open();
    if (!o) return null;
    return buildMeetingsView({ week: o.loop.week, agendas: o.e.agendas, userRoles: USER_ROLES, tones: o.e.tones });
  }

  travel(): TravelView | null {
    const o = this.open();
    if (!o) return null;
    const w = o.loop.week;
    const gameId = String(o.loop.game.context.fixture.gameId);
    // A home week needs no trip: the view says so with no plans (H8).
    const none = { gameId, trip: HOME_TRIP, zoneShift: 0, homeAltitudeM: 0, siteAltitudeM: 0 };
    const trip = w.home ? none : this.host.trip?.(o.loop) ?? null;
    if (!trip) return null;
    return buildTravelView({ week: w, ...trip, ...(o.e.travel ? { chosen: o.e.travel } : {}) });
  }

  documents(): DocumentsView | null {
    const o = this.open();
    if (!o) return null;
    return buildDocumentsView({ weekId: o.loop.week.weekId, docs: this.docs(o.loop, o.e), now: o.loop.now(), detail: o.e.detail, sentBack: o.e.sentBack });
  }

  press(): PressView | null {
    const o = this.open();
    if (!o) return null;
    return buildPressView(o.loop.week, o.e.press?.pc ?? null, this.host.rules);
  }

  // ---- the user's edits ----

  /** Adds an item to an agenda the user leads (H4.1.2); a block with no saved agenda starts from empty. */
  addAgendaItem(blockId: string, kind: string): DeskResult {
    const m = this.meeting(blockId);
    if ('reason' in m) return no(m.reason);
    if (!m.view.itemKinds.includes(kind)) return no(`a ${m.view.type} meeting has no ${kind} item`);
    const rows = m.e.agendas[blockId] ?? [];
    m.e.agendas[blockId] = [...rows, { kind, label: '', minutes: P('meeting.newItemMinutes') }];
    return OK;
  }

  removeAgendaItem(blockId: string, n: number): DeskResult {
    const m = this.meeting(blockId);
    if ('reason' in m) return no(m.reason);
    const rows = m.e.agendas[blockId] ?? [];
    if (n < 1 || n > rows.length) return no(`the agenda has no item ${n}`);
    m.e.agendas[blockId] = rows.filter((_, i) => i !== n - 1);
    return OK;
  }

  setTone(blockId: string, tone: string): DeskResult {
    const m = this.meeting(blockId);
    if ('reason' in m) return no(m.reason);
    if (!m.view.tones.includes(tone)) return no(`${tone} is not a night-before tone`);
    m.e.tones[blockId] = tone;
    return OK;
  }

  private meeting(blockId: string): { e: WeekEdits; view: MeetingsView['days'][number]['meetings'][number] } | { reason: string } {
    const o = this.open();
    if (!o) return { reason: 'no game week is open' };
    const view = buildMeetingsView({ week: o.loop.week, agendas: o.e.agendas, userRoles: USER_ROLES, tones: o.e.tones }).days.flatMap((d) => d.meetings).find((x) => x.blockId === blockId);
    if (!view) return { reason: `no meeting ${blockId} this week` };
    if (!view.editable) return { reason: `${view.leader.replace(/_/g, ' ')} leads that meeting` };
    if (view.done) return { reason: 'that meeting is over' };
    return { e: o.e, view };
  }

  chooseTravel(plan: string): DeskResult {
    const v = this.travel();
    const o = this.open();
    if (!v || !o) return no('no trip this week');
    if (!v.options.some((x) => x.plan === plan)) return no(`${plan} is not offered this week`);
    o.e.travel = plan as wk.PlanType;
    return OK;
  }

  setDocumentsDetail(detail: 'all' | 'exceptions'): DeskResult {
    const o = this.open();
    if (!o) return no('no game week is open');
    o.e.detail = detail;
    return OK;
  }

  /** One documents-panel action (H9.1.1, H9.1.2) on a document in a state that offers it. */
  documentAction(id: string, action: string): DeskResult {
    const o = this.open();
    if (!o) return no('no game week is open');
    const docs = this.docs(o.loop, o.e);
    const i = docs.findIndex((d) => d.id === id);
    if (i < 0) return no(`no document ${id} this week`);
    const d = docs[i]!;
    const view = buildDocumentsView({ weekId: o.loop.week.weekId, docs: [d], now: o.loop.now(), detail: 'all' }).rows[0]!;
    if (!(view.actions as readonly string[]).includes(action)) return no(`a ${d.state.replace(/_/g, ' ')} document cannot ${action.replace(/_/g, ' ')}`);
    const at = o.loop.now();
    const put = (next: wk.Document) => { docs[i] = next; };
    switch (action) {
      case 'write':
        if (d.state === 'published') {
          const v = wk.newVersion(d, at);
          docs[i] = v.old;
          docs.push({ ...v.next, id: `${d.id}.v${v.next.version}`, author: USER_AUTHOR });
        } else put({ ...(d.state === 'not_started' ? wk.moveDoc(d, 'draft', at) : d), author: USER_AUTHOR });
        o.e.sentBack.delete(d.id);
        return OK;
      case 'assign': {
        // Back to the type table's author (H9.1.1): the staff member who owns that document.
        const owner = wk.DOC_TYPES.find((t) => t.id === d.type)?.author ?? d.author;
        put({ ...d, author: owner });
        return OK;
      }
      case 'review':
        if (d.state === 'draft') put({ ...wk.moveDoc(d, 'in_review', at), reviewer: USER_AUTHOR });
        return OK;
      case 'approve':
        put(wk.moveDoc(d, 'published', at));
        o.e.sentBack.delete(d.id);
        return OK;
      case 'send_back':
        put(wk.moveDoc(d, 'draft', at));
        o.e.sentBack.add(d.id);
        return OK;
      default:
        return OK;
    }
  }

  /** Opens the press session of a media block (O4.5.2) when the host has its press corps. */
  openPress(blockId: string): DeskResult {
    const o = this.open();
    if (!o) return no('no game week is open');
    const b = wk.allBlocks(o.loop.week).find((x) => x.id === blockId);
    if (!b || b.type !== 'media') return no(`no media session ${blockId} this week`);
    const s = this.host.pressSession?.(o.loop, blockId) ?? null;
    if (!s) return no('the press corps is not in this career yet');
    o.e.press = { blockId, pc: startPress(blockId, s.session, s.rng), rng: s.rng };
    return OK;
  }

  answerPress(choice: string, timedOut: boolean): DeskResult {
    const o = this.open();
    if (!o?.e.press) return no('no press conference is open');
    const p = o.e.press;
    p.pc = answerPress(p.pc, choice, p.rng, o.loop.now(), this.host.rules, o.loop.week, timedOut);
    return OK;
  }

  blandAll(): DeskResult {
    const o = this.open();
    if (!o?.e.press) return no('no press conference is open');
    const p = o.e.press;
    p.pc = blandAll(p.pc, p.rng, o.loop.now(), this.host.rules, o.loop.week);
    return OK;
  }
}

/** A home week's trip: nobody travels (the view lists no plans). */
const HOME_TRIP: wk.Trip = { zonesCrossed: 0, flightHours: 0, roadHours: 0, international: false, thursdayGame: false, tier: null };

/** League weeks since the seat's last bye before this week, or null when it has had none (H9.1.1 self-scout report). */
function weeksSinceBye(loop: SeatWeekLoop): number | null {
  const { week, teamId, results } = loop.ctx;
  const played = new Set(results.filter((r) => r.teams.includes(teamId)).map((r) => r.week));
  for (let w = week - 1; w >= 1; w--) if (!played.has(w)) return week - w;
  return null;
}
