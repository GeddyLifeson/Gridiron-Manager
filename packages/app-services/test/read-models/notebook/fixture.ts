// A small notebook and ledger for the coach.notebook read model and screen tests.
import { coach } from '@gm/career';

export const ME = 900;
export const BOSS = 700;
export const LB_JOB: coach.AuthorJob = { jobCatalogueId: 'core:position_coach_lb', teamId: 2 };
export const HC_JOB: coach.AuthorJob = { jobCatalogueId: 'core:head_coach', teamId: 13 };
export const at = (seasonYear: number, dayIndex = 0, real: string | null = null) => ({ world: { seasonYear, dayIndex }, real });

const NAMES: Record<string, string> = {
  'person:501': 'Dale Ruiz', 'team:4': 'Harbor City', 'crew:3': 'Crew of R. Ames', 'play:inside_zone': 'Inside zone',
};
export const namer = {
  subject: (s: coach.Subject) => NAMES[`${s.type}:${String(s.id)}`] ?? `${s.type} ${String(s.id)}`,
  job: (j: coach.AuthorJob) => (j.jobCatalogueId === 'core:head_coach' ? 'Head coach, Bayport' : 'Linebackers coach, Rivertown'),
  person: (id: number) => (id === 800 ? 'Earl Mason' : `person ${id}`),
};

function must(r: coach.NoteResult): coach.Notebook {
  if (!r.ok) throw new Error(r.key);
  return r.notebook;
}

export function sampleNotebook(): coach.Notebook {
  let nb = coach.emptyNotebook(ME);
  nb = must(coach.writeNote(nb, { text: 'Ruiz shows blitz with his feet before the snap.', subjects: [{ type: 'person', id: 501 }], kind: 'opponent', tags: ['tells'] }, at(2026, 40), LB_JOB));
  nb = must(coach.writeNote(nb, { text: 'Harbor City sit in quarters on third and long.', subjects: [{ type: 'team', id: 4 }], kind: 'opponent', tags: ['third down', 'tells'] }, at(2027, 12), LB_JOB));
  nb = must(coach.writeNote(nb, { text: 'This crew lets the corners hold at the top of routes.', subjects: [{ type: 'crew', id: 3 }], kind: 'official' }, at(2028, 5), HC_JOB));
  nb = must(coach.writeNote(nb, { text: 'Run inside zone from 12 personnel more when ahead.', subjects: [{ type: 'play', id: 'inside_zone' }], kind: 'idea', pinned: true }, at(2028, 30), HC_JOB));
  const old = must(coach.writeNote(coach.emptyNotebook(800), { text: 'Old file: their owner calls the GM every Monday.', subjects: [], kind: 'job' }, at(2020, 1), HC_JOB));
  return coach.inheritNotebook({ ...old, ownerPersonId: 800 }, nb);
}

function must2(r: coach.PhilosophyResult): coach.Philosophy {
  if (!r.ok) throw new Error(r.key);
  return r.philosophy;
}

export function samplePhilosophy(personId = ME, draft = false): coach.Philosophy {
  let p = coach.setText(coach.emptyPhilosophy(personId, draft), 'Tough, smart, and fair. The film decides who plays.', { seasonYear: 2028, dayIndex: 0 });
  p = must2(coach.stateCommitment(p, 'best_player_plays', 'team', { seasonYear: 2028, dayIndex: 0 }, 'The best player plays. Every week.'));
  p = must2(coach.stateCommitment(p, 'go_when_numbers_say_go', 'public', { seasonYear: 2028, dayIndex: 0 }));
  p = must2(coach.stateCommitment(p, 'tell_you_first', 'team', { seasonYear: 2028, dayIndex: 0 }));
  p = coach.dropCommitment(p, 'go_when_numbers_say_go', { seasonYear: 2028, dayIndex: 200 });
  return p;
}

const base = (id: number, dayIndex: number, deciderId = ME, factsKnown = true) => ({ id, date: { seasonYear: 2028, dayIndex }, deciderId, factsKnown });

export function sampleDecisions(deciderId = ME): coach.LedgerDecision[] {
  return [
    { ...base(11, 20, deciderId), kind: 'depth_change', promotedId: 51, demotedId: 52, promotedGrade: 74, demotedGrade: 70, demotedIsStarOrHighPick: false },
    { ...base(12, 40, deciderId), kind: 'depth_change', promotedId: 53, demotedId: 54, promotedGrade: 61, demotedGrade: 68, demotedIsStarOrHighPick: true },
    // Hidden fact: never a break (E10.4.1 rule 2).
    { ...base(13, 60, deciderId, false), kind: 'depth_change', promotedId: 55, demotedId: 56, promotedGrade: 50, demotedGrade: 72, demotedIsStarOrHighPick: false },
    { ...base(14, 80, deciderId), kind: 'fourth_down', went: true, goAdvantageEp: 1.2 },
  ];
}
