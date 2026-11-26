// Pass protections (F5): the schemes a pass play can call, as data (P1.1.2). A protection names how the line
// blocks (man, half slide, full slide), who is kept in with it and what the kept-in back or tight end does. The
// engine binds it against the front the identifier believes (J5.4.2), so the same protection is right against one
// pressure and wrong against another.
//
// What a play calls: `protectionFor` reads it from the play's own kind and from who the play keeps in to block
// (F5.1.2: every blocker kept in is a receiver not out). A play that moves the launch point (boot, sprint out), a
// screen and a draw call none here: their protections (F5.7) are not built, and their blockers take the nearest
// rusher as before.
//
// Sources are in PROTECTION_SOURCES below; each basis line states what was confirmed and on which pages.
import type { Basis, PlayDef, Source } from '../starter/index.ts';

export type ProtectionType = 'man' | 'half_slide' | 'full_slide';
export type SlideRule = 'left' | 'right' | 'threat' | 'away_from_back';
/** `scan`: reads the second level inside to outside (F5.5.1). `edge`: the end man on his side (F5.4.1, F5.5.2 "stay"). */
export type KeptInJob = 'scan' | 'edge';

export interface ProtectionDef {
  readonly id: string;
  readonly name: string;
  /** The word a call sheet prints for it. */
  readonly word: string;
  readonly type: ProtectionType;
  /** F5.1.1 `count`: blockers in the protection. */
  readonly count: 5 | 6 | 7;
  readonly slide: SlideRule | null;
  /** The job of a back kept in, and of a tight end kept in. Null: that man is not part of this protection. */
  readonly back: KeptInJob | null;
  readonly tightEnd: KeptInJob | null;
  /** F5.2.2 and F5.6: who the quarterback has when more come than the protection holds. */
  readonly hot: string;
  readonly strength: string;
  readonly weakness: string;
  readonly basis: readonly Basis[];
}

/** A protection bound to a play's roles: what the content port hands the engine (roles become team slots there). */
export interface ProtectionCallDef {
  readonly protection: ProtectionDef;
  readonly lineRoles: readonly string[];
  readonly keptIn: readonly { readonly role: string; readonly job: KeptInJob }[];
}

const READ = 'read 2026-11-26 (research/tuning/pass-protection.md)';
const src = (id: string, group: string, citation: string, url: string, how: Source['how'] = 'primary'): Source => ({ id, group, citation: `${citation} (${READ})`, url, how });
// One author is one independence group (A5.1.2). Wikipedia, forums and SEO copy are not listed.
export const PROTECTION_SOURCES: readonly Source[] = [
  src('coachj-half-slide', 'coachj', 'Coach J, "Half-Slide Protection: Review and how to Incorporate it in Any Offense," Queer Football Breakdowns, 2020-12-06', 'https://queerfootballbreakdowns.substack.com/p/half-slide-protection-review-and'),
  src('wilmesherr-slide', 'wilmesherr', 'Ken Wilmesherr (Grossmont College offensive line coach), "Slide Protection Schemes and Technique: The 3-Step Passing Game," Gridiron Strategies Vol. 8 No. 1, undated', 'https://gridironstrategies.com/article/slide-protection-schemes-and-technique-the-3-step-passing-game'),
  src('haddad-protections', 'haddad', 'Danny Haddad, "Pass Protection Install Guide For Offensive Coordinators," vIQtory Sports, 2024-10-10', 'https://www.viqtorysports.com/pass-protections/'),
  src('kelly-back-protection', 'kelly', 'Danny Kelly, "The Art of Running Back Pass Protection," The Ringer, 2018-08-16', 'https://www.theringer.com/2018/8/16/17696798/running-back-pass-protection', 'secondary'),
  src('byrne-jet', 'byrne', 'Alex Byrne, "Jet protection," 2020-12-27', 'https://alexbyrne.substack.com/p/jet-protection', 'secondary'),
  src('lee-five-man', 'lee', 'Diante Lee, "How NFL defenses attacked five-man protections in 2021," PFF, 2022-02-25', 'https://www.pff.com/news/nfl-how-nfl-defenses-attacked-five-man-protections-2021', 'secondary'),
  src('slattery-slide', 'slattery', 'Mike Slattery (Huntley High School offensive coordinator), "Defending Pressure with Slide Pass Pro," X&O Labs, 2016-04-11', 'https://www.xandolabs.com/?p=15330'),
  src('ring-protection-101', 'ring', 'Mark Ring, "Pass Protection Scheme 101, Part 2," 2014-01-15', 'https://markring1961.blogspot.com/2014/01/pass-protection-scheme-101-part-2.html'),
];

const b = (claim: string, status: Basis['status'], sources: string[]): Basis => ({ claim, status, sources });
const B = {
  man: b('Big on big: the linemen block the down linemen and a back blocks a linebacker', 'Verified', ['coachj-half-slide', 'wilmesherr-slide', 'byrne-jet', 'slattery-slide']),
  mikeToLine: b('In six-man big on big the uncovered lineman has the declared Mike and the back has the rushers outside the four down linemen and the Mike. Systems differ: Coach J gives the Mike to the back', '1 of 3', ['byrne-jet']),
  mike: b('The quarterback or the centre declares the protection before the snap, and a wrong call or a disguised pressure leaves a rusher free', '2 of 3', ['kelly-back-protection', 'lee-five-man']),
  halfSlide: b('Half slide: one side of the line blocks man and the other slides by gap, starting with the first uncovered lineman; the back works with the man side', 'Verified', ['coachj-half-slide', 'byrne-jet', 'slattery-slide', 'ring-protection-101']),
  slideAwayFromBack: b('The back normally fills on the side away from the slide', '1 of 3', ['ring-protection-101']),
  backScan: b('The back reads his linebackers inside to outside; if two come he blocks the inside one and the outside one is hot', 'Verified', ['coachj-half-slide', 'wilmesherr-slide', 'byrne-jet']),
  checkRelease: b('If none of the back\'s reads comes he releases into a route', 'Verified', ['coachj-half-slide', 'haddad-protections', 'byrne-jet']),
  fullSlide: b('Full slide: every lineman blocks the gap to the call side and the back or tight end takes the edge away from the slide', 'Verified', ['haddad-protections', 'byrne-jet', 'ring-protection-101']),
  slideVsTwist: b('A slide holds up against twists and inside pressure because each lineman has a gap whoever comes through it; man blocking avoids a back alone on a defensive end', '1 of 3', ['byrne-jet']),
  fiveMan: b('With five in protection the quarterback is responsible for the extra rusher by throwing hot', 'Verified', ['coachj-half-slide', 'byrne-jet', 'lee-five-man']),
  max: b('Keeping a seventh blocker in protects against seven and leaves a three-man route', 'Verified', ['coachj-half-slide', 'wilmesherr-slide', 'ring-protection-101']),
} as const;

