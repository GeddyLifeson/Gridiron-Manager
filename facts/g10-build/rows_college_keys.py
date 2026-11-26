"""College rule values for the keys the G-37 college module reads (packages/league/src/college/keys.ts, marked NEW there).
Every quote that has a local text copy is searched for and the build stops if it is missing. Web quotes are as returned by the
cloud web fetch on 2026-11-26 (page text not saved locally; no quote over 125 characters from non-NCAA pages). Status is computed."""
from core import *
RS = '/mnt/project-files/research/glossary/sources/'
Y = '2026'
COLK = Reg('league-rule', 'college-keys')
NW = 'Quote as returned by the cloud web fetch on 2026-11-26 (page text not saved locally, so the quote lint cannot re-find it).'
def web(n, c, g, primary=False, how=None):
    source(n, c, g, primary, how or ('primary text' if primary else 'secondary summary'))
W = lambda n, where, q, v=None: S(n, where, q, v)

# ---- local text copies
source('ncaa101', 'NCAA Eligibility Center, Division I and II Age-Based Eligibility Rules: Eligibility 101 (https://www.ncaa.org/eligibility-center/division-i-and-division-ii-age-based-eligibility-rules/)', 'ncaa', True, 'primary text', RS + 'ncaa--age-based-eligibility.txt', 'ncaa--age-based-eligibility.txt')
source('wikired', 'Wikipedia, Redshirt (college sports) (saved page copy)', 'wikipedia', False, 'secondary summary', RS + 'wikipedia--redshirt-college-sports.txt', 'wikipedia--redshirt-college-sports.txt')
source('espnport', 'ESPN, Transfer portal explained (saved page copy)', 'espn', False, 'secondary summary', RS + 'espn--transfer-portal-explained.txt', 'espn--transfer-portal-explained.txt')
source('siport', 'Sports Illustrated, Transfer portal rules (saved page copy)', 'si', False, 'secondary summary', RS + 'si--transfer-portal-rules.txt', 'si--transfer-portal-rules.txt')
# ---- NCAA pages
web('lsdbi_107787', 'NCAA LSDBi proposal 2024-5, Recruiting and academic eligibility, four-year college transfers (Adopted Final 2024; https://web3.ncaa.org/lsdbi/search/proposalView?id=107787)', 'ncaa', True)
web('lsdbi_109394', 'NCAA LSDBi proposal 2026-44, Age-based eligibility model, five-year period of eligibility (Adopted Final 2026; https://web3.ncaa.org/lsdbi/search/proposalView?id=109394); quotes came through the fetch tool\'s summary of the page', 'ncaa', False)
web('ncaa_apr', 'NCAA.org, Academic Progress Rate (APR) (page modified 2026-10-20, https://www.ncaa.org/student-athletes/compliance/academic-progress-rate)', 'ncaa', True)
web('ncaa_apr23', 'NCAA.org, Academic Performance Program penalties to return for 2024-25 (2023-02-10, https://www.ncaa.org/news/media-center-academic-performance-program-penalties-to-return-for-2024-25/)', 'ncaa', True)
web('ncaa_news11', 'NCAA News Archive, New rule should boost APRs in football (2011-05-24, https://s3.amazonaws.com/ncaanewsarchive/2011/may/new-rule-should-boost-aprs-in-football.html)', 'ncaa', False)
web('ncaa_memo', 'NCAA, Information Regarding the 2026 NFL Draft, Tryouts and Agents (memo dated 2025-12-01, https://ncaaorg.s3.amazonaws.com/enforcement/2026ENF_NFLEducationMemo.pdf)', 'ncaa', True)
# ---- school compliance pages restating the bylaws (each its own group)
web('lsu', 'LSU Compliance, Eligibility Requirements (copyright 2021, https://www.compliance.lsu.edu/eligibility-requirements-1)', 'lsu-compliance')
web('lsu_tr', 'LSU Compliance, Transfer Regulations (quotes Bylaw 15.3.5.1(f), copyright 2021, https://www.compliance.lsu.edu/transfer-regulations)', 'lsu-compliance')
web('wvu', 'West Virginia University Athletics, Continuing eligibility (undated PDF, https://academics.wvusports.com/assets/pdf/continuing-eligibility.pdf)', 'wvu-compliance')
web('duq', 'Duquesne University 2025-2026 Graduate Catalog, NCAA Progress Toward Degree (page updated 2026-07-17, https://duq.edu/academics/university-catalogs/2025-2026-catalog/graduate/academic-policies/ncaa.php)', 'duquesne')
web('nsu', 'Northeastern State University, NCAA Academic Eligibility overview (file dated 2015-12-10; https://academics.nsuok.edu/Portals/38/NCAA%20Academic%20Eligibility_Overview%20and%20Sport%20Schedules%2012-10-15.pdf)', 'nsu')
web('csp13', 'College Sports Scholarships, Football Nine Hour Rule Stays Quiet Once Again (2013-09-20, https://www.collegesportsscholarships.com/2013/09/20/football-nine-hour-rule-stays-quite-once-again)', 'collegesportsscholarships')
web('espn_apr20', 'ESPN, NCAA: 15 Division I programs face postseason bans over APR results (2020-05-19, https://www.espn.com/college-sports/story/_/id/29194905/ncaa-hits-15-division-programs-postseason-bans-apr-results)', 'espn')
web('wiki_apr', 'Wikipedia, Academic Progress Rate (https://en.wikipedia.org/wiki/Academic_Progress_Rate)', 'wikipedia')
# ---- transfers
web('espn_win', 'ESPN, NCAA adopts Jan. 2-16 transfer portal window for FBS, FCS in \'26 (2025-10-07, https://www.espn.com/college-football/story/_/id/46524004/ncaa-adopts-jan-2-16-transfer-portal-window-fbs-fcs-26)', 'espn')
web('espn_faq', 'ESPN via ABC7, Why did college football move its transfer portal? An FAQ (2025-10-10, https://abc7.com/post/did-college-football-move-transfer-portal-faq/17977693/)', 'espn')
web('si_win', 'Sports Illustrated, NCAA announces new college football transfer portal window dates (2025-10-08, https://www.si.com/fannation/college/cfb-hq/transfer-portal/ncaa-announces-new-college-football-transfer-portal-window-dates)', 'si')
web('ap_win', 'AP via Washington Times, NCAA OKs single January transfer window for college football (2025-10-08, https://www.washingtontimes.com/news/2025/oct/8/ncaa-oks-single-january-transfer-window-college-football/)', 'ap')
web('on3_win', 'On3, New details emerge on rules surrounding transfer portal during coaching changes (https://www.on3.com/news/more-details-emerge-rules-around-coaching-changes-college-football-transfer-portal)', 'on3')
web('ncsa', 'NCSA, NCAA Transfer Portal 2026-27: Dates & Rules (updated 2026-11-02, https://www.ncsasports.org/recruiting/ncaa-transfer-rules)', 'ncsa')
# ---- eligibility
web('pbs_ap', 'AP via PBS NewsHour, NCAA panel approves new eligibility rules giving Division I athletes 5 years to play 5 seasons (2026-06-23, https://www.pbs.org/newshour/nation/ncaa-panel-approves-new-eligibility-rules-giving-division-i-athletes-5-years-to-play-5-seasons)', 'ap')
web('baker', 'BakerHostetler, When JuCo Seasons Count: NCAA Eligibility Rules Face Legal Scrutiny (2026-05-11, https://www.bakerlaw.com/insights/when-juco-seasons-count-ncaa-eligibility-rules-face-legal-scrutiny/)', 'bakerhostetler')
# ---- pay
web('aol', 'Columbus Dispatch via AOL, Which Ohio State sports will receive revenue-sharing money in 2026-27 (undated, https://www.aol.com/articles/ohio-state-sports-receive-revenue-140213086.html)', 'columbus-dispatch')
web('hr4312', 'Congress.gov, H.R. 4312 SCORE Act, text as reported in the House (2025-09-11, https://www.congress.gov/119/bills/hr4312/BILLS-119hr4312rh.htm); part read through the fetch tool\'s summary', 'congress', True)
web('ml_score', 'Morgan Lewis, No SCORE: Congress Leaves College Sports in Regulatory Limbo, Forcing the White House to Sub In (2026-05-27, https://www.morganlewis.com/pubs/2026/05/no-score-congress-leaves-college-sports-in-regulatory-limbo-forcing-the-white-house-to-sub-in)', 'morgan-lewis')
web('crs', 'Congressional Research Service, College Athlete Compensation: Impacts of the House Settlement (LSB11349, 2025-08-15, https://www.congress.gov/crs_external_products/LSB/PDF/LSB11349/LSB11349.2.pdf)', 'crs', True)
web('willkie', 'Willkie, Money on My Mind (And In My Pocket) (2025-06-13, https://www.willkie.com/publications/2025/06/money-on-my-mind-and-in-my-pocket)', 'willkie')
web('fred', 'Fredrikson & Byron, The New College Sports Economy: Understanding NIL, Revenue Sharing and Athlete Opportunities After House (2026-07-01, https://www.fredlaw.com/alert-the-new-college-sports-economy-understanding-nil-revenue-sharing-and-athlete-opportunities-after-house)', 'fredrikson')
# ---- draft
web('nfl_special', 'NFL.com, Forty-two players granted special eligibility for 2026 NFL Draft (January 2026, https://www.nfl.com/news/forty-two-players-granted-special-eligibility-for-2026-nfl-draft)', 'nfl-league-office', True)
web('br_draft25', 'Bleacher Report, NFL Reveals Deadlines to Declare for 2025 Draft with \'Championship\' Rule Change (2024-11-05, https://bleacherreport.com/articles/10142390-nfl-reveals-deadlines-to-declare-for-2025-draft-with-championship-rule-change)', 'bleacher-report')

