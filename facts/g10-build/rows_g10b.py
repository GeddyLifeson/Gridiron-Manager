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
