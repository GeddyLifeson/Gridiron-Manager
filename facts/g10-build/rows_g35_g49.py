"""Fourth G-10 pass (2026-11-26): keys G-35 (market, PR 84) and G-49 (agents, PR 87) read.
CBA quotes are searched in the local copy by the builder; status is computed. A key with no row is listed in README.md."""
from core import *
from rows_cba import LG, cba
from rows_g45 import NC
Y = '2026'
source('nfl_fa_gloss', 'NFL.com, 2022 NFL free agency glossary: All the terms you need to know (https://www.nfl.com/news/2022-nfl-free-agency-glossary-all-the-terms-you-need-to-know)', 'nfl-league-office', True, 'primary text', '/mnt/project-files/research/glossary/sources/nfl-com--free-agency-glossary-2022.txt', 'nfl-com--free-agency-glossary-2022.txt')
def gl(where, q, v=None): return S('nfl_fa_gloss', where, q, v)

# ===================== G-35 market (CBA Article 9) =====================
LG.row('pro', 'Restricted free agent tender: at least 110 percent of the prior-year Paragraph 5 Salary.', 110, 'percent', Y,
  [cba('Article 9 Section 2(b)(i)(2)-(4)', '110% of the player’s prior year’s Paragraph 5 Salary, whichever is greater', 110),
   gl('RFA tender levels', '(b) 110 percent of the player\'s prior-year base salary', 110)],
  key=('fa.rfa_prior_salary_pct', 'Restricted tender as percent of prior-year salary', 'C8.1.1'), notes=NC + ' NFL.com glossary (2022) states the same 110 percent for each tender level.')
LG.row('pro', 'Unrestricted free agent tender to keep rights: one-year contract of at least 110 percent of prior-year salary.', 110, 'percent', Y,
  [cba('Article 9 Section 1(b)(i)', 'Contract of at least 110% of either (a) his Prior Year Salary', 110)],
  key=('fa.ufa_tender_prior_salary_pct', 'Unrestricted-player tender as percent of prior salary', 'C8.2.1'), notes=NC)
LG.row('pro', 'The prior club has 5 days after receiving an offer sheet to match it.', 5, 'days', Y,
  [cba('Article 9 Section 3(a)', 'within five days from the date it receives the Offer Sheet', 5),
   gl('Franchise tag section', 'the player\'s previous team has five days to match the offer sheet', 5)],
  key=('fa.offer_sheet_match_days', 'Days to match an offer sheet', 'C8.1.1'), notes=NC)
LG.row('pro', 'A match notice must come no later than one day before the draft.', 1, 'days', Y,
  [cba('Article 9 Section 3(b)', 'but not later than one day before the Draft (unless the parties agree otherwise)', 1)],
  key=('fa.match_cutoff_days_before_draft', 'Latest day to match, days before the draft', 'C8.1.1'), notes=NC)
LG.row('pro', 'Draft compensation is due in the next draft if the offer sheet is received later than two days before this year\'s draft.', 2, 'days', Y,
  [cba('Article 9 Section 2(j)', 'unless the Offer Sheet is received by the Prior Club later than two days before', 2)],
  key=('fa.comp_next_draft_within_days', 'Offer sheet this close to the draft moves compensation to next year', 'C8.1.1'), notes=NC)
LG.row('pro', 'Unsigned tendered rights end at 4 p.m. New York time on the Tuesday after the tenth week of the regular season.', 10, 'weeks', Y,
  [cba('Article 9 Section 2(f)(ii)', 'by the Tuesday following the tenth week of the regular season, at 4:00pm New York time', 10)],
  key=('fa.unsigned_rights_end_after_week', 'Week after which a tendered, unsigned player sits out', 'C8.2.1'), notes=NC)
LG.row('pro', 'Club-performance incentives in an offer sheet that must be matched may not exceed 15 percent of the offer sheet salary.', 15, 'percent', Y,
  [cba('Article 9 Section 3(e)(i)', 'such incentives may not exceed 15% of the Salary in the Offer Sheet', 15)],
  key=('fa.offer_sheet_ltbe_max_pct', 'Likely-to-be-earned club-performance incentives limit, percent of salary', 'C8.1.1'), notes=NC)
LG.row('pro', 'A club that matches an offer sheet may not trade the player to the offering club for at least one calendar year without his consent.', 1, 'years', Y,
  [cba('Article 9 Section 3(h)', 'for at least one calendar year, unless the player consents to such trade', 1)],
  key=('fa.matched_trade_back_block_years', 'Years a matched player cannot be traded to the offering club', 'C8.4.1'), notes=NC)

# ===================== G-49 agents: camp fines, forfeiture, service (Art. 42, 7, 4, 8) =====================
EX = 'Exhibit A to Article 42 (2026 column)'
def disc(cls, val, where, quote, text):
    LG.row('pro', text, val, 'USD', Y, [cba(where, quote, val)],
      key=(f'discipline.camp_absence_fine_usd.{cls}', f'Fine per day of unexcused training-camp absence, {cls} class', 'L7.2.2'), notes=NC)
