// Fake designer ports for the session tests. The real ports are football-lang `designer` functions the
// integrator binds once the barrel exports them; these fakes follow the same contracts on a tiny model:
// moves and paths change the play, fewer than seven on the line is illegal, a slot with no assignment is
// unsound, a duplicate role is refused.
import type { CoreEdit, DesignerPorts, MessageLike, PlayLike, SlotLike, Yd2, BenchReportLike, PointLike } from '../../src/play-designer/index.ts';

type Edit = CoreEdit | { readonly type: 'set_letter'; readonly role: string; readonly letter: string } | { readonly type: 'dup_role' };

const slot = (role: string, at: Yd2, onLine: boolean): SlotLike => ({
  role, letter: role.slice(0, 1), at, onLine, stance: onLine ? 'three_point' : 'two_point', reportsEligible: false, extraTackle: false,
  assignment: { behavior: '', path: [], concept: '', keys: [], rules: [] },
});

export function play(): PlayLike {
  return {
    id: 'p1', name: { formation: 'Doubles', strength: 'right', motion: '', protection: '', concept: '', tags: [] }, kind: 'dropback_pass', personnel: '11',
    formation: { id: null, strength: 'right' },
    slots: [
      slot('LT', [0, -4], true), slot('LG', [0, -2], true), slot('C', [0, 0], true), slot('RG', [0, 2], true), slot('RT', [0, 4], true),
      slot('X', [0, -18], true), slot('Y', [0, 6], true), slot('Z', [-1, 15], false), slot('H', [-1, -10], false), slot('Q', [-5, 0], false), slot('F', [-7, 0], false),
    ],
    presnap: [], qb: { action: 'dropback', dropSteps: 5, readType: 'progression', progression: [], throwAway: '' },
    protection: null, runDirection: null, shotgun: true, intent: { role: 'base', beats: [], checkOutOf: [] }, coachingPoints: {},
    status: 'draft', ruleFailures: [], dismissed: [], notes: '', version: 0,
  };
}

const setSlot = (p: PlayLike, role: string, f: (s: SlotLike) => SlotLike): PlayLike => ({ ...p, slots: p.slots.map((s) => (s.role === role ? f(s) : s)) });
const neg = (x: number) => (x === 0 ? 0 : -x);
const mirrorPts = (ps: readonly PointLike[]): PointLike[] => ps.map((q) => ({ ...q, at: [q.at[0], neg(q.at[1])] as Yd2 }));

function reduce(p: PlayLike, e: Edit): PlayLike {
  switch (e.type) {
    case 'move_slot': return setSlot(p, e.role, (s) => ({ ...s, at: e.at, onLine: e.onLine }));
    case 'set_path': return setSlot(p, e.role, (s) => ({ ...s, assignment: { ...s.assignment, behavior: e.behavior, path: e.path } }));
    case 'set_letter': return setSlot(p, e.role, (s) => ({ ...s, letter: e.letter }));
    case 'insert_presnap': return { ...p, presnap: [...p.presnap.slice(0, e.index), e.step, ...p.presnap.slice(e.index)] };
    case 'remove_presnap': return { ...p, presnap: p.presnap.filter((_, i) => i !== e.index) };
    case 'dismiss_warning': return { ...p, dismissed: [...p.dismissed, { code: e.code, role: e.role, reason: e.reason }], notes: `${p.notes}${p.notes ? '\n' : ''}${e.code}: ${e.reason}` };
    case 'restore_warning': return { ...p, dismissed: p.dismissed.filter((d) => !(d.code === e.code && d.role === e.role)) };
    case 'set_notes': return { ...p, notes: e.notes };
    case 'mirror': return { ...p, slots: p.slots.map((s) => ({ ...s, at: [s.at[0], neg(s.at[1])] as Yd2, assignment: { ...s.assignment, path: mirrorPts(s.assignment.path) } })) };
    case 'dup_role': return { ...p, slots: [...p.slots, p.slots[0]!] };
  }
}

const m = (level: MessageLike['level'], code: string, roles: string[], dismissed = false): MessageLike => ({
  level, code, roles, citation: level === 'illegal' ? 'formation.min_on_line' : `G1.${code}`, leaf: 'B4.6.1', foul: level === 'illegal' ? 'illegal_formation' : null,
  messageKey: `designer.${code}`, step: null, dismissed, detail: '',
});

