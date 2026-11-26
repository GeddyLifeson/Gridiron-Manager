"""Recruiting, visit, initial-eligibility and two-year-college rule values for the keys the G-36 recruiting module reads
(packages/league/src/recruiting/keys.ts). Primary NCAA texts are local copies (ncaa-primary/, curl from ncaaorg.s3.amazonaws.com);
the build stops if a quote is not found in them. Quotes from web pages were returned by the cloud web fetch on 2026-11-26 (pages not
saved; at most 120 characters). Status is computed (core.status), never typed.
Rows with key=None document a value that is NOT in the 2026 rule set (historic, proposed, removed); see README for each."""
from core import *
P = '/mnt/project-files/research/college/ncaa-primary/'
Y = '2026'
COLR = Reg('league-rule', 'recruiting')
NW = 'Web quote as returned by the cloud web fetch on 2026-11-26 (page not saved locally, so the quote lint cannot re-find it).'

def loc(n, cit, grp, f, prim=True):
    source(n, cit, grp, prim, 'primary text' if prim else 'secondary summary', P + f, f)
def web(n, cit, grp, prim=False):
    source(n, cit, grp, prim, 'primary text' if prim else 'secondary summary')

loc('cal2526', 'NCAA, 2025-26 NCAA Recruiting Calendar, Division I Football Bowl Subdivision (https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2025-26/2025-26D1Rec_FBSMFBRecruitingCalendar.pdf)', 'ncaa', '2025-26-fbs-calendar-raw.txt')
loc('cal2627', 'NCAA, Fall 2026-27 NCAA Recruiting Calendar and 2027 calendar, Division I FBS (updated 2026-11-05, https://ncaaorg.s3.amazonaws.com/compliance/recruiting/calendar/2026-27/2026-27D1Rec_FBSRecruitingCalendar.pdf)', 'ncaa', '2026-27-fbs-calendar-raw.txt')
loc('g2223', 'NCAA, Division I Football Recruiting Guide, effective August 1, 2022 (https://iamasundevil.asu.edu/sites/default/files/2025-05/2022-23D1REC_MFBRecruitingGuide.pdf; same file as ncaaorg.s3 g_2022-23D1REC_MFBRecruitingGuide.pdf; the newest guide found)', 'ncaa', '2022-23-fbs-recruiting-guide-raw.txt')
loc('jul26', 'NCAA, Report of the Division I FBS Oversight Committee, July 23, 2026 (https://ncaaorg.s3.amazonaws.com/championships/sports/football/d1/FBSOC/JULY2026D1FBSOC_Report.pdf)', 'ncaa', 'JULY2026-raw.txt')
loc('feb26', 'NCAA, Report of the Division I FBS Oversight Committee, February 24-25, 2026 (https://ncaaorg.s3.amazonaws.com/committees/d1/fbsfboc/FEB2026D1FBSOC_Report.pdf)', 'ncaa', 'FEB2026-fbsoc-report.txt')
loc('aec26', 'NCAA, Report of the Division I Academics and Eligibility Committee, May 8, 2026 (https://ncaaorg.s3.amazonaws.com/committees/d1/academicseligibility/May2026D1AEC_Report.pdf as saved)', 'ncaa', 'May2026-D1AEC-raw.txt')
loc('fball', 'NCAA Eligibility Center, Are You Ready to Play Football? (PDF dated 2023, modified 2025-05; https://s3.amazonaws.com/fs.ncaa.org/Docs/eligibility_center/Outreach/Fball/Fball_Students.pdf)', 'ncaa', 'other/fball-students-raw.txt')
loc('psa', 'NCAA Eligibility Center, Initial Eligibility presentation (PDF created 2026-08-26; https://s3.amazonaws.com/fs.ncaa.org/Docs/eligibility_center/Presentations/Initial_Eligibility_PSA.pdf)', 'ncaa', 'other/initial-eligibility-psa-raw.txt')

