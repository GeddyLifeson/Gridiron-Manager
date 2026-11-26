# Third source for F-measured-rate-0058 (fourth-down go share 2022-2024): TeamRankings fourth downs per game, punt attempts per game and
# field goal attempts per game summed over 32 teams and three seasons (games = 17, 16 for Cincinnati and Buffalo in 2022). Go share = 0.1909.
# Punt and field goal shares are NOT added as sources to 0056 and 0057: TeamRankings field goal attempts include kicks on other downs,
# so its mix (punt 0.5402, field goal 0.2689) is not the same measure (stored 0.553 and 0.253).
import json
path = 'facts/measured-rate.json'; f = json.load(open(path))
def status(r):
    read = [s for s in r['sources'] if s['howRead'] != 'model knowledge']
    vals = [s['value'] for s in read if s.get('value') is not None]
    if r.get('value') is not None and any(v != r['value'] for v in vals): return 'Conflict'
    g = {s['independenceGroup'] for s in read}
    return 'Verified' if len(g) >= 3 else {2: '2 of 3'}.get(len(g), '1 of 3')
for r in f['rows']:
    if r['id'] == 'F-measured-rate-0058' and not any(s['independenceGroup'] == 'teamrankings' for s in r['sources']):
        r['sources'].append({'citation': 'TeamRankings.com team tables, fourth downs per game (go), punt attempts per game and field goal attempts per game, regular seasons 2022 to 2024, summed over 32 teams (about 2,300 go plays against 6,500 punts and 3,200 field goals): go share 0.1909 against the stored 0.194, within the 0.01 tolerance so counted as agreeing',
            'locator': 'research/sources/teamrankings-raw-2022-2024.json and teamrankings-raw-mix-2022-2024.json; scripts/research/apply-teamrankings-go.py',
            'dateRead': '2026-11-26', 'howRead': 'secondary summary', 'independenceGroup': 'teamrankings', 'primary': False})
        new = status(r)
        r['statusHistory'].append({'date': '2026-11-26', 'status': new, 'reason': 'Source added: TeamRankings go share 0.1909 (per-game tables, one decimal, summed).'})
        r['status'] = new
        r['notes'] = (r.get('notes') or '') + ' TeamRankings has no punt or field goal share on the same basis (its field goal attempts include other downs), so rows 0056 and 0057 stay at 2 of 3.'
json.dump(f, open(path, 'w'), indent=1, ensure_ascii=False)
