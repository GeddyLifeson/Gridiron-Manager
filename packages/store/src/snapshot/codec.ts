// Compression of snapshot blobs and archived log seasons (P5.3.1 "compressed copy", P5.2.1 "compressed
// by season"). Each stored blob names its codec, so a file written with compression opens on a
// platform without it only if that platform can decode the named codec; otherwise the reader says
// so plainly instead of guessing. Compressed bytes may differ between platforms. Nothing depends on
// them: every check is made on the decoded bytes.

export interface BlobCodec {
  readonly id: string;
  encode(bytes: Uint8Array): Promise<Uint8Array>;
  decode(bytes: Uint8Array): Promise<Uint8Array>;
}

export class CodecError extends Error {
  constructor(message: string) { super(message); this.name = 'CodecError'; }
}

export const RAW_CODEC: BlobCodec = {
  id: 'raw',
  encode: async (b) => b,
  decode: async (b) => b,
};

const DEFLATE_ID = 'deflate-raw';

interface StreamCtor { new (format: 'deflate-raw'): { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> } }

function streamCtors(): { enc: StreamCtor; dec: StreamCtor } | null {
  const g = globalThis as unknown as { CompressionStream?: StreamCtor; DecompressionStream?: StreamCtor };
  return g.CompressionStream && g.DecompressionStream ? { enc: g.CompressionStream, dec: g.DecompressionStream } : null;
}

async function pump(bytes: Uint8Array, Ctor: StreamCtor): Promise<Uint8Array> {
  const stream = new Ctor(DEFLATE_ID);
  const writer = stream.writable.getWriter();
  // The write side is driven without awaiting, so a large blob cannot stall on back-pressure; its
  // failure is carried to the read loop below.
  let writeError: unknown;
  const written = writer.write(bytes).then(() => writer.close()).catch((e: unknown) => { writeError = e ?? new Error('write failed'); });
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await written;
  }
  if (writeError) throw writeError;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Raw deflate through the platform's stream compressor, or null where the platform has none. */
export function deflateCodec(): BlobCodec | null {
  const ctors = streamCtors();
  if (!ctors) return null;
  return {
    id: DEFLATE_ID,
    encode: (b) => pump(b, ctors.enc),
    decode: async (b) => {
      try { return await pump(b, ctors.dec); } catch (e) { throw new CodecError(`compressed blob does not decode: ${e instanceof Error ? e.message : String(e)}`); }
    },
  };
}

/** Compressed where the platform can, stored as-is where it cannot. */
export function defaultCodec(): BlobCodec {
  return deflateCodec() ?? RAW_CODEC;
}

export function codecById(id: string): BlobCodec {
  if (id === RAW_CODEC.id) return RAW_CODEC;
  if (id === DEFLATE_ID) {
    const c = deflateCodec();
    if (!c) throw new CodecError('this platform cannot read compressed blobs (no stream decompressor)');
    return c;
  }
  throw new CodecError(`unknown blob codec ${id}`);
}
