"""Fifth G-10 pass (2026-11-26), thread "Fill remaining discipline and compliance values". Pages read on 2026-11-26
through the built-in browser on the PC (club suspension, school handbooks) or the cloud fetch (case reports).
Status is computed, never typed. Quotes are as returned; they cannot be re-found by the lint."""
from core import *
from rows_cba import LG
from rows_web import sec, W
from rows_more import COL
Y = '2026'

sec('bw_dobbins', 'Broncos Wire via Yahoo Sports, Broncos place J.K. Dobbins on reserve/suspended list (Jon Heath, 2026-11-25, https://sports.yahoo.com/nfl/articles/broncos-place-j-k-dobbins-220952934.html)', 'broncos-wire-yahoo')
sec('dg_dobbins', 'Denver Gazette, Broncos suspend Dobbins for 1 game for conduct detrimental to the team (Chris Tomasson, 2026-11-24, https://www.denvergazette.com/2026/11/24/broncos-suspend-dobbins-for-1-game-for-conduct-detrimental-to-the-team/)', 'denver-gazette')
sec('nbcb_jones', 'NBC Sports Boston via Yahoo Sports, Why Patriots moved Jack Jones, Jake Bailey to reserve/suspended list (Justin Leger, 2023-01-06, https://sports.yahoo.com/patriots-move-jack-jones-jake-224000279.html)', 'nbc-sports-boston')
sec('il_sa', 'University of Illinois Athletics, Student Conduct Policies, Student-Athlete Handbook (https://fightingillini.com/sports/2022/7/21/student-conduct-policies-sa-handbook)', 'illinois')
sec('unf_sa', 'University of North Florida Athletics, Student-Athlete Handbook, Code of Conduct (https://www.unf.edu/athletics/student-handbook/conduct.html)', 'unf')
sec('brown_sa', 'Brown University, Student-Athlete Code of Conduct policy (https://policy.brown.edu/policy/student-athlete-conduct)', 'brown')
sec('pft_fake', 'NBC Sports ProFootballTalk, NFL warns teams about faking injuries (2022-12-04, https://profootballtalk.nbcsports.com/2022/12/04/nfl-warns-teams-about-faking-injuries/)', 'nbc-sports-pft')
sec('nflcom_fake', 'NFL.com, Saints, HC Dennis Allen, DE Cameron Jordan fined for violating NFL rule on faking an injury (2022-12, https://www.nfl.com/news/saints-hc-dennis-allen-de-cameron-jordan-fined-for-violating-nfl-rule-on-faking-)', 'nfl-com')
sec('yahoo_fake', 'Yahoo Sports, NFL reportedly fines Saints, Cameron Jordan for allegedly faking MNF injury (2022-12-10, https://sports.yahoo.com/nfl-reportedly-fines-saints-cameron-jordan-500-k-for-allegedly-fake-mnf-injury-181729870.html)', 'yahoo-sports')
sec('espn_atl', 'ESPN, Falcons, Arthur Smith fined for handling of Week 7 injury report (2023-12-22, https://africa.espn.com/nfl/story/_/id/39168452/falcons-arthur-smith-fined-handling-week-7-injury-report)', 'espn')
sec('cbs_pit', 'CBS Sports, Steelers, Mike Tomlin reportedly fined for hiding Ben Roethlisberger\'s injury (2019-11-01, https://www.cbssports.com/nfl/news/steelers-mike-tomlin-reportedly-fined-for-hiding-ben-roethlisbergers-injury-on-week-2-report)', 'cbs-sports')
sec('pft_det', 'NBC Sports ProFootballTalk, Lions, Bob Quinn, Matt Patricia fined for failing to properly report Matthew Stafford injury (2019-12-07, https://profootballtalk.nbcsports.com/2019/12/07/lions-bob-quinn-matt-patricia-fined-for-failing-to-properly-report-matt-stafford-injury/)', 'nbc-sports-pft')
sec('ap_spy', 'AP wire text as carried by NFL.com (https://nfl.com/_amp/nfl-fines-belichick-strips-patriots-of-draft-pick-09000d5d80251b7e) and Patriots.com (same text, one group)', 'ap-wire')
sec('fox_spy', 'Fox News, Patriots lose first draft pick, fined maximum penalty for spying (2007-09-13, https://www.foxnews.com/story/patriots-lose-first-draft-pick-fined-maximum-penalty-for-spying)', 'fox-news')

NC1 = 'Case-based key (not a published schedule). Value read from the case reports named; no repeat amount is published, so the repeat key stays absent.'

# ---- G-45 club suspension roster status
LG.row('pro', 'A player suspended by his club is placed on Reserve/Suspended by Club and does not count against the 53-man roster.', 'reserve_suspended', None, Y,
  [W('bw_dobbins', 'Article text, 2026 case', 'While suspended, Dobbins will not count against the 53-man roster.', 'reserve_suspended'),
   W('dg_dobbins', 'Article text, 2026 case', 'since Dobbins will not count this week on the 53-man roster', 'reserve_suspended'),
   W('nbcb_jones', 'Article text, 2023 case', 'will not be paid their base salary or count toward roster limits while on the list', 'reserve_suspended')],
  key=('club_discipline.club_suspension_roster_status', 'Roster treatment of a club-suspended player', 'L3.2.4', ['counts_inactive', 'reserve_suspended']),
  notes='Three independent outlets, two clubs, 2023 and 2026. The CBA (Art. 42) says nothing about roster status of a club suspension; the NFL.com 2026 reserve-list page did not render the November 2026 table, so the transaction wire itself was not read.')

