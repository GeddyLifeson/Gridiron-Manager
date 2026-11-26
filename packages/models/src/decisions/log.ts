// The decision log of one career (N3.1, N3.5). Append-only: there is no edit or delete. A model view, a
// truth view, an outcome and follow-ups are their own entries pointing at the decision; `view()` joins
// them. Certified signing of the chain (N4, G-95) is layered on top and not done here.
import { decisionType } from './catalogue.ts';
import { GENESIS_HASH, entryHash, verifyChain } from './chain.ts';
import { freezeJson } from './information.ts';
import { makeRecord } from './record.ts';
import type {
  DecisionOutcome, DecisionRecord, DecisionView, FollowUp, JsonValue, LogEntry, LogPayload, ModelView, TruthView,
} from './types.ts';

export class DecisionLogError extends Error {}

interface Joined {
  record: DecisionRecord;
  modelView: ModelView | null;
  truth: TruthView | null;
  outcome: DecisionOutcome | null;
  followUps: FollowUp[];
  supersededBy: string[];
}

export interface SegmentInfo {
  readonly gameVersion: string;
  readonly seed: string;
  readonly settings: JsonValue;
}

export class DecisionLog {
  private readonly list: LogEntry[] = [];
  private readonly byId = new Map<string, Joined>();
  private segmentHash: string | null = null;

  private constructor() {}

  /** A new career's log, starting with its first segment entry. */
  static create(segment: SegmentInfo): DecisionLog {
    const log = new DecisionLog();
    log.startSegment(segment);
    return log;
  }

  /**
   * Loads stored entries. The chain is verified first, then each entry is replayed through the same
   * checks as a live append, so a loaded log is exactly the log that was written (N3.1.1 acceptance: replay
   * reproduces identical records).
   */
  static load(entries: readonly LogEntry[]): DecisionLog {
    const c = verifyChain(entries);
    if (!c.ok) throw new DecisionLogError(`decision log fails verification: ${c.reason}`);
    const log = new DecisionLog();
    for (const e of entries) log.push(e.payload);
    return log;
  }

  get entries(): readonly LogEntry[] {
    return this.list;
  }

  get headHash(): string {
    return this.list.length ? this.list[this.list.length - 1]!.hash : GENESIS_HASH;
  }

  /** A game version update starts a new chain segment with a link entry (N3.5.1 edge case). */
  startSegment(s: SegmentInfo): LogEntry {
    return this.push({ kind: 'segment', gameVersion: s.gameVersion, seed: s.seed, settings: s.settings, previousSegmentHash: this.segmentHash });
  }

  appendDecision(r: DecisionRecord): LogEntry {
    return this.push({ kind: 'decision', record: r });
  }

  appendModelView(decisionId: string, view: ModelView): LogEntry {
    return this.push({ kind: 'model_view', decisionId, view });
  }

  appendTruthView(decisionId: string, view: TruthView): LogEntry {
    return this.push({ kind: 'truth_view', decisionId, view });
  }

  appendOutcome(decisionId: string, outcome: DecisionOutcome): LogEntry {
    return this.push({ kind: 'outcome', decisionId, outcome });
  }

  appendFollowUp(decisionId: string, followUp: FollowUp): LogEntry {
    return this.push({ kind: 'follow_up', decisionId, followUp });
  }

