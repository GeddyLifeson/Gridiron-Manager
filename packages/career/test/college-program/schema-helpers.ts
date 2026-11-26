// Re-exports for the schema test plus the forbidden-key scan over the proposed shapes (Q1.2.1).
import { scanForbiddenKeys } from '@gm/schema';
import { ProgramStateSchema } from './proposed-schemas.ts';
export { generateBoosters, hire, proposeProject, raiseRequest, rollFacilities } from '../../src/college-program/index.ts';

export function scanForbidden(): readonly unknown[] {
  return scanForbiddenKeys({ ProgramState: ProgramStateSchema });
}
