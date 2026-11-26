// Play designer session (O3.1.1 to O3.1.4, O3.7.1, O3.7.2). A pure reducer over the shared editor core:
// the screen sends commands, the session turns them into play edits (one undo step each, O3.1.2) and
// returns effects the host carries out (autosave, hour charges, publish, delegation). The canvas holds
// no data of its own: everything drawn comes from the draft (O3.1.1 rules and logic).
import * as editor from '../editor/index.ts';
import { designerParam } from './params.ts';
import type {
  BenchForm, BenchReportLike, CoreEdit, DesignerPorts, DesignerTab, HashSpot, MessageLike, PartKind, PlayLike, PointKind, PointLike, Yd2,
} from './types.ts';

/** A route or motion being drawn: committed as one edit when finished. */
export interface Drawing { readonly role: string; readonly target: 'path' | 'motion'; readonly points: readonly PointLike[]; readonly legYd: number | null }

export interface DesignerState<P extends PlayLike> {
  readonly draft: editor.Draft<P>;
  readonly tab: DesignerTab;
  readonly hash: HashSpot;
  readonly selected: string | null;
  readonly highlighted: readonly string[];
  readonly look: string | null;
  readonly drawing: Drawing | null;
  /** Illegal messages waiting on the one confirmation before publishing (O3.1.3). */
  readonly confirm: readonly MessageLike[] | null;
  readonly lastPublish: { readonly version: number; readonly illegalAsDrawn: boolean; readonly newTeaching: readonly string[] } | null;
  readonly refused: readonly MessageLike[] | null;
  readonly bench: { readonly form: BenchForm; readonly report: BenchReportLike | null };
  /** Typed reason box for dismissing an unsound message (O3.1.3 edge case). */
  readonly error: string | null;
}

export type DesignerCommand<E> =
  | { readonly type: 'edit'; readonly edit: E }
  | { readonly type: 'undo' } | { readonly type: 'redo' }
  | { readonly type: 'tab'; readonly tab: DesignerTab }
  | { readonly type: 'hash'; readonly hash: HashSpot }
  | { readonly type: 'select'; readonly role: string | null }
  /** Keyboard: select a player by his position letter (O3.1.2). */
  | { readonly type: 'select_letter'; readonly letter: string }
  | { readonly type: 'select_next'; readonly step: 1 | -1 }
  | { readonly type: 'highlight'; readonly roles: readonly string[] }
  | { readonly type: 'look'; readonly id: string | null }
  | { readonly type: 'drag'; readonly role: string; readonly raw: Yd2; readonly free: boolean }
  | { readonly type: 'nudge'; readonly dDepth: number; readonly dLateral: number; readonly free: boolean }
  | { readonly type: 'toggle_line' }
  | { readonly type: 'draw_begin'; readonly target: 'path' | 'motion' }
  | { readonly type: 'draw_point'; readonly raw: Yd2; readonly kind: PointKind }
  /** Keyboard: one leg of `legYd` (number keys) toward break direction 0..7, 0 upfield, clockwise (O3.1.2). */
  | { readonly type: 'draw_leg_length'; readonly yd: number }
  | { readonly type: 'draw_leg'; readonly dir: number; readonly kind: PointKind }
  | { readonly type: 'draw_end'; readonly behavior: string | null; readonly free: boolean }
  | { readonly type: 'draw_cancel' }
  | { readonly type: 'set_behavior'; readonly behavior: string }
  | { readonly type: 'clear_path' }
  | { readonly type: 'remove_presnap'; readonly index: number }
  | { readonly type: 'mirror' }
  | { readonly type: 'choose_part'; readonly kind: PartKind; readonly id: string }
  | { readonly type: 'dismiss'; readonly code: string; readonly role: string | null; readonly reason: string }
  | { readonly type: 'restore_warning'; readonly code: string; readonly role: string | null }
  | { readonly type: 'notes'; readonly text: string }
  | { readonly type: 'publish'; readonly confirmIllegal: boolean }
  | { readonly type: 'cancel_publish' }
  | { readonly type: 'restore_version'; readonly n: number }
  | { readonly type: 'bench_form'; readonly patch: Partial<BenchForm> }
  | { readonly type: 'bench_run' }
  | { readonly type: 'delegate'; readonly assistantId: string };

