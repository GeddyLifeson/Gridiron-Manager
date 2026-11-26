//! The game folder (P2.3.1): saves, user content (P7.1.1), logs and exports are ordinary files in
//! one folder the user can open. Pure path logic lives here so it can be tested without a window.
use std::io;
use std::path::{Path, PathBuf};

/// File extension of a save (one SQLite database per save, P5.1.1).
pub const SAVE_EXT: &str = "gmsave";
/// Name of the game folder inside the user's Documents folder.
/// Named decision (G-05): P2.3.1 asks for "a game folder he can open"; Documents is the place an
/// ordinary user looks on Windows, macOS and Linux. Falls back to the app data folder.
pub const GAME_FOLDER_NAME: &str = "Gridiron Manager";
/// Environment override for the game folder, used by tests and portable installs.
pub const GAME_DIR_ENV: &str = "GM_GAME_DIR";
/// Longest save or pack name accepted. Named assumption: keeps every path well under the
/// 260-character Windows path limit even inside a deep Documents folder.
pub const MAX_NAME_LEN: usize = 64;

/// Subfolders of the game folder.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Sub {
    Saves,
    UserContent,
    Logs,
    Exports,
}

impl Sub {
    pub const ALL: [Sub; 4] = [Sub::Saves, Sub::UserContent, Sub::Logs, Sub::Exports];
    pub fn dir_name(self) -> &'static str {
        match self {
            Sub::Saves => "saves",
            Sub::UserContent => "user-content",
            Sub::Logs => "logs",
            Sub::Exports => "exports",
        }
    }
}

/// The resolved game folder and its subfolders.
#[derive(Clone, Debug)]
pub struct GameFolder {
    root: PathBuf,
}

impl GameFolder {
    /// Uses `root` as the game folder and creates every subfolder.
    pub fn at(root: PathBuf) -> io::Result<Self> {
        for s in Sub::ALL {
            std::fs::create_dir_all(root.join(s.dir_name()))?;
        }
        Ok(Self { root })
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn sub(&self, s: Sub) -> PathBuf {
        self.root.join(s.dir_name())
    }
    /// Path of the save file named `name` (validated).
    pub fn save_path(&self, name: &str) -> Result<PathBuf, String> {
        validate_name(name)?;
        Ok(self.sub(Sub::Saves).join(format!("{name}.{SAVE_EXT}")))
    }
}

/// Picks the game folder: the override if set, else Documents/Gridiron Manager, else the fallback.
pub fn choose_root(env_override: Option<PathBuf>, documents: Option<PathBuf>, fallback: PathBuf) -> PathBuf {
    if let Some(p) = env_override.filter(|p| !p.as_os_str().is_empty()) {
        return p;
    }
    match documents {
        Some(d) => d.join(GAME_FOLDER_NAME),
        None => fallback,
    }
}

/// Save and pack names: ASCII letters, digits, '-' and '_', 1 to MAX_NAME_LEN characters. This
/// keeps names safe as file names on every platform and rules out path traversal.
pub fn validate_name(name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= MAX_NAME_LEN
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(())
    } else {
        Err(format!("invalid name: {name:?} (use 1 to {MAX_NAME_LEN} letters, digits, '-' or '_')"))
    }
}

/// Moves saves from the phase 0 location (app data folder/saves) into the game folder, once.
/// A save already present in the game folder is never overwritten. Returns the names moved.
pub fn migrate_legacy_saves(legacy_saves: &Path, folder: &GameFolder) -> io::Result<Vec<String>> {
    let mut moved = Vec::new();
    if !legacy_saves.is_dir() || legacy_saves == folder.sub(Sub::Saves) {
        return Ok(moved);
    }
    let mut entries: Vec<PathBuf> = std::fs::read_dir(legacy_saves)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().and_then(|x| x.to_str()) == Some(SAVE_EXT))
        .collect();
    entries.sort();
    for p in entries {
        let Some(name) = p.file_stem().and_then(|x| x.to_str()).map(str::to_string) else { continue };
        if validate_name(&name).is_err() {
            continue;
        }
        let to = folder.sub(Sub::Saves).join(format!("{name}.{SAVE_EXT}"));
        if to.exists() {
            continue;
        }
        // Copy then remove, so a move across drives works and a failure leaves the original.
        std::fs::copy(&p, &to)?;
        std::fs::remove_file(&p)?;
        moved.push(name);
    }
    Ok(moved)
}

