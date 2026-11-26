//! Local log and crash capture (P2.3.1, P2.2.1 `diagnostic`, O5.6.2). Everything stays in the
//! game folder's logs subfolder; nothing is sent anywhere.
use crate::folders::{GameFolder, Sub};
use serde::Deserialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

pub const LOG_FILE: &str = "gridiron-manager.log";
pub const LOG_FILE_OLD: &str = "gridiron-manager.old.log";
/// A crash report waiting to be offered on the next launch (O5.6.2 edge case).
pub const CRASH_PENDING: &str = "crash-pending.txt";
/// Log size at which the log rolls over to one old copy. Named assumption: 2 MiB holds many
/// sessions of diagnostics and stays small enough to attach to a bug bundle.
pub const LOG_ROLL_BYTES: u64 = 2 * 1024 * 1024;
/// Longest single diagnostic line accepted from the web view. Named assumption.
pub const MAX_LINE_CHARS: usize = 4000;

#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Debug,
    Info,
    Warn,
    Error,
}

impl Level {
    fn tag(self) -> &'static str {
        match self {
            Level::Debug => "DEBUG",
            Level::Info => "INFO",
            Level::Warn => "WARN",
            Level::Error => "ERROR",
        }
    }
}

/// Appends lines to the local log, rolling over at LOG_ROLL_BYTES.
pub struct Log {
    dir: PathBuf,
    lock: Mutex<()>,
}

fn unix_seconds() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// One log line: `<unix seconds> <LEVEL> <code>: <text>`, with newlines flattened and length capped.
pub fn format_line(at: u64, level: Level, code: &str, text: &str) -> String {
    let clean = |s: &str| s.replace(['\r', '\n'], " ");
    let mut t = clean(text);
    if t.chars().count() > MAX_LINE_CHARS {
        t = t.chars().take(MAX_LINE_CHARS).collect::<String>() + " [cut]";
    }
    format!("{at} {} {}: {t}\n", level.tag(), clean(code))
}

impl Log {
    pub fn new(folder: &GameFolder) -> Self {
        Self { dir: folder.sub(Sub::Logs), lock: Mutex::new(()) }
    }
    pub fn dir(&self) -> &Path {
        &self.dir
    }
    pub fn write(&self, level: Level, code: &str, text: &str) -> std::io::Result<()> {
        let _g = self.lock.lock().unwrap_or_else(|p| p.into_inner());
        let path = self.dir.join(LOG_FILE);
        if std::fs::metadata(&path).map(|m| m.len() >= LOG_ROLL_BYTES).unwrap_or(false) {
            std::fs::rename(&path, self.dir.join(LOG_FILE_OLD))?;
        }
        let mut f = std::fs::OpenOptions::new().create(true).append(true).open(path)?;
        f.write_all(format_line(unix_seconds(), level, code, text).as_bytes())
    }
}

/// Text of a crash report for a native panic.
pub fn crash_text(version: &str, os: &str, message: &str, location: &str) -> String {
    format!(
        "Gridiron Manager crash report\nversion: {version}\nos: {os}\ntime (unix seconds): {}\nwhere: {location}\nmessage: {message}\n",
        unix_seconds()
    )
}

/// Installs a panic hook that writes a pending crash report and a log line, then runs the default
/// hook. The report is offered to the user on the next launch.
pub fn install_panic_hook(logs: PathBuf, version: String) {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic".into());
        let location = info.location().map(|l| format!("{}:{}", l.file(), l.line())).unwrap_or_default();
        let text = crash_text(&version, std::env::consts::OS, &message, &location);
        let _ = std::fs::write(logs.join(CRASH_PENDING), &text);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(logs.join(LOG_FILE)) {
            let _ = f.write_all(format_line(unix_seconds(), Level::Error, "shell.panic", &format!("{message} at {location}")).as_bytes());
        }
        default(info);
    }));
}

/// Takes the pending crash report, if any: returns its text and renames it to `crash-<time>.txt`
/// so it is offered once.
pub fn take_pending_crash(logs: &Path) -> Option<String> {
    let p = logs.join(CRASH_PENDING);
    let text = std::fs::read_to_string(&p).ok()?;
    let mut kept = logs.join(format!("crash-{}.txt", unix_seconds()));
    let mut n = 1;
    while kept.exists() {
        kept = logs.join(format!("crash-{}-{n}.txt", unix_seconds()));
        n += 1;
    }
    if std::fs::rename(&p, &kept).is_err() {
        let _ = std::fs::remove_file(&p);
    }
    Some(text)
}

/// A `diagnostic` message (P2.2.1) from the web view, written to the local log.
#[tauri::command]
pub fn log_diagnostic(log: State<Log>, level: Level, code: String, text: String) -> Result<(), String> {
    log.write(level, &code, &text).map_err(|e| e.to_string())
}

/// The crash report from the last session, if it crashed (O5.6.2: offered on next launch).
#[tauri::command]
pub fn crash_report_take(log: State<Log>) -> Option<String> {
    take_pending_crash(log.dir())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::folders::tests::temp_dir;

    #[test]
    fn line_format() {
        assert_eq!(format_line(5, Level::Warn, "seq.gap", "a\nb"), "5 WARN seq.gap: a b\n");
        let long = "x".repeat(MAX_LINE_CHARS + 10);
        assert!(format_line(0, Level::Info, "c", &long).ends_with(" [cut]\n"));
    }

    #[test]
    fn writes_and_rolls() {
        let f = GameFolder::at(temp_dir("log")).unwrap();
        let log = Log::new(&f);
        log.write(Level::Info, "a", "first").unwrap();
        let p = f.sub(Sub::Logs).join(LOG_FILE);
        assert!(std::fs::read_to_string(&p).unwrap().contains("INFO a: first"));
        std::fs::write(&p, vec![b'x'; LOG_ROLL_BYTES as usize]).unwrap();
        log.write(Level::Error, "b", "second").unwrap();
        assert_eq!(std::fs::metadata(f.sub(Sub::Logs).join(LOG_FILE_OLD)).unwrap().len(), LOG_ROLL_BYTES);
        assert!(std::fs::read_to_string(&p).unwrap().starts_with(char::is_numeric));
    }

    #[test]
    fn crash_offered_once() {
        let f = GameFolder::at(temp_dir("crash")).unwrap();
        let logs = f.sub(Sub::Logs);
        assert!(take_pending_crash(&logs).is_none());
        std::fs::write(logs.join(CRASH_PENDING), crash_text("1.0", "linux", "boom", "x.rs:1")).unwrap();
        let t = take_pending_crash(&logs).unwrap();
        assert!(t.contains("message: boom") && t.contains("version: 1.0"));
        assert!(take_pending_crash(&logs).is_none());
        let kept = std::fs::read_dir(&logs).unwrap().filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().starts_with("crash-")).count();
        assert_eq!(kept, 1);
    }

    #[test]
    fn levels_parse() {
        let l: Level = serde_json::from_str("\"error\"").unwrap();
        assert_eq!(l, Level::Error);
        assert!(serde_json::from_str::<Level>("\"fatal\"").is_err());
    }
}
