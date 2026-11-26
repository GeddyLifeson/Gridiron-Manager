// World contract, part 10: interface and settings records (P3.6.1, O1.1.2, O5, P4.5.1, P4.6.1).
// No setting changes outcomes and none sets a difficulty (A3.1.1 row 10). The forbidden-key lint
// checks these shapes like every other.
import { z } from 'zod';
import { pub } from '../field.ts';
import { zTextKey } from './primitives.ts';

/** Screen record (P3.6.1, O1.1.2). Level and rung lists filter which screens a job shows (O7); they never change football. */
export const ScreenRecord = z.object({
  id: pub(z.string().min(1)),
  titleKey: zTextKey(),
  hub: pub(z.string().min(1)),
  route: pub(z.string().regex(/^\//)),
  readModelKeys: pub(z.array(z.string().min(1))),
  /** S3 task ids for permission state (Yours, Assigned, Suggest, Read). */
  taskIds: pub(z.array(z.string())),
  levels: pub(z.array(z.enum(['college', 'pro']))),
  rungs: pub(z.array(z.number().int().min(0).max(9)), 'index'),
  shortcut: pub(z.string()).nullable(),
  helpKey: zTextKey().nullable(),
  secondWindowAllowed: pub(z.boolean()),
}).strict();
export type ScreenRecord = z.infer<typeof ScreenRecord>;

const SettingValue = z.union([z.string(), z.number(), z.boolean()]);

/** Setting record (P3.6.1, O5). Save-scope settings are copied into the world's settings block. */
export const SettingRecord = z.object({
  key: pub(z.string().min(1)),
  type: pub(z.enum(['boolean', 'number', 'enum', 'string'])),
  default: pub(SettingValue, 'ratio'),
  /** Number range, low and high, for a number setting. */
  range: pub(z.tuple([z.number(), z.number()]), 'ratio').nullable(),
  options: pub(z.array(z.string())).nullable(),
  scope: pub(z.enum(['user', 'save', 'session'])),
  group: pub(z.string().min(1)),
  lockedInCertified: pub(z.boolean()),
  explanationKey: zTextKey(),
}).strict();
export type SettingRecord = z.infer<typeof SettingRecord>;

/** Key binding (P3.6.1, O5.3.1). Conflicts within a context are rejected by the editor. */
export const KeyBinding = z.object({
  actionId: pub(z.string().min(1)),
  context: pub(z.string().min(1)),
  defaultKey: pub(z.string().min(1)),
  userKey: pub(z.string()).nullable(),
}).strict();
export type KeyBinding = z.infer<typeof KeyBinding>;

/** Template text (P3.6.1, P4.6.1): wording by level and rung variant, filled from read-model parameters. */
export const TemplateText = z.object({
  key: pub(z.string().min(1)),
  text: pub(z.string()),
  levelVariants: pub(z.record(z.string(), z.string())),
  rungVariants: pub(z.record(z.string(), z.string())),
  parameters: pub(z.array(z.string())),
}).strict();
export type TemplateText = z.infer<typeof TemplateText>;
