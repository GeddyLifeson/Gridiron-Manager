// The question bank. Every option is a real coaching view somebody holds; none is the right answer
// (Marlon 2026-11-26 14:26). Questions ask for a view or a "what would you do", never "is X important?",
// which any candidate answers yes (F-interview-0015). Topics come from real interview accounts
// (facts.json, one row per topic). One slate per opening: every candidate is asked the same questions
// (F-interview-0013).
import { STANCES, type StanceId } from './beliefs.ts';

/** Who the job is: drives which questions fit it. */
export type RoleGroup = 'head' | 'coordinator' | 'position' | 'support' | 'entry' | 'strength' | 'personnel';
export type QuestionSide = 'any' | 'offense' | 'defense' | 'special_teams';

export interface Option { readonly key: string; readonly at: number; readonly text: string }

export interface Question {
  readonly id: string;
  readonly stance: StanceId;
  readonly groups: readonly RoleGroup[];
  readonly side: QuestionSide;
  /** 'hirer' asks the candidate; 'candidate' is a question a candidate asks the people hiring him (F-interview-0009). */
  readonly asker: 'hirer' | 'candidate';
  readonly text: string;
  readonly options: readonly Option[];
}

const ALL: readonly RoleGroup[] = ['head', 'coordinator', 'position', 'support', 'entry', 'strength', 'personnel'];
const COACHES: readonly RoleGroup[] = ['head', 'coordinator', 'position', 'support', 'entry'];
const SENIOR: readonly RoleGroup[] = ['head', 'coordinator', 'position'];

const o = (key: string, at: number, text: string): Option => ({ key, at, text });