web('ncaa_di', 'NCAA.org, Division I initial-eligibility requirements (page modified 2026-11-25, https://www.ncaa.org/eligibility-center/initial-eligibility-requirements/division-i/)', 'ncaa', True)
web('ncaa_2024', 'NCAA.org, Division I removes some restrictions on countable coaches in football (2024-06-25, https://www.ncaa.org/news/2024/6/25/media-center-division-i-removes-some-restrictions-on-countable-coaches-in-football)', 'ncaa', True)
web('ncaa_waiver', 'NCAA.org, FBS blanket waiver suspends school limit on number of football official visits (2024-11-08, https://www.ncaa.org/news/media-center-fbs-blanket-waiver-suspends-school-limit-on-number-of-football-official-visits/)', 'ncaa', True)
web('ncaa_oct26', 'NCAA.org, Division I Cabinet introduces legislation to modernize NCAA rules (2026-10-07, https://www.ncaa.org/news/division-i-cabinet-introduces-legislation-to-modernize-ncaa-rules/)', 'ncaa', True)
web('ncsa', 'NCSA, 2026-27 NCAA Football Recruiting Rules and Calendar (last updated 2026-09-23, https://www.ncsasports.org/football/recruiting-rules-calendar)', 'ncsa')
web('asu', 'ASU Sun Devil Compliance, Football Recruiting Guide (undated PDF, https://sundevilcompliance.asu.edu/sites/default/files/football_recruiting_101_3.pdf; its figures are from an older rule year, e.g. 42 fall evaluation days)', 'asu-compliance')
web('on3v', 'On3, NCAA recruits can now take unlimited official visits (2023, https://www.on3.com/news/ncaa-recruits-can-now-take-unlimited-official-visits)', 'on3')
web('uga', 'University of Georgia Athletics Compliance, Expenses during campus visits (copyright 2025, https://compliance.sports.uga.edu/coaches-staff/ncaa-rules-for-administrative-coaching-staff/expenses-during-campus-visits/; partly outdated: still lists five visits)', 'uga-compliance')
web('fs_iawp', 'FootballScoop, NCAA approves IAWP rule, comprehensive recruiting changes (URL date 2025-03-04, https://www.footballscoop.com/2025/03/04/ncaa-approves-iawp-rule-comprehensive-recruiting-changes; text describes legislation effective August 2017)', 'footballscoop')
web('fs_jul', 'FootballScoop, NCAA clears way for off-campus recruiting changes (2026-07-23, https://www.footballscoop.com/2026/07/23/ncaa-clears-way-off-campus-recruiting-changes)', 'footballscoop')
web('fs_oct', 'FootballScoop, Division I Cabinet proposing a number of changes (2026-10-08, https://www.footballscoop.com/2026/10/08/division-i-cabinet-proposing-a-number-of-changes-to-modernize-ncaa-rules-impacting-coaching-staff-limits-and-official-visits)', 'footballscoop')
web('berk', 'UC Berkeley Athletic Study Center, NCAA academic eligibility requirements (copyright 2026, https://asc.berkeley.edu/resources/students/academic-advising-resources/ncaa-academic-eligibility-requirements-student-0)', 'berkeley')
web('img', 'IMG Academy, NCAA eligibility requirements (copyright 2026, https://www.imgacademy.com/resources/articles/ncaa-eligibility-requirements)', 'img-academy')
web('njcaa', 'NJCAA, release on NCAA Division I two-year transfer changes (2026-06-24, https://stats.njcaa.org/general/2025-26/releases/20260624sx2a0g)', 'njcaa')

W = lambda n, where, q, v=None: S(n, where, q, v)
def row(stmt, value, unit, valid, sources, key, notes=None):
    return COLR.row('college', stmt, value, unit, valid, sources, key=key, notes=((notes + ' ') if notes else '') + NW)

# =============== calendar and day pools (T4.2.1, T4.2.2)
row('The 2026 college rule set uses the day-pool recruiting model (33 fall evaluation days, 140 spring recruiting-person days); the opportunity model is a recommendation for January 1, 2027.', 'days_2025', None, Y,
  [W('jul26', 'FBSOC July 2026 action item 1(b), (2)', 'Increase the number of fall evaluation days from 33 to 50.'),
   W('jul26', 'FBSOC July 2026 action item, effective date', 'Effective date. January 1, 2027.'),
   W('fs_jul', 'FootballScoop report', 'up to 50 off-campus evaluation days during the fall evaluation period')],
  ('recruiting.model', 'Recruiting budget model in force: day pools or opportunities', 'T4.2.2', ['days_2025', 'opps_2027']),
  'Adoption of the 2027 model by the Division I Cabinet was NOT found in any page read (Aug 28 and Oct 7 2026 NCAA pages say it is to be reviewed). The 2026 set therefore holds the day-pool model.')
