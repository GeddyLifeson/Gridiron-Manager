"""Second G-10 pass (2026-11-26): rows for keys that module threads (G-12, G-14, G-15, G-16, G-28, WP-10) read.
Same rules as the first pass: every quote that has a local text copy is searched for; web quotes are as returned
by the cloud web fetch on 2026-11-26 and cannot be re-found by the lint. Status is computed, never typed."""
from core import *
from rows_cba import LG, CAP, cba
from rows_web import sec, W, N1, RS
from rows_more import COL
Y = '2026'
NC = 'Primary text read directly this session (CBA 2020).'

RB = '/mnt/project-files/nfl-rules/rulebook_2026.txt'
source('rb', '2026 NFL Rulebook (Football Operations, full text)', 'nfl-rulebook-2026', True, 'primary text', RB, 'rulebook_2026.txt')
def rb(where, quote, value=None): return S('rb', where, quote, value)

# ---- web sources read on 2026-11-26 (page text not saved locally)
for n, c, g, p in [
 ('nfl_em3', 'NFL.com, NFL emergency third-quarterback rule: Questions and answers (https://www.nfl.com/news/nfl-emergency-third-quarterback-rule-questions-and-answers)', 'nfl-league-office', True),
 ('nfl_dates27', 'NFL.com, 2026-27 National Football League important dates (https://www.nfl.com/news/2026-27-national-football-league-important-dates)', 'nfl-league-office', True),
 ('nfl_dates26', 'NFL.com, 2026 National Football League important dates (https://www.nfl.com/news/2026-national-football-league-important-dates)', 'nfl-league-office', True),
]:
    source(n, c, g, p, 'primary text')
for n, c, g in [
 ('cbs_em3', 'CBS Sports, Emergency third quarterback rule explained (2023-09-05, https://www.cbssports.com/nfl/news/emergency-third-quarterback-rule-explained-things-to-know-about-nfls-new-bylaw-for-roster-management-in-2023)', 'cbs'),
 ('steelersnow', 'Steelers Now, Steelers Protect Four Practice Squad Players (2021-09-07, https://steelersnow.com/steelers-protect-four-practice-squad-players)', 'steelersnow'),
 ('espn2010', 'ESPN NFL Nation, A review of practice squad rules (2010-09-04, https://www.espn.com/blog/nflnation/post/_/id/27027/a-review-of-practice-squad-rules)', 'espn'),
 ('sea_dates', 'Seahawks.com, NFL Announces Important Dates For 2026-2027 (2026-07-07, https://www.seahawks.com/news/nfl-announces-important-dates-for-2026-2027)', 'seahawks-mirror'),
 ('nbc_cut26', 'NBC Sports Bay Area, When is NFL roster cutdown day? 2026 (2026-08-26, https://www.nbcsportsbayarea.com/nfl/nfl-roster-cutdown-day-deadline-date-practice-squad-rules-2026/1958772/)', 'nbc-sports'),
 ('br_cut26', 'Bleacher Report, NFL Reportedly Changes Roster Cutdown Deadline Ahead of 2026 Season (2026-05-28, https://bleacherreport.com/articles/25431904-nfl-reportedly-changes-roster-cutdown-deadline-ahead-2026-season-new-date-revealed)', 'bleacher-report'),
 ('br_tdl26', 'Bleacher Report, NFL Trade Deadline 2026 Date, End Time (2026-11-08, https://bleacherreport.com/articles/25529935-nfl-trade-deadline-2026-date-end-time-hottest-rumors-predictions-and-more)', 'bleacher-report'),
 ('pp_tdl26', 'PrizePicks Playbook, When Is the NFL Trade Deadline 2026? (2026-11-10, https://www.prizepicks.com/playbook-article/when-is-the-nfl-trade-deadline-2026-date-time-trade-candidates)', 'prizepicks'),
 ('thescore_mdz', 'theScore, Raiders sign No. 1 pick Mendoza to 4-year, $57M rookie deal (2026-07, https://thescore.com/nfl/news/3569729)', 'thescore'),
 ('fansided_fr', 'FanSided, Every first-round signing bonus from the 2026 NFL Draft (2026-04-24, projected figures, https://fansided.com/nfl/every-first-round-signing-bonus-from-the-2026-nfl-draft)', 'fansided'),
 ('espn_mdz', 'ESPN, Raiders sign No. 1 pick Fernando Mendoza to rookie contract (2026-07-23, https://www.espn.com/nfl/story/_/id/49433918/raiders-sign-no-1-pick-fernando-mendoza-rookie-contract)', 'espn-news'),
]:
    source(n, c, g, False, 'secondary summary')
M = lambda n, where, q, v=None: S(n, where, q, v)
NW = N1

# ================= G-15 roster keys =================
LG.row('pro', 'Offseason, training camp and preseason roster limit: 90 players.', 90, 'count', Y,
  [cba('Article 27 Section 7(a) (Four-Year Qualifying Player)', 'on that Club’s 90-player roster', 90),
   M('br_cut26', 'cutdown article', 'Teams are allowed to have a maximum of 90 players on their roster during training camp and the preseason.', 90),
   M('nbc_cut26', 'cutdown article', 'Teams are allowed to carry 90 players in the offseason', 90)],
  key=('roster.offseason_limit', 'Offseason and camp roster limit', 'C5.1.1'), notes=NW + ' The CBA text names the 90-player roster but states the limit only in passing (it is the Club Roster Limit of the NFL Constitution).')
