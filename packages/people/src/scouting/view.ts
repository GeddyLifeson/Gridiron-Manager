// Grade read model (D6.1.1 "what the user sees", O6.5.1, O4). Built from an organisation's PersonView
// only: the input type carries no truth-class field, so no true value can reach a screen through here.
// A test proves it two ways: this file imports nothing that reads truth, and two people with different
// true values but the same view give identical read models.
import type { PersonView, WorldDate } from '@gm/schema';
import { fromBelief } from './belief.ts';
import { ageTo } from './estimate.ts';
import { formatGrade, type Arrow } from './display.ts';
import { relativeIss, type GradeScale } from './scales.ts';

/** One grade cell, with the O6.5.1 metadata a number component needs: value, n, low, high, source, as_of. */
export interface GradeCell {
  readonly attribute: string;
  /** "7.1 (6.8 to 7.4)" on the chosen scale. */
  readonly text: string;
  /** Grade value on a numeric scale, or null on a tier scale (then `label` holds the tier). */
  readonly value: number | null;
  readonly label: string;
  readonly low: string;
  readonly high: string;
  readonly cutLow: boolean;
  readonly cutHigh: boolean;
  /** Evidence units the estimate rests on. */
  readonly n: number;
  /** What the estimate rests on, for the hover line (D6.1.1). */
  readonly source: { readonly kind: 'public' | 'evidence'; readonly units: number; readonly evaluators: number };
  /** Date of the last evidence, or null for public information only. */
  readonly as_of: WorldDate | null;
  readonly legend: string | null;
  /** The "relative to his level" reading (D6.2.1), when a level starter mean is given. */
  readonly relative: string | null;
}

export interface GradeViewOptions {
  readonly scale: GradeScale;
  /** Date the screen shows; bands widen for time unseen (D6.4.4). */
  readonly asOf: WorldDate;
  /** The person's age at the stored date, for the drift rate. */
  readonly age: number;
  /** Average starter ISS at the viewing team's own level, for the second legend (D6.2.1). */
  readonly levelStarterMean?: number;
  /** Projection arrows by attribute, for scales that show them. */
  readonly arrows?: Readonly<Record<string, Arrow>>;
  /** Attributes to show, in order; all stored ones when absent. */
  readonly attributes?: readonly string[];
}

/** Grade cells for one person as one organisation sees him. */
export function gradeCells(view: PersonView, opts: GradeViewOptions): GradeCell[] {
  const keys = opts.attributes ?? Object.keys(view.perAttribute).sort();
  const evaluators = view.sourceStaffIds.length;
  const out: GradeCell[] = [];
  for (const attribute of keys) {
    const b = view.perAttribute[attribute];
    if (!b) continue;
    const e = ageTo(fromBelief(b), opts.asOf, opts.age);
    const g = formatGrade(opts.scale, e.mean, e.variance, opts.arrows?.[attribute] ?? null);
    const rel = opts.levelStarterMean === undefined
      ? null
      : formatGrade(opts.scale, relativeIss(e.mean, opts.levelStarterMean), e.variance).text;
    out.push({
      attribute,
      text: g.text,
      value: g.mean.value,
      label: g.mean.text,
      low: g.low.text,
      high: g.high.text,
      cutLow: g.low.cut === 'low',
      cutHigh: g.high.cut === 'high',
      n: e.evidenceCount,
      source: e.publicOnly ? { kind: 'public', units: 0, evaluators: 0 } : { kind: 'evidence', units: e.evidenceCount, evaluators },
      as_of: e.lastEvidence,
      legend: g.legend,
      relative: rel,
    });
  }
  return out;
}
