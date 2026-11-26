// Play designer read model (O3.1.1 to O3.1.4, O3.7.2): plain data the screen draws. No football logic:
// alignments, readouts, route names and messages all come from the designer model through the ports.
import * as editor from '../editor/index.ts';
import { designerParam } from './params.ts';
import { playOf, type DesignerState } from './session.ts';
import {
  PART_ORDER, type BenchForm, type BenchReportLike, type DesignerPorts, type DesignerTab, type FieldLines, type HashSpot, type HoursStrip,
  type MessageLevel, type PartKind, type PlayLike, type Yd2,
} from './types.ts';

export interface MarkerView {
  readonly role: string; readonly letter: string; readonly at: Yd2; readonly onLine: boolean;
  readonly selected: boolean; readonly highlighted: boolean; readonly lineman: boolean;
  readonly path: readonly Yd2[]; readonly behavior: string; readonly routeName: string | null;
}
export interface MessageView {
  readonly level: MessageLevel; readonly code: string; readonly roles: readonly string[]; readonly citation: string;
  readonly leaf: string; readonly foul: string | null; readonly messageKey: string; readonly dismissed: boolean;
  readonly detail: string; readonly step: number | null;
}
export interface PartRow { readonly kind: PartKind; readonly value: string; readonly options: readonly { readonly id: string; readonly label: string }[] }
export interface PropertiesView {
  readonly role: string; readonly letter: string; readonly at: Yd2; readonly onLine: boolean; readonly readout: string;
  readonly stance: string; readonly reportsEligible: boolean; readonly extraTackle: boolean;
  readonly behavior: string; readonly behaviors: readonly string[]; readonly routeName: string | null; readonly pathPoints: number;
  readonly rules: readonly string[]; readonly keys: readonly string[]; readonly concept: string; readonly coachingPoint: string;
}
export interface DesignerView {
  readonly playId: string; readonly tab: DesignerTab; readonly hash: HashSpot;
  readonly canvas: { readonly behindYd: number; readonly pastYd: number; readonly lines: FieldLines; readonly markers: readonly MarkerView[];
    readonly drawing: { readonly role: string; readonly target: 'path' | 'motion'; readonly points: readonly Yd2[]; readonly legYd: number | null } | null;
    readonly look: { readonly id: string; readonly markers: readonly { readonly label: string; readonly at: Yd2 }[] } | null;
    readonly motions: readonly { readonly index: number; readonly role: string; readonly path: readonly Yd2[] }[] };
  readonly parts: readonly PartRow[];
  readonly properties: PropertiesView | null;
  readonly messages: readonly MessageView[];
  readonly counts: Readonly<Record<MessageLevel, number>>;
  readonly debounceMs: number;
  readonly missingPositions: readonly string[];
  readonly looks: readonly { readonly id: string; readonly label: string }[];
  readonly rules: {
    readonly kind: string; readonly personnel: string; readonly shotgun: boolean; readonly runDirection: string | null; readonly protection: string | null;
    readonly qb: PlayLike['qb']; readonly intent: PlayLike['intent']; readonly status: string;
    readonly presnap: readonly { readonly index: number; readonly kind: 'shift' | 'motion'; readonly roles: readonly string[] }[];
    readonly ruleFailures: readonly { readonly ruleId: string; readonly role: string | null }[];
  };
  readonly notes: string;
  readonly dismissed: readonly { readonly code: string; readonly role: string | null; readonly reason: string }[];
  readonly editor: { readonly canUndo: boolean; readonly canRedo: boolean; readonly dirty: boolean; readonly versions: readonly { readonly n: number; readonly label: string }[]; readonly base: number };
  readonly publish: { readonly confirm: readonly MessageView[] | null; readonly refused: readonly MessageView[] | null; readonly last: DesignerState<PlayLike>['lastPublish'] };
  readonly hours: HoursStrip & { readonly warnAboveH: number };
  readonly bench: { readonly available: boolean; readonly inGame: boolean; readonly defenses: readonly { readonly id: string; readonly label: string }[]; readonly form: BenchForm; readonly report: BenchReportLike | null };
  readonly error: string | null;
}

const LEVEL_ORDER: readonly MessageLevel[] = ['refused', 'illegal', 'unsound', 'note'];

function partValue(kind: PartKind, p: PlayLike): string {
  switch (kind) {
    case 'personnel': return p.personnel;
    case 'formation': return [p.name.formation || p.formation.id || '', p.name.strength || p.formation.strength].filter(Boolean).join(' ');
    case 'motion': return p.name.motion || (p.presnap.length ? p.presnap.map((x) => x.kind).join(', ') : '');
    case 'protection': return p.name.protection || p.protection?.id || '';
    case 'concept': return p.name.concept;
    case 'tags': return p.name.tags.join(' ');
    case 'qb': return [p.qb.action, p.qb.readType].filter(Boolean).join(', ');
  }
}