row('Fall evaluation days per school (FBS): 33 (42 at U.S. service academies).', 33, 'days', Y,
  [W('cal2526', '2025-26 FBS calendar, Sept. 1 through Nov. 30', 'Thirty-three (42 for U.S. service academies) evaluation days during the fall evaluation period.', 33),
   W('cal2627', '2026-27 FBS calendar, SEP 1 - NOV 29', 'Thirty-three (42 for U.S. service academies) evaluation days during the fall evaluation period.', 33),
   W('ncsa', '2026-27 calendar page', 'Thirty-three (42 for U.S. service academies) evaluation days during the fall evaluation period.', 33)],
  ('recruiting.eval_days_fall', 'Fall evaluation days per school', 'T4.2.1'))
row('Spring recruiting-person days per school (FBS): 140 (180 at U.S. service academies), April 15 through May 23.', 140, 'days', Y,
  [W('cal2526', '2025-26 FBS calendar, April 15 through May 23', 'One hundred forty (180 for U.S. service academies)', 140)],
  ('recruiting.person_days_spring', 'Spring recruiting-person days per school', 'T4.2.2'),
  'One source: the 2026-27 calendar updated 2026-11-05 lists only the fall evaluation days for 2026-27 and shows the 2027 periods without a day count. The 140 is the 2025-26 calendar value.')
row('FBS schools may use up to 11 off-campus recruiters, the head coach included (17 under a blanket waiver through January 1, 2027).', 11, 'count', Y,
  [W('ncaa_2024', 'NCAA news 2024-06-25', 'FBS teams remain limited to up to 11 staff members', 11),
   W('jul26', 'FBSOC July 2026 action item 1(e)', 'Increase the number of institutional staff members who may recruit off campus on behalf of the institution from 11 to 17.', 11)],
  ('recruiting.offcampus_max', 'Staff who may recruit off campus, head coach included', 'T4.6.1'),
  'Value is the legislated number. The July 2026 committee also approved a blanket waiver raising it to 17 for the fall evaluation period, effective through January 1, 2027 (quote: The blanket waiver is effective through January 1, 2027.); the module may apply 17 for fall 2026.')
row('The head coach\'s off-campus recruiting counts against the day pools (the July 2026 recommendation would remove that from 2027).', True, None, Y,
  [W('jul26', 'FBSOC July 2026 action item 1(c)', 'Eliminate the requirement to count an institution', True)],
  ('recruiting.hc_counts_against_days', 'Head coach off-campus days count against the pools', 'T4.2.2'))
row('FBS head coach may not recruit off campus in the spring period.', False, None, Y,
  [W('g2223', '2022-23 guide, Spring Evaluations', 'the head coach shall not engage in off-campus recruiting activities, participate in off-campus coaching clinics', False),
   W('jul26', 'FBSOC July 2026 action item 1(c)', 'head football coach may not recruit off campus during the spring contact period.', False)],
  ('recruiting.hc_spring_offcampus_allowed', 'Head coach may recruit off campus in the spring period', 'T4.6.1'),
  'Both texts are NCAA; the July 2026 text states it as continuing. One group, two documents.')
row('Recommended 2027 model: up to four recruiting opportunities per prospect from January 1 through May 31.', 4, 'count', '2027',
  [W('jul26', 'FBSOC July 2026 action item 1(d)', 'An institution may engage in up to four recruiting opportunities per prospective student-athlete during the January 1 through May 31')], None,
  'Recommendation only; Cabinet adoption not found. Not in the 2026 rule set; owed to a 2027 college rule set if adopted.')
row('Recommended 2027 model: one evaluation day per prospect in the fall evaluation period.', 1, 'count', '2027',
  [W('jul26', 'FBSOC July 2026 action item 1(d)', 'and one evaluation day during the fall evaluation period.')], None, 'Recommendation only.')
row('Recommended 2027 model: no more than one recruiting opportunity per prospect per week (Monday through Sunday).', 1, 'count', '2027',
  [W('jul26', 'FBSOC July 2026 action item 1(d)', 'may not engage in more than one recruiting opportunity per week per prospective')], None, 'Recommendation only.')
row('Recommended 2027 model: up to 17 off-campus recruiters (head coach one of them).', 17, 'count', '2027',
  [W('jul26', 'FBSOC July 2026 action item 1(e)', 'head football coach must be designated as one of the 17 off-campus recruiters.', 17),
   W('fs_jul', 'FootballScoop report', 'permit up to 16 program staff members and the head coach to recruit off campus', 17)], None, 'Recommendation only.')