LG.row('pro', 'The game-day Active/Inactive list must be submitted by the 90-minute meeting (about 90 minutes before kickoff).', 90, 'min', Y,
  [M('nfl_em3', 'emergency QB Q&A', 'The player must be listed on the Gameday Administration Report that is submitted prior to or at the 90-minute meeting.', 90),
   M('cbs_em3', 'emergency QB explainer', 'that is turned in before or at the 90-minute meeting.', 90),
   M('si_ps', 'practice squad page', 'seven must be declared inactive approximately 90 minutes before kickoff.', 90)],
  key=('roster.inactives_due_minutes_before_kickoff', 'Inactive list locks this long before kickoff', 'C5.2.1'), notes=NW + ' The league page says "the 90-minute meeting"; only the SI line says "before kickoff" in so many words.')
LG.row('pro', 'To name an emergency third quarterback a club must have two bona fide quarterbacks on its game-day active list.', 2, 'count', Y,
  [M('nfl_em3', 'emergency QB Q&A', 'A club must have two bona fide quarterbacks on its 47/48-player gameday active list', 2),
   M('cbs_em3', 'emergency QB explainer', 'A club must have two bona fide quarterbacks on its 47/48-player gameday active list to have an emergency third quarterback.', 2)],
  key=('roster.emergency_qb_active_qbs', 'Quarterbacks the club must have active to name an emergency third quarterback', 'C5.2.2'), notes=NW)
LG.row('pro', 'The emergency third quarterback must be on the 53-player roster; he cannot be an elevated practice squad player.', False, None, Y,
  [M('nfl_em3', 'emergency QB Q&A', 'The Emergency Third Quarterback must be on the club\'s 53-player roster; the player cannot be an elevated Practice Squad player.', False),
   M('cbs_em3', 'emergency QB explainer', 'The emergency third quarterback must be on the team\'s 53-player roster; the player cannot be an elevated practice squad player.', False)],
  key=('roster.emergency_qb_from_practice_squad', 'A practice squad quarterback may be elevated as the emergency third quarterback', 'C5.2.2'),
  notes=NW + ' CONFLICT WITH THE BIBLE DEFAULT (C5.2.2 rule 1 says true): both pages say the player must be on the 53-player roster and cannot be an elevated practice squad player, so a practice squad quarterback is not eligible. Bible fix owed to the integrator.')
LG.row('pro', 'Practice squad group A: players with at most one accrued season.', 1, 'seasons', Y,
  [cba('Article 33 Section 4 (i)-(ii)', 'fewer than nine regular season games during their only Accrued Season(s)', 1)],
  key=('roster.practice_squad_group_a_max_accrued', 'Group A: at most this many accrued seasons', 'C5.3.1'), notes=NC + ' Category (i) has no accrued season; category (ii) has one ("their only Accrued Season").')
LG.row('pro', 'Group A with one accrued season: fewer than nine regular-season games on a game-day active list in it.', 9, 'games', Y,
  [cba('Article 33 Section 4 (ii)', 'fewer than nine regular season games during their only Accrued Season(s)', 9),
   M('espn2010', 'practice squad review', 'Free agents who were on an active roster for fewer than nine regular-season games during their accrued seasons.', 9)],
  key=('roster.practice_squad_group_a_active_games_below', 'Group A with one accrued season: fewer than this many active games', 'C5.3.1'), notes=NW + ' ESPN page is from 2010 and is historical wording of the same test.')
LG.row('pro', 'Practice squad group B: players with no more than two accrued seasons.', 2, 'seasons', Y,
  [cba('Article 33 Section 4 (iii)', 'who have earned no more than two Accrued Seasons', 2),
   M('nfp_ps', 'quoted in research/g15-practice-squad-eligibility.md', 'Up to 10 players may have no more than two accrued seasons.', 2)],
  key=('roster.practice_squad_group_b_max_accrued', 'Group B: at most this many accrued seasons', 'C5.3.1'), notes=NW)

LG.row('pro', 'A practice squad player may not sign with his club\'s next opponent later than 4 p.m. New York time on the sixth day before the game.', 6, 'days', Y,
  [cba('Article 33 Section 2(b)', 'may not sign an NFL Player Contract with his Club’s next opponent later than 4:00pm, New York time, on the sixth day preceding the game', 6)],
  key=('roster.practice_squad_next_opponent_days', 'Days before a game after which a practice squad player may not sign with the next opponent', 'C5.3.3'),
  notes=NC + ' Bye weeks make it ten days (same section). Appendix J paragraph 10 repeats the rule (no second source group).')
LG.row('pro', 'Practice squad protection: a club may protect four players per week from other clubs signing them.', 4, 'count', Y,
  [M('steelersnow', 'protected-players article', 'the maximum of four protected players per week', 4)],
  key=('roster.practice_squad_protections_per_week', 'Practice squad players a club may protect per week', 'C5.3.3'),
  notes=NW + ' Single club-site article from 2021; the CBA text has no protection clause and no league page was found in this pass. The days of protection are not stated in any page read.')
LG.row('pro', 'Waiver status turns on four credited seasons (pension credit), not accrued seasons.', 'pension_credited', None, Y,
  [cba('Article 29 Section 1(a)', 'a player who has finished the season in which his fourth year of credited service has been earned under the Bert Bell/Pete Rozelle Plan', 'pension_credited')],
  key=('waivers.vested_measure', 'Which seasons count toward vested status for waivers', 'C5.5.1', ['pension_credited', 'accrued']),
  notes=NC + ' RESOLVES the earlier Conflict: the CBA waiver article counts "years of credited service" under the pension plan. The AP explainer\'s "accrued" wording is a summary.')