def row(stmt, value, unit, valid, sources, key, notes=None):
    return COLK.row('college', stmt, value, unit, valid, sources, key=key, notes=(notes + ' ' if notes else '') + NW)
def src_note(extra): return extra

# =================== eligibility (T5.2.1, T6.3.2)
row('Age model: a player who turns 19 before Sept. 1 is counted for that academic year; the cut-off month is September.', 9, 'month', Y,
  [W('ncaa101', 'Eligibility 101, how the period works', 'if the student-athlete turns 19 before Sept. 1', 9)],
  ('eligibility.age_cutoff_month', 'Age model: month of the cut-off date', 'T5.2.1'), 'One source (the NCAA page). The cut-off is stated as a date, so month 9 and day 1 are one fact read two ways.')
row('Age model: the cut-off day within September is the 1st.', 1, 'day', Y,
  [W('ncaa101', 'Eligibility 101, how the period works', 'For an individual who turns 19 on or after Sept. 1, the period of eligibility begins at the start of the subsequent academic year', 1)],
  ('eligibility.age_cutoff_day', 'Age model: day of the cut-off month', 'T5.2.1'), 'One source.')
row('Only the age model applies to players who first enroll full time in fall 2027 or later (2027 is the first entry year).', 2027, 'season_year', Y,
  [W('ncaa101', 'Eligibility 101, transition rules', 'Prospects who initially enroll full time at any college or university in fall 2027 or later: the age-based rule only.', 2027),
   W('pbs_ap', 'AP report', 'will affect all athletes who enroll in 2027-28', 2027)],
  ('eligibility.age_model_first_entry_year', 'First enrollment year judged by the age model alone', 'T5.2.1'))
