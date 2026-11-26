// The boss's grade of a product (S4.3.1 boss scores, S4.1.1 standards, detail focus and beliefs, K6.5.2).
// He sees only what is on the page (K6.5.1 rule 2): which fields were filled, which reps were missed,
// how the findings sit against what he already believes. He never sees the truth behind a product, so a
// correct finding against his belief is marked down until the game shows him otherwise.
//
// Grade = weighted mean of section scores (weights from detail_focus), less missed reps, less the
// standards bar, plus perception error sized by his K2 `evaluation`. The draw comes from the stream the
// caller hands in (J13), keyed by the caller.
import { B, clamp, zShare } from './params.ts';
import type { Boss, DutySeen, Judge, SubmissionSeen } from './types.ts';

type Row = Readonly<Record<string, string | null>>;
interface Finding { readonly key: string; readonly share: number; readonly n: number }
interface Draws { normal(): number }

/** Section scores (0 to 100) the boss can see on one product, keyed by section id. */
export function visibleSections(boss: Boss, sub: SubmissionSeen): { sections: Record<string, number>; missed: number } {
  const s = sub as SubmissionSeen & Record<string, unknown>;
  const sections: Record<string, number> = {};
  let missed = 0;
  switch (sub.kind) {
    case 'rows': {
      const answers = (s['answers'] as readonly Row[] | undefined) ?? [];
      missed = (s['missed'] as number | undefined) ?? 0;
      const filled: Record<string, number> = {}, due: Record<string, number> = {};
      for (const row of answers) for (const [f, v] of Object.entries(row)) {
        due[f] = (due[f] ?? 0) + 1;
        if (v !== null && v !== '') filled[f] = (filled[f] ?? 0) + 1;
      }
      for (const f of Object.keys(due).sort()) sections[f] = (100 * (filled[f] ?? 0)) / due[f]!;
      break;
    }
    case 'findings': {
      for (const f of (s['findings'] as readonly Finding[] | undefined) ?? []) sections[f.key] = beliefAgreement(boss, f);
      break;
    }
    case 'flags': {
      const line = B('flag_belief_line');
      for (const k of (s['keys'] as readonly string[] | undefined) ?? []) {
        const b = boss.beliefs[k];
        sections[k] = b === undefined || b >= line ? 100 : (100 * b) / line;
      }
      break;
    }
    case 'signal': {
      const reps = (s['reps'] as readonly { correct: boolean }[] | undefined) ?? [];
      if (reps.length > 0) sections['signal'] = (100 * reps.filter((r) => r.correct).length) / reps.length;
      break;
    }
    case 'video': {
      const filmed = (s['filmed'] as readonly boolean[] | undefined) ?? [];
      if (filmed.length > 0) sections['video'] = (100 * filmed.filter(Boolean).length) / filmed.length;
      break;
    }
    case 'reel': {
      const m = (s['matches'] as readonly boolean[] | undefined) ?? [];
      if (m.length > 0) sections['reel'] = (100 * m.filter(Boolean).length) / m.length;
      break;
    }
    case 'scout_team': sections['scout_team'] = 100 * clamp((s['alignment'] as number | undefined) ?? 0, 0, 1); break;
    case 'teaching': {
      const c = s['checks'];
      if (c === 'default_plan' || c === undefined) break;
      const t = c as Record<string, number>;
      for (const k of Object.keys(t).sort()) sections[k] = 100 * clamp(t[k]!, 0, 1);
      break;
    }
    case 'plan': {
      for (const ch of (s['choices'] as readonly string[] | undefined) ?? []) {
        const b = boss.beliefs[ch];
        if (b !== undefined) sections[ch] = 100 * clamp(b, 0, 1);
      }
      break;
    }
    default: break; // snaps and advice: he has no view of his own on the page; the neutral mark applies.
  }
  return { sections, missed };
}

/**
 * How far a finding sits from what he believes (S4.1.1 beliefs). A finding he has no view on scores 100.
 * Evidence wins the gap back: at n = `belief_evidence_half` half the penalty goes.
 */
export function beliefAgreement(boss: Boss, f: Finding): number {
  const b = boss.beliefs[f.key];
  if (b === undefined) return 100;
  const gap = Math.min(1, Math.abs(f.share - b) / B('belief_tolerance'));
  const n = Math.max(0, f.n);
  const keep = 1 - n / (n + B('belief_evidence_half'));
  return 100 - 100 * gap * keep;
}

/** Weighted mean of section scores by detail_focus, or the neutral mark when he sees nothing to judge. */
export function focusedMean(boss: Boss, sections: Readonly<Record<string, number>>): number {
  let w = 0, sum = 0;
  for (const k of Object.keys(sections).sort()) {
    const wk = Math.max(0, boss.facets.detailFocus[k] ?? 1);
    w += wk; sum += wk * sections[k]!;
  }
  return w > 0 ? sum / w : B('judge_neutral');
}

/** Perception error SD from his K2 `evaluation` z (K6.5.2): best evaluator smallest. */
export function noiseSd(boss: Boss): number {
  const q = zShare(boss.profile.behavior.evaluation);
  return B('judge_noise_sd_worst') + (B('judge_noise_sd_best') - B('judge_noise_sd_worst')) * q;
}

export interface BossRating { readonly score: number; readonly components: Readonly<Record<string, number>> }

/** The boss's rating with its parts. Pass `draws` null for his noiseless view (tests, reproducing an evaluation). */
export function rateProduct(boss: Boss, sub: SubmissionSeen, draws: Draws | null): BossRating {
  const { sections, missed } = visibleSections(boss, sub);
  const mean = focusedMean(boss, sections);
  const bar = B('judge_standards_slope') * (boss.facets.standards - B('facet_max') / 2);
  const noise = draws ? draws.normal() * noiseSd(boss) : 0;
  const score = clamp(mean - missed * B('missed_cost') - bar + noise, 0, 100);
  return { score, components: { ...sections, missedReps: missed, standardsBar: bar } };
}

/** The ladder's `BossJudge` for this boss (career G-55 `gradeProduct` calls it). */
export function judgeFor(boss: Boss, draws: Draws | null): Judge {
  return { rate: (_duty: DutySeen, sub: SubmissionSeen) => rateProduct(boss, sub, draws).score };
}

