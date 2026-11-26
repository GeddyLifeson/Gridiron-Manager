// Sources for the special-teams call menu. One author or staff is one independence group (A5.1.2); one book or
// one rule book is one group however many pages are cited. The NFL rule book and NFL Football Operations
// pages are one group (the league), so a league page never confirms the league's own rule book. Every page was read 2026-11-26 for this work and is
// summarised, with its letter, in /mnt/project-files/research/special-teams-calls/README.md. Nothing is cited
// from memory. Wikipedia, forums and SEO pages are never listed.
import type { Source } from '../starter/sources.ts';

const R = (letter: string): string => `read 2026-11-26 (research/special-teams-calls/README.md, ${letter})`;
const s = (id: string, group: string, citation: string, url: string, how: Source['how'] = 'secondary'): Source => ({ id, group, citation, url, how });
const GS = 'https://gridironstrategies.com/article/';

export const ST_SOURCES: readonly Source[] = [
  // ---- Rule books (primary text) ----
  s('st-nfl-rules-2026', 'nfl-league', 'Official Playing Rules of the NFL, 2026: Rule 6 (free kicks, 6-1-1 to 6-1-6, 6-2-1 wedge), Rule 9 (scrimmage kicks), Rule 11-3 (try), read in nfl-rules/rulebook_2026.txt', 'file:2026-nfl-rulebook.pdf', 'rulebook'),
  s('st-ncaa-rules-2026', 'ncaa-rulebook', 'NCAA Football Rules, 2026: Rule 6-1 (free kicks, illegal wedge formation), Rule 6-5 (fair catch), Rule 8-3 (try), read in research/college/ncaa-rulebook-2026.txt', 'file:research/college/ncaa-rulebook-2026.txt', 'rulebook'),
  // ---- Punt formation, protection and types ----
  s('st-lund-spread', 'lund', `William Lund (Colby College), "Schemes and techniques for success with the spread punt," Gridiron Strategies 5(5) (${R('A')})`, `${GS}schemes-and-techniques-for-success-with-the-spread-punt`, 'primary'),
  s('st-stgeorge-spread', 'stgeorge', `Kyle St. George (Xavier HS, CT), "The spread punt for better coverage and simpler protection," Gridiron Strategies 8(5) (${R('B')})`, `${GS}the-spread-punt-for-better-coverage-and-simpler-protection`, 'primary'),
  s('st-sabock-spread', 'sabock', `Mike Sabock (Northern Illinois), "Spread punt pins offenses deep," Gridiron Strategies 1(2) (${R('C')})`, `${GS}spread-punt-pins-offenses-deep`, 'primary'),
  s('st-accorsi-spread', 'accorsi', `Jay Accorsi (Rowan), "Installing the spread punt game," Nike Coach of the Year Clinics via Coaches Insider, 2017-03-28; read as a summary, not verbatim (${R('D')})`, 'https://coachesinsider.com/football/installing-the-spread-punt-game-article/', 'primary'),
  s('st-holt-shield', 'holt', `Stu Holt (Virginia Tech), "Never get another punt blocked by using this 3-man shield protection," Glazier Clinics, 2025-02-02 (${R('E')})`, 'https://glazierclinics.com/football-coach-resources/never-get-another-punt-blocked-use-this-3-man-shield-protection', 'primary'),
  s('st-mckenna-rugby', 'mckenna', `Dan McKenna (Anna Maria College), rugby punt, X&O Labs (undated) (${R('F')})`, 'https://www.xandolabs.com/?p=15619', 'primary'),
  s('st-haddad-punt', 'haddad', `Chris Haddad, "The complete coaching guide to punting," vIQtory Sports (${R('G')})`, 'https://www.viqtorysports.com/what-is-a-punt-in-american-football/'),
  s('st-haddad-fc', 'haddad', `Chris Haddad, "Fair catch on a kickoff explained," vIQtory Sports, updated 2025-11-28 (${R('AR')})`, 'https://www.viqtorysports.com/?p=23'),
  s('st-dummies-punt', 'dummies', `Dummies (no byline, Wiley), "Football special teams: players on a punt team," updated 2016-03-26 (${R('H')})`, 'https://www.dummies.com/article/home-auto-hobbies/sports-recreation/fantasy-sports/fantasy-football/football-special-teams-players-on-a-punt-team-186767/'),
  s('st-loebach-fake', 'loebach', `Dave Loebach (Covert HS, MI), "Push pass fake punt," Gridiron Strategies 4(1) (${R('I')})`, `${GS}push-pass-fake-punt`, 'primary'),
  s('st-guy-punting', 'guy-sang', `Ray Guy and Rick Sang, Football Kicking and Punting (Human Kinetics), excerpt "Techniques vary for punting a football" (${R('AI')})`, 'https://us.humankinetics.com/blogs/excerpt/techniques-vary-for-punting-a-football'),
  s('st-guy-onside', 'guy-sang', `Ray Guy and Rick Sang, Football Kicking and Punting (Human Kinetics), excerpt "Ray Guy explains how to use onside kicks" (${R('AI')})`, 'https://us.humankinetics.com/blogs/excerpt/ray-guy-explains-how-to-use-onside-kicks'),
  s('st-hewitt-punt', 'hewitt', `Bill Hewitt, "How-to guide for punters and special teams coaches," USA Football, 2018-01-24 (${R('AM')})`, 'https://blogs.usafootball.com/blog/5400/how-to-guide-for-punters-and-special-teams-coaches', 'primary'),
  // ---- Punt return, block, safe ----
  s('st-afca-punt-return', 'afca-staff', `AFCA staff, "Simple punt return," American Football Coaches Association, 2023-04-18 (${R('J')})`, 'https://www.afca.com/simple-punt-return/'),
  s('st-asep-wall', 'asep', `American Sport Education Program, Coaching Football: Technical and Tactical Skills (Human Kinetics), "Wall punt return," via Coaches Insider 2013-08-14 (${R('K')})`, 'https://coachesinsider.com/football/wall-punt-return-article'),
  s('st-asep-onside', 'asep', `American Sport Education Program, Coaching Football: Technical and Tactical Skills (Human Kinetics), "Defending the onside kick," via Coaches Insider 2018-08-16 (${R('AJ')})`, 'https://coachesinsider.com/football/defending-the-onside-kick'),
  s('st-kracht-punt', 'kracht', `Steve Kracht (Brookfield Central HS), "Punt returns that work," Gridiron Strategies 1(5) (${R('L')})`, `${GS}punt-returns-that-work`, 'primary'),
  s('st-kracht-kick', 'kracht', `Steve Kracht (Brookfield Central HS), "Easy to teach kick returns still very effective," Gridiron Strategies 2(1) (${R('AG')})`, `${GS}easy-to-teach-kick-returns-still-very-effective`, 'primary'),
  s('st-booth-wall', 'booth', `Chris Booth (Peterstown MS), "The double wall punt return," Gridiron Strategies 1(2) (${R('M')})`, `${GS}the-double-wall-punt-return`, 'primary'),
  s('st-rogers-block', 'rogers', `Steve Rogers (Wabash College), "Applying pressure to punt protection," Gridiron Strategies 11(5) (${R('N')})`, `${GS}applying-pressure-to-punt-protection`, 'primary'),
  s('st-teeter-return', 'teeter', `Dan Teeter (Sedro-Woolley HS), "Jesse James punt return scheme," Gridiron Strategies 4(2) (${R('O')})`, `${GS}versatile-easy-to-teach-jesse-james-punt-return-scheme-steals-return-yarda`, 'primary'),
  s('st-wpi-return', 'wpi-st', `Special teams coordinator, Worcester Polytechnic Institute (no byline), wall punt return, X&O Labs (${R('P')})`, 'https://www.xandolabs.com/?p=65638', 'primary'),
  // ---- NFL dynamic kickoff ----
  s('st-nflops-explainer', 'nfl-league', `NFL Football Operations (no byline), "Dynamic kickoff rule explainer" (2025 rulebook) (${R('Q')})`, 'https://operations.nfl.com/updates/football-ops/new-nfl-kickoff-rule/'),
  s('st-nflops-2024', 'nfl-league', `NFL Football Operations, The Extra Point, "How did NFL kickoff units approach the 2024 dynamic kickoff?," 2025-01-09 (${R('U')})`, 'https://edge-operations.nfl.com/gameday/analytics/stats-articles/how-did-nfl-kickoff-units-approach-the-2024-dynamic-kickoff'),
  s('st-nflops-onside-2019', 'nfl-league', `NFL Football Operations, The Extra Point, "What can player tracking data tell us about the onside kick?," 2019-10-02 (${R('AL')})`, 'https://operations.nfl.com/stats-central/stats-articles/what-can-player-tracking-data-tell-us-about-the-onside-kick'),
  s('st-ap-2025', 'ap', `Associated Press on NFL.com, "Looking at tweak to kickoff, other rules changes for 2025 season" (${R('R')})`, 'https://www.nfl.com/news/looking-at-tweak-to-kickoff-other-rules-changes-for-2025-season'),
  s('st-bechtold-ko', 'bechtold', `Taylor Bechtold, Opta Analyst, on the Rams' and Panthers' kickoffs under the 2025 rules, 2025-09-26 (${R('S')})`, 'https://theanalyst.com/articles/rams-panthers-nfl-new-kickoff-rules-2025'),
  s('st-nesbitt-ko', 'nesbitt', `Andy Nesbitt, Sports Illustrated, "Two NFL teams have perfected a wild new way...," 2025-09-25 (${R('T')})`, 'https://www.si.com/nfl/nfl-kickoff-rules-new-strategy'),
  s('st-locker-ko', 'locker', `Bradley Locker, PFF, "The data behind the NFL's kick return revolution," 2026-06-18 (${R('V')})`, 'https://www.pff.com/news/the-data-behind-the-nfls-kick-return-revolution'),
  // ---- Field goal, try, block ----
  s('st-donovan-fg', 'donovan', `Terry Donovan, "The fundamentals of proper field goal and PAT protection," USA Football, 2017-04-26 (${R('W')})`, 'https://blogs.usafootball.com/blog/3465/the-fundamentals-of-proper-field-goal-and-pat-protection', 'primary'),
  s('st-erb-fgblock', 'erb-aiken', `Lester Erb and Rob Aiken (Iowa), "Change the momentum by blocking a field goal or extra point," Gridiron Strategies 7(6) (${R('X')})`, `${GS}change-the-momentum-by-blocking-a-field-goal-or-extra-point`, 'primary'),
  s('st-ratledge-fgblock', 'ratledge', `Kenny Ratledge (Sevier County HS), "Blocking extra points and field goals keeps critical points off the board," Gridiron Strategies 2(3) (${R('Y')})`, `${GS}blocking-extra-points-field-goals-keeps-critical-points-off-the-board`, 'primary'),
  s('st-dummies-fg', 'dummies', `Dummies (no byline, Wiley), "Football special teams: field goals and PATs" and "how to block field goals and PATs," updated 2016-03-26 (${R('Z')})`, 'https://www.dummies.com/article/home-auto-hobbies/sports-recreation/fantasy-sports/fantasy-football/football-special-teams-field-goals-and-pats-186758'),
  s('st-mcmahon-fgblock', 'mcmahon', `Tom McMahon (Las Vegas Raiders), "Field goal block off the edge," Nike Coach of the Year Clinics via Coaches Insider, 2025-06-18; summary page (${R('AA')})`, 'https://coachesinsider.com/football/field-goal-block-off-the-edge-with-tom-mcmahon-las-vegas-raiders', 'primary'),
  s('st-bowen-2pt', 'bowen', `Matt Bowen, Bleacher Report, "NFL 101: the basics of the two-point playbook," 2015-06-12 (${R('AB')})`, 'https://bleacherreport.com/articles/2491580-nfl-101-the-basics-of-the-two-point-playbook', 'primary'),
  s('st-leister-goalline', 'leister', `Brendan Leister, "Learn how NFL teams use pick plays to score on the goal line," USA Football, 2019-04-02 (${R('AC')})`, 'https://blogs.usafootball.com/blog/7138/learn-how-nfl-teams-use-pick-plays-to-score-on-the-goal-line'),
  // ---- Kickoff (traditional) types, returns, onside ----
  s('st-berson-kr', 'berson', `Marty Berson, "Weaponize your kickoff return," Coaches Insider, 2023-09-06 (${R('AD')})`, 'https://coachesinsider.com/football/weaponize-your-kickoff-return', 'primary'),
  s('st-wyrick-kr', 'wyrick', `William Wyrick (Harnett Central HS), "The double wedge: a simple and effective kick return scheme," X&O Labs, 2013-10-20 (${R('AE')})`, 'https://www.xandolabs.com/the-lab/special-teams/kick-return/the-double-wedge-a-simple-and-effective-kick-return-scheme/', 'primary'),
  s('st-fore-kr', 'fore', `Chris Fore, "Coaches corner: returning the unconventional kickoff," MaxPreps, 2018-05-22 (${R('AH')})`, 'https://www.maxpreps.com/m/news/Zj-3tpcw-EmEQVK70J8IPA/coaches-corner-returning-the-unconventional-kickoff.htm', 'primary'),
  s('st-karafantis-onside', 'karafantis', `George Karafantis (St. Anthony's HS), "6 onside kick progressions," X&O Labs, 2019-10-20 (${R('AK')})`, 'https://www.xandolabs.com/?p=19655', 'primary'),
  s('st-coiner-squib', 'coiner', `Charlie Coiner, "Special teams: value of a squib kick," FirstDown PlayBook, 2024-12-08 (${R('AN')})`, 'https://firstdown.playbooktech.com/coaches-community/special-teams-value-of-a-squib-kick', 'primary'),
  s('st-afca-avoid', 'fujiwara', `AFCA, "Mastering the kickoff avoid zone" (Adam Fujiwara, Houston Christian), 2026-04-21 (${R('AO')})`, 'https://www.afca.com/?p=17438', 'primary'),
  s('st-afca-monmouth', 'monmouth-st', `AFCA, "Building a championship kickoff unit: inside Monmouth's teaching progression," 2026-08-25 (${R('AP')})`, 'https://www.afca.com/?p=17983', 'primary'),
  s('st-edwards-hudl', 'edwards', `Matt Edwards, Hudl, "Hudl IQ special teams data," 2024-07-16 (${R('AQ')})`, 'https://www.hudl.com/blog/hudl-iq-special-teams-data'),
  s('st-grabowski-swanstrom', 'grabowski', `Keith Grabowski with Dan Swanstrom (Cornell), "Game planning tips: special teams situations," Coach and Coordinator, 2025-11-26 (${R('AS')})`, 'https://coachandcoordinator.com/?p=12548', 'primary'),
];

export const ST_SOURCE_BY_ID: ReadonlyMap<string, Source> = new Map(ST_SOURCES.map((x) => [x.id, x]));
