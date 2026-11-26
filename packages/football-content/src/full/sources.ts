// Sources added by the full content set (WP-25), on top of the starter list. One author or staff is one
// independence group (A5.1.2); Wikipedia, forums and SEO pages are never listed. Pages marked "research" were
// read 2026-11-26 by the scheme-sources research thread and are recorded in research/scheme-sources/<file>
// under the letter shown. Pages marked "wp25" were read 2026-11-26 for this work package. Nothing is cited from
// memory; where a page does not give a number the play or call says so (Assumption).
import { SOURCES as STARTER_SOURCES, type Source } from '../starter/index.ts';
import { MORE_SOURCES } from './sources-more.ts';

const RS = (file: string, letter: string): string => `read 2026-11-26 by the scheme-sources research thread (research/scheme-sources/${file}.md, ${letter})`;
const PC = (l: string): string => RS('pass-concepts-and-reads', l);
const PA = (l: string): string => RS('play-action-screens-rpo', l);
const RN = (l: string): string => RS('run-schemes-and-fronts', l);
const WP = 'read 2026-11-26 for WP-25';
const s = (id: string, group: string, citation: string, url: string, how: Source['how'] = 'secondary'): Source => ({ id, group, citation, url, how });

const TD = 'https://throwdeeppublishing.com/blogs/football-glossary/';

