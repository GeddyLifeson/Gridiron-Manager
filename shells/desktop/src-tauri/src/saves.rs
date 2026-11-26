//! Save files (P5.1.1, P5.8.1, O5.6.1): native SQLite databases in the game folder, and plain
//! file operations on them. The core and the store run in the web view; this side only moves bytes
//! and runs SQL it is given.
use crate::folders::{io_message, validate_name, GameFolder, Sub, SAVE_EXT};
use rusqlite::{params_from_iter, types::Value as SqlValue, types::ValueRef, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

/// First 16 bytes of every SQLite 3 database file (SQLite file format, section 1.3).
pub const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

#[derive(Default)]
pub struct Dbs {
    next: u32,
    open: HashMap<u32, Connection>,
}

#[derive(Deserialize)]
pub struct Stmt {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveListing {
    pub name: String,
    pub size_bytes: u64,
}

// ---------- pure file operations (tested without a window) ----------

pub fn list(folder: &GameFolder) -> Result<Vec<SaveListing>, String> {
    let dir = folder.sub(Sub::Saves);
    let mut out = Vec::new();
    for e in std::fs::read_dir(&dir).map_err(|e| io_message("listing saves", &e))? {
        let e = e.map_err(|e| io_message("listing saves", &e))?;
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) != Some(SAVE_EXT) {
            continue;
        }
        let name = p.file_stem().and_then(|x| x.to_str()).unwrap_or_default().to_string();
        if validate_name(&name).is_ok() {
            out.push(SaveListing { name, size_bytes: e.metadata().map(|m| m.len()).unwrap_or(0) });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn delete(folder: &GameFolder, name: &str) -> Result<(), String> {
    let p = folder.save_path(name)?;
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| io_message(&format!("deleting save {name}"), &e))?;
    }
    Ok(())
}

pub fn read(folder: &GameFolder, name: &str) -> Result<Vec<u8>, String> {
    std::fs::read(folder.save_path(name)?).map_err(|e| io_message(&format!("reading save {name}"), &e))
}

/// Checks that `bytes` start like an SQLite database, so a wrong file is refused before it is copied.
pub fn check_sqlite(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() >= SQLITE_HEADER.len() && &bytes[..SQLITE_HEADER.len()] == SQLITE_HEADER {
        Ok(())
    } else {
        Err("this file is not a Gridiron Manager save (no SQLite header)".into())
    }
}

/// Writes `bytes` to `to` through a temporary file and a rename, so a crash or a full disk leaves
/// either the old file or the new one, never half of one (P5.8.1).
pub fn write_atomic(to: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = to.with_extension(format!("{SAVE_EXT}.tmp"));
    let what = format!("writing {}", to.file_name().and_then(|x| x.to_str()).unwrap_or("file"));
    let r = (|| -> std::io::Result<()> {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        std::fs::rename(&tmp, to)
    })();
    if let Err(e) = r {
        let _ = std::fs::remove_file(&tmp);
        return Err(io_message(&what, &e));
    }
    Ok(())
}

/// Import (O5.6.1): the bytes must be an SQLite file, and the name must be free unless `replace`.
pub fn import(folder: &GameFolder, name: &str, bytes: &[u8], replace: bool) -> Result<(), String> {
    check_sqlite(bytes)?;
    let to = folder.save_path(name)?;
    if !replace && to.exists() {
        return Err(format!("a save named {name} already exists"));
    }
    write_atomic(&to, bytes)
}

/// "Save a copy" (P5.8.1) is a file copy under a new name that must be free.
pub fn copy(folder: &GameFolder, from: &str, to: &str) -> Result<(), String> {
    let src = folder.save_path(from)?;
    let dst = folder.save_path(to)?;
    if !src.exists() {
        return Err(format!("no save named {from}"));
    }
    if dst.exists() {
        return Err(format!("a save named {to} already exists"));
    }
    let bytes = std::fs::read(&src).map_err(|e| io_message(&format!("reading save {from}"), &e))?;
    write_atomic(&dst, &bytes)
}

/// A free save name based on a file name the user picked (for import from any file).
pub fn name_from_file(path: &Path, folder: &GameFolder) -> String {
    let stem = path.file_stem().and_then(|x| x.to_str()).unwrap_or("imported");
    let mut base: String = stem.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' }).collect();
    base.truncate(crate::folders::MAX_NAME_LEN - 4);
    if base.is_empty() {
        base = "imported".into();
    }
    let mut name = base.clone();
    let mut n = 2;
    while folder.save_path(&name).map(|p| p.exists()).unwrap_or(true) {
        name = format!("{base}-{n}");
        n += 1;
    }
    name
}

// ---------- SQL bridge ----------

fn to_sql(v: &Value) -> Result<SqlValue, String> {
    Ok(match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().ok_or("bad number")?),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        Value::Object(o) => match o.get("bytes") {
            Some(Value::Array(a)) => SqlValue::Blob(
                a.iter()
                    .map(|x| x.as_u64().filter(|b| *b <= 255).map(|b| b as u8).ok_or("blob byte out of range"))
                    .collect::<Result<_, _>>()?,
            ),
            _ => return Err("unsupported parameter object".into()),
        },
        Value::Array(_) => return Err("unsupported parameter array".into()),
    })
}

