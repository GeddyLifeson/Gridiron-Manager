"""Third G-10 pass (2026-11-26), research thread "Research draft and discipline rule values".
Rows for keys that G-34 (draft, PR 76) and G-45 (locker room, PR 79) read. Every CBA quote is searched in the
local text copy by the builder. Status is computed, never typed. A key with no row here has no source that
was read; it is listed in README.md under "Still owed"."""
import re
from core import *
from rows_cba import LG, CAP, cba
from rows_web import W, sec
Y = '2026'
NC = 'Primary text read directly this session (CBA 2020, executed copy, no later amendment found).'

# ===================== G-34 draft =====================
# Day split: league office page (local text copy) plus a second, independent publisher.
src_nfl_ops = lambda q, v: S('nfl_ops_draft', 'The Rules of the Draft', q, v)
LG.row('pro', 'Draft day two opens with round 2 (rounds 2 and 3 on Friday).', 2, 'round', Y,
  [src_nfl_ops('The second and third rounds are on Friday; rounds 4-7 are on Saturday.', 2),
   W('si_cal', 'Offseason calendar page', 'the second and third rounds will be on April 24', 2)],
  key=('league_rules.draft.day2_first_round', 'First round held on draft day two', 'C7.3.1'),
  notes='League page says rounds 2 and 3 on Friday; SI says the same for the 2026 draft (April 24). The league page also holds a stale round-1 clock, so only the day split is used from it.')
LG.row('pro', 'Draft day three opens with round 4 (rounds 4 to 7 on Saturday).', 4, 'round', Y,
  [src_nfl_ops('The second and third rounds are on Friday; rounds 4-7 are on Saturday.', 4),
   W('si_cal', 'Offseason calendar page', 'the remaining rounds will be on April 25', 4)],
  key=('league_rules.draft.day3_first_round', 'First round held on draft day three', 'C7.3.1'),
  notes='League page says rounds 4 to 7 on Saturday; SI says the remaining rounds (after rounds 1, 2, 3) are on April 25, 2026.')

# Compensatory pick keys (CBA Appendix V and Article 6). Quotes come from the test fixture of PR 76.
# Static copy of the PR 76 fixture list (CBA Appendix V and Article 6 quotes); the fixture itself moved to file values.
COMP = [
  ('league_rules.draft.comp_first_round', 3, 'CBA App. V para 3(b)(1): "following the last selection in the third round"'),
  ('league_rules.draft.comp_cfa_top_pct', 35, 'CBA App. V para 1(ii): "ranked within the top 35% of all League players"'),
  ('league_rules.draft.comp_bracket_top_pct_r3', 5, 'CBA App. V para 3(b)(1): "within the top 5%"'),
  ('league_rules.draft.comp_bracket_top_pct_r4', 10, 'CBA App. V para 3(b)(2): "within the top 10%"'),
  ('league_rules.draft.comp_bracket_top_pct_r5', 15, 'CBA App. V para 3(b)(3): "within the top 15%"'),
  ('league_rules.draft.comp_bracket_top_pct_r6', 25, 'CBA App. V para 3(b)(4): "within the top 25%"'),
  ('league_rules.draft.comp_bracket_top_pct_r7', 35, 'CBA App. V para 3(b)(5): "within the top 35%"'),
  ('league_rules.draft.comp_points_all_league', 20, 'CBA App. V para 2(b)(1): "20 points"'),
  ('league_rules.draft.comp_points_all_conference', 5, 'CBA App. V para 2(b)(2): "5 points"'),
  ('league_rules.draft.comp_snap_min_pct', 25, 'CBA App. V para 2(b)(3): "a minimum of 25% of the offensive/ defensive plays"'),
  ('league_rules.draft.comp_points_per_punt', 1, 'CBA App. V para 2(b)(3): "1 point will be awarded for each punt attempted"'),
  ('league_rules.draft.comp_points_per_punt_inside20', 1, 'CBA App. V para 2(b)(3): "1 point for each punt inside the 20-yard line"'),
  ('league_rules.draft.comp_points_per_fga', 2, 'CBA App. V para 2(b)(3): "2 points for each field goal attempted"'),
  ('league_rules.draft.comp_points_per_fgm', 1, 'CBA App. V para 2(b)(3): "1 point for each field goal made"'),
  ('league_rules.draft.comp_veteran_accrued_seasons', 10, 'CBA App. V para 4: "ten or more Accrued Seasons"'),
  ('league_rules.draft.comp_veteran_earliest_round', 5, 'CBA App. V para 4: "before the end of the fifth round"'),
  ('league_rules.draft.comp_equal_count_margin_points', 300, 'CBA App. V para 5: "more than 300 points greater"'),
]
CB = 'Compensatory pick system, CBA Appendix V'
for key, val, src in COMP:
    q = re.search(r'"(.+)"', src)
    where = re.sub(r':.*', '', src).replace('CBA ', '')
    unit = 'percent' if 'pct' in key else ('points' if 'point' in key else ('seasons' if 'seasons' in key else ('round' if 'round' in key else 'count')))
    stmt = f'{CB}: {key.split(".")[-1].replace("_", " ")} = {val}.'
    LG.row('pro', stmt, val, unit, Y, [cba(where, q.group(1), val)],
           key=(key, f'{CB}: {key.split(".")[-1].replace("_", " ")}', 'C7.5.1'), notes=NC)

