"""G-10 seventh pass part 3 (2026-11-26): how the CBA sets each year's salary cap, cash-floor periods, 2020 cap.
CBA rows are quote-checked against the local text copy (core.S). Ids are assigned at append time."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from core import *
from rows_cba import cba
ROOT = os.path.join(os.path.dirname(__file__), '..'); D = '2026-11-26'
rows = []
def add(st, v, u, valid, srcs, notes='Primary text read directly this session; one source (Over the Cap\'s copy of the CBA is the same text, not independent). The 2020 CBA runs to 2030.'):
    r = dict(id='F-cap-0000', level='pro', domain='league-rule', statement=st)
    if v is not None: r['value'] = v
    if u: r['unit'] = u
    r.update(validFor=valid, sources=srcs, usedBy=[], notes=notes)
    r['status'] = status(r)
    r['statusHistory'] = [dict(date=D, status=r['status'], reason='G-10 seventh pass: CBA text read locally.')]
    rows.append(r)
A12 = 'Article 12 Section 6(c)'
add('Cap rule: the Player Cost Amount starts as 55 percent of projected League Media revenue.', 55, 'percent', '2020-2030', [cba(A12+'(i)', '55% of projected League Media AR', 55)])
add('Cap rule: plus 45 percent of projected NFL Ventures/Postseason revenue.', 45, 'percent', '2020-2030', [cba(A12+'(i)', '45% of projected NFL Ventures/Postseason AR', 45)])
add('Cap rule: plus 40 percent of projected Local revenue.', 40, 'percent', '2020-2030', [cba(A12+'(i)', '40% of projected Local AR', 40)])
add('Cap rule: less 47.5 percent of the Joint Contribution Amount.', 47.5, 'percent', '2020-2030', [cba(A12+'(i)', '47.5% of the Joint Contribution Amount', 47.5)])
add('Cap rule: for 2021 to 2030 the Player Cost Amount is capped at 48.5 percent of Projected AR (a ceiling).', 48.5, 'percent of Projected AR', '2021-2030', [cba(A12+'(ii)(B)', 'is greater than 48.5% of Projected AR then the Player Cost Amount shall be reduced to 48.5% of Projected AR', 48.5)])
add('Cap rule: for 2021 to 2030 the Player Cost Amount is raised to at least 48 percent of Projected AR (a floor).', 48, 'percent of Projected AR', '2021-2030', [cba(A12+'(ii)(B)', 'is less than 48% of Projected AR, the Player Cost Amount shall be increased to 48% of Projected AR', 48)])
add('Cap rule: for 2020 only the floor was 47 percent of Projected AR (ceiling 48.5 percent).', 47, 'percent of Projected AR', '2020', [cba(A12+'(ii)(A)', 'is less than 47% of Projected AR, the Player Cost Amount shall be increased to 47% of Projected AR', 47)])
add('Cap rule: the Salary Cap is the Player Cost Amount less Projected Benefits, divided by the number of clubs, adjusted by any True-Up.', None, None, '2020-2030', [cba(A12+'(v)', 'The Salary Cap for a League Year shall be the Player Cost Amount for that League Year less Projected Benefits for that League Year, divided by the number of Clubs in the League in that League Year, adjusted by any applicable True Up')])
add('Cap rule: a True-Up carries any difference between the cap set with projected and later updated revenue into the next year\'s cap, with interest.', None, None, '2020-2030', [cba('Article 12 Section 3(b)(ii)', 'shall be a “True-Up,” to be credited or deducted, as the case may be, in the calculation of the Salary Cap for the upcoming League Year')],
    'No year-over-year growth limit on the cap was found in Article 12; the only bounds are the 48 and 48.5 percent bands on the Player Cost Amount. The 17-game Media Kicker (Section 6(c)(iv)) can raise the Player Cost Amount for years with new media contracts and is not modelled here.')
add('Minimum Team Cash Spending, 2017 to 2020 (four league years): 89 percent of the Salary Caps for the period.', 89, 'percent', '2017-2020', [cba('Article 12 Section 9(a)', 'a guaranteed Minimum Team Cash Spending of 89% of the Salary Caps for such period', 89)])
for yrs, label in [('2021-2023', 'three League Years'), ('2024-2026', 'three League Years'), ('2027-2030', 'four League Years')]:
    a, b = yrs.split('-')
    add(f'Minimum Team Cash Spending, {a} to {b}: 90 percent of the Salary Caps for the period.', 90, 'percent', yrs, [cba('Article 12 Section 9(b)', 'there shall be a guaranteed Minimum Team Cash Spending of 90% of the Salary Caps for such periods', 90)],
        'Same sentence covers all three 90 percent periods (2021-2023, 2024-2026, 2027-2030); the period years come from the same subsection. Any shortfall is paid to players by the club on or before the next September 15 (Section 9(c)), after the 2020, 2023, 2026 and 2030 League Years. See F-cap-0001.')
add('Guaranteed League-Wide Cash Spending: 95 percent of the Salary Caps for each period multiplied by the number of clubs.', 95, 'percent', '2017-2030', [cba('Article 12 Section 8(b)', 'there shall be Guaranteed League-Wide Cash Spending of 95% of the Salary Caps', 95)])
# 2020 cap
r = dict(id='F-cap-0000', level='pro', domain='league-rule', statement='2020 salary cap per club: $198,200,000 (plus $40 million per team in player benefits).', value=198200000, unit='USD', validFor='2020',
  sources=[dict(citation='Wikipedia, NFL salary cap (https://en.wikipedia.org/wiki/NFL_salary_cap; no date shown)', locator='Maximum team salary table', dateRead=D, howRead='secondary summary', independenceGroup='wikipedia', primary=False,
    quote='2020 | $198.2 million + $40 million per team in player benefits', value=198200000)],
  usedBy=[], notes='Quote as returned by the cloud web fetch on 2026-11-26 (page text not saved locally, so the quote lint cannot re-find it). One source. The Over the Cap page read this pass shows only 2026 onward, and Spotrac and NFL pages could not be read. NOT FOUND: the 2025 cap (no page read states it) and a labelled 2027 figure.')
r['status'] = status(r); r['statusHistory'] = [dict(date=D, status=r['status'], reason='G-10 seventh pass.')]; rows.append(r)
p = os.path.join(ROOT, 'cap.json'); d = json.load(open(p)); have = {x['statement'] for x in d['rows']}
n = max(int(x['id'].rsplit('-', 1)[1]) for x in d['rows'])
for r in rows:
    if r['statement'] in have: continue
    n += 1; r['id'] = f'F-cap-{n:04d}'; d['rows'].append(r); print(r['id'], r['status'], r['statement'][:80])
json.dump(d, open(p, 'w'), indent=1, ensure_ascii=False); open(p, 'a').write('\n')