LG.row('pro', 'Eligible pass receivers and a T-formation quarterback must wear 0-49 or 80-89: the lower band tops out at 49.', 49, 'index', Y,
  [rb('Rule 5 Section 1 Article 2', 'Eligible pass receivers and a T-formation quarterback must be wearing numerals 0-49 or 80-89.', 49)],
  key=('numbering.eligible_low_max', 'Top of the lower band of eligible jersey numbers (band starts at 0)', 'B2.3.2'), notes='2026 rulebook read directly; one source group.')
LG.row('pro', 'Upper band of eligible jersey numbers starts at 80.', 80, 'index', Y,
  [rb('Rule 5 Section 1 Article 2', 'Eligible pass receivers and a T-formation quarterback must be wearing numerals 0-49 or 80-89.', 80)],
  key=('numbering.eligible_high_min', 'Bottom of the upper band of eligible jersey numbers', 'B2.3.2'), notes='2026 rulebook read directly; one source group.')
LG.row('pro', 'Upper band of eligible jersey numbers ends at 89.', 89, 'index', Y,
  [rb('Rule 5 Section 1 Article 2', 'Eligible pass receivers and a T-formation quarterback must be wearing numerals 0-49 or 80-89.', 89)],
  key=('numbering.eligible_high_max', 'Top of the upper band of eligible jersey numbers', 'B2.3.2'), notes='2026 rulebook read directly; one source group.')
LG.row('pro', 'A T-formation quarterback is a player aligned one yard or less behind the snapper.', 1, 'yd', Y,
  [rb('Rule 2 Section 42', 'A T-formation quarterback is defined as a player aligned one yard or less behind the snapper.', 1)],
  key=('formation.t_quarterback_depth_yd', 'A player this close or closer behind the snapper is the T-formation quarterback', 'B4.1.2'), notes='2026 rulebook read directly; one source group.')
LG.row('pro', 'Only one player may be neither clearly on nor clearly off the line when directly behind the snapper.', 1, 'count', Y,
  [rb('Rule 7 Section 5 Article 1(d)', 'Only one player may be in such a position, and he must wear an eligible number', 1)],
  key=('formation.neither_behind_snapper_max', 'Players allowed neither on nor off the line when directly behind the snapper', 'B4.2.2'), notes='2026 rulebook read directly; one source group.')

# ---- work rules (C11.1.1 / G-12 work-rule checker)
LG.row('pro', 'Preseason training camp: no more than sixteen padded practices.', 16, 'count', Y,
  [cba('Article 23 Section 5', 'no Club may hold more than a total of sixteen', 16)],
  key=('work.camp_padded_practices_max', 'Padded practices allowed in camp', 'C11.2.2'), notes=NC)
LG.row('pro', 'Camp padded practices may not run more than three calendar days in a row.', 3, 'days', Y,
  [cba('Article 23 Section 5', 'Padded practices may not be held on more than three consecutive calendar days', 3)],
  key=('work.camp_padded_streak_days', 'Longest run of consecutive padded-practice days in camp', 'C11.2.2'), notes=NC)
LG.row('pro', 'Regular season: padded practices limited to fourteen in all.', 14, 'count', Y,
  [cba('Article 24 Section 1(a)', 'padded practices for all players shall be limited to a total of fourteen', 14)],
  key=('work.season_padded_practices_max', 'Padded practices allowed in the regular season', 'C11.2.3'), notes=NC)
LG.row('pro', 'Eleven of the fourteen regular season padded practices must be in the first eleven weeks.', 11, 'count', Y,
  [cba('Article 24 Section 1(a)', 'eleven of which must be held during the first eleven weeks of the regular season', 11)],
  key=('work.season_padded_first_weeks', 'Season padded practices that must fall in the first eleven weeks', 'C11.2.3'), notes=NC)
LG.row('pro', 'Preseason camp: players get at least six days off.', 6, 'days', Y,
  [cba('Article 35 Section 1(a)', 'all players will be permitted at least six days off', 6)],
  key=('work.camp_days_off_min', 'Days off in preseason training camp', 'C11.2.2'), notes=NC)
LG.row('pro', 'Regular season: players get at least one day off each calendar week.', 1, 'days', Y,
  [cba('Article 35 Section 2', 'all players will be permitted at least one day off each calendar week', 1)],
  key=('work.season_day_off_per_week', 'Days off per calendar week in season', 'C11.2.3'), notes=NC)

# ---- 2026 dated facts (anchors; no keys)
D = lambda n, where, q, v: M(n, where, q, v)
LG.row('pro', '2026 trade deadline: Tuesday November 10, 2026, 4:00 p.m. New York time (after Week 9).', '2026-11-10', 'date', Y,
  [D('nfl_dates27', 'November 10 entry', 'All trading ends for 2026 at 4:00 p.m., New York time.', '2026-11-10'),
   D('br_tdl26', 'trade deadline article', 'The 2026 NFL trade deadline will arrive at 4 p.m. ET on Tuesday, November 10.', '2026-11-10'),
   D('pp_tdl26', 'trade deadline article', 'The 2026 NFL trade deadline is Tuesday, Nov. 10, at 4 p.m. ET', '2026-11-10')],
  key=None, notes=NW + ' Anchor id trade_deadline in the pro 2026 calendar file. The league page lists the sentence under the November 10 heading.')
