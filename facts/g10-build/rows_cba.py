from core import *
CBA = '/mnt/project-files/nfl-rules/cba_2020.txt'
source('cba', '2020 NFL-NFLPA Collective Bargaining Agreement (full text)', 'nfl-nflpa-cba-2020', True, 'primary text', CBA, 'cba_2020.txt')
LG = Reg('league-rule', 'league'); CAP = Reg('league-rule', 'cap')
Y = '2026'
def cba(where, quote, value=None): return S('cba', where, quote, value)
N = 'Primary text read directly this session; one source so far. The 2020 CBA runs to 2030 (Article 26 table).'

# ---- squad size (Article 25)
LG.row('pro','Game-day Active List limit: 48 players (with at least 8 offensive linemen).',48,'count',Y,[cba('Article 25 Section 1','the Active List limit shall be increased from forty-six players per Club to forty-eight players per Club',48)],key=('roster.active_limit','Game-day Active List limit','C5.2.1'),notes=N)
LG.row('pro','Game-day Active List limit when fewer than 8 offensive linemen are active: 47.',47,'count',Y,[cba('Article 25 Section 1','such Club’s Active List limit shall be forty-seven players',47)],key=('roster.active_limit_short_line','Active List limit with fewer than the required linemen','C5.2.1'),notes=N)
LG.row('pro','Minimum offensive linemen on the Active List for the 48 limit: 8.',8,'count',Y,[cba('Article 25 Section 1','a minimum of eight players whose primary playing position is Center, Guard or Tackle',8)],key=('roster.active_min_linemen','Offensive linemen required for the full Active List','C5.2.1'),notes=N)
LG.row('pro','A club may carry fewer than 48 on its Active List but never fewer than 44.',44,'count',Y,[cba('Article 25 Section 1','but no fewer than forty-four players',44)],key=('roster.active_floor','Smallest legal Active List','C5.1.1'),notes=N)
LG.row('pro','Regular season and postseason Active/Inactive List limit: 53.',53,'count',Y,[cba('Article 25 Section 4(a)','shall not exceed 53 players unless a Club has chosen to elevate',53)],key=('roster.active_inactive_limit','Active/Inactive List limit','C5.1.1'),notes=N)
LG.row('pro','At most two practice squad players may be elevated for one game.',2,'count',Y,[cba('Article 25 Section 4(a)','elevate either one or two players from its Practice Squad',2)],key=('roster.elevations_max_per_game','Practice squad elevations per club per game','C5.3.2'),notes=N)
# ---- service and free agency status (Articles 1, 8)
LG.row('pro','An accrued season needs 6 or more regular season games on full pay status.',6,'games',Y,[cba('Article 8 Section 1(a)','for a total of six or more regular season games',6)],key=('service.accrued_games','Games for an accrued season','C5.1.2'),notes=N)
LG.row('pro','Unrestricted free agent: 4 or more accrued seasons.',4,'seasons',Y,[cba('Article 1 definitions','means a Veteran with four or more Accrued Seasons',4)],key=('fa.ufa_min_accrued','Accrued seasons for unrestricted status','C8.1.1'),notes=N)
LG.row('pro','Restricted free agent: exactly 3 accrued seasons.',3,'seasons',Y,[cba('Article 1 definitions','means a Veteran who has three Accrued Seasons',3)],key=('fa.rfa_accrued','Accrued seasons for restricted status','C8.1.1'),notes=N)
LG.row('pro','Exclusive rights player: fewer than 3 accrued seasons.',3,'seasons',Y,[cba('Article 1 definitions','means a player with fewer than three Accrued Seasons',3)],key=('fa.erfa_below_accrued','Exclusive rights below this many accrued seasons','C8.1.1'),notes=N)
# ---- tags (Article 10)
LG.row('pro','Franchise and transition tags may be used from the 22nd day before the league year.',22,'days',Y,[cba('Article 10 Section 2','twenty-second day preceding the first day of the new League Year',22)],key=('tag.window_opens_days_before','Tag window opens this many days before the league year','C6.4.3'),notes=N)
LG.row('pro','The tag window closes at 4 p.m. New York time on the 8th day before the league year.',8,'days',Y,[cba('Article 10 Section 2','will end at 4:00 pm New York time on the eighth day preceding the first day of the new League Year',8)],key=('tag.window_closes_days_before','Tag window closes this many days before the league year','C6.4.3'),notes=N)
LG.row('pro','Franchise tag tender is the average of the five largest prior-year salaries at the position.',5,'count',Y,[cba('Article 10 Section 2','the “Franchise Tag” is the average of the five largest Prior Year Salaries',5)],key=('tag.franchise_top_n','Salaries averaged for the franchise tag','C6.4.3'),notes=N)
LG.row('pro','Tender floor: 120 percent of the player’s prior-year salary.',120,'percent',Y,[cba('Article 10 Section 2(a)(i)','120% of his Prior Year Salary, whichever is greater',120)],key=('tag.prior_salary_pct','Tender as percent of prior-year salary','C6.4.3'),notes=N)
LG.row('pro','A club that signs a nonexclusive franchise player away owes two first-round picks.',2,'count',Y,[cba('Article 10 Section 2(a)(i)','Draft Choice Compensation of two first round draft selections',2)],key=('tag.nonexclusive_first_round_picks','First-round picks owed for a nonexclusive tag','C6.4.3'),notes=N)
LG.row('pro','Third franchise designation: 144 percent of the player’s own prior-year salary is one floor.',144,'percent',Y,[cba('Article 10 Section 2(b)','(C) 144% of his Prior Year Salary',144)],key=('tag.third_prior_salary_pct','Third-tag floor as percent of prior salary','C6.4.3'),notes=N)
LG.row('pro','Transition tag is the average of the ten largest prior-year salaries at the position.',10,'count',Y,[cba('Article 10 Section 4','is the average of the ten largest Prior Year Salaries for players at that position',10)],key=('tag.transition_top_n','Salaries averaged for the transition tag','C6.4.3'),notes=N)
LG.row('pro','Multiyear deal for a franchise player must be signed by July 15 at 4 p.m. New York time.',15,'day of July',Y,[cba('Article 10 Section 2(k)','on July 15 of the League Year',15)],key=('tag.multiyear_deadline_july_day','Day of July after which only a one-year deal is allowed','C6.4.3'),notes=N)
# ---- cap (Articles 7, 12, 13)
CAP.row('pro','Minimum team cash spending: 90 percent of the caps for 2024 to 2026 (and 2021 to 2023 and 2027 to 2030).',90,'percent','2024-2026',[cba('Article 12 Section 9(b)','there shall be a guaranteed Minimum Team Cash Spending of 90% of the Salary Caps for such',90)],key=('cap.min_cash_spend_pct','Minimum cash spending as percent of cap','C6.2.3'),notes=N)
CAP.row('pro','From the league year start to the first regular-season day only the 51 highest-valued contracts count in full.',51,'count',Y,[cba('Article 13 Section 6(a)(i)','among the Team’s 51 highest valued Player Contracts, tenders and Offer Sheets',51)],key=('cap.top_n_contracts','Contracts counted in full in the offseason','C6.2.1'),notes=N)
CAP.row('pro','Signing bonus proration: straight line, at most 5 years.',5,'years',Y,[cba('Article 13 Section 6(b)(i)','with a maximum proration of five years, in determining Team Salary and Salary',5)],key=('cap.proration_max_years','Longest signing-bonus proration','C6.2.2'),notes=N)
CAP.row('pro','Each club may designate up to two releases made on or before June 1 to be treated as June 2.',2,'count',Y,[cba('Article 13 Section 6(b)(ii)(1)','each Club may designate up to two Player Contracts',2)],key=('cap.june1_designations','Post-June 1 designations per club per year','C6.3.2'),notes=N)
CAP.row('pro','A club put over the cap by acceleration has seven days to conform and may sign no one until it has room.',7,'days',Y,[cba('Article 13 Section 6(b)(ii)(1)','the Team will have seven days to conform with the Salary Cap, but may not sign any players',7)],key=('cap.conform_days','Days to get under the cap after acceleration','C6.3.2'),notes=N)
CAP.row('pro','Rookie contract: 4 years for first-round picks (club option for a fifth).',4,'years',Y,[cba('Article 7 Section 3(a)','four years for Rookies selected in the first round of the Draft, with a Club option for a fifth year',4)],key=('rookie.length_round_1','First-round rookie contract years','C6.4.2'),notes=N)
CAP.row('pro','Rookie contract: 4 years for rounds two through seven.',4,'years',Y,[cba('Article 7 Section 3(a)','four years for Rookies selected in rounds two through seven of the Draft',4)],key=('rookie.length_later_rounds','Rounds 2 to 7 rookie contract years','C6.4.2'),notes=N)
CAP.row('pro','Rookie contract: 3 years for undrafted rookies.',3,'years',Y,[cba('Article 7 Section 3(a)','three years for Undrafted Rookies',3)],key=('rookie.length_undrafted','Undrafted rookie contract years','C6.4.2'),notes=N)
CAP.row('pro','No rookie contract may rise by more than 25 percent of year-one salary in a year.',25,'percent',Y,[cba('Article 7 Section 3(e)','annual increase of more than 25% of the player’s Year-One Rookie Salary',25)],key=('rookie.max_annual_increase_pct','Largest yearly rise as percent of year-one salary','C6.4.2'),notes=N)
CAP.row('pro','Undrafted rookie signing-bonus pool per club: $160,000 in 2021, then rising with the rookie pool.',160000,'USD','2021',[cba('Article 7 Section 1(i)','a maximum of $160,000 per Club may be paid to Undrafted Rookies as signing bonus',160000)],key=('rookie.undrafted_pool_2021_usd','Undrafted signing-bonus pool in 2021','C7.4.1'),notes='2026 amount not found in any source read; it rises each year by the percent rise in the Total Rookie Compensation Pool.')
CAP.row('pro','Fifth-year option notice is due before May 3 of year four (CBA text); the league calendar date can differ.',3,'day of May',Y,[cba('Article 7 Section 7(a)','prior to May 3 of the following League Year',3)],key=('rookie.option_deadline_before_may_day','Fifth-year option notice must come before this day of May','C6.4.2'),notes='Conflict with May 1 on the 2026 league calendar (bible C6.4.2); the calendar date is data per year.')
# minimum salary table, Article 26 section 1(a)
import re
text,_ = load(CBA)
yrs = list(range(2020, 2031)); tiers = [('0','cs0'),('1','cs1'),('2','cs2'),('3','cs3'),('4-6','cs4_6'),('7+','cs7_plus')]
start = text.find('#CS 2020 2021')
for lab, k in tiers:
    m = re.search(r'(?<= )'+re.escape(lab)+r' \$[\d,]+ \$[\d,]+ \$[\d,]+ \$[\d,]+ \$[\d,]+ \$[\d,]+ \$[\d,]+ \$[\d,]+ \$[\d,]+ \$[\d,]+ \$[\d,]+', text[start:])
    row = m.group(0).strip()
    amts = [int(a.replace(',',''))*1000 for a in re.findall(r'\$([\d,]+)', row)]
    for y in range(2026, 2031):
        v = amts[y-2020]
        CAP.row('pro',f'Minimum salary in {y}, active/inactive list, {lab} credited seasons: ${v:,}.',v,'USD',str(y),[cba('Article 26 Section 1(a) table (amounts in thousands)',row,v)],key=(f'cap.min_salary_y{y}_{k}',f'Minimum salary {y} at {lab} credited seasons','C6.4.1'),notes=N)
