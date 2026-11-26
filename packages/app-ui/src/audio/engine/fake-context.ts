// Fake audio context for tests (PV-06 acceptance: "runs against a fake audio context in tests").
// Records every node, connection, parameter automation and source start or stop, and evaluates a
// parameter's value at any time, so tests can ask "what is the crowd bus gain at t = 1.2 s" or "is
// any source on the ui bus sounding" without a browser. No sound is ever produced.
//
// It lives in src (not test) so PV-07 to PV-11 and PV-17 can use it in their own tests.
import type {
  AudioBufferLike, AudioBufferSourceNodeLike, AudioContextLike, AudioNodeLike, AudioParamLike, BiquadFilterNodeLike,
  GainNodeLike, OscillatorNodeLike, StereoPannerNodeLike,
} from './types.ts';

type AutoEvent =
  | { type: 'set'; v: number; t: number }
  | { type: 'linear'; v: number; t: number }
  | { type: 'exp'; v: number; t: number }
  | { type: 'target'; v: number; t: number; tc: number };

export class FakeParam implements AudioParamLike {
  readonly events: AutoEvent[] = [];
  private base: number;
  constructor(initial: number, readonly owner: FakeNode, readonly name: string) { this.base = initial; }

  get value(): number { return this.valueAt(this.owner.ctx.currentTime); }
  set value(v: number) { this.base = v; this.events.length = 0; }

  private insert(e: AutoEvent): this { this.events.push(e); this.events.sort((a, b) => a.t - b.t); return this; }
  setValueAtTime(v: number, t: number): this { return this.insert({ type: 'set', v, t }); }
  linearRampToValueAtTime(v: number, t: number): this { return this.insert({ type: 'linear', v, t }); }
  exponentialRampToValueAtTime(v: number, t: number): this { return this.insert({ type: 'exp', v, t }); }
  setTargetAtTime(v: number, t: number, tc: number): this { return this.insert({ type: 'target', v, t, tc }); }
  cancelScheduledValues(t: number): this {
    for (let i = this.events.length - 1; i >= 0; i--) if (this.events[i]!.t >= t) this.events.splice(i, 1);
    return this;
  }

  /** Value at time `t`, following Web Audio's automation rules closely enough for mix tests. */
  valueAt(t: number): number {
    let v = this.base;
    let lastT = 0;
    for (const e of this.events) {
      if (e.type === 'target') {
        if (e.t > t) break;
        // Exponential approach from the value at e.t toward e.v.
        const startV = v;
        const next = this.events.find((x) => x.t > e.t && x.type !== 'target');
        const until = Math.min(t, next ? next.t : t);
        v = e.v + (startV - e.v) * Math.exp(-(until - e.t) / e.tc);
        lastT = until;
        if (next && next.t <= t) continue;
        return v;
      }
      if (e.t <= t) {
        v = e.v; lastT = e.t;
        continue;
      }
      // e is in the future: a ramp interpolates from (lastT, v) to (e.t, e.v).
      if (e.type === 'linear') return v + (e.v - v) * ((t - lastT) / (e.t - lastT));
      if (e.type === 'exp' && v > 0 && e.v > 0) return v * (e.v / v) ** ((t - lastT) / (e.t - lastT));
      return v;
    }
    return v;
  }
}

let nextId = 1;

export class FakeNode implements AudioNodeLike {
  readonly id = nextId++;
  readonly outputs: (FakeNode | FakeParam)[] = [];
  disconnected = false;
  constructor(readonly ctx: FakeAudioContext, readonly kind: string) { ctx.nodes.push(this); }
  connect(d: AudioNodeLike | AudioParamLike): unknown {
    if (!(d instanceof FakeNode) && !(d instanceof FakeParam)) throw new Error('fake context: can only connect to fake nodes or params');
    this.outputs.push(d); this.disconnected = false;
    return d;
  }
  disconnect(): void { this.outputs.length = 0; this.disconnected = true; }
}

export class FakeGain extends FakeNode implements GainNodeLike {
  readonly gain = new FakeParam(1, this, 'gain');
  constructor(ctx: FakeAudioContext) { super(ctx, 'gain'); }
}
export class FakePanner extends FakeNode implements StereoPannerNodeLike {
  readonly pan = new FakeParam(0, this, 'pan');
  constructor(ctx: FakeAudioContext) { super(ctx, 'panner'); }
}
export class FakeFilter extends FakeNode implements BiquadFilterNodeLike {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam(350, this, 'frequency');
  readonly Q = new FakeParam(1, this, 'Q');
  constructor(ctx: FakeAudioContext) { super(ctx, 'filter'); }
}

