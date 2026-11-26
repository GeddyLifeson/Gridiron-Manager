// Content kinds and their schemas (P4.1.1 folder layout, P3.4.1 entity list, P4.2.1 schema validation).
// A kind is found by the longest registered folder prefix of a file's path. Owners of a kind's body
// (WP-15 formations and plays, G1 and G2 designers, D13 generator tables) register a stricter schema
// with `registry.register(...)`; until then the P3.4.1 envelope is checked and the body is carried.
import { RuleSetFile } from '@gm/schema';
import { textSupport } from './text-support.ts';
import type { LevelTags, Ref } from './types.ts';
import { arr, bool, checkShape, int, obj, opt, str, type Shape } from './shape.ts';

export interface KindProblem { readonly severity: 'error' | 'warning'; readonly code: string; readonly path: string; readonly message: string }

export interface ParsedItem { readonly id: string; readonly data: unknown; readonly levelTags: LevelTags; readonly draft: boolean }

export interface KindContext { readonly unknownFields: 'error' | 'warning'; readonly filePath: string }

export interface KindDef {
  readonly kind: string;
  /** Folder (ending in `/`) or exact file path inside a pack. */
  readonly match: string;
  /** Current content schema version of this kind. */
  readonly version: number;
  /** In-memory upgrades, oldest first (P4.2.1 edge case). The file on disk is not rewritten. */
  readonly migrations?: readonly { readonly from: number; up(data: unknown): unknown }[];
  /** World-wide content: blocked from reload in a running career except by a logged override (P4.4.1). */
  readonly worldWide?: boolean;
  parse(data: unknown, ctx: KindContext): { items: ParsedItem[]; problems: KindProblem[] };
  refs?(data: unknown): Ref[];
  /** Load-time normalisation after validation, for example D-11's lateral negation for authored plays. */
  normalize?(data: unknown): unknown;
}

export const ITEM_ID = /^[a-z0-9][a-z0-9_.-]{0,127}$/;

/** The parts of a zod schema the loader uses; @gm/schema owns zod (P1.2.2), tools only calls it. */
interface ZodIssueLike { readonly code: string; readonly path: readonly PropertyKey[]; readonly message: string; readonly keys?: readonly string[] }
export interface ZodLike<T> { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: readonly ZodIssueLike[] } } }

