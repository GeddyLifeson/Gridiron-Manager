# Asset licence register (PV-15)

Plan: `plans/presentation-build-plan.md` section 5. Register: `assets/LICENSES.json`, one row per shipped non-code file under `assets/` (and media, font and image files under `shells/browser/public`). Not registered: `LICENSES.json`, `NOTICE.md`, `README.md`, and anything under a `scores/` folder (source scores, not shipped).

Row fields: `path`, `sha256`, `source`, `licence`, `licenceId`, `author`, `dateRetrieved` (YYYY-MM-DD), `licenceSources` (array), optional `tool`. `licenceStatus` is optional and must equal the computed value: `Verified` (3 distinct sources), `2 of 3`, `1 of 3`, or `Original` (project's own work, id `Original`). AI assets add `aiGenerated: true`, `model`, `termsUrl` (https) and `prompt`.

Allowed `licenceId`: CC0-1.0, Public-Domain, OFL-1.1, MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, Original. Anything else, or licence text with non-commercial, no-derivatives, royalty-free, unknown or all-rights-reserved wording, fails. Non-`Original` rows must have 3 licence sources.

```
node scripts/assets/check-licences.mjs [--json]     # exit 0 clean, 1 findings, 2 register missing or unreadable
npx vitest run --config scripts/assets/vitest.config.ts
```

Release gate (G-100): `import { checkLicences } from '../assets/check-licences.mjs'` returns `{ ok, errors[], rows, files }`. Treat `ok: false` as FAIL and list `errors`. The name and mark scan for image files stays in the gate's own scan.
