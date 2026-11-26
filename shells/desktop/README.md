# Desktop shell (G-05)

Tauri 2 wrapper around the browser bundle (`shells/browser/dist`). Bible: P2.3.1, P2.3.3, P1.4.1,
P2.1 (pool size), P5.8.1, P7.1.1, O5.6. It holds no game logic and makes no network request.

## Build

| Command (repo root) | Result |
| --- | --- |
| `npm run desktop:build` | Release binary only (`src-tauri/target/release/gridiron-manager[.exe]`), used by `npm run check` |
| `npm run desktop:installer` | Binary plus installers for the current OS: Windows `nsis` (.exe, per-user) and `msi`; Linux `deb` and `AppImage`; macOS `dmg` |
| `cd shells/desktop/src-tauri && cargo test --release` | Shell unit tests (no window needed) |

Windows needs Rust (MSVC) and the WebView2 runtime (Windows 10/11 ship it). The NSIS and MSI
installers embed the WebView2 bootstrapper, so installing on a machine without WebView2 works
without a separate download step. The MSI is built by WiX, which the Tauri CLI fetches on first use.
Linux needs `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`.

## Game folder

`Documents/Gridiron Manager/` (override with the `GM_GAME_DIR` environment variable; falls back to
the app data folder if there is no Documents folder):

| Subfolder | Holds |
| --- | --- |
| `saves/` | One `<name>.gmsave` SQLite file per save (P5.1.1). Saves from phase 0 builds (app data folder) move here on first launch, never overwriting |
| `user-content/` | Packs: one subfolder or `.zip` each (P7.1.1) |
| `logs/` | `gridiron-manager.log` (rolls to `.old.log` at 2 MiB), `crash-pending.txt` after a native crash, kept as `crash-<time>.txt` once offered |
| `exports/` | Default folder of the export dialog |

Gate (`--gate <file>`) and `--copy-save` runs use `<app data>/gate/` instead, so tests never write
into Documents.

## Commands the web view can call

Typed wrappers: `bridge/desktop-shell.ts`. Save database: `db_open`, `db_exec`, `db_transaction`,
`db_all`, `db_close` (wrapped by `shells/browser/src/platform-desktop.ts`). Files: `saves_list`,
`saves_delete`, `saves_read`, `saves_write` (atomic, SQLite header checked), `saves_copy`,
`saves_export_dialog`, `saves_import_dialog`. Machine: `platform_info` (versions, folders, P2.1.3
pool size). Content: `content_list`, `content_read`. `open_game_folder`. Diagnostics:
`log_diagnostic`, `crash_report_take`. Windows: `window_open_second`, `window_close_second`. Gate:
`gate_out_path`, `gate_write_and_exit`.

No Tauri plugin API is exposed to the web view (capabilities: `core:default` only); dialogs and
the folder opener are called from the shell's own commands.

## Values and their basis

| Value | Basis |
| --- | --- |
| Pool size = logical processors - 2, min 1, max 8 | Bible P2.1.3 starting values |
| Web view minimum: Chromium 94 (WebView2), WebKitGTK 2.40 | **Assumption**, not triple verified: the bundle targets ES2022; class static blocks arrived in Chromium 94 and Safari 16.4's WebKit. macOS is never blocked (not tested, P2.3.1) |
| Log roll size 2 MiB, diagnostic line cap 4,000 characters | Assumption |
| Name limit 64 characters | Assumption: keeps paths under the Windows 260-character limit |
| Second window size 1100 x 820 | Assumption: same as the main window |
| Rollback journal, not WAL | Phase 0 decision, kept: the `.gmsave` file is complete after every commit |

## Behaviour

- One running copy (single-instance plugin, play mode only): a second launch focuses the first, so
  only one process ever writes a save (P2.1.2).
- Web view too old: the main window stays hidden and a plain message says what to update; the app
  exits when it is closed. In gate mode the message goes to stderr with exit code 1.
- Native panics write `logs/crash-pending.txt` and a log line. Web view errors reach the log through
  `captureWebViewErrors()` in the bridge.
- Closing the main window closes the second window (P2.3.3).
- A full disk gives "the disk is full" messages, and save writes go through a temporary file plus
  rename, so a failed write leaves the old file (P5.8.1).

## Not in this package

- The P2.1 worker layout itself (world worker, simulation pool) is `app-services` code that runs
  in the web view. The shell allows workers in its content security policy (`worker-src 'self' blob:`)
  and reports the P2.1.3 pool size.
- Version check: P2.3.1 allows one the user can turn off; this build has none, so it makes no
  network request at all.
- Code signing and distribution channel: open for Marlon (A3.3.1).
