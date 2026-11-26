//! Desktop shell (bible P2.3.1). Provides windows, native file dialogs, native SQLite save files in
//! a game folder the user can open, the user content folder (P7.1.1), crash capture to the local
//! log, the second window (P2.3.3) and the gate hook (R1.2.1). It holds no game logic: the core
//! runs in the web view, the same bundle as the browser build, and the worker layout of P2.1 lives
//! in that bundle. The shell makes no network request (P2.3.1, O5.6.1).
pub mod diagnostics;
pub mod folders;
pub mod platform;
pub mod saves;
pub mod windows;

use folders::{GameFolder, Sub};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// How the binary was started.
#[derive(Debug, PartialEq, Eq)]
pub enum Mode {
    /// The game.
    Play,
    /// `--gate <file>`: run the golden set in the web view, write the result, exit (R1.2.1).
    Gate(String),
    /// `--copy-save <name> <file>`: copy a gate save out for the cross-platform save check.
    CopySave(String, String),
}

pub fn parse_mode(args: &[String]) -> Mode {
    if let Some(i) = args.iter().position(|a| a == "--copy-save") {
        if let (Some(n), Some(f)) = (args.get(i + 1), args.get(i + 2)) {
            return Mode::CopySave(n.clone(), f.clone());
        }
    }
    if let Some(i) = args.iter().position(|a| a == "--gate") {
        if let Some(f) = args.get(i + 1) {
            return Mode::Gate(f.clone());
        }
    }
    Mode::Play
}

fn mode() -> Mode {
    parse_mode(&std::env::args().collect::<Vec<_>>())
}

/// The game folder for this run. Gate and copy-save runs use a folder of their own inside the
/// app data folder, so a test run never writes into the user's Documents.
fn resolve_folder(app: &AppHandle, mode: &Mode) -> Result<GameFolder, Box<dyn std::error::Error>> {
    let data = app.path().app_data_dir()?;
    let root = match mode {
        Mode::Play => folders::choose_root(
            std::env::var_os(folders::GAME_DIR_ENV).map(PathBuf::from),
            app.path().document_dir().ok(),
            data.clone(),
        ),
        Mode::Gate(_) | Mode::CopySave(..) => data.join("gate"),
    };
    let folder = GameFolder::at(root)?;
    if *mode == Mode::Play {
        // Phase 0 kept saves in <app data>/saves.
        folders::migrate_legacy_saves(&data.join("saves"), &folder)?;
    }
    Ok(folder)
}

#[tauri::command]
fn gate_out_path() -> Option<String> {
    match mode() {
        Mode::Gate(f) => Some(f),
        _ => None,
    }
}

#[tauri::command]
fn gate_write_and_exit(app: AppHandle, path: String, text: String, ok: bool) -> Result<(), String> {
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    app.exit(if ok { 0 } else { 1 });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mode = mode();
    let mut builder = tauri::Builder::default();
    if mode == Mode::Play {
        // One running copy per machine: the world worker must be the only writer of a save (P2.1.2).
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window(windows::MAIN) {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(saves::Dbs::default()))
        .setup(move |app| {
            let folder = resolve_folder(app.handle(), &mode)?;
            if let Mode::CopySave(name, to) = &mode {
                std::fs::copy(folder.save_path(name)?, to)?;
                std::process::exit(0);
            }
            let version = app.package_info().version.to_string();
            diagnostics::install_panic_hook(folder.sub(Sub::Logs), version.clone());
            let log = diagnostics::Log::new(&folder);
            let webview_version = tauri::webview_version().unwrap_or_default();
            let _ = log.write(
                diagnostics::Level::Info,
                "shell.start",
                &format!("version {version}, {} {}, web view {webview_version:?}, folder {}", std::env::consts::OS, std::env::consts::ARCH, folder.root().display()),
            );
            if let Some(problem) = platform::webview_problem(std::env::consts::OS, &webview_version) {
                let _ = log.write(diagnostics::Level::Error, "shell.webview-too-old", &problem);
                if matches!(mode, Mode::Gate(_)) {
                    eprintln!("{problem}");
                    std::process::exit(1);
                }
                use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                if let Some(w) = app.get_webview_window(windows::MAIN) {
                    let _ = w.hide();
                }
                let h = app.handle().clone();
                app.dialog()
                    .message(problem)
                    .title("Gridiron Manager cannot start")
                    .kind(MessageDialogKind::Error)
                    .show(move |_| h.exit(1));
            }
            app.manage(platform::AppMeta { version, webview_version });
            app.manage(log);
            app.manage(folder);
            Ok(())
        })
        .on_window_event(|w, e| {
            if w.label() == windows::MAIN && matches!(e, tauri::WindowEvent::Destroyed) {
                windows::on_main_destroyed(w.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            saves::db_open, saves::db_exec, saves::db_transaction, saves::db_all, saves::db_close,
            saves::saves_list, saves::saves_delete, saves::saves_read, saves::saves_write, saves::saves_copy,
            saves::saves_export_dialog, saves::saves_import_dialog,
            platform::platform_info, platform::content_list, platform::content_read, platform::open_game_folder,
            diagnostics::log_diagnostic, diagnostics::crash_report_take,
            windows::window_open_second, windows::window_close_second,
            gate_out_path, gate_write_and_exit
        ])
        .run(tauri::generate_context!())
        .expect("error while running the desktop shell");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(a: &[&str]) -> Vec<String> {
        std::iter::once("gm").chain(a.iter().copied()).map(String::from).collect()
    }

    #[test]
    fn modes() {
        assert_eq!(parse_mode(&args(&[])), Mode::Play);
        assert_eq!(parse_mode(&args(&["--gate", "out.json"])), Mode::Gate("out.json".into()));
        assert_eq!(parse_mode(&args(&["--gate"])), Mode::Play);
        assert_eq!(parse_mode(&args(&["--copy-save", "gate-desktop", "x.gmsave"])), Mode::CopySave("gate-desktop".into(), "x.gmsave".into()));
        assert_eq!(parse_mode(&args(&["--copy-save", "only-name"])), Mode::Play);
    }
}