# ---- G-45 college discipline model
CQ = 'Sanctions are applied under the school\'s own code and team rules, not a labour agreement schedule.'
COL.row('college', 'College football player discipline runs under the school\'s student code and team rules, not a fine schedule in a labour agreement.', 'school_code', None, '2025-26',
  [W('il_sa', 'Student Conduct Policies', 'Any sanctions taken against a student-athlete by the DIA Director of Athletics (“director”) and/or a head coach for violations of the Student Code', 'school_code'),
   W('unf_sa', 'Code of Conduct page', 'Failure to self-report a criminal charge of conviction constitutes grounds for immediate suspension or expulsion from the University.', 'school_code'),
   W('brown_sa', 'Policy text', 'Athletes must comply with the Code of Student Conduct and all policies referenced therein.', 'school_code')],
  key=('club_discipline.model', 'Which club discipline model applies', 'L3.5.1', ['labour_agreement', 'school_code']),
  notes='Three universities (Illinois, UNF, Brown). The sources show the governing code; none states that fines are absent, so that absence is not claimed. A modeling choice for the college file: no NCAA rule defines team discipline.')

# ---- G-28 feigned injury: the league memo minimums (2022), repeated by three outlets
def fk(f, v, label, qs):
    LG.row('pro', f'Feigning an injury: minimum fine for the {label} is ${v//100:,}.', v, 'cents', '2022',
      [W(s, 'Article text', q, v) for s, q in qs],
      key=(f'compliance.feigned_injury.{f}', f'Feigned-injury penalty: {f.replace("_", " ")}', 'I11.8.1'),
      notes='League memo minimums of December 2022, reported by three outlets. Minimums, not maxima; a suspension or lost pick is also possible under the memo (not entered). Repeat amounts are not published.')
fk('club_fine_first_cents', 35000000, 'club', [('pft_fake', 'a minimum fine of $350,000 for the club'), ('nflcom_fake', 'listed the minimum fines of $350,000 for clubs'), ('yahoo_fake', 'a minimum fine of $350,000 for the club')])
fk('fine_head_coach_first_cents', 10000000, 'head coach', [('pft_fake', 'a minimum fine of $100,000 for the head coach'), ('nflcom_fake', '$100,000 for a head coach'), ('yahoo_fake', 'a minimum fine of $100,000 for the head coach')])
fk('fine_assistant_first_cents', 5000000, 'assistant coaches', [('pft_fake', 'a minimum fine of $50,000 for assistant coaches, if applicable'), ('nflcom_fake', 'and $50,000 for players/assistant coaches for violating the rule'), ('yahoo_fake', 'a minimum fine of $50,000 for assistant coaches, if applicable')])
fk('fine_player_first_cents', 5000000, 'players', [('pft_fake', 'a minimum fine of $50,000 for players'), ('nflcom_fake', 'and $50,000 for players/assistant coaches for violating the rule'), ('yahoo_fake', 'a minimum fine of $50,000 for players')])

# ---- G-28 injury-report shading: three cases with the same amounts
for f, v, who, qs in (
  ('club_fine_first_cents', 7500000, 'club', [('cbs_pit', 'the Steelers have been fined $75,000', '2019 Steelers'), ('pft_det', 'The NFL fined the Lions $75,000', '2019 Lions'), ('espn_atl', 'The NFL has fined the Atlanta Falcons $75,000', '2023 Falcons')]),
  ('fine_head_coach_first_cents', 2500000, 'head coach', [('cbs_pit', 'and head coach Mike Tomlin an additional $25,000', '2019 Steelers'), ('pft_det', 'coach Matt Patricia $25,000', '2019 Lions'), ('espn_atl', 'and coach Arthur Smith $25,000', '2023 Falcons')])):
    LG.row('pro', f'Injury-report violation: the {who} fined ${v//100:,} (three cases, 2019 and 2023).', v, 'cents', 'case',
      [W(s, c, q, v) for s, q, c in qs],
      key=(f'compliance.injury_report_shading.{f}', f'Injury-report penalty: {f.replace("_", " ")}', 'C11.3.1'),
      notes=NC1 + ' Three cases (Steelers 2019, Lions 2019, Falcons 2023), each read in one outlet; the Lions case also fined the general manager $10,000 (not entered: a different amount from the 2019-2023 head-coach pattern would need its own key and the executive group has one case).')

# ---- G-28 signal recording: Spygate 2007
for f, v, who, qa, qb in (
  ('fine_head_coach_first_cents', 50000000, 'head coach', 'Belichick was fined the NFL maximum of $500,000 Thursday', 'fine him $500,000'),
  ('club_fine_first_cents', 25000000, 'club', 'the Patriots were ordered to pay $250,000 for spying on an opponent\'s defensive signals', 'dock the team $250,000')):
    LG.row('pro', f'Signal recording (Spygate, 2007): the {who} fined ${v//100:,}.', v, 'cents', '2007',
      [W('ap_spy', 'AP text', qa, v), W('fox_spy', 'Article text', qb, v)],
      key=(f'compliance.signal_recording.{f}', f'Signal-recording penalty: {f.replace("_", " ")}', 'I11.8.1'),
      notes=NC1 + ' Single case (2007 Patriots). The draft-pick penalty (first-round pick if the club makes the playoffs, otherwise second and third) is conditional and is not entered as a pick key. The ESPN wire page returned no text.')
