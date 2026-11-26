# Modding and editors (G-96, bible P7.1, P7.2, P7.5)

| Leaf | Where |
|------|-------|
| P7.1.1 user content folder, Mods list, error report, pack choice at career creation, add-to-career rule | `folder.ts`, `node-folder.ts`, `cli.ts` |
| P7.2.1 data-only content and limits (the parts G-08's loader does not hold) | `safety.ts`, `params.ts` |
| P7.5.1 editors write ordinary packs; export and import; edits in a career are commands | `writer.ts`, `zip.ts` |
| Mods and editors screen (Settings, Mods; O7.6.2 sits beside it) | `packages/app-ui/src/screens/editors/` |

Headless: `npx tsx packages/tools/src/editors/cli.ts scan "<user content folder>" --core <core pack folder> [--report]`.

## How a pack is checked

`assessPack` runs the safety scan first. A pack with any safety error is refused and never reaches the
loader. Otherwise it is loaded together with the shipped packs (`base`) through G-08's `loadPacks`, which
holds the byte, file, folder-depth, path-escape, zip and string-length limits. A pack is selectable when
neither step reports an error. Warnings (markup, control characters) are neutralised, not refused.

## Hostile pack corpus (P7.2.1 acceptance)

`packages/tools/test/editors/editors.test.ts`, one case each, with its expected code:
oversized file `file.too_large`, oversized pack `pack.too_large`, deep JSON `safety.json_depth`, deep
folder `file.depth`, rule tree depth `safety.rule_depth`, rule size `safety.rule_nodes`, path escape and
absolute path `file.path_escape`, symbolic link `file.path_escape`, zip bomb `zip.ratio`, zip lying about
size `zip.malformed`, image data `safety.embedded_image`, web addresses `safety.web_address`, prototype
key `safety.forbidden_key`, too many people `safety.people_count`, long name `file.string_length`, a
stalling file `safety.time_limit`, real marks `safety.blocked_mark`. Neutralised: markup in names
(`safety.markup`), direction overrides (`safety.control_chars`), image files (`safety.image_ignored`).

## Decisions this package made where the bible leaves a shape open

- **E-01 Rule.** P7.2.1's "node count per rule" counts the condition nodes of a J4 when clause's `when`
  and `guard` plus its actions; depth is the deeper of the two trees. Condition trees are found by shape
  (`op` of all, any, not, test), so any kind that embeds rules is covered.
- **E-02 Web address.** A URL scheme (http, https, ftp, file, ws, javascript, data, mailto, blob, ...) or
  a `www.` host, in any string or key, refuses the pack. A bare domain is not refused: the game never
  opens text, and refusing "e.g." style words would hit ordinary notes.
- **E-03 JSON depth (assumption, 64).** Nesting is measured on the raw bytes before `JSON.parse`, so a
  hostile file cannot overflow the parser's stack.
- **E-04 Objects per file (assumption, 2 million).** Refused before any walk.
- **E-05 "User's own".** A pack is the user's own when its manifest author equals the author name the
  user's editors write (`CareerState.userAuthor`). Own playbook-only packs may be added to a running
  career at any time; others only at a season boundary in a non-certified career.
- **E-06 Editor kinds.** Editors write into the loader's registered folders. Authored plays and
  terminology go to `playbooks/` until a `plays` or `terminology` kind is registered (their owners,
  G-90 and G-67, register stricter kinds; the writer picks them up from the registry). The people pack
  builder writes `packs-people/`, which the content loader lists but leaves to the people importer.
- **E-07 Time limit.** The 5 s per-file limit is checked during the safety walk (every 1,024 steps and
  at the end of each file) with an injectable clock. After the safety scan bounds a file's size and
  depth, the loader's own work on it is linear.
- **E-08 Signatures.** A present signature shows as "signed, not yet checked" until G-95 checks it.
- **E-09 Marks.** The A6.2.2 check is a host hook (`blockedMarks`) so this package does not hold the
  list; the host binds `@gm/world` `blockedTermHits` to its content's list once the world barrel
  exports it.
- **E-10 Export.** Stored zip, sorted entries, fixed 1980-01-01 timestamps: the same pack exports to the
  same bytes. Files are written as stable JSON (sorted keys, two-space indent).

## Requests to the integrator

1. Barrel: `export * as editors from './editors/index.ts';` in `packages/tools/src/index.ts`, and
   `export * as editorsScreen from './screens/editors/index.ts';` in `packages/app-ui/src/index.ts`.
2. Screen registry row in `packages/app-ui/src/shell/screens.json`: id `school.mods`, hub `school`,
   title "Mods and editors", bible `["P7.1.1", "P7.5.1"]`, route `/school/mods`, phases `[]`, modes
   `["normal", "certified"]`, version `v1`, hotkey `m` if free, search terms `["mods", "packs", "user
   content", "editors", "import"]`, help topic `P7.1.1`; and `routes['school.mods'] = editorsRoute(host)`.
3. Command: add `EditPlay` (P4.4.1) to `packages/schema/src/commands.ts` with payload `{ kind, id,
   itemHash, item }`, undoable, allowed in certified; `careerEdit` already returns that shape.
4. PARAMS: register `tools.editors` (`params.ts`) wherever parameter files are collected.
5. npm script: `"mods": "tsx packages/tools/src/editors/cli.ts scan"`.