row('Recommended 2027 model: up to 300 recruiting person days from January 1 through May 31, and 50 fall evaluation days.', 300, 'days', '2027',
  [W('jul26', 'FBSOC July 2026 action item 1(a)', 'engage in up to 300 recruiting person days from January 1 through May 31', 300),
   W('fs_jul', 'FootballScoop report', 'up to 300 off-campus recruiting person days during the winter and spring off-campus recruiting periods', 300)], None,
  'Recommendation only. The same report\'s discussion section speaks of 350 person days in two periods: a conflict inside the source (action item 300 kept).')

# =============== contacts, calls and messages (T4.2.1)
row('One in-person off-campus contact per prospect per week of a contact period.', 1, 'count', Y,
  [W('g2223', '2022-23 guide, Visits During Contact Period', 'One contact per PSA is permitted during each week of the contact period', 1)],
  ('recruiting.contacts_per_week', 'In-person off-campus contacts per prospect per week in a contact period', 'T4.2.1'),
  'One source. Newest NCAA guide found is August 2022 (2021-22 guide says the same); no 2026 text contradicting it was found. A current NCAA text is owed.')
row('No more than six off-campus contacts per prospect.', 6, 'count', Y,
  [W('g2223', '2022-23 guide, Evaluations and Contacts', 'Not more than six off-campus contacts per PSA at any site.', 6),
   W('ncsa', '2026-27 calendar page', 'Coaches are only allowed six off-campus contacts with each student-athlete.', 6),
   W('asu', 'Football recruiting guide', 'No more than 6 off-campus contacts per PSA at any site', 6)],
  ('recruiting.contacts_total', 'Off-campus contacts per prospect in all', 'T4.2.1'))
row('Phone calls: once a week from September 1 of the senior year, unlimited in a contact period.', 1, 'count', Y,
  [W('g2223', '2022-23 guide, Senior column', 'Once per week after September 1 of the senior year.', 1),
   W('ncsa', '2026-27 calendar page', 'Coaches can call athletes once a week after this time', 1),
   W('asu', 'Football recruiting guide', 'September 1 - senior year One call per week (unlimited during contact period)', 1)],
  ('recruiting.calls_per_week', 'Phone calls per prospect per week outside a contact period', 'T4.2.1'))
for k, mo, d, yb, meaning, q_g, q_n, q_a in [
 ('call_start', 9, 1, 1, 'Phone calls may start', 'Once per week after September 1 of the senior year.', 'September 1: Coaches can call athletes once a week after this time', 'September 1 - senior year One call per week (unlimited during contact period)')]:
    for suffix, val, unit in (('month', mo, 'month'), ('day', d, 'day'), ('years_before_class', yb, 'years')):
        row(f'{meaning}: {suffix.replace("_", " ")} {val} (September 1 of the senior year).', val, unit, Y,
          [W('g2223', '2022-23 guide, Senior column', q_g, val), W('ncsa', '2026-27 calendar page', q_n, val), W('asu', 'Football recruiting guide', q_a, val)],
          (f'recruiting.{k}_{suffix}' if suffix != 'years_before_class' else f'recruiting.{k}_years_before_class', f'{meaning}: {suffix.replace("_", " ")}', 'T4.2.1'))
for suffix, val, unit in (('month', 7, 'month'), ('day', 1, 'day'), ('years_before_class', 1, 'years')):
    row(f'Off-campus in-person contact may start July 1 before the senior year (limited to contact periods): {suffix.replace("_", " ")} {val}.', val, unit, Y,
      [W('g2223', '2022-23 guide, Senior column', 'July 1 prior to senior', val),
       W('ncsa', '2026-27 calendar page', 'July 1 before senior year:', val),
       W('asu', 'Football recruiting guide', 'July 1 - after junior year Limited to contact periods', val)],
      (f'recruiting.contact_start_{suffix}', f'Off-campus contact may start: {suffix.replace("_", " ")}', 'T4.2.1'))
# private electronic messages: the 2022-23 guide says September 1 (start of junior year); NCSA (2026-09-23) says June 15 after the sophomore year.
for suffix, val, old, unit in (('month', 6, 9, 'month'), ('day', 15, 1, 'day')):
    row(f'Private electronic messages may start June 15 after the sophomore year ({suffix} {val}); the 2022-23 NCAA guide and an undated compliance PDF say September 1 of the junior year.', val, unit, Y,
      [W('ncsa', '2026-27 calendar page', 'June 15 before junior year:', val),
       ],
      (f'recruiting.message_start_{suffix}', f'Private electronic messages may start: {suffix}', 'T4.2.1'),
      'DISPUTED between rule years, so only the newest page is a source: NCSA (updated 2026-09-23) states June 15; the 2022-23 NCAA guide (Junior column, Recruiting Materials and Electronic Transmissions: September 1) and an undated ASU compliance PDF state September 1 of the junior year. The current NCAA text was not found; an NCAA primary is owed.')
