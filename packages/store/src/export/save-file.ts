// Career file export and import (P5.6.1, P5.7). The exported file is the save database itself, the
// same bytes on the browser and the desktop, so a career moves between them unchanged. Import checks
// the bytes before anything is stored: an SQLite file, a header row, a save format this build reads.
import type { SqlJsStatic } from 'sql.js';
import type { SaveHeader } from '@gm/schema';
import { readHeader, SaveFormatError, SAVE_FILE_EXTENSION } from '../save-store.ts';
import { SqlJsDriver } from '../sqljs-driver.ts';

/** First 16 bytes of every SQLite 3 database file ("SQLite format 3" and a zero byte). */
const SQLITE_MAGIC = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00];

export function isSqliteFile(bytes: Uint8Array): boolean {
  return bytes.length >= SQLITE_MAGIC.length && SQLITE_MAGIC.every((b, i) => bytes[i] === b);
}

/** Reads the header of a career file without keeping it open. Throws SaveFormatError with a plain reason. */
export async function readSaveFileHeader(SQL: SqlJsStatic, bytes: Uint8Array): Promise<SaveHeader> {
  if (!isSqliteFile(bytes)) throw new SaveFormatError('not a career file: it is not a save database');
  let driver: SqlJsDriver;
  try { driver = SqlJsDriver.open(SQL, bytes); } catch (e) { throw new SaveFormatError(`not a career file: ${(e as Error).message}`); }
  try {
    return await readHeader(driver);
  } catch (e) {
    if (e instanceof SaveFormatError) throw e;
    throw new SaveFormatError(`not a career file: ${(e as Error).message}`);
  } finally {
    await driver.close();
  }
}

/** A file name for an exported career: the save name with characters every file system accepts. */
export function saveFileName(saveName: string): string {
  const safe = saveName.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 120);
  return `${safe || 'career'}${SAVE_FILE_EXTENSION}`;
}
