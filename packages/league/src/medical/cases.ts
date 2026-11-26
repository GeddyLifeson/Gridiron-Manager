// The medical process day by day (D11.3 to D11.6, H5.1). An injury event from the engine or practice opens
// a case; each world day advances its hidden recovery, setbacks, the concussion protocol, hidden-injury
// discovery, the physician's state and the shown range. Pure: the caller owns the streams and the store.
import { drawRecoveryDays, isConcussion, isSoftTissue, isStructural, row, type Catalogue } from './catalogue.ts';
import { drawSymptomDays, followUpFinds, protocolDay, startProtocol } from './concussion.ts';
import { drawImagingFactor, drawSetback, imagingDay, severityClassOf, shownRange, sidelineRead } from './estimate.ts';
import { hiddenFound, hideChance } from './hurt.ts';
import type { MedicalRules } from './keys.ts';
import { physicianState } from './authority.ts';
import type { InjuryEvent, MedicalCase, MedicalStaff, StreamFor } from './types.ts';



export interface OpenContext {
  readonly catalogue: Catalogue;
  readonly staff: MedicalStaff;
  readonly rules: MedicalRules;
  /** Player toughness 0 to 1 (D5): hiding a minor injury. */
  readonly toughness: number;
  /** Days of earlier concussions (D11.4.2 prior-concussion effect). */
  readonly priorConcussionDays: readonly number[];
  /** The in-game evaluation missed a true concussion (D11.4.1 rule 6); the follow-up exam may find it. */
  readonly evaluationMissed: boolean;
}

/** Open a case, or null for an in-game-only row (cramp, heat illness) that costs no days between games. */
export function openCase(ev: InjuryEvent, ctx: OpenContext, streams: StreamFor): MedicalCase | null {
  const r = row(ctx.catalogue, ev.typeId);
  const s = streams(['medical', ev.injuryId, 'open']);
  const drawn = drawRecoveryDays(r, ev.grade, s);
  const concussion = isConcussion(ev.typeId);
  const symptomDays = drawSymptomDays(ctx.priorConcussionDays, ev.day, s);
  if (drawn === 0 && !concussion) return null;
  const totalDays = concussion ? symptomDays + 1 : drawn;
  const setback = drawSetback(totalDays, s);
  const read = sidelineRead(totalDays, ctx.staff, s);
  const factor = drawImagingFactor(ctx.staff.diagnosticAccuracy, s);
  const hideRoll = s.chance(hideChance(ctx.toughness));
  const hidden = !concussion && ev.hideable && severityClassOf(totalDays) === 'minor' && hideRoll;
  const missed = concussion && ctx.evaluationMissed;
  const known = !hidden && !missed;
  return {
    id: ev.injuryId, personId: ev.personId, teamId: ev.teamId, typeId: ev.typeId, grade: ev.grade, occurredDay: ev.day,
    mechanism: ev.mechanism, softTissue: isSoftTissue(ev.typeId), structural: isStructural(ev.typeId),
    truth: {
      totalDays, progressDays: 0, setbackAt: concussion ? null : setback.at, setbackDays: setback.days, setbackApplied: false,
      imagingFactor: factor, hidden, missedConcussion: missed,
    },
    shown: {
      known, sidelineClass: known ? read : null, imagingDay: imagingDay(ev.day, read), rangeDays: null,
      state: known ? 'not_cleared' : 'cleared', limits: null,
    },
    protocol: concussion && known ? startProtocol(ctx.rules.concussionProtocol, ev.day, symptomDays) : null,
    clearedDay: null, earlyReturn: false, pressureUses: 0, doctorsPressed: false, status: 'active',
  };
}

export interface DayContext {
  readonly staff: MedicalStaff;
  readonly rules: MedicalRules;
  /** Players named today in a position coach's observation report (H5.6.2 rule 2). */
  readonly namedInReport: ReadonlySet<number>;
  /** A consultant is available to confirm a concussion clearance today. */
  readonly consultantAvailable: boolean;
}

export type CaseEventKind = 'found_hidden' | 'follow_up_found' | 'setback' | 'cleared_with_limits' | 'cleared' | 'recovered' | 'protocol_step';
export interface CaseEvent { readonly caseId: number; readonly personId: number; readonly kind: CaseEventKind; readonly day: number }

