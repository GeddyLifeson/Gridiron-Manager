// Non-playing people (D13.3.5 coaches, staff, agents, officials; X1.2.1 groups): identity and the X1
// trait block. Role blocks (coaching, scouting, life rows) are added by their owners (G-26, G-29, G-47).
import { PersonRecord, type PersonRole } from '@gm/schema';
import { drawTraitBlock, type PopulationGroup } from './traits.ts';
import { GENERATOR_VERSION, STREAM_GEN, type ClassKey, type GeneratorRandom } from './generate.ts';

export interface NonPlayerRequest {
  personId: number;
  roles: readonly PersonRole[];
  group: PopulationGroup;
  ageYears: number;
  seasonYear: number;
  classKey: ClassKey;
  homeRegion: string;
  hometown: string | null;
  name: PersonRecord['name'];
}

export function generateNonPlayer(req: NonPlayerRequest, rnd: GeneratorRandom): PersonRecord {
  const k = req.classKey;
  const s = rnd.open(STREAM_GEN, [k.classYear, k.classType, k.slotIndex, 0]);
  const dayIndex = s.int(0, 364);
  const birthYear = req.seasonYear - req.ageYears - (dayIndex > 243 ? 1 : 0);
  return PersonRecord.parse({
    id: req.personId,
    origin: 'generated',
    externalRef: null,
    provenance: { generatorVersion: GENERATOR_VERSION, seedHex: rnd.seedHex(STREAM_GEN, [k.classYear, k.classType, k.slotIndex, 0]) },
    name: req.name,
    birthDate: { seasonYear: birthYear, dayIndex },
    hometown: req.hometown,
    appearanceSeed: s.nextU32(),
    roles: [...req.roles],
    agentId: null,
    diedYear: null,
    life: { householdId: null, homeRegion: req.homeRegion },
    history: { honourEventIds: [] },
    traitBlock: drawTraitBlock(rnd.open('person.traits', [req.personId]), {
      group: req.group, ageYears: req.ageYears, seasonYear: req.seasonYear, roles: req.roles,
    }),
  });
}
