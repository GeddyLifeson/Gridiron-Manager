// G-40: types and pure helpers for the college level priors file (T10.5.1). No clock, random, file or network (P1.1.1).

export interface SystemFamily {
  readonly id: string;
  readonly label: string;
  readonly share: number;
  readonly marks: string;
}

export interface CollegePriors {
  readonly schema: 'g40.college-priors.v1';
  readonly level: 'college';
  readonly keys: Readonly<Record<string, { readonly reader: string; readonly value: unknown; readonly factIds: readonly string[]; readonly ruleKeyRefs?: readonly string[] }>>;
  readonly system_priors: {
    readonly college: {
      readonly offense: { readonly families: readonly SystemFamily[]; readonly factIds: readonly string[] };
      readonly defense: { readonly families: readonly SystemFamily[]; readonly factIds: readonly string[] };
    };
  };
  readonly levelOverrides: {
    readonly second_subdivision_and_below: {
      readonly 'pass_rate.college': { readonly value: number; readonly factIds: readonly string[] };
      readonly system_priors: { readonly offense: { readonly families: readonly SystemFamily[]; readonly factIds: readonly string[] } };
    };
  };
}

export type CollegeTier = 'top_subdivision' | 'second_subdivision_and_below';

/** Sum of the shares in a family table. */
export function shareSum(families: readonly SystemFamily[]): number {
  let t = 0;
  for (const f of families) t += f.share;
  return t;
}

/** Offensive family shares for a tier: the base table, or the lower-division table with the 10 point shift (T10.2.1 rule 4). */
export function offenseFamilies(p: CollegePriors, tier: CollegeTier): readonly SystemFamily[] {
  return tier === 'top_subdivision' ? p.system_priors.college.offense.families : p.levelOverrides.second_subdivision_and_below.system_priors.offense.families;
}

/** Pass rate prior for a tier (T10.5.1 level override block). */
export function passRate(p: CollegePriors, tier: CollegeTier): number {
  return tier === 'top_subdivision' ? (p.keys['pass_rate.college']!.value as number) : p.levelOverrides.second_subdivision_and_below['pass_rate.college'].value;
}
