"""Sixth G-10 pass (2026-11-26): G-28 one-off class amounts from league announcements, case reports read through the cloud fetch.
Status is computed, never typed. Quotes are as returned; the lint cannot re-find them."""
from core import *
from rows_cba import LG
from rows_web import sec, W

NC1 = 'Case-based key (not a published schedule). Value read from the case reports named; no repeat amount is published, so the repeat key stays absent.'
def s(n, c, g): sec(n, c, g)
s('fox_noise', 'Fox Sports, Falcons lose 2016 draft pick, receive fine for piping artificial noise into stadium (2015-03-30, https://foxsports.com/stories/other/falcons-lose-2016-draft-pick-receive-fine-for-piping-artificial-noise-into-stadium)', 'fox-sports')
s('abc_noise', 'ABC7, Falcons fined $350K, lose draft pick (2015-03-30, https://abc7.com/post/falcons-fined-$350k-lose-draft-pick/587664/)', 'abc')
s('cbs_noise', 'CBS News Detroit (AP), Falcons fined, lose draft pick for pumping in fake noise (2015-03-30, https://www.cbsnews.com/amp/detroit/news/falcons-fined-lose-draft-pick-for-pumping-in-fake-noise)', 'cbs-news-ap')
s('nfl_dfl', 'NFL.com, NFL releases statement on Patriots violations (2015-05-11, https://www.nfl.com/news/nfl-releases-statement-on-patriots-violations-0ap3000000492190)', 'nfl-com')
s('npr_dfl', 'NPR, NFL suspends Tom Brady for 4 games over Deflategate scandal (2015-05-11, https://www.npr.org/sections/thetwo-way/2015/05/11/406009797/nfl-suspends-tom-brady-for-4-games-over-deflategate-scandal)', 'npr')
s('abc_dfl', 'ABC News, Deflategate: Tom Brady suspended for 4 games, Patriots fined $1 million (https://abcnews.com/Sports/deflategate-tom-brady-suspended-games/story?id=30966151)', 'abc-news')
s('nfl_tom', 'NFL.com, Mike Tomlin fined $100,000 for actions in Steelers loss (2013-12-04, https://nfl.com/_amp/mike-tomlin-fined-100-000-for-actions-in-steelers-loss-0ap2000000292517)', 'nfl-com')
s('npr_tom', 'NPR, Steelers coach fined $100K for interfering with play (2013-12-04, https://www.npr.org/sections/thetwo-way/2013/12/04/248881870/steelers-coach-fined-100k-for-interfering-with-play)', 'npr')
s('si_tom', 'Sports Illustrated, Mike Tomlin fine (2013-12-04, https://www.si.com/nfl/2013/12/04/mike-tomlin-fine-pittsburgh-steelers-baltimore-ravens)', 'si')
s('nfl_con', 'NFL.com, Seahawks fined for not following concussion protocol (2017-12-21, https://www.nfl.com/news/seahawks-fined-for-not-following-concussion-protocol-0ap3000000896202)', 'nfl-com')
s('cbs_con', 'CBS Sports, Seahawks fined $100K for violating concussion protocol, letting Russell Wilson play (2017-12-21; headline only, body truncated in the fetch)', 'cbs-sports')
s('pft_con', 'NBC Sports ProFootballTalk, NFL fines Seahawks $100,000 for Russell Wilson concussion protocol violation (2017-12-21; page title only, body truncated in the fetch)', 'nbc-sports-pft')
s('nfl_mia', 'NFL.com, Dolphins lose 2023 first-round draft pick, owner Stephen Ross suspended (2022-08-02, https://nfl.com/news/dolphins-lose-2023-first-round-draft-pick-owner-stephen-ross-suspended-following)', 'nfl-com')
s('npr_mia', 'NPR, NFL punishes Miami Dolphins owner over inquiry into tanking, tampering and Tom Brady (2022-08-02, https://www.npr.org/2022/08/02/1115226180/nfl-fines-miami-dolphins-owner-stephen-ross-tom-brady)', 'npr')

def row(cls, field, val, unit, text, srcs, owner, extra=''):
    LG.row('pro', text, val, unit, 'case', [W(a, 'Article text', q, val) for a, q in srcs],
      key=(f'compliance.{cls}.{field}', f'{cls.replace("_", " ")} penalty: {field.replace("_", " ")}', owner), notes=NC1 + extra)

