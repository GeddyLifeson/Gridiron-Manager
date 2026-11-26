// Q1.1.3 legality generators. The legal generator builds alignments by construction from the rule
// keys. The illegal generator takes a legal alignment and breaks exactly one rule. The validator
// must pass all of the first and flag all of the second, naming the broken rule. 50,000 generated
// alignments per rule set (the Q1.1.3 starting value): 25,000 legal and 25,000 illegal.
// The rule sets are FIXTURES (fixtures.ts); the real-value run follows integration with WP-01.
import { describe, expect, it } from 'vitest';
import type { RuleSet } from '@gm/schema';
import { checkAlignment, type AlignedPlayer, type AlignmentBounds } from '../../src/legality/index.ts';
import { FIXTURES, P, illegalCodes, rng } from './fixtures.ts';

const BOUNDS: AlignmentBounds = { minPy: -26, maxPy: 26 };
const CLEARLY_OFF = P.num('legality.line.clearlyOffYd');
const STATIONARY = P.num('legality.motion.stationaryYps');
const TOWARD_TOL = P.num('legality.motion.towardLineTolYps');
const BEHIND = P.num('legality.snapper.behindLateralYd');

interface Legal { players: AlignedPlayer[]; underCenter: string | null; mover: string | null }

function numbers(rules: RuleSet) {
  const lowMax = rules.num('numbering.eligible_low_max'), highMin = rules.num('numbering.eligible_high_min'), highMax = rules.num('numbering.eligible_high_max');
  return {
    eligible: (r: () => number): number => (r() < 0.6 ? Math.floor(r() * (lowMax + 1)) : highMin + Math.floor(r() * (highMax - highMin + 1))),
    ineligible: (r: () => number): number => lowMax + 1 + Math.floor(r() * (highMin - lowMax - 1)),
  };
}

/** Builds a legal alignment from the rule keys alone. */
function legal(rules: RuleSet, r: () => number): Legal {
  const n = rules.num('substitution.max_players');
  const num = numbers(rules);
  const needsNumber = rules.bool('numbering.eligible_position_needs_number');
  const report = rules.bool('numbering.report_eligible_allowed');
  const numberedMin = rules.num('formation.line_ineligible_numbers_min');
  const minLine = Math.max(rules.num('formation.line_min'), n - rules.num('formation.backfield_max'), numberedMin + 2, 3);
  const lineCount = minLine + Math.floor(r() * (n - 1 - minLine + 1));
  const players: AlignedPlayer[] = [];
  // The line: the snapper over the ball, the rest spread left and right, ends widest.
  const left = Math.floor((lineCount - 1) / 2) + (r() < 0.3 && lineCount > 3 ? 1 : 0);
  const lateral: number[] = [];
  for (let i = 0; i < lineCount; i++) lateral.push(0);
  lateral[left] = (r() - 0.5) * 0.4;
  for (let i = left - 1; i >= 0; i--) lateral[i] = lateral[i + 1]! + 0.7 + r() * 0.2;
  for (let i = left + 1; i < lineCount; i++) lateral[i] = lateral[i - 1]! - 0.7 - r() * 0.2;
  // Push the ends out to receiver splits some of the time.
  if (r() < 0.7) lateral[0] = Math.min(BOUNDS.maxPy - 1, lateral[0]! + 2 + r() * 14);
  if (r() < 0.7) lateral[lineCount - 1] = Math.max(BOUNDS.minPy + 1, lateral[lineCount - 1]! - 2 - r() * 14);
  let interiorEligible = lineCount - 2 - numberedMin;
  for (let i = 0; i < lineCount; i++) {
    const end = i === 0 || i === lineCount - 1;
    let jersey: number, reported = false;
    if (end) {
      if (!needsNumber && r() < 0.2) jersey = num.ineligible(r);
      else if (report && r() < 0.1) { jersey = num.ineligible(r); reported = true; }
      else jersey = num.eligible(r);
    } else if (i !== left && interiorEligible > 0 && r() < 0.15) { jersey = num.eligible(r); interiorEligible--; } else jersey = num.ineligible(r);
    players.push({ role: `L${i}`, px: -r() * 0.6 * CLEARLY_OFF, py: lateral[i]!, onLine: true, jersey, inMotion: false, reported });
  }
  // Backs: clearly off the line, eligible numbers (or reported, or any number where numbers are free).
  const backs = n - lineCount;
  let underCenter: string | null = null;
  for (let b = 0; b < backs; b++) {
    let jersey = num.eligible(r), reported = false;
    if (!needsNumber && r() < 0.15) jersey = num.ineligible(r);
    else if (report && r() < 0.05) { jersey = num.ineligible(r); reported = true; }
    const role = `B${b}`;
    if (b === 0 && rules.num('formation.neither_behind_snapper_max') >= 1 && r() < 0.5) {
      underCenter = role;
      // Directly behind the snapper, at most the rule's under-center distance back.
      players.push({ role, px: players[left]!.px - (0.1 + r() * 0.8) * rules.num('formation.t_quarterback_depth_yd'), py: lateral[left]! + (r() - 0.5) * BEHIND, onLine: false, jersey, inMotion: false, reported });
    } else {
      // Clearly off the line and deeper than the under-center distance, so he is never taken for the man under center.
      players.push({ role, px: -(0.6 * CLEARLY_OFF + Math.max(CLEARLY_OFF, rules.num('formation.t_quarterback_depth_yd')) + 0.01 + r() * 8), py: (r() - 0.5) * 2 * (BOUNDS.maxPy - 1), onLine: false, jersey, inMotion: false, reported });
    }
  }
  // Motion: up to the allowed count, from the backfield, flat or away from the line.
  let mover: string | null = null;
  const candidates = players.filter((p) => !p.onLine && p.role !== underCenter);
  if (rules.num('formation.motion_max_at_snap') >= 1 && candidates.length > 0 && r() < 0.4) {
    const m = candidates[Math.floor(r() * candidates.length)]!;
    mover = m.role;
    const i = players.indexOf(m);
    players[i] = { ...m, inMotion: true, velPy: (r() < 0.5 ? -1 : 1) * (STATIONARY + 0.5 + r() * 7), velPx: -r() * 3 + TOWARD_TOL * r() };
  } else if (r() < 0.3 && candidates.length > 0) {
    // A man settling in his stance below the stationary threshold is not motion.
    const m = candidates[0]!;
    players[players.indexOf(m)] = { ...m, velPx: 0, velPy: STATIONARY * r() * 0.9 };
  }
  return { players, underCenter, mover };
}