row('The new rules start with the 2026-27 academic year; players with eligibility left after 2025-26 get the better of the old and new rules, and players who used their last season in 2025-26 get nothing more.', 2026, 'season_year', Y,
  [W('ncaa101', 'Eligibility 101', 'NCAA Divisions I and II eligibility rules are changing starting with the 2026-27 academic year.', 2026),
   W('lsdbi_109394', 'Proposal 2026-44 summary', 'effective August 1, 2026', 2026)],
  ('eligibility.transition_first_season', 'First season of the better-of-both evaluation', 'T5.2.1'), 'The LSDBi line is from the fetch tool\'s summary (effective August 1, 2026, adopted by the Cabinet June 24, 2026).')
row('Seasons model: four seasons of competition.', 4, 'seasons', Y,
  [W('pbs_ap', 'AP report', 'gave athletes five years to complete four seasons of competition', 4),
   W('wikired', 'Redshirt article', 'Typically, a student\'s athletic eligibility in a given sport is four seasons', 4)],
  ('eligibility.seasons_of_competition', 'Seasons model: seasons of competition', 'T5.2.1'))
row('Seasons model: the seasons are used within five years of first full-time enrollment.', 5, 'years', Y,
  [W('pbs_ap', 'AP report', 'gave athletes five years to complete four seasons of competition', 5),
   W('baker', 'Article text', 'complete all seasons of participation within five calendar years of their initial full-time collegiate enrollment', 5),
   W('wikired', 'Redshirt article', 'a student athlete has at most five academic years to use the four years of eligibility', 5)],
  ('eligibility.seasons_clock_years', 'Seasons model: years allowed to use the seasons', 'T5.2.1'))