row('crowd_noise', 'club_fine_first_cents', 35000000, 'cents', 'Piped crowd noise (Falcons, 2015): club fined $350,000.',
    [('fox_noise', 'were fined $350,000 on Monday and lost a fifth-round draft pick in 2016'), ('abc_noise', 'have been fined $350,000 and will forfeit a 2016 draft pick'), ('cbs_noise', 'the Falcons have been fined $350,000 and will forfeit their fifth-round selection in the 2016 draft')], 'I11.8.1', ' Single case.')
row('crowd_noise', 'pick_round_first', 5, 'round', 'Piped crowd noise (Falcons, 2015): a fifth-round pick forfeited.',
    [('fox_noise', 'lost a fifth-round draft pick in 2016'), ('abc_noise', 'will lose a fifth-round pick in next year\'s draft'), ('cbs_noise', 'forfeit their fifth-round selection in the 2016 draft')], 'I11.8.1', ' Single case.')
row('ball_tampering', 'club_fine_first_cents', 100000000, 'cents', 'Football inflation (Patriots, 2015): club fined $1 million.',
    [('nfl_dfl', 'are fined $1 million and will forfeit the club\'s first-round selection in the 2016 NFL Draft'), ('npr_dfl', 'a $1 million fine for the Patriots'), ('abc_dfl', 'The Patriots will also be fined $1 million')], 'I11.8.1', ' Single case.')
row('ball_tampering', 'pick_round_first', 1, 'round', 'Football inflation (Patriots, 2015): the first-round pick of 2016 forfeited (a 2017 fourth-round pick as well; the key holds the highest round).',
    [('nfl_dfl', 'will forfeit the club\'s first-round selection in the 2016 NFL Draft'), ('npr_dfl', 'The Patriots will also lose their first-round pick in next year\'s draft'), ('abc_dfl', 'will have to forfeit first-round selection in the 2016 NFL Draft')], 'I11.8.1', ' Single case; the fourth-round 2017 pick is not entered.')
row('ball_tampering', 'suspension_games_first', 4, 'count', 'Football inflation (Patriots, 2015): the responsible player suspended four games without pay.',
    [('nfl_dfl', 'will be suspended without pay for the first four games of the 2015 regular season'), ('npr_dfl', 'Brady will sit out the first four games of the 2015 regular season without pay'), ('abc_dfl', 'will be suspended without pay for the first four games of the regular 2015 NFL season')], 'I11.8.1', ' Single case.')
row('sideline_interference', 'fine_head_coach_first_cents', 10000000, 'cents', 'Sideline interference (Tomlin, 2013): head coach fined $100,000.',
    [('nfl_tom', 'The NFL fined Pittsburgh Steelers coach Mike Tomlin $100,000'), ('npr_tom', 'Pittsburgh Steelers coach Mike Tomlin has been fined $100,000 for interfering with a kickoff return'), ('si_tom', 'Mike Tomlin has been fined $100,000 by NFL Executive Vice President of Football Operations Ray Anderson')], 'I11.8.1', ' Single case; the club was not fined.')
row('concussion_protocol', 'club_fine_first_cents', 10000000, 'cents', 'Concussion protocol (Seahawks, 2017): club fined $100,000 (remedial training also ordered).',
    [('nfl_con', 'A joint NFL and NFL Players Association review resulted in a $100,000 fine for the team'), ('cbs_con', 'Seahawks fined $100K for violating concussion protocol, letting Russell Wilson play'), ('pft_con', 'NFL fines Seahawks $100,000 for Russell Wilson concussion protocol violation')], 'D11.4.1', ' Single case. The CBA $250,000 floor for a repeat is a separate row.')
row('tampering_players', 'fine_executive_first_cents', 150000000, 'cents', 'Tampering (Dolphins, 2022): owner fined $1.5 million.',
    [('nfl_mia', 'Ross also has been fined $1.5 million, has been removed from all NFL committees indefinitely'), ('npr_mia', 'the NFL hit Ross with a $1.5 million fine and suspended him through Oct. 17')], 'I11.8.1', ' Single case; the CBS page fetch was truncated so it is not counted.')
row('tampering_players', 'pick_round_first', 1, 'round', 'Tampering (Dolphins, 2022): a 2023 first-round pick forfeited (a 2024 third-round pick as well; the key holds the highest round).',
    [('nfl_mia', 'the Miami Dolphins will forfeit their 2023 first-round draft pick and 2024 third-round pick'), ('npr_mia', 'losing their first-round pick in the 2023 draft and their third-round selection in the 2024 draft')], 'I11.8.1', ' Single case.')
