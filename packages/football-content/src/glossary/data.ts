// The shipped glossary: records from data/glossary/terms-*.json and the A4.5.11 block list.
import RULES from '../../data/glossary/terms-rules.json' with { type: 'json' };
import OFFENSE from '../../data/glossary/terms-offense.json' with { type: 'json' };
import DEFENSE from '../../data/glossary/terms-defense.json' with { type: 'json' };
import SPECIAL from '../../data/glossary/terms-special-teams.json' with { type: 'json' };
import SITUATIONAL from '../../data/glossary/terms-situational.json' with { type: 'json' };
import FRONT from '../../data/glossary/terms-front-office.json' with { type: 'json' };
import COLLEGE from '../../data/glossary/terms-college.json' with { type: 'json' };
import STAFF from '../../data/glossary/terms-staff.json' with { type: 'json' };
import SCOUTING from '../../data/glossary/terms-scouting.json' with { type: 'json' };
import PRACTICE from '../../data/glossary/terms-practice-medical-media.json' with { type: 'json' };
import NOT_SHIPPED from '../../data/glossary/not-shipped.json' with { type: 'json' };
import type { NotShipped, TermRecord } from './types.ts';

const FILES = [RULES, OFFENSE, DEFENSE, SPECIAL, SITUATIONAL, FRONT, COLLEGE, STAFF, SCOUTING, PRACTICE] as unknown as { leaf: string; terms: TermRecord[] }[];

/** Every shipped record, sorted by id. */
export const TERMS: readonly TermRecord[] = FILES.flatMap((f) => f.terms).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
export const BLOCK_LIST: readonly NotShipped[] = (NOT_SHIPPED as { terms: NotShipped[] }).terms;
