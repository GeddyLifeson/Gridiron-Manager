// The sources behind the starter content (WP-15, G1.1.1, G2.1.1). Every play and call names the source ids
// it rests on. All pages were read on 2026-11-26 (the research files in research/scheme-sources/ and the
// coverage pass of this work package). A source counts once per independence group (A5.1.2): one author or
// one coaching staff is one group. Wikipedia, forums and SEO pages are never listed here.

export interface Source {
  readonly id: string;
  /** Independence group: one author or one staff, however many pages. */
  readonly group: string;
  readonly citation: string;
  readonly url: string;
  /** primary: the coach's or player's own words. secondary: a writer relaying a coach or charting film. rulebook: the 2026 rule book text. */
  readonly how: 'primary' | 'secondary' | 'rulebook';
}

const s = (id: string, group: string, citation: string, url: string, how: Source['how']): Source => ({ id, group, citation, url, how });

export const SOURCES: readonly Source[] = [
  // Personnel code (G1.1.1 facts line; the bible gives author and date, not the page address)
  s('frenz-personnel', 'frenz', 'Frenz, Bleacher Report, 2018-06-03: "The first number is the number of running backs, and the second is the number of tight ends" (cited in bible G1.1.1)', 'bible:G1.1.1', 'secondary'),
  s('kozora-personnel', 'kozora', 'Kozora, Steelers Depot, 2020-07-11: "The first number tells you the backs, the second the tight ends" (cited in bible G1.1.1)', 'bible:G1.1.1', 'secondary'),
  s('rollins-personnel', 'rollins', 'Rollins, Pro Football Focus, 2018-06-29: the number of wide receivers is the remainder of five (cited in bible G1.1.1)', 'bible:G1.1.1', 'secondary'),
  s('haddad-lettering', 'haddad', 'Haddad, vIQtory Sports, updated 2026-11-09: X is the split end on the line, Z the flanker off the line, Y the tight end (cited in bible G1.1.2)', 'bible:G1.1.2', 'secondary'),
  s('jones-lettering', 'jones', 'Jones, Eleven Warriors, 2015-08-03: X, Z, Y lettering (cited in bible G1.1.2)', 'bible:G1.1.2', 'secondary'),
  s('kelly-lettering', 'kelly', 'Kelly, The Ringer, 2017-08-14: X, Z, Y lettering (cited in bible G1.1.2)', 'bible:G1.1.2', 'secondary'),
  // Route tree and receiver technique
  s('bowen-route-tree', 'bowen', 'Matt Bowen, "NFL 101: Breaking Down the Basics of the Route Tree," Bleacher Report, 2014-04-03', 'https://bleacherreport.com/articles/2016841-nfl-101-breaking-down-the-basics-of-the-route-tree', 'primary'),
  s('bowen-cover1', 'bowen', 'Matt Bowen, "NFL 101: Introducing the Basics of Cover 1," Bleacher Report, 2014-04-17', 'https://bleacherreport.com/articles/2032934-nfl-101-introducing-the-basics-of-cover-1', 'primary'),
  s('bowen-cover3', 'bowen', 'Matt Bowen, "NFL 101: Introducing the Basics of Cover 3," Bleacher Report, 2014-05-01', 'https://bleacherreport.com/articles/2047445-nfl-101-introducing-the-basics-of-cover-3', 'primary'),
  s('bowen-cover4', 'bowen', 'Matt Bowen, "NFL 101: Introducing the Basics of Cover 4," Bleacher Report, 2014-06-12', 'https://bleacherreport.com/articles/2094989-nfl-101-introducing-the-basics-of-cover-4', 'primary'),
  s('bowen-cover0', 'bowen', 'Matt Bowen, "Coaching up Cover 0," National Football Post (byline not shown on the page; page ends with his handle)', 'https://www.nationalfootballpost.com/coaching-up-cover-0', 'primary'),
  s('bowen-packaged', 'bowen', 'Matt Bowen, "NFL 101: Breaking Down the Basics of Packaged Plays," Bleacher Report, 2014-06-05', 'https://bleacherreport.com/articles/2083162-nfl-101-breaking-down-the-basics-of-packaged-plays', 'primary'),
  s('bowen-readoption', 'bowen', 'Matt Bowen, "NFL 101: Introducing the Read-Option," Bleacher Report, 2014-05-29', 'https://bleacherreport.com/articles/2079353-nfl-101-introducing-the-read-option', 'primary'),
  s('campbell-fourverts', 'campbell', 'Michael Campbell, "Four Verts," Throw Deep Publishing football glossary, 2022-04-28', 'https://throwdeeppublishing.com/blogs/football-glossary/', 'primary'),
  s('campbell-stick', 'campbell', 'Michael Campbell, "Stick," Throw Deep Publishing football glossary, 2022-04-25', 'https://throwdeeppublishing.com/blogs/football-glossary/', 'primary'),
  s('campbell-cover0', 'campbell', 'Michael Campbell, "Coverage School: What is Cover 0 in Football?," Throw Deep Publishing, 2022-05-12', 'https://throwdeeppublishing.com/blogs/football-glossary/what-is-cover-0-in-football', 'primary'),
  s('campbell-flea', 'campbell', 'Michael Campbell, "Understanding the Flea Flicker Play in Football," Throw Deep Publishing, 2023-01-18', 'https://throwdeeppublishing.com/blogs/football-glossary/understanding-the-flea-flicker-play-in-football-diagrams-and-video', 'primary'),
  s('campbell-routes', 'campbell', 'Michael Campbell, "The Complete Guide to Football Routes," Throw Deep Publishing, 2022-09-24', 'https://throwdeeppublishing.com/blogs/football-glossary/football-pass-routes-complete-guide', 'primary'),
  s('brown-gonzalez', 'brown', 'Chris Brown with Dan Gonzalez, "Getting Vertical with Dan Gonzalez," Smart Football, 2009-03-24', 'https://smartfootball.blogspot.com/2009/03/getting-vertical-with-dan-gonzalez.html', 'primary'),
  s('brown-sprintout', 'brown', 'Chris Brown, "Sprint-out and Half-roll Passing," Smart Football, 2005-08-12', 'https://smartfootball.blogspot.com/2005/08/sprint-out-and-half-roll-passing.html', 'primary'),
  s('brown-power', 'brown', 'Chris B. Brown, "Football 101: Why Power Running Works," Grantland, 2015-09-10', 'https://grantland.com/the-triangle/2015-nfl-college-football-power-running-counter-running/', 'primary'),
  s('haddad-routes', 'haddad', 'Chris Haddad, vIQtory Sports, "The Complete Coaching Guide To Football Routes," 2023-12-11', 'https://www.viqtorysports.com/?p=21860', 'primary'),
  s('haddad-cover0', 'haddad', 'Chris Haddad, vIQtory Sports, "How To Install Cover 0," published 2020-06-16', 'https://www.viqtorysports.com/what-is-cover-0-learn-the-basics-of-man-coverage/', 'primary'),
  s('haddad-cover1', 'haddad', 'Chris Haddad, vIQtory Sports, "How To Install Cover 1," published 2021-03-16', 'https://www.viqtorysports.com/learn-the-basics-of-cover-1-in-football/', 'primary'),
  s('haddad-cover2', 'haddad', 'Chris Haddad, vIQtory Sports, "Cover 2 Defense Install Guide," published 2021-04-08', 'https://www.viqtorysports.com/what-is-cover-2-in-football-explained/', 'primary'),
  s('haddad-cover4', 'haddad', 'Chris Haddad, vIQtory Sports, "Cover 4 Defense Install Guide," published 2021-08-09', 'https://www.viqtorysports.com/cover-4-in-football-coverage-guide/', 'primary'),
  s('haddad-cover5', 'haddad', 'Chris Haddad, vIQtory Sports, "What Is Cover 5 In Football? 2-Man Install Guide," published 2020-05-19', 'https://www.viqtorysports.com/what-is-cover-5-in-football/', 'primary'),
  s('haddad-splitfield', 'haddad', 'Chris Haddad, vIQtory Sports, "How To Install Split Field Coverages," published 2021-03-17', 'https://www.viqtorysports.com/split-field-coverage-in-football/', 'primary'),
  s('haddad-sprintout', 'haddad', 'Chris Haddad, vIQtory Sports, "Running Sprint Out and Naked Bootleg Play Action In Football," 2020-12-15', 'https://www.viqtorysports.com/running-sprint-out-and-naked-play-action/', 'primary'),
  s('peters-fourvert', 'peters', 'Bobby Peters, "Todd Monken\'s Four Vertical concept," Alert the Post, 2026-05-13', 'https://alertthepost.substack.com/p/todd-monkens-four-vertical-concept', 'secondary'),
  s('peters-deepcross', 'peters', 'Bobby Peters, "How Kyle Shanahan\'s deep cross concept works," USA Football, 2018-04-23', 'https://blogs.usafootball.com/blog/6053/how-kyle-shanahan-s-deep-cross-concept-works', 'secondary'),
  s('bowen-slantflat', 'bowen', 'Matt Bowen, "Drawing up the slant/flat vs Cover 2," National Football Post', 'https://www.nationalfootballpost.com/drawing-up-the-slantflat-vs-cover-2', 'primary'),
  s('leister-fourverts', 'leister', 'Brendan Leister, "Podcast Review: AJ Smith talks all things about 4 Verticals," USA Football, 2019-06-27', 'https://blogs.usafootball.com/blog/7368/podcast-review-aj-smith-talks-all-things-about-4-verticals', 'secondary'),
  s('sampath-stick', 'sampath', 'Kaushik Sampath, "Stanford Film Study: Stick concept," The Stanford Daily, 2022-10-03', 'https://stanforddaily.com/2022/10/03/stanford-film-study-stick-concept/', 'secondary'),
  s('weeklyspiral', 'weeklyspiral', 'Weekly Spiral (author not stated): stick, draw, buck sweep and glance pages, 2021', 'https://weeklyspiral.com/2021/02/01/stick-concept', 'secondary'),
  s('corrill-stick', 'corrill', 'Caleb Corrill, "Quick Game Cheat Code (Stick Concept Option)," Glazier Clinics, 2024-06-06', 'https://www.glazierclinics.com/football-coach-resources/quick-game-cheat-code-stick-concept-option', 'primary'),
  s('lieberman', 'lieberman', 'Drew Lieberman, "Coaching the Wide Receiver" series, USA Football, 2019 (speed cut, square break, press release, loose coverage)', 'https://blogs.usafootball.com/blog/7085', 'primary'),
  s('drinkall', 'drinkall', 'Matt Drinkall, USA Football, "The Spacing Pass Concept," 2019-07-25 and "The Sprint-Out Package," 2019-06-10', 'https://blogs.usafootball.com/blog/7433/the-spacing-pass-concept', 'primary'),
  // Run game
  s('gibbs-zone', 'gibbs', 'Alex Gibbs zone coaching points, compiled by Tom Neuman (SlideShare, about 2010)', 'https://www.slideshare.net/slideshow/fball-gibbs-alex-gibbs-zone-coaching-points/3425068', 'primary'),
  s('hovorka-iz', 'hovorka', 'Adam Hovorka, spread inside zone, X&O Labs', 'https://www.xandolabs.com/?p=21631', 'primary'),
  s('hk-iz', 'humankinetics', '"Inside Zone," Complete Offensive Line, Human Kinetics, via Coaches Insider, 2013-11-20', 'https://coachesinsider.com/football/inside-zone-complete-offensive-line-article/', 'primary'),
  s('johnston-iz', 'johnston', 'Matt Johnston, "Coaching running back reads in the inside zone read," Gridiron Strategies', 'https://gridironstrategies.com/article/coaching-running-back-reads-in-the-inside-zone-read', 'primary'),
  s('forbes-draw', 'forbes', 'AJ Forbes, "Draw," Throw Deep Publishing, 2023-07-25 (also wham, iso, buck sweep)', 'https://throwdeeppublishing.com/blogs/football-glossary/', 'primary'),
  s('weeklyspiral-draw', 'weeklyspiral', 'Weekly Spiral, "Draw," 2021-06-21', 'https://weeklyspiral.com/2021/06/21/draw', 'secondary'),
  s('haddad-iz', 'haddad', 'Chris Haddad, vIQtory Sports, "Inside Zone Install Guide," 2021-06', 'https://www.viqtorysports.com/', 'primary'),
  s('nguyen-power-option', 'nguyen', 'Ted Nguyen, "Variations of the power option play," USA Football, 2017-09-22', 'https://blogs.usafootball.com/blog/4488/variations-of-the-power-option-play', 'primary'),
  s('nguyen-screens', 'nguyen', 'Ted Nguyen, "Why screen plays can work so well in the NFL," USA Football, 2017-10-05', 'https://blogs.usafootball.com/blog/4577/why-screen-plays-can-work-so-well-in-the-nfl', 'primary'),
  // Play action, screens, RPO
  s('syed-shanahan', 'syed', 'Shawn Syed, "Shanahan Schemes," SumerSports, 2023-07-05', 'https://sumersports.com/the-zone/shanahan-schemes/', 'secondary'),
  s('syed-cover1', 'syed', 'Shawn Syed, "The Many Variations of Cover 1," SumerSports, 2023-08-03', 'https://sumersports.com/the-zone/the-many-variations-of-cover-1/', 'secondary'),
  s('rich-sequencing', 'rich', '"Rich," "49ers film room: How Kyle Shanahan sequences play calling part 1," West Coast Football, 2023-08-30', 'https://westcoastfootball.substack.com/p/49ers-film-room-play-action-sequencing-part-1', 'secondary'),
  s('mays-playaction', 'mays', 'Robert Mays, "Fifty Years of Play-Action Evolution Has Led to Sean McVay\'s Rams," The Ringer, 2019-02-01', 'https://www.theringer.com/nfl/2019/2/1/18206319/rams-sean-mcvay-play-action-history-bill-walsh-mike-shanahan', 'secondary'),
  s('evely-boot', 'evely', 'Dusty Evely, "When Open Isn\'t Open Part 2: PA Boot COP," 2023-03-04', 'https://dustyevely.substack.com/p/when-open-isnt-open-part-2-pa-boot', 'primary'),
  s('johnson-naked', 'johnson', 'Chad Johnson (Mission Viejo HS), "Naked Bootlegs," Glazier Football, 2024-01-24', 'https://glazierclinics.com/football-coach-resources/naked-bootlegs', 'primary'),
  s('deberry-screens', 'deberry', 'Matt DeBerry (College Station HS), "Screen Game Essentials," Glazier, 2025-04-08', 'https://glazierclinics.com/football-coach-resources/screen-game-essentials-simple-concepts-that-move-the-chains', 'primary'),
  s('coiner-boot', 'coiner', 'Charlie Coiner, FirstDown PlayBook: "3 Reasons For The Bootleg Pass Game," 2025-09-26; Millard South slow screen, 2021-09-28; "FDPB Quarters Coverage vs Quarter Quarter Half," 2022-03-26', 'https://firstdown.playbooktech.com/coaches-community/3-reasons-for-the-bootleg-pass-game', 'primary'),
  s('karlo-screens', 'karlo', 'Tom Karlo (Grossmont HS), "Detachment Screens," Nike 2016 clinic notes, Coaches Insider, 2016-08-12', 'https://coachesinsider.com/football/detachment-screens-article/', 'primary'),
  s('alleman-screen', 'alleman', 'Andy Alleman and Michael Bennett, "Breaking Down the Screen Pass," STACK', 'https://www.stack.com/?p=91344', 'primary'),
  s('davidson-sequences', 'davidson', 'Dean Davidson, "How I Gameplan Playcall Sequences, Pt. 2," Wide Zone Warriors, 2025-06-13', 'https://widezonewarriors.substack.com/p/how-i-gameplan-playcall-sequences-f60', 'primary'),
  s('kuchar-rpo', 'kuchar', 'Mike Kuchar, X&O Labs: pre-snap count and conflict defender; "Designing RPO Systems: Case 1," 2016-06-08', 'https://www.xandolabs.com/?p=16639', 'primary'),
  s('lamb-rpo', 'lamb', 'Taylor Lamb, "Pre and Post-Snap RPO," AFCA, 2023-06-26', 'https://www.afca.com/?p=12057', 'primary'),
  s('galina-rpo', 'galina', 'Seth Galina, "Everything you need to know about RPOs," USA Football, 2018-06-06', 'https://blogs.usafootball.com/blog/6257/everything-you-need-to-know-about-rpos', 'primary'),
  s('hargitt-rpo', 'hargitt', 'Rich Hargitt, "Game Planning and Play Calling: Age of RPOs," Nike Coach of the Year manual, Coaches Insider, 2020-01-08', 'https://coachesinsider.com/football/game-planning-and-play-calling-age-of-rpos/', 'primary'),
  s('rothstein-flea', 'rothstein', 'Michael Rothstein, "From Darrell Bevell to Boobie Miles, the anatomy of a Lions flea-flicker," ESPN, 2019-10-28', 'https://www.espn.com/blog/detroit-lions/post/_/id/36002/from-darrell-bevell-to-boobie-miles-the-anatomy-of-a-lions-flea-flicker', 'secondary'),
  s('fdpb-flea', 'fdpb', 'FirstDown PlayBook editable play "Flea Flicker" (2 back pro, pistol), author not shown', 'https://firstdown.playbooktech.com/editable-plays/2815/flea-flicker', 'primary'),
  // Coverage
  s('bullock-man', 'bullock', 'Mark Bullock, "Washington Coverages Part 3: Man Coverage," 2021-06-03', 'https://markbullock.substack.com/p/washington-coverages-part-3-man-coverage', 'secondary'),
  s('bullock-quarters', 'bullock', 'Mark Bullock, "Commanders Scheme Breakdown: Quarters Coverage," 2023-06-27 (paywalled after the opening)', 'https://markbullock.substack.com/p/commanders-scheme-breakdown-quarters', 'secondary'),
  s('schalter-cover2', 'schalter', 'Ty Schalter, "Football 101: Breaking Down the Cover 2 Defense," Bleacher Report, 2012-02-28', 'https://bleacherreport.com/articles/1084800-football-101-breaking-down-the-cover-2-defense', 'secondary'),
  s('steelersdepot-coverages', 'steelersdepot', '"Football 101: Basic Defensive Coverages," Steelers Depot, 2015-12 (no byline in the page text)', 'https://steelersdepot.com/2015/12/football-101-basic-defensive-coverages', 'secondary'),
  s('33rd-coverage', 'the33rd', '"Breaking down NFL man and zone coverage schemes," The 33rd Team (no byline in the page text)', 'https://www.the33rdteam.com/breaking-down-nfl-man-zone-coverage-schemes/', 'secondary'),
  s('svec-twoman', 'svec', 'Jon Svec, "An Intro to Two-Man," 2023-09-29', 'https://jonsvec.substack.com/p/an-intro-to-two-man', 'primary'),
  s('kuchar-cooke-twoman', 'kuchar-cooke', 'Mike Kuchar with Mike Cooke (Sacred Heart DC), two-deep man under, X&O Labs (undated)', 'https://www.xandolabs.com/?p=130555', 'primary'),
  s('cason-quarters', 'cason', 'Clayton Cason, "College Coach details Quarters coverage," USA Football, 2019-07-02', 'https://blogs.usafootball.com/blog/7382/college-coach-details-quarters-coverage', 'primary'),
  s('loose-cover6', 'loose', 'John Loose (Army West Point) with Keith Grabowski, "Building a Defensive Toolbox with Cover 6 Concepts," Coach and Coordinator, 2025-11-18', 'https://coachandcoordinator.com/john-loose-cover-6-defense/', 'primary'),
  s('alexander-cover6', 'alexander', 'Cody Alexander, "What is Cover 6? Explaining Quarter-Quarter-Half and its Sister, Cover 8," MatchQuarters, 2025-08-02 (show notes)', 'https://www.matchquarters.com/p/what-is-cover-6-vs-cover-8-nfl-defense-explained-vic-fangio', 'secondary'),
  s('rb-bowen-cover2', 'bowen', 'Matt Bowen, "Introducing the Basics of Cover 2," Bleacher Report, 2014-04-24, as relayed in research/scheme-sources/receiver-technique-and-timing.md (page not re-read here)', 'https://bleacherreport.com/articles/2039934', 'secondary'),
  // Line technique and rules
  s('durkin-technique', 'durkin', 'Dan Durkin, "Football 101: gaps, techniques, alignments," CBS Chicago, 2013-08-26', 'https://www.cbsnews.com/chicago/news/durkins-football-101-gaps-techniques-alignments', 'primary'),
  s('underhill-technique', 'underhill', 'Nick Underhill, "The Glossary: Defensive Line Techniques," NewOrleans.Football, 2021-07-05', 'https://neworleans.football/article/the-glossary-explaining-the-different-defensive-line-techniques-and-associated-responsibilities', 'primary'),
  s('reisland-technique', 'reisland', 'Lance Reisland, "Defensive Line Techniques & Gap Identification," Gridiron IQ, 2026', 'https://lancereisland.substack.com/p/defensive-line-techniques-and-gap', 'primary'),
  s('rulebook-2026', 'nfl-rulebook', 'NFL Rulebook 2026: Rule 7 Section 2 Article 1(c) (quarterback kneel ends the down); Rule 8 Section 2 Article 1 Item 3 (T-formation quarterback may stop the clock by throwing the ball into the ground)', 'file:2026-nfl-rulebook.pdf', 'rulebook'),
];

export const SOURCE_BY_ID: ReadonlyMap<string, Source> = new Map(SOURCES.map((x) => [x.id, x]));
