// Grade read model (D6.1.1 "what the user sees", D6.4.1, O6.5.1, O4; ruling MA-48). Built from an
// organisation's PersonView only: the input type carries no truth-class field, so no true value can reach a
// screen through here. A test proves it two ways: this file imports nothing that reads truth, and two
// people with different true values but the same view give identical read models.
// MA-48: an attribute nobody has watched shows no grade at all (an `unwatched` cell holds no number). A
// watched attribute shows the grade someone assigned, who assigned it, when, and how much was watched, with
// confidence in words; the band is carried for the tap but not in the default text. No projection here.
import type { PersonView, WorldDate } from '@gm/schema';
import { fromBelief } from './belief.ts';
import { ageTo } from './estimate.ts';
import { formatGrade, type Arrow, type ConfidenceWord, type Watched } from './display.ts';
import { grade, relativeIss, type GradeScale } from './scales.ts';

/** A grade someone assigned after watching (O6.5.1 metadata: value, n, low, high, source, as_of). */
export interface GradedCell {
  readonly state: 'graded';
  readonly attribute: string;
  /** "7.1 (thin look), your staff, graded 40 looks, last updated ..." (band in place of the word with showBand). */
  readonly text: string;
  /** Grade value on a numeric scale, or null on a tier scale (then `label` holds the tier). */
  readonly value: number | null;
  readonly label: string;
  readonly confidence: ConfidenceWord;
  /** Band text and ends, for the tap (MA-48). */
  readonly bandText: string;
  readonly low: string;
  readonly high: string;
  readonly cutLow: boolean;
  readonly cutHigh: boolean;
  /** Evidence units the grade rests on. */
  readonly n: number;
  readonly grader: string;
  readonly watched: readonly Watched[];
  readonly source: { readonly kind: 'evidence'; readonly units: number; readonly evaluators: number };
  /** Date the grade was last updated. */
  readonly as_of: WorldDate;
  readonly legend: string | null;
  /** The "relative to his level" reading (D6.2.1), when a level starter mean is given. */
  readonly relative: string | null;
}

/** Nobody has watched this attribute: no grade, only what is public (D6.4.1). */
export interface UnwatchedCell {
  readonly state: 'unwatched';
  readonly attribute: string;
  readonly text: 'not watched';
  readonly source: { readonly kind: 'public' };
}

export type GradeCell = GradedCell | UnwatchedCell;

export interface GradeViewOptions {
  readonly scale: GradeScale;
  /** Date the screen shows; bands widen for time unseen (D6.4.4). */
  readonly asOf: WorldDate;
  /** The person's age at the stored date, for the drift rate. */
  readonly age: number;
  /** Average starter ISS at the viewing team's own level, for the second legend (D6.2.1). */
  readonly levelStarterMean?: number;
  /** Direction words by attribute, for scales that show a glyph. */
  readonly arrows?: Readonly<Record<string, Arrow>>;
  /** Attributes to show, in order; all stored ones when absent. */
  readonly attributes?: readonly string[];
  /** Show the numeric band in place of the confidence word (the tap). Default false. */
  readonly showBand?: boolean;
  /** Who graded, from the view's staff ids; default "your staff" or "N evaluators". */
  readonly graderOf?: (staffIds: readonly number[]) => string;
  /**
   * What the grade rests on. The stored belief keeps one evidence count (CR-G19-4 asks for a breakdown by
   * kind), so the default reads it as "N looks".
   */
  readonly watchedOf?: (attribute: string, units: number) => readonly Watched[];
  readonly dateText?: (d: WorldDate) => string;
}

function defaultGrader(ids: readonly number[]): string {
  return ids.length > 1 ? `${ids.length} evaluators` : 'your staff';
}

/** Grade cells for one person as one organisation sees him. */
export function gradeCells(view: PersonView, opts: GradeViewOptions): GradeCell[] {
  const keys = opts.attributes ?? Object.keys(view.perAttribute).sort();
  const evaluators = view.sourceStaffIds.length;
  const grader = (opts.graderOf ?? defaultGrader)(view.sourceStaffIds);
  const out: GradeCell[] = [];
  for (const attribute of keys) {
    const b = view.perAttribute[attribute];
    if (!b) continue;
    const e = ageTo(fromBelief(b), opts.asOf, opts.age);
    if (e.publicOnly || e.lastEvidence === null) {
      out.push({ state: 'unwatched', attribute, text: 'not watched', source: { kind: 'public' } });
      continue;
    }
    const watched = opts.watchedOf ? opts.watchedOf(attribute, e.evidenceCount) : [{ count: e.evidenceCount, what: 'looks' }];
    const g = formatGrade(opts.scale, e.mean, e.variance, { grader, on: e.lastEvidence, watched }, {
      showBand: opts.showBand ?? false, arrow: opts.arrows?.[attribute] ?? null, ...(opts.dateText ? { dateText: opts.dateText } : {}),
    });
    const rel = opts.levelStarterMean === undefined ? null : grade(opts.scale, relativeIss(e.mean, opts.levelStarterMean)).text;
    out.push({
      state: 'graded',
      attribute,
      text: g.text,
      value: g.mean.value,
      label: g.mean.text,
      confidence: g.confidence,
      bandText: g.bandText,
      low: g.low.text,
      high: g.high.text,
      cutLow: g.low.cut === 'low',
      cutHigh: g.high.cut === 'high',
      n: e.evidenceCount,
      grader,
      watched,
      source: { kind: 'evidence', units: e.evidenceCount, evaluators },
      as_of: e.lastEvidence,
      legend: g.legend,
      relative: rel,
    });
  }
  return out;
}