V60 = '$50,000 $50,000 $50,000 $50,000 $60,000 $60,000 $60,000 $60,000 $60,000'
disc('veteran', 60000, EX, V60, 'Camp absence fine per day, veteran under contract, 2026: $60,000 (mandatory).')
disc('ufa_signee', 60000, 'Article 42 Section 1(b)(vii) and ' + EX, V60, 'Camp absence fine per day, unrestricted free agent signee, 2026: $60,000 plus one week of Paragraph 5 salary per preseason game missed.')
disc('rookie', 45000, EX, '$40,000 $40,000 $40,000 $40,000 $45,000 $45,000 $45,000 $45,000 $45,000', 'Camp absence fine per day, drafted or undrafted rookie, 2026: $45,000.')
disc('option_year', 45000, 'Article 7 Section 7(h)(i)', 'a fine of $40,000 per day for the 2020-2025 League Years and $45,000 per day for the 2026-2030 League Years, plus one week’s regular season salary for each preseason game missed', 'Camp absence fine per day, fifth-year option player, 2026 to 2030: $45,000 plus one week of regular season salary per preseason game missed.')
for cls, sec_ in [('veteran', '(vi)'), ('ufa_signee', '(vii)')]:
    LG.row('pro', f'{cls} camp absence fine is mandatory: the club cannot reduce or waive it.', False, None, Y,
      [cba(f'Article 42 Section 1(b){sec_}', 'any such fines shall be mandatory, and shall not be reduced in amount or waived by the Club, in whole or in part', False)],
      key=(f'discipline.camp_absence_fine_waivable.{cls}', f'Whether the club may reduce or waive the {cls} camp fine (false = mandatory)', 'L7.2.2'), notes=NC + ' Rookie and option-year fines carry no "mandatory" wording in the CBA, so no waivable value is given for them (the request asked for true; that needs a second source).')
LG.row('pro', 'An unrestricted free agent signee absent from camp also owes one week of Paragraph 5 salary for each preseason game missed.', True, None, Y,
  [cba('Article 42 Section 1(b)(vii)', 'plus one week’s Paragraph 5 Salary for each preseason game missed', True)],
  key=('discipline.camp_absence_week_salary_per_preseason_game.ufa_signee', 'One week of salary per preseason game missed, ufa_signee class', 'L7.2.2'), notes=NC)
LG.row('pro', 'A fifth-year option player absent from camp also owes one week of regular season salary for each preseason game missed.', True, None, Y,
  [cba('Article 7 Section 7(h)(i)', 'plus one week’s regular season salary for each preseason game missed', True)],
  key=('discipline.camp_absence_week_salary_per_preseason_game.option_year', 'One week of salary per preseason game missed, option_year class', 'L7.2.2'), notes=NC)
for d, val, row in [('day1', 17986, '$15,980 $16,459 $16,953 $17,462 $17,986 $18,526 $19,082 $19,654 $20,244'),
                    ('day2', 35973, '$31,961 $32,920 $33,908 $34,925 $35,973 $37,052 $38,164 $39,309 $40,488'),
                    ('day3', 53952, '$47,936 $49,374 $50,855 $52,381 $53,952 $55,571 $57,238 $58,955 $60,724')]:
    LG.row('pro', f'Largest 2026 fine for unexcused mandatory minicamp absence, {d}: ${val:,}.', val, 'USD', Y, [cba(EX, row, val)],
      key=(f'discipline.minicamp_absence_fine_max_usd.{d}', f'Maximum fine for unexcused minicamp absence, {d}', 'L7.2.2'), notes=NC)

def fo(key, text, val, unit, where, q, meaning):
    LG.row('pro', text, val, unit, Y, [cba(where, q, val)], key=(key, meaning, 'L7.2.2'), notes=NC + ' Maximum permitted forfeiture; no player or club is obliged to agree to any.')
A = 'Article 4 Section 9(a)'
fo('forfeit.camp_free_days', 'A player who misses five days or less of training camp may not be subject to forfeiture.', 5, 'days', A + '(i)', 'A player who misses five days or less of training camp may not be subject to forfeiture', 'Camp days that may be missed with no forfeiture')
fo('forfeit.camp_initial_share', 'Camp absence of six preseason days: up to 15 percent of forfeitable salary allocations.', 0.15, 'ratio', A + '(i)', 'the player may be required to forfeit up to 15% of his Forfeitable Salary Allocations', 'Share forfeited at the first forfeitable camp day')
fo('forfeit.camp_daily_share', 'Each further camp day adds up to 1 percent.', 0.01, 'ratio', A + '(i)', 'and up to an additional 1% of his Forfeitable Salary Allocations for each additional preseason day missed', 'Further share per camp day')
fo('forfeit.camp_max_share', 'Camp forfeiture is capped at 25 percent.', 0.25, 'ratio', A + '(i)', 'up to a maximum of 25% of his Forfeitable Salary Allocations', 'Cap on the camp forfeiture share')
fo('forfeit.first_game_share', 'Absence that continues into the season: a further 25 percent of the remainder on missing the first regular season game.', 0.25, 'ratio', A + '(ii)', 'the player may be required to forfeit an additional 25% of the remaining Forfeitable Salary Allocations upon missing the first regular season game', 'Share of the remainder forfeited on missing the first game')
fo('forfeit.weekly_after_weeks', 'Weekly forfeiture of the remainder starts after the fourth week of the regular season.', 4, 'weeks', A + '(ii)', 'If such absence continues beyond the fourth week of the regular season', 'Missed weeks before weekly forfeiture starts')
fo('forfeit.weekly_divisor', 'Weekly forfeiture is one-seventeenth of the remainder per missed regular season week.', 17, 'count', A + '(ii)', 'one-seventeenth for each missed regular season week after the fourth week', 'Weekly forfeiture is the allocation divided by this')
LG.row('pro', 'A player under contract who fails to report on his mandatory reporting date earns no accrued season for that league year (absent extreme personal hardship).', True, None, Y,
  [cba('Article 8 Section 1(b)', 'A player shall not receive an Accrued Season for any League Year in which the player is under contract to a Club and in which (i) he failed to report to the Club’s preseason training camp on that player’s mandatory reporting date', True)],
  key=('service.no_accrued_if_not_reported', 'No accrued season for a player who does not report', 'C5.1.2'), notes=NC)
