from g10f_core import src, add
# ---- NFL Football Operations (league office, primary), read in the PC browser 2026-11-26
src('ops_cap', 'NFL Football Operations, NFL Salary Cap (https://operations.nfl.com/calendar-events/nfl-free-agency/nfl-salary-cap)', 'nfl-league-office', True)
src('ops_draft', 'NFL Football Operations, NFL Draft Rules (https://operations.nfl.com/calendar-events/nfl-draft/nfl-draft-rules)', 'nfl-league-office', True)
src('ops_contract', 'NFL Football Operations, Contract Language (https://operations.nfl.com/calendar-events/nfl-free-agency/contract-language)', 'nfl-league-office', True)
src('ops_ipp', 'NFL Football Operations, International Player Pathway (https://operations.nfl.com/platforms-initiatives/international-growth/international-player-pathway)', 'nfl-league-office', True)
src('ops_cba', 'NFL Football Operations, 2020 NFL-NFLPA CBA: Need to Know (https://operations.nfl.com/platforms-initiatives/player-development-partnership/collective-bargaining-agreement)', 'nfl-league-office', True)
for y, v, t in ((2021, 182500000, '$182.5M'), (2022, 208200000, '$208.2M'), (2023, 224800000, '$224.8M'), (2024, 255400000, '$255.4M')):
    add(f'F-cap-00{43 + y - 2021}', 'ops_cap', f'NFL Salary Cap (By Season) table, row {y}', f'{y} {t}', v)
loc = 'Draft rules page, pick-clock paragraph'
add('F-league-0046', 'ops_draft', loc, 'Only the first round is held on Thursday. It starts at 8 p.m. Eastern time, and each team has eight minutes to make its pick.', 8)
add('F-league-0047', 'ops_draft', loc, 'Teams get seven minutes to make picks in the second round', 7)
add('F-league-0048', 'ops_draft', loc, 'five minutes for regular or compensatory picks in rounds 3-6', 5)
add('F-league-0049', 'ops_draft', loc, 'and four minutes in round 7', 4)
loc = 'Contract Language page, Practice Squads section'
add('F-league-0027', 'ops_contract', loc, "The practice squad consists of 16 players as of 2026. However, teams can sign 17 players to their practice squads if one of those players is a member of the NFL's International Pathway Program.", 16)
add('F-league-0028', 'ops_ipp', 'International Player Pathway page, 2026 season paragraph', 'During the 2026 season, each club may have a combined maximum of 17 Practice Squad players as long as one player qualifies as an International Player.', 1)
add('F-league-0029', 'ops_contract', loc, 'Teams can also have a maximum of ten players who have earned no more than two accrued seasons.', 10)
add('F-league-0030', 'ops_contract', loc, 'Each team to have up to six players with unlimited accrued seasons on the practice squad.', 6)
add('F-league-0031', 'ops_contract', 'Contract Language page, Standard Elevation Addendum', 'Each practice squad players can be elevated for a maximum of three regular season games in the same League Year.', 3)
add('F-league-0104', 'ops_cba', 'CBA Need to Know page, highlights', '14-team playoff: Starting in the 2020 season, seven teams from each conference will make the playoffs', 7)