export type DesignerEffect<P> =
  | { readonly kind: 'autosave'; readonly draftId: string; readonly json: string }
  | { readonly kind: 'published'; readonly play: P; readonly version: number; readonly label: string }
  | { readonly kind: 'charge_hours'; readonly actionClass: string; readonly hours: number }
  | { readonly kind: 'delegate'; readonly assistantId: string; readonly playId: string };

export interface Step<P extends PlayLike> { readonly state: DesignerState<P>; readonly effects: readonly DesignerEffect<P>[] }

const R = Math.SQRT1_2;
/** Break directions in drawn axes (depth upfield positive, lateral right positive), clockwise from upfield. */
export const BREAKS: readonly Yd2[] = [[1, 0], [R, R], [0, 1], [-R, R], [-1, 0], [-R, -R], [0, -1], [R, -R]];

export function defaultBenchForm(): BenchForm {
  return { defenseIds: [], down: 1, distanceYd: 10, yardsToGoal: 75, hash: 'middle', runs: 200, seed: 1, knowledge: 'fully_installed' };
}

export function openSession<P extends PlayLike>(play: P, versions: readonly editor.Version[] = [], benchRuns = 200): DesignerState<P> {
  return {
    draft: editor.createDraft<P>(play.id, play, versions),
    tab: 'draw', hash: 'middle', selected: null, highlighted: [], look: null, drawing: null,
    confirm: null, lastPublish: null, refused: null, error: null,
    bench: { form: { ...defaultBenchForm(), runs: benchRuns }, report: null },
  };
}

export const playOf = <P extends PlayLike>(s: DesignerState<P>): P => editor.valueOf(s.draft);

const slotOf = (p: PlayLike, role: string | null) => (role === null ? undefined : p.slots.find((x) => x.role === role));
const round1 = (x: number): number => Math.round(x * 10) / 10;

