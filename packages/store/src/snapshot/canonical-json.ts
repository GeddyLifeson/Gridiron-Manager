// Text forms of world state used by the save core (P5.3.1, P1.1.5).
//
// Two forms of the same plain data:
//   canonicalJson(v)  keys sorted by UTF-16 code unit, undefined fields skipped. Two states that are
//                     equal as data give the same text on every platform, so its hash is the row
//                     digest the log and the recovery check compare.
//   storageJson(v)    the text written to disk. It keeps the key order the core produced, so a
//                     reloaded world iterates its records in the same order as the world that was
//                     never reloaded. A save that reorders keys would make a reloaded career drift
//                     from its own replay.
// Both refuse anything that does not survive a JSON round trip (non-finite numbers, holes in arrays,
// class instances, typed arrays, functions), with the path of the offending value. State that cannot
// be written exactly is refused before the command commits, never saved approximately.

export class StateEncodingError extends Error {
  constructor(readonly path: string, what: string) {
    super(`state is not plain data at ${path}: ${what}`);
    this.name = 'StateEncodingError';
  }
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function canonicalJson(v: unknown, path = '$'): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'boolean': return v ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(v)) throw new StateEncodingError(path, `non-finite number ${String(v)}`);
      return JSON.stringify(v); // exact shortest round-trip form by the language standard; -0 prints as 0
    case 'string': return JSON.stringify(v);
    case 'object': {
      if (Array.isArray(v)) {
        let out = '[';
        for (let i = 0; i < v.length; i++) {
          if (!(i in v) || v[i] === undefined) throw new StateEncodingError(`${path}[${i}]`, 'hole or undefined in an array');
          if (i) out += ',';
          out += canonicalJson(v[i], `${path}[${i}]`);
        }
        return out + ']';
      }
      if (!isPlainObject(v)) throw new StateEncodingError(path, 'not a plain object (class instance, typed array, Map or Set)');
      const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort(cmp);
      let out = '{';
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]!;
        if (i) out += ',';
        out += JSON.stringify(k) + ':' + canonicalJson(v[k], `${path}.${k}`);
      }
      return out + '}';
    }
    default:
      throw new StateEncodingError(path, `unsupported ${typeof v}`);
  }
}

/** Disk text of a value that canonicalJson has already accepted. Key order is kept. */
export function storageJson(v: unknown): string {
  return JSON.stringify(v);
}

/** Sets a property even when its name is `__proto__`, so rebuilt records hold exactly the stored keys. */
export function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export function utf8(s: string): Uint8Array { return encoder.encode(s); }
export function fromUtf8(b: Uint8Array): string { return decoder.decode(b); }
