// The coach's own folders (G3.1.1 labels, organised): named, ordered collections of plays that sit beside the
// fixed home sections. A play keeps exactly one home section; folders are free, a play may sit in several
// folders and a folder may hold plays from one book (side) only. Order inside a folder is the coach's order,
// so the call sheet and the print can follow it. Pure: every edit returns a new list, ids come from the host.
import type { Book, Playbook } from './types.ts';

export interface Folder {
  readonly id: string;
  readonly name: string;
  readonly book: Book;
  /** Plays in the coach's order. */
  readonly playIds: readonly string[];
}

/** Folders in the coach's order. */
export type Folders = readonly Folder[];

export const MAX_FOLDER_NAME = 40;

export type FolderEdit =
  | { readonly kind: 'create_folder'; readonly id: string; readonly name: string; readonly book: Book }
  | { readonly kind: 'rename_folder'; readonly folderId: string; readonly name: string }
  | { readonly kind: 'delete_folder'; readonly folderId: string }
  /** Move a folder to position `index` among the folders (0 is first). */
  | { readonly kind: 'reorder_folder'; readonly folderId: string; readonly index: number }
  /** Put plays into a folder at `index` (end when absent). `fromFolderId` removes them from that folder (a move). */
  | { readonly kind: 'file_plays'; readonly folderId: string; readonly playIds: readonly string[]; readonly index?: number; readonly fromFolderId?: string }
  | { readonly kind: 'unfile_plays'; readonly folderId: string; readonly playIds: readonly string[] };

export type FolderResult = { readonly ok: true; readonly folders: Folders } | { readonly ok: false; readonly refusal: string };

const clampIndex = (i: number | undefined, len: number): number => (i === undefined || !Number.isFinite(i) ? len : Math.max(0, Math.min(len, Math.trunc(i))));

function cleanName(name: string): string | null {
  const n = name.trim().replace(/\s+/g, ' ');
  return n.length === 0 || n.length > MAX_FOLDER_NAME ? null : n;
}

function nameTaken(folders: Folders, book: Book, name: string, except?: string): boolean {
  const k = name.toLowerCase();
  return folders.some((f) => f.book === book && f.id !== except && f.name.toLowerCase() === k);
}

/** Apply one folder edit. Refusals say why in plain words; the list is unchanged on refusal. */
export function editFolders(folders: Folders, book: Playbook, e: FolderEdit): FolderResult {
  const find = (id: string) => folders.find((f) => f.id === id);
  switch (e.kind) {
    case 'create_folder': {
      const name = cleanName(e.name);
      if (!name) return { ok: false, refusal: `a folder name is 1 to ${MAX_FOLDER_NAME} characters` };
      if (folders.some((f) => f.id === e.id)) return { ok: false, refusal: `folder id ${e.id} is in use` };
      if (nameTaken(folders, e.book, name)) return { ok: false, refusal: `there is already a folder called ${name}` };
      return { ok: true, folders: [...folders, { id: e.id, name, book: e.book, playIds: [] }] };
    }
    case 'rename_folder': {
      const f = find(e.folderId);
      if (!f) return { ok: false, refusal: `no folder ${e.folderId}` };
      const name = cleanName(e.name);
      if (!name) return { ok: false, refusal: `a folder name is 1 to ${MAX_FOLDER_NAME} characters` };
      if (nameTaken(folders, f.book, name, f.id)) return { ok: false, refusal: `there is already a folder called ${name}` };
      return { ok: true, folders: folders.map((x) => (x.id === f.id ? { ...x, name } : x)) };
    }
    case 'delete_folder': {
      if (!find(e.folderId)) return { ok: false, refusal: `no folder ${e.folderId}` };
      return { ok: true, folders: folders.filter((x) => x.id !== e.folderId) };
    }
    case 'reorder_folder': {
      const f = find(e.folderId);
      if (!f) return { ok: false, refusal: `no folder ${e.folderId}` };
      const rest = folders.filter((x) => x.id !== f.id);
      const at = clampIndex(e.index, rest.length);
      return { ok: true, folders: [...rest.slice(0, at), f, ...rest.slice(at)] };
    }
    case 'file_plays': {
      const f = find(e.folderId);
      if (!f) return { ok: false, refusal: `no folder ${e.folderId}` };
      const from = e.fromFolderId === undefined ? undefined : find(e.fromFolderId);
      if (e.fromFolderId !== undefined && !from) return { ok: false, refusal: `no folder ${e.fromFolderId}` };
      const ids: string[] = [];
      for (const id of e.playIds) {
        const p = book.plays.get(id);
        if (!p) return { ok: false, refusal: `no play ${id}` };
        if (p.book !== f.book) return { ok: false, refusal: `${id} is a ${p.book.replace('_', ' ')} play and ${f.name} is a ${f.book.replace('_', ' ')} folder` };
        if (!ids.includes(id)) ids.push(id);
      }
      // Moving inside one folder is a reorder: take the plays out first, then insert at the index.
      const kept = f.playIds.filter((id) => !ids.includes(id));
      const at = clampIndex(e.index, kept.length);
      const nextTo: Folder = { ...f, playIds: [...kept.slice(0, at), ...ids, ...kept.slice(at)] };
      return {
        ok: true,
        folders: folders.map((x) => {
          if (x.id === f.id) return nextTo;
          if (from && x.id === from.id) return { ...x, playIds: x.playIds.filter((id) => !ids.includes(id)) };
          return x;
        }),
      };
    }
    case 'unfile_plays': {
      const f = find(e.folderId);
      if (!f) return { ok: false, refusal: `no folder ${e.folderId}` };
      return { ok: true, folders: folders.map((x) => (x.id === f.id ? { ...x, playIds: x.playIds.filter((id) => !e.playIds.includes(id)) } : x)) };
    }
  }
}

/** Folders of one side, in order, with plays that left the book dropped (a deleted play leaves no gap). */
export function foldersOf(folders: Folders, book: Playbook, side: Book): Folder[] {
  return folders.filter((f) => f.book === side).map((f) => ({ ...f, playIds: f.playIds.filter((id) => book.plays.has(id)) }));
}

/** Folder ids a play sits in, in folder order. */
export function foldersHolding(folders: Folders, playId: string): string[] {
  return folders.filter((f) => f.playIds.includes(playId)).map((f) => f.id);
}