type Breaker = (rules: RuleSet, base: Legal, r: () => number) => AlignedPlayer[] | null;
const interior = (ps: AlignedPlayer[]) => {
  const line = ps.filter((p) => p.onLine).sort((a, b) => b.py - a.py);
  return line.slice(1, -1);
};
const farBack = (ps: AlignedPlayer[], uc: string | null) => ps.filter((p) => !p.onLine && p.role !== uc);
const set = (ps: AlignedPlayer[], role: string, c: Partial<AlignedPlayer>) => ps.map((p) => (p.role === role ? { ...p, ...c } : p));

/** Each breaker returns null when this rule set or this alignment cannot break only that rule. */
const BREAKERS: Record<string, Breaker> = {
  'formation.too_many_players': (rules, b, r) => {
    // One more interior lineman with an ineligible number, standing in a gap.
    const inner = interior(b.players);
    if (inner.length < 2) return null;
    const a = inner[0]!, c = inner[1]!;
    return [...b.players, { role: 'EXTRA', px: 0, py: (a.py + c.py) / 2, onLine: true, jersey: numbers(rules).ineligible(r), inMotion: false }];
  },
  'formation.line_min': (rules, b, r) => {
    const min = rules.num('formation.line_min');
    const line = b.players.filter((p) => p.onLine).length;
    if (min <= 0) return null;
    const take = line - (min - 1);
    const off = b.players.length - line + take;
    if (off > rules.num('formation.backfield_max')) return null;
    const inner = interior(b.players).filter((p) => Math.abs(p.py) > P.num('legality.snapper.maxLateralYd'));
    if (inner.length < take) return null;
    let ps = b.players;
    // The men who leave the line become backs wearing eligible numbers.
    for (let i = 0; i < take; i++) ps = set(ps, inner[i]!.role, { px: -(CLEARLY_OFF + 1 + i), py: 20 - i * 2, onLine: false, jersey: numbers(rules).eligible(r), reported: false });
    if (ps.filter((p) => p.onLine && p.jersey > rules.num('numbering.eligible_low_max') && p.jersey < rules.num('numbering.eligible_high_min')).length < rules.num('formation.line_ineligible_numbers_min')) return null;
    return ps;
  },
  'formation.backfield_max': (rules, b, r) => {
    const max = rules.num('formation.backfield_max');
    const line = b.players.filter((p) => p.onLine);
    const off = b.players.length - line.length;
    if (off !== max || line.length - 1 < rules.num('formation.line_min')) return null;
    // An end steps off the line. The man inside him becomes the end, so he takes an eligible number where numbers bind.
    const sorted = [...line].sort((x, y) => y.py - x.py);
    const end = sorted[0]!, next = sorted[1]!;
    if (Math.abs(next.py) <= P.num('legality.snapper.maxLateralYd')) return null;
    let ps = set(b.players, end.role, { px: -(CLEARLY_OFF + 1), onLine: false, reported: false, jersey: numbers(rules).eligible(r) });
    if (rules.bool('numbering.eligible_position_needs_number')) ps = set(ps, next.role, { jersey: numbers(rules).eligible(r), reported: false });
    const numbered = ps.filter((p) => p.onLine && p.jersey > rules.num('numbering.eligible_low_max') && p.jersey < rules.num('numbering.eligible_high_min')).length;
    return numbered < rules.num('formation.line_ineligible_numbers_min') ? null : ps;
  },
  'formation.line_ineligible_numbers_min': (rules, b, r) => {
    const min = rules.num('formation.line_ineligible_numbers_min');
    if (min <= 0) return null;
    const lowMax = rules.num('numbering.eligible_low_max'), highMin = rules.num('numbering.eligible_high_min');
    const numbered = b.players.filter((p) => p.onLine && p.jersey > lowMax && p.jersey < highMin);
    let ps = b.players;
    for (let i = 0; i <= numbered.length - min; i++) ps = set(ps, numbered[i]!.role, { jersey: numbers(rules).eligible(r), reported: false });
    return ps;
  },
  'formation.neither_position': (_rules, b, r) => {
    const backs = farBack(b.players, b.underCenter).filter((p) => p.role !== b.mover);
    if (backs.length === 0) return null;
    const m = backs[Math.floor(r() * backs.length)]!;
    const side = r() < 0.5 ? -1 : 1;
    return set(b.players, m.role, { px: -(0.1 + r() * 0.8) * CLEARLY_OFF, py: side * (P.num('legality.snapper.maxLateralYd') + BEHIND + 0.5 + r() * 10) });
  },
  'formation.neither_count': (rules, b, r) => {
    const max = rules.num('formation.neither_behind_snapper_max');
    const backs = farBack(b.players, b.underCenter).filter((p) => p.role !== b.mover);
    // The base's man under center counts only when he stands in the "neither" band (he may be clearly off).
    const uc = b.players.find((p) => p.role === b.underCenter);
    const have = uc !== undefined && -uc.px < CLEARLY_OFF ? 1 : 0;
    const add = max + 1 - have;
    if (backs.length < add) return null;
    const snapper = b.players.filter((p) => p.onLine).sort((x, y) => Math.abs(x.py) - Math.abs(y.py))[0]!;
    let ps = b.players;
    for (let i = 0; i < add; i++) ps = set(ps, backs[i]!.role, { px: Math.min(snapper.px, -0.3 * CLEARLY_OFF) - r() * 0.3 * CLEARLY_OFF, py: snapper.py + (r() - 0.5) * BEHIND });
    return ps;
  },
  'numbering.eligible_position_needs_number': (rules, b, r) => {
    if (!rules.bool('numbering.eligible_position_needs_number')) return null;
    const line = b.players.filter((p) => p.onLine).sort((x, y) => y.py - x.py);
    const spots = [line[0]!, line[line.length - 1]!, ...b.players.filter((p) => !p.onLine)];
    const m = spots[Math.floor(r() * spots.length)]!;
    return set(b.players, m.role, { jersey: numbers(rules).ineligible(r), reported: false });
  },
  'numbering.reported_not_eligible_position': (rules, b, r) => {
    if (!rules.bool('numbering.report_eligible_allowed')) return null;
    const inner = interior(b.players);
    if (inner.length === 0) return null;
    return set(b.players, inner[Math.floor(r() * inner.length)]!.role, { jersey: numbers(rules).ineligible(r), reported: true });
  },
  'formation.out_of_bounds': (rules, b, r) => {
    if (!rules.bool('formation.in_bounds_required')) return null;
    const backs = farBack(b.players, b.underCenter);
    if (backs.length === 0) return null;
    const m = backs[Math.floor(r() * backs.length)]!;
    return set(b.players, m.role, { py: r() < 0.5 ? BOUNDS.maxPy + 0.01 + r() * 3 : BOUNDS.minPy - 0.01 - r() * 3 });
  },
  'formation.motion_max_at_snap': (rules, b, r) => {
    const max = rules.num('formation.motion_max_at_snap');
    const backs = farBack(b.players, b.underCenter);
    if (backs.length < max + 1) return null;
    let ps = b.players;
    for (let i = 0; i <= max; i++) ps = set(ps, backs[i]!.role, { inMotion: true, velPx: -r(), velPy: STATIONARY + 1 + r() * 5 });
    return ps;
  },
  'formation.motion_from_line': (rules, b, r) => {
    if (!rules.bool('formation.motion_from_backfield_only') || b.mover !== null || rules.num('formation.motion_max_at_snap') < 1) return null;
    const line = b.players.filter((p) => p.onLine);
    const m = line[Math.floor(r() * line.length)]!;
    return set(b.players, m.role, { inMotion: true, velPx: -r() * 0.5, velPy: STATIONARY + 1 + r() * 5 });
  },
  'formation.motion_toward_line': (rules, b, r) => {
    if (rules.opt('formation.motion_rule') !== 'not_toward_line' || rules.num('formation.motion_max_at_snap') < 1) return null;
    const backs = farBack(b.players, b.underCenter);
    const m = b.mover !== null ? b.players.find((p) => p.role === b.mover)! : backs[0];
    if (m === undefined) return null;
    return set(b.players, m.role, { inMotion: true, velPx: TOWARD_TOL + 0.01 + r() * 6, velPy: STATIONARY + r() * 5 });
  },
  'formation.motion_under_center': (rules, b, r) => {
    if (b.underCenter === null || b.mover !== null || rules.num('formation.motion_max_at_snap') < 1) return null;
    return set(b.players, b.underCenter, { inMotion: true, velPx: -r() * 0.2, velPy: STATIONARY + 1 + r() * 4 });
  },
};

