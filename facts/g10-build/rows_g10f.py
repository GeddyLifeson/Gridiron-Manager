"""Seventh G-10 pass (2026-11-26): college playoff and standings keys the G-87 season runner reads (CR-G87-2).
Quotes are as returned by the cloud web fetch on 2026-11-26 (no local text copy, so the quote lint cannot re-find them)."""
from core import *
from rows_cba import LG, Y
from rows_web import sec, W

sec('cfp_site', 'College Football Playoff, About the 12-Team CFP Format (https://collegefootballplayoff.com/sports/2024/5/29/12-team-format; undated page)', 'cfp-official', how='primary text', primary=True)
sec('vavel_cfp', 'VAVEL, College Football Playoff 12-team seeding rules, auto bids explained (2026-11-19, https://www.vavel.com/en-us/ncaa/2026/11/19/college-football/1279798-college-football-playoff-12-team-seeding-rules-auto-bids-explained.html)', 'vavel')
sec('fbsched', 'FBSchedules, College Football Playoff sets scheduling standards for 24-team era (2026-11-09, https://fbschedules.com/college-football-playoff-sets-scheduling-standards-for-24-team-era/amp/)', 'fbschedules')
sec('abc7_cfp', 'ABC7, CFP 24-team format: what you need to know (2026-11-09, https://abc7.com/post/cfp-24-team-format-what-need-know-new-playoff/20027109/)', 'abc7')
sec('fox_ot', 'Fox Sports, College football overtime rules (updated 2025-09-23, https://www.foxsports.com/stories/college-football/college-football-overtime-rules)', 'fox-sports')
sec('si_ot', 'Sports Illustrated, College football overtime rules explained (2017-08-14, https://www.si.com/college-football/2017/college-football-overtime-rules-explained)', 'si')
N = 'Web quotes as returned by the cloud fetch 2026-11-26. 2026 season only (the 2027 24-team format is a different row set).'

LG.row('college', 'The 2026 playoff uses a fixed 12-team bracket with no reseeding.', False, None, Y,
  [W('cfp_site', 'About the 12-Team CFP Format', 'The bracket will remain in effect throughout the CFP (i.e., no re-seeding).', False),
   W('vavel_cfp', 'seeding explainer', 'a fixed NCAA basketball-style bracket with zero reseeding', False)],
  key=('playoff.reseed', 'Playoffs reseed after each round', 'C3.3.1'), notes=N)
LG.row('college', 'At-large places in the 2026 playoff come from any ranked position (no top-N cutoff).', 0, 'rank', Y,
  [W('cfp_site', 'About the 12-Team CFP Format, at-large entry', 'Best remaining teams, any conference', 0)],
  key=('cfp.at_large_pool_rank', 'At-large teams come from the committee top this many; 0 means any ranked position', 'T3.5.1'),
  notes=N + ' One source (the official page); no cutoff appears in any other page read. The 2027 "committee top 25" pool was not confirmed by any source.')
LG.row('college', 'The 10-game schedule standard does not apply to the 2026 season (it begins with 2027).', 0, 'games', Y,
  [W('fbsched', 'scheduling standards', 'beginning with the 2027 season', 0),
   W('abc7_cfp', 'format start', 'will start in time for the 2027 season', 0)],
  key=('ranking.schedule_standard_games', 'Games against the top subdivision below which the resume is penalised; 0 switches it off', 'T3.4.1'),
  notes=N + ' Inferred: no page says the standard is "off" in 2026, only that it starts in 2027. The pages disagree on which opponents qualify (Power 4 only versus any top-subdivision opponent for other schools).')
LG.row('college', 'FBS games cannot end tied (overtime since 1996), so the tie value is never used; 0.5 is the pro convention.', 0.5, 'ratio', Y,
  [W('fox_ot', 'overtime rules', 'With the introduction of overtime in 1996, college football games no longer end in ties.'),
   W('si_ot', 'overtime rules explained', 'The teams will play extra periods until there is a winner.')],
  key=('standings.tie_win_value', 'Share of a win a tied game counts as in winning percentage', 'C3.1.1'), assumption=True,
  notes=N + ' The value 0.5 is a design convention, not a rule: the quotes only show that no college tie occurs.')
