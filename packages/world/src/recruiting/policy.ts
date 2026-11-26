// K7.5.1 rules 2 and 3 as the G-36 policy hook (front office `gm/college`): offers out per room and the
// offers the school would take a commitment on. Board order stays the staff's own board (their observed
// grades, K9); `gm.recruitBoard` over those grades is owed (README RC-10).
import { gm } from '@gm/front-office';
import type { recruiting } from '@gm/league';
import { param as turnoverParam } from '../turnover/params.ts';

export function gmRecruitingPolicy(): recruiting.AiProgramPolicy {
  return {
    offersWanted: (q) => gm.offersWanted(q.open, turnoverParam('college.offersPerSignee'), gm.P('college.evenBattleShare')),
    committable: (q) => Math.max(0, Math.round(q.open * gm.P('college.committablePerPlace'))),
  };
}