/** Advance one case by one world day. */
export function caseDay(c0: MedicalCase, day: number, ctx: DayContext, streams: StreamFor): { case: MedicalCase; events: CaseEvent[] } {
  if (c0.status !== 'active' || day <= c0.occurredDay) return { case: c0, events: [] };
  const s = streams(['medical', c0.id, 'day', day]);
  const events: CaseEvent[] = [];
  const ev = (kind: CaseEventKind) => events.push({ caseId: c0.id, personId: c0.personId, kind, day });
  let c = c0;

  // Discovery: the follow-up exam the day after (D11.4.1 rule 7), or a hidden injury found (D11.6.2).
  const followUp = followUpFinds(c.truth.missedConcussion, s);
  const found = hiddenFound(ctx.namedInReport.has(c.personId), s);
  if (!c.shown.known && c.truth.missedConcussion && day === c.occurredDay + 1 && followUp) {
    const left = Math.max(0, c.truth.totalDays - 1 - c.truth.progressDays);
    c = { ...c, truth: { ...c.truth, missedConcussion: false }, shown: { ...c.shown, known: true, state: 'not_cleared' }, protocol: startProtocol(ctx.rules.concussionProtocol, day, left) };
    ev('follow_up_found');
  } else if (!c.shown.known && c.truth.hidden && found) {
    const read = sidelineRead(c.truth.totalDays, ctx.staff, s);
    c = { ...c, truth: { ...c.truth, hidden: false }, shown: { ...c.shown, known: true, sidelineClass: read, imagingDay: imagingDay(day, read), state: 'not_cleared' } };
    ev('found_hidden');
  }

  // Hidden recovery and setbacks (D11.3.2).
  let t = { ...c.truth, progressDays: c.truth.progressDays + 1 };
  const redraw = drawImagingFactor(ctx.staff.diagnosticAccuracy, s);
  if (t.setbackAt !== null && !t.setbackApplied && t.progressDays >= t.setbackAt) {
    t = { ...t, totalDays: t.totalDays + t.setbackDays, setbackApplied: true, imagingFactor: redraw };
    if (c.shown.known) ev('setback');
  }
  c = { ...c, truth: t };

  if (c.protocol) {
    const before = c.protocol.step;
    c = { ...c, protocol: protocolDay(c.protocol, day, ctx.rules.consultantConfirms, ctx.consultantAvailable, s) };
    if (c.protocol!.step !== before) ev('protocol_step');
  }

  // The physician's state (D11.3.1) and the shown range (D11.3.2).
  const { state, limits } = physicianState(c, ctx.staff);
  const prev = c.shown.state;
  const range = c.shown.known && !c.protocol && day >= c.shown.imagingDay ? shownRange(t.totalDays, t.progressDays, t.imagingFactor) : null;
  let clearedDay = c.clearedDay;
  let earlyReturn = c.earlyReturn;
  if (c.shown.known && state !== 'not_cleared' && clearedDay === null) {
    clearedDay = day;
    earlyReturn = !c.protocol && t.progressDays < t.totalDays;
  }
  if (state === 'not_cleared') clearedDay = null;
  c = { ...c, shown: { ...c.shown, state, limits, rangeDays: range }, clearedDay, earlyReturn };
  if (c.shown.known && state !== prev && state !== 'not_cleared') ev(state);

  const done = c.protocol ? c.protocol.cleared : t.progressDays >= t.totalDays && (state === 'cleared' || !c.shown.known);
  if (done) { c = { ...c, status: 'recovered' }; ev('recovered'); }
  return { case: c, events };
}

/** Advance every case one day, in id order (deterministic regardless of input order). */
export function medicalDay(cases: readonly MedicalCase[], day: number, ctx: DayContext, streams: StreamFor): { cases: MedicalCase[]; events: CaseEvent[] } {
  const out: MedicalCase[] = [];
  const events: CaseEvent[] = [];
  for (const c of [...cases].sort((a, b) => a.id - b.id)) {
    const r = caseDay(c, day, ctx, streams);
    out.push(r.case);
    events.push(...r.events);
  }
  return { cases: out, events };
}

