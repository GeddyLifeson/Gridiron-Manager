# Attaches the nflverse computation (unverified-rows.out.json) as a source to the zero-source rows; status then follows Q6.1.2.
import json
o = json.load(open('scripts/research/unverified-rows.out.json'))
path = 'facts/measured-rate.json'
f = json.load(open(path))
M = {  # id: (computed value, rounding digits, what was computed)
 'F-measured-rate-0047': (o['0047_first10_pass_by_playtype'], 3, 'share of 1st-and-10 scrimmage plays (pass or run, no kneels or spikes) that are pass plays; n=%d' % o['n_first10']),
 'F-measured-rate-0048': (o['0048_first10_dropback'], 3, 'share of 1st-and-10 scrimmage plays that are dropbacks (qb_dropback); n=%d' % o['n_first10']),
 'F-measured-rate-0066': (o['time_after_pass_drive_mean'], 2, 'mean game-clock seconds from a pass snap to the next scrimmage snap in the same drive'),
 'F-measured-rate-0067': (o['time_after_run_drive_mean'], 2, 'mean game-clock seconds from a run snap to the next scrimmage snap in the same drive'),
 'F-measured-rate-0111': (o['pressured_completion'], 3, 'completion share of pressured dropbacks (was_pressure, scrambles excluded); n=%d' % o['pressured_n']),
 'F-measured-rate-0112': (o['pressured_yards_per_dropback_net'], 2, 'net yards per pressured dropback (yards_gained, sacks included); n=%d' % o['pressured_n']),
 'F-measured-rate-0118': (o['sack_rate_3'], 3, 'sacks per pass play with 3 rushers (participation number_of_pass_rushers); n=%d' % o['n_3']),
 'F-measured-rate-0120': (o['sack_rate_4'], 3, 'sacks per pass play with 4 rushers; n=%d' % o['n_4']),
 'F-measured-rate-0122': (o['sack_rate_5'], 3, 'sacks per pass play with 5 rushers; n=%d' % o['n_5']),
 'F-measured-rate-0124': (o['sack_rate_6'], 3, 'sacks per pass play with 6 rushers; n=%d' % o['n_6']),
 'F-measured-rate-0126': (o['sack_rate_7p'], 3, 'sacks per pass play with 7 or more rushers; n=%d' % o['n_7p']),
 'F-measured-rate-0177': (o['kickoff_touchback_2025'], 3, 'touchbacks per kickoff play, 2025 regular season; n=%d' % o['kickoffs_2025']),
 'F-measured-rate-0270': (o['presnap_off_per100_sd_teams'], 2, 'SD across %d teams of offensive pre-snap fouls (false start, delay of game, offside, encroachment, neutral zone, illegal formation, shift, motion) per 100 snaps; mean %.2f' % (o['teams'], o['presnap_off_per100_mean'])),
}
for r in f['rows']:
    if r['id'] not in M: continue
    v, nd, what = M[r['id']]
    v = round(v, nd)
    yrs = '2025 regular season' if r['id'].endswith('0177') else '2022 to 2024 regular seasons'
    r['sources'].append({
        'citation': 'nflverse play-by-play%s, %s, github.com/nflverse/nflverse-data releases; computed by the project: %s' % (' and participation' if 'sack' in what or 'pressure' in what or 'pressured' in what else '', yrs, what),
        'locator': 'scripts/research/unverified-rows.py; output scripts/research/unverified-rows.out.json',
        'dateRead': '2026-11-26', 'howRead': 'dataset computed', 'independenceGroup': 'nflverse', 'primary': False, 'value': v})
    old = r['status']
    match = abs(v - r['value']) < 1e-9
    r['status'] = '1 of 3' if match else 'Conflict'
    r['statusHistory'].append({'date': '2026-11-26', 'status': r['status'],
        'reason': ('Zero sources before. Recomputed from nflverse and the target is reproduced (%s vs %s). One independent group, so 1 of 3; a second and third source are still owed.' % (v, r['value'])) if match
        else ('Zero sources before. Best nflverse reproduction under the most natural definition gives %s, not %s, so the stored target does not match its only measurement. The bible definition behind the target is not recorded; decide whether to adopt the measured value.' % (v, r['value']))})
json.dump(f, open(path, 'w'), indent=1, ensure_ascii=False)
