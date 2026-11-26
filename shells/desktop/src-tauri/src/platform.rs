//! Machine facts the client needs and the shell alone can give: simulation pool size (P2.1.3),
//! versions, the web view minimum (P2.3.1 edge case), the game folder, and user content (P7.1.1).
use crate::folders::{validate_name, GameFolder, Sub};
use serde::Serialize;
use std::path::Path;
use tauri::State;

/// P2.1.3: pool size is logical processors minus 2, minimum 1, maximum 8 (bible starting values,
/// a setting; the client may lower it).
pub const POOL_RESERVED: usize = 2;
pub const POOL_MIN: usize = 1;
pub const POOL_MAX: usize = 8;

pub fn pool_size(logical_processors: usize) -> usize {
    logical_processors.saturating_sub(POOL_RESERVED).clamp(POOL_MIN, POOL_MAX)
}

/// Oldest web view the bundle supports. Named assumptions (not triple verified): the client is
/// built for ES2022 (shells/browser/vite.config.ts), and class static blocks, the newest ES2022
/// feature, arrived in Chromium 94 and in the WebKit of Safari 16.4, which WebKitGTK 2.40 matches.
/// WebView2 on Windows updates itself, so the Windows check rarely fires.
pub const MIN_CHROMIUM_MAJOR: u32 = 94;
pub const MIN_WEBKITGTK: (u32, u32) = (2, 40);

/// Parses the first two numbers of a version string such as "131.0.2903.70" or "2.52.6".
pub fn major_minor(v: &str) -> Option<(u32, u32)> {
    let mut it = v.trim().split(|c: char| !c.is_ascii_digit()).filter(|s| !s.is_empty());
    let major = it.next()?.parse().ok()?;
    let minor = it.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    Some((major, minor))
}

/// The plain message to show when the web view is too old, or None when it is fine or unknown.
/// `os` is `std::env::consts::OS`. An unreadable version is let through and logged, not blocked.
pub fn webview_problem(os: &str, version: &str) -> Option<String> {
    let v = major_minor(version)?;
    match os {
        "windows" if v.0 < MIN_CHROMIUM_MAJOR => Some(format!(
            "Gridiron Manager needs Microsoft Edge WebView2 version {MIN_CHROMIUM_MAJOR} or newer, and this computer has {version}.\n\nUpdate it with Windows Update, or install the Evergreen WebView2 Runtime from Microsoft, then start the game again."
        )),
        "linux" if v < MIN_WEBKITGTK => Some(format!(
            "Gridiron Manager needs WebKitGTK {}.{} or newer, and this computer has {version}.\n\nUpdate the webkit2gtk-4.1 package with your system's package manager, then start the game again.",
            MIN_WEBKITGTK.0, MIN_WEBKITGTK.1
        )),
        _ => None,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub app_version: String,
    pub os: String,
    pub arch: String,
    pub webview_version: String,
    pub logical_processors: usize,
    /// P2.1.3 pool size for this machine.
    pub pool_size: usize,
    pub game_folder: String,
    pub saves_folder: String,
    pub user_content_folder: String,
    pub logs_folder: String,
    pub exports_folder: String,
    /// P2.3.1 / O5.6.1: v1 makes no network request. There is no version check in this build.
    pub network_requests: bool,
}

pub fn logical_processors() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1)
}

pub fn info(app_version: &str, webview_version: &str, folder: &GameFolder) -> PlatformInfo {
    let s = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
    let n = logical_processors();
    PlatformInfo {
        app_version: app_version.into(),
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        webview_version: webview_version.into(),
        logical_processors: n,
        pool_size: pool_size(n),
        game_folder: folder.root().to_string_lossy().into_owned(),
        saves_folder: s(folder.sub(Sub::Saves)),
        user_content_folder: s(folder.sub(Sub::UserContent)),
        logs_folder: s(folder.sub(Sub::Logs)),
        exports_folder: s(folder.sub(Sub::Exports)),
        network_requests: false,
    }
}

