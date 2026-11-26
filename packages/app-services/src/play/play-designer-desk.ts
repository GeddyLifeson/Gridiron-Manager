// The seat's play designer (G-90; O3.1, O3.7): the screen service's ports bound to football-lang `designer`
// with the season's rule set, so a drawn play is snapped, read out, validated and published by the real rules.
//
// What is bound: edits (applyEdit), validation (validateDraft with the rule set and the legality + designer
// parameters), publishing, snapping, the alignment readout and field lines from the rule set's landmarks,
// route names from the F6 route tree (football-content full.ROUTE_TREE), personnel choices the designer can seat.
//
// Not bound yet, and shown as empty rather than made up:
// Looks for the Against tab: each of the defensive designer's calls (football-content DESIGNER_CALLS) lined up
// against the drawn formation by the defensive designer's own resolver, grey markers only (O3.1.1).
// - the test bench: no `runBench` port (the screen says the bench is not available);
// - missing positions: the season's rosters are placeholders (G-17), so the roster check finds none;
// - the formation/motion/protection/concept/tag part lists: the content parts are not in designer form.
// Hours: the E7 ledger does not feed the strip yet. PLACEHOLDER: hours left are the coach's awake hours of the
// week less the design hours charged here.
import { defenseDesigner as dd, full } from '@gm/football-content';
import { designer, legality } from '@gm/football-lang';
import { resolveRuleSet } from '@gm/rules-data';
import type { ParamTable, RuleSet } from '@gm/schema';
import { openSession, playOf, send, type DesignerCommand, type DesignerState } from '../play-designer/session.ts';
import { designerView, type DesignerView } from '../play-designer/view.ts';
import type { CoreEdit, DesignerPorts, FieldLines, HashSpot, HoursStrip, LookOption, MessageLike, PartKind, PartOption, PlayLike, PointLike, Yd2 } from '../play-designer/types.ts';
import { awakeWeekHours } from './team-delegation.ts';

type Draft = designer.PlayDraft;
type Edit = designer.PlayEdit;
/** The designer drafts behave as the screen service's plays (same fields, the content's own types). */
type P = Draft & PlayLike;

const FT_PER_YD = 3;
/** Personnel groups the designer offers (G1.1.1 codes, backs then tight ends); only those it can seat are listed. */
const PERSONNEL = ['00', '01', '02', '10', '11', '12', '13', '20', '21', '22', '23', '31', '32'] as const;
/** Behaviours the designer's own checks know (football-lang designer validate.ts sets), plus standing still. */
const LINE_BEHAVIORS = ['pass_block', 'chip_block', 'run_block', 'block', 'pull', 'stand'] as const;
const BACK_BEHAVIORS = ['route', 'release', 'option_route', 'screen_release', 'pass_block', 'chip_block', 'run_block', 'lead_block', 'block', 'stand'] as const;

export interface PlayDesignerDeskOptions {
  readonly ruleSetId: string;
  /** Game-calendar label for a published version ("2026, week 3"). */
  readonly calendarLabel: () => string;
  /** True during a game (O3.1.4: the bench is off). */
  readonly inGame?: () => boolean;
  /** A published version goes to the playbook (FootballDesk.addDesigned). */
  readonly onPublish?: (play: designer.PlayDraft, version: number) => void;
}

/** One published version; the host's `onPublish` puts it in the playbook. */
export interface PublishedPlay { readonly play: Draft; readonly version: number; readonly label: string }

export class PlayDesignerDesk {
  readonly rules: RuleSet;
  private readonly params: ParamTable;
  private readonly templates: designer.RouteTemplate[];
  private state: DesignerState<P>;
  private seq = 0;
  private usedH = 0;
  private lookCache: { readonly key: string; readonly looks: LookOption[] } | null = null;
  /** Bumped on every command, so the screen redraws. */
  version = 0;
  readonly published: PublishedPlay[] = [];
  readonly ports: DesignerPorts<P, Edit>;

  constructor(private readonly o: PlayDesignerDeskOptions) {
    this.rules = resolveRuleSet(o.ruleSetId);
    this.params = legality.paramTableOf([legality.PARAMS, designer.PARAMS]);
    this.templates = [...full.ROUTE_TREE.values()].map((r) => ({ name: r.name, points: r.points.map((q) => [q.px, q.out] as Yd2) }));
    this.ports = this.bind();
    this.state = openSession(this.fresh('11'));
  }

  private fresh(personnel: string): P {
    return designer.newDraft(`design.${++this.seq}`, personnel, 'user', this.o.calendarLabel()) as P;
  }

  private landmarks(): designer.Landmarks {
    return designer.landmarksOf(this.rules, this.rules.num('field.width_ft') / FT_PER_YD);
  }