row('Seasons model, football: a player who appears in four or fewer games does not use a season of eligibility.', 4, 'games', Y,
  [W('wikired', 'Four-game rule', 'redshirt status would not be lost unless a player participated in more than four games in a season', 4),
   W('baker', 'Article text', 'allow football players to compete in up to four games without using a season of eligibility', 4)],
  ('eligibility.redshirt_max_games', 'Seasons model: games a player may appear in and keep the season', 'T5.2.1'))
row('Postseason games do not count toward the football four-game line (only regular-season games do).', False, None, Y,
  [W('wikired', 'Four-game rule', 'the four-game limit applies only to regular-season games; conference championship games, bowl games, the FCS playoffs, and the College Football Playoff no longer count against the limit', False)],
  ('eligibility.postseason_counts', 'Whether postseason games count toward the redshirt line', 'T5.2.1'), 'One source (Wikipedia summary of the 2024 adoption). Bible T5.2.1 says Verified on an NCAA release and two press reports; those were not re-read here, so this row carries what was read.')
row('Under the rule now in force, junior college seasons count against the NCAA eligibility clock. Whether they count under the age model is not stated by the pages read.', True, None, Y,
  [W('baker', 'Article text', 'For now, the NCAA considers time spent in JuCo to be the same as time spent in a Division 1 program.', True),
   W('pbs_ap', 'AP report', 'challenging an NCAA rule counting seasons spent at junior colleges', True)],
  ('eligibility.juco_seasons_count', 'Whether two-year college seasons count against the clock', 'T6.3.2'), 'The pending Pavia case may change this. The age model starts the clock at any full-time enrollment, two-year college included (NCAA Eligibility 101).')

# =================== academic (T5.3.1)
row('Full-time load: at least 12 semester or quarter hours per term.', 12, 'credit_hours', Y,
  [W('lsdbi_107787', 'Bylaw 14.2.2', 'which shall not be less than 12 semester or quarter hours', 12),
   W('lsu', 'Eligibility page', 'Maintain a full-time schedule (at least 12 credits) at all times;', 12),
   W('duq', 'Progress toward degree', 'continue enrollment in coursework on a minimum full-time basis (at least 12 credits) in a given semester', 12)],
  ('academic.full_time_hours', 'Full-time load per term', 'T5.3.1'))
row('A player must have passed at least six hours in the preceding term to play in the next.', 6, 'credit_hours', Y,
  [W('lsu', 'Eligibility page', 'Pass at least six (6) credit hours per semester.', 6),
   W('wvu', 'Continuing eligibility', 'SA must satisfactorily complete a minimum of 6 semester hours of degree-applicable credit each semester', 6),
   W('duq', 'Progress toward degree', 'Six semester hours of academic credit during the preceding regular academic term', 6)],
  ('academic.term_min_hours', 'Hours passed in the previous term to play in the next', 'T5.3.1'))
row('A player must have passed at least 18 hours since the beginning of the previous fall term (summer hours do not count toward it).', 18, 'credit_hours', Y,
  [W('duq', 'Progress toward degree', 'Eighteen semester hours of academic credit since the beginning of the previous fall term', 18),
   W('wvu', 'Continuing eligibility', 'SA must complete 18 semester hours during each academic year (2 semesters).', 18),
   W('lsu', 'Eligibility page', 'Pass at least 18 credit hours each academic year', 18)],
  ('academic.year_min_hours', 'Hours passed since the previous fall term', 'T5.3.1'), 'The "summer excluded" detail is the bible\'s; the pages read do not state it.')