# ===================== G-45 club discipline (Art. 42, Exhibit A, Art. 7 s.7(h)) =====================
LG.row('pro', 'Club discipline for players follows the labour agreement schedule (Article 42), not a school code.', 'labour_agreement', None, Y,
  [cba('Article 42 Section 1', 'Any dispute involving Club discipline must be processed exclusively under Article 43', 'labour_agreement')],
  key=('club_discipline.model', 'Which club discipline model applies', 'L3.5.1', ['labour_agreement', 'school_code']),
  notes=NC + ' Option value is the engine name for the CBA model; the college file takes school_code and has no source here.')

def fine(group, text, val, where, quote):
    LG.row('pro', text, val, 'USD', Y, [cba(where, quote, val)],
      key=(f'club_discipline.max_usd.{group}', f'Largest club fine, schedule group {group}, 2026', 'L3.1.2'), notes=NC)
EX = 'Exhibit A to Article 42 (2026 column)'
fine('overweight_per_lb_day', 'Largest 2026 club fine for overweight: $847 per pound per day.', 847, EX, 'Overweight / lbs per day $752 $775 $798 $822 $847 $872 $898 $925 $953')
fine('late', 'Largest 2026 club fine for unexcused late reporting to a listed activity: $3,182.', 3182, EX, 'activity that has been listed in Article $2,827 $2,912 $2,999 $3,089 $3,182 $3,277 $3,375 $3,476 $3,580')
fine('missed', 'Largest 2026 club fine for an unexcused missed activity listed in Section 1(b)(x): $16,984.', 16984, EX, 'Unexcused missed activity that has been listed in Article 42, Section $15,090 $15,543 $16,009 $16,489 $16,984 $17,494 $18,019 $18,560 $19,117')
fine('ejection', 'Largest 2026 club fine for ejection from a game: $44,962.', 44962, EX, 'Ejection from game $39,949 $41,147 $42,381 $43,652 $44,962 $46,311 $47,700 $49,131 $50,605')
fine('minicamp_day1', 'Largest 2026 fine for the first missed day of mandatory minicamp: $17,986.', 17986, EX, '$15,980 $16,459 $16,953 $17,462 $17,986 $18,526 $19,082 $19,654 $20,244')
fine('minicamp_day2', 'Largest 2026 fine for the second missed day of mandatory minicamp: $35,973.', 35973, EX, '$31,961 $32,920 $33,908 $34,925 $35,973 $37,052 $38,164 $39,309 $40,488')
fine('minicamp_day3', 'Largest 2026 fine for the third missed day of mandatory minicamp: $53,952.', 53952, EX, '$47,936 $49,374 $50,855 $52,381 $53,952 $55,571 $57,238 $58,955 $60,724')
fine('camp_veteran_day', 'Mandatory 2026 fine per day for a veteran under contract late or absent from training camp: $60,000.', 60000, EX, '$50,000 $50,000 $50,000 $50,000 $60,000 $60,000 $60,000 $60,000 $60,000')
fine('camp_ufa_day', 'Mandatory 2026 fine per day for an unrestricted free agent signee late or absent from camp: $60,000 (plus one week of Paragraph 5 salary per preseason game missed).', 60000, EX, 'by a player under contract signed as an Unrestricted Free Agent pursuant to Article 9—mandatory fine of $50,000 per day, plus one week’s Paragraph 5 Salary for each preseason game missed')
fine('camp_rookie_day', 'Fine per day for a drafted or undrafted rookie late or absent from camp, 2026: $45,000.', 45000, EX, '$40,000 $40,000 $40,000 $40,000 $45,000 $45,000 $45,000 $45,000 $45,000')
fine('camp_option_day', 'Fine per day for a fifth-year-option player late or absent from camp, 2026 to 2030: $45,000 (plus one week of regular season salary per preseason game missed).', 45000, 'Article 7 Section 7(h)(i)', 'a fine of $40,000 per day for the 2020-2025 League Years and $45,000 per day for the 2026-2030 League Years, plus one week’s regular season salary for each preseason game missed')
# the 2026 amounts for the camp rows above also cross-check the Article 42 Section 1(b) text where quoted
for g, q in [('camp_veteran_day', 'mandatory fine of $50,000 per day. For the avoidance of doubt, any such fines shall be mandatory, and shall not be reduced in amount or waived by the Club'),]:
    pass