// ---------- user content folder (P7.1.1) ----------

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContentEntry {
    /// Pack folder name, or zip file name without extension.
    pub name: String,
    pub kind: ContentKind,
    pub size_bytes: u64,
}

#[derive(Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum ContentKind {
    Folder,
    Zip,
}

fn dir_size(p: &Path) -> u64 {
    std::fs::read_dir(p)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| match e.file_type() {
                    Ok(t) if t.is_dir() => dir_size(&e.path()),
                    Ok(t) if t.is_file() => e.metadata().map(|m| m.len()).unwrap_or(0),
                    _ => 0,
                })
                .sum()
        })
        .unwrap_or(0)
}

/// Lists packs in the user content folder: each subfolder and each `.zip`. Validation of what is
/// inside is the content pipeline's job (P4.2) in the web view; the shell only finds and reads.
pub fn list_content(folder: &GameFolder) -> Result<Vec<ContentEntry>, String> {
    let dir = folder.sub(Sub::UserContent);
    let mut out = Vec::new();
    for e in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let e = e.map_err(|e| e.to_string())?;
        let p = e.path();
        let ft = e.file_type().map_err(|e| e.to_string())?;
        let file_name = e.file_name().to_string_lossy().into_owned();
        if file_name.starts_with('.') {
            continue;
        }
        if ft.is_dir() {
            out.push(ContentEntry { name: file_name, kind: ContentKind::Folder, size_bytes: dir_size(&p) });
        } else if ft.is_file() && p.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("zip")) == Some(true) {
            let name = p.file_stem().and_then(|x| x.to_str()).unwrap_or_default().to_string();
            out.push(ContentEntry { name, kind: ContentKind::Zip, size_bytes: e.metadata().map(|m| m.len()).unwrap_or(0) });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name).then((a.kind as u8).cmp(&(b.kind as u8))));
    Ok(out)
}

/// Checks a relative path inside a pack: forward-slash parts, no empty, `.` or `..` part, no drive
/// or root, and each part a plain file name. Rules out reading outside the pack.
pub fn check_rel_path(rel: &str) -> Result<Vec<&str>, String> {
    let parts: Vec<&str> = rel.split('/').collect();
    let ok = !rel.is_empty()
        && parts.iter().all(|p| {
            !p.is_empty() && *p != "." && *p != ".." && !p.contains(['\\', ':', '\0']) && !p.starts_with('.')
        });
    if ok {
        Ok(parts)
    } else {
        Err(format!("invalid path inside a pack: {rel:?}"))
    }
}

/// Reads one file of a folder pack, or the whole zip of a zip pack when `rel` is None.
pub fn read_content(folder: &GameFolder, pack: &str, rel: Option<&str>) -> Result<Vec<u8>, String> {
    let base = folder.sub(Sub::UserContent);
    let path = match rel {
        None => {
            validate_name(pack)?;
            std::fs::read_dir(&base)
                .map_err(|e| e.to_string())?
                .filter_map(|e| e.ok().map(|e| e.path()))
                .find(|p| {
                    p.file_stem().and_then(|x| x.to_str()) == Some(pack)
                        && p.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("zip")) == Some(true)
                })
                .ok_or_else(|| format!("no zip pack named {pack}"))?
        }
        Some(r) => {
            check_rel_path(pack)?;
            if pack.contains('/') {
                return Err(format!("invalid pack name: {pack:?}"));
            }
            let mut p = base.join(pack);
            for part in check_rel_path(r)? {
                p.push(part);
            }
            p
        }
    };
    std::fs::read(&path).map_err(|e| crate::folders::io_message("reading user content", &e))
}

// ---------- commands ----------

pub struct AppMeta {
    pub version: String,
    pub webview_version: String,
}

#[tauri::command]
pub fn platform_info(meta: State<AppMeta>, folder: State<GameFolder>) -> PlatformInfo {
    info(&meta.version, &meta.webview_version, &folder)
}

#[tauri::command]
pub fn content_list(folder: State<GameFolder>) -> Result<Vec<ContentEntry>, String> {
    list_content(&folder)
}