row('A first-year player must have passed 24 hours before the start of the second year of full-time enrollment.', 24, 'credit_hours', Y,
  [W('duq', 'Progress toward degree', 'Twenty-four semester hours of academic credit prior to the start of the student-athlete\'s second year', 24),
   W('wvu', 'Continuing eligibility', 'SA must complete 24 semester hours prior to the beginning of the SA\'s 2nd year (third semester) of full-time enrollment', 24)],
  ('academic.first_year_min_hours', 'Hours passed before the second year', 'T5.3.1'))
row('Football fall rule: a player must pass nine hours in the fall term.', 9, 'credit_hours', Y,
  [W('ncaa_news11', 'NCAA news', 'The rule requires players to earn nine credit hours in every fall term', 9),
   W('wvu', 'Continuing eligibility', 'Student-athletes must pass 9 hours in the fall semester or sit the first 4 games of the subsequent season.', 9),
   W('lsu', 'Eligibility page', 'In the sport of football, a student-athlete must pass nine (9) credit hours', 9),
   W('csp13', 'Article text', 'requiring football players to earn nine credits in the fall semester', 9)],
  ('academic.fall_min_hours', 'Football fall rule: hours passed in the fall', 'T5.3.1'))
row('Football fall rule: a player who misses it is held out of the first four games of the next season.', 4, 'games', Y,
  [W('ncaa_news11', 'NCAA news', 'be suspended for the first four games the following fall.', 4),
   W('wvu', 'Continuing eligibility', 'Student-athletes must pass 9 hours in the fall semester or sit the first 4 games of the subsequent season.', 4)],
  ('academic.fall_rule_games', 'Football fall rule: games missed at the start of the next season', 'T5.3.1'), 'The 2011 article also describes a one-time exception for players who earn 27 hours before the next fall; not modelled here.')
for yr, pct, bylaw, lsu_q, duq_q, key in [
  (3, 40, 'third year', 'Prior to 5th semester- meet 40% completion of degree and maintain at least a 1.9 overall GPA', 'must have completed successfully at least 40 percent of the course requirements in the student\'s specific degree program', 'academic.progress_pct_year3'),
  (4, 60, 'fourth year', 'Prior to 7th semester- meet 60% completion of degree and maintain at least 2.0 overall GPA', 'must have completed successfully at least 60 percent of the course requirements', 'academic.progress_pct_year4'),
  (5, 80, 'fifth year', 'Prior to 9th semester- meet 80% completion of degree and maintain at least 2.0 overall GPA', 'must have completed successfully at least 80 percent of the course requirements', 'academic.progress_pct_year5')]:
    wq = {3: 'By Year 3 – 40% degree GPA 1.9 GPA', 4: 'By Year 4 – 60% degree GPA 2.0 GPA', 5: 'By Year 5 – 80% degree GPA 2.0 GPA'}[yr]
    lq = {3: 'shall have completed successfully at least 40 percent of the course requirements', 4: 'shall have completed successfully at least 60 percent of the course requirements', 5: 'shall have completed successfully at least 80 percent of the course requirements'}[yr]
    row(f'Degree progress: at least {pct} percent of the degree program completed before the {bylaw}.', pct, 'percent', Y,
      [W('lsu', 'Eligibility page', lsu_q, pct), W('wvu', 'Continuing eligibility', wq, pct), W('duq', 'Progress toward degree', duq_q, pct),
       W('lsdbi_109394', 'Bylaw 14.4.3.2 as summarised by the fetch tool', lq, pct)],
      (key, f'Degree progress required before year {yr}', 'T5.3.1'))