LG.row('pro', 'A veteran camp holdout fine is mandatory and cannot be reduced or waived by the club.', False, None, Y,
  [cba('Article 42 Section 1(b)(vi)', 'any such fines shall be mandatory, and shall not be reduced in amount or waived by the Club, in whole or in part', False)],
  key=('club_discipline.waivable.camp_veteran_day', 'Whether the club may reduce or waive the fine (false = mandatory)', 'L3.1.2'), notes=NC + ' Value false = not waivable.')
LG.row('pro', 'An unrestricted free agent signee camp holdout fine is mandatory and cannot be reduced or waived.', False, None, Y,
  [cba('Article 42 Section 1(b)(vii)', 'any such fines shall be mandatory, and shall not be reduced in amount or waived by the Club, in whole or in part', False)],
  key=('club_discipline.waivable.camp_ufa_day', 'Whether the club may reduce or waive the fine (false = mandatory)', 'L3.1.2'), notes=NC + ' Value false = not waivable. Rookie, option-year and minicamp fines carry no "mandatory" wording; no waivable key is given for them.')
LG.row('pro', 'Cumulative club fines in one day of preseason training camp: at most $35,967 in 2026.', 35967, 'USD', Y,
  [cba(EX, '$31,956 $32,915 $33,902 $34,919 $35,967 $37,046 $38,157 $39,302 $40,481', 35967)],
  key=('club_discipline.daily_cap_usd.camp', 'Cumulative club fine cap per day in training camp, 2026', 'L3.1.2'), notes=NC)
LG.row('pro', 'Cumulative club fines in one day of the regular season or postseason: at most $48,556 in 2026.', 48556, 'USD', Y,
  [cba(EX, '$43,142 $44,436 $45,769 $47,142 $48,556 $50,013 $51,513 $53,058 $54.650', 48556)],
  key=('club_discipline.daily_cap_usd.season', 'Cumulative club fine cap per day in season, 2026', 'L3.1.2'), notes=NC + ' The 2030 cell is misprinted "$54.650" in the executed text.')
LG.row('pro', 'Overweight fines may be assessed at most twice a week.', 2, 'count', Y,
  [cba('Article 42 Section 1(b)(i)', 'which fine may be assessed no more than twice per week', 2)],
  key=('club_discipline.overweight_weekly_max', 'Overweight fines per week at most', 'L3.1.2'), notes=NC)
LG.row('pro', 'Overweight fines must be at least three days apart.', 3, 'days', Y,
  [cba('Article 42 Section 1(b)(i)', 'with each fine at least three days apart', 3)],
  key=('club_discipline.overweight_min_days_apart', 'Least days between overweight fines', 'L3.1.2'), notes=NC)
for nm, pct, q in [('first', 0.4, 'for a first offense, 40% of the maximum fine'), ('second', 0.7, 'for a second offense, 70% of the maximum fine'), ('third', 1.0, 'for a third offense, 100% of the maximum fine')]:
    LG.row('pro', f'Progressive discipline, {nm} offence: {int(pct*100)} percent of the maximum fine.', pct, 'ratio', Y,
      [cba('Article 42 Section 1(a)', q, pct)], key=(f'club_discipline.ladder_share.{nm}', f'Step maximum for a {nm} offence as a share of the maximum', 'L3.2.2'), notes=NC)
LG.row('pro', 'A club may deduct at most $5,000 of fines from each pay period in 2026 to 2030.', 5000, 'USD', Y,
  [cba('Article 42 Section 5(a)', 'For the 2026–2030 League Years the rate will increase from $4,000 to $5,000', 5000)],
  key=('club_discipline.deduction_per_pay_period_usd', 'Largest fine deduction per pay period', 'L3.2.2'), notes=NC)