fn from_sql(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::Number(i.into()),
        ValueRef::Real(f) => Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::Array(b.iter().map(|x| Value::Number((*x).into())).collect()),
    }
}

pub fn open_conn(path: &Path, name: &str, create: bool) -> Result<Connection, String> {
    let exists = path.exists();
    if create && exists {
        return Err(format!("a save named {name} already exists"));
    }
    if !create && !exists {
        return Err(format!("no save named {name}"));
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    // Rollback journal (not WAL), so the .gmsave file is complete and portable after every commit
    // (phase 0 decision; P5.8.1 durability comes from the per-command transaction).
    conn.execute_batch("PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn run_transaction(c: &mut Connection, statements: &[Stmt]) -> Result<(), String> {
    let tx = c.transaction().map_err(|e| e.to_string())?;
    for s in statements {
        let p: Vec<SqlValue> = s.params.iter().map(to_sql).collect::<Result<_, _>>()?;
        tx.execute(&s.sql, params_from_iter(p.iter())).map_err(|e| format!("{e} in: {}", s.sql))?;
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn query_all(c: &Connection, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
    let mut stmt = c.prepare(sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().map(|s| s.to_string()).collect();
    let p: Vec<SqlValue> = params.iter().map(to_sql).collect::<Result<_, _>>()?;
    let mut rows = stmt.query(params_from_iter(p.iter())).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut m = Map::new();
        for (i, n) in names.iter().enumerate() {
            m.insert(n.clone(), from_sql(row.get_ref(i).map_err(|e| e.to_string())?));
        }
        out.push(m);
    }
    Ok(out)
}

// ---------- commands ----------

#[tauri::command]
pub fn db_open(folder: State<GameFolder>, dbs: State<Mutex<Dbs>>, name: String, create: bool) -> Result<u32, String> {
    let conn = open_conn(&folder.save_path(&name)?, &name, create)?;
    let mut d = dbs.lock().map_err(|e| e.to_string())?;
    d.next += 1;
    let h = d.next;
    d.open.insert(h, conn);
    Ok(h)
}

#[tauri::command]
pub fn db_exec(dbs: State<Mutex<Dbs>>, handle: u32, sql: String) -> Result<(), String> {
    let d = dbs.lock().map_err(|e| e.to_string())?;
    let c = d.open.get(&handle).ok_or("database not open")?;
    c.execute_batch(&sql).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_transaction(dbs: State<Mutex<Dbs>>, handle: u32, statements: Vec<Stmt>) -> Result<(), String> {
    let mut d = dbs.lock().map_err(|e| e.to_string())?;
    let c = d.open.get_mut(&handle).ok_or("database not open")?;
    run_transaction(c, &statements)
}

#[tauri::command]
pub fn db_all(dbs: State<Mutex<Dbs>>, handle: u32, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
    let d = dbs.lock().map_err(|e| e.to_string())?;
    let c = d.open.get(&handle).ok_or("database not open")?;
    query_all(c, &sql, &params)
}

#[tauri::command]
pub fn db_close(dbs: State<Mutex<Dbs>>, handle: u32) -> Result<(), String> {
    let mut d = dbs.lock().map_err(|e| e.to_string())?;
    d.open.remove(&handle);
    Ok(())
}

#[tauri::command]
pub fn saves_list(folder: State<GameFolder>) -> Result<Vec<SaveListing>, String> {
    list(&folder)
}

#[tauri::command]
pub fn saves_delete(folder: State<GameFolder>, name: String) -> Result<(), String> {
    delete(&folder, &name)
}

#[tauri::command]
pub fn saves_read(folder: State<GameFolder>, name: String) -> Result<Vec<u8>, String> {
    read(&folder, &name)
}

#[tauri::command]
pub fn saves_write(folder: State<GameFolder>, name: String, bytes: Vec<u8>) -> Result<(), String> {
    import(&folder, &name, &bytes, true)
}

#[tauri::command]
pub fn saves_copy(folder: State<GameFolder>, from: String, to: String) -> Result<(), String> {
    copy(&folder, &from, &to)
}

/// Export through the native save dialog (O5.6.1). Returns the chosen path, or None if cancelled.
/// Async so the blocking dialog runs off the main thread.
#[tauri::command]
pub async fn saves_export_dialog(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    use tauri::Manager;
    use tauri_plugin_dialog::DialogExt;
    let folder = app.state::<GameFolder>().inner().clone();
    let bytes = read(&folder, &name)?;
    let picked = app
        .dialog()
        .file()
        .set_title("Export save")
        .set_directory(folder.sub(Sub::Exports))
        .set_file_name(format!("{name}.{SAVE_EXT}"))
        .add_filter("Gridiron Manager save", &[SAVE_EXT])
        .blocking_save_file();
    let Some(fp) = picked else { return Ok(None) };
    let path: PathBuf = fp.into_path().map_err(|e| e.to_string())?;
    write_atomic(&path, &bytes)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Import through the native open dialog (O5.6.1). Returns the new save's name, or None if cancelled.
#[tauri::command]
pub async fn saves_import_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri::Manager;
    use tauri_plugin_dialog::DialogExt;
    let folder = app.state::<GameFolder>().inner().clone();
    let picked = app
        .dialog()
        .file()
        .set_title("Import save")
        .add_filter("Gridiron Manager save", &[SAVE_EXT])
        .blocking_pick_file();
    let Some(fp) = picked else { return Ok(None) };
    let path: PathBuf = fp.into_path().map_err(|e| e.to_string())?;
    let bytes = std::fs::read(&path).map_err(|e| io_message("reading the chosen file", &e))?;
    let name = name_from_file(&path, &folder);
    import(&folder, &name, &bytes, false)?;
    Ok(Some(name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::folders::tests::temp_dir;

    fn folder(tag: &str) -> GameFolder {
        GameFolder::at(temp_dir(tag)).unwrap()
    }

    fn sqlite_bytes(dir: &Path) -> Vec<u8> {
        let p = dir.join("src.db");
        let c = Connection::open(&p).unwrap();
        c.execute_batch("CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (7);").unwrap();
        drop(c);
        std::fs::read(p).unwrap()
    }

    #[test]
    fn native_save_round_trip() {
        let f = folder("roundtrip");
        let p = f.save_path("career").unwrap();
        let mut c = open_conn(&p, "career", true).unwrap();
        assert!(open_conn(&p, "career", true).is_err(), "create refuses an existing save");
        c.execute_batch("CREATE TABLE log (seq INTEGER PRIMARY KEY, body BLOB, note TEXT, v REAL)").unwrap();
        let stmts: Vec<Stmt> = serde_json::from_value(serde_json::json!([
            { "sql": "INSERT INTO log VALUES (?, ?, ?, ?)", "params": [1, { "bytes": [0, 255, 9] }, "a", 1.5] },
            { "sql": "INSERT INTO log VALUES (?, ?, ?, ?)", "params": [2, null, true, -2] }
        ]))
        .unwrap();
        run_transaction(&mut c, &stmts).unwrap();
        drop(c);
        // Reopen as a later launch would, and read back.
        let c = open_conn(&p, "career", false).unwrap();
        let rows = query_all(&c, "SELECT * FROM log WHERE seq >= ? ORDER BY seq", &[serde_json::json!(1)]).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["body"], serde_json::json!([0, 255, 9]));
        assert_eq!(rows[0]["v"], serde_json::json!(1.5));
        assert_eq!(rows[1]["note"], serde_json::json!("1"));
        assert_eq!(list(&f).unwrap(), vec![SaveListing { name: "career".into(), size_bytes: std::fs::metadata(&p).unwrap().len() }]);
        assert!(open_conn(&f.save_path("none").unwrap(), "none", false).is_err());
    }

    #[test]
    fn failed_transaction_changes_nothing() {
        let f = folder("rollback");
        let p = f.save_path("s").unwrap();
        let mut c = open_conn(&p, "s", true).unwrap();
        c.execute_batch("CREATE TABLE t (x INTEGER PRIMARY KEY)").unwrap();
        let stmts: Vec<Stmt> = serde_json::from_value(serde_json::json!([
            { "sql": "INSERT INTO t VALUES (1)" },
            { "sql": "INSERT INTO t VALUES (1)" }
        ]))
        .unwrap();
        assert!(run_transaction(&mut c, &stmts).is_err());
        assert!(query_all(&c, "SELECT * FROM t", &[]).unwrap().is_empty());
    }

    #[test]
    fn bad_blob_byte_refused() {
        assert!(to_sql(&serde_json::json!({ "bytes": [256] })).is_err());
        assert!(to_sql(&serde_json::json!([1])).is_err());
    }

    #[test]
    fn import_copy_delete() {
        let f = folder("files");
        let good = sqlite_bytes(f.root());
        assert!(import(&f, "x", b"not a database at all", false).is_err());
        import(&f, "x", &good, false).unwrap();
        assert!(import(&f, "x", &good, false).is_err(), "import refuses to overwrite");
        import(&f, "x", &good, true).unwrap();
        copy(&f, "x", "y").unwrap();
        assert!(copy(&f, "x", "y").is_err());
        assert!(copy(&f, "nope", "z").is_err());
        assert_eq!(read(&f, "y").unwrap(), good);
        let c = open_conn(&f.save_path("y").unwrap(), "y", false).unwrap();
        assert_eq!(query_all(&c, "SELECT x FROM t", &[]).unwrap()[0]["x"], serde_json::json!(7));
        drop(c);
        delete(&f, "x").unwrap();
        delete(&f, "x").unwrap();
        assert_eq!(list(&f).unwrap().iter().map(|s| s.name.as_str()).collect::<Vec<_>>(), vec!["y"]);
        assert!(!f.sub(Sub::Saves).join("y.gmsave.tmp").exists(), "no temporary file left behind");
    }

    #[test]
    fn import_names_from_files() {
        let f = folder("names");
        assert_eq!(name_from_file(Path::new("/a/My Career (2).gmsave"), &f), "My-Career--2-");
        std::fs::write(f.save_path("dup").unwrap(), b"x").unwrap();
        assert_eq!(name_from_file(Path::new("dup.gmsave"), &f), "dup-2");
        assert_eq!(name_from_file(Path::new("/é.gmsave"), &f), "-");
        assert!(validate_name(&name_from_file(Path::new(&format!("{}.gmsave", "z".repeat(200))), &f)).is_ok());
    }
}
