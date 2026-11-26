// The coach's own folders: create, rename, reorder, file and move plays, all pure and refusing bad edits.
import { describe, expect, it } from 'vitest';
import * as pb from '../../src/playbook/index.ts';

const { book } = pb.starterBook('T');
const off = [...book.plays.values()].filter((p) => p.book === 'offense').map((p) => p.id);
const def = [...book.plays.values()].find((p) => p.book === 'defense')?.id;

function apply(fs: pb.Folders, ...edits: pb.FolderEdit[]): pb.Folders {
  for (const e of edits) {
    const r = pb.editFolders(fs, book, e);
    if (!r.ok) throw new Error(r.refusal);
    fs = r.folders;
  }
  return fs;
}

describe('folders', () => {
  it('creates, renames and refuses duplicate or empty names', () => {
    const fs = apply([], { kind: 'create_folder', id: 'a', name: '  Openers ', book: 'offense' });
    expect(fs).toEqual([{ id: 'a', name: 'Openers', book: 'offense', playIds: [] }]);
    expect(pb.editFolders(fs, book, { kind: 'create_folder', id: 'b', name: 'openers', book: 'offense' }).ok).toBe(false);
    expect(pb.editFolders(fs, book, { kind: 'create_folder', id: 'b', name: ' ', book: 'offense' }).ok).toBe(false);
    expect(pb.editFolders(fs, book, { kind: 'create_folder', id: 'b', name: 'Openers', book: 'defense' }).ok).toBe(true);
    expect(apply(fs, { kind: 'rename_folder', folderId: 'a', name: 'First 15' })[0]!.name).toBe('First 15');
  });
  it('reorders folders and plays inside a folder', () => {
    let fs = apply([], { kind: 'create_folder', id: 'a', name: 'A', book: 'offense' }, { kind: 'create_folder', id: 'b', name: 'B', book: 'offense' }, { kind: 'create_folder', id: 'c', name: 'C', book: 'offense' });
    fs = apply(fs, { kind: 'reorder_folder', folderId: 'c', index: 0 });
    expect(fs.map((f) => f.id)).toEqual(['c', 'a', 'b']);
    fs = apply(fs, { kind: 'file_plays', folderId: 'a', playIds: [off[0]!, off[1]!, off[2]!] });
    fs = apply(fs, { kind: 'file_plays', folderId: 'a', playIds: [off[2]!], index: 0 });
    expect(fs.find((f) => f.id === 'a')!.playIds).toEqual([off[2], off[0], off[1]]);
  });
  it('moves plays between folders and lets a play sit in two folders', () => {
    let fs = apply([], { kind: 'create_folder', id: 'a', name: 'A', book: 'offense' }, { kind: 'create_folder', id: 'b', name: 'B', book: 'offense' });
    fs = apply(fs, { kind: 'file_plays', folderId: 'a', playIds: [off[0]!, off[1]!] }, { kind: 'file_plays', folderId: 'b', playIds: [off[0]!] });
    expect(pb.foldersHolding(fs, off[0]!)).toEqual(['a', 'b']);
    fs = apply(fs, { kind: 'file_plays', folderId: 'b', playIds: [off[1]!], fromFolderId: 'a' });
    expect(fs.find((f) => f.id === 'a')!.playIds).toEqual([off[0]]);
    expect(fs.find((f) => f.id === 'b')!.playIds).toEqual([off[0], off[1]]);
    fs = apply(fs, { kind: 'unfile_plays', folderId: 'b', playIds: [off[0]!] });
    expect(fs.find((f) => f.id === 'b')!.playIds).toEqual([off[1]]);
  });
  it('refuses unknown plays, folders and the wrong side', () => {
    const fs = apply([], { kind: 'create_folder', id: 'a', name: 'A', book: 'offense' });
    expect(pb.editFolders(fs, book, { kind: 'file_plays', folderId: 'a', playIds: ['nope'] }).ok).toBe(false);
    expect(pb.editFolders(fs, book, { kind: 'file_plays', folderId: 'z', playIds: [off[0]!] }).ok).toBe(false);
    if (def) expect(pb.editFolders(fs, book, { kind: 'file_plays', folderId: 'a', playIds: [def] }).ok).toBe(false);
  });
  it('foldersOf drops plays that left the book and keeps one side', () => {
    const fs: pb.Folders = [{ id: 'a', name: 'A', book: 'offense', playIds: [off[0]!, 'gone'] }, { id: 'd', name: 'D', book: 'defense', playIds: [] }];
    expect(pb.foldersOf(fs, book, 'offense')).toEqual([{ id: 'a', name: 'A', book: 'offense', playIds: [off[0]] }]);
  });
});