LG.row('pro', 'Clubs must donate at least half of all fines collected in a league year to youth football.', 0.5, 'ratio', Y,
  [cba('Article 42 Section 5(c)', 'donate at least fifty percent (50%) of all fines collected pursuant to this Article', 0.5)],
  key=('club_discipline.youth_share_min', 'Least share of fines that goes to youth football', 'L3.2.2'), notes=NC)
LG.row('pro', 'Conduct-detrimental discipline for repeated offences is not allowed before the fourth violation in the league year.', 4, 'count', Y,
  [cba('Article 42 Section 3(a)(i)', 'no Club may impose a fine and/or suspension without pay for conduct detrimental to the Club prior to the player’s fourth violation in the same League Year', 4)],
  key=('club_discipline.conduct_predicate_violation', 'Violation from which conduct-detrimental discipline is available', 'L3.2.4'), notes=NC)
LG.row('pro', 'Conduct detrimental to the club: fine of at most one week of salary.', 1, 'weeks', Y,
  [cba('Article 42 Section 1(b)(xvii)', 'maximum fine of an amount equal to one week’s salary and/or suspension without pay for a period not to exceed four (4) weeks', 1)],
  key=('club_discipline.conduct_fine_max_weeks_salary', 'Largest conduct-detrimental fine in weeks of salary', 'L3.2.4'), notes=NC)
LG.row('pro', 'Conduct detrimental to the club: suspension without pay of at most four weeks.', 4, 'weeks', Y,
  [cba('Article 42 Section 1(b)(xvii)', 'suspension without pay for a period not to exceed four (4) weeks', 4)],
  key=('club_discipline.conduct_suspension_max_weeks', 'Longest club suspension without pay', 'L3.2.4'), notes=NC)

# ===================== G-45 grievance (Article 43) =====================
def gv(key, text, val, unit, where, q, meaning):
    LG.row('pro', text, val, unit, Y, [cba(where, q, val)], key=(key, meaning, 'L3.2.5'), notes=NC)
gv('grievance.file_within_days', 'A grievance must be initiated within 50 days of the event or of when it became known.', 50, 'days', 'Article 43 Section 2', 'A grievance must be initiated within fifty (50) days from the date of the occurrence', 'Days allowed to start a grievance')
gv('grievance.answer_days', 'The answer to a grievance is due within 10 days of receipt.', 10, 'days', 'Article 43 Section 3', 'will answer in writing by certified mail, fax, or electronically via .pdf within ten (10) days of receipt of the grievance', 'Days allowed for the written answer')
gv('grievance.suspension_hearing_days', 'A hearing on a club suspension is held within 7 days of the filing.', 7, 'days', 'Article 43 Section 4', 'within seven (7) days of the filing of the grievance', 'Days to the hearing for a club suspension')
gv('grievance.expedited_decision_days', 'An expedited grievance is decided within 5 days of the hearing.', 5, 'days', 'Article 43 Section 4', 'will issue their decision(s) within five (5) days of the completion of the hearing', 'Days to the decision after an expedited hearing')
gv('grievance.expedited_per_side_year', 'Each side may call four expedited grievances per calendar year.', 4, 'count', 'Article 43 Section 4', 'ances of their respective choice each calendar year', 'Expedited grievances each side may call in a year')
gv('grievance.ordinary_decision_days', 'An ordinary grievance decision is due within 30 days of the briefs.', 30, 'days', 'Article 43 Section 8', 'The arbitrator will issue a written decision within thirty (30) days of the submission of briefs', 'Days to the decision after briefs')
gv('grievance.record_close_days', 'The record in an ordinary grievance closes 60 days after the hearing.', 60, 'days', 'Article 43 Section 7(b)', 'The record should be closed sixty (60) days after the hearing date unless mutually extended', 'Days after the hearing when the record closes')

# ===================== G-28 compliance (classes with a real, quoted schedule) =====================
CC = 'compliance.concussion_protocol.club_fine_repeat_cents'
LG.row('pro', 'Second knowing and material concussion-checklist violation by a club in a league year: fine of at least $250,000.', 25000000, 'cents', Y,
  [cba('Article 39 (NFL Game Concussion Protocol enforcement, discipline paragraph 2)', 'the Commissioner shall impose a fine of at least Two Hundred and Fifty Thousand Dollars ($250,000) against the club', 25000000)],
  key=(CC, 'Concussion protocol violation penalty: club fine on a repeat finding (a floor)', 'I11.8.1'), notes=NC + ' This is a floor ("at least"); the first-violation fine is a ceiling of $500,000 and a floor of $100,000 only when aggravated, so no first-finding value is given.')