export abstract class FakeSource extends FakeNode {
  startAt: number | null = null;
  stopAt: number | null = null;
  ended = false;
  onended: ((this: never, ev: Event) => unknown) | null = null;
  start(when = this.ctx.currentTime): void {
    if (this.startAt !== null) throw new Error('fake context: source started twice');
    this.startAt = when;
  }
  stop(when = this.ctx.currentTime): void { this.stopAt = this.stopAt === null ? when : Math.min(this.stopAt, when); }
  /** Started, not yet stopped, at time t. Looping sources with no stop sound forever. */
  soundingAt(t: number): boolean {
    if (this.startAt === null || t < this.startAt) return false;
    if (this.stopAt !== null && t >= this.stopAt) return false;
    return !this.finiteEnd || t < this.finiteEnd;
  }
  protected get finiteEnd(): number | null { return null; }
}

export class FakeOscillator extends FakeSource implements OscillatorNodeLike {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam(440, this, 'frequency');
  readonly detune = new FakeParam(0, this, 'detune');
  constructor(ctx: FakeAudioContext) { super(ctx, 'oscillator'); }
}

export class FakeBuffer implements AudioBufferLike {
  private readonly data: Float32Array[];
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number { return this.length / this.sampleRate; }
  getChannelData(c: number): Float32Array { return this.data[c]!; }
}

export class FakeBufferSource extends FakeSource implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = new FakeParam(1, this, 'playbackRate');
  constructor(ctx: FakeAudioContext) { super(ctx, 'bufferSource'); }
  protected override get finiteEnd(): number | null {
    if (this.loop || !this.buffer || this.startAt === null) return null;
    return this.startAt + this.buffer.duration / this.playbackRate.valueAt(this.startAt);
  }
}

export interface FakeContextOptions {
  sampleRate?: number;
  state?: AudioContextState;
  /** Decoder for `decodeAudioData`. Default: a 1-second silent buffer, or a rejection if the bytes are empty. */
  decode?: (bytes: ArrayBuffer) => AudioBufferLike;
}

export class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  readonly sampleRate: number;
  state: AudioContextState;
  readonly nodes: FakeNode[] = [];
  readonly destination: FakeNode;
  private readonly decoder: ((bytes: ArrayBuffer) => AudioBufferLike) | undefined;

  constructor(opts: FakeContextOptions = {}) {
    this.sampleRate = opts.sampleRate ?? 8000;
    this.state = opts.state ?? 'running';
    this.decoder = opts.decode;
    this.destination = new FakeNode(this, 'destination');
  }

  async resume(): Promise<void> { this.state = 'running'; }
  createGain(): FakeGain { return new FakeGain(this); }
  createStereoPanner(): FakePanner { return new FakePanner(this); }
  createBiquadFilter(): FakeFilter { return new FakeFilter(this); }
  createOscillator(): FakeOscillator { return new FakeOscillator(this); }
  createBufferSource(): FakeBufferSource { return new FakeBufferSource(this); }
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer { return new FakeBuffer(channels, length, sampleRate); }
  async decodeAudioData(bytes: ArrayBuffer): Promise<AudioBufferLike> {
    if (this.decoder) return this.decoder(bytes);
    if (bytes.byteLength === 0) throw new Error('fake decode: empty file');
    return new FakeBuffer(2, this.sampleRate, this.sampleRate);
  }

  /** Moves the clock and fires `onended` for sources that have finished. */
  advance(seconds: number): void {
    this.currentTime += seconds;
    for (const n of this.nodes) {
      if (!(n instanceof FakeSource) || n.ended || n.startAt === null) continue;
      if (!n.soundingAt(this.currentTime) && this.currentTime >= n.startAt) {
        n.ended = true;
        n.onended?.call(undefined as never, {} as Event);
      }
    }
  }

  sources(): FakeSource[] { return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource); }

  /**
   * Product of gains along the path from `node` to the destination at time `t` (0 if no path).
   * Follows node outputs only (connections into a param are modulation, not signal).
   */
  pathGain(node: FakeNode, t: number, seen = new Set<number>()): number {
    if (node === this.destination) return 1;
    if (seen.has(node.id)) return 0;
    seen.add(node.id);
    const own = node instanceof FakeGain ? node.gain.valueAt(t) : 1;
    let best = 0;
    for (const o of node.outputs) if (o instanceof FakeNode) best = Math.max(best, this.pathGain(o, t, seen));
    return own * best;
  }

  /** Every node on the path from `node` to the destination (first path found). */
  pathTo(node: FakeNode, target: FakeNode = this.destination, seen = new Set<number>()): FakeNode[] | null {
    if (node === target) return [node];
    if (seen.has(node.id)) return null;
    seen.add(node.id);
    for (const o of node.outputs) {
      if (!(o instanceof FakeNode)) continue;
      const p = this.pathTo(o, target, seen);
      if (p) return [node, ...p];
    }
    return null;
  }

  /** Sources sounding at `t` whose path reaches the destination with a gain above `floor`. */
  audibleAt(t: number, floor = 1e-4): FakeSource[] {
    return this.sources().filter((s) => s.soundingAt(t) && this.pathGain(s, t) > floor);
  }
}