function validate(p: PlayLike): MessageLike[] {
  const out: MessageLike[] = [];
  if (new Set(p.slots.map((s) => s.role)).size !== p.slots.length) out.push(m('refused', 'duplicate_slot', []));
  const on = p.slots.filter((s) => s.onLine);
  if (on.length < 7) out.push(m('illegal', 'fewer_than_seven_on_line', p.slots.filter((s) => !s.onLine).map((s) => s.role)));
  for (const s of p.slots) {
    if (!s.assignment.behavior && !['LT', 'LG', 'C', 'RG', 'RT', 'Q'].includes(s.role)) {
      out.push(m('unsound', 'no_assignment', [s.role], p.dismissed.some((d) => d.code === 'no_assignment' && d.role === s.role)));
    }
  }
  return out;
}

export interface FakeCalls { bench: number }

export function ports(opts: { inGame?: boolean; bench?: boolean } = {}, calls: FakeCalls = { bench: 0 }): DesignerPorts<PlayLike, Edit> {
  const report = (inGame: boolean, runs: number): BenchReportLike => ({
    refusedBecause: inGame ? 'in_game' : null, runsRequested: runs, runsDone: inGame ? 0 : runs, partial: false, seed: 1,
    overall: inGame ? null : {
      opponent: 'all', runs, yards: { n: runs, mean: 6.2, low: 5.1, high: 7.3 }, histogram: { minYd: -10, counts: [0, 2, 5, 9, 4] },
      completion: { count: 120, of: 180, rate: 0.667, low: 0.6, high: 0.73 }, pressure: { count: 30, of: 180, rate: 0.167, low: 0.12, high: 0.23 },
      turnovers: { count: 4, of: runs, rate: 0.02, low: 0.008, high: 0.05 }, targets: { X: 60, Z: 50 }, failures: [{ contest: 'press_release', count: 12 }], samples: [3, 17],
    },
    byOpponent: [], hourCharge: { actionClass: 'bench_session', hours: inGame ? 0 : 0.5 },
  });
  return {
    reduce, validate,
    publish(p, messages, o) {
      const refused = messages.filter((x) => x.level === 'refused');
      if (refused.length) return { kind: 'refused', messages: refused };
      const illegal = messages.filter((x) => x.level === 'illegal');
      if (illegal.length && !o.confirmIllegal) return { kind: 'needs_confirmation', messages: illegal };
      const next = { ...p, version: p.version + 1, status: illegal.length ? p.status : 'valid', ruleFailures: illegal.map((x) => ({ ruleId: x.citation, role: null })) };
      const newTeaching = o.previous ? next.slots.filter((s, i) => JSON.stringify(s.assignment) !== JSON.stringify(o.previous!.slots[i]?.assignment)).map((s) => s.role) : [];
      return { kind: 'published', play: next, illegalAsDrawn: illegal.length > 0, newTeaching };
    },
    snap(raw, free) {
      const onLine = raw[0] > -0.5;
      if (free) return { at: raw, onLine };
      return { at: [onLine ? 0 : Math.round(raw[0]), Math.round(raw[1])], onLine };
    },
    snapPath: (_from, path) => path.map((q) => ({ ...q, at: [Math.round(q.at[0]), Math.round(q.at[1])] as Yd2 })),
    readout: (at, onLine) => `${at[1]} lateral, ${onLine ? 'on the line' : `${-at[0]} deep`}`,
    recognizeRoute: (from, path) => (path.length === 1 && path[0]!.at[1] === from[1] && path[0]!.at[0] > from[0] ? 'go' : null),
    fieldLines: (hash) => {
      const off = hash === 'middle' ? 0 : hash === 'left' ? 20 - 26.67 + 6.67 : -(20 - 26.67 + 6.67);
      return { sidelines: [-26.67 + off, 26.67 + off], hashes: [-3.08 + off, 3.08 + off], numbers: null };
    },
    behaviors: (role) => (['LT', 'LG', 'C', 'RG', 'RT'].includes(role) ? ['pass_block', 'run_block'] : ['route', 'pass_block', 'carry']),
    partOptions: (kind) => (kind === 'formation' ? [{ id: 'flip_x', label: 'X letter to W', edit: { type: 'set_letter', role: 'X', letter: 'W' } }] : []),
    looks: [{ id: 'cover2', label: 'Over front, two high', markers: [{ label: 'S', at: [12, -10] }, { label: 'S', at: [12, 10] }] }],
    missingPositions: () => [],
    hours: () => ({ usedThisWeekH: 2, leftThisWeekH: 10, owner: { kind: 'coach' }, assistants: [{ id: 'a1', name: 'Offensive coordinator' }] }),
    calendarLabel: () => 'Week 3, Tuesday',
    benchDefenses: [{ id: 'cover2', label: 'Cover 2' }],
    runBench: opts.bench === false ? undefined : (_p, form, inGame) => { calls.bench += 1; return report(inGame, form.runs); },
    inGame: () => opts.inGame ?? false,
  };
}