for yr, g, lsu_q, wq, duq_q, key in [
  (2, 1.8, 'Prior to 3rd semester- maintain at least a 1.8 overall GPA', 'By Year 2 – 24 credit hours GPA 1.8 GPA', 'must present a cumulative minimum grade-point average (based on a maximum 4.00) that equals at least 1.80', 'academic.gpa_year2'),
  (3, 1.9, 'Prior to 5th semester- meet 40% completion of degree and maintain at least a 1.9 overall GPA', 'By Year 3 – 40% degree GPA 1.9 GPA', 'must present a cumulative minimum grade-point average (based on a maximum of 4.00) that equals at least 1.90', 'academic.gpa_year3'),
  (4, 2.0, 'Prior to 7th semester- meet 60% completion of degree and maintain at least 2.0 overall GPA', 'By Year 4 – 60% degree GPA 2.0 GPA', 'must present a cumulative minimum grade-point average (based on a maximum of 4.00) that equals at least 2.00', 'academic.gpa_year4')]:
    row(f'Minimum cumulative grade point average {g} by year {yr}' + (' and after.' if yr == 4 else '.'), g, 'gpa', Y,
      [W('lsu', 'Eligibility page', lsu_q, g), W('wvu', 'Continuing eligibility', wq, g), W('duq', 'Progress toward degree', duq_q, g)],
      (key, f'Grade point average required by year {yr}' + (' and after' if yr == 4 else ''), 'T5.3.1'))
row('Academic Progress Rate: the highest team score is 1,000.', 1000, 'count', Y,
  [W('ncaa_apr', 'APR page', 'Individual points combine into a team score, with a maximum of 1,000 points.', 1000),
   W('wiki_apr', 'Article text', 'A perfect score is 1000.', 1000)],
  ('academic.team_rate_max', 'Team academic rate maximum', 'T5.3.1'))
row('A team whose multi-year Academic Progress Rate is below 930 may not play in the postseason.', 930, 'count', Y,
  [W('ncaa_apr', 'APR page', 'Teams must meet a minimum multi-year APR benchmark (currently 930) to be eligible for postseason competition.', 930),
   W('ncaa_apr23', 'NCAA news', 'The minimum score for each team to avoid penalties and to be eligible for postseason competition remains 930.', 930),
   W('espn_apr20', 'ESPN article', 'The standard to avoid penalties and play in the postseason is an overall four-year rate from 2015-16 through 2018-19 of 930', 930)],
  ('academic.team_rate_postseason_min', 'Multi-year team academic rate below which postseason play is barred', 'T5.3.1'))

# =================== transfers (T6.1.1, T6.2.1)
row('Players on teams still playing when the window opens (the two title-game teams) get a separate five-day window starting the day after their last game.', 5, 'days', Y,
  [W('espn_win', 'ESPN article', 'will get an additional five-day period from Jan. 20 to 24', 5),
   W('si_win', 'SI article', 'will be allowed a brief five-day opportunity to enter once their season concludes', 5),
   W('ap_win', 'AP article', 'Players on teams competing on or after Jan. 12 can notify during a consecutive-five-day period', 5)],
  ('transfer.postseason_extra_days', 'Days a postseason team\'s players may still enter after its last game', 'T6.1.1'), 'Sources differ on who qualifies (title-game teams per ESPN; teams playing on or after Jan. 12 per AP); the length, five days, is the same in all three.')
row('After a head coach change, the players\' window opens five days after the hire is announced.', 5, 'days', Y,
  [W('espn_win', 'ESPN article', 'starting five days after a new head coach is hired or announced', 5),
   W('si_win', 'SI article', 'will begin five days after the new coach is hired or publicly introduced', 5),
   W('on3_win', 'On3 article', 'starts five days after the coach is hired, provided that occurs between January 2 and June 30', 5)],
  ('transfer.coach_change_delay_days', 'Days after the hire before the coaching-change window opens', 'T6.1.1'))
row('After a head coach change, the players\' window is 15 days long (it was 30 before October 2025).', 15, 'days', Y,
  [W('espn_win', 'ESPN article', 'players will have a 15-day window to enter their names in the portal', 15),
   W('si_win', 'SI article', 'that timeframe will be 15 days', 15),
   W('ap_win', 'AP article', 'the head coach change exception for football will now be 15 days, starting five days after a new coach is hired', 15)],
  ('transfer.coach_change_window_days', 'Length of the coaching-change window', 'T6.1.1'))
