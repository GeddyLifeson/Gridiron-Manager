# Adds the ESPN second source (espn-fourth-down.out.json) to the fourth-down rows; status recomputed as Q6.1.2 does.
import json
o = json.load(open('scripts/research/espn-fourth-down.out.json'))
M = {
 'F-measured-rate-0051': o['conv_1to2'], 'F-measured-rate-0052': o['conv_pooled'],
 'F-measured-rate-0053': o['conv_by_year']['2022'], 'F-measured-rate-0054': o['conv_by_year']['2023'],
 'F-measured-rate-0056': o['mix_punt'], 'F-measured-rate-0057': o['mix_fg'], 'F-measured-rate-0058': o['mix_go'],
 'F-measured-rate-0168': o['punts_per_game_2024'],
}
TOL_ABS, TOL_REL = 0.01, 0.01
path = 'facts/measured-rate.json'; f = json.load(open(path))
def status(r):
    read = [s for s in r['sources'] if s['howRead'] != 'model knowledge']
    if not read: return 'Unverified'
    vals = [s['value'] for s in read if 'value' in s and s['value'] is not None]
    if r.get('value') is not None and any(v != r['value'] for v in vals): return 'Conflict'
    g = {s['independenceGroup'] for s in read}
    if len(g) >= 3: return 'Verified'
    if any(s['primary'] and s['howRead'] == 'primary text' for s in read): return 'Rulebook only'
    return {2: '2 of 3'}.get(len(g), '1 of 3')
for r in f['rows']:
    if r['id'] not in M: continue
    v = M[r['id']]; t = r['value']
    near = abs(v - t) <= (TOL_REL * abs(t) if r['unit'] in ('count', 'per game') or t > 1 else TOL_ABS)
    src = {'citation': 'ESPN play-by-play as published by sportsdataverse (github.com/sportsdataverse/sportsdataverse-data, release espn_nfl_pbp), regular seasons %s, 815 games; computed by the project: %.4f against the stored %s (%s)' % ('2024' if r['id'].endswith('0168') else '2022 to 2024' if r['id'][-4:] not in ('0053', '0054') else ('2022' if r['id'].endswith('0053') else '2023'), v, t, 'within the 0.01 absolute or 1 percent tolerance, so counted as agreeing' if near else 'outside tolerance'),
           'locator': 'scripts/research/espn-fourth-down.py; output scripts/research/espn-fourth-down.out.json',
           'dateRead': '2026-11-26', 'howRead': 'dataset computed', 'independenceGroup': 'espn-pbp-sportsdataverse', 'primary': False}
    if not near: src['value'] = round(v, 4)
    r['sources'].append(src)
    new = status(r)
    r['statusHistory'].append({'date': '2026-11-26', 'status': new, 'reason': 'Second independent source added: ESPN play-by-play (a different feed from the NFL data nflverse uses). ESPN gives %.4f against the stored %s.' % (v, t)})
    r['status'] = new
json.dump(f, open(path, 'w'), indent=1, ensure_ascii=False)