row('Private electronic messages may start two years before the class year (after the sophomore year / start of the junior year).', 2, 'years', Y,
  [W('ncsa', '2026-27 calendar page', 'June 15 before junior year:', 2)],
  ('recruiting.message_start_years_before_class', 'Private electronic messages may start: years before the class year', 'T4.2.1'),
  'Both readings (June 15 after the sophomore year; September 1 of the junior year) fall two years before the class year. One source row; the 2022-23 guide agrees on the year count.')

# =============== official visits (T4.5.1)
row('A prospect may take one official visit to any one school.', 1, 'count', Y,
  [W('feb26', 'FBSOC Feb 2026, informational item 2(d)', 'Institutional Limit of One Official Visit Per', 1),
   W('on3v', 'On3 article', 'Recruits are still only allowed to use one official visit for each school.', 1),
   W('uga', 'UGA compliance page', 'with no more than one official visit to any single institution', 1)],
  ('visits.official_per_school', 'Official visits a prospect may take to one school', 'T4.5.1'))
row('A second official visit to the same school is allowed after a head coach change.', True, None, Y,
  [W('on3v', 'On3 article', 'players can take a second official visit to a program if a head coaching change occurs after their previous official.', True)],
  ('visits.second_after_hc_change', 'Second official visit after a head coach change', 'T4.5.1'), 'One verbatim source (the CBS Sports article of 2023-04-14 reportedly says the same; its text was only read as a summary).')
row('An official visit may last no longer than 48 hours.', 48, 'hours', Y,
  [W('uga', 'UGA compliance page', 'An official visit may not last longer than 48 hours.', 48),
   W('on3v', 'On3 article', 'Official visits may last no longer than a two-night stay', 48)],
  ('visits.max_hours', 'Longest official visit', 'T4.5.1'), 'The On3 line says a two-night stay, read as the same 48 hours; the NCAA bylaw text was not read.')
row('The school may pay for a prospect and two family members on an official visit.', 2, 'count', Y,
  [W('on3v', 'On3 article', 'for up to two family members accompanying a prospect on that visit.', 2)],
  ('visits.paid_companions', 'Companions the school may pay for on an official visit', 'T4.5.1'), 'One source. The October 2026 proposal to raise it to four is a separate row (not adopted).')
row('Proposed October 2026: a school may pay for a prospect and four accompanying individuals on an official visit (could be adopted as early as January 2027).', 4, 'count', '2027',
  [W('ncaa_oct26', 'NCAA news 2026-10-07', 'a prospect and four accompanying individuals for an official visit', 4),
   W('fs_oct', 'FootballScoop 2026-10-08', 'for a prospect and four accompanying individuals on an official visit', 4)], None, 'Proposal only.')
row('The FBS limit of 70 official visits per school per year (from December 2022) was suspended by blanket waiver for 2024-25, and the FBS Oversight Committee adopted legislation in February 2026 eliminating it (pending Cabinet review April 14-15, 2026; outcome not read). The 2026 set therefore has no school cap.', 70, 'count', '2022-23',
  [W('ncaa_waiver', 'NCAA news 2024-11-08', 'FBS programs have been able to host a maximum of 70 official visits', 70),
   W('feb26', 'FBSOC Feb 2026, informational item 1', 'adopted legislation to eliminate the institutional limit on the number of official visits permitted in FBS.')], None,
  'Not a 2026 rule-set value: visits.school_cap stays absent (limit not applied), which matches the February 2026 elimination.')

# =============== people around the prospect and signees
row('A person associated with a prospect may not be hired from two years before to two years after the prospect enrols (IAWP, FBS).', 2, 'years', Y,
  [W('fs_iawp', 'FootballScoop IAWP report', 'for a two-year period before and after the student\'s anticipated and actual enrollment', 2)],
  ('iawp.window_years', 'Years before and after enrolment during which an associated person may not be hired', 'T4.4.2'),
  'One source (the legislation is from 2017). The July 2026 FBSOC report says it did not recommend changes to the IAWP legislation but states no number.')