/** Turns zod issues into problems; unknown keys follow the core/user rule (P4.2.1). */
export function zodProblems(issues: readonly ZodIssueLike[], unknownFields: 'error' | 'warning', base = '$'): KindProblem[] {
  const out: KindProblem[] = [];
  for (const iss of issues) {
    const path = base + iss.path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`)).join('');
    if (iss.code === 'unrecognized_keys') {
      for (const k of iss.keys ?? []) out.push({ severity: unknownFields, code: 'schema.unknown_field', path: `${path}.${k}`, message: `unknown field ${k}` });
    } else {
      const missing = iss.code === 'invalid_type' && /received undefined/.test(iss.message);
      out.push({ severity: 'error', code: missing ? 'schema.required' : `schema.${iss.code}`, path, message: iss.message });
    }
  }
  return out;
}

/** Validates with strict unknown-key handling but lets user packs through with warnings. */
export function parseStrict<T>(schema: ZodLike<T>, loose: ZodLike<T>, data: unknown, ctx: KindContext, base = '$'): { value: T | null; problems: KindProblem[] } {
  const r = schema.safeParse(data);
  if (r.success) return { value: r.data, problems: [] };
  const problems = zodProblems(r.error.issues, ctx.unknownFields, base);
  if (problems.some((p) => p.severity === 'error')) return { value: null, problems };
  const l = loose.safeParse(data);
  return { value: l.success ? l.data : null, problems };
}

/** Same contract for the plain shapes of shape.ts. */
export function parseShape<T>(shape: Shape, data: unknown, ctx: KindContext, base = '$'): { value: T | null; problems: KindProblem[] } {
  const problems = checkShape(shape, data, ctx.unknownFields, base);
  return { value: problems.some((p) => p.severity === 'error') ? null : (data as T), problems };
}

// The P3.4.1 envelope: "Every content item carries: ID, name, level tags, author, version, and the
// content schema version." `refs` lists the items it uses until the kind's own schema names them.
export interface Envelope {
  readonly id: string; readonly name: string; readonly levelTags: readonly string[]; readonly author: string;
  readonly version: string; readonly contentSchemaVersion: number;
  readonly refs?: readonly { kind: string; id: string }[];
  /** A user's unrunnable play may be saved as a draft (P4.2.2 edge case). */
  readonly draft?: boolean;
}
/** Envelope kinds carry a body whose schema is not registered yet, so extra fields pass. */
export const ContentEnvelope: Shape = obj({
  id: str({ re: ITEM_ID }),
  name: str({ min: 1 }),
  levelTags: arr(str({ min: 1 }), { min: 1 }),
  author: str({ min: 1 }),
  version: str({ re: /^\d+\.\d+\.\d+$/ }),
  contentSchemaVersion: int({ min: 1 }),
  refs: opt(arr(obj({ kind: str({ min: 1 }), id: str({ re: ITEM_ID }) }))),
  draft: opt(bool()),
}, { strict: false });

function levelTagProblems(tags: readonly string[], path: string): KindProblem[] {
  if (tags.includes('both') && tags.length > 1) return [{ severity: 'error', code: 'item.level_tags', path, message: 'level tags are either ["both"] or a list of rule keys' }];
  const bad = tags.filter((t) => t !== 'both' && !/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(t));
  return bad.map((t) => ({ severity: 'error' as const, code: 'item.level_tags', path, message: `level tag ${t} is not "both" or a rule key` }));
}

export function envelopeKind(kind: string, match: string, extra: Partial<KindDef> = {}): KindDef {
  return {
    kind, match, version: 1,
    parse(data, _ctx) {
      const list = Array.isArray(data) ? data : [data];
      const items: ParsedItem[] = [];
      const problems: KindProblem[] = [];
      list.forEach((raw, i) => {
        const base = Array.isArray(data) ? `$[${i}]` : '$';
        const ps = checkShape(ContentEnvelope, raw, 'error', base);
        if (ps.length) { problems.push(...ps); return; }
        const env = raw as Envelope;
        const lp = levelTagProblems(env.levelTags, `${base}.levelTags`);
        problems.push(...lp);
        if (lp.length) return;
        items.push({ id: env.id, data: env, levelTags: env.levelTags, draft: env.draft === true });
      });
      return { items, problems };
    },
    refs(data) {
      const refs = (data as { refs?: { kind: string; id: string }[] }).refs ?? [];
      return refs.map((r, i) => ({ kind: r.kind, id: r.id, path: `$.refs[${i}]` }));
    },
    ...extra,
  };
}

const textKind: KindDef = {
  kind: 'text', match: 'text/', version: 1,
  parse(data, ctx) {
    const support = textSupport();
    if (!support) {
      const ok = typeof data === 'object' && data !== null && Array.isArray((data as { templates?: unknown }).templates);
      return { items: [], problems: [{ severity: ok ? 'warning' : 'error', code: ok ? 'text.validator_missing' : 'schema.type', path: '$', message: ok ? 'template validator not wired yet (football-content barrel); file not loaded' : 'a template file is an object with a templates list' }] };
    }
    const r = support.validateTemplateFile(data, { unknownFields: ctx.unknownFields });
    const problems: KindProblem[] = r.problems.map((p) => ({ severity: p.severity, code: p.code, path: p.path, message: p.message }));
    if (!r.file) return { items: [], problems };
    const lang = r.file.language;
    const folderLang = ctx.filePath.split('/')[1];
    if (folderLang !== lang) problems.push({ severity: 'error', code: 'text.language_folder', path: '$.language', message: `file declares ${lang} but sits in text/${folderLang ?? ''}/` });
    return { items: r.file.templates.map((t) => ({ id: `${lang}:${t.key}`, data: t, levelTags: ['both'], draft: false })), problems };
  },
};

const LooseRuleSet = RuleSetFile.strip() as ZodLike<RuleSetFile>;
const rulesKind: KindDef = {
  kind: 'rules', match: 'rules/', version: 1, worldWide: true,
  parse(data, ctx) {
    // schema_version inside the file is the rule-set file's own version (P4.7.1).
    const { value, problems } = parseStrict(RuleSetFile, LooseRuleSet, data, ctx);
    if (!value) return { items: [], problems };
    return { items: [{ id: value.ruleset_id, data: value, levelTags: ['both'], draft: false }], problems };
  },
  refs(data) {
    const parent = (data as { parent?: string }).parent;
    return parent ? [{ kind: 'rules', id: parent, path: '$.parent' }] : [];
  },
};

/** Football kinds named in P4.1.1's `football/` folder. */
export const FOOTBALL_FOLDERS = ['personnel', 'formations', 'motions', 'routes', 'concepts', 'protections', 'runs', 'fronts', 'coverages', 'pressures', 'special-teams', 'rules'] as const;

export class KindRegistry {
  private readonly defs = new Map<string, KindDef>();
  register(def: KindDef): this { this.defs.set(def.kind, def); return this; }
  get(kind: string): KindDef | undefined { return this.defs.get(kind); }
  all(): KindDef[] { return [...this.defs.values()].sort((a, b) => a.kind.localeCompare(b.kind)); }
  /** Longest matching folder prefix or exact file path. */
  forPath(path: string): KindDef | undefined {
    let best: KindDef | undefined;
    for (const d of this.defs.values()) {
      const hit = d.match.endsWith('/') ? path.startsWith(d.match) : path === d.match;
      if (hit && (!best || d.match.length > best.match.length)) best = d;
    }
    return best;
  }
}

/** Folders the content pipeline knows but does not load (P4.1.1). */
export const NOT_LOADED_FOLDERS: Readonly<Record<string, string>> = {
  'packs-people/': 'people packs are imported by the people-pack importer (U7, P7.3), not the content loader',
  'tests/': "the pack's own golden plays and rule cases run in the test harness, not in a career",
};

export function defaultRegistry(): KindRegistry {
  const r = new KindRegistry();
  r.register(textKind).register(rulesKind);
  r.register(envelopeKind('league-rules', 'league-rules/', { worldWide: true }));
  for (const f of FOOTBALL_FOLDERS) r.register(envelopeKind(`football/${f}`, `football/${f}/`));
  r.register(envelopeKind('playbooks', 'playbooks/'));
  r.register(envelopeKind('people', 'people/'));
  r.register(envelopeKind('world', 'world/', { worldWide: true }));
  r.register(envelopeKind('models', 'models/', { worldWide: true }));
  return r;
}
