// Commands of the game-day seats below head coach (G-79; S5, O7.4). A seat panel sends one of these; the world
// service stamps it with the game clock and applies it with the career seats function named beside each, then
// writes it to the command log (P5). Plain data only, so a save replays them (Q1.3.1). A seat that lacks the
// right for a command is refused with a reason (S5.1.1 decision rights); nothing here grades anything.

export type SeatCommand =
  | { readonly type: 'seat.report_look'; readonly playId: number; readonly phase: 'pre' | 'post'; readonly look: string } // gradeBooth
  | { readonly type: 'seat.relay'; readonly playId: number; readonly personnel: string } // gradeRelay
  | { readonly type: 'seat.chart_row'; readonly playId: number; readonly row: Readonly<Record<string, string | null>> } // chartAccuracy
  | { readonly type: 'seat.flag'; readonly key: string } // gradeFlag
  | { readonly type: 'seat.advise'; readonly momentId: number; readonly choice: string; readonly reason: string } // resolveAdvice
  | { readonly type: 'seat.warn'; readonly text: string } // a between-series warning on the channel (S5.3.3)
  | { readonly type: 'seat.substitute'; readonly sendIn: readonly number[]; readonly takeOut: readonly number[] } // resolveSub
  | { readonly type: 'seat.signal'; readonly signal: string } // S3.2.2 signal relay
  | { readonly type: 'seat.correct'; readonly optionId: string; readonly way: 'words' | 'picture' | 'walkthrough' } // applyCorrections
  | { readonly type: 'seat.report_line'; readonly claim: string } // gradeReport
  | { readonly type: 'seat.ask_ahead'; readonly series: number; readonly question: string } // planInterventions answeredAhead
  | { readonly type: 'seat.suggest_call'; readonly callId: string } // caller assistant (S5.4.1)
  | { readonly type: 'seat.channel'; readonly channel: 'offense' | 'defense' | 'special_teams' | 'head_coach' | 'analyst' } // selectChannel
  | { readonly type: 'seat.standing_rules'; readonly on: boolean }; // O7.6.3: leave the seat to standing rules (marked simulated)

/** The S5.1.1 right a command needs (career seats `ROLES[...].rights`), or null when every seat may send it. */
const NEEDS: Readonly<Record<SeatCommand['type'], string | null>> = {
  'seat.report_look': 'report',
  'seat.relay': null,
  'seat.chart_row': 'chart',
  'seat.flag': 'flag',
  'seat.advise': 'advise',
  'seat.warn': 'advise',
  'seat.substitute': null,
  'seat.signal': 'signal',
  'seat.correct': 'correct',
  'seat.report_line': null,
  'seat.ask_ahead': 'call',
  'seat.suggest_call': 'suggest_call',
  'seat.channel': null,
  'seat.standing_rules': null,
};

/** Who may substitute: the bench coach within his group, and the assistants who send players. */
const SUBSTITUTE_RIGHTS = ['substitute_group', 'send_players'];
/** Who may relay personnel: booth seats and charters. */
const RELAY_RIGHTS = ['report', 'chart'];

export type SeatRefusal = { readonly ok: false; readonly reason: 'no_right' | 'not_listenable' | 'unknown_command' } | { readonly ok: true };

export function isSeatCommand(v: unknown): v is SeatCommand {
  return typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string' && (v as { type: string }).type in NEEDS;
}

/** Refuse a command the seat has no right to send (S5.1.1), or a channel it cannot hear (O7.4.2). */
export function checkSeatCommand(c: SeatCommand, rights: readonly string[], listenable: readonly string[]): SeatRefusal {
  if (!isSeatCommand(c)) return { ok: false, reason: 'unknown_command' };
  if (c.type === 'seat.channel') return listenable.includes(c.channel) ? { ok: true } : { ok: false, reason: 'not_listenable' };
  if (c.type === 'seat.substitute') return rights.some((r) => SUBSTITUTE_RIGHTS.includes(r)) ? { ok: true } : { ok: false, reason: 'no_right' };
  if (c.type === 'seat.relay') return rights.some((r) => RELAY_RIGHTS.includes(r)) ? { ok: true } : { ok: false, reason: 'no_right' };
  const need = NEEDS[c.type];
  return need === null || rights.includes(need) ? { ok: true } : { ok: false, reason: 'no_right' };
}
