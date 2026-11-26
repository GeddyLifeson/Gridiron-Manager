// Mods and editors view and host (G-96, bible P7.1 to P7.5; proposed screen id `school.mods`). The user
// content folder scan, the safety check and the editor catalogue live in @gm/tools, which app-services may
// not import (P1.2.1), so the host takes them through ports whose shapes match tools/editors `ModEntry` and
// `EditorDef` structurally. The view is what the screen lists: each pack with its problems and whether it
// can be selected, and the P7.5.1 editors. The rule-set editor is non-certified: in a certified career the
// host refuses to open it (P7.5.1, N4).

export type ProblemSeverity = 'error' | 'flag' | 'warning' | 'info';
/** tools content `Problem`, the fields the screen shows. */
export interface ModProblem { readonly severity: ProblemSeverity; readonly code: string; readonly packId?: string; readonly file: string; readonly path: string; readonly message: string }
/** tools editors `ModEntry`, the fields the view reads. */
export interface ModEntryLike {
  readonly origin: string; readonly packId: string; readonly name: string; readonly version: string; readonly author: string;
  readonly kinds: readonly string[]; readonly signature: 'unsigned' | 'signature_not_checked'; readonly selectable: boolean;
  readonly problems: readonly ModProblem[]; readonly ignored: readonly { readonly file: string; readonly reason: string }[];
  readonly neutralised: readonly unknown[];
}
/** tools editors `EditorDef`, the fields the view reads. */
export interface EditorDefLike { readonly id: string; readonly title: string; readonly certifiedAllowed: boolean }

export interface EditorsPack {
  readonly origin: string; readonly packId: string; readonly name: string; readonly version: string; readonly author: string;
  readonly kinds: readonly string[]; readonly signature: 'unsigned' | 'signature_not_checked'; readonly selectable: boolean;
  readonly problems: readonly { readonly severity: ProblemSeverity; readonly code: string; readonly file: string; readonly path: string; readonly message: string }[];
  readonly ignored: readonly { readonly file: string; readonly reason: string }[]; readonly neutralisedCount: number;
}
/** The screen model (app-ui `EditorsUi`; schema @gm/schema `EditorsData`). */
export interface EditorsView {
  readonly folder: string | null;
  readonly canImport: boolean;
  readonly certified: boolean;
  readonly packs: readonly EditorsPack[];
  readonly editors: readonly EditorDefLike[];
}

export interface EditorsInput {
  /** The user content folder on desktop; null in the browser, which imports a file instead (P7.1.1). */
  readonly folder: string | null;
  readonly canImport: boolean;
  readonly certified: boolean;
  readonly entries: readonly ModEntryLike[];
  readonly editors: readonly EditorDefLike[];
}

const SEVERITY_ORDER: Record<ProblemSeverity, number> = { error: 0, flag: 1, warning: 2, info: 3 };

export function buildEditorsView(input: EditorsInput): EditorsView {
  const packs = input.entries.map((e): EditorsPack => ({
    origin: e.origin, packId: e.packId, name: e.name, version: e.version, author: e.author, kinds: [...e.kinds],
    signature: e.signature, selectable: e.selectable,
    problems: [...e.problems]
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
      .map((p) => ({ severity: p.severity, code: p.code, file: p.file, path: p.path, message: p.message })),
    ignored: e.ignored.map((i) => ({ file: i.file, reason: i.reason })), neutralisedCount: e.neutralised.length,
  }));
  return {
    folder: input.folder, canImport: input.canImport, certified: input.certified, packs,
    editors: input.editors.map((d) => ({ id: d.id, title: d.title, certifiedAllowed: d.certifiedAllowed })),
  };
}

/** What the screen sends (app-ui `EditorsIntent`). */
export type EditorsIntent =
  | { type: 'rescan' }
  | { type: 'import' }
  | { type: 'export_errors'; packId: string; origin: string }
  | { type: 'open_editor'; editorId: string };

export interface EditorsPorts {
  folder(): string | null;
  certified(): boolean;
  /** Scans the user content folder: tools/editors `assessUserContent(...).entries`. Run at open and on request (P7.1.1). */
  scan(): readonly ModEntryLike[];
  /** tools/editors `EDITORS`. */
  editors(): readonly EditorDefLike[];
  /** The browser's file import (P7.1.1); absent on desktop, which reads the folder. */
  importPack?(): void;
  /** Hands the pack's error list as text to its author (tools/editors `errorReportText`). */
  exportErrors(entry: ModEntryLike): void;
  openEditor(editorId: string): void;
}

export interface EditorsHost {
  view(): EditorsView;
  dispatch(intent: EditorsIntent): void;
  /** The last refused intent, for the screen's message line; null after any intent that went through. */
  refusal(): { readonly rule: string; readonly message: string } | null;
}

export function editorsHost(ports: EditorsPorts): EditorsHost {
  let entries = ports.scan();
  let refused: { rule: string; message: string } | null = null;
  return {
    view: () => buildEditorsView({ folder: ports.folder(), canImport: ports.importPack !== undefined, certified: ports.certified(), entries, editors: ports.editors() }),
    refusal: () => refused,
    dispatch(intent) {
      refused = null;
      switch (intent.type) {
        case 'rescan': entries = ports.scan(); return;
        case 'import':
          if (!ports.importPack) { refused = { rule: 'P7.1.1', message: 'packs are read from the user content folder here' }; return; }
          ports.importPack(); entries = ports.scan(); return;
        case 'export_errors': {
          const e = entries.find((x) => x.packId === intent.packId && x.origin === intent.origin);
          if (!e) { refused = { rule: 'P7.1.1', message: `no pack ${intent.packId} from ${intent.origin}` }; return; }
          ports.exportErrors(e); return;
        }
        case 'open_editor': {
          const d = ports.editors().find((x) => x.id === intent.editorId);
          if (!d) { refused = { rule: 'P7.5.1', message: `no editor ${intent.editorId}` }; return; }
          if (!d.certifiedAllowed && ports.certified()) { refused = { rule: 'P7.5.1', message: `${d.title} is not available in a certified career` }; return; }
          ports.openEditor(d.id); return;
        }
      }
    },
  };
}