# ---- work rules (Article 21)
W = 'Article 21 Section 2'
def wk(statement, value, unit, quote, key, meaning, where=W):
    LG.row('pro',statement,value,unit,Y,[cba(where,quote,value)],key=(key,meaning,'C11.2.1'),notes=N)
wk('Offseason program: nine weeks.',9,'weeks','official nine-week offseason workout program','work.offseason_weeks','Length of the offseason program')
wk('No more than four workouts per week for any player.',4,'count','no more than four workouts per week for any individual player','work.workouts_per_week','Workouts per player per week')
wk('Phase one lasts two weeks.',2,'weeks','Phase One shall consist of the first two weeks','work.phase1_weeks','Phase one length',W+'(c)(i)')
wk('Phase two lasts three weeks.',3,'weeks','Phase Two shall consist of the next three weeks','work.phase2_weeks','Phase two length',W+'(c)(ii)')
wk('Phase three lasts four weeks.',4,'weeks','Phase Three shall consist of the next four weeks','work.phase3_weeks','Phase three length',W+'(c)(iii)')
wk('Ten OTA days in phase three.',10,'days','each Club may conduct a total of ten days of organized team practice activity','work.ota_days','OTA days',W+'(c)(iii)')
wk('At most four OTA days in the third or fourth week of phase three.',4,'days','A maximum of four days of OTAs may be conducted during either the third week or the fourth week',  'work.ota_max_week_3_or_4','Most OTA days in the week that holds no minicamp',W+'(c)(iii)')
wk('Program may not begin before the third Monday in April (first Monday for a club with a new head coach).',3,'Monday of April','cannot begin prior to the third Monday in April for all other Clubs','work.start_monday_of_april','Earliest start Monday in April',W+'(d)')