/// Turns an I/O error into a message for the user. Disk full gets its own wording (P5.8.1 edge case).
pub fn io_message(what: &str, e: &io::Error) -> String {
    match e.kind() {
        io::ErrorKind::StorageFull => format!("{what}: the disk is full. Free some space and try again."),
        io::ErrorKind::PermissionDenied => format!("{what}: permission denied ({e})."),
        io::ErrorKind::NotFound => format!("{what}: not found."),
        _ => format!("{what}: {e}"),
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// A fresh empty folder under the system temp folder for one test.
    pub fn temp_dir(tag: &str) -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static N: AtomicU32 = AtomicU32::new(0);
        let d = std::env::temp_dir().join(format!("gm-desktop-test-{}-{tag}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn names() {
        assert!(validate_name("career-1_a").is_ok());
        assert!(validate_name(&"a".repeat(MAX_NAME_LEN)).is_ok());
        for bad in ["", "../x", "a/b", "a\\b", "a.b", "CON ", "é", &"a".repeat(MAX_NAME_LEN + 1)] {
            assert!(validate_name(bad).is_err(), "{bad:?} accepted");
        }
    }

    #[test]
    fn root_choice() {
        let fb = PathBuf::from("/fallback");
        assert_eq!(choose_root(Some("/o".into()), Some("/d".into()), fb.clone()), PathBuf::from("/o"));
        assert_eq!(choose_root(Some("".into()), Some("/d".into()), fb.clone()), PathBuf::from("/d").join(GAME_FOLDER_NAME));
        assert_eq!(choose_root(None, None, fb.clone()), fb);
    }

    #[test]
    fn creates_layout_and_save_paths() {
        let d = temp_dir("layout");
        let f = GameFolder::at(d.join("gm")).unwrap();
        for s in Sub::ALL {
            assert!(f.sub(s).is_dir());
        }
        assert_eq!(f.save_path("x").unwrap(), f.sub(Sub::Saves).join("x.gmsave"));
        assert!(f.save_path("../x").is_err());
    }

    #[test]
    fn migrates_once_without_overwriting() {
        let d = temp_dir("migrate");
        let legacy = d.join("legacy");
        std::fs::create_dir_all(&legacy).unwrap();
        std::fs::write(legacy.join("a.gmsave"), b"old-a").unwrap();
        std::fs::write(legacy.join("b.gmsave"), b"old-b").unwrap();
        std::fs::write(legacy.join("bad name.gmsave"), b"x").unwrap();
        std::fs::write(legacy.join("notes.txt"), b"x").unwrap();
        let f = GameFolder::at(d.join("gm")).unwrap();
        std::fs::write(f.save_path("b").unwrap(), b"new-b").unwrap();
        let moved = migrate_legacy_saves(&legacy, &f).unwrap();
        assert_eq!(moved, vec!["a".to_string()]);
        assert_eq!(std::fs::read(f.save_path("a").unwrap()).unwrap(), b"old-a");
        assert_eq!(std::fs::read(f.save_path("b").unwrap()).unwrap(), b"new-b");
        assert!(legacy.join("b.gmsave").exists(), "a save that would be overwritten stays where it was");
        assert!(migrate_legacy_saves(&legacy, &f).unwrap().is_empty());
        assert!(migrate_legacy_saves(&d.join("missing"), &f).unwrap().is_empty());
    }

    #[test]
    fn disk_full_message() {
        let e = io::Error::from(io::ErrorKind::StorageFull);
        assert!(io_message("writing save x", &e).contains("disk is full"));
    }
}