#[tauri::command]
pub fn content_read(folder: State<GameFolder>, pack: String, path: Option<String>) -> Result<Vec<u8>, String> {
    read_content(&folder, &pack, path.as_deref())
}

/// Opens the game folder, or one of its subfolders, in the system file manager.
#[tauri::command]
pub fn open_game_folder(app: tauri::AppHandle, folder: State<GameFolder>, sub: Option<String>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let path = match sub.as_deref() {
        None => folder.root().to_path_buf(),
        Some(s) => {
            let which = Sub::ALL.into_iter().find(|x| x.dir_name() == s).ok_or_else(|| format!("unknown folder: {s}"))?;
            folder.sub(which)
        }
    };
    app.opener().open_path(path.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::folders::tests::temp_dir;

    #[test]
    fn pool_size_follows_p2_1_3() {
        assert_eq!(pool_size(0), 1);
        assert_eq!(pool_size(1), 1);
        assert_eq!(pool_size(2), 1);
        assert_eq!(pool_size(3), 1);
        assert_eq!(pool_size(4), 2);
        assert_eq!(pool_size(10), 8);
        assert_eq!(pool_size(64), 8);
        assert!((POOL_MIN..=POOL_MAX).contains(&pool_size(logical_processors())));
    }

    #[test]
    fn versions() {
        assert_eq!(major_minor("131.0.2903.70"), Some((131, 0)));
        assert_eq!(major_minor("2.52.6"), Some((2, 52)));
        assert_eq!(major_minor("WebKitGTK 2.38"), Some((2, 38)));
        assert_eq!(major_minor("7"), Some((7, 0)));
        assert_eq!(major_minor("unknown"), None);
    }

    #[test]
    fn webview_minimum() {
        assert!(webview_problem("windows", "93.0.961.52").unwrap().contains("WebView2"));
        assert!(webview_problem("windows", "131.0.2903.70").is_none());
        assert!(webview_problem("linux", "2.38.6").unwrap().contains("webkit2gtk-4.1"));
        assert!(webview_problem("linux", "2.40.0").is_none());
        assert!(webview_problem("linux", "2.52.6").is_none());
        assert!(webview_problem("macos", "605.1.15").is_none(), "macOS is not tested yet, never blocked");
        assert!(webview_problem("windows", "").is_none(), "an unreadable version is not blocked");
    }

    #[test]
    fn content_listing_and_reading() {
        let f = GameFolder::at(temp_dir("content")).unwrap();
        let uc = f.sub(Sub::UserContent);
        std::fs::create_dir_all(uc.join("my-plays/plays")).unwrap();
        std::fs::write(uc.join("my-plays/pack.json"), b"{}").unwrap();
        std::fs::write(uc.join("my-plays/plays/a.json"), b"[1]").unwrap();
        std::fs::write(uc.join("league.ZIP"), b"PK..").unwrap();
        std::fs::write(uc.join("readme.txt"), b"x").unwrap();
        std::fs::create_dir_all(uc.join(".hidden")).unwrap();
        let l = list_content(&f).unwrap();
        assert_eq!(
            l,
            vec![
                ContentEntry { name: "league".into(), kind: ContentKind::Zip, size_bytes: 4 },
                ContentEntry { name: "my-plays".into(), kind: ContentKind::Folder, size_bytes: 5 },
            ]
        );
        assert_eq!(read_content(&f, "my-plays", Some("plays/a.json")).unwrap(), b"[1]");
        for bad in ["../x", "plays/../../x", "/etc/passwd", "C:/x", "a//b", ".git/config", "a\\b"] {
            assert!(read_content(&f, "my-plays", Some(bad)).is_err(), "{bad:?} read");
        }
        assert!(read_content(&f, "..", Some("x")).is_err());
        assert!(read_content(&f, "a/b", Some("x")).is_err());
        assert_eq!(read_content(&f, "league", None).unwrap(), b"PK..");
        assert!(read_content(&f, "nope", None).is_err());
    }
}
