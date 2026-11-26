//! Second window (P2.3.3): another interface client of the same game, showing film, the call
//! sheet, the booth view or a reference screen. It holds only view state; the client decides what
//! it renders from the role the shell gives it at start.
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const MAIN: &str = "main";
pub const SECOND: &str = "second";
/// What a second window may show (P2.3.3, O1).
pub const VIEWS: [&str; 4] = ["film", "callSheet", "booth", "reference"];
/// Second window size in logical pixels. Named assumption, same as the main window's starting size.
pub const SECOND_SIZE: (f64, f64) = (1100.0, 820.0);

pub fn check_view(view: &str) -> Result<(), String> {
    if VIEWS.contains(&view) {
        Ok(())
    } else {
        Err(format!("unknown second-window view: {view} (one of {})", VIEWS.join(", ")))
    }
}

/// Script run before the client loads, telling it which window it is. Values are checked first,
/// so the string is plain ASCII with no quotes.
pub fn role_script(role: &str, view: Option<&str>) -> String {
    match view {
        Some(v) => format!("window.__GM_WINDOW__ = {{ role: '{role}', view: '{v}' }};"),
        None => format!("window.__GM_WINDOW__ = {{ role: '{role}' }};"),
    }
}

/// Opens the second window showing `view`, or focuses it and asks it to switch view.
#[tauri::command]
pub async fn window_open_second(app: AppHandle, view: String) -> Result<(), String> {
    use tauri::Emitter;
    check_view(&view)?;
    if let Some(w) = app.get_webview_window(SECOND) {
        w.emit("gm://second-window-view", &view).map_err(|e| e.to_string())?;
        w.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, SECOND, WebviewUrl::App("index.html".into()))
        .title("Gridiron Manager: second window")
        .inner_size(SECOND_SIZE.0, SECOND_SIZE.1)
        .initialization_script(role_script(SECOND, Some(&view)))
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_close_second(app: AppHandle) -> Result<(), String> {
    match app.get_webview_window(SECOND) {
        Some(w) => w.close().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// P2.3.3 edge case: closing the main window closes the second.
pub fn on_main_destroyed(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(SECOND) {
        let _ = w.destroy();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn views() {
        for v in VIEWS {
            assert!(check_view(v).is_ok());
        }
        assert!(check_view("'; alert(1); '").is_err());
        assert_eq!(role_script(SECOND, Some("film")), "window.__GM_WINDOW__ = { role: 'second', view: 'film' };");
        assert_eq!(role_script(MAIN, None), "window.__GM_WINDOW__ = { role: 'main' };");
    }
}
