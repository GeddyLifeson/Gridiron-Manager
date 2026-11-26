// The zod schema of the Mods and editors screen model (G-96, bible P7.1 to P7.5), with a visibility class
// on every field. It lists the user content folder's packs as the safety scan and loader saw them, and the
// P7.5.1 editors. All of it is the user's own install (own_team); nothing comes from a world. Built by
// app-services read-models/editors.
import { z } from 'zod';
import { own } from '../field.ts';

const text = () => own(z.string());
const flag = () => own(z.boolean());

const Problem = z.object({ severity: own(z.enum(['error', 'flag', 'warning', 'info'])), code: text(), file: text(), path: text(), message: text() }).strict();
const Pack = z.object({
  origin: text(), packId: text(), name: text(), version: text(), author: text(), kinds: own(z.array(z.string())),
  signature: own(z.enum(['unsigned', 'signature_not_checked'])), selectable: flag(), problems: own(z.array(Problem)),
  ignored: own(z.array(z.object({ file: text(), reason: text() }).strict())), neutralisedCount: own(z.number().int().min(0), 'count'),
}).strict();

export const EditorsData = z.object({
  folder: text().nullable(), canImport: flag(), certified: flag(), packs: own(z.array(Pack)),
  editors: own(z.array(z.object({ id: text(), title: text(), certifiedAllowed: flag() }).strict())),
}).strict();
