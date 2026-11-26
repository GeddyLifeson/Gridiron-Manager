// The register rows behind the glossary (Q6.1.1): each term's `factRow` names one row here, and its
// status is computed from the row's sources (Q6.1.2), never typed. Read by the glossary screen (A4.1.1:
// "every term with its source").
import { FactFile, computeStatus, type FactRow, type FactStatus } from '@gm/schema';
import RULE from '../../data/glossary/facts-rule.json' with { type: 'json' };
import LEAGUE from '../../data/glossary/facts-league-rule.json' with { type: 'json' };
import CONVENTION from '../../data/glossary/facts-coaching-convention.json' with { type: 'json' };
import MEDICAL from '../../data/glossary/facts-medical.json' with { type: 'json' };

/** Every glossary register row, sorted by id. */
export const GLOSSARY_FACTS: readonly FactRow[] = [RULE, LEAGUE, CONVENTION, MEDICAL]
  .flatMap((f) => FactFile.parse(f).rows)
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const BY_ID = new Map(GLOSSARY_FACTS.map((r) => [r.id, r] as const));

export function glossaryFact(id: string): FactRow | null {
  return BY_ID.get(id) ?? null;
}

/** Computed status of a term's register row; a row that is missing reads Unverified. */
export function glossaryFactStatus(id: string): FactStatus {
  const r = BY_ID.get(id);
  return r ? computeStatus(r) : 'Unverified';
}
