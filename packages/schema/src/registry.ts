// Every schema the project defines, by name, for the schema lints (Q1.2.1, P3.1.2) and the truth scan (Q1.4.2).
import type { z } from 'zod';
import { Competition, Person, Team, WorldState } from './entities.ts';
import { RuleKeyDef, RuleSetFile } from './rules.ts';
import { FactRow } from './facts.ts';
import { COMMANDS, CommandEnvelope, READ_MODELS } from './commands.ts';
import { SaveHeader } from './save.ts';
import { DummyGameState, PlayRow } from './game.ts';

export function allSchemas(): Record<string, z.ZodType> {
  const out: Record<string, z.ZodType> = {
    WorldState, Competition, Team, Person, RuleKeyDef, RuleSetFile, FactRow, CommandEnvelope, SaveHeader, DummyGameState, PlayRow,
  };
  for (const c of COMMANDS) out[`command:${c.type}`] = c.payload;
  for (const [k, v] of Object.entries(READ_MODELS)) out[`readModel:${k}`] = v;
  return out;
}

export function readModelSchemas(): Record<string, z.ZodType> {
  return { ...READ_MODELS };
}