LG.row('pro', '2026 roster cutdown to 53: Sunday August 30, 2026, 6:00 p.m. New York time.', '2026-08-30', 'date', Y,
  [D('nfl_dates27', 'cutdown entry', 'Prior to 6:00 p.m., New York time, clubs must reduce rosters to a maximum of 53 players on the Active/Inactive List.', '2026-08-30'),
   D('sea_dates', 'important dates mirror', 'the deadline to reduce the roster from 90 to 53 players is 3 p.m. PT on Sunday, August 30', '2026-08-30'),
   D('br_cut26', 'cutdown article', 'this year\'s date has been bumped earlier by 46 hours to Sunday, Aug. 30 at 6 p.m. ET.', '2026-08-30'),
   D('nbc_cut26', 'cutdown article', 'By 6 p.m. ET on Sunday, rosters must be in compliance with regular season rules.', '2026-08-30')],
  key=None, notes=NW + ' Earlier years used 4 p.m. ET on the Tuesday before Labor Day weekend (Bleacher Report); 2026 moved it. The league page text carries the date under its own heading; the headings are not in the quote.')
LG.row('pro', '2026 NFL Scouting Combine: February 23 to March 2, 2026, Indianapolis.', '2026-02-23', 'date', Y,
  [D('nfl_dates26', 'calendar entry', 'February 23 - March 2: NFL Scouting Combine, Lucas Oil Stadium, Indianapolis, Indiana.', '2026-02-23')],
  key=None, notes=NW + ' Close date 2026-03-02. One source group.')
LG.row('pro', '2026 East-West Shrine Bowl: January 27, 2026 (Frisco, Texas).', '2026-01-27', 'date', Y,
  [D('nfl_dates26', 'calendar entry', 'January 27: East-West Shrine Bowl, Ford Center at The Star, Frisco, Texas.', '2026-01-27')], key=None, notes=NW + ' One source group; no Senior Bowl cross-check read.')
LG.row('pro', '2026 Senior Bowl: January 31, 2026 (Mobile, Alabama).', '2026-01-31', 'date', Y,
  [D('nfl_dates26', 'calendar entry', 'January 31: Senior Bowl, Hancock Whitney Stadium, Mobile, Alabama.', '2026-01-31')], key=None, notes=NW + ' One source group.')
LG.row('pro', '2026 underclassman special-eligibility application deadline: January 14, 2026.', '2026-01-14', 'date', Y,
  [D('nfl_dates26', 'calendar entry', 'January 14: Deadline for college players who are underclassmen to apply for Special Eligibility.', '2026-01-14')], key=None, notes=NW + ' The page says "apply for Special Eligibility", the declaration. One source group. Anchor underclass_declaration_deadline.')
LG.row('pro', '2027 underclassman special-eligibility deadline: January 13, 2027 (tentative); early deadline January 6 (tentative).', '2027-01-13', 'date', '2027',
  [D('nfl_dates27', 'calendar entry', 'Deadline for college players who are underclassmen to apply for Special Eligibility.', '2027-01-13')], key=None,
  notes=NW + ' Marked tentative on the league page; January 6 (tentative) is the early deadline. The Seahawks.com copy mirrors the league page and is not an independent group.')
LG.row('pro', '2027 NFL Scouting Combine: March 1 to 8, 2027, Indianapolis.', '2027-03-01', 'date', '2027',
  [D('nfl_dates27', 'calendar entry', 'March 1-8 - NFL Scouting Combine presented by Microsoft Copilot at Lucas Oil Stadium (Indianapolis, Indiana)', '2027-03-01')], key=None, notes=NW + ' Mirrored by Seahawks.com (same group effectively).')
LG.row('pro', '2027 NFL Draft: April 29 to May 1, 2027, Washington, D.C.; 2027 league year starts March 11, 2027, 4 p.m. New York time.', '2027-04-29', 'date', '2027',
  [D('nfl_dates27', 'calendar entry', 'April 29-May 1 - NFL Draft presented by Bud Light (Washington, D.C.)', '2027-04-29')], key=None, notes=NW + ' League year start: the same page says the 2027 League Year and free agency signing period begin at 4:00 p.m. on March 11.')

# ---- first-pick bonus (cap)
CAP.row('pro', '2026 first overall pick (Fernando Mendoza, Raiders): signing bonus $38.1 million of a four-year $57.27 million fully guaranteed deal.', 38100000, 'USD', Y,
  [M('thescore_mdz', 'contract article', 'It also includes a $38.1-million signing bonus, according to Spotrac.', 38100000),
   M('fansided_fr', 'first-round table, pick 1', '$38.1 million', 38100000),
   M('espn_mdz', 'signing report', 'Mendoza signed a four-year, $57.27 million fully guaranteed deal with a fifth-year option.', None)],
  key=('rookie.first_pick_signing_bonus_2026', 'Signing bonus of the 2026 first overall pick', 'C6.4.2'),
  notes=NW + ' The signing bonus comes from Spotrac via theScore and a pre-signing FanSided projection that agrees; ESPN gives the total only. Slot values for other picks (FanSided/SI, April projections): pick 2 $36.2M, pick 3 $35M, pick 32 $8.7M signing bonus; no slot value is stated in any page, so only the first pick is entered.')

# ---- cross-checks and corrections on earlier rows
def note_add(key, text):
    for r in LG.rows:
        if r.get('_key') and r['_key'][0] == key:
            r['notes'] = (r.get('notes') or '') + text; return
    raise SystemExit('no row ' + key)