/** Run one command. Pure: same state and command give the same step. */
export function send<P extends PlayLike, E extends { readonly type: string }>(
  s: DesignerState<P>, cmd: DesignerCommand<E>, ports: DesignerPorts<P, E>,
): Step<P> {
  const same: Step<P> = { state: s, effects: [] };
  const edit = (e: CoreEdit | E, extra: Partial<DesignerState<P>> = {}): Step<P> => {
    const draft = editor.apply(s.draft, e, (v: P, x: CoreEdit | E) => ports.reduce(v, x));
    const state = { ...s, ...extra, draft, confirm: null, refused: null, error: null };
    return { state, effects: draft === s.draft ? [] : [{ kind: 'autosave', draftId: draft.id, json: draft.json }] };
  };
  const play = playOf(s);
  const sel = slotOf(play, s.selected);
  switch (cmd.type) {
    case 'edit': return edit(cmd.edit);
    case 'undo': case 'redo': {
      const draft = cmd.type === 'undo' ? editor.undo(s.draft) : editor.redo(s.draft);
      if (draft === s.draft) return same;
      return { state: { ...s, draft, drawing: null, confirm: null }, effects: [{ kind: 'autosave', draftId: draft.id, json: draft.json }] };
    }
    case 'tab': return { state: { ...s, tab: cmd.tab, drawing: null }, effects: [] };
    case 'hash': return { state: { ...s, hash: cmd.hash }, effects: [] };
    case 'select': return { state: { ...s, selected: slotOf(play, cmd.role) ? cmd.role : null, drawing: null }, effects: [] };
    case 'select_letter': {
      const l = cmd.letter.toUpperCase();
      const hit = play.slots.find((x) => x.letter.toUpperCase() === l) ?? play.slots.find((x) => x.role.toUpperCase() === l);
      return hit ? { state: { ...s, selected: hit.role, drawing: null }, effects: [] } : same;
    }
    case 'select_next': {
      if (play.slots.length === 0) return same;
      const i = sel ? play.slots.indexOf(sel) : -1;
      const n = play.slots.length;
      const next = play.slots[i < 0 ? (cmd.step > 0 ? 0 : n - 1) : ((i + cmd.step) % n + n) % n]!;
      return { state: { ...s, selected: next.role, drawing: null }, effects: [] };
    }
    case 'highlight': return { state: { ...s, highlighted: cmd.roles }, effects: [] };
    case 'look': return { state: { ...s, look: ports.looks.some((l) => l.id === cmd.id) ? cmd.id : null }, effects: [] };
    case 'drag': {
      if (!slotOf(play, cmd.role)) return same;
      const at = ports.snap(cmd.raw, cmd.free);
      return edit({ type: 'move_slot', role: cmd.role, at: at.at, onLine: at.onLine }, { selected: cmd.role });
    }
    case 'nudge': {
      if (!sel) return same;
      const step = designerParam('designer.keys.nudgeYd');
      const raw: Yd2 = [sel.at[0] + cmd.dDepth * step, sel.at[1] + cmd.dLateral * step];
      const at = ports.snap(raw, cmd.free);
      return edit({ type: 'move_slot', role: sel.role, at: at.at, onLine: at.onLine });
    }
    case 'toggle_line': {
      if (!sel) return same;
      // The designer forces an on or off choice (G1.5.1): on the line is depth 0, off is one snap step back.
      const at = sel.onLine ? ports.snap([-1, sel.at[1]], false) : { at: [0, sel.at[1]] as Yd2, onLine: true };
      return edit({ type: 'move_slot', role: sel.role, at: at.at, onLine: !sel.onLine });
    }
    case 'draw_begin': {
      if (!sel) return same;
      return { state: { ...s, drawing: { role: sel.role, target: cmd.target, points: [], legYd: null } }, effects: [] };
    }
    case 'draw_point': {
      if (!s.drawing) return same;
      return { state: { ...s, drawing: { ...s.drawing, points: [...s.drawing.points, { at: cmd.raw, kind: cmd.kind, landmark: null }] } }, effects: [] };
    }
    case 'draw_leg_length': {
      if (!s.drawing) return same;
      return { state: { ...s, drawing: { ...s.drawing, legYd: cmd.yd } }, effects: [] };
    }
    case 'draw_leg': {
      const d = s.drawing;
      const from = d ? (d.points[d.points.length - 1]?.at ?? slotOf(play, d.role)?.at) : undefined;
      if (!d || !from) return same;
      const dir = BREAKS[((cmd.dir % 8) + 8) % 8]!;
      const len = d.legYd ?? designerParam('designer.keys.legYd');
      const at: Yd2 = [round1(from[0] + dir[0] * len), round1(from[1] + dir[1] * len)];
      return { state: { ...s, drawing: { ...d, points: [...d.points, { at, kind: cmd.kind, landmark: null }], legYd: null } }, effects: [] };
    }
    case 'draw_cancel': return { state: { ...s, drawing: null }, effects: [] };
    case 'draw_end': {
      const d = s.drawing;
      const slot = d ? slotOf(play, d.role) : undefined;
      if (!d || !slot) return { state: { ...s, drawing: null }, effects: [] };
      const path = cmd.free ? [...d.points] : ports.snapPath(slot.at, d.points);
      if (d.target === 'motion') {
        if (path.length === 0) return { state: { ...s, drawing: null }, effects: [] };
        const last = path[path.length - 1]!.at;
        return edit({
          type: 'insert_presnap', index: play.presnap.length,
          step: { kind: 'motion', role: d.role, path, onLine: last[0] === 0, stops: true, setAfterS: 1, speed: null },
        }, { drawing: null });
      }
      const behavior = cmd.behavior ?? (slot.assignment.behavior || 'route');
      return edit({ type: 'set_path', role: d.role, behavior, path }, { drawing: null });
    }
    case 'set_behavior': {
      if (!sel) return same;
      return edit({ type: 'set_path', role: sel.role, behavior: cmd.behavior, path: sel.assignment.path });
    }
    case 'clear_path': {
      if (!sel) return same;
      return edit({ type: 'set_path', role: sel.role, behavior: sel.assignment.behavior, path: [] });
    }
    case 'remove_presnap': return edit({ type: 'remove_presnap', index: cmd.index });
    case 'mirror': return edit({ type: 'mirror' });
    case 'choose_part': {
      const opt = ports.partOptions(cmd.kind, play).find((o) => o.id === cmd.id);
      return opt ? edit(opt.edit) : same;
    }
    case 'dismiss': {
      const reason = cmd.reason.trim();
      if (!reason) return { state: { ...s, error: 'designer.dismiss.needs_reason' }, effects: [] };
      const m = ports.validate(play).find((x) => x.code === cmd.code && (cmd.role === null || x.roles.includes(cmd.role)));
      // Only unsound messages are dismissed; illegal ones stay as the "illegal as drawn" mark (O3.1.3).
      if (!m || m.level !== 'unsound') return { state: { ...s, error: 'designer.dismiss.not_unsound' }, effects: [] };
      return edit({ type: 'dismiss_warning', code: cmd.code, role: cmd.role, reason });
    }
    case 'restore_warning': return edit({ type: 'restore_warning', code: cmd.code, role: cmd.role });
    case 'notes': return edit({ type: 'set_notes', notes: cmd.text });
    case 'cancel_publish': return { state: { ...s, confirm: null }, effects: [] };
    case 'publish': {
      const messages = ports.validate(play);
      const previous = editor.live(s.draft);
      const r = ports.publish(play, messages, { confirmIllegal: cmd.confirmIllegal, previous });
      if (r.kind !== 'published') {
        return r.kind === 'refused' ? { state: { ...s, refused: r.messages, confirm: null }, effects: [] } : { state: { ...s, confirm: r.messages }, effects: [] };
      }
      const replaced = editor.apply(s.draft, r.play, (_v: P, next: P) => next);
      const label = ports.calendarLabel();
      const out = editor.publish(replaced, label);
      const version = out.published!.n;
      return {
        state: { ...s, draft: out.draft, confirm: null, refused: null, lastPublish: { version, illegalAsDrawn: r.illegalAsDrawn, newTeaching: r.newTeaching } },
        effects: [{ kind: 'autosave', draftId: out.draft.id, json: out.draft.json }, { kind: 'published', play: r.play, version, label }],
      };
    }
    case 'restore_version': {
      if (!s.draft.versions.some((v) => v.n === cmd.n)) return same;
      const draft = editor.restore(s.draft, cmd.n);
      return { state: { ...s, draft }, effects: [{ kind: 'autosave', draftId: draft.id, json: draft.json }] };
    }
    case 'bench_form': return { state: { ...s, bench: { ...s.bench, form: { ...s.bench.form, ...cmd.patch } } }, effects: [] };
    case 'bench_run': {
      if (!ports.runBench) return same;
      const report = ports.runBench(play, s.bench.form, ports.inGame());
      const effects: DesignerEffect<P>[] = report.refusedBecause === null && report.hourCharge.hours > 0
        ? [{ kind: 'charge_hours', actionClass: report.hourCharge.actionClass, hours: report.hourCharge.hours }] : [];
      return { state: { ...s, bench: { ...s.bench, report } }, effects };
    }
    case 'delegate': {
      if (!ports.hours().assistants.some((a) => a.id === cmd.assistantId)) return same;
      return { state: s, effects: [{ kind: 'delegate', assistantId: cmd.assistantId, playId: play.id }] };
    }
  }
}
