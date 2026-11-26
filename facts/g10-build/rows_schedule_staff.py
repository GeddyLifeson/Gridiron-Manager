"""Schedule (G-13) and staff-limit (G-25, G-29, G-38) rule values. Run: python3 rows_schedule_staff.py
Writes facts/schedule-staff.json and the league rule-value files *_schedule_staff_2026 under packages/rules-data/data/league/.
Quotes with a local text copy (CBA) are searched and the build stops if missing. Web quotes are as returned by the cloud web fetch on 2026-11-26 (page text not saved)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from core import *
CBA = '/mnt/project-files/nfl-rules/cba_2020.txt'
NW = 'Web quotes as returned by the cloud web fetch on 2026-11-26 (page text not saved locally, so the quote lint cannot re-find them).'
source('cba', 'NFL-NFLPA Collective Bargaining Agreement 2020, Article 24 Section 8 (text copy)', 'nfl-cba', True, 'primary text', CBA, 'cba_2020.txt')
def web(n, c, g, primary=False, how=None): source(n, c, g, primary, how or ('primary text' if primary else 'secondary summary'))
web('nflops', 'NFL Operations, 2026 NFL schedule announced (https://edge-operations.nfl.com/updates/the-game/2026-nfl-schedule-announced/; page undated, May 2026)', 'nfl-league-office', True)
web('nflcom_intl', 'NFL.com, 2026 NFL schedule release, nine international games (https://www.nfl.com/news/2026-nfl-schedule-release-nine-international-games-dates-times-matchups; May 2026)', 'nfl-league-office', True)
web('nflflex', 'NFL.com, 2026 Flexible Scheduling Procedures and Scheduling for Week 18 (https://www.nfl.com/legal/flexible-scheduling-procedures; page undated)', 'nfl-league-office', True)
web('wikinfl', 'Wikipedia, 2026 NFL season (https://en.wikipedia.org/wiki/2026_NFL_season; read 2026-11-26)', 'wikipedia')
web('thescore', 'theScore, NFL announces full 2026 regular-season schedule (https://www.thescore.com/nfl/news/3539550/nfl-announces-full-2026-regular-season-schedule; May 2026)', 'thescore')
web('si_flex', 'Sports Illustrated, NFL Owners Vote to Change Flex Rules Over Thursday Night Football Schedule (2025-03-31, https://www.si.com/nfl/nfl-owners-vote-to-change-flex-rules-over-thursday-night-football-schedule)', 'si')
web('pft', 'NBC Sports ProFootballTalk, NFL approves allowing teams to play two Thursday games on short weeks (2023-03-28, https://nbcsports.com/nfl/profootballtalk/rumor-mill/news/nfl-approves-allowing-teams-to-play-two-thursday-games-on-short-weeks); headline read, body truncated', 'nbc-pft')
source('sam', 'SAM local NFL data, nfl/data/games.csv (regular-season games 2021-2026, nflverse-derived), computed by facts/g10-build/schedule_compute.py (output schedule_out.json)', 'sam-nflverse-games', False, 'dataset computed')
web('ncaa23', 'NCAA.org, Division I Council modernizes rules for coaching limits (2023-01-11, https://www.ncaa.org/news/media-center-division-i-council-modernizes-rules-for-coaching-limits/)', 'ncaa', True)
web('ncaa24', 'NCAA.org, Division I removes some restrictions on countable coaches in football (2024-06-25, https://www.ncaa.org/news/media-center-division-i-removes-some-restrictions-on-countable-coaches-in-football/)', 'ncaa', True)
web('lsdbi', 'NCAA LSDBi proposal 2022-28-FBS, football coaching limits (Adopted Final 2023-03-12, effective 2023-07-01; https://web3.ncaa.org/lsdbi/search/proposalView?id=106991)', 'ncaa', True)
web('lsu', 'LSU Compliance, NCAA Bylaws on Personnel Requirements (copyright 2021, pre-2023 bylaw text; https://www.compliance.lsu.edu/personnel)', 'lsu-compliance')
web('gwh', 'GW Hatchet, NCAA sets new rules for coaching limits (2023-01-19, https://www.gwhatchet.com/2023/01/19/ncaa-sets-new-rules-for-coaching-limits/)', 'gw-hatchet')
web('fbscoop', 'FootballScoop, NCAA establishes Graduate Assistant guidelines, 7-year clock and more (undated, https://footballscoop.com/news/ncaa-establishes-guidelines-for-graduate-assistants)', 'footballscoop')
web('cbs_sec', 'CBS Sports, SEC adopts nine-game conference slate starting in 2026 (2025-08-21, https://www.cbssports.com/college-football/news/sec-adopts-nine-game-conference-slate-starting-in-2026-as-cfp-metrics-shift-emphasis-on-schedule-strength)', 'cbs-sports')
web('on3_pow', 'On3, While Big 12, SEC and ACC require 10 power opponents in 2026, Big Ten has no plans to do the same (Sept 2025, https://www.on3.com/news/while-big-12-sec-and-acc-requires-10-power-opponents-in-2026-big-ten-has-no-plans-to-do-the-same)', 'on3')
web('aol_b10', 'Field Level Media via AOL, Reports: Big Ten won\'t follow suit in requiring 10 power opponents (2025-09-24, https://www.aol.com/articles/reports-big-ten-wont-suit-233731086.html)', 'field-level-media')
web('on3_acc', 'On3, ACC announces 12 teams will play 9 conference games in 2026, five have 8-game schedule (Dec 2025, https://www.on3.com/news/acc-announces-12-teams-will-play-9-conference-games-in-2026-five-have-8-game-schedule/)', 'on3')
web('ap_acc', 'AP via Fox Sports, ACC shift to new football scheduling model will have 12 of 17 teams playing 9 league games in 2026 (2025-12-16, https://www.foxsports.com/articles/cfb/accs-shift-to-new-football-scheduling-model-will-have-12-of-17-teams-playing-9-league-games-in-2026)', 'associated-press')
web('cfp', 'College Football Playoff, 24-team expansion release and fact sheet (2026-11-09, https://collegefootballplayoff.com/news/2026/11/9/24-team-expansion)', 'cfp-official', True)
web('ap_cal', 'AP via NBC Sports, NCAA Cabinet tweaks college football calendar with 14-week season (2026-06-26, https://www.nbcsports.com/college-football/news/ncaa-cabinet-tweaks-college-football-calendar-with-14-week-season-and-bowl-rule-change)', 'associated-press')
web('fbsched', 'FBSchedules.com, NCAA adopts 14-week football season (2026-06-25, modified 2026-10-19, https://fbschedules.com/ncaa-adopts-14-week-football-season-changes-fcs-to-fbs-bowl-eligibility/amp/)', 'fbschedules')

SAMN = 'SAM regular-season games.csv 2021-2026 computed (schedule_out.json); '
REG = Reg('league-rule', 'sched')
KEYS = {'pro': [], 'college': []}; VALS = {'pro': [], 'college': []}
def row(level, key, unit, meaning, owner, stmt, value, valid, sources, notes=None):
    isb = isinstance(value, bool)
    rid = REG.row(level, stmt, value, None if isb else unit, valid, sources, notes=(notes + ' ' if notes else '') + NW)
    REG.rows[-1].pop('_key', None)
    KEYS[level].append(dict(key=key, type='boolean' if isb else 'number', meaning=meaning, ownerLeaf=owner, readBy=['league (G-10 data)'], **({} if isb else {'unit': unit})))
    VALS[level].append(dict(key=key, value=value, **({} if isb else {'unit': unit}), factId=rid, _row=REG.rows[-1]))
    return rid
Y = '2026'
# ---------------- pro schedule (G-13)
row('pro', 'schedule.regular_season_games', 'count', 'Regular-season games per club.', 'C2.1.1', 'Each NFL club plays 17 regular-season games.', 17, Y,
  [S('cba', 'Article 24 Section 8', 'which there are 17 regular season games per Club per year', 17),
   S('nflops', 'schedule announcement', 'The NFL\'s 32 teams will each play 17 games over 18 weeks.', 17),
   S('sam', 'games.csv per club, 2021-2026', SAMN + 'every club 17 games each season 2021-2026 (2022: two clubs 16, the cancelled Bills-Bengals game)', 17)])
row('pro', 'schedule.weeks', 'count', 'Regular-season weeks.', 'C2.2.1', 'The NFL regular season runs 18 weeks.', 18, Y,
  [S('nflops', 'schedule announcement', 'The NFL\'s 32 teams will each play 17 games over 18 weeks.', 18),
   S('sam', 'games.csv max week', SAMN + 'last week is 18 in every season 2021-2026', 18)])
row('pro', 'schedule.bye_window_first_week', 'week', 'First week a bye may fall.', 'C2.2.1', 'Byes begin in Week 5.', 5, Y,
  [S('nflops', 'schedule announcement', 'Byes will begin in Week 5 and end in Week 14', 5),
   S('sam', 'games.csv byes', SAMN + 'first bye week 5 in 2023, 2024, 2025 and 2026 (6 in 2021 and 2022)', 5)],
  'The window has shifted: SAM data shows week 6 as the first bye week in 2021 and 2022, so the value is the current (2023 onward) window.')
row('pro', 'schedule.bye_window_last_week', 'week', 'Last week a bye may fall.', 'C2.2.1', 'Byes end in Week 14.', 14, Y,
  [S('nflops', 'schedule announcement', 'Byes will begin in Week 5 and end in Week 14', 14),
   S('sam', 'games.csv byes', SAMN + 'last bye week 14 in 2021, 2023, 2024, 2025 and 2026 (2022 shows 17 only because the Bills-Bengals game was cancelled)', 14)])
row('pro', 'schedule.no_bye_week', 'week', 'Week with no byes (Thanksgiving week).', 'C2.2.1', 'No club has a bye in Thanksgiving week (Week 12 in 2026).', 12, Y,
  [S('sam', 'games.csv byes and Thanksgiving games', SAMN + 'Thanksgiving Thursday falls in week 12 in 2026 and no club has a bye that week (2022 to 2026 all show zero byes in Thanksgiving week)', 12)],
  'ONE SOURCE. Counter-evidence: in 2021 two clubs had a bye in Thanksgiving week (week 12), so "no byes in Thanksgiving week" is a pattern of 2022 to 2026, not a rule written down anywhere read. Bible C2.2.1 should call it a soft pattern. Thanksgiving week is 12 or 13 depending on the year (13 in 2024 and 2025); the scheduler must derive it from the calendar, this value is the 2026 week.')
row('pro', 'schedule.final_week_division_only', None, 'The final week holds only division games.', 'C2.2.1', 'Every game of the final regular-season week is a division game.', True, Y,
  [S('nflops', 'schedule announcement', 'For the 17th consecutive year, all 16 games scheduled for the final week of the season are division contests', True),
   S('wikinfl', 'Schedule section', 'all games during the final weekend will be intra-division games', True),
   S('sam', 'games.csv div_game, last week', SAMN + '16 of 16 final-week games are division games in every season 2021-2026', True)])
row('pro', 'schedule.max_short_week_thursdays', 'count', 'Short-week Thursday games per club per season.', 'C2.3.1', 'A club may play at most two Thursday games on short rest in a season.', 2, Y,
  [S('pft', 'headline', 'NFL approves allowing teams to play two Thursday games on short weeks', 2),
   S('sam', 'games.csv rest columns', SAMN + 'most Thursday games on 5 or fewer days of rest (Thanksgiving excluded) for one club in a season is 2 in 2022 to 2026 and 1 in 2021; never more than 2', 2)],
  'The PFT body was truncated and the NFL.com 2026 procedures page does not state the limit; the SAM figure is observed, not a rule text. The 2023 resolution itself is in the bible audit (P7, P8) but was not re-read here.')
row('pro', 'schedule.flex_sunday_night_limited_max', 'count', 'Sunday night flexes allowed in the early window (Weeks 5-10).', 'C2.3.3', 'Sunday Night Football may be flexed up to twice between Weeks 5 and 10 (any week 11 to 17).', 2, Y,
  [S('nflflex', '2026 Flexible Scheduling Procedures', 'For Sunday Night Football it may be used up to twice between Weeks 5-10', 2),
   S('thescore', 'flex section', 'Sunday night contests can be swapped out twice during Weeks 5-10', 2)])
row('pro', 'schedule.flex_thursday_max', 'count', 'Thursday night flexes per season.', 'C2.3.3', 'Thursday Night Football may be flexed up to twice between Weeks 13 and 17.', 2, Y,
  [S('nflflex', '2026 Flexible Scheduling Procedures', 'For Thursday Night Football it may be used up to twice between Weeks 13-17.', 2),
   S('si_flex', '2025-03-31 article', 'flex up to two games into Thursday Night Football', 2),
   S('thescore', 'flex section', 'the league can move Thursday games twice between Weeks 13-17', 2)])
row('pro', 'schedule.flex_thursday_notice_days', 'day', 'Notice for a Thursday flex.', 'C2.3.3', 'A Thursday flex is decided no later than 21 days before the game.', 21, Y,
  [S('nflflex', '2026 Flexible Scheduling Procedures', 'the flexible scheduling decision will generally be made no later than 21 days prior to the game', 21),
   S('si_flex', '2025-03-31 article', 'trim the notice needed to flex a Thursday Night Football game from 28 to 21 days', 21)],
  'Other notice periods on the same NFL.com page, not keyed: Sunday night 12 days (Weeks 5-13) and 6 days (Weeks 14-17); Monday night flex any week 12 to 17 with 12 days.')
row('pro', 'schedule.week18_saturday_games', 'count', 'Saturday games in the final week.', 'C2.3.3', 'Three games are played on Saturday in Week 18 of 2026.', 3, Y,
  [S('nflops', 'schedule announcement', 'three games will be played on Saturday (1 p.m. ET, 4:30 p.m. ET and 8 p.m. ET)', 3)],
  'ONE SOURCE for 2026. SAM data shows 2 Saturday games in week 18 in each of 2021 to 2025 (its 2026 week 18 is a placeholder with every game on Sunday), so the count varies by year; Week 17 had 1 to 3 Saturdays in 2023 to 2025. The NFL.com procedures page says the Week 18 Saturday and Sunday slots are not assigned in advance.')
row('pro', 'schedule.international_games', 'count', 'Games at international sites per season.', 'C2.4.1', 'The 2026 schedule has nine international games.', 9, Y,
  [S('nflops', 'schedule announcement', 'The NFL schedule features nine international games, the most-ever in a season', 9),
   S('nflcom_intl', 'schedule release article', 'matchups for all nine International Games', 9),
   S('sam', 'games.csv location', SAMN + '2026 has 9 games whose location is not Home (3, 6, 5, 5, 7 in 2021 to 2025)', 9)])
row('pro', 'schedule.preseason_games', 'count', 'Preseason games per club.', 'C2.5.1', 'Each club plays three preseason games (the Hall of Fame Game clubs a fourth).', 3, Y,
  [S('cba', 'Article 24 Section 8', 'the NFL shall hold no more than three preseason games per Club per year', 3),
   S('nflops', 'schedule announcement', 'three preseason games for the sixth consecutive year', 3)])
# ---------------- college schedule (G-13)
row('college', 'schedule.regular_season_games', 'count', 'Regular-season games per team (top subdivision).', 'T3.1.1', 'FBS teams may schedule up to 12 regular-season games.', 12, '2026 and 2027',
  [S('ap_cal', 'AP, 2026-06-26', 'teams will be able to schedule up to 12 regular-season games', 12),
   S('fbsched', '2026-06-25', 'programs will continue to be permitted to schedule up to 12 regular-season games', 12)],
  '"Up to 12": a maximum, not a requirement. No NCAA manual text was reachable.')
row('college', 'schedule.weeks', 'count', 'Regular-season weeks (college).', 'T3.1.1', 'From fall 2027 the FBS regular season is a standardized 14 weeks.', 14, '2027',
  [S('ap_cal', 'AP, 2026-06-26', 'for the 14-week season that ends following Thanksgiving', 14),
   S('fbsched', '2026-06-25', 'will move to a standardized 14-week regular-season format beginning in fall 2027', 14)],
  'Applies from 2027. No page read states the 2026 week count (the 2026 season starts in Week 0 and a Week 0 start is not standard until the 2027 change), so the G-13 config value of 14 for 2026 is NOT confirmed. Two open dates per school from 2027.')
row('college', 'schedule.conference_games', 'count', 'Conference games per team (set per conference).', 'T3.1.1', 'In 2026 the SEC, Big Ten, Big 12 and 12 of 17 ACC teams play nine conference games.', 9, Y,
  [S('cbs_sec', '2025-08-21', 'SEC athletic directors adopted a nine-game conference football schedule starting with the 2026-27 season', 9),
   S('on3_pow', 'Sept 2025', 'The Big Ten will play nine conference games, as it has every season since 2016', 9),
   S('on3_acc', 'Dec 2025', 'a nine-game conference slate', 9),
   S('aol_b10', '2025-09-24', 'nine league football games plus one nonconference opponent from a power league', 9)],
  'CORRECTS the bible: 12 of 17 ACC teams play nine and FIVE play eight (Boston College, Clemson, Florida State, Georgia Tech, North Carolina), per On3 and AP; the bible had 16 and 1. From 2027 one ACC school plays eight each year (ESPN via the fetch). The value is the common one, so the ACC five need a per-conference override in the data that G-13 reads.')
row('college', 'schedule.power_opponents_min', 'count', 'Games against power opponents required by the conference.', 'T3.1.2', 'The Big 12, SEC and ACC require ten games against power-conference opponents from 2026.', 10, Y,
  [S('on3_pow', 'Sept 2025', 'will begin requiring their schools to play a minimum of 10 games against power conference opponents', 10),
   S('aol_b10', '2025-09-24', 'three major conferences will require their members to face at least 10 power-conference opponents', 10)],
  'The Big Ten has no such rule (On3: it is not requiring a non-conference power opponent), so that conference has no value for this key. Notre Dame counts as a power opponent (CBS, ESPN pages for the SEC wording).')
row('college', 'schedule.playoff_qualifying_games_min', 'count', 'Qualifying games for the playoff standard from 2027.', 'T3.1.1', 'From 2027-28 each Power-conference and Group of 6 team is expected to play at least 10 qualifying regular-season games.', 10, '2027',
  [S('cfp', '2026-11-09 fact sheet', 'Each A4 institution will be expected to play at least 10 qualifying regular season games', 10)],
  'ONE SOURCE (the official release). Same 10 for the Group of 6. The CFP page says no weight is given to a win over more than one FCS opponent a season; it lists no FCS game as qualifying.')
# ---------------- college staff limits (G-25, G-29, G-38)
row('college', 'staff.graduate_assistant_limit', 'count', 'Graduate assistant (graduate student coach) seats per program (S1.2.2).', 'S1.2.2', 'An FBS program may have up to four graduate student coaches.', 4, 'since 2023-07-01',
  [S('ncaa24', '2024-06-25', 'remain able to have up to four graduate student coaches', 4),
   S('lsdbi', 'Bylaw 11.7.4, effective 2023-07-01', 'four graduate assistant student coaches', 4),
   S('lsu', 'pre-2023 snapshot', 'four graduate assistant coaches', 4)],
  'Fetched pages dated to mid-2024; nothing dated 2025 or 2026 was found, and the current NCAA manual was not read.')
row('college', 'staff.off_campus_recruiter_limit', 'count', 'Staff who may recruit off campus at one time, head coach included (S1.2.2).', 'S1.2.2', 'FBS football is limited to 11 off-campus recruiters, the head coach among them.', 11, 'since 2023-07-01',
  [S('ncaa24', '2024-06-25', 'FBS teams remain limited to up to 11 staff members', 11),
   S('lsu', 'pre-2023 snapshot', 'Football, Bowl Subdivision- 11', 11)],
  'The 2024 release says the change "does not change the number of off-campus recruiters". The second subdivision figure (13 in the bible) was not confirmed. Nothing dated 2025 or 2026 read.')
row('college', 'staff.strength_staff_limit', 'count', 'Strength and conditioning staff per program (S1.2.2).', 'S1.2.2', 'An FBS football program may have no more than five strength and conditioning coaches.', 5, 'since 2023-07-01',
  [S('ncaa24', '2024-06-25', 'no more than five strength and conditioning coaches', 5),
   S('lsu', 'Bylaw 11.7.3.1.1, pre-2023 text', 'Not more than five weight or strength coaches are permitted to work with a football program in any capacity.', 5)],
  'Nothing dated 2025 or 2026 read.')
row('college', 'staff.student_assistant_limit', 'count', 'Student assistant seats per program (S1.2.2).', 'S1.2.2', 'The limit on student assistant coaches equals the number of permissible off-campus recruiters (11 in FBS).', 11, 'since 2024-06-25',
  [S('ncaa24', '2024-06-25', 'will be the same as the number of permissible off-campus recruiters', 11)],
  'ONE SOURCE, and the value is derived (limit equals the recruiter number). The release does not say whether this restated or changed the earlier rule.')
row('college', 'staff.ga_max_seasons', 'seasons', 'Most seasons a person may serve as a graduate assistant coach (S3.3.4 rule 3).', 'S3.3.4', 'A person may serve as a graduate student coach for at most three years.', 3, 'since 2023-07-01',
  [S('ncaa23', '2023-01-11', 'limited individuals to serving three years maximum in that role', 3),
   S('gwh', '2023-01-19', 'to serving a maximum of three years', 3)],
  'LSDBi 2022-28-FBS and a 2019 UGA page describe the older form: two years, a third only after completing 24 semester hours. Both give three as the ceiling.')
row('college', 'staff.ga_degree_window_years', 'years', 'A graduate assistant must have finished a bachelor\'s degree or used up eligibility within this many years (S3.3.4 rule 1).', 'S3.3.4', 'A graduate assistant coach must be within seven years of a first bachelor\'s degree or of exhausting football eligibility.', 7, 'since 2023-07-01',
  [S('lsdbi', 'Proposal 2022-28-FBS', 'within the previous seven years', 7),
   S('fbscoop', 'article text', 'The seven-year window begins after receiving first baccalaureate', 7)],
  'Professional-contract time is excluded (LSDBi, LSU). The FootballScoop piece is undated and older.')

# ---------------- write
root = os.path.join(os.path.dirname(__file__), '..')
for r in REG.rows: r['status'] = status(r); r['statusHistory'] = [dict(date='2026-11-26', status=r['status'], reason='First load by the schedule and staff facts pass from sources read this session.')]
json.dump(dict(domain='league-rule', rows=REG.rows), open(os.path.join(root, 'schedule-staff.json'), 'w'), indent=1, ensure_ascii=False); open(os.path.join(root, 'schedule-staff.json'), 'a').write('\n')
d = os.path.join(root, '..', 'packages/rules-data/data/league')
for lvl in ('pro', 'college'):
    vals = []
    for v in KEYS and VALS[lvl]:
        row_ = v.pop('_row')
        if row_['status'] not in ('Verified', 'Rulebook only'): v['note'] = 'PROVISIONAL: status ' + row_['status'] + ' (Q6.3.1)'
        vals.append(v)
    json.dump(dict(keys=KEYS[lvl]), open(f'{d}/keys_{lvl}_schedule_staff.json', 'w'), indent=1); open(f'{d}/keys_{lvl}_schedule_staff.json', 'a').write('\n')
    json.dump(dict(ruleset_id=f'{lvl}schedstaff_2026', level=lvl, season_year=2026, source=dict(document='Fact register rows F-sched (facts/schedule-staff.json)', date='2026'), schema_version=1, values=vals), open(f'{d}/{lvl}league_schedule_staff_2026.json', 'w'), indent=1); open(f'{d}/{lvl}league_schedule_staff_2026.json', 'a').write('\n')
from collections import Counter
for r in REG.rows: print(r['id'], r['status'], r['value'], r['statement'][:70])

# ---------------- head coach firing timing (bible E4.3.3 target check)
web('si_fire', 'Sports Illustrated, NFL Head Coach Firings By Year (published and modified 2026-01-06, https://www.si.com/nfl/nfl-head-coach-firings-by-year)', 'si')
web('nbc_bm', 'NBC New York, History of Black Monday NFL coaches fired (2026-01-05, updated 2026-01-19, https://www.nbcnewyork.com/news/sports/nfl/history-black-monday-nfl-coaches-fired/)', 'nbc-news')
web('skeeda', 'Sportskeeda, How many NFL coaches fired mid season (undated, https://www.sportskeeda.com/nfl/how-many-nfl-coaches-fired-mid-season)', 'sportskeeda')
web('outkick', 'OutKick, College Football Teams Are Firing Coaches More Quickly Than Ever (2025-10-28, citing The Athletic, https://www.outkick.com/sports/college-football-coaching-carousel-reaches-new-unprecedented-level-10-early-season-firings)', 'outkick')
web('yahoo_fbs', 'Deseret News via Yahoo, Nearly a quarter of FBS coaching jobs were open this cycle (2024-02-17, https://www.yahoo.com/news/nearly-quarter-fbs-coaching-jobs-194010505.html)', 'deseret')
FIRE = Reg('measured-rate', 'firing')
def frow(level, stmt, value, unit, valid, sources, notes):
    FIRE.row(level, stmt, value, unit, valid, sources, notes=notes + ' ' + NW); FIRE.rows[-1].pop('_key', None)
frow('pro', 'Share of NFL head coach firings that happen during the regular season rather than after it: 16 of 44 over the 2020 to 2025 seasons (36 percent).', 0.36, 'ratio', '2020-2025',
  [S('si_fire', 'per-season totals 2020-2025 (7, 8, 5, 9, 7, 8 = 44)', 'The amount of total head coach firings range from five to nine over the past nine seasons.', 0.36),
   S('nbc_bm', 'per-season in-season firings (3, 2, 3, 3, 3, 2 = 16)', 'Three teams fired their coaches during the 2024 regular season', 0.36)],
  'DERIVED by listing coaches: in-season firings named by NBC (2020: Patricia, Quinn, O\'Brien; 2021: Meyer, Gruden; 2022: Rhule, Reich, Hackett; 2023: McDaniels, Reich, Staley; 2024: Saleh, Allen, Eberflus; 2025: Callahan, Daboll) over SI season totals; 2025 is partial (as of 2026-01-06). 2017 to 2019 cannot be split from the pages read. Season-level shares range 25 percent (2025) to 60 percent (2022). Sits inside the bible E4.3.3 band of 15 to 40 percent; the sim\'s 8 percent is well below it. Does not count resignations or retirements.')
frow('pro', 'NFL head coaches fired in the middle of an active season since 2000: 34 (about 1.3 a season over 26 seasons); 88 since the 1970 merger.', 34, 'count', '2000-2025',
  [S('skeeda', 'aggregate sentence', '34 of them have been fired since 2000', 34)],
  'ONE SOURCE, undated page. Cross-check only: 34 in 26 seasons is about 1.3 a season, against 2.7 a season (16 in 6) in 2020 to 2025, so the recent rate is double the long-run rate. No per-year breakdown for 2000 to 2016 was readable.')
frow('college', 'FBS head coaches fired between Week 1 and November 1: 10 across the 2010 to 2013 seasons (2.5 a season); 10 in 2025 by October 28.', 10, 'count', '2010-2013',
  [S('outkick', '2025-10-28', 'From 2010 through 2013, there were 10 head coaches fired between Week 1 and November 1 of each individual season.', 10)],
  'ONE SOURCE (citing The Athletic); the sentence is ambiguous between 10 in total and 10 each season, read as 10 in total because the same page says 2025 is already a record at 10. The FBS in-season SHARE of all firings could not be computed: no page read gives in-season and total firings for the same year. Partial figures: 31 FBS jobs opened in the 2023-24 cycle, 12 by termination (39 percent of openings, Yahoo/Deseret, 2024-02-17); Power 5 midseason changes 36 in the playoff era (ESPN 2022-11-01); six Power Four in-season firings by 2025-10-22 (Fox/AP). No FBS share is claimed.')
frow('college', 'FBS jobs opened in the 2023-24 cycle: 31, of which 12 were terminations (39 percent).', 12, 'count', '2023-24',
  [S('yahoo_fbs', '2024-02-17', '12 of the coaching changes were due to the termination of coaches.', 12)],
  'ONE SOURCE. Cycle total includes the season and the offseason; the page does not split in-season from after-season terminations.')
for r in FIRE.rows: r['status'] = status(r); r['statusHistory'] = [dict(date='2026-11-26', status=r['status'], reason='First load by the schedule and staff facts pass from sources read this session.')]
json.dump(dict(domain='measured-rate', rows=FIRE.rows), open(os.path.join(root, 'coach-firing-timing.json'), 'w'), indent=1, ensure_ascii=False); open(os.path.join(root, 'coach-firing-timing.json'), 'a').write('\n')
for r in FIRE.rows: print(r['id'], r['status'], r['value'], r['statement'][:70])