source('espn2025', 'ESPN, What are NFL practice squads? Eligibility, salary, rules to know (2025-08-26, https://www.espn.ph/nfl/story/_/id/46078884/what-nfl-practice-squads-eligibility-salary-rules-know)', 'espn-news', False, 'secondary summary')
source('wiki_ps', 'Wikipedia, Practice squad (https://en.wikipedia.org/wiki/Practice_squad)', 'wikipedia', False, 'secondary summary')
source('nfl_tb', 'NFL.com, NFL Tiebreaking Procedures (https://www.nfl.com/standings/tie-breaking-procedures)', 'nfl-league-office', True, 'primary text')
source('fox_tb', 'FOX Sports, NFL Tiebreakers: Playoff and wild-card rules (updated 2025-08-20, https://www.foxsports.com/stories/nfl/nfl-playoff-tiebreaking-procedures)', 'fox', False, 'secondary summary')
source('wiki_po', 'Wikipedia, NFL playoffs (https://en.wikipedia.org/wiki/NFL_playoffs)', 'wikipedia', False, 'secondary summary')
LG.add('roster.practice_squad_protections_per_week', M('espn2025', 'rules section', 'Every Tuesday, teams can designate four players as protected', 4))
note_add('roster.practice_squad_protections_per_week', ' CONTRADICTION: Wikipedia (Practice squad) says "Practice squad protections ended after the 2021 season." ESPN 2025 says protections are designated every Tuesday. Not resolved; no league page found.')
note_add('roster.elevations_max_per_player_season', ' CONFLICT: the row value 3 follows SI and NFL.com (2022 change); the 2020 CBA text (Article 33 Section 5(f): "a maximum combination of two regular season or postseason games in the same League Year") and ESPN 2025 ("Teams can\'t activate a player more than twice") say 2. Needs a decision before the value is relied on.')
LG.row('pro', 'Per the CBA text, a practice squad player\'s elevations are limited to two games in the regular season AND postseason combined, so postseason elevations are not unlimited.', False, None, Y,
  [cba('Article 33 Section 5(f)', 'a maximum combination of two regular season or postseason games in the same League Year', False)],
  key=('roster.elevations_postseason_unlimited', 'No per-player elevation limit in the postseason', 'C5.3.2'),
  notes=NC + ' CONFLICT WITH THE BIBLE (C5.3.2 says unlimited, Verified): the 2020 CBA text read this session counts postseason games inside the same two-game cap. No page read this session states a postseason exemption. A May 2022 amendment (three elevations per season, NFL.com/CBS) is described by sources as a regular-season change; the postseason treatment after it was not found. Bible fix owed.')

# ---- G-14 pro standings and playoff values
LG.row('pro', 'A tie counts as half a win and half a loss for both clubs.', 0.5, 'ratio', Y,
  [M('nfl_tb', 'tie-breaking page note', 'Tie games count as one-half win and one-half loss for both clubs.', 0.5),
   M('fox_tb', 'tiebreakers page', 'Tie games count as one-half win and one-half loss for both clubs.', 0.5)],
  key=('standings.tie_win_value', 'Share of a win a tied game counts as in winning percentage', 'C3.1.1'), notes=NW)
LG.row('pro', 'Wild-card common-games tiebreaker needs at least four common games.', 4, 'count', Y,
  [M('nfl_tb', 'wild-card procedure', 'Best won-lost-tied percentage in common games, minimum of four.', 4),
   M('fox_tb', 'wild-card procedure', 'Best won-lost-tied percentage in common games, minimum of four.', 4)],
  key=('tiebreak.common_games_min', 'Fewest common games for the common-games step', 'C3.2.2'), notes=NW + ' The division tiebreaker lists common games with no minimum.')
LG.row('pro', 'When a step removes clubs and three remain tied, the division tiebreaker restarts at step 1 of the three-club list and the wild-card list at step 2.', 'restart_on_three', None, Y,
  [M('nfl_tb', 'multi-club procedures', 'tiebreaker restarts at Step 1 of three-club format', 'restart_on_three')],
  key=('tiebreak.restarts', 'What happens when a step removes clubs and leaves three tied', 'C3.2.3', ['restart_on_three', 'continue_on_three']),
  notes=NW + ' The page also says "tiebreaker restarts at Step 2 of three-club format" for wild cards; two remaining clubs return to step 1 of the two-club list (NFL.com, operations.nfl.com and FOX).')
LG.row('pro', 'The playoffs take seven clubs from each of the two conferences.', 7, 'count', Y,
  [M('wiki_po', 'format section', 'seven teams from each of the league\'s two conferences qualify for the playoffs', 7)],
  key=('playoff.field_size', 'Playoff clubs per bracket group', 'C3.3.1'), notes=NW)
LG.row('pro', 'The brackets are per conference.', 'conference', None, Y,
  [M('wiki_po', 'format section', 'seven teams from each of the league\'s two conferences qualify for the playoffs', 'conference')],
  key=('playoff.grouping', 'Whether the bracket is per conference or national', 'C3.3.1', ['conference', 'national']), notes=NW)
LG.row('pro', 'Only the top seed in each conference gets a first-round bye.', 1, 'count', Y,
  [M('wiki_po', 'format section', 'The top team in each conference receives a first-round bye, automatically advancing to the next round.', 1)],
  key=('playoff.byes', 'First-round byes per bracket group', 'C3.3.1'), notes=NW)
LG.row('pro', 'The playoffs reseed each round; there is no fixed bracket.', True, None, Y,
  [M('wiki_po', 'format section', 'The NFL does not use a fixed bracket system.', True)],
  key=('playoff.reseed', 'Playoffs reseed after each round', 'C3.3.1'), notes=NW)
LG.row('pro', 'Three rounds are played at the higher seed\'s home (wild card, divisional, conference championship).', 3, 'count', Y,
  [M('wiki_po', 'format section', 'hosted by the higher-seeded team', 3)],
  key=('playoff.campus_rounds', 'Rounds hosted by the higher seed', 'C3.3.1'), notes=NW + ' Count is read from the three round descriptions (wild card, divisional, conference championship); the quote is the conference championship line.')

