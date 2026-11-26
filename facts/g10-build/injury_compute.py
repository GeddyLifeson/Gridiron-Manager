"""Computes episode lengths from nflverse weekly injury reports (regular season, report_status == Out).
Episode = a run of weekly Out reports for one player, one season, one body-part group; a gap of at most
one week (a bye) does not break it. Length = number of Out reports in the run.
usage: python3 injury_compute.py DATA_DIR OUT_JSON   (DATA_DIR holds injuries_YYYY.csv from
https://github.com/nflverse/nflverse-data/releases/download/injuries/)"""
import csv, glob, json, statistics, sys, os, collections
GROUPS = {'knee':'Knee','ankle':'Ankle','hamstring':'Hamstring','concussion':'Concussion','head':'Concussion','shoulder':'Shoulder','foot':'Foot','toe':'Foot','groin':'Groin','calf':'Calf','back':'Back','neck':'Neck','quadricep':'Quadriceps','hip':'Hip'}
def grp(s):
    s=s.lower()
    for k,v in GROUPS.items():
        if k in s: return v
    return None
data, out = sys.argv[1], sys.argv[2]
weeks = collections.defaultdict(list)
years=set()
for f in sorted(glob.glob(os.path.join(data,'injuries_*.csv'))):
    for r in csv.DictReader(open(f, encoding='utf-8')):
        if r['game_type']!='REG' or r['report_status']!='Out': continue
        g = grp(r['report_primary_injury'] or '')
        if not g: continue
        years.add(r['season']); weeks[(r['season'], r['gsis_id'], g)].append(int(r['week']))
eps = collections.defaultdict(list)
for (s,p,g), ws in weeks.items():
    ws = sorted(set(ws)); n = 1
    for a,b in zip(ws, ws[1:]):
        if b-a <= 2: n += 1
        else: eps[g].append(n); n = 1
    eps[g].append(n)
res = {}
for g,l in eps.items():
    res[g] = dict(episodes=len(l), median=statistics.median(l), mean=round(statistics.mean(l),2), share_one=round(sum(1 for x in l if x==1)/len(l),3))
json.dump(dict(seasons=sorted(years), groups=res), open(out,'w'), indent=1)
print(sorted(years)[0], sorted(years)[-1], json.dumps(res))