  private bind(): DesignerPorts<P, Edit> {
    const params = this.params, rules = this.rules;
    const lines = (hash: HashSpot): FieldLines => {
      const l = this.landmarks();
      const s = designer.sidelines(l, hash);
      const n = l.numbersFromSidelineYd;
      return {
        sidelines: [s.left, s.right],
        hashes: [s.left + l.hashFromSidelineYd, s.right - l.hashFromSidelineYd],
        numbers: n === null ? null : [s.left + n, s.right - n],
      };
    };
    const desk = this;
    return {
      get looks() { return desk.looksFor(playOf(desk.state)); },
      reduce: (play, edit) => designer.applyEdit(play, edit as Edit) as P,
      validate: (play) => designer.validateDraft(play, { rules, params }) as readonly MessageLike[],
      publish: (play, messages, opts) => {
        const r = designer.publishDraft(play, messages as readonly designer.DesignMessage[], { confirmIllegal: opts.confirmIllegal, previous: opts.previous });
        return r.kind === 'published' ? { ...r, play: r.play as P } : r;
      },
      snap: (raw, free) => designer.snapAlignment(raw, params, free),
      snapPath: (from, path) => designer.snapPath(from, path as readonly designer.DrawnPoint[], params) as PointLike[],
      readout: (at, onLine, slots, hash) => designer.alignmentReadout(at, onLine, slots as readonly designer.DesignSlot[], this.landmarks(), hash),
      recognizeRoute: (from, path) => designer.recognizeRoute(from, path as readonly designer.DrawnPoint[], this.templates, params),
      fieldLines: lines,
      behaviors: (role) => (designer.isLineSlot(role) ? LINE_BEHAVIORS : BACK_BEHAVIORS),
      partOptions: (kind: PartKind): readonly PartOption<Edit>[] => (kind === 'personnel'
        ? PERSONNEL.filter((c) => designer.slotsForPersonnel(c) !== null).map((c) => ({ id: c, label: c, edit: { type: 'set_personnel', personnel: c } }))
        : []),
      missingPositions: () => [],
      hours: (): HoursStrip => ({ usedThisWeekH: this.usedH, leftThisWeekH: Math.max(0, awakeWeekHours() - this.usedH), owner: { kind: 'coach' }, assistants: [] }),
      calendarLabel: () => this.o.calendarLabel(),
      inGame: () => this.o.inGame?.() ?? false,
    };
  }

  /** The defensive calls aligned against this formation (the call designer's resolver); a call it cannot read is left out. */
  private looksFor(play: Draft): LookOption[] {
    const key = JSON.stringify(play.slots.map((x) => [x.role, x.at, x.onLine]));
    if (this.lookCache?.key === key) return this.lookCache.looks;
    const look: dd.OffLook = {
      id: 'drawn', name: 'Drawn formation', personnel: play.personnel, motion: null,
      players: play.slots.map((x) => ({ role: x.role, px: x.at[0], py: x.at[1], onLine: x.onLine, eligible: !designer.isLineSlot(x.role) && x.role !== 'Q' && !x.extraTackle })),
    };
    const field = dd.fieldGeometry(this.rules);
    const looks: LookOption[] = [];
    for (const call of dd.DESIGNER_CALLS) {
      try {
        const r = dd.resolve(call, look, { ballYd: 0, qbArm: 'right' }, field);
        looks.push({ id: call.id, label: call.name, markers: r.defenders.map((d) => ({ label: d.label ?? d.slot.pos, at: [d.px, d.py] as Yd2 })) });
      } catch { /* the resolver could not read this formation for that call: no look offered */ }
    }
    this.lookCache = { key, looks };
    return looks;
  }

  view(): DesignerView { return designerView(this.state, this.ports); }

  get play(): Draft { return playOf(this.state); }

  /** Runs a screen command and carries out its effects (hours charged, versions published). */
  send(cmd: DesignerCommand<CoreEdit | Edit>): void {
    const step = send<P, Edit>(this.state, cmd as DesignerCommand<Edit>, this.ports);
    this.state = step.state;
    for (const e of step.effects) {
      if (e.kind === 'charge_hours') this.usedH += e.hours;
      else if (e.kind === 'published') { this.published.push({ play: e.play, version: e.version, label: e.label }); this.o.onPublish?.(e.play, e.version); }
    }
    this.version++;
  }

  /** A new blank draft for a personnel group (the designer's starting picture). */
  newPlay(personnel = '11'): void {
    this.state = openSession(this.fresh(designer.slotsForPersonnel(personnel) ? personnel : '11'));
    this.version++;
  }

  /** The week turned: design hours start again (E7.1.1 a week's hours). */
  newWeek(): void { this.usedH = 0; }
}

