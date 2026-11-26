// Safety scan for packs from strangers (P7.2.1). Runs before the G-08 loader and adds the checks the
// loader does not make: raw JSON nesting before parsing, prototype keys, web addresses, embedded
// images, markup and control characters in text, rule tree depth and size, people per pack, the
// per-file time limit, and the A6.2.2 marks check. The loader already holds the byte, depth, path,
// zip and string-length limits, so a pack is safe when both pass (`assessPack` in folder.ts).
import type { PackSource, Problem } from '../content/index.ts';
import { DEFAULT_SAFETY, type SafetyLimits } from './params.ts';

export interface SafetyOptions {
  readonly limits?: SafetyLimits;
  /** Milliseconds clock for the per-file time limit. Tests pass a fake one. */
  readonly now?: () => number;
  /** A6.2.2 team and league marks check (the host passes `@gm/world` blockedTermHits bound to its list). Returns the hits. */
  readonly blockedMarks?: (texts: readonly string[]) => readonly string[];
}

/** Something the scan made harmless instead of refusing (P7.2.1 "rejected or neutralised"). */
export interface Neutralised { readonly file: string; readonly path: string; readonly what: 'markup' | 'control_chars' | 'image_file' }

export interface SafetyResult {
  readonly packId: string;
  readonly problems: readonly Problem[];
  readonly neutralised: readonly Neutralised[];
}

const decoder = new TextDecoder('utf-8', { fatal: true });
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// Web addresses (P7.2.1: "Nothing in a pack can name a web address"). Schemes and `www.` hosts; a
// bare domain without either is not treated as an address, because the game never opens text.
const WEB = /\b(?:https?|ftps?|file|wss?|javascript|vbscript|data|mailto|blob):|\bwww\.[a-z0-9-]+\.|^\/\/[a-z0-9-]+\./i;
const DATA_IMAGE = /\bdata:image\//i;
const MARKUP = /<\s*[a-zA-Z!/?][^>]*>|&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/;
// C0 controls other than tab, line feed and carriage return; C1 controls; bidi embeddings and
// isolates; zero-width characters; the byte-order mark inside text.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|ico|tiff?|avif|heic)$/i;
const CONDITION_OPS = new Set(['all', 'any', 'not', 'test']);

/** Text from a pack as the game shows it: control and direction characters removed, nothing interpreted (P7.2.1). */
export function plainText(s: string): string { return s.replace(CONTROL, ''); }

/** Depth and object count of JSON text without parsing it, so a hostile file cannot overflow the parser. */
export function jsonNesting(bytes: Uint8Array): { depth: number; nodes: number } {
  let depth = 0, max = 0, nodes = 0, inStr = false, esc = false;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]!;
    if (inStr) { if (esc) esc = false; else if (c === 0x5c) esc = true; else if (c === 0x22) inStr = false; continue; }
    if (c === 0x22) inStr = true;
    else if (c === 0x7b || c === 0x5b) { depth++; nodes++; if (depth > max) max = depth; }
    else if (c === 0x7d || c === 0x5d) depth--;
  }
  return { depth: max, nodes };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCondition = (v: unknown): v is { op: string; of?: unknown } => isObj(v) && typeof v.op === 'string' && CONDITION_OPS.has(v.op);

/** Depth and node count of a J4 condition tree. Anything that is not a condition counts as one leaf. */
export function conditionSize(c: unknown, depth = 1, budget = { left: 1_000_000 }): { depth: number; nodes: number } {
  if (--budget.left < 0) return { depth, nodes: 1 };
  if (!isCondition(c)) return { depth, nodes: 1 };
  if (c.op === 'test') return { depth, nodes: 1 };
  const kids = Array.isArray(c.of) ? c.of : c.of === undefined ? [] : [c.of];
  let d = depth, n = 1;
  for (const k of kids) { const s = conditionSize(k, depth + 1, budget); if (s.depth > d) d = s.depth; n += s.nodes; }
  return { depth: d, nodes: n };
}

class TimeUp extends Error {}

