// The compliance binding over the turnover binding's rule reader, so the composition root wires one reader.
import { levelOfTeam, type Level, type TurnoverBinding } from '../turnover/binding.ts';
import { complianceRules, type ComplianceBinding } from './binding.ts';

/** Rule key whose presence marks a league with school eligibility, and so a school compliance office (L5.4.5, T5). */
export const OFFICE_RULE_KEY = 'eligibility.seasons_of_competition';

/**
 * CO-03: the week's detection and penalties read one rule set, the `level` league's (the pipeline takes one
 * `ComplianceContext.rules`). Every act raised off-screen today is a pro general manager's, so that is the pro set.
 */
export function complianceBindingFrom(b: TurnoverBinding, level: Level): ComplianceBinding {
  return {
    rules: (world) => complianceRules(`world:${level}`, world.date.seasonYear, level, (k) => b.rule(level, k)),
    hasComplianceOffice: (world, teamId) => b.rule(levelOfTeam(world, teamId), OFFICE_RULE_KEY) !== undefined,
  };
}
