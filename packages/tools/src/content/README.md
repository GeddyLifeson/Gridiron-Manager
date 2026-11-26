# Content pipeline (G-08, bible P4.1 to P4.6)

Packs load from folders, zips or browser imports, validate, hash and hot-reload. The text templates
engine (P4.6) is `packages/football-content/src/templates/`.

| Leaf | Where |
|------|-------|
| P4.1.1 packs, folders, load order, duplicate ids | `manifest.ts`, `load.ts` |
| P4.2.1 schema validation, size limits, migrations | `kinds.ts`, `shape.ts`, `params.ts`, `load.ts` |
| P4.2.2 football validation (references, legality, completeness) | `load.ts` with `FootballCheck` hooks |
| P4.3.1 hashing and the manifest | `sha256.ts`, `hash.ts` |
| P4.4.1 hot reload, compile cache, dev file watch | `reload.ts`, `watch.ts` |
| P4.5.1 ui folder and its build checks | `ui.ts` |
| P4.6.1 literal display strings in app-ui | `literal-strings.ts` |
| Headless validate command | `cli.ts`: `npx tsx packages/tools/src/content/cli.ts validate <pack>... [--certified] [--watch]` |

## Decisions this package made where the bible leaves a shape open

- **C-01 Declared override.** `pack.json` may list `overrides: ["kind/id", ...]`. Without it, two packs
  defining one id is `item.duplicate_id` naming both packs. A certified career refuses overrides of
  core items (`item.override_certified`).
- **C-02 Hash.** SHA-256 (pure TypeScript, checked against FIPS 180-4 vectors and node:crypto) over
  `@gm/engine-core` `canonicalBytes`. Pack hash covers id, version and the sorted item hashes it
  defines; set hash covers the manifest in load order.
- **C-03 Load order.** `core` first, then dependencies before dependants, ties by pack id. Files in
  path order. Same packs in any scan order give the same hash (tested).
- **C-04 Item keys.** `kind/id`. Kinds come from the longest registered folder prefix of the path
  (`football/routes/`, `text/`, `ui/screens.json`). Text items are `text/<language>:<template key>`.
- **C-05 Envelope.** Kinds without a registered body schema are checked against the P3.4.1 envelope
  (id, name, levelTags, author, version, contentSchemaVersion, optional `refs`, optional `draft`) and
  the body is carried. The owning package registers a stricter `KindDef` (and may add `normalize`, for
  example D-11's lateral negation for authored plays).
- **C-06 Problem classes.** `error` blocks the whole load (the old set is kept on reload); `flag` is
  "illegal as drawn" (P4.2.2): the item loads with status `illegal` and `legalUnder: []`; `warning`
  and `info` are shown only. A football finding with severity `error` blocks; a `warning` with a
  `ruleKey` is a legality flag for that rule set; a `warning` without one is a completeness warning.
  Shipped (core) content legal under no rule set is `football.shipped_illegal`.
- **C-07 Drafts.** A user item with `draft: true` whose references or football checks fail loads with
  status `draft` instead of failing (P4.2.2 edge case). Core content may not be a draft.
- **C-08 Level tags.** A reference to an item that needs a rule key the referrer does not require is
  the warning `ref.level_tag`, not a refusal: illegal football is flagged, not refused.
- **C-09 String limits.** P7.2.1 gives 200 characters for names and 2,000 for notes. Fields named
  `name` get 200; every other string gets 2,000.
- **C-10 Career reload.** In mode `career`, changes to world-wide kinds (`rules`, `league-rules`,
  `world`, `models`) are refused unless `stage(..., { reason })` is given; the result carries an
  `override` record for the command log and the set's `certifiedEligible` becomes false.

## Problem codes

manifest.missing, manifest.json, manifest.<shape code>, pack.duplicate_id, pack.missing_requirement,
pack.requirement_version, pack.dependency_cycle, pack.too_large, pack.override_unused,
file.path_escape, file.depth, file.too_large, file.encoding, file.json, file.string_length,
file.unknown_kind, file.ignored_type, file.ignored_root, zip.malformed, zip.ratio, zip.method,
schema.required, schema.invalid_type, schema.invalid_format, schema.invalid_value, schema.too_small,
schema.unknown_field, schema.version_newer, schema.no_migration, item.id_format, item.level_tags,
item.duplicate_id, item.override, item.override_certified, item.core_draft, ref.missing, ref.kind,
ref.level_tag, football.shipped_illegal (plus the football checker's own codes), text.*, template.*,
ui.read_model_missing, ui.screen_duplicate, ui.rung_range, ui.key_duplicate_action, ui.key_conflict,
ui.token_missing, ui.contrast, ui.rung_row_missing, ui.screen_unknown, reload.unknown_pack,
reload.world_content_blocked.

## Requests to the integrator

1. Barrel lines: `export * from './templates/index.ts';` in `packages/football-content/src/index.ts`
   and `export * from './content/index.ts';` in `packages/tools/src/index.ts`. Until the first lands,
   `text/` files load with the warning `text.validator_missing` (see `text-support.ts`); it switches on
   by itself after.
2. zod for tools: the dependency lint allows zod only in `schema`, so the manifest, envelope and ui
   shapes are checked by the small `shape.ts`. Either allow zod in tools or move these shapes into
   `packages/schema` (P3.4.1 says content schemas live there); both keep the same problem codes.
3. Wire `scanLiteralDisplayStrings` into `npm run lint` once screens render through templates (today
   the phase 0 App.tsx has literals), and add an npm script for `content validate`.
4. Canonical serialisation lives in `engine-core` (`canonicalBytes`); P4.3.1 says `schema`. Moving it
   is the integrator's call; this package only imports it.

## Not here

Hostile-pack corpus, markup and web-address neutralising, the 5 s per-file time limit and the user
content folder (P7.2, G-96). Signatures and certified pack locks (P7.4, G-95). Legality rules
themselves (`@gm/football-lang`, WP-10): the loader takes them as `FootballCheck` hooks.
