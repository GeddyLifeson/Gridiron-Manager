# Money facts: taxes, living cost, executive and second-level college pay (2026-11-26)

Files (all `domain: career`, rows `F-<set>-NNNN`; the original research key is the first words of each row's `notes`):
- `state-tax.json`: top state wage-tax rate for the 43 reference-location jurisdictions, plus no-wage-tax and non-resident rows.
- `local-tax.json`: city and county wage taxes (resident and non-resident) and cities with none.
- `jock-tax.json`: duty-day allocation, who is covered, home-state credit, 2026 federal figures.
- `living-cost.json`: BEA regional price parities (all items, housing) for 71 of 72 metros, BLS Consumer Expenditure 2024, MIT living wage.
- `exec-pay.json`: NFL GM, team president, FBS athletic director, university president (proxy).
- `college-second-pay.json`: FCS (second college level) head coach, assistants, AD, budget.

## How to read the status
Every web page was read through the cloud web fetch, which returns an extractor-model summary, so every source is `secondary summary` and none is `primary`. Status therefore reaches Verified only with three independent publishers (by web domain; BEA and FRED count as one). Quotes are the extractor's excerpts, not saved page text. 23 rows are Conflict: most are real (five states cut 2026 rates after the Tax Foundation table, so older sources disagree). Conflict rows are not usable as rule values until resolved.

## Known gaps (NOT FOUND or weak)
- NFL team president pay: not found. NFL GM pay: leaks only (Caserio 2021 best sourced), no typical or low figure newer than 2013.
- FCS-wide median and lowest head coach pay, FCS graduate assistant and quality-control pay: not found. Big Sky and MEAC figures stand in.
- BEA metro RPP is from FRED (one publisher); Cleveland has 2023 only. No second or third metro source (C2ER paywalled).
- Local tax: Birmingham rate lacks an official 2026 page; Mobile "none" and the 20 "no local tax" cities are inferred from lists.
- Jock tax: de minimis thresholds only 2 sources; no NFL CBA tax clause found; California's own athlete rules not on a readable page.
- State tax: Arkansas new-bracket threshold not found; CO, ID, OH, TX, UT, AR have no revenue-department text for 2026.