export const FULL_SOURCES: readonly Source[] = [
  // ---- Pass concepts (research/scheme-sources/pass-concepts-and-reads.md) ----
  s('campbell-smash', 'campbell', `Michael Campbell, "Smash," Throw Deep Publishing glossary, 2022-04-25 (${PC('A')})`, `${TD}smash-concept`),
  s('campbell-mesh', 'campbell', `Michael Campbell, "Mesh," Throw Deep Publishing glossary, 2022-04-27 (${PC('A')})`, `${TD}mesh-concept`),
  s('campbell-shallow', 'campbell', `Michael Campbell, "Shallow Cross," Throw Deep Publishing glossary, 2022-04-24 (${PC('A')})`, `${TD}shallow-cross-concept`),
  s('campbell-ycross', 'campbell', `Michael Campbell, "Y-Cross," Throw Deep Publishing glossary, 2022-04-21 (${PC('A')})`, `${TD}y-cross`),
  s('campbell-yankee', 'campbell', `Michael Campbell, "Yankee," Throw Deep Publishing glossary, 2022-05-13 (${PC('A')})`, `${TD}the-yankee-concept`),
  s('campbell-cover3', 'campbell', `Michael Campbell, "What is Cover 3 in Football?," Throw Deep Publishing, 2022-08-13 (${WP}): base rules, Cover 3 Buzz, flipped safeties`, `${TD}what-is-cover-3-in-football`, 'primary'),
  s('kuchar-snag', 'kuchar', `Mike Kuchar, X&O Labs, snag concept (undated) with a coach survey (${PC('C')})`, 'https://www.xandolabs.com/?p=12893', 'primary'),
  s('kuchar-fourverts', 'kuchar', `Mike Kuchar, X&O Labs, four verticals (undated) with a coach survey (${PC('C')})`, 'https://www.xandolabs.com/?p=6510', 'primary'),
  s('kuchar-tunnel', 'kuchar', `Mike Kuchar, X&O Labs, "2025 Screen Game R&D Case 1: North Texas G/T Tunnel Screen," 2025-05-13, partly member-only (${PA('J')})`, 'https://www.xandolabs.com/?p=151038', 'primary'),
  s('kuchar-glance', 'kuchar', `Mike Kuchar, X&O Labs, Fordham glance RPO (undated) (${PA('J')})`, 'https://www.xandolabs.com/?p=15242', 'primary'),
  s('weeklyspiral-smash', 'weeklyspiral', `Weekly Spiral (author not stated), "Smash concept," 2021-03-08 (${PC('J')})`, 'https://weeklyspiral.com/2021/03/08/smash-concept'),
  s('weeklyspiral-snag', 'weeklyspiral', `Weekly Spiral (author not stated), "Snag concept," 2021-05-03 (${PC('J')})`, 'https://weeklyspiral.com/2021/05/03/snag-concept'),
  s('weeklyspiral-dagger', 'weeklyspiral', `Weekly Spiral (author not stated), "Dagger concept," 2021-02-15 (${PC('J')})`, 'https://weeklyspiral.com/2021/02/15/dagger-concept'),
  s('weeklyspiral-mills', 'weeklyspiral', `Weekly Spiral (author not stated), "Mills concept," 2021-03-01 (${PC('J')})`, 'https://weeklyspiral.com/2021/03/01/mills-concept'),
  s('weeklyspiral-glance', 'weeklyspiral', `Weekly Spiral (author not stated), "Glance RPO," 2021-10-25 (${PA('E')})`, 'https://weeklyspiral.com/2021/10/25/glance-rpo'),
  s('weeklyspiral-buck', 'weeklyspiral', `Weekly Spiral (author not stated), "Buck sweep," 2021-06-14 (${RN('AV')})`, 'https://weeklyspiral.com/2021/06/14/buck-sweep'),
  s('stanford-shallow', 'sampath', `Kaushik Sampath, "Stanford Film Study: Drive concept" and "Y-cross," The Stanford Daily, 2022-11-23 and 2022-09-27 (${PC('F')})`, 'https://stanforddaily.com/2022/11/23/stanford-film-study-drive-concept/'),
  s('sampath-glance', 'sampath', `Kaushik Sampath, "Stanford Film Study: Glance Tunnel RPO," The Stanford Daily, 2022-09-18 (${PA('AK')})`, 'https://stanforddaily.com/2022/09/18/stanford-film-study-glance-tunnel-rpo/'),
  s('steelersdepot-sail', 'steelersdepot', `Steelers Depot (no byline), "Steelers All-22: Sail concept vs Cover 3," 2015, and "All-22 Steelers spot concept" (${PC('P')})`, 'https://steelersdepot.com/2015/06/steelers-all-22-sail-route-vs-cover-3'),
  s('bowen-curlflat', 'bowen', `Matt Bowen, National Football Post, "Expect to see the curl/flat route this weekend" and Bleacher Report "NFL 101: Introducing the Basic Route Combinations" (${PC('Q')})`, 'https://www.nationalfootballpost.com/expect-to-see-the-curlflat-route-this-weekend', 'primary'),
  s('dunn-slantflat', 'dunn', `Zach Dunn, USA Football, "Detailing Slant-Flat and how the Quarterback should read it," 2019-08-28 (${PC('R')})`, 'https://blogs.usafootball.com/blog/7512/detailing-slant-flat-and-how-the-quarterback-should-read-it'),
  s('dunn-chiefs-pa', 'dunn', `Zach Dunn, USA Football, "Examining a Play-Action concept from the Chiefs," 2019-10-03 (${PA('Q')})`, 'https://blogs.usafootball.com/blog/7599/examining-a-play-action-concept-from-the-chiefs'),
  s('kolste-mesh', 'kolste', `Taylor Kolste, USA Football, "How the Philadelphia Eagles have utilized the mesh concept," 2018-06-14 (${PC('G')})`, 'https://blogs.usafootball.com/blog/6295/how-the-philadelphia-eagles-have-utilized-the-mesh-concept'),
  s('kolste-yankee', 'kolste', `Taylor Kolste, USA Football, "How to create explosive passing plays with the Yankee concept," 2018-06-11 (${PC('G')})`, 'https://blogs.usafootball.com/blog/6266/how-to-create-explosive-passing-plays-with-the-yankee-concept'),
  s('fox-mesh', 'fox', `Jordan Fox, Black 41 Flash Reverse, "Learn a Holgorsen play: Mesh and Shallow Cross," 2025-08-15 (${PC('H')})`, 'https://black41flashreverse.substack.com/p/learn-a-holgorsen-play-mesh-and-shallow'),
  s('fox-ycross', 'fox', `Jordan Fox, Black 41 Flash Reverse, "Y-Cross," 2025-04-09, free part (${PC('H')})`, 'https://black41flashreverse.substack.com/p/learn-a-holgorsen-play-y-cross'),
  s('ita-yankee', 'scoutingacademy', `The Scouting Academy ITP Glossary, "Yankee concept," 2015-10-08 (${PC('I')})`, 'https://scoutingacademy.com/itp-glossary-yankee-concept/'),
  s('ita-sail', 'scoutingacademy', `The Scouting Academy ITP Glossary, "Sail concept," 2015-11-24 (${PC('I')})`, 'https://scoutingacademy.com/itp-glossary-sail-concept/'),
  s('ita-dagger', 'scoutingacademy', `The Scouting Academy ITP Glossary, "Dagger concept," 2015-09-25 (${PC('I')})`, 'https://scoutingacademy.com/itp-glossary-dagger-concept/'),
  s('ita-mills', 'scoutingacademy', `The Scouting Academy ITP Glossary, "Mills concept," 2015-10-15 (${PC('I')})`, 'https://scoutingacademy.com/itp-glossary-mills-concept/'),
  s('ita-wheel', 'scoutingacademy', `The Scouting Academy ITP Glossary, "Wheel route," 2015-11-25 (${PC('I')})`, 'https://scoutingacademy.com/itp-glossary-wheel-route/'),
  s('kou-sail', 'kou', `Coach Kou's Substack, "NFL pass concepts 4: sail/flood route," 2023-11-10, free part (${PC('O')})`, 'https://coachkoufootball.substack.com/p/nfl-pass-concepts-4-sailflood-route', 'primary'),
  s('kou-postwheel', 'kou', `Coach Kou's Substack, "Chiefs passing game: post-wheel 4x1," 2023-05-10 (${PC('O')})`, 'https://coachkoufootball.substack.com/p/chiefs-passing-game-post-wheel-4x1', 'primary'),
  s('kou-dagger', 'kou', `Coach Kou's Substack, "Dagger," 2023-07-11 (${PC('O')})`, 'https://coachkoufootball.substack.com/p/dagger', 'primary'),
  s('kou-manfree', 'kou', `Coach Kou, "Man free variations: playing man free lurk and hole from a 2 high safety structure," 2023-05-17 (${WP}): hole and lurk safeties, matching on crossers and number three`, 'https://coachkoufootball.substack.com/p/man-free-variations-playing-man-free', 'primary'),
  s('stein-spacing', 'stein', `Will Stein, Glazier Clinics, spacing concepts, 2024-11-27 (${PC('L')})`, 'https://www.glazierclinics.com/football-coach-resources/force-defenders-out-of-position-and-stretch-the-defense-with-these-spacing-concepts', 'primary'),
  s('glazier-smash', 'glazier-smash', `Glazier Clinics (author not named), "Basic Passing Concepts: Smash Concept," 2021-11-04 (${PC('M')})`, 'https://www.glazierclinics.com/football-coach-resources/basic-passing-concepts-smash-concept'),
  s('wilhite-smash', 'wilhite', `Emory Wilhite, Fundamental Football, "Two Ways to Run the Smash Concept," 2024-07-26 and "Learning to teach Shallow Cross," 2024-06-28 (${PC('N')})`, 'https://emorywilhite.substack.com/p/two-ways-to-run-the-smash-concept'),
  s('wilhite-rpo', 'wilhite', `Emory Wilhite, Fundamental Football, "Teaching Defensive Structures: RPOs," 2024-07-08 (${PA('M')})`, 'https://emorywilhite.substack.com/p/teaching-defensive-structures-rpos'),
  s('zitnik-spacing', 'zitnik', `Nate Zitnik, X&O Labs, spacing (triangle family), undated (${PC('S')})`, 'https://www.xandolabs.com/?p=22028', 'primary'),
  s('streelman-shallow', 'streelman', `Erick Streelman, Win With The Pass, shallow and dig concept, 2015-05-09 (${PC('AC')})`, 'https://winwiththepass.com/levels/', 'primary'),
  s('coyote-switch', 'coyote', `Space Coyote, Breakdown Sports, "Football Fundamentals: Switch Route Combinations," 2014-11-25 (${PC('Z')})`, 'https://breakdownsports.blogspot.com/2014/11/football-fundamentals-switch-route-concepts.html'),
  s('alexander-wheel', 'alexander', `Cody Alexander, Match Quarters, "Deep third technique vs 4-load wheel," 2025-12-04, summary and outline only (${PC('AB')})`, 'https://www.matchquarters.com/p/deep-third-technique-vs-4-load-wheel-hezekiah-masses-cal'),
  s('kirby-postwheel', 'kirby', `Alex Kirby, Throw Deep Publishing, Ferris State play-action concepts, 2022-03-08, used for post-wheel only (${PA('AN')})`, 'https://throwdeeppublishing.com/blogs/news/ferris-state-offense-play-action-pass-concepts'),
  s('hewitt-reads', 'hewitt', `Bill Hewitt, USA Football, "Basic Knowledge About Reads," 2019-05-29 (${PC('V')})`, 'https://blogs.usafootball.com/blog/7291/basic-knowledge-about-reads'),
  s('kuchar-rub', 'kuchar', `Mike Kuchar, X&O Labs, rub variations (undated) (${PC('C')})`, 'https://www.xandolabs.com/?p=5654', 'primary'),
  s('klatt-quickgame', 'klatt', `Joel Klatt, FOX Sports, "Understanding Football: Explaining quick-game passing concepts," updated 2025-01-29 (${PC('U')})`, 'https://www.foxsports.com/stories/college-football/understanding-football-joel-klatt-explaining-quick-game-passing-concepts', 'primary'),
  // ---- Play action, screens, RPO (research/scheme-sources/play-action-screens-rpo.md) ----
  s('peters-sprintsmash', 'peters', `Bobby Peters, USA Football, "How the New Orleans Saints use Sean Payton's sprint smash concept," 2018-06-13 (${PA('B')})`, 'https://blogs.usafootball.com/blog/6284/how-the-new-orleans-saints-use-sean-payton-s-sprint-smash-concept'),
  s('nguyen-pop', 'nguyen', `Ted Nguyen film analysis, USA Football pop pass page (no byline on the page), 2019 (${PA('D')})`, 'https://blogs.usafootball.com/blog/6230/here'),
  s('hargitt-pop', 'hargitt', `Rich Hargitt, Nike Coach of the Year manual 2019, Coaches Insider, 2020-01-08: pop pass as a pre-snap RPO read (${PA('O')})`, 'https://coachesinsider.com/football/game-planning-and-play-calling-age-of-rpos/', 'primary'),
  s('dudley-screens', 'dudley', `Brett Dudley (Antioch HS), screen coaching page, X&O Labs, undated (${PA('AB')})`, 'https://www.xandolabs.com/?p=15739', 'primary'),
  s('finley-lions-screens', 'finley', `Finley, SideLion Report, "The Lions Playbook Ep. 5: The Screen Game," 2016-10-27 (${PA('AE')})`, 'https://amp.foxsports.com/stories/nfl/the-lions-playbook-ep-5-the-screen-game'),
  s('chuck-dash', 'chucktherock', `"Chuck The Rock," "Move the Pocket with the Dash Pass Concept," Substack, 2025-01-20 (${PA('AM')})`, 'https://chucktherock.substack.com/p/dash-pass-concept'),
  s('solak-shanahan', 'solak', `Ben Solak, "Kyle Shanahan Is No Longer Running the Shanahan Offense," The Ringer, 2024-02-07 (${PA('U')})`, 'https://www.theringer.com/2024/02/07/nfl/super-bowl-preview-kyle-shanahan-offense-evolution-san-francisco-49ers'),
  s('coyote-throwback', 'coyote', `Space Coyote, Breakdown Sports, "Inside the Playbook: Sequencing to the Throw Back," 2022-02-07 (${PA('AF')})`, 'https://breakdownsports.blogspot.com/2022/02/inside-playbook-sequencing-to-throw-back.html'),
  // ---- Run game (research/scheme-sources/run-schemes-and-fronts.md) ----
  s('byrnes-zone', 'byrnes', `Shawn Byrnes, X&O Labs, "Offensive Line" (Scottsdale Christian Academy), wide zone rules (${RN('AW')})`, 'https://www.xandolabs.com/?p=18305', 'primary'),
  s('kou-widezone', 'kou', `Coach Kou, "A complete guide to wide zone," undated, partial; "To Spill or Not to Spill," 2025-06-08 (${RN('AF')})`, 'https://coachkoufootball.substack.com/p/a-complete-guide-to-wide-zone', 'primary'),
  s('kuchar-splitzone', 'kuchar', `Mike Kuchar, X&O Labs, split zone study (undated) and USA Football "Use these drills to apply force and cutback rules," 2015-04-04 (${RN('S')})`, 'https://www.xandolabs.com/?p=17004', 'primary'),
  s('ralph-splitflow', 'ralph', `Kyle Ralph (New Palestine HS), "Split Flow Zone Made Simple," Glazier Football, 2024-11-20, page summary (${RN('BC')})`, 'https://glazierclinics.com/football-coach-resources/transform-your-zone-run-game-split-flow-zone-made-simple', 'primary'),
  s('svec-splitzone', 'svec', `Jon Svec, Canadian Football Chalk Talk, "Defending Split Zone," 2022-01-12 (${RN('AE')})`, 'https://jonsvec.substack.com/p/defending-split-zone'),
  s('floden-duo', 'floden', `Connor Floden, "Duo," Alex Byrne's Substack, 2021-02-07 (${RN('Q')})`, 'https://alexbyrne.substack.com/p/duo', 'primary'),
  s('boyd-duo', 'boyd', `Ian Boyd, "Gap Schemes 301: duo," Inside Texas (On3), 2025-05-17 (${RN('BB')})`, 'https://www.on3.com/teams/texas-longhorns/news/gap-schemes-301-duo-run-delivers-double-teams-and-dominance', 'primary'),
  s('kuchar-westler-duo', 'kuchar-westler', `Mike Kuchar with CJ Westler (Pleasant HS, OH), duo, X&O Labs, undated (${RN('R')})`, 'https://www.xandolabs.com/?p=141365', 'primary'),
  s('kou-duo', 'kou', `Coach Kou, "NFL run game: the art of duo," 2023-10-04, preview only (${RN('AF')})`, 'https://coachkoufootball.substack.com/p/nfl-run-game-the-art-of-duo', 'primary'),
  s('rollins-rundesign', 'youngrollins', `Dayne Young and Brent Rollins, "Football 101: Run Game Design," undated, secondary summary (${RN('O')})`, 'https://uga.rivals.com/news/football-101-run-game-design'),
  s('coyote-wham-iso', 'coyote', `Space Coyote, Breakdown Sports, "Inside the Playbook: Wham! and The Return of the Trap," 2015-05-21 and "Football Fundamentals: Iso Primer," 2015-01-22 (${RN('Y')})`, 'https://breakdownsports.blogspot.com/2015/01/football-fundamentals-iso-run-play-primer.html', 'primary'),
  s('forbes-iso', 'forbes', `AJ Forbes, Throw Deep Publishing, iso and buck sweep pages, 2023 (${RN('X')})`, `${TD}`, 'primary'),
  s('glazier-gunsweep', 'glazier-gunsweep', `Glazier Football (author not named), "Executing the Gun Sweep Play," 2021-11-05 (${RN('AX')})`, 'https://www.glazierclinics.com/football-coach-resources/executing-the-gun-sweep-play', 'primary'),
  s('kuchar-iso', 'kuchar', `Mike Kuchar, X&O Labs, iso study, 2011-12-05 (${RN('S')})`, 'https://www.xandolabs.com/?p=5642', 'primary'),
  s('ellis-dart', 'ellis', `Dan Ellis, "Variations of the Dart Scheme," X&O Labs, 2013-05-08 (${RN('U')})`, 'https://www.xandolabs.com/?p=8200', 'primary'),
  s('streelman-dart', 'streelman', `Erick Streelman, "Dart," Win With The Pass, 2015-10-11 (${RN('V')})`, 'https://winwiththepass.com/dart/', 'primary'),
  s('steelersdepot-dart', 'steelersdepot', `Steelers Depot (no byline), "Football 101: Dart run scheme," 2015-11 (${RN('W')})`, 'https://steelersdepot.com/2015/11/football-101-dart-run-scheme', 'primary'),
  s('brown-counter', 'brown', `Chris B. Brown, "Football 101: Why Power Running Works," Grantland, 2015-09-10: counter section (${RN('P')})`, 'https://grantland.com/the-triangle/2015-nfl-college-football-power-running-counter-running/', 'primary'),
  // ---- Coverage and pressure (coverage pages read for WP-25) ----
  s('dudko-nickel', 'dudko', `James Dudko, "The Nickel Front: Breaking Down the Modern NFL's Go-To Defense," Bleacher Report, 2018-06-04 (${WP}): 4-2-5 swaps a linebacker for the nickel back; Giants 4-2-5 Cover 1 shell`, 'https://bleacherreport.com/articles/1680308-the-nickel-front-breaking-down-the-modern-nfls-go-to-defense'),
  s('haddad-nickel', 'haddad', `Chris Haddad, vIQtory Sports, "How To Install Nickel & Dime Defenses," published 2018-08-01, updated 2026-06-01 (${WP}): nickel is five defensive backs, dime six; 4-1-6 or 3-2-6`, 'https://www.viqtorysports.com/nickel-dime-quarter-defenses/', 'primary'),
  s('mascolo-nickel', 'mascolo', `Louis Mascolo, "Small Change: Nickel and Dime Defenses," Lou's Views Substack, 2023-12-14 (${WP}): nickel back usually replaces a linebacker; dime is four linemen and one linebacker or three and two`, 'https://louismascolo.substack.com/p/small-changenickel-and-dime-defenses'),
  s('alexander-palms', 'alexander', `Cody Alexander, Match Quarters, "What is Cover 2? Explaining Country, Palms and Tampa Cover 2," 2025-03-01, episode outline only (${WP}): lists the question of why Palms (2-Read) sits in the quarters family; gives no rules`, 'https://www.matchquarters.com/p/what-is-cover-2-explaining-country-palms-and-tampa-cover-2'),
  s('ruley-cover3', 'ruley', `Pat Ruley (Susquehanna DC) via Glazier Football, "3 Cover 3 Variations to Shut Down RPOs and WR Screens," 2024-05-23 (${WP}): names Cloud, Sky and Buzz and the concepts each is for; gives no assignments or depths`, 'https://www.glazierclinics.com/football-coach-resources/3-cover-3-variations-to-shut-down-rpos-and-wr-screens', 'primary'),
  s('bowen-zoneblitz', 'bowen', `Matt Bowen, "NFL 101: Breaking Down the Basics of the Zone Blitz," Bleacher Report, 2014-06-19 (${WP}): five rush, three deep, three under; the Under Smash example`, 'https://bleacherreport.com/articles/2102559-nfl-101-breaking-down-the-basics-of-the-zone-blitz', 'primary'),
  s('hoover-fire3', 'hoover', `Barry Hoover, USA Football, "Fire 3 Simulated Pressure," 2019-07-01 (${WP}): four-man pressure, strong safety rushes, edge defender drops, Cover 3 behind it`, 'https://blogs.usafootball.com/blog/7377/fire-3-simulated-pressure', 'primary'),
  s('hancock-firezone', 'hancock', `Aaron Hancock (Wyoming HS, OH), "3-3-5 Firezone Pressure Package," X&O Labs, 2020-01-03 (${WP}): base Cover 3 principles; no assignments on the page`, 'https://www.xandolabs.com/?p=8771', 'primary'),
  s('haddad-palms', 'haddad', `Chris Haddad, vIQtory Sports, "Palms Coverage Install Guide For Coaches," published 2019-01-14, updated 2026-06-01 (${WP}): corner and safety read number two in a 2x2`, 'https://www.viqtorysports.com/?p=1870', 'primary'),
  s('hicks-robber', 'hicks', `Zach Hicks, Horseshoe Huddle (On SI), "Gus Glossary: Cover One Robber," 2022-08-17 (${WP}): strong safety drops into the hole, deep safety to the middle, man across the board`, 'https://www.si.com/nfl/colts/film/gus-glossary-cover-one-robber'),
  s('bowen-34', 'bowen', `Matt Bowen, "NFL 101: The Basics of the 3-4 Defensive Front," Bleacher Report, 2014-03-27 (${RN('Z')})`, 'https://bleacherreport.com/articles/2007958-nfl-101-the-basics-of-the-3-4-defensive-front', 'primary'),
  s('carasik-34', 'carasik', `Scott Carasik, "NFL Defensive Schemes: the basics of the 4-3, 3-4 and Ryan defenses," Bleacher Report, 2018-06-07 (${RN('AJ')})`, 'https://bleacherreport.com/articles/1074050-nfl-defensive-schemes-the-basics-of-the-4-3-3-4-and-ryan-defenses', 'primary'),
  s('filipiak-under', 'filipiak', `Brian Filipiak, "ITP Glossary: 4-3 Under Front," The Scouting Academy, 2015-11-27 (${RN('AK')})`, 'https://scoutingacademy.com/itp-glossary-4-3-under-front/', 'primary'),
  s('kirby-tite', 'kirby', `Alex Kirby (clinic by Tyler Manes), tite front, Throw Deep blog, 2021-06-10 (${RN('AL')})`, 'https://throwdeeppublishing.com/blogs/news/the-tite-3-4-defense-what-you-need-to-know', 'primary'),
];

export const ALL_SOURCES: readonly Source[] = [...STARTER_SOURCES, ...FULL_SOURCES, ...MORE_SOURCES];
export const SOURCE_BY_ID: ReadonlyMap<string, Source> = new Map(ALL_SOURCES.map((x) => [x.id, x]));
export type { Source };