const toMsg = (m: MessageView): MessageView => ({
  level: m.level, code: m.code, roles: m.roles, citation: m.citation, leaf: m.leaf, foul: m.foul, messageKey: m.messageKey, dismissed: m.dismissed, detail: m.detail, step: m.step,
});

export function designerView<P extends PlayLike, E extends { readonly type: string }>(s: DesignerState<P>, ports: DesignerPorts<P, E>): DesignerView {
  const p = playOf(s);
  const messages = [...ports.validate(p)].map(toMsg).sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
  const counts = { refused: 0, illegal: 0, unsound: 0, note: 0 } as Record<MessageLevel, number>;
  for (const m of messages) if (!m.dismissed) counts[m.level] += 1;
  const markers: MarkerView[] = p.slots.map((x) => ({
    role: x.role, letter: x.letter, at: x.at, onLine: x.onLine,
    selected: x.role === s.selected, highlighted: s.highlighted.includes(x.role),
    lineman: ['LT', 'LG', 'C', 'RG', 'RT'].includes(x.role),
    path: x.assignment.path.map((q) => q.at), behavior: x.assignment.behavior,
    routeName: x.assignment.path.length ? ports.recognizeRoute(x.at, x.assignment.path) : null,
  }));
  const sel = p.slots.find((x) => x.role === s.selected);
  const look = s.look ? ports.looks.find((l) => l.id === s.look) ?? null : null;
  const hours = ports.hours();
  return {
    playId: p.id, tab: s.tab, hash: s.hash,
    canvas: {
      behindYd: designerParam('designer.canvas.behindYd'), pastYd: designerParam('designer.canvas.pastYd'),
      lines: ports.fieldLines(s.hash), markers,
      drawing: s.drawing ? { role: s.drawing.role, target: s.drawing.target, points: s.drawing.points.map((q) => q.at), legYd: s.drawing.legYd } : null,
      look: look ? { id: look.id, markers: look.markers } : null,
      motions: p.presnap.flatMap((st, index) => (st.kind === 'motion' ? [{ index, role: st.role, path: st.path.map((q) => q.at) }] : [])),
    },
    parts: PART_ORDER.map((kind) => ({ kind, value: partValue(kind, p), options: ports.partOptions(kind, p).map((o) => ({ id: o.id, label: o.label })) })),
    properties: sel ? {
      role: sel.role, letter: sel.letter, at: sel.at, onLine: sel.onLine, readout: ports.readout(sel.at, sel.onLine, p.slots, s.hash),
      stance: sel.stance, reportsEligible: sel.reportsEligible, extraTackle: sel.extraTackle,
      behavior: sel.assignment.behavior, behaviors: ports.behaviors(sel.role),
      routeName: sel.assignment.path.length ? ports.recognizeRoute(sel.at, sel.assignment.path) : null,
      pathPoints: sel.assignment.path.length, rules: sel.assignment.rules.map((r) => r.text), keys: sel.assignment.keys,
      concept: sel.assignment.concept, coachingPoint: p.coachingPoints[sel.role] ?? '',
    } : null,
    messages, counts,
    debounceMs: designerParam('designer.validate.debounceMs'),
    missingPositions: ports.missingPositions(p),
    looks: ports.looks.map((l) => ({ id: l.id, label: l.label })),
    rules: {
      kind: p.kind, personnel: p.personnel, shotgun: p.shotgun, runDirection: p.runDirection, protection: p.protection?.id ?? null,
      qb: p.qb, intent: p.intent, status: p.status,
      presnap: p.presnap.map((st, index) => ({ index, kind: st.kind, roles: st.kind === 'motion' ? [st.role] : st.moves.map((m) => m.role) })),
      ruleFailures: p.ruleFailures,
    },
    notes: p.notes,
    dismissed: p.dismissed,
    editor: {
      canUndo: editor.canUndo(s.draft), canRedo: editor.canRedo(s.draft), dirty: editor.isDirty(s.draft),
      versions: s.draft.versions.map((v) => ({ n: v.n, label: v.label })), base: s.draft.base,
    },
    publish: { confirm: s.confirm ? s.confirm.map(toMsg) : null, refused: s.refused ? s.refused.map(toMsg) : null, last: s.lastPublish },
    hours: { ...hours, warnAboveH: designerParam('designer.hours.warnAboveH') },
    bench: { available: ports.runBench !== undefined, inGame: ports.inGame(), defenses: ports.benchDefenses ?? [], form: s.bench.form, report: s.bench.report },
    error: s.error,
  };
}