const N = 25_000;

for (const rules of FIXTURES) {
  describe(`Q1.1.3 legality generators, rule set ${rules.id} (FIXTURE)`, () => {
    it(`passes ${N} legal alignments built from the rule keys: zero wrong refusals`, () => {
      const r = rng(20261126);
      let wrong = 0, first = '';
      for (let i = 0; i < N; i++) {
        const b = legal(rules, r);
        const fs = checkAlignment(b.players, rules, P, BOUNDS);
        if (fs.length > 0) { wrong++; if (!first) first = JSON.stringify({ codes: fs.map((f) => [f.code, f.role]), players: b.players }); }
      }
      expect(first).toBe('');
      expect(wrong).toBe(0);
    });

    it(`flags ${N} alignments with exactly one broken rule and names that rule: zero wrong accepts`, () => {
      const r = rng(7);
      const kinds = Object.keys(BREAKERS);
      const made: Record<string, number> = {};
      let wrong = 0, first = '', done = 0, guard = 0;
      while (done < N && guard++ < N * 60) {
        const kind = kinds[Math.floor(r() * kinds.length)]!;
        const b = legal(rules, r);
        const broken = BREAKERS[kind]!(rules, b, r);
        if (broken === null) continue;
        made[kind] = (made[kind] ?? 0) + 1;
        done++;
        const fs = checkAlignment(broken, rules, P, BOUNDS);
        const got = illegalCodes(fs);
        if (got.length !== 1 || got[0] !== kind || fs.some((f) => f.severity !== 'warning')) {
          wrong++;
          if (!first) first = JSON.stringify({ kind, got, players: broken });
        }
      }
      expect(first).toBe('');
      expect(wrong).toBe(0);
      // Every rule this fixture can break on its own was broken many times.
      for (const k of Object.keys(made)) expect(made[k]).toBeGreaterThan(200);
      expect(Object.keys(made).length).toBeGreaterThanOrEqual(9);
      expect(done).toBe(N);
    });
  });
}