# ---- G-28 compliance penalty amounts that a primary text states (work-rule class, CBA Article 21 Section 8(d))
CB = 'Base amounts of the 2020 League Year; Section 8(d)(iii) raises them each year by the change in Projected AR, at most 10 percent a year, so the 2026 amount is higher and is not published in the CBA text. Commissioner may fine less or nothing (good-faith interpretation or immaterial violation).'
def wr(field, unit, text, val, quote, kind='fine'):
    LG.row('pro', text, val, unit, Y, [cba('Article 21 Section 8(d)', quote, val)],
      key=('compliance.work_rules_practice.' + field, 'Offseason-program violation penalty: ' + field.replace('_', ' '), 'C11.2.4'), notes=NC + ' ' + CB)
wr('fine_head_coach_first_cents', 'cents', 'Offseason workout violation: head coach fined $100,000 for a first violation.', 10000000, 'the head coach shall be subject to a fine in the amount of $100,000 for the first violation')
wr('fine_head_coach_repeat_cents', 'cents', 'Offseason workout violation: head coach fined $250,000 for a second violation.', 25000000, 'and $250,000 for a second violation')
wr('club_fine_first_cents', 'cents', 'Offseason workout violation: club fined $250,000 for a first violation.', 25000000, 'the Club shall be subject to a fine in the amount of $250,000 for the first violation')
wr('club_fine_repeat_cents', 'cents', 'Offseason workout violation: club fined $500,000 for a second violation.', 50000000, 'and $500,000 for a second violation')
LG.row('pro', 'Offseason workout violation: the club\'s next scheduled week of OTAs is cancelled.', 'ota_week', None, Y,
  [cba('Article 21 Section 8(d)(ii)', 'the Club’s next scheduled week of OTAs shall be cancelled, excluding minicamps', 'ota_week')],
  key=('compliance.work_rules_practice.practice_cancel', 'Practice taken from the club on a finding', 'C11.2.4', ['none', 'ota_week', 'padded_practice']), notes=NC)
LG.row('pro', 'Two separate violations in one league year: the club also forfeits a fourth-round pick.', 4, 'round', Y,
  [cba('Article 21 Section 8(d)(ii)', 'the Commissioner shall cause the Club to forfeit a fourth-round draft selection', 4)],
  key=('compliance.work_rules_practice.pick_round_repeat', 'Draft round forfeited on a repeat finding', 'C11.2.4'), notes=NC)

# ---- college
source('lsdbi_17', 'NCAA LSDBi proposal 108635 (Bylaw 17, House implementation; Adopted Final 2025-06-06, effective 2025-07-01, https://web3.ncaa.org/lsdbi/search/proposalView?id=108635)', 'ncaa', True, 'primary text')
source('on3_105', 'On3, NCAA expected to approve increased scholarships across multiple sports, 105 roster limit for football (https://www.on3.com/news/ncaa-approves-new-roster-size-limits-paving-way-for-additional-scholarships)', 'on3', False, 'secondary summary')
COL.row('college', 'Football preseason practice: at most 110 student-athletes may practice before the first day of classes or the seventh day before the first contest, whichever is earlier.', 110, 'count', Y,
  [M('lsdbi_17', 'Bylaw 17.11.3.1.2 (Football)', 'There is limit of 110 student-athletes who may engage in practice activities prior to the institution\'s first day of classes', 110)],
  key=('league.preseason_roster_limit', 'Camp participant limit before the declaration date', 'T5.1.1'),
  notes=N1 + ' This is a practice-participant limit, not a roster cap; the 105 roster limit is in the same proposal\'s Bylaw 17.2 table and is also carried by On3. One primary source.')
COL.add('league.roster_limit', M('lsdbi_17', 'Bylaw 17.2 table', 'Football | 105', 105))
COL.add('league.roster_limit', M('on3_105', 'roster article', 'Football will have a roster limit of 105, up from the 85-man NCAA scholarship limit that currently exists.', 105))

# ---- college postseason (G-14), 2026 rule set
for n, c, g in [
 ('si_cfp26', 'Sports Illustrated, New Pac-12, Group of Six will have harder road to College Football Playoff in 2026 (2026-01-23, https://www.si.com/college/boise-state/football/new-pac-12-group-of-six-will-have-harder-road-to-college-football-playoff-in-2026)', 'si'),
 ('fox_cfp26', 'FOX Sports/AP, College Football Playoff Stays at 12 Teams; How Does it Impact Notre Dame? (2026-01-23, https://www.foxsports.com/stories/college-football/college-football-playoff-stays-12-teams-how-does-impact-notre-dame)', 'fox-ap'),
 ('aol_cfp26', 'USA Today via AOL, CFP makes previously unknown change with 12-team Group of 6 bids (2026-01, https://www.aol.com/articles/cfp-makes-previously-unknown-change-160422050.html)', 'usatoday'),
 ('espn_cfp27', 'ESPN via ABC7, CFP 24-team format: What you need to know about the new playoff (Heather Dinich, 2026-11-09, https://abc7.com/post/cfp-24-team-format-what-need-know-new-playoff/20027109/)', 'espn-news'),
 ('fbs_cfp27', 'FBSchedules, College Football Playoff officially expanding to 24 teams in 2027 (2026-11-09, https://fbschedules.com/college-football-playoff-officially-expanding-to-24-teams-in-2027/)', 'fbschedules'),
 ('wiki_bowl', 'Wikipedia, Bowl eligibility (rules text dated 2018-19; https://en.wikipedia.org/wiki/Bowl_eligibility)', 'wikipedia'),
 ('ap_bowl23', 'AP via CBS Minnesota, FBS newcomers James Madison and Jacksonville State along with 5-7 Minnesota get last 3 bowl slots (2023-11-26, https://www.cbsnews.com/amp/minnesota/news/fbs-newcomers-james-madison-and-jacksonville-state-along-with-5-7-minnesota-get-last-3-bowl-slots)', 'ap'),
]:
    source(n, c, g, False, 'secondary summary')
