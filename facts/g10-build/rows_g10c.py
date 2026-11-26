"""Fourth G-10 pass (2026-11-26), thread "Fill blocked-site draft and contract values". Values read through the
built-in browser on the user's PC, which reaches sites the cloud cannot. Status is computed, never typed."""
from core import *
from rows_cba import LG, CAP
from rows_web import W, sec
Y = '2026'

sec('spotrac_udfa', 'Spotrac, NFL Undrafted Pools by Team, one page per year (https://www.spotrac.com/nfl/undrafted/spending/team/_/year/<year>)', 'spotrac')
sec('ncaa_memo26', 'NCAA Division I Enforcement, 2026 NFL Education Memo (https://ncaaorg.s3.amazonaws.com/enforcement/2026ENF_NFLEducationMemo.pdf, read as a search-result excerpt)', 'ncaa')
sec('ncaa_memo24', 'NCAA Division I Enforcement, 2024 NFL Education Memo (https://ncaaorg.s3.amazonaws.com/enforcement/2024ENF_NFLEducationMemo.pdf, read as a search-result excerpt)', 'ncaa')
sec('atoz', 'A to Z Sports, Deadline for underclassmen to enter the 2025 NFL Draft (https://atozsports.com/college-football/deadline-for-underclassmen-to-enter-the-2025-nfl-draft/, read as a search-result excerpt)', 'atozsports')

SP = lambda y, v: W('spotrac_udfa', f'{y} undrafted pools page', f'how much of its ${v:,} signing bonus pool it used', v)

# ---- draft revoke window
LG.row('pro', 'An underclassman may withdraw his draft declaration up to 72 hours after the early-entry deadline.', 72, 'hours', Y,
  [W('ncaa_memo26', 'Early-entry withdrawal deadline bullet', 'Early-entry withdrawal deadline for underclassmen: 72 hours after the early-entry deadline', 72),
   W('ncaa_memo24', 'Early-entry withdrawal deadline bullet', 'Early-entry withdrawal deadline for underclassmen: 72 hours after the early-entry deadline', 72),
   W('atoz', 'Underclassmen deadline article', 'these players will have an extra 72 hours to withdraw their declarations', 72)],
  key=('league_rules.draft.revoke_window_hours', 'Hours after the declaration deadline in which an underclassman may revoke', 'C7.1.1'),
  notes='Two independence groups (the two NCAA memos are one group; A to Z Sports is the other). The league operations page names no revoke window, so the status stays 2 of 3. The excerpts were read in search results, not on the memo pages.')

# ---- undrafted signing-bonus pool per club (CBA Art. 7 s.1(i)); Spotrac publishes the figure per year
CAP.add('rookie.undrafted_pool_2021_usd', W('spotrac_udfa', '2021 undrafted pools page', 'how much of its $160,000 signing bonus pool it used', 160000))
CAP.add('rookie.undrafted_pool_2024_usd', W('spotrac_udfa', '2024 undrafted pools page', 'how much of its $183,103 signing bonus pool it used', 183103))
for y, v in ((2023, 172337), (2025, 206144), (2026, 229224)):
    CAP.row('pro', f'Undrafted rookie signing-bonus pool per club in {y}: ${v:,} (Spotrac).', v, 'USD', str(y),
      [SP(y, v)], key=(f'rookie.undrafted_pool_{y}_usd', f'Undrafted signing-bonus pool in {y}', 'C7.4.1'),
      notes='Spotrac pool page for the year, read through the built-in browser 2026-11-26. One source group. The same page matches the CBA text for 2021 ($160,000), which supports its year labels. No second publisher states the figure; an NFL or CBA calculation (the pool rises with the Total Rookie Compensation Pool) is not yet found.')

# ---- rookie slot values by pick: kept as data only (data/spotrac-2026-rookie-slots.json), no rule key.
# Observed contracts mixed with estimates from one source group; the only pick with three sources is pick 1 (rookie.first_pick_signing_bonus_2026).
