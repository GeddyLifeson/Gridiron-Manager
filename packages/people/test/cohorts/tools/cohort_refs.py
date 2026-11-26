# G-44 cohort references from the project people data. Run: python3 -I cohort_refs.py /mnt/project-files/data/people
import csv, sys, statistics as st
from collections import Counter
D=sys.argv[1]
ages=[];per=Counter()
for r in csv.DictReader(open(D+'/nfl_draft_history.csv')):
    s=int(r['season'])
    if 2015<=s<=2025 and r['age']:
        ages.append(int(float(r['age'])))
    per[s]+=1
c=Counter(ages);n=len(ages)
print('draft ages 2015-2025 n',n,'median',st.median(ages),{a:round(c[a]/n,4) for a in sorted(c)})
print('share 21-24',sum(c[a] for a in range(21,25))/n)
print('drafted per year', {y:per[y] for y in range(2010,2027)})
fin=[];span=[]
for r in csv.DictReader(open(D+'/nfl_players.csv')):
    try: rs=int(r['rookie_season']); ls=int(r['last_season']); by=int(r['birth_date'][:4])
    except: continue
    if rs>=2000 and ls<=2022:
        fin.append(ls-by); span.append(ls-rs+1)
fin.sort();span.sort()
q=lambda xs,p: xs[int(p*(len(xs)-1))]
print('final season age n',len(fin),'median',st.median(fin),'p10',q(fin,.1),'p90',q(fin,.9))
print('career span median',st.median(span),'mean',round(sum(span)/len(span),2),'share<=3',round(sum(1 for x in span if x<=3)/len(span),3))
ra=[]
for r in csv.DictReader(open(D+'/nfl_rosters_2025_2026.csv')):
    if r['season']=='2025' and r['birth_date']:
        ra.append(2025-int(r['birth_date'][:4]))
ra.sort();print('roster 2025 age n',len(ra),'median',st.median(ra),'p10',q(ra,.1),'p90',q(ra,.9))
import csv, sys, statistics as st
fa=[]
for r in csv.DictReader(open(D+'/nfl_players.csv')):
    try: rs=int(r['rookie_season']); ls=int(r['last_season']); y,m,d=map(int,r['birth_date'][:10].split('-'))
    except: continue
    if rs>=2000 and ls<=2022: fa.append(ls-y-(1 if (m,d)>(9,1) else 0))
fa.sort(); n=len(fa); q=lambda p: fa[int(p*(n-1))]
print(n, st.median(fa), q(.1), q(.9), round(sum(fa)/n,2), sum(1 for x in fa if 24<=x<=32)/n)
