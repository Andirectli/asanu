use tauri::menu::Menu;

const SERVICE: &str = "app.asanu.desktop";

// One keystore entry per server address, so switching servers never mixes tokens.
fn entry(server: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, server).map_err(|e| e.to_string())
}

#[tauri::command]
fn token_get(server: String) -> Result<Option<String>, String> {
    match entry(&server)?.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn token_set(server: String, token: String) -> Result<(), String> {
    entry(&server)?.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
fn token_delete(server: String) -> Result<(), String> {
    match entry(&server)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // standard app menu: About/Hide/Quit, Edit (copy/paste/undo), Window
        .menu(|app| Menu::default(app))
        .invoke_handler(tauri::generate_handler![token_get, token_set, token_delete])
        .run(tauri::generate_context!())
        .expect("error while running Asanu");
}