row('There is no limit on the number of times a player may transfer (while he has eligibility); since April 2024 each transfer is immediately eligible.', 0, 'count', Y,
  [W('espnport', 'ESPN explainer', 'now allows players to transfer an unlimited number of times during their college career as long as they meet academic requirements.', 0),
   W('siport', 'SI explainer', 'multi-time transfers will be allowed immediate eligibility', 0),
   W('espn_faq', 'ESPN FAQ', 'Now that players are permitted unlimited transfers', 0)],
  ('transfer.max_free', 'Transfers allowed while eligibility remains; 0 means no limit', 'T6.1.1'), 'The ESPN explainer and the ESPN FAQ are one independence group; the SI page is the second. Academic standing is still required (bible T6.1.1).')
row('Entering the portal does not by itself end a player\'s aid: the school may not reduce or cancel it until the end of the regular academic term in which he gave written notice, and may then reduce or cancel it (the player may appeal).', False, None, Y,
  [W('lsu_tr', 'Cancellation or Reduction of Athletics Aid (Bylaw 15.3.5.1(f))', 'A student-athlete\'s financial aid may not be reduced or canceled until the end of the regular academic term in which written notification', False),
   W('ncsa', 'NCSA page', 'Once you initiate the process, your current scholarship may be protected through the applicable academic term', False)],
  ('transfer.aid_ends_on_entry', 'Whether entering the database ends aid at the end of the term', 'T6.2.1'), 'The key is read as: aid ends automatically at term end (false). Under the bylaw the school may cancel after the term, so the module should treat cancellation as the school\'s choice. The LSU page is undated (footer 2021) and quotes the 2022-23 bylaw; the NCAA manual itself was not reachable.')

# =================== pay (T7)
row('2025-26: $2.5 million of added scholarship cost counted toward the school\'s revenue-sharing cap.', 2500000, 'USD', '2025-26',
  [W('aol', 'Article text', 'The scholarship funding counted against the maximum amount of revenue.', 2500000)],
  ('pay.scholarship_credit_2025_26', 'Added scholarship cost counted toward the cap, 2025-26', 'T7.1.1'), 'One source. The $2.5 million figure comes from Ohio State\'s plan as the article describes it; SI gives $2.5 million as a Texas Tech figure for new non-revenue-sport scholarships and does not say it counted. Treat as provisional.')
row('2026-27: new scholarships do not count toward the revenue-sharing cap.', 0, 'USD', '2026-27',
  [W('aol', 'Article text', 'But the new scholarships do not apply toward the revenue sharing limits next year', 0)],
  ('pay.scholarship_credit_2026_27', 'Added scholarship cost counted toward the cap, 2026-27', 'T7.1.1'), 'One source (R18 flagged SI calling the change "proposed"). Provisional.')
row('School revenue-share agreements may run more than one year (multi-year agreements exist and need a stated term).', True, None, Y,
  [W('fred', 'Section "Term Length Matters"', 'A multi-year agreement may provide stability and certainty, but it may also limit flexibility', True)],
  ('pay.multi_year', 'Multi-year agreements allowed', 'T7.3.2'), 'One source. No page read states a maximum term (see the owed list in the PR).')
row('The SCORE Act\'s cap on agent fees has not become law (the bill was pulled from the House floor and has not passed).', False, None, Y,
  [W('ml_score', 'LawFlash', 'Republican leadership pulled HR 4312', False),
   W('hr4312', 'Congress.gov bill page', 'Reported in House', False),
   W('crs', 'CRS sidebar', 'recently advanced out of the House Education and Workforce', False)],
  ('pay.agent_fee_cap', 'Agent fee cap in force', 'T7.3.2'), 'As of the Morgan Lewis note of 2026-05-27; later floor action (R18 mentions Sept-Nov 2026 delays) was not re-read.')
row('If enacted, the SCORE Act would cap an agent\'s fee at 5 percent of an endorsement contract.', 5, 'percent', Y,
  [W('hr4312', 'Sec. 6(a)(8)(C), bill text as reported', 'to not more than 5 percent of such compensation', 5),
   W('ml_score', 'LawFlash', 'imposing agent fee caps of 5% of the total compensation of an NIL agreement', 5)],
  ('pay.agent_fee_cap_pct', 'Agent fee cap as a share of an endorsement contract', 'T7.3.2'))