  /** Certified mode: a reload from an earlier save is itself recorded (N3.5.1). */
  appendReload(fromSeq: number, saveId: string): LogEntry {
    return this.push({ kind: 'reload', fromSeq, saveId });
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** The decision with its view, outcome and follow-ups, for review screens. Never carries the truth view. */
  view(id: string): DecisionView {
    const j = this.byId.get(id);
    if (!j) throw new DecisionLogError(`no decision ${id}`);
    return { record: j.record, modelView: j.modelView, outcome: j.outcome, followUps: j.followUps, supersededBy: j.supersededBy };
  }

  /** All decisions in log order, optionally filtered (N3.2 "filters by type"). */
  views(filter?: (r: DecisionRecord) => boolean): DecisionView[] {
    const out: DecisionView[] = [];
    for (const [id, j] of this.byId) if (!filter || filter(j.record)) out.push(this.view(id));
    return out;
  }

  /** Hidden-truth companion, for N4 scoring and the coaching school (N5) only (N3.1.2). */
  truthFor(id: string): TruthView | null {
    const j = this.byId.get(id);
    if (!j) throw new DecisionLogError(`no decision ${id}`);
    return j.truth;
  }

  private need(id: string): Joined {
    const j = this.byId.get(id);
    if (!j) throw new DecisionLogError(`no decision ${id} in the log`);
    return j;
  }

  /** Checks one payload against the log so far and applies it to the join. Throws without changing anything. */
  private apply(p: LogPayload): () => void {
    switch (p.kind) {
      case 'segment':
        if (this.list.length === 0 && p.previousSegmentHash !== null) throw new DecisionLogError('the first segment links to no earlier segment');
        if (this.list.length > 0 && p.previousSegmentHash !== this.segmentHash) throw new DecisionLogError('a segment entry must link to the previous segment');
        return () => {};
      case 'decision': {
        if (this.list.length === 0) throw new DecisionLogError('a log starts with a segment entry');
        const r = makeRecord(p.record);
        if (this.byId.has(r.id)) throw new DecisionLogError(`decision ${r.id} is already in the log; records are never edited`);
        if (r.supersedes !== null) this.need(r.supersedes);
        return () => {
          this.byId.set(r.id, { record: r, modelView: null, truth: null, outcome: null, followUps: [], supersededBy: [] });
          if (r.supersedes !== null) this.byId.get(r.supersedes)!.supersededBy.push(r.id);
        };
      }
      case 'model_view': {
        const j = this.need(p.decisionId);
        if (j.modelView) throw new DecisionLogError(`decision ${p.decisionId} already has a model view`);
        const want = decisionType(j.record.type).view;
        if (p.view.kind !== want) throw new DecisionLogError(`decision ${p.decisionId} of type ${j.record.type} takes a ${want} view, not ${p.view.kind}`);
        if (p.view.kind === 'game_management') {
          if (p.view.chosen !== j.record.chosen) throw new DecisionLogError(`model view of ${p.decisionId} scores ${p.view.chosen}, but ${j.record.chosen} was chosen`);
          const offered = new Set(j.record.options.map((o) => o.optionId));
          for (const o of p.view.options) if (!offered.has(o.optionId)) throw new DecisionLogError(`model view of ${p.decisionId} scores option ${o.optionId}, which was not offered`);
        }
        const v = freezeJson(p.view) as unknown as ModelView;
        return () => { j.modelView = v; };
      }
      case 'truth_view': {
        const j = this.need(p.decisionId);
        if (j.truth) throw new DecisionLogError(`decision ${p.decisionId} already has a truth view`);
        const want = decisionType(j.record.type).view;
        if (p.view.kind !== want) throw new DecisionLogError(`decision ${p.decisionId} of type ${j.record.type} takes a ${want} truth view, not ${p.view.kind}`);
        const v = freezeJson(p.view) as unknown as TruthView;
        return () => { j.truth = v; };
      }
      case 'outcome': {
        const j = this.need(p.decisionId);
        if (j.outcome) throw new DecisionLogError(`decision ${p.decisionId} already has an outcome`);
        const v = freezeJson(p.outcome) as unknown as DecisionOutcome;
        return () => { j.outcome = v; };
      }
      case 'follow_up': {
        const j = this.need(p.decisionId);
        if (decisionType(j.record.type).view !== 'none') throw new DecisionLogError(`decision ${p.decisionId} has a model; follow-ups are for decisions with none (N3.3.3)`);
        if (j.followUps.some((f) => f.dueDate === p.followUp.dueDate)) throw new DecisionLogError(`decision ${p.decisionId} already has the follow-up due ${p.followUp.dueDate}`);
        const v = freezeJson(p.followUp) as unknown as FollowUp;
        return () => { j.followUps.push(v); };
      }
      case 'reload':
        if (!(p.fromSeq >= 0 && p.fromSeq < this.list.length) || !Number.isInteger(p.fromSeq)) throw new DecisionLogError(`reload from entry ${p.fromSeq}, which is not in the log`);
        return () => {};
    }
  }

  private push(payload: LogPayload): LogEntry {
    const commit = this.apply(payload);
    const frozen = freezeJson(payload) as unknown as LogPayload;
    const seq = this.list.length;
    const prevHash = this.headHash;
    const entry: LogEntry = Object.freeze({ seq, prevHash, payload: frozen, hash: entryHash(seq, prevHash, frozen) });
    commit();
    this.list.push(entry);
    if (frozen.kind === 'segment') this.segmentHash = entry.hash;
    return entry;
  }
}