row('FBS football signee limit of 25 per year, adopted for recruits signing after August 1, 2017. No source read states its removal.', 25, 'count', '2017-18',
  [W('fs_iawp', 'FootballScoop IAWP report', 'FBS schools are limited to signing 25 prospective and current student-athletes')], None,
  'Not a 2026 rule-set value: recruiting.signee_cap stays absent. That absence rests on the bible (no cap from 2025-26), NOT on a source read in this pass; owed.')

# =============== initial eligibility (T4.5.3)
row('Division I qualifier: 16 NCAA-approved core courses.', 16, 'count', Y,
  [W('fball', 'Are You Ready to Play Football?', 'Earn 16 NCAA-approved core-course credits in the following areas:', 16),
   W('berk', 'Berkeley page', 'Complete 16 Core Courses, including 10 before your seventh semester:', 16),
   W('img', 'IMG Academy article', 'Completing 16 NCAA-approved core courses throughout high school', 16)],
  ('college.initial_eligibility.core_courses', 'Core courses needed to qualify', 'T4.5.3'))
row('Division I qualifier: minimum core-course grade average 2.3.', 2.3, 'gpa', Y,
  [W('fball', 'Are You Ready to Play Football?', 'Earn a minimum 2.3 core-course GPA.', 2.3),
   W('berk', 'Berkeley page', 'Earn a minimum 2.300 Grade-Point Average in core courses.', 2.3),
   W('img', 'IMG Academy article', 'Earning the required core-course GPA (2.3 for Division I, 2.2 for Division II)', 2.3)],
  ('college.initial_eligibility.core_gpa', 'Lowest core grade average to qualify', 'T4.5.3'))
row('Division I qualifier: 10 of the 16 core courses before the seventh semester.', 10, 'count', Y,
  [W('fball', 'Are You Ready to Play Football?', 'Complete 10 of your 16 NCAA-approved core-course credits, including seven in English, math or science, before', 10),
   W('berk', 'Berkeley page', 'Complete 16 Core Courses, including 10 before your seventh semester:', 10),
   W('img', 'IMG Academy article', 'Yes: 10 courses, including 7 in English, math, or science, completed before senior year', 10)],
  ('college.initial_eligibility.core_before_final_year', 'Core courses finished before the last year of high school', 'T4.5.3'))
row('Of those 10, seven in English, mathematics or science.', 7, 'count', Y,
  [W('fball', 'Are You Ready to Play Football?', 'including seven in English, math or science, before', 7),
   W('ncaa_di', 'NCAA Division I page', 'Ten of your core courses (7 in English, math, or science) must be completed before start of the seventh semester', 7),
   W('img', 'IMG Academy article', 'Yes: 10 courses, including 7 in English, math, or science, completed before senior year', 7)],
  ('college.initial_eligibility.core_before_final_year_ems', 'Of those, courses in English, mathematics or science', 'T4.5.3'))

# =============== two-year college transfers (T4.1.2)
row('Two-year college transfer grade average: 2.000 for transfers seeking eligibility in 2026-27 and after (it was 2.500). Approved by the Division I Cabinet on June 24, 2026.', 2.0, 'gpa', Y,
  [W('aec26', 'AEC report May 8, 2026, Legislative Action', 'the proposal reduces the transferable grade-point average requirement from 2.500 to 2.000', 2.0),
   W('njcaa', 'NJCAA release', 'the reduction of the transferable GPA requirement from 2.5 to 2.0 for two-year transfers', 2.0)],
  ('juco.transfer_gpa', 'Two-year transfer grade point minimum', 'T4.1.2'),
  'Primary text is the committee recommendation to the Cabinet; adoption is stated by the NJCAA release (adopted by the Division I Cabinet on June 24). The final legislative text (LSDBi) was not reachable.')
row('May 2026 two-year transfer change removes the 12-hour average and the 48/72-hour requirement for nonqualifiers (effective for 2026-27). The juco.nonqualifier_hours and juco.qualifier_hours_per_term keys therefore have no value in the 2026 set (limit not applied).', False, None, Y,
  [W('aec26', 'AEC report May 8, 2026, Legislative Action', 'eliminates certain credit-hour accumulation thresholds (including the average of 12 hours and the 48/72-hour requirement for nonqualifiers)', False),
   W('njcaa', 'NJCAA release', 'transfer credit-hour requirements will now be based on enrollment history')], None,
  'The replacement test is "based on enrollment history" (NJCAA); its text was not read, so no replacement key is filled. The old values (3 terms, 48 hours, 12 per term) are not restated by any source read this pass.')