CL = 'college'
COL.row(CL, 'The 2026 College Football Playoff stays a 12-team field.', 12, 'count', '2026',
  [M('si_cfp26', 'CFP 2026 article', 'the CFP will remain a 12-team field in 2026', 12)], key=('playoff.field_size', 'Playoff clubs per bracket group', 'T3.5.1'), notes=N1 + ' 2027 is 24 (rows below, keyless; a college_2027 rule set is needed).')
COL.row(CL, 'The playoff bracket is national, not per conference.', 'national', None, '2026',
  [M('si_cfp26', 'CFP 2026 article', 'the CFP will remain a 12-team field in 2026', 'national')], key=('playoff.grouping', 'Whether the bracket is per conference or national', 'T3.5.1', ['conference', 'national']), notes=N1 + ' Derived: a single 12-team field.')
COL.row(CL, 'The four highest-seeded teams get byes: the opening round features seeds 5 through 12, on campus.', 4, 'count', '2026',
  [M('fox_cfp26', 'CFP 2026 article', 'The opening round of games, featuring the fifth through 12th seeds, will be played on campus', 4)], key=('playoff.byes', 'First-round byes per bracket group', 'T3.5.1'), notes=N1 + ' Bye count implied (seeds 1-4), not stated.')
COL.row(CL, 'Only the opening round is on campus; the final three rounds go to bowl sites.', 1, 'count', '2026',
  [M('fox_cfp26', 'CFP 2026 article', 'with the final three rounds going to traditional bowl sites', 1)], key=('playoff.campus_rounds', 'Rounds hosted by the higher seed', 'T3.5.1'), notes=N1)
COL.row(CL, 'Winners of the Big Ten, SEC, ACC and Big 12 are guaranteed playoff spots.', True, None, '2026',
  [M('si_cfp26', 'CFP 2026 article', 'automatic bids guaranteed to the winners of the Big Ten, SEC, ACC and Big 12', True),
   M('fox_cfp26', 'CFP 2026 article', 'holding automatic spots to the champions of the Power Four conferences', True)], key=('cfp.power_champions_auto', 'Power conference champions get automatic bids', 'T3.5.1'), notes=N1)
COL.row(CL, 'One more automatic bid goes to the highest-ranked Group of Six / non-Power-Four team.', 1, 'count', '2026',
  [M('si_cfp26', 'CFP 2026 article', 'the highest-rated Group of Six — now including the new Pac-12 — conference champion', 1),
   M('aol_cfp26', 'CFP 2026 article', 'will rather go to the highest-ranked non-Power Four program', 1)], key=('cfp.other_auto_bids', 'Automatic bids for the best team outside the power conferences', 'T3.5.1'),
  notes=N1 + ' The two pages disagree on whether that team must be a conference champion (SI: champion; USA Today: "no longer has to be a conference champion"); the count of one bid agrees.')
COL.row(CL, 'Notre Dame (independent) is guaranteed a spot with a top-12 final ranking.', 12, 'rank', '2026',
  [M('si_cfp26', 'CFP 2026 article', 'Notre Dame will also be guaranteed a playoff spot with a top-12 finish in the final CFP rankings.', 12),
   M('aol_cfp26', 'CFP 2026 article', 'granting Notre Dame a spot if it is anywhere in the top 12', 12)], key=('cfp.independent_auto_rank', 'Independent automatic bid rank', 'T3.5.1'), notes=N1)
COL.row(CL, 'Bowl eligibility: at least as many wins as losses (six wins in a 12-game season).', 6, 'wins', '2026',
  [M('wiki_bowl', 'rules section (2018-19 text)', 'The team must have at least as many wins as overall losses.', 6),
   M('ap_bowl23', '2023 season report', 'only 79 teams achieved the six wins necessary for bowl eligibility', 6)], key=('bowl.eligibility_wins', 'Wins for bowl eligibility', 'T3.5.2'), notes=N1)
COL.row(CL, 'At most one win over a lower-division (FCS) team counts toward bowl eligibility.', 1, 'wins', '2026',
  [M('wiki_bowl', 'rules section (2018-19 text)', 'No more than one win against a Football Championship Subdivision(FCS) team may count.', 1)], key=('bowl.lower_division_wins_counted', 'Lower-division wins counted for bowl eligibility', 'T3.5.2'),
  notes=N1 + ' The same page also carries a scholarship test the page does not reconcile; wording is from a 2018-19 text.')
COL.row(CL, 'When spots go unfilled, teams with five wins (5-7) may fill them.', 5, 'wins', '2026',
  [M('wiki_bowl', 'rules section (2018-19 text)', 'Teams with at least 5 wins and no more than 7 losses', 5),
   M('ap_bowl23', '2023 season report', 'NCAA rules allow five-win teams to fill spots', 5)], key=('bowl.fill_min_wins', 'Fewest wins for a team that fills an open bowl spot', 'T3.5.2'), notes=N1)