function manifestId(src: PackSource): string {
  const f = src.files.find((x) => x.path.replace(/\\/g, '/').replace(/^\.\//, '') === 'pack.json');
  if (!f?.bytes) return src.origin;
  try { const id = (JSON.parse(decoder.decode(f.bytes)) as { id?: unknown }).id; return typeof id === 'string' && id.length <= 64 ? id : src.origin; } catch { return src.origin; }
}

/** Scans one pack. Any `error` problem means the pack is refused; warnings are neutralised text. */
export function safetyScan(src: PackSource, opts: SafetyOptions = {}): SafetyResult {
  const L = opts.limits ?? DEFAULT_SAFETY;
  const now = opts.now ?? (() => performance.now());
  const packId = manifestId(src);
  const problems: Problem[] = [];
  const neutralised: Neutralised[] = [];
  const names: string[] = [];
  let people = 0;
  const files = [...src.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  for (const f of files) {
    const path = f.path.replace(/\\/g, '/');
    const prob = (severity: Problem['severity'], code: string, jp: string, message: string) => problems.push({ severity, code, packId, file: path, path: jp, message });
    if (IMAGE_EXT.test(path)) { neutralised.push({ file: path, path: '', what: 'image_file' }); prob('info', 'safety.image_ignored', '', 'image files are never loaded from packs (P7.2.1); ignored'); continue; }
    if (!path.endsWith('.json') || !f.bytes) continue; // the loader lists other types and refuses oversized files
    const started = now();
    const { depth, nodes } = jsonNesting(f.bytes);
    if (depth > L.jsonMaxDepth) { prob('error', 'safety.json_depth', '', `JSON nests ${depth} levels deep; the limit is ${L.jsonMaxDepth}`); continue; }
    if (nodes > L.maxNodesPerFile) { prob('error', 'safety.too_many_nodes', '', `${nodes} objects and arrays in one file; the limit is ${L.maxNodesPerFile}`); continue; }
    let data: unknown;
    try { data = JSON.parse(decoder.decode(f.bytes).replace(/^﻿/, '')); } catch { continue; } // the loader reports encoding and JSON errors
    let steps = 0;
    const tick = () => { if ((++steps & 1023) === 0 && now() - started > L.fileTimeLimitMs) throw new TimeUp(); };
    try {
      const walk = (v: unknown, jp: string, key: string): void => {
        tick();
        if (typeof v === 'string') {
          if (key === 'name') names.push(v);
          if (DATA_IMAGE.test(v)) prob('error', 'safety.embedded_image', jp, 'embedded image data; images are never loaded from packs (P7.2.1)');
          else if (WEB.test(v)) prob('error', 'safety.web_address', jp, 'names a web address; packs cannot name addresses the game would open or fetch (P7.2.1)');
          if (MARKUP.test(v)) { neutralised.push({ file: path, path: jp, what: 'markup' }); prob('warning', 'safety.markup', jp, 'looks like markup; it will be shown as plain text (P7.2.1)'); }
          CONTROL.lastIndex = 0;
          if (CONTROL.test(v)) { neutralised.push({ file: path, path: jp, what: 'control_chars' }); prob('warning', 'safety.control_chars', jp, 'control or text-direction characters; they are removed when shown (P7.2.1)'); }
          CONTROL.lastIndex = 0;
          return;
        }
        if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${jp}[${i}]`, key)); return; }
        if (!isObj(v)) return;
        for (const k of Object.keys(v)) {
          if (FORBIDDEN_KEYS.has(k)) prob('error', 'safety.forbidden_key', `${jp}.${k}`, `the key "${k}" is not allowed in content`);
          if (WEB.test(k)) prob('error', 'safety.web_address', `${jp}.${k}`, 'a key names a web address (P7.2.1)');
          walk(v[k], `${jp}.${k}`, k);
        }
        // Rules (J4.1.1 when clauses): bounded tree depth and node count (P7.2.1).
        if ('when' in v && (isCondition(v.when) || isCondition(v.guard))) {
          const budget = { left: L.maxNodesPerFile };
          const w = conditionSize(v.when, 1, budget), g = v.guard ? conditionSize(v.guard, 1, budget) : { depth: 0, nodes: 0 };
          const d = Math.max(w.depth, g.depth), n = w.nodes + g.nodes + (Array.isArray(v.then) ? v.then.length : 0);
          if (d > L.ruleTreeMaxDepth) prob('error', 'safety.rule_depth', jp, `rule tree is ${d} deep; the limit is ${L.ruleTreeMaxDepth} (P7.2.1)`);
          if (n > L.ruleMaxNodes) prob('error', 'safety.rule_nodes', jp, `rule has ${n} nodes; the limit is ${L.ruleMaxNodes} (P7.2.1)`);
        }
      };
      walk(data, '$', '');
      if (/^(people|packs-people)\//.test(path)) people += Array.isArray(data) ? data.length : isObj(data) && Array.isArray(data.people) ? data.people.length : isObj(data) ? 1 : 0;
      if (now() - started > L.fileTimeLimitMs) throw new TimeUp();
    } catch (e) {
      if (!(e instanceof TimeUp)) throw e;
      prob('error', 'safety.time_limit', '', `checking this file took over ${L.fileTimeLimitMs} ms; refused (P7.2.1)`);
    }
  }
  if (people > L.peoplePerPack) problems.push({ severity: 'error', code: 'safety.people_count', packId, file: '', path: '', message: `${people} people; the limit per pack is ${L.peoplePerPack} (P7.2.1)` });
  if (opts.blockedMarks && names.length) {
    for (const hit of opts.blockedMarks(names)) problems.push({ severity: 'error', code: 'safety.blocked_mark', packId, file: '', path: '', message: `uses a real team or league mark: ${hit} (A6.2.2)` });
  }
  return { packId, problems, neutralised };
}