export const QUESTIONS: readonly Question[] = [
  {
    id: 'q.discipline.arrest', stance: 'discipline', groups: ['head', 'coordinator', 'position', 'strength'], side: 'any', asker: 'hirer',
    text: 'A starter is arrested on a Thursday night before a big game. What happens Sunday?',
    options: [o('wait', -1, 'Let the process play out; he plays unless the facts are clear'), o('talk', -0.35, 'Sit down with him first, then decide on what he tells me'),
      o('sit_half', 0.35, 'He sits at least part of the game, whatever the facts'), o('sit', 1, 'He does not play. Same rule for the star and the last man')],
  },
  {
    id: 'q.discipline.late', stance: 'discipline', groups: ALL, side: 'any', asker: 'hirer',
    text: 'One of your players is late to a meeting for the second time. What do you do?',
    options: [o('ask', -1, 'Find out what is going on in his life first'), o('warn', -0.35, 'Private warning, the next one costs him'),
      o('fine', 0.35, 'The team rule applies: fine and a talk'), o('bench', 1, 'He loses reps this week. Everybody sees it')],
  },
  {
    id: 'q.relations.voice', stance: 'player_relations', groups: COACHES, side: 'any', asker: 'hirer',
    text: 'How much say should players have in how the team is run?',
    options: [o('none', -1, 'None. The staff sets the standard and they meet it'), o('little', -0.35, 'Leaders can bring things to me; I decide'),
      o('council', 0.35, 'A leadership council that changes things'), o('lot', 1, 'A lot. It is their team; my job is to serve them')],
  },
  {
    id: 'q.relations.young', stance: 'player_relations', groups: ['head', 'coordinator', 'position', 'strength'], side: 'any', asker: 'hirer',
    text: 'How will you reach today\'s young players?',
    options: [o('same', -1, 'The way coaching has always worked: demand it and hold them to it'), o('demand_explain', -0.35, 'Demand it, but explain why'),
      o('relate', 0.35, 'Build the relationship first, then push'), o('meet', 1, 'Meet them where they are: how they learn, what they care about')],
  },
  {
    id: 'q.personnel.final', stance: 'personnel_say', groups: ['head', 'coordinator', 'personnel'], side: 'any', asker: 'hirer',
    text: 'Who should have the final say on which players make the team?',
    options: [o('scouts', -1, 'The general manager and the scouts. Coaches coach who they get'), o('gm_input', -0.35, 'The general manager, with real coaching input'),
      o('coach_input', 0.35, 'The head coach, with the front office\'s input'), o('coach', 1, 'The coaches. We live with them every day')],
  },
  {
    id: 'q.analytics.fourth', stance: 'analytics', groups: ['head', 'coordinator', 'support'], side: 'any', asker: 'hirer',
    text: 'Fourth and two at midfield, tie game, third quarter. How do you make that call?',
    options: [o('feel', -1, 'Feel for the game and my defense: I usually punt'), o('situation', -0.35, 'Depends on how we are playing today'),
      o('chart_plus', 0.35, 'The chart is my starting point, I can overrule it'), o('chart', 1, 'The numbers say go, we go. I trust the model')],
  },
  {
    id: 'q.analytics.staff', stance: 'analytics', groups: ['head', 'coordinator', 'support', 'personnel'], side: 'any', asker: 'hirer',
    text: 'What role should the analytics staff have on game day?',
    options: [o('none', -1, 'None on game day. Study it in the offseason'), o('report', -0.35, 'A report before the game, then it is football'),
      o('headset', 0.35, 'Someone on the headset for fourth downs and the clock'), o('core', 1, 'In every decision, with a direct line to the play caller')],
  },
  {
    id: 'q.youth.rookie', stance: 'youth', groups: ['head', 'coordinator', 'position'], side: 'any', asker: 'hirer',
    text: 'A rookie is close to a ten-year veteran in camp. Who starts?',
    options: [o('vet', -1, 'The veteran. He has earned it and he knows the job'), o('vet_lean', -0.35, 'The veteran, and the rookie plays in packages'),
      o('rookie_lean', 0.35, 'The rookie, if it is close; he will be better by November'), o('rookie', 1, 'The rookie. Play the young players and live with it')],
  },
  {
    id: 'q.flex.personnel', stance: 'flexibility', groups: ['head', 'coordinator', 'position'], side: 'any', asker: 'hirer',
    text: 'Your best players do not fit what you like to run. What gives?',
    options: [o('system', -1, 'We do what we do. We find players who fit it'), o('system_lean', -0.35, 'The system stays; we add a few things for them'),
      o('players_lean', 0.35, 'We change a lot of it around them'), o('players', 1, 'The players. Any system is only as good as who runs it')],
  },
  {
    id: 'q.practice.pads', stance: 'practice_contact', groups: ['head', 'coordinator', 'position', 'strength'], side: 'any', asker: 'hirer',
    text: 'How physical is your practice week in season?',
    options: [o('light', -1, 'As little contact as we can. Save it for Sunday'), o('mostly_light', -0.35, 'Mostly light, one day of real work'),
      o('real', 0.35, 'Real work every week, within the rules'), o('pads', 1, 'Pads as often as allowed. That is how you get tough')],
  },
  {
    id: 'q.practice.conditioning', stance: 'practice_contact', groups: ['strength', 'head'], side: 'any', asker: 'hirer',
    text: 'What is the first thing you change in the conditioning plan?',
    options: [o('recover', -1, 'More recovery: sleep, load tracking, fewer hard days'), o('measure', -0.35, 'Measure first and keep most of it'),
      o('harder', 0.35, 'More work in the heat of camp'), o('tough', 1, 'Make it harder. The fourth quarter is won in the offseason')],
  },
  {
    id: 'q.aggression.defense', stance: 'aggression', groups: ['head', 'coordinator', 'position'], side: 'defense', asker: 'hirer',
    text: 'Third and eight. What do you want to call?',
    options: [o('drop', -1, 'Rush four, drop seven, tackle short of the sticks'), o('four', -0.35, 'Four with a disguise, keep the shell'),
      o('sim', 0.35, 'Simulated pressure, bring one from somewhere new'), o('blitz', 1, 'Bring more than they can block')],
  },
  {
    id: 'q.aggression.offense', stance: 'aggression', groups: ['head', 'coordinator', 'position'], side: 'offense', asker: 'hirer',
    text: 'First play after a takeaway, ball at midfield. What do you call?',
    options: [o('run', -1, 'Something safe. We just got the ball, keep it'), o('rhythm', -0.35, 'A rhythm throw to get going'),
      o('shot_maybe', 0.35, 'A shot if the look is right'), o('shot', 1, 'Shot play. Hit them while they are down')],
  },
  {
    id: 'q.aggression.kicking', stance: 'aggression', groups: ['head', 'coordinator', 'position'], side: 'special_teams', asker: 'hirer',
    text: 'How often should we try a fake or a surprise kick?',
    options: [o('never', -1, 'Almost never. Win field position'), o('rare', -0.35, 'Once a year, if the look is there'),
      o('ready', 0.35, 'Always have one ready and use it'), o('often', 1, 'Often. Special teams should take games')],
  },
  {
    id: 'q.runpass.identity', stance: 'run_pass', groups: ['head', 'coordinator', 'position'], side: 'offense', asker: 'hirer',
    text: 'What is the identity of your offense?',
    options: [o('run', -1, 'We run the ball and wear you down'), o('balanced_run', -0.35, 'Balanced, built on the run game'),
      o('balanced_pass', 0.35, 'Balanced, built on the passing game'), o('pass', 1, 'We throw it to win')],
  },
  {
    id: 'q.delegation.staff', stance: 'delegation', groups: ['head', 'coordinator'], side: 'any', asker: 'hirer',
    text: 'How involved are you with the units you do not coach yourself?',
    options: [o('every', -1, 'In every meeting. It is my name on it'), o('check', -0.35, 'I sign off on the plan every week'),
      o('trust_check', 0.35, 'I trust them and check in on the big things'), o('trust', 1, 'I hire good people and get out of their way')],
  },
  {
    id: 'q.dissent.disagree', stance: 'dissent', groups: ['coordinator', 'position', 'support', 'entry', 'strength', 'personnel'], side: 'any', asker: 'hirer',
    text: 'You think the head coach is wrong about a game-plan decision. What do you do?',
    options: [o('back', -1, 'Do it his way and do it well. That is the job'), o('private', -0.35, 'Tell him once in private, then back it 100 percent'),
      o('meeting', 0.35, 'Make my case in the staff meeting'), o('push', 1, 'Push hard until he hears me. He hired me to say it')],
  },
  {
    id: 'q.dissent.loyalty', stance: 'dissent', groups: ['position', 'support', 'entry', 'strength'], side: 'any', asker: 'hirer',
    text: 'What does loyalty to a head coach mean to you?',
    options: [o('back', -1, 'Doing what he asks without complaint'), o('support', -0.35, 'Supporting him in public whatever I think'),
      o('truth', 0.35, 'Telling him the truth even when he does not want it'), o('team', 1, 'Loyalty is to the players first, then the staff')],
  },
  {
    id: 'q.media.loss', stance: 'media', groups: ['head', 'coordinator'], side: 'any', asker: 'hirer',
    text: 'After a bad loss, what do you tell the press?',
    options: [o('nothing', -1, 'As little as possible. It stays in the building'), o('own', -0.35, 'I own it, no names'),
      o('honest', 0.35, 'The honest football reasons, no names'), o('open', 1, 'Exactly what went wrong. Fans deserve the truth')],
  },
  {
    id: 'q.academics.class', stance: 'academics', groups: COACHES, side: 'any', asker: 'hirer',
    text: 'A starter is failing a class the week of a rivalry game. What happens?',
    options: [o('play', -1, 'He plays, and we get him a tutor'), o('plan', -0.35, 'He plays if he follows a study plan this week'),
      o('earn', 0.35, 'He has to show progress first'), o('sit', 1, 'He sits until the grade is fixed')],
  },
  // Questions a candidate asks the people hiring him (F-interview-0009). Their answers tell him how he would fit.
  {
    id: 'c.delegation.room', stance: 'delegation', groups: ['coordinator', 'position', 'support', 'entry', 'strength'], side: 'any', asker: 'candidate',
    text: 'How much will I run my own room?',
    options: [o('mine', -1, 'I run every room. You carry it out'), o('plan', -0.35, 'You coach it; I approve the plan'),
      o('yours_check', 0.35, 'It is your room; I check in'), o('yours', 1, 'It is your room. Coach it your way')],
  },
  {
    id: 'c.dissent.heard', stance: 'dissent', groups: ['coordinator', 'position', 'support', 'entry', 'strength', 'personnel'], side: 'any', asker: 'candidate',
    text: 'What do you expect of an assistant who disagrees with you?',
    options: [o('back', -1, 'Keep it to yourself and do it my way'), o('private', -0.35, 'Tell me privately, once'),
      o('meeting', 0.35, 'Say it in the meeting. I want to hear it'), o('push', 1, 'Fight for it. I hire people to challenge me')],
  },
  {
    id: 'c.relations.culture', stance: 'player_relations', groups: SENIOR, side: 'any', asker: 'candidate',
    text: 'What kind of locker room do you want?',
    options: [o('standard', -1, 'Players meet our standard, no discussion'), o('earned', -0.35, 'Earned trust: they get a say once they show it'),
      o('council', 0.35, 'The leaders help run it'), o('players', 1, 'A player-led room')],
  },
  {
    id: 'c.practice.week', stance: 'practice_contact', groups: ['coordinator', 'position', 'strength'], side: 'any', asker: 'candidate',
    text: 'How do you practice in season?',
    options: [o('light', -1, 'Light. Bodies first'), o('mostly_light', -0.35, 'Mostly light, one real day'),
      o('real', 0.35, 'Real work each week'), o('pads', 1, 'Physical, pads often')],
  },
  {
    id: 'c.personnel.say', stance: 'personnel_say', groups: ['head'], side: 'any', asker: 'candidate',
    text: 'Who picks the roster here?',
    options: [o('gm', -1, 'The general manager. The coach coaches'), o('gm_input', -0.35, 'The general manager, with your input'),
      o('coach_input', 0.35, 'You, with our input'), o('coach', 1, 'You do')],
  },
  {
    id: 'c.analytics.use', stance: 'analytics', groups: ['head', 'coordinator', 'support'], side: 'any', asker: 'candidate',
    text: 'How much do you lean on analytics?',
    options: [o('little', -1, 'Very little'), o('some', -0.35, 'Some, as a check'), o('lot', 0.35, 'A lot'), o('all', 1, 'Every decision runs through it')],
  },
];

for (const q of QUESTIONS) {
  if (!STANCES.some((s) => s.id === q.stance)) throw new Error(`interviews: question ${q.id} has unknown stance ${q.stance}`);
}

export function question(id: string): Question {
  const q = QUESTIONS.find((x) => x.id === id);
  if (!q) throw new Error(`interviews: unknown question ${id}`);
  return q;
}

/** Role group of a seat: from its position id and rung (E2.1.1 rungs). */
export function roleGroupOf(positionId: string, rung: number): RoleGroup {
  if (positionId === 'pos:head_coach') return 'head';
  if (positionId.startsWith('pos:strength')) return 'strength';
  if (positionId.startsWith('pos:general_manager') || positionId === 'pos:scouting_assistant' || positionId.startsWith('pos:recruiting')) return 'personnel';
  if (rung >= 6) return 'coordinator';
  if (rung >= 4) return 'position';
  if (rung === 3) return 'support';
  return 'entry';
}
