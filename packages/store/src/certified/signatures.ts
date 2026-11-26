// Official pack signatures (P7.4.1): an Ed25519 signature over the pack's content hash, made with the
// project's private key; the public key ships in the application. v1 checks locally; a local check can
// be defeated by someone who modifies the application, so the certified flag is an honest-play mark until
// server re-simulation (P8.2.1). The key pair does not exist yet: the application passes its public key in.

const ENC = new TextEncoder();

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Web Crypto is not available on this platform');
  return s;
}

export function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error('not a hex string');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

/** The bytes that are signed: the UTF-8 text of the pack's content hash (P4.3.1). */
export function signedBytes(packHash: string): Uint8Array {
  return ENC.encode(`gm.pack.v1:${packHash}`);
}

/** "official" when the signature verifies against the shipped public key, otherwise "community". */
export async function packSignatureState(packHash: string, signatureHex: string | null, publicKeyRaw: Uint8Array): Promise<'official' | 'community'> {
  if (!signatureHex) return 'community';
  try {
    const key = await subtle().importKey('raw', publicKeyRaw as BufferSource, { name: 'Ed25519' }, false, ['verify']);
    const ok = await subtle().verify({ name: 'Ed25519' }, key, hexToBytes(signatureHex) as BufferSource, signedBytes(packHash) as BufferSource);
    return ok ? 'official' : 'community';
  } catch {
    return 'community';
  }
}
