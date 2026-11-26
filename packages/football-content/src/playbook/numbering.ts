// G4.2.3 run and protection numbering: hole numbers, two-digit runs, protection series. The starting setup
// is the leaf's (Assumption): holes from the center outward, even right, odd left; runs back digit then hole;
// protections three digits, first the drop (0 shotgun, 1, 3 or 5 steps), last two the scheme.

export interface Numbering {
  /** 0 over the center, or 1 at the first gap. */
  readonly zero: 'center' | 'first_gap';
  readonly evenSide: 'right' | 'left';
  readonly runStyle: 'back_hole' | 'scheme';
  readonly protectionStyle: 'series' | 'word';
}

export const STARTING_NUMBERING: Numbering = { zero: 'center', evenSide: 'right', runStyle: 'back_hole', protectionStyle: 'series' };

/**
 * Hole number for a gap: `gapFromCenter` 0 is the center, 1 the first gap out, and so on. Holes count from
 * the center outward with even and odd digits alternating by side. An unbalanced line shifts `gapFromCenter`
 * with the line (G4.2.3 edge case), which the caller passes in.
 */
export function holeNumber(n: Numbering, gapFromCenter: number, side: 'left' | 'right'): number {
  if (gapFromCenter < 0 || !Number.isInteger(gapFromCenter)) throw new Error(`gap ${gapFromCenter} is not a whole number >= 0`);
  const evenHere = side === n.evenSide;
  if (n.zero === 'center') return evenHere ? gapFromCenter * 2 : gapFromCenter * 2 + 1;
  // 1 sits at the first gap: the center (gap 0) carries no hole number in this convention.
  if (gapFromCenter === 0) throw new Error('with holes starting at the first gap, the center has no number');
  return evenHere ? gapFromCenter * 2 : gapFromCenter * 2 - 1;
}

export interface RunNumberInput { readonly backDigit: number | null; readonly gapFromCenter: number; readonly side: 'left' | 'right'; readonly schemeNumber?: string }

/** A run's number word. A formation with no back makes back-digit runs fall back to the scheme number with a warning. */
export function runNumber(n: Numbering, r: RunNumberInput): { readonly word: string; readonly warning: string | null } {
  if (n.runStyle === 'scheme' || r.backDigit === null) {
    if (!r.schemeNumber) throw new Error('scheme-numbered run needs a scheme number');
    return { word: r.schemeNumber, warning: n.runStyle === 'back_hole' ? 'no back in the formation: the run is called by its scheme number' : null };
  }
  const hole = holeNumber(n, r.gapFromCenter, r.side);
  if (hole > 9) throw new Error(`hole ${hole} does not fit one digit`);
  return { word: `${r.backDigit}${hole}`, warning: null };
}

/** Protection series word: drop digit then two scheme digits ("394"). */
export function protectionNumber(dropSteps: 0 | 1 | 3 | 5, scheme: number): string {
  if (scheme < 0 || scheme > 99 || !Number.isInteger(scheme)) throw new Error(`scheme ${scheme} is not two digits`);
  return `${dropSteps}${scheme < 10 ? '0' : ''}${scheme}`;
}

export interface NumberedRun { readonly id: string; readonly scheme: string; readonly series: number | null; readonly side: 'left' | 'right'; readonly word: string }

/**
 * Builder checks (G4.2.3): no run number equals a protection number, each (series, hole) maps to one scheme,
 * and mirrored runs differ only by the side digit.
 */
export function checkNumbering(runs: readonly NumberedRun[], protections: readonly string[]): string[] {
  const errs: string[] = [];
  const prot = new Set(protections);
  const byWord = new Map<string, NumberedRun>();
  for (const r of runs) {
    if (prot.has(r.word)) errs.push(`run ${r.id} number ${r.word} equals a protection number`);
    const prev = byWord.get(r.word);
    if (prev && prev.scheme !== r.scheme) errs.push(`number ${r.word} names two schemes (${prev.id}, ${r.id})`);
    byWord.set(r.word, r);
  }
  const bySchemeSeries = new Map<string, NumberedRun[]>();
  for (const r of runs) {
    const k = `${r.scheme}|${r.series ?? '-'}`;
    bySchemeSeries.set(k, [...(bySchemeSeries.get(k) ?? []), r]);
  }
  for (const [k, rs] of bySchemeSeries) {
    const left = rs.find((r) => r.side === 'left');
    const right = rs.find((r) => r.side === 'right');
    if (!left || !right || left.word.length !== right.word.length) continue;
    let diff = 0;
    for (let i = 0; i < left.word.length; i++) if (left.word[i] !== right.word[i]) diff++;
    if (diff !== 1 || left.word.slice(0, -1) !== right.word.slice(0, -1)) errs.push(`mirrored runs of ${k} differ by more than the side digit (${left.word}, ${right.word})`);
  }
  return errs;
}

/**
 * Flip the side convention (G4.2.3): every run number re-renders, and each changed word is charged once as a
 * rename (G4.7.1). Returns old word to new word for the runs that changed.
 */
export function flipSides(n: Numbering, runs: readonly (RunNumberInput & { readonly id: string })[]): { readonly numbering: Numbering; readonly renamed: ReadonlyMap<string, { readonly from: string; readonly to: string }> } {
  const flipped: Numbering = { ...n, evenSide: n.evenSide === 'right' ? 'left' : 'right' };
  const renamed = new Map<string, { from: string; to: string }>();
  for (const r of runs) {
    const from = runNumber(n, r).word;
    const to = runNumber(flipped, r).word;
    if (from !== to) renamed.set(r.id, { from, to });
  }
  return { numbering: flipped, renamed };
}
