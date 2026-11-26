// Sources for the deferred items (option, trap, wham, pin and pull, bunch, empty, Cover 3 Sky, Cloud and match, goal
// line and prevent). One author or staff is one independence group (A5.1.2). "deferred" pages were read 2026-11-26 for
// this follow-up and are summarised in research/scheme-sources/deferred-plays-and-packages.md under the letters shown;
// "research" pages were read the same day by the scheme-sources thread. Wikipedia, forums and SEO copy are never listed.
import type { Source } from '../starter/index.ts';

const DF = (l: string): string => `read 2026-11-26 (research/scheme-sources/deferred-plays-and-packages.md, ${l})`;
const RN = (l: string): string => `read 2026-11-26 by the scheme-sources research thread (research/scheme-sources/run-schemes-and-fronts.md, ${l})`;
const SF = (l: string): string => `read 2026-11-26 by the scheme-sources research thread (research/scheme-sources/systems-and-families.md, ${l})`;
const s = (id: string, group: string, citation: string, url: string, how: Source['how'] = 'primary'): Source => ({ id, group, citation, url, how });
const TD = 'https://throwdeeppublishing.com/blogs/football-glossary/';

export const MORE_SOURCES: readonly Source[] = [
  // ---- Trap, wham, pin and pull ----
  s('kou-trap', 'kou', `Coach Kou, "NFL Run Schemes: Trap variations vs 4-2 nickel front," 2023-04-07 (${DF('DA')})`, 'https://coachkoufootball.substack.com/p/nfl-run-schemes-trap-variations-vs'),
  s('streelman-trap', 'streelman', `Erick Streelman, "Trap," Win With The Pass, 2015-10-25 (${DF('DB')})`, 'https://winwiththepass.com/trap/'),
  s('yfo-trap', 'yfo', `Youth Football Online (no byline), "Why every coach should install the trap play," 2025-03-07 (${DF('DC')})`, 'https://youthfootballonline.com/why-every-coach-should-install-the-trap-play', 'secondary'),
  s('grabowski-pull', 'grabowski', `Keith Grabowski, "Building an Offensive Line: Teaching the square pull," USA Football, 2016-05-16 (${DF('DD')})`, 'https://blogs.usafootball.com/blog/1630/building-an-offensive-line-teaching-the-square-pull'),
  s('davis-pinpull', 'davis', `Sanders Davis (Rice offensive line coach) with Mike Kuchar, pin and pull, X&O Labs, undated (${RN('T')})`, 'https://www.xandolabs.com/?p=135191'),
  s('forbes-wham-pinpull', 'forbes', `AJ Forbes, Throw Deep Publishing glossary, "Wham" (2023-06-21), "Pin and pull" (2023-06-24) and "Midline" (2023-07-02) (${RN('X')})`, TD),
  // ---- Option ----
  s('cella-triple', 'cella', `Lou Cella, Triple Option Football Academy, "Paul Johnson's explanation of the triple option in his playbook, part one," 2017-02-12, and midline pages (${DF('OA')}; ${RN('AC')})`, 'https://tripleoptionfootball.com/2017/02/12/paul-johnsons-explanation-of-the-triple-option-in-his-playbook-part-one'),
  s('coachj-triple', 'coachj', `Coach J, "The Many Faces of the Triple Option," Queer Football Breakdowns, 2020-11-09 (${DF('OB')}; ${RN('AB')})`, 'https://queerfootballbreakdowns.substack.com/p/the-many-faces-of-the-triple-option'),
  s('donovan-veer', 'donovan', `Terry Donovan, "Learn how Kennesaw State runs Inside Veer," USA Football, 2019-04-05 (${DF('OC')}; ${RN('AD')})`, 'https://blogs.usafootball.com/blog/7159/learn-how-kennesaw-state-runs-inside-veer'),
  // ---- Bunch and empty ----
  s('campbell-formations', 'campbell', `Michael Campbell, "The Complete Guide to Offensive Football Formations," Throw Deep Publishing, 2022-08-10 (${DF('BA')})`, `${TD}the-complete-guide-to-offensive-football-formations`),
  s('heck-bunch', 'heck', `Steve Heck (Kutztown WR coach), "Add some bunch to your playbook," Gridiron Strategies Vol. 8 No. 5, undated (${DF('BB')})`, 'https://gridironstrategies.com/article/add-some-bunch-to-your-playbook'),
  s('kuchar-bunch-rub', 'kuchar', `Mike Kuchar, "Variations of the 'Rub'," X&O Labs, undated, partial text (${DF('BC')})`, 'https://www.xandolabs.com/?p=5654'),
  s('yfo-trail', 'yfo', `Youth Football Online (no byline), "Trail passing concept out of the bunch formation," undated (${DF('BD')})`, 'https://youthfootballonline.com/trail-passing-concept-out-of-the-bunch-formation/', 'secondary'),
  s('cfbtrack-empty', 'cfbtrack', `CFBTrack (no byline), "Empty / five wide formation," undated (${DF('BE')})`, 'https://cfbtrack.com/football-formations/offense/empty-five-wide-formation', 'secondary'),
  s('fourverts-empty', 'fourverts', `Fourverts Football (no byline), "What is an empty set in football," undated (${DF('BF')})`, 'https://fourvertsfootball.com/what-is-an-empty-set-in-football/', 'secondary'),
  s('coiner-empty', 'coiner', `Charlie Coiner, "Empty pass protection is chess not checkers," FirstDown PlayBook, 2024-08-20 (${DF('BG')})`, 'https://firstdown.playbooktech.com/coaches-community/empty-pass-protection-is-chess-not-checkers'),
  // ---- Cover 3 rotations and match ----
  s('fantasypoints-cover3', 'fantasypoints', `FantasyPoints (no byline), "Fantasy Shells: Cover 3," 2021 (${DF('CB')})`, 'https://fantasypoints.com/nfl/articles/dfs/2021/fantasy-shells-cover-3', 'secondary'),
  s('xsos-cloudsky', 'xsos', `Xs Os Staff, "Cloud vs Sky Coverage," X's O's Football, 2012-05-08, a game-strategy site (${DF('CC')})`, 'https://www.xsosfootball.com/?p=3158', 'secondary'),
  s('steelersdepot-ripliz', 'steelersdepot', `Steelers Depot (no byline), "Film room: Pittsburgh's Rip/Liz match," 2016-07 (${DF('CD')}; ${SF('P')})`, 'https://steelersdepot.com/2016/07/film-room-pittsburghs-ripliz-match', 'secondary'),
  s('elevenwarriors-match', 'elevenwarriors', `Eleven Warriors (no byline), "Film study: Nick Saban's pattern-matching pass defense," 2014-12 (${DF('CE')}; ${SF('N')})`, 'https://elevenwarriors.com/ohio-state-football/2014/12/46950/film-study-nick-sabans-pattern-matching-pass-defense', 'secondary'),
  s('cogan-ripliz', 'cogan', `Kyle Cogan, "High school coordinator explains the details of Rip/Liz coverage," USA Football (${SF('O')})`, 'https://blogs.usafootball.com/blog/7272/high-school-coordinator-explains-the-details-of-rip-liz-coverage'),
  // ---- Goal line, short yardage, prevent ----
  s('yfo-prevent', 'yfo', `Youth Football Online (no byline), "Prevent Defense: Deterring Big Plays," undated (${DF('GA')})`, 'https://youthfootballonline.com/prevent-defense-deterring-big-plays/', 'secondary'),
  s('hernandez-goalline', 'hernandez', `Rey Hernandez, "Zone Defense on the Goal Line," Coaches Insider (American Football Monthly), 2015-03-12 (${DF('GB')})`, 'https://coachesinsider.com/football/zone-defense-on-the-goal-line-article/'),
  s('schrader-goalline', 'schrader', `Hank Schrader (former DC, Bellevue HS), "Stubborn goal line defense keeps the end zone door slammed shut," Gridiron Strategies Vol. 6 No. 3 (${DF('GC')})`, 'https://gridironstrategies.com/article/stubborn-goal-line-defense-keeps-the-end-zone-door-slammed-shut'),
  s('fdpb-goalline', 'fdpb', `FirstDown PlayBook (no byline), "Backs on the wall: what's your call," 2021-03-05, teaser only (${DF('GD')})`, 'https://firstdown.playbooktech.com/coaches-community/backs-on-the-wall-whats-your-call', 'secondary'),
  s('coiner-goalline', 'coiner', `Charlie Coiner, "Preparing for goal line offense and defense," FirstDown PlayBook, 2024-08-28 (${DF('GE')})`, 'https://firstdown.playbooktech.com/coaches-community/preparing-for-goal-line-offense-defense'),
  s('mitchell-gorilla', 'mitchell', `William Mitchell (Lewisville HS, SC), goal line "GORILLA" unit, X&O Labs, undated, cut before the alignments (${DF('GF')})`, 'https://www.xandolabs.com/?p=6634'),
];
