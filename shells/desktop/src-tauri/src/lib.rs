//! Desktop shell (bible P2.3.1). Provides windows, native SQLite save files and the gate hook.
//! It holds no game logic: the core runs in the web view, the same bundle as the browser build.
use rusqlite::{params_from_iter, types::Value as SqlValue, types::ValueRef, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

const EXT: &str = "gmsave";

#[derive(Default)]
struct Dbs {
    next: u32,
    open: HashMap<u32, Connection>,
}

#[derive(Deserialize)]
struct Stmt {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveListing {
    name: String,
    size_bytes: u64,
}

fn saves_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("saves");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn save_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("invalid save name: {name}"));
    }
    Ok(saves_dir(app)?.join(format!("{name}.{EXT}")))
}

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
            Some(Value::Array(a)) => SqlValue::Blob(a.iter().map(|x| x.as_u64().unwrap_or(0) as u8).collect()),
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

#[tauri::command]
fn db_open(app: AppHandle, dbs: State<Mutex<Dbs>>, name: String, create: bool) -> Result<u32, String> {
    let path = save_path(&app, &name)?;
    let exists = path.exists();
    if create && exists {
        return Err(format!("a save named {name} already exists"));
    }
    if !create && !exists {
        return Err(format!("no save named {name}"));
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    // Rollback journal (not WAL), so the .gmsave file is complete and portable after every commit.
    conn.execute_batch("PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = ON;").map_err(|e| e.to_string())?;
    let mut d = dbs.lock().map_err(|e| e.to_string())?;
    d.next += 1;
    let h = d.next;
    d.open.insert(h, conn);
    Ok(h)
}

#[tauri::command]
fn db_exec(dbs: State<Mutex<Dbs>>, handle: u32, sql: String) -> Result<(), String> {
    let d = dbs.lock().map_err(|e| e.to_string())?;
    let c = d.open.get(&handle).ok_or("database not open")?;
    c.execute_batch(&sql).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_transaction(dbs: State<Mutex<Dbs>>, handle: u32, statements: Vec<Stmt>) -> Result<(), String> {
    let mut d = dbs.lock().map_err(|e| e.to_string())?;
    let c = d.open.get_mut(&handle).ok_or("database not open")?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    for s in &statements {
        let p: Vec<SqlValue> = s.params.iter().map(to_sql).collect::<Result<_, _>>()?;
        tx.execute(&s.sql, params_from_iter(p.iter())).map_err(|e| format!("{e} in: {}", s.sql))?;
    }
    tx.commit().map_err(|e| e.to_string())
}

#[tauri::command]
fn db_all(dbs: State<Mutex<Dbs>>, handle: u32, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
    let d = dbs.lock().map_err(|e| e.to_string())?;
    let c = d.open.get(&handle).ok_or("database not open")?;
    let mut stmt = c.prepare(&sql).map_err(|e| e.to_string())?;
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

#[tauri::command]
fn db_close(dbs: State<Mutex<Dbs>>, handle: u32) -> Result<(), String> {
    let mut d = dbs.lock().map_err(|e| e.to_string())?;
    d.open.remove(&handle);
    Ok(())
}

#[tauri::command]
fn saves_list(app: AppHandle) -> Result<Vec<SaveListing>, String> {
    let mut out = Vec::new();
    for e in std::fs::read_dir(saves_dir(&app)?).map_err(|e| e.to_string())? {
        let e = e.map_err(|e| e.to_string())?;
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) == Some(EXT) {
            let name = p.file_stem().and_then(|x| x.to_str()).unwrap_or_default().to_string();
            out.push(SaveListing { name, size_bytes: e.metadata().map(|m| m.len()).unwrap_or(0) });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
fn saves_delete(app: AppHandle, name: String) -> Result<(), String> {
    let p = save_path(&app, &name)?;
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn saves_read(app: AppHandle, name: String) -> Result<Vec<u8>, String> {
    std::fs::read(save_path(&app, &name)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn saves_write(app: AppHandle, name: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(save_path(&app, &name)?, bytes).map_err(|e| e.to_string())
}

/// `--gate <file>`: run the golden set in the web view, write the result, and exit (R1.2.1 gate).
#[tauri::command]
fn gate_out_path() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    args.iter().position(|a| a == "--gate").and_then(|i| args.get(i + 1).cloned())
}

#[tauri::command]
fn gate_write_and_exit(app: AppHandle, path: String, text: String, ok: bool) -> Result<(), String> {
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    app.exit(if ok { 0 } else { 1 });
    Ok(())
}

/// `--copy-save <name> <file>`: copy a desktop save out for the cross-platform save check.
fn copy_save_arg() -> Option<(String, String)> {
    let args: Vec<String> = std::env::args().collect();
    let i = args.iter().position(|a| a == "--copy-save")?;
    Some((args.get(i + 1)?.clone(), args.get(i + 2)?.clone()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(Dbs::default()))
        .setup(|app| {
            if let Some((name, to)) = copy_save_arg() {
                let from = save_path(app.handle(), &name)?;
                std::fs::copy(from, to)?;
                std::process::exit(0);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_open, db_exec, db_transaction, db_all, db_close,
            saves_list, saves_delete, saves_read, saves_write,
            gate_out_path, gate_write_and_exit
        ])
        .run(tauri::generate_context!())
        .expect("error while running the desktop shell");
}