export const PROTECTIONS: readonly ProtectionDef[] = [
  {
    id: 'prot.man_6', name: 'Six-man big on big', word: 'Base', type: 'man', count: 6, slide: null, back: 'scan', tightEnd: null,
    hot: 'The seventh rusher; with two off the back\'s side he takes the inside one and the outside one is hot',
    strength: 'Linemen on linemen: tackles on the edge rushers, no back on a defensive end',
    weakness: 'Twists must be passed off by talking, and an overload away from the back',
    basis: [B.man, B.mikeToLine, B.backScan, B.checkRelease, B.mike],
  },
  {
    id: 'prot.half_slide_6', name: 'Six-man half slide', word: 'Half', type: 'half_slide', count: 6, slide: 'away_from_back', back: 'scan', tightEnd: null,
    hot: 'One more than the slide side has linemen, off that edge; the second rusher off the back\'s side',
    strength: 'Gap blocking where the line slides takes twists and inside pressure; man blocking on the other side keeps the matchups',
    weakness: 'The edge of the slide, and the back alone on his side',
    basis: [B.halfSlide, B.slideAwayFromBack, B.backScan, B.checkRelease, B.mike],
  },
  {
    id: 'prot.full_slide_6', name: 'Six-man full slide', word: 'Slide', type: 'full_slide', count: 6, slide: 'away_from_back', back: 'edge', tightEnd: 'edge',
    hot: 'The second rusher off the edge the line slid away from',
    strength: 'Simple; every lineman has a gap, so twists and inside pressure are absorbed',
    weakness: 'A back on an edge rusher on the side away from the slide',
    basis: [B.fullSlide, B.slideAwayFromBack, B.slideVsTwist],
  },
  {
    id: 'prot.five_man_slide', name: 'Five-man slide', word: 'Five', type: 'half_slide', count: 5, slide: 'threat', back: null, tightEnd: null,
    hot: 'The sixth rusher on every snap: the quarterback\'s, by a hot throw or the ball out on rhythm',
    strength: 'Five receivers out',
    weakness: 'Any sixth rusher is free; a pressure that shows six and brings five from somewhere else',
    basis: [B.fiveMan, B.halfSlide, B.mike],
  },
  {
    id: 'prot.max_7', name: 'Seven-man protection', word: 'Max', type: 'man', count: 7, slide: null, back: 'scan', tightEnd: 'edge',
    hot: 'The eighth rusher',
    strength: 'Blocks seven; time for a deep route',
    weakness: 'Three receivers out',
    basis: [B.max, B.man, B.backScan],
  },
];

export const PROTECTION_BY_ID: ReadonlyMap<string, ProtectionDef> = new Map(PROTECTIONS.map((p) => [p.id, p]));

const LINE = ['LT', 'LG', 'C', 'RG', 'RT'] as const;
/** Backfield roles in the shipped formations; any other kept-in blocker is a tight end or a wing on the edge. */
const BACKS: ReadonlySet<string> = new Set(['R', 'F', 'B']);
const PASS_SET = 'passSet';

/**
 * The protection a play calls, or null when it calls none the engine binds (see the file note).
 * Dropback: five-man slide with nobody kept in, half slide with one, seven-man with two. Quick game: full slide
 * (F5.4.1). Play action: big on big with the men it keeps in (the F5.7.1 play-action binding is not built).
 */
export function protectionFor(play: PlayDef): ProtectionCallDef | null {
  if (play.kind !== 'dropback_pass' && play.kind !== 'quick_pass' && play.kind !== 'play_action') return null;
  const byRole = new Map(play.slots.map((s) => [s.role, s]));
  if (!LINE.every((r) => byRole.get(r)?.behavior === PASS_SET)) return null;
  const kept = play.slots.filter((s) => s.behavior === PASS_SET && !(LINE as readonly string[]).includes(s.role));
  const backs = kept.filter((s) => BACKS.has(s.role)), ends = kept.filter((s) => !BACKS.has(s.role));
  let id: string;
  if (kept.length === 0) id = 'prot.five_man_slide';
  else if (play.kind === 'quick_pass') id = 'prot.full_slide_6';
  else if (kept.length >= 2) id = 'prot.max_7';
  else if (play.kind === 'play_action' || backs.length === 0) id = 'prot.man_6';
  else id = 'prot.half_slide_6';
  const protection = PROTECTION_BY_ID.get(id)!;
  const keptIn = [
    ...backs.map((s) => ({ role: s.role, job: protection.back ?? 'scan' })),
    ...ends.map((s) => ({ role: s.role, job: protection.tightEnd ?? 'edge' })),
  ];
  return { protection, lineRoles: LINE, keptIn };
}
