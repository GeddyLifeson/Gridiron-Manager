// @gm/app-services, playbook commands (G-67 screens; O3.3.1 bulk actions over G3). Each command checks the
// user's job (G3.4.3) first: a control he does not hold becomes a suggestion to the holder, never an edit.
// Commands return the new state; the host stores it and logs the command (P5).
import { playbook as pb } from '@gm/football-content';

export interface PlaybookState {
  readonly book: pb.Playbook;
  readonly words: pb.WordList;
  readonly links: readonly pb.RoleLink[];
  readonly history: pb.History;
  /** The coach's own folders (absent in saves made before folders: read as none). */
  readonly folders?: pb.Folders;
}

export interface CommandContext {
  readonly holder: pb.Holder;
  readonly side: pb.Book;
  readonly validate: pb.Validator;
  /** Stamp for version records (command index or game day). */
  readonly stamp: number;
  /** Id for a suggestion or a new play, supplied by the host so replays are identical. */
  readonly newId: string;
  readonly userId: string;
}

export type PlaybookCommand =
  | { readonly kind: 'retire'; readonly playIds: readonly string[] }
  | { readonly kind: 'restore'; readonly playIds: readonly string[] }
  | { readonly kind: 'duplicate'; readonly playId: string }
  | { readonly kind: 'set_role'; readonly playId: string; readonly role: pb.Role }
  | { readonly kind: 'rename_word'; readonly partId: string; readonly word: string }
  | { readonly kind: 'link'; readonly link: pb.RoleLink }
  | { readonly kind: 'export'; readonly playIds: readonly string[] }
  /** The coach's own folders. Create takes its id from the context's `newId`. */
  | { readonly kind: 'create_folder'; readonly name: string }
  | { readonly kind: 'rename_folder'; readonly folderId: string; readonly name: string }
  | { readonly kind: 'delete_folder'; readonly folderId: string }
  | { readonly kind: 'reorder_folder'; readonly folderId: string; readonly index: number }
  | { readonly kind: 'file_plays'; readonly folderId: string; readonly playIds: readonly string[]; readonly index?: number; readonly fromFolderId?: string }
  | { readonly kind: 'unfile_plays'; readonly folderId: string; readonly playIds: readonly string[] };

export type CommandResult =
  | { readonly ok: true; readonly state: PlaybookState; readonly file?: string; readonly notes: readonly string[] }
  | { readonly ok: false; readonly refusal: string; readonly suggestion?: pb.Suggestion };

const EDIT: Readonly<Record<PlaybookCommand['kind'], pb.PlaybookAction>> = {
  retire: 'edit_side_playbook', restore: 'edit_side_playbook', duplicate: 'draft_play', set_role: 'edit_side_playbook',
  rename_word: 'edit_side_playbook', link: 'edit_side_playbook', export: 'view',
  // Folders are the user's own way of keeping the book: anyone who can read the book can file it.
  create_folder: 'view', rename_folder: 'view', delete_folder: 'view', reorder_folder: 'view', file_plays: 'view', unfile_plays: 'view',
};

function version(h: pb.History, play: pb.PlayEntry, stamp: number, note: string): pb.History {
  return pb.recordVersion(h, play, stamp, note);
}

export function runPlaybookCommand(s: PlaybookState, ctx: CommandContext, cmd: PlaybookCommand): CommandResult {
  const action = EDIT[cmd.kind];
  const access = pb.access(ctx.holder, action, ctx.side);
  if (!access.allowed) {
    const suggestion = access.suggest ? pb.suggest(ctx.newId, ctx.userId, ctx.holder, action, ctx.side, JSON.stringify(cmd)) : undefined;
    return { ok: false, refusal: `held by ${access.heldBy}`, suggestion };
  }
  try {
    switch (cmd.kind) {
      case 'retire':
      case 'restore': {
        let book = s.book;
        let history = s.history;
        for (const id of cmd.playIds) {
          book = pb.setStatus(book, id, cmd.kind === 'retire' ? 'retired' : 'draft', ctx.validate);
          history = version(history, book.plays.get(id)!, ctx.stamp, cmd.kind);
        }
        return { ok: true, state: { ...s, book, history }, notes: cmd.kind === 'restore' ? ['restored plays return as draft for re-validation'] : [] };
      }
      case 'duplicate': {
        const src = s.book.plays.get(cmd.playId);
        if (!src) return { ok: false, refusal: `no play ${cmd.playId}` };
        const copy: pb.PlayEntry = { ...src, id: ctx.newId, status: 'draft', parentId: src.id, origin: `copy:${src.id}` };
        const book = pb.addPlay(s.book, copy);
        return { ok: true, state: { ...s, book, history: version(s.history, copy, ctx.stamp, 'duplicate') }, notes: [] };
      }
      case 'set_role': {
        const p = s.book.plays.get(cmd.playId);
        if (!p) return { ok: false, refusal: `no play ${cmd.playId}` };
        const next = { ...p, role: cmd.role };
        return { ok: true, state: { ...s, book: pb.replacePlay(s.book, next), history: version(s.history, next, ctx.stamp, 'role') }, notes: [] };
      }
      case 'rename_word': {
        const words = pb.rename(s.words, cmd.partId, cmd.word);
        const problems = pb.checkWords(words).filter((p) => p.a === cmd.partId || p.b === cmd.partId);
        const dup = problems.find((p) => p.kind === 'duplicate');
        if (dup) return { ok: false, refusal: `the word is already used by ${dup.a === cmd.partId ? dup.b : dup.a}` };
        const users = pb.dependentsOf(s.book, cmd.partId).length;
        const notes = [`${users} call(s) re-rendered; players relearn the label (G4.7.1)`, ...problems.map((p) => `sounds like ${p.a === cmd.partId ? p.b : p.a}`)];
        return { ok: true, state: { ...s, words }, notes };
      }
      case 'link':
        return { ok: true, state: { ...s, links: pb.addLink(s.book, s.links, cmd.link) }, notes: [] };
      case 'export':
        return { ok: true, state: s, file: pb.toJson(pb.exportPlays(s.book, cmd.playIds)), notes: [] };
      case 'create_folder':
      case 'rename_folder':
      case 'delete_folder':
      case 'reorder_folder':
      case 'file_plays':
      case 'unfile_plays': {
        const edit: pb.FolderEdit = cmd.kind === 'create_folder' ? { kind: 'create_folder', id: ctx.newId, name: cmd.name, book: ctx.side } : cmd;
        const r = pb.editFolders(s.folders ?? [], s.book, edit);
        return r.ok ? { ok: true, state: { ...s, folders: r.folders }, notes: [] } : { ok: false, refusal: r.refusal };
      }
    }
  } catch (e) {
    return { ok: false, refusal: (e as Error).message };
  }
}