# 2027 (keyless: no college_2027 rule set yet)
COL.row(CL, '2027 playoff field: 24 teams (four conference champions, the best Group of Six team and 19 at-large).', 24, 'count', '2027',
  [M('espn_cfp27', 'format article', 'will consist of the Power 4 conference champions -- ACC, Big 12, Big Ten, SEC -- plus the highest-ranked Group of 6 team and 19 at-large selections', 24),
   M('fbs_cfp27', 'format article', '19 at-large selections, the four champions of the Autonomy Four (A4) conferences', 24)], key=None, notes=N1 + ' A top-25 pool for at-large teams is not stated by either page (the committee ranking could extend beyond 25).')
COL.row(CL, '2027 playoff: seeds 1-8 get a bye and a home game; seeds 9-16 host 17-24 on campus.', 8, 'count', '2027',
  [M('espn_cfp27', 'format article', 'Teams seeded Nos. 1-8 earn a first-round bye followed by a home game.', 8)], key=None, notes=N1 + ' Reseeding is not stated.')
COL.row(CL, '2027: lower-division wins get ranking credit for only one FCS win per season.', 1, 'wins', '2027',
  [M('espn_cfp27', 'format article', 'won\'t give any weight to a win over more than one FCS opponent per season', 1),
   M('fbs_cfp27', 'format article', 'Schools that schedule multiple FCS programs will receive selection credit for only one such win.', 1)], key=None, notes=N1)
COL.row(CL, '2027: schools are expected to play at least ten qualifying regular-season games.', 10, 'games', '2027',
  [M('espn_cfp27', 'format article', 'Each Power 4 school will be expected to play at least 10 qualifying regular-season games.', 10),
   M('fbs_cfp27', 'format article', 'G6 institutions will likewise be required to play at least 10 qualifying regular-season games.', 10)], key=None, notes=N1)

# ---- compensatory draft system (CBA Appendix V), read by G-34
AV = 'Appendix V'
def comp(key, meaning, text, val, unit, where, quote):
    LG.row('pro', text, val, unit, Y, [cba(AV + ' ' + where, quote, val)], key=('league_rules.draft.' + key, meaning, 'C7.2.1'), notes=NC + ' One source group; the NFL.com compensatory-picks pages could be added as a second.')
comp('comp_first_round', 'Round of the earliest compensatory pick (top bracket)', 'The top compensatory bracket (a CFA in the top 5%) gets a pick after the last selection of round 3.', 3, 'round', 'Paragraph 3(b)(1)', 'following the last selection in the third round of the College Draft')
comp('comp_cfa_top_pct', 'A compensatory free agent ranks within this top percent', 'A compensatory free agent must rank within the top 35% of all league players.', 35, 'percent', 'Paragraph 1(ii)', 'ranked within the top 35% of all League players')
for r, pct, ord_ in [(3, 5, 'third'), (4, 10, 'fourth'), (5, 15, 'fifth'), (6, 25, 'sixth'), (7, 35, 'seventh')]:
    comp(f'comp_bracket_top_pct_r{r}', f'Top percent bracket ending at round {r}', f'A CFA lost within the top {pct}% (and below the previous bracket) earns a pick after round {r}.', pct, 'percent', f'Paragraph 3(b)', f'following the last selection in the {ord_} round of the College Draft')
comp('comp_points_all_league', 'Points for first-team All-Pro / All-NFL', 'First-team All-NFL or All-Pro adds 20 points.', 20, 'points', 'Paragraph 2(b)(1)', 'Selected 1st Team ALL NFL by PFWA or 1st Team ALL PRO by AP: 20 points.')
comp('comp_points_all_conference', 'Points for All-Conference', 'All-Conference (PFWA) adds 5 points.', 5, 'points', 'Paragraph 2(b)(2)', 'Selected All Conference by PFWA (except if selected ALL NFL or ALL PRO above): 5 points.')
comp('comp_snap_min_pct', 'Least play percent that earns participation points', 'Participation points need at least 25 percent of offensive or defensive plays.', 25, 'percent', 'Paragraph 2(b)(3)', 'a minimum of 25% of the offensive/ defensive plays')
comp('comp_points_per_punt', 'Punter points per punt attempted', 'Punters get 1 point per punt attempted.', 1, 'points', 'Paragraph 2(b)(3)', '1 point will be awarded for each punt attempted')
comp('comp_points_per_punt_inside20', 'Punter points per punt inside the 20', 'Punters get 1 point per punt inside the 20.', 1, 'points', 'Paragraph 2(b)(3)', '1 point for each punt inside the 20-yard line during')
comp('comp_points_per_fga', 'Kicker points per field goal attempt', 'Kickers get 2 points per field goal attempted.', 2, 'points', 'Paragraph 2(b)(3)', 'and 2 points for each field goal attempted')
comp('comp_points_per_fgm', 'Kicker points per field goal made', 'Kickers get 1 point per field goal made.', 1, 'points', 'Paragraph 2(b)(3)', 'and 1 point for each field goal made during the')
comp('comp_veteran_accrued_seasons', 'Accrued seasons that push a pick back (non-quarterbacks)', 'A non-quarterback CFA with ten or more accrued seasons cannot earn a pick before round 5\'s end.', 10, 'seasons', 'Paragraph 4', 'with ten or more Accrued Seasons at the time of signing with his new Club')
comp('comp_veteran_earliest_round', 'Earliest round for a veteran CFA pick', 'Such a pick comes no earlier than the end of round 5.', 5, 'round', 'Paragraph 4', 'no Club shall be entitled to a Compensatory Draft Selection before the end of the fifth round')
comp('comp_equal_count_margin_points', 'Points margin for a pick on an equal count', 'With equal numbers lost and gained, a pick needs the lost sum to exceed the gained sum by more than 300 points.', 300, 'points', 'Paragraph 5', 'is more than 300 points greater than the sum of')
