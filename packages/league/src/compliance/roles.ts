// Role to fine column (I11.8.1 fines head coaches, assistants and players on separate scales).
import type { ActorRole } from './catalogue.ts';
import type { FineGroup } from './params.ts';

const GROUP: Readonly<Record<ActorRole, FineGroup>> = {
  head_coach: 'head_coach',
  coordinator: 'assistant',
  position_coach: 'assistant',
  graduate_assistant: 'assistant',
  recruiter: 'assistant',
  player: 'player',
  general_manager: 'executive',
  owner: 'executive',
  athletic_director: 'executive',
  club_staff: 'executive',
  booster: 'executive',
};

export function groupOf(role: ActorRole): FineGroup { return GROUP[role]; }