row('College athletes are not classified as employees: the settlement leaves the question open and no law makes them employees.', 'not_employee', None, Y,
  [W('crs', 'CRS sidebar', 'Another contested issue not addressed in the House settlement is whether college athletes should be considered employees of their institutions.', 'not_employee'),
   W('willkie', 'Client alert', 'Labor issues, including the potential classification of student athletes as employees, remain unanswered but of significant importance.', 'not_employee'),
   W('ml_score', 'LawFlash', 'the act categorically prohibits student-athletes from being classified as employees', 'not_employee')],
  ('pay.employment_status', 'Whether players are employees', 'T7.3.2', ['not_employee', 'employee']), 'The sources say the status is unresolved and that the one bill that would settle it (SCORE, not passed) would bar employee status. The value is the status quo: no source classifies them as employees. Read as a default, not a ruling.')

# =================== draft (T8.5.1)
row('A player may enter the NFL draft early only when at least three years removed from high school graduation.', 3, 'years', Y,
  [W('nfl_special', 'NFL.com', 'have met the league\'s three-year eligibility rule', 3),
   W('ncaa_memo', 'FAQ 2, Entering the NFL Draft', 'NFL rules require you to be three years from high school graduation', 3),
   W('br_draft25', '2025 cycle article', 'must have been out of high school for at least three years', 3)],
  ('draft.min_years_from_high_school', 'Years since high school before a player may enter the draft', 'T8.5.1'))
row('The early-entry deadline for underclassmen is in January (January 14 in 2026).', 1, 'month', Y,
  [W('nfl_special', 'NFL.com', 'a traditional deadline of Jan. 14', 1),
   W('ncaa_memo', 'Key dates', 'Early-entry deadline for underclassmen not participating in the CFP Championship game: January 14, 2026.', 1)],
  ('draft.underclass_deadline_month', 'Month of the early-entry deadline', 'T8.5.1'), 'Fox Sports and AOL/USA Today say Jan. 5; NFL.com and the NCAA memo call Jan. 5 an early "soft" deadline for all-star game planning and Jan. 14 the deadline, so they are not entered here as disagreeing sources.')
row('The early-entry deadline day for underclassmen not in the title game was the 14th in 2026.', 14, 'day', '2026',
  [W('nfl_special', 'NFL.com', 'a traditional deadline of Jan. 14', 14),
   W('ncaa_memo', 'Key dates', 'Early-entry deadline for underclassmen not participating in the CFP Championship game: January 14, 2026.', 14)],
  ('draft.underclass_deadline_day', 'Day of the early-entry deadline', 'T8.5.1'), 'A 2026 date; the 2027 date (13 per the NFL calendar row F-league in league.json) is read by the calendar, not this key.')
row('The early-entry deadline day for underclassmen in the national title game was the 23rd in 2026.', 23, 'day', '2026',
  [W('nfl_special', 'NFL.com', 'For those players, a "Championship" deadline of Jan. 23 has been added.', 23),
   W('ncaa_memo', 'Key dates', 'Early-entry deadline for underclassmen participating in the CFP Championship game January 23, 2026', 23)],
  ('draft.underclass_deadline_title_game_day', 'Early-entry deadline day for players in the title game', 'T8.5.1'))
row('An early entrant keeps college eligibility only by declaring in writing within 72 hours of the declaration date that he will resume college play (and must not be drafted); otherwise the petition renounces all remaining eligibility. An early entrant who goes undrafted therefore cannot return after the draft.', False, None, Y,
  [W('ncaa_memo', 'FAQ 2, Entering the NFL Draft', 'provided you are not drafted by any team', False),
   W('ncaa_memo', 'FAQ 2, petition for special eligibility', 'renounces all remaining collegiate eligibility', False)],
  ('draft.undrafted_may_return', 'An undrafted early entrant may return to college', 'T8.5.1'), 'One source, and the memo\'s sentence is ambiguous: it allows return only for a player who is not drafted and who declares intent to return within 72 hours of the declaration date, and otherwise the renunciation stands. The reading "false after the draft" is an inference from that; the 72-hour withdrawal is the only return route the memo states.')
