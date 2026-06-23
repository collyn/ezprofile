use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Key, Nonce};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::Utc;
use hmac::Hmac;
use pbkdf2::pbkdf2;
use rand::Rng;
use sha2::Sha256;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::Instant,
};
use futures_util::{SinkExt, StreamExt};
use std::net::TcpListener;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;
use walkdir::WalkDir;
use zip::{write::FileOptions, ZipWriter};

pub type ApiResult<T> = Result<T, String>;

macro_rules! setting_bool_cmd {
    ($get:ident, $set:ident, $key:expr, $default:expr) => {
        #[tauri::command]
        fn $get(state: State<AppState>) -> ApiResult<bool> {
            Ok(get_setting(&conn(&state)?, $key)?.map(|v| v == "true").unwrap_or($default))
        }
        #[tauri::command]
        fn $set(state: State<AppState>, enabled: bool) -> ApiResult<()> {
            set_setting(&conn(&state)?, $key, if enabled { "true" } else { "false" })
        }
    };
}

#[derive(Default)]
struct ProcessRegistry {
    children: Mutex<HashMap<String, RunningInstance>>,
}

struct RunningInstance {
    child: Arc<Mutex<Child>>,
    debug_port: u16,
}

struct AppState {
    db_path: PathBuf,
    profiles_dir: PathBuf,
    browsers_dir: PathBuf,
    extensions_dir: PathBuf,
    processes: ProcessRegistry,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Profile {
    id: String,
    name: String,
    group_name: Option<String>,
    proxy_type: Option<String>,
    proxy_host: Option<String>,
    proxy_port: Option<i64>,
    proxy_user: Option<String>,
    proxy_pass: Option<String>,
    proxy_enabled: i64,
    notes: Option<String>,
    browser_version: Option<String>,
    user_data_dir: String,
    startup_url: Option<String>,
    startup_type: String,
    startup_urls: Option<String>,
    fingerprint_flags: Option<String>,
    status: String,
    last_run_at: Option<String>,
    created_at: String,
    updated_at: String,
    has_password: bool,
    #[serde(skip_serializing)]
    password_hash: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreateProfileInput {
    id: Option<String>,
    name: String,
    group_name: Option<String>,
    proxy_type: Option<String>,
    proxy_host: Option<String>,
    proxy_port: Option<i64>,
    proxy_user: Option<String>,
    proxy_pass: Option<String>,
    proxy_enabled: Option<i64>,
    notes: Option<String>,
    startup_url: Option<String>,
    startup_type: Option<String>,
    startup_urls: Option<String>,
    browser_version: Option<String>,
    fingerprint_flags: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateProfileInput {
    name: Option<String>,
    group_name: Option<String>,
    proxy_type: Option<String>,
    proxy_host: Option<String>,
    proxy_port: Option<i64>,
    proxy_user: Option<String>,
    proxy_pass: Option<String>,
    proxy_enabled: Option<i64>,
    notes: Option<String>,
    startup_url: Option<String>,
    startup_type: Option<String>,
    startup_urls: Option<String>,
    browser_version: Option<String>,
    fingerprint_flags: Option<String>,
}

#[derive(Debug, Serialize)]
struct GroupData {
    id: String,
    name: String,
    color: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProxyData {
    id: String,
    name: String,
    #[serde(rename = "type")]
    proxy_type: String,
    host: String,
    port: i64,
    username: Option<String>,
    password: Option<String>,
    country_code: Option<String>,
    country_name: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct ProxyInput {
    name: String,
    #[serde(rename = "type")]
    proxy_type: String,
    host: String,
    port: i64,
    username: Option<String>,
    password: Option<String>,
    country_code: Option<String>,
    country_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProxyUpdate {
    name: Option<String>,
    #[serde(rename = "type")]
    proxy_type: Option<String>,
    host: Option<String>,
    port: Option<i64>,
    username: Option<String>,
    password: Option<String>,
    country_code: Option<String>,
    country_name: Option<String>,
}

#[derive(Debug, Serialize)]
struct ProxyCheckResult {
    success: bool,
    ip: Option<String>,
    country: Option<String>,
    #[serde(rename = "countryCode")]
    country_code: Option<String>,
    #[serde(rename = "countryName")]
    country_name: Option<String>,
    latency: Option<u128>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct ExtensionData {
    id: String,
    name: String,
    ext_id: Option<String>,
    version: Option<String>,
    description: Option<String>,
    icon_path: Option<String>,
    source_url: Option<String>,
    store_version: Option<String>,
    ext_dir: String,
    profile_count: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct ChromeVersionInfo {
    version: String,
    channel: String,
    revision: String,
    installed: bool,
}

#[derive(Debug, Serialize)]
struct InstalledBrowserVersion {
    version: String,
    channel: String,
    #[serde(rename = "installedAt")]
    installed_at: String,
    #[serde(rename = "chromePath")]
    chrome_path: String,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
            let profiles_dir = app_dir.join("profiles");
            let browsers_dir = app_dir.join("browsers");
            let extensions_dir = app_dir.join("extensions");
            let db_path = app_dir.join("ezprofile.db");

            fs::create_dir_all(&profiles_dir).map_err(|e| e.to_string())?;
            fs::create_dir_all(&browsers_dir).map_err(|e| e.to_string())?;
            fs::create_dir_all(&extensions_dir).map_err(|e| e.to_string())?;

            // --- Migration from Electron (v1.x) ---
            // Electron stored data in ~/.config/ezprofile/ on Linux,
            // %APPDATA%/ezprofile on Windows, ~/Library/Application Support/ezprofile on macOS.
            // Tauri v2 uses app_data_dir() which is different.
            if !db_path.exists() {
                let legacy_dir = dirs::config_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("ezprofile");
                let legacy_db = legacy_dir.join("ezprofile.db");
                if legacy_db.exists() {
                    // 1. Copy database only (profiles stay at original Electron location)
                    let _ = fs::copy(&legacy_db, &db_path);

                    // 2. Migrate browsers versions.json pointing paths to legacy dir
                    let legacy_browsers = legacy_dir.join("browsers");
                    let legacy_versions_path = legacy_browsers.join("versions.json");
                    if legacy_versions_path.exists() {
                        // Copy versions.json, then add chromePath for each installed browser
                        if let Ok(data) = fs::read_to_string(&legacy_versions_path) {
                            if let Ok(mut meta) = serde_json::from_str::<Value>(&data) {
                                if let Some(versions) = meta["versions"].as_array_mut() {
                                    for entry in versions {
                                        let ver = entry["version"].as_str().unwrap_or("");
                                        let chrome_path = if is_cloak_browser_version(ver) {
                                            let p = legacy_browsers.join(ver).join("chrome");
                                            if p.exists() { Some(p) } else { None }
                                        } else {
                                            let p = browser_binary_path(&legacy_browsers, ver);
                                            if p.exists() { Some(p) } else { None }
                                        };
                                        if let Some(p) = chrome_path {
                                            entry["chromePath"] = json!(p.to_string_lossy().to_string());
                                        }
                                    }
                                }
                                let _ = fs::write(browsers_dir.join("versions.json"),
                                    serde_json::to_string_pretty(&meta).unwrap_or_default());
                            }
                        }
                    }

                    // Migrate Electron settings schema to Tauri format
                    // Electron: s3_access_key_id, s3_secret_access_key, … as individual keys
                    // Tauri:   single s3_config JSON
                    if let Ok(d) = Connection::open(&db_path) {
                        migrate_settings_schema(&d, &legacy_dir);
                    }

                    // NOTE: Profile AND extension directories stay at original Electron location.
                    // user_data_dir and ext_dir paths in DB already point to ~/.config/ezprofile/...
                    // which are all valid — no need to copy gigabytes of data.
                }
            }

            init_database(&db_path).map_err(|e| e.to_string())?;
            app.manage(AppState {
                db_path,
                profiles_dir,
                browsers_dir,
                extensions_dir,
                processes: ProcessRegistry::default(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            profile_get_all, profile_create, profile_update, profile_update_batch, profile_clone,
            profile_set_password, profile_remove_password, profile_verify_password, profile_delete,
            profile_delete_many, profile_export, profile_import, chrome_launch, chrome_stop,
            chrome_focus, proxy_check, proxy_get_all, proxy_create, proxy_update, proxy_delete,
            proxy_lookup_country, cookie_export, cookie_import, group_get_all, group_create,
            group_delete, settings_get_chrome_path, settings_set_chrome_path,
            settings_select_chrome_path, settings_get_profiles_dir, settings_set_profiles_dir,
            settings_select_profiles_dir, settings_get_check_update_on_startup,
            settings_set_check_update_on_startup, settings_get_include_prerelease_updates,
            settings_set_include_prerelease_updates, window_minimize, window_maximize,
            window_close, profile_backup, profile_restore, browser_get_available,
            browser_get_installed, browser_download, browser_delete, browser_add_custom,
            browser_get_default, browser_set_default, app_get_version, app_get_platform,
            app_open_external, app_quit,
            sync_get_settings, sync_save_google_client_id, sync_save_google_client_secret,
            sync_set_provider, sync_save_s3_config, sync_test_s3, sync_start_google_auth,
            sync_get_google_auth_status, sync_revoke_google, sync_set_passphrase,
            sync_change_passphrase, sync_clear_passphrase, sync_has_passphrase,
            sync_upload_profile, sync_download_profile, sync_list_backups, sync_upload_all,
            sync_backup_all_list_to_cloud, sync_restore_all_list_from_cloud, sync_restore_all,
            sync_set_auto_sync_on_close, sync_set_max_backups, sync_get_sync_log,
            sync_delete_backup, settings_export_backup, settings_import_backup,
            extension_get_all, extension_upload, extension_download_from_store, extension_update,
            extension_delete, extension_check_update, extension_perform_update,
            extension_get_profile_extensions, extension_set_profile_extensions,
            extension_add_to_profiles, extension_get_icon
        ])
        .run(tauri::generate_context!())
        .expect("failed to run EzProfile");
}

fn conn(state: &AppState) -> ApiResult<Connection> {
    Connection::open(&state.db_path).map_err(|e| e.to_string())
}

fn init_database(db_path: &Path) -> ApiResult<()> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let db = Connection::open(db_path).map_err(|e| e.to_string())?;
    db.pragma_update(None, "journal_mode", "WAL").map_err(|e| e.to_string())?;
    db.pragma_update(None, "foreign_keys", "ON").map_err(|e| e.to_string())?;
    db.pragma_update(None, "busy_timeout", 5000).map_err(|e| e.to_string())?;
    db.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          group_name TEXT,
          proxy_type TEXT,
          proxy_host TEXT,
          proxy_port INTEGER,
          proxy_user TEXT,
          proxy_pass TEXT,
          proxy_enabled INTEGER DEFAULT 0,
          notes TEXT,
          browser_version TEXT DEFAULT 'latest',
          user_data_dir TEXT NOT NULL,
          startup_url TEXT,
          startup_type TEXT DEFAULT 'continue',
          startup_urls TEXT,
          fingerprint_flags TEXT,
          password_hash TEXT,
          status TEXT DEFAULT 'ready',
          last_run_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT DEFAULT '#4a9eff');
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS proxies (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'http',
          host TEXT NOT NULL, port INTEGER NOT NULL, username TEXT, password TEXT,
          country_code TEXT, country_name TEXT, created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS sync_log (
          id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, provider TEXT NOT NULL,
          direction TEXT NOT NULL, status TEXT NOT NULL, error_message TEXT,
          remote_file TEXT, size_bytes INTEGER, created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS extensions (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, ext_id TEXT, version TEXT,
          description TEXT, icon_path TEXT, source_url TEXT, store_version TEXT,
          ext_dir TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS profile_extensions (
          profile_id TEXT NOT NULL, extension_id TEXT NOT NULL,
          PRIMARY KEY (profile_id, extension_id),
          FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
          FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE
        );
        "#,
    )
    .map_err(|e| e.to_string())?;
    for (table, col, ddl) in [
        ("profiles", "startup_type", "ALTER TABLE profiles ADD COLUMN startup_type TEXT DEFAULT 'continue'"),
        ("profiles", "startup_urls", "ALTER TABLE profiles ADD COLUMN startup_urls TEXT"),
        ("profiles", "password_hash", "ALTER TABLE profiles ADD COLUMN password_hash TEXT"),
        ("profiles", "proxy_enabled", "ALTER TABLE profiles ADD COLUMN proxy_enabled INTEGER DEFAULT 0"),
        ("profiles", "fingerprint_flags", "ALTER TABLE profiles ADD COLUMN fingerprint_flags TEXT"),
        ("proxies", "country_code", "ALTER TABLE proxies ADD COLUMN country_code TEXT"),
        ("proxies", "country_name", "ALTER TABLE proxies ADD COLUMN country_name TEXT"),
    ] {
        add_column_if_missing(&db, table, col, ddl)?;
    }
    Ok(())
}

fn add_column_if_missing(db: &Connection, table: &str, col: &str, ddl: &str) -> ApiResult<()> {
    let mut stmt = db.prepare(&format!("PRAGMA table_info('{table}')")).map_err(|e| e.to_string())?;
    let cols: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    if !cols.iter().any(|c| c == col) {
        db.execute_batch(ddl).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn get_setting(db: &Connection, key: &str) -> ApiResult<Option<String>> {
    db.query_row("SELECT value FROM settings WHERE key = ?", [key], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())
}

pub fn set_setting(db: &Connection, key: &str, value: &str) -> ApiResult<()> {
    db.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn row_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<Profile> {
    let password_hash: Option<String> = row.get("password_hash")?;
    Ok(Profile {
        id: row.get("id")?,
        name: row.get("name")?,
        group_name: row.get("group_name")?,
        proxy_type: row.get("proxy_type")?,
        proxy_host: row.get("proxy_host")?,
        proxy_port: row.get("proxy_port")?,
        proxy_user: row.get("proxy_user")?,
        proxy_pass: row.get("proxy_pass")?,
        proxy_enabled: row.get("proxy_enabled")?,
        notes: row.get("notes")?,
        browser_version: row.get("browser_version")?,
        user_data_dir: row.get("user_data_dir")?,
        startup_url: row.get("startup_url")?,
        startup_type: row.get("startup_type")?,
        startup_urls: row.get("startup_urls")?,
        fingerprint_flags: row.get("fingerprint_flags")?,
        status: row.get("status")?,
        last_run_at: row.get("last_run_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        has_password: password_hash.is_some(),
        password_hash,
    })
}

fn get_profile(db: &Connection, id: &str) -> ApiResult<Profile> {
    db.query_row("SELECT * FROM profiles WHERE id = ?", [id], row_profile)
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Profile not found".to_string())
}

#[tauri::command]
fn profile_get_all(state: State<AppState>) -> ApiResult<Vec<Profile>> {
    let db = conn(&state)?;
    let mut stmt = db.prepare("SELECT * FROM profiles ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_profile).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
fn profile_create(state: State<AppState>, data: CreateProfileInput) -> ApiResult<Profile> {
    let db = conn(&state)?;
    let id = data.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let user_data_dir = state.profiles_dir.join(&id);
    fs::create_dir_all(&user_data_dir).map_err(|e| e.to_string())?;
    let mut fingerprint_flags = data.fingerprint_flags;
    if data.browser_version.as_deref().unwrap_or("").starts_with("CloakBrowser") {
        let mut flags: Value = fingerprint_flags.as_deref().and_then(|s| serde_json::from_str(s).ok()).unwrap_or_else(|| json!({}));
        if flags.get("seed").is_none() {
            flags["seed"] = json!(rand::thread_rng().gen_range(100000..999999999).to_string());
            fingerprint_flags = Some(flags.to_string());
        }
    }
    db.execute(
        "INSERT INTO profiles (id,name,group_name,proxy_type,proxy_host,proxy_port,proxy_user,proxy_pass,proxy_enabled,notes,user_data_dir,startup_url,startup_type,startup_urls,fingerprint_flags,browser_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        params![id, data.name, data.group_name, data.proxy_type, data.proxy_host, data.proxy_port, data.proxy_user, data.proxy_pass, data.proxy_enabled.unwrap_or(0), data.notes, user_data_dir.to_string_lossy(), data.startup_url, data.startup_type.unwrap_or_else(|| "continue".into()), data.startup_urls, fingerprint_flags, data.browser_version],
    ).map_err(|e| e.to_string())?;
    get_profile(&db, &id)
}

#[tauri::command]
fn profile_update(state: State<AppState>, id: String, data: UpdateProfileInput) -> ApiResult<Profile> {
    let db = conn(&state)?;
    let current = get_profile(&db, &id)?;
    db.execute(
        "UPDATE profiles SET name=?, group_name=?, proxy_type=?, proxy_host=?, proxy_port=?, proxy_user=?, proxy_pass=?, proxy_enabled=?, notes=?, startup_url=?, startup_type=?, startup_urls=?, browser_version=?, fingerprint_flags=?, updated_at=datetime('now') WHERE id=?",
        params![
            data.name.unwrap_or(current.name), data.group_name.or(current.group_name),
            data.proxy_type.or(current.proxy_type), data.proxy_host.or(current.proxy_host),
            data.proxy_port.or(current.proxy_port), data.proxy_user.or(current.proxy_user),
            data.proxy_pass.or(current.proxy_pass), data.proxy_enabled.unwrap_or(current.proxy_enabled),
            data.notes.or(current.notes), data.startup_url.or(current.startup_url),
            data.startup_type.unwrap_or(current.startup_type), data.startup_urls.or(current.startup_urls),
            data.browser_version.or(current.browser_version), data.fingerprint_flags.or(current.fingerprint_flags), id
        ],
    ).map_err(|e| e.to_string())?;
    get_profile(&db, &id)
}

#[tauri::command]
fn profile_update_batch(state: State<AppState>, ids: Vec<String>, data: UpdateProfileInput) -> ApiResult<()> {
    for id in ids {
        profile_update(state.clone(), id, UpdateProfileInput { ..data.clone_for_batch() })?;
    }
    Ok(())
}

impl UpdateProfileInput {
    fn clone_for_batch(&self) -> Self {
        Self {
            name: self.name.clone(), group_name: self.group_name.clone(), proxy_type: self.proxy_type.clone(),
            proxy_host: self.proxy_host.clone(), proxy_port: self.proxy_port, proxy_user: self.proxy_user.clone(),
            proxy_pass: self.proxy_pass.clone(), proxy_enabled: self.proxy_enabled, notes: self.notes.clone(),
            startup_url: self.startup_url.clone(), startup_type: self.startup_type.clone(),
            startup_urls: self.startup_urls.clone(), browser_version: self.browser_version.clone(),
            fingerprint_flags: self.fingerprint_flags.clone(),
        }
    }
}

#[tauri::command]
fn profile_clone(state: State<AppState>, id: String) -> ApiResult<Profile> {
    let db = conn(&state)?;
    let source = get_profile(&db, &id)?;
    let new_id = Uuid::new_v4().to_string();
    let new_dir = state.profiles_dir.join(&new_id);
    copy_dir_filtered(Path::new(&source.user_data_dir), &new_dir, &[])?;
    for lock in ["SingletonLock", "SingletonSocket", "SingletonCookie", "Default/SingletonLock"] {
        let _ = fs::remove_file(new_dir.join(lock));
    }
    let mut flags = source.fingerprint_flags.clone();
    if source.browser_version.as_deref().unwrap_or("").starts_with("CloakBrowser") {
        let mut parsed: Value = flags.as_deref().and_then(|s| serde_json::from_str(s).ok()).unwrap_or_else(|| json!({}));
        parsed["seed"] = json!(rand::thread_rng().gen_range(100000..999999999).to_string());
        flags = Some(parsed.to_string());
    }
    db.execute(
        "INSERT INTO profiles (id,name,group_name,proxy_type,proxy_host,proxy_port,proxy_user,proxy_pass,proxy_enabled,notes,browser_version,user_data_dir,startup_url,startup_type,startup_urls,fingerprint_flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        params![new_id, format!("{} (Copy)", source.name), source.group_name, source.proxy_type, source.proxy_host, source.proxy_port, source.proxy_user, source.proxy_pass, source.proxy_enabled, source.notes, source.browser_version, new_dir.to_string_lossy(), source.startup_url, source.startup_type, source.startup_urls, flags],
    ).map_err(|e| e.to_string())?;
    get_profile(&db, &new_id)
}

#[tauri::command]
fn profile_set_password(state: State<AppState>, id: String, password: String) -> ApiResult<()> {
    let db = conn(&state)?;
    let password_hash = hash(password, DEFAULT_COST).map_err(|e| e.to_string())?;
    db.execute("UPDATE profiles SET password_hash=?, updated_at=datetime('now') WHERE id=?", params![password_hash, id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn profile_remove_password(state: State<AppState>, id: String, password: String) -> ApiResult<()> {
    if !profile_verify_password(state.clone(), id.clone(), password)? {
        return Err("Wrong password".into());
    }
    let db = conn(&state)?;
    db.execute("UPDATE profiles SET password_hash=NULL, updated_at=datetime('now') WHERE id=?", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn profile_verify_password(state: State<AppState>, id: String, password: String) -> ApiResult<bool> {
    let db = conn(&state)?;
    let p = get_profile(&db, &id)?;
    Ok(match p.password_hash { Some(h) => verify(password, &h).unwrap_or(false), None => true })
}

#[tauri::command]
fn profile_delete(state: State<AppState>, id: String) -> ApiResult<()> {
    let db = conn(&state)?;
    if let Ok(p) = get_profile(&db, &id) {
        let _ = fs::remove_dir_all(p.user_data_dir);
    }
    db.execute("DELETE FROM profiles WHERE id=?", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn profile_delete_many(state: State<AppState>, ids: Vec<String>) -> ApiResult<()> {
    for id in ids { profile_delete(state.clone(), id)?; }
    Ok(())
}

#[tauri::command]
fn chrome_launch(app: AppHandle, state: State<AppState>, id: String, bounds: Option<Value>) -> ApiResult<()> {
    let db = conn(&state)?;
    let profile = get_profile(&db, &id)?;
    if is_profile_running(&state, &id) {
        return Err("Profile is already running".into());
    }
    fs::create_dir_all(&profile.user_data_dir).map_err(|e| e.to_string())?;
    write_startup_preferences(&profile)?;
    let chrome = resolve_chrome_path(&state, &db, profile.browser_version.as_deref())?;
    let debug_port = find_free_port()?;
    let mut args = vec![
        format!("--user-data-dir={}", profile.user_data_dir),
        "--no-first-run".into(),
        "--no-default-browser-check".into(),
        "--password-store=basic".into(),
        "--use-mock-keychain".into(),
        format!("--remote-debugging-port={}", debug_port),
    ];

    if !is_cloak_browser_version(profile.browser_version.as_deref().unwrap_or("")) {
        // Standard Chrome flags (not compatible with CloakBrowser)
        args.push("--disable-background-networking".into());
        args.push("--disable-sync".into());
        args.push("--disable-translate".into());
        args.push("--metrics-recording-only".into());
        args.push("--no-report-upload".into());
        args.push("--disable-features=MediaRouter".into());
        args.push("--disable-component-update".into());
    }

    // Downloaded/non-system browsers need --no-sandbox on Linux + suppress warning banner
    let ver = profile.browser_version.as_deref().unwrap_or("");
    if ver != "system" && ver != "latest" && !ver.is_empty() {
        args.push("--no-sandbox".into());
        args.push("--disable-infobars".into());
        args.push("--test-type".into());
    }
    if let Some(b) = bounds {
        if let (Some(x), Some(y), Some(w), Some(h)) = (b.get("x"), b.get("y"), b.get("width"), b.get("height")) {
            args.push(format!("--window-position={},{}", x, y));
            args.push(format!("--window-size={},{}", w, h));
        }
    }
    // CloakBrowser: fingerprint flags (matching Electron exactly)
    if is_cloak_browser_version(profile.browser_version.as_deref().unwrap_or("")) {
        let mut fp: Value = profile.fingerprint_flags.as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or(json!({}));
        let mut seed = fp.get("seed").and_then(|v| v.as_str()).unwrap_or("").to_string();
        // Auto-generate seed if missing (matching Electron behavior on launch)
        if seed.is_empty() {
            seed = rand::thread_rng().gen_range(100000..999999999).to_string();
            fp["seed"] = json!(seed);
            let db = conn(&state).ok();
            if let Some(db) = db {
                db.execute("UPDATE profiles SET fingerprint_flags=?1 WHERE id=?2",
                    rusqlite::params![fp.to_string(), id]).ok();
            }
        }
        if !seed.is_empty() {
            args.push(format!("--fingerprint={}", seed));
            // Auto-resolve hardware from seed (same as Electron's resolveHardwareFromSeed)
            let has_override = fp.get("platform").or(fp.get("gpuVendor")).or(fp.get("gpuRenderer"))
                .or(fp.get("screenWidth")).or(fp.get("screenHeight"))
                .or(fp.get("hardwareConcurrency")).or(fp.get("deviceMemory")).is_some();
            if !has_override {
                if let Some(hw) = resolve_hardware_from_seed(&seed, "") {
                    args.push(format!("--fingerprint-platform={}", hw.platform));
                    args.push(format!("--fingerprint-gpu-vendor={}", hw.gpu_vendor));
                    args.push(format!("--fingerprint-gpu-renderer={}", hw.gpu_renderer));
                    args.push(format!("--fingerprint-hardware-concurrency={}", hw.hardware_concurrency));
                    args.push(format!("--fingerprint-device-memory={}", hw.device_memory));
                    args.push(format!("--fingerprint-screen-width={}", hw.screen_width));
                    args.push(format!("--fingerprint-screen-height={}", hw.screen_height));
                }
            }
            // Custom fingerprint overrides
            for (flag, arg) in [
                ("platform", "--fingerprint-platform="),
                ("gpuVendor", "--fingerprint-gpu-vendor="),
                ("gpuRenderer", "--fingerprint-gpu-renderer="),
                ("hardwareConcurrency", "--fingerprint-hardware-concurrency="),
                ("deviceMemory", "--fingerprint-device-memory="),
                ("screenWidth", "--fingerprint-screen-width="),
                ("screenHeight", "--fingerprint-screen-height="),
                ("timezone", "--fingerprint-timezone="),
                ("locale", "--fingerprint-locale="),
                ("brand", "--fingerprint-brand="),
                ("storageQuota", "--fingerprint-storage-quota="),
            ] {
                if let Some(v) = fp.get(flag).and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                    args.push(format!("{}{}", arg, v));
                }
            }
            // WebRTC IP
            if let Some(ip) = fp.get("webrtcIp").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                args.push(format!("--fingerprint-webrtc-ip={}", ip));
            } else if profile.proxy_enabled == 1 && profile.proxy_host.is_some() {
                args.push("--fingerprint-webrtc-ip=auto".into());
            }
        }
    }

    // CloakBrowser: load extensions from profile_extension associations
    if is_cloak_browser_version(profile.browser_version.as_deref().unwrap_or("")) {
        if let Ok(db) = conn(&state) {
            let stmt = db.prepare(
                "SELECT e.ext_dir FROM extensions e JOIN profile_extensions pe ON pe.extension_id=e.id WHERE pe.profile_id=?"
            ).ok();
            if let Some(mut stmt) = stmt {
                let paths: Vec<String> = stmt.query_map([&id], |r| r.get::<_, String>(0))
                    .into_iter().flatten()
                    .filter_map(|r| r.ok())
                    .filter(|p| std::path::Path::new(p).exists())
                    .collect();
                if !paths.is_empty() {
                    args.push(format!("--load-extension={}", paths.join(",")));
                    args.push("--enable-extensions".into());
                }
            }
        }
    }

    if profile.proxy_enabled == 1 {
        if let (Some(host), Some(port)) = (&profile.proxy_host, profile.proxy_port) {
            let scheme = profile.proxy_type.clone().unwrap_or_else(|| "http".into());
            args.push(format!("--proxy-server={}://{}:{}", scheme, host, port));
        }
    }
    if let Some(urls) = profile.startup_urls.as_ref().filter(|_| profile.startup_type == "specific_pages") {
        args.extend(urls.lines().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()));
    } else if let Some(url) = profile.startup_url.as_ref().filter(|s| !s.is_empty()) {
        args.push(url.clone());
    }
    let child = Command::new(chrome).args(args).stdout(Stdio::null()).stderr(Stdio::null()).spawn().map_err(|e| e.to_string())?;
    let child_arc = Arc::new(Mutex::new(child));
    state.processes.children.lock().unwrap().insert(id.clone(), RunningInstance { child: Arc::clone(&child_arc), debug_port });
    db.execute("UPDATE profiles SET status='running', last_run_at=datetime('now'), updated_at=datetime('now') WHERE id=?", [&id]).map_err(|e| e.to_string())?;
    app.emit("profile:statusChanged", (&id, "running")).ok();

    // Background monitor: detect when user closes Chrome and update status
    let monitor_child = Arc::clone(&child_arc);
    let monitor_app = app.clone();
    let monitor_id = id.clone();
    let monitor_db_path = state.db_path.clone();
    std::thread::spawn(move || {
        // Poll try_wait() every 500ms instead of blocking on wait()
        // (avoids deadlock with chrome_stop which also locks the mutex)
        loop {
            let exited = monitor_child.lock().ok()
                .and_then(|mut c| c.try_wait().ok())
                .and_then(|r| r);
            match exited {
                Some(status) => {
                    eprintln!("[monitor] Profile {} exited with status {:?}", monitor_id, status);
                    if let Ok(db) = Connection::open(&monitor_db_path) {
                        db.execute("UPDATE profiles SET status='ready', updated_at=datetime('now') WHERE id=?", rusqlite::params![&monitor_id]).ok();
                    }
                    monitor_app.emit("profile:statusChanged", (&monitor_id, "ready")).ok();
                    break;
                }
                None => {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn chrome_stop(app: AppHandle, state: State<AppState>, id: String) -> ApiResult<()> {
    eprintln!("[chrome_stop] Called for profile: {}", id);

    // Check if profile is running
    let instance = {
        let mut registry = state.processes.children.lock().unwrap();
        registry.remove(&id)
    };

    match instance {
        Some(instance) => {
            eprintln!("[chrome_stop] Found running instance, stopping...");
            match instance.child.lock() {
                Ok(mut child) => {
                    let pid = child.id();
                    eprintln!("[chrome_stop] PID: {}", pid);

                    // Step 1: Send SIGINT for graceful Chrome shutdown
                    #[cfg(not(target_os = "windows"))]
                    {
                        eprintln!("[chrome_stop] Sending SIGINT to PID {}", pid);
                        let result = Command::new("kill").arg("-s").arg("SIGINT").arg(pid.to_string()).status();
                        eprintln!("[chrome_stop] SIGINT result: {:?}", result);
                    }
                    #[cfg(target_os = "windows")]
                    {
                        let _ = child.kill();
                    }

                    // Step 2: Wait up to 5 seconds for graceful exit
                    let start = Instant::now();
                    let mut exited = false;
                    while start.elapsed().as_millis() < 5000 {
                        match child.try_wait() {
                            Ok(Some(status)) => {
                                eprintln!("[chrome_stop] Process exited with status: {:?} after {}ms", status, start.elapsed().as_millis());
                                exited = true;
                                break;
                            }
                            Ok(None) => {
                                std::thread::sleep(std::time::Duration::from_millis(100));
                            }
                            Err(e) => {
                                eprintln!("[chrome_stop] try_wait error: {}", e);
                                break;
                            }
                        }
                    }

                    // Step 3: Force kill if still running
                    if !exited {
                        eprintln!("[chrome_stop] Process did not exit gracefully, force killing...");
                        let _ = child.kill();
                        let _ = child.wait();
                        eprintln!("[chrome_stop] Force kill done");
                    }
                }
                Err(_) => {
                    eprintln!("[chrome_stop] Failed to lock child mutex (poisoned?)");
                }
            }
        }
        None => {
            eprintln!("[chrome_stop] Profile not found in process registry (already stopped or never launched)");
        }
    }

    // Update status regardless
    let db = conn(&state)?;
    db.execute("UPDATE profiles SET status='ready', updated_at=datetime('now') WHERE id=?", [&id]).map_err(|e| e.to_string())?;
    app.emit("profile:statusChanged", (&id, "ready")).ok();
    eprintln!("[chrome_stop] Done, status updated to ready");
    Ok(())
}

#[tauri::command]
fn chrome_focus(state: State<AppState>, id: String) -> ApiResult<()> {
    if is_profile_running(&state, &id) { Ok(()) } else { Err("Profile is not running in this session".into()) }
}

fn is_profile_running(state: &AppState, id: &str) -> bool {
    state.processes.children.lock().unwrap().get(id)
        .and_then(|i| i.child.lock().ok())
        .and_then(|mut c| c.try_wait().ok())
        .map(|r| r.is_none())
        .unwrap_or(false)
}

fn resolve_chrome_path(state: &AppState, db: &Connection, version: Option<&str>) -> ApiResult<PathBuf> {
    if let Some(v) = version.filter(|v| !v.is_empty() && *v != "system" && *v != "latest") {
        // Check versions.json for stored path first (CloakBrowser, custom, etc.)
        let meta_path = state.browsers_dir.join("versions.json");
        if let Ok(meta) = fs::read_to_string(&meta_path) {
            if let Ok(json) = serde_json::from_str::<Value>(&meta) {
                if let Some(versions) = json["versions"].as_array() {
                    if let Some(entry) = versions.iter().find(|e| e["version"].as_str() == Some(v)) {
                        if let Some(stored) = entry["chromePath"].as_str() {
                            let p = PathBuf::from(stored);
                            if p.exists() { return Ok(p); }
                        }
                    }
                }
            }
        }
        // Fall back to hardcoded Chrome for Testing path
        let custom = browser_binary_path(&state.browsers_dir, v);
        if custom.exists() { return Ok(custom); }
        // For CloakBrowser, try finding the binary
        if is_cloak_browser_version(v) {
            let version_dir = state.browsers_dir.join(v);
            if let Some(p) = find_cloak_binary(&version_dir) {
                return Ok(p);
            }
        }
    }
    if let Some(saved) = get_setting(db, "chrome_path")? {
        if Path::new(&saved).exists() { return Ok(PathBuf::from(saved)); }
    }
    detect_chrome_path()
}

fn detect_chrome_path() -> ApiResult<PathBuf> {
    let mut candidates = Vec::new();
    #[cfg(target_os = "windows")]
    {
        candidates.extend(["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"].map(PathBuf::from));
    }
    #[cfg(target_os = "macos")]
    {
        candidates.extend(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"].map(PathBuf::from));
    }
    #[cfg(target_os = "linux")]
    {
        candidates.extend(["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser", "/usr/bin/chromium", "/snap/bin/chromium"].map(PathBuf::from));
    }
    candidates.into_iter().find(|p| p.exists()).ok_or_else(|| "Chrome/Chromium not found. Set the path in Settings.".into())
}

fn write_startup_preferences(profile: &Profile) -> ApiResult<()> {
    let default_dir = Path::new(&profile.user_data_dir).join("Default");
    fs::create_dir_all(&default_dir).map_err(|e| e.to_string())?;
    let prefs_path = default_dir.join("Preferences");
    let mut prefs: Value = fs::read_to_string(&prefs_path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_else(|| json!({}));

    // Match Electron: only set restore_on_startup when explicitly configured
    match profile.startup_type.as_str() {
        "new_tab" => {
            prefs["session"]["restore_on_startup"] = json!(5);
        }
        "specific_pages" => {
            prefs["session"]["restore_on_startup"] = json!(4);
            let urls: Vec<String> = profile.startup_urls.clone().unwrap_or_default()
                .lines().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            prefs["session"]["startup_urls"] = json!(urls);
        }
        _ => {
            // "continue" or default: remove the key so Chrome uses its default (new tab)
            // This prevents restoring extension tabs from previous sessions
            if let Some(session) = prefs.get_mut("session") {
                session.as_object_mut().map(|s| s.remove("restore_on_startup"));
            }
        }
    }

    prefs["profile"]["exit_type"] = json!("Normal");
    prefs["profile"]["exited_cleanly"] = json!(true);
    fs::write(prefs_path, serde_json::to_string_pretty(&prefs).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
async fn proxy_check(proxy_type: String, host: String, port: i64, _user: Option<String>, _pass: Option<String>) -> ApiResult<ProxyCheckResult> {
    let started = Instant::now();
    let proxy_url = format!("{proxy_type}://{host}:{port}");
    let proxy = reqwest::Proxy::all(proxy_url).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder().proxy(proxy).timeout(std::time::Duration::from_secs(12)).build().map_err(|e| e.to_string())?;
    match client.get("https://api.ipify.org?format=json").send().await {
        Ok(res) => {
            let v: Value = res.json().await.unwrap_or_else(|_| json!({}));
            Ok(ProxyCheckResult { success: true, ip: v.get("ip").and_then(Value::as_str).map(str::to_string), country: None, country_code: None, country_name: None, latency: Some(started.elapsed().as_millis()), error: None })
        }
        Err(e) => Ok(ProxyCheckResult { success: false, ip: None, country: None, country_code: None, country_name: None, latency: None, error: Some(e.to_string()) }),
    }
}

#[tauri::command]
fn proxy_get_all(app: AppHandle, state: State<AppState>) -> ApiResult<Vec<ProxyData>> {
    let db = conn(&state)?;
    let mut stmt = db.prepare("SELECT id, name, type, host, port, username, password, country_code, country_name, COALESCE(created_at,'') as created_at, COALESCE(updated_at,'') as updated_at FROM proxies ORDER BY created_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(ProxyData { id: r.get("id")?, name: r.get("name")?, proxy_type: r.get("type")?, host: r.get("host")?, port: r.get("port")?, username: r.get("username")?, password: r.get("password")?, country_code: r.get("country_code")?, country_name: r.get("country_name")?, created_at: r.get("created_at")?, updated_at: r.get("updated_at")? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Background country lookup for proxies missing country codes (matches Electron)
    let missing: Vec<_> = rows.iter()
        .filter(|p| p.country_code.is_none() && !p.host.is_empty())
        .map(|p| (p.id.clone(), p.host.clone()))
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        let db_path = state.db_path.clone();
        let app2 = app.clone();
        std::thread::spawn(move || {
            let db = Connection::open(&db_path).ok();
            for (id, host) in missing {
                let output = std::process::Command::new("curl")
                    .args(["-s", "--connect-timeout", "5", "--max-time", "8",
                        &format!("http://ip-api.com/json/{}?fields=countryCode,country", host)])
                    .output().ok();
                if let (Some(ref db), Some(out)) = (&db, output) {
                    if out.status.success() {
                        if let Ok(result) = serde_json::from_str::<Value>(&String::from_utf8_lossy(&out.stdout)) {
                            let cc = result["countryCode"].as_str().map(String::from);
                            let cn = result["country"].as_str().map(String::from);
                            if cc.is_some() || cn.is_some() {
                                db.execute("UPDATE proxies SET country_code=?1, country_name=?2 WHERE id=?3",
                                    rusqlite::params![cc, cn, id]).ok();
                            }
                        }
                    }
                }
            }
            app2.emit("proxy:updated", ()).ok();
        });
    }

    eprintln!("[Proxy] get_all: {} proxies", rows.len());
    Ok(rows)
}

#[tauri::command]
fn proxy_create(state: State<AppState>, data: ProxyInput) -> ApiResult<ProxyData> {
    let db = conn(&state)?;
    let id = Uuid::new_v4().to_string();
    db.execute("INSERT INTO proxies (id,name,type,host,port,username,password,country_code,country_name) VALUES (?,?,?,?,?,?,?,?,?)", params![id, data.name, data.proxy_type, data.host, data.port, data.username, data.password, data.country_code, data.country_name]).map_err(|e| e.to_string())?;
    proxy_get_by_id(&db, &id)
}

fn proxy_get_by_id(db: &Connection, id: &str) -> ApiResult<ProxyData> {
    db.query_row("SELECT * FROM proxies WHERE id=?", [id], |r| Ok(ProxyData { id: r.get("id")?, name: r.get("name")?, proxy_type: r.get("type")?, host: r.get("host")?, port: r.get("port")?, username: r.get("username")?, password: r.get("password")?, country_code: r.get("country_code")?, country_name: r.get("country_name")?, created_at: r.get("created_at")?, updated_at: r.get("updated_at")? })).map_err(|e| e.to_string())
}

#[tauri::command]
fn proxy_update(state: State<AppState>, id: String, data: ProxyUpdate) -> ApiResult<ProxyData> {
    let db = conn(&state)?;
    let cur = proxy_get_by_id(&db, &id)?;
    db.execute("UPDATE proxies SET name=?, type=?, host=?, port=?, username=?, password=?, country_code=?, country_name=?, updated_at=datetime('now') WHERE id=?", params![data.name.unwrap_or(cur.name), data.proxy_type.unwrap_or(cur.proxy_type), data.host.unwrap_or(cur.host), data.port.unwrap_or(cur.port), data.username.or(cur.username), data.password.or(cur.password), data.country_code.or(cur.country_code), data.country_name.or(cur.country_name), id]).map_err(|e| e.to_string())?;
    proxy_get_by_id(&db, &id)
}

#[tauri::command]
fn proxy_delete(state: State<AppState>, id: String) -> ApiResult<()> {
    conn(&state)?.execute("DELETE FROM proxies WHERE id=?", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn proxy_lookup_country(ip: String) -> ApiResult<Option<Value>> {
    let url = format!("http://ip-api.com/json/{ip}?fields=status,country,countryCode");
    let v: Value = reqwest::get(url).await.map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    if v.get("status").and_then(Value::as_str) == Some("success") {
        Ok(Some(json!({ "countryCode": v["countryCode"], "countryName": v["country"] })))
    } else { Ok(None) }
}

#[tauri::command]
fn group_get_all(state: State<AppState>) -> ApiResult<Vec<GroupData>> {
    let db = conn(&state)?;
    let mut stmt = db.prepare("SELECT id,name,color FROM groups ORDER BY name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(GroupData { id: r.get(0)?, name: r.get(1)?, color: r.get(2)? })).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
fn group_create(state: State<AppState>, name: String, color: String) -> ApiResult<()> {
    conn(&state)?.execute("INSERT INTO groups (id,name,color) VALUES (?,?,?)", params![Uuid::new_v4().to_string(), name, color]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn group_delete(state: State<AppState>, id: String) -> ApiResult<()> {
    conn(&state)?.execute("DELETE FROM groups WHERE id=?", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn profile_backup(app: AppHandle, state: State<AppState>, profile_id: String) -> ApiResult<Value> {
    let db = conn(&state)?;
    let p = get_profile(&db, &profile_id)?;
    let out = state.profiles_dir.join(format!("ezprofile_backup_{}_{}.zip", sanitize(&p.name), Utc::now().timestamp()));
    zip_dir(Path::new(&p.user_data_dir), &out)?;
    app.emit("profile:backupProgress", (&profile_id, "Backup complete")).ok();
    Ok(json!({ "success": true, "filePath": out }))
}

#[tauri::command]
async fn profile_restore(app: AppHandle, state: State<'_, AppState>, profile_id: String) -> ApiResult<Value> {
    let file = app.dialog().file()
        .add_filter("Profile Backup", &["zip", "ezprofile"])
        .set_title("Select profile backup to restore")
        .blocking_pick_file();

    match file {
        Some(fp) => {
            let zip_path = fp.into_path().map_err(|e| e.to_string())?;
            app.emit("profile:backupProgress", (&profile_id, "Restoring backup...")).ok();
            let db = conn(&state)?;
            let profile = get_profile(&db, &profile_id)?;
            // Remove old profile data and extract backup zip
            let _ = fs::remove_dir_all(&profile.user_data_dir);
            unzip_dir(&zip_path, Path::new(&profile.user_data_dir))?;
            db.execute("UPDATE profiles SET updated_at=datetime('now') WHERE id=?",
                [&profile_id]).map_err(|e| e.to_string())?;
            app.emit("profile:backupProgress", (&profile_id, "Restore complete")).ok();
            Ok(json!({ "success": true, "filePath": zip_path.to_string_lossy() }))
        }
        None => Ok(json!({ "success": false, "canceled": true })),
    }
}

#[tauri::command]
async fn cookie_export(app: AppHandle, state: State<'_, AppState>, profile_id: String) -> ApiResult<Value> {
    let debug_port = get_running_debug_port(&state, &profile_id)?;
    let ws_url = get_cdp_websocket_url(debug_port).await?;
    let (ws_stream, _) = connect_async(&ws_url).await
        .map_err(|e| format!("CDP WebSocket connection failed: {}", e))?;
    let (mut write, mut read) = ws_stream.split();
    let result = cdp_send(&mut write, &mut read, "Network.getCookies", json!({})).await?;
    let cookies = result["cookies"].as_array().ok_or("No cookies array in CDP response")?;
    // Prompt user to save cookies JSON
    let file = app.dialog().file()
        .add_filter("Cookies JSON", &["json"])
        .set_title("Export Cookies")
        .set_file_name(format!("cookies-{}.json", profile_id))
        .blocking_save_file();
    match file {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            let data = serde_json::to_string_pretty(&json!({ "cookies": cookies })).map_err(|e| e.to_string())?;
            fs::write(&path, &data).map_err(|e| e.to_string())?;
            Ok(json!({ "success": true, "filePath": path.to_string_lossy(), "count": cookies.len() }))
        }
        None => Ok(json!({ "success": false, "canceled": true })),
    }
}

#[tauri::command]
async fn cookie_import(app: AppHandle, state: State<'_, AppState>, profile_id: String) -> ApiResult<Value> {
    let debug_port = get_running_debug_port(&state, &profile_id)?;
    let file = app.dialog().file()
        .add_filter("Cookies JSON", &["json"])
        .set_title("Import Cookies")
        .blocking_pick_file();
    match file {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let json: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
            let cookies = json["cookies"].as_array().ok_or("Expected JSON with 'cookies' array")?.clone();
            let ws_url = get_cdp_websocket_url(debug_port).await?;
            let (ws_stream, _) = connect_async(&ws_url).await
                .map_err(|e| format!("CDP WebSocket connection failed: {}", e))?;
            let (mut write, mut read) = ws_stream.split();
            // Use Network.setCookies to import all at once
            cdp_send(&mut write, &mut read, "Network.setCookies", json!({ "cookies": cookies })).await?;
            Ok(json!({ "success": true, "count": cookies.len() }))
        }
        None => Ok(json!({ "success": false, "canceled": true })),
    }
}

#[tauri::command]
async fn profile_export(app: AppHandle, state: State<'_, AppState>, ids: Option<Vec<String>>) -> ApiResult<Value> {
    eprintln!("[Export] profile_export called, ids={:?}", ids);
    let profiles = match ids {
        Some(ref ids) if !ids.is_empty() => ids.iter().filter_map(|id| get_profile(&conn(&state).ok()?, id).ok()).collect::<Vec<_>>(),
        _ => profile_get_all(state.clone())?
    };
    eprintln!("[Export] {} profiles to export", profiles.len());
    if profiles.is_empty() {
        return Ok(json!({ "success": false, "error": "No profiles to export" }));
    }
    // Show save dialog
    let file = app.dialog().file()
        .add_filter("JSON Files", &["json"])
        .set_title("Export Profiles")
        .set_file_name(format!("profiles_{}.json", Utc::now().timestamp()))
        .blocking_save_file();
    match file {
        Some(fp) => {
            let out = fp.into_path().map_err(|e| e.to_string())?;
            eprintln!("[Export] Writing to: {}", out.display());
            fs::write(&out, serde_json::to_vec_pretty(&profiles).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            eprintln!("[Export] Done: {}", out.display());
            Ok(json!({ "success": true, "filePath": out.to_string_lossy().to_string() }))
        }
        None => Ok(json!({ "success": false, "canceled": true })),
    }
}

#[tauri::command]
async fn profile_import(app: AppHandle, state: State<'_, AppState>) -> ApiResult<Value> {
    let file = app.dialog().file()
        .add_filter("Profile Files", &["json", "zip"])
        .set_title("Select profiles to import")
        .blocking_pick_file();

    match file {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            let db = conn(&state)?;
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let profiles: Vec<Value> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            let mut imported = 0u32;
            for p in profiles {
                let id = p["id"].as_str().map(String::from).unwrap_or_else(|| Uuid::new_v4().to_string());
                let user_data_dir = state.profiles_dir.join(&id);
                fs::create_dir_all(&user_data_dir).ok();
                let res = db.execute(
                    "INSERT OR IGNORE INTO profiles (id,name,group_name,proxy_type,proxy_host,proxy_port,proxy_user,proxy_pass,proxy_enabled,notes,browser_version,user_data_dir,startup_url,startup_type,startup_urls,fingerprint_flags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    params![
                        id,
                        p["name"].as_str().unwrap_or("Imported"),
                        p["group_name"].as_str(),
                        p["proxy_type"].as_str(),
                        p["proxy_host"].as_str(),
                        p["proxy_port"].as_i64(),
                        p["proxy_user"].as_str(),
                        p["proxy_pass"].as_str(),
                        p["proxy_enabled"].as_i64().unwrap_or(0),
                        p["notes"].as_str(),
                        p["browser_version"].as_str().unwrap_or("latest"),
                        user_data_dir.to_string_lossy(),
                        p["startup_url"].as_str(),
                        p["startup_type"].as_str().unwrap_or("continue"),
                        p["startup_urls"].as_str(),
                        p["fingerprint_flags"].as_str(),
                    ],
                );
                if res.is_ok() { imported += 1; }
            }
            Ok(json!({ "success": true, "count": imported, "filePath": path.to_string_lossy() }))
        }
        None => Ok(json!({ "success": false, "canceled": true })),
    }
}

#[tauri::command]
fn settings_get_chrome_path(state: State<AppState>) -> ApiResult<String> {
    let db = conn(&state)?;
    let stored = get_setting(&db, "chrome_path")?.filter(|s| !s.is_empty());
    Ok(stored.unwrap_or_else(|| detect_chrome_path().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()))
}

#[tauri::command]
fn settings_set_chrome_path(state: State<AppState>, path: String) -> ApiResult<()> {
    set_setting(&conn(&state)?, "chrome_path", &path)
}

#[tauri::command]
async fn settings_select_chrome_path(app: AppHandle) -> ApiResult<Option<String>> {
    Ok(app.dialog().file()
        .set_title("Select Chrome/Chromium Browser")
        .blocking_pick_file()
        .and_then(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
fn settings_get_profiles_dir(state: State<AppState>) -> ApiResult<String> {
    // Return actual profiles base: if profiles exist, use parent of first profile's user_data_dir
    let db = conn(&state).ok();
    if let Some(db) = db {
        if let Ok(Some(dir)) = db.query_row(
            "SELECT user_data_dir FROM profiles LIMIT 1", [],
            |r| r.get::<_, String>(0)
        ).optional() {
            if let Some(parent) = std::path::Path::new(&dir).parent() {
                return Ok(parent.to_string_lossy().into_owned());
            }
        }
    }
    Ok(state.profiles_dir.to_string_lossy().into_owned())
}

#[tauri::command]
fn settings_set_profiles_dir(state: State<AppState>, dir: String) -> ApiResult<()> {
    set_setting(&conn(&state)?, "profiles_dir", &dir)
}

#[tauri::command]
async fn settings_select_profiles_dir(app: AppHandle) -> ApiResult<Option<String>> {
    Ok(app.dialog().file()
        .set_title("Select Profiles Directory")
        .blocking_pick_folder()
        .and_then(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned()))
}

setting_bool_cmd!(settings_get_check_update_on_startup, settings_set_check_update_on_startup, "check_update_on_startup", true);
setting_bool_cmd!(settings_get_include_prerelease_updates, settings_set_include_prerelease_updates, "include_prerelease_updates", false);

#[tauri::command]
fn window_minimize(window: WebviewWindow) -> ApiResult<()> { window.minimize().map_err(|e| e.to_string()) }
#[tauri::command]
fn window_maximize(window: WebviewWindow) -> ApiResult<()> {
    if window.is_maximized().map_err(|e| e.to_string())? { window.unmaximize().map_err(|e| e.to_string()) } else { window.maximize().map_err(|e| e.to_string()) }
}
#[tauri::command]
fn window_close(window: WebviewWindow) -> ApiResult<()> { window.close().map_err(|e| e.to_string()) }

#[tauri::command]
fn app_quit(app: AppHandle) -> ApiResult<()> { app.exit(0); Ok(()) }

#[tauri::command]
async fn app_open_external(url: String) -> ApiResult<()> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}
#[tauri::command]
fn app_get_version(app: AppHandle) -> ApiResult<String> { Ok(app.package_info().version.to_string()) }
#[tauri::command]
fn app_get_platform() -> ApiResult<String> { Ok(std::env::consts::OS.to_string()) }

// ─── CloakBrowser ─────────────────────────────────────────────────────────────

const CLOAKBROWSER_API: &str = "https://api.github.com/repos/CloakHQ/CloakBrowser/releases";

fn is_cloak_browser_version(version: &str) -> bool {
    version.starts_with("CloakBrowser")
}

fn get_cloak_browser_platform_key() -> &'static str {
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))] { "cloakbrowser-linux-x64.tar.gz" }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))] { "cloakbrowser-linux-arm64.tar.gz" }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))] { "cloakbrowser-darwin-x64.tar.gz" }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))] { "cloakbrowser-darwin-arm64.tar.gz" }
    #[cfg(target_os = "windows")] { "cloakbrowser-windows-x64.zip" }
}

fn find_cloak_binary(extract_dir: &Path) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let binary_name = "chrome.exe";
    #[cfg(not(target_os = "windows"))]
    let binary_name = "chrome";

    let mut candidates = vec![
        #[cfg(target_os = "linux")]
        extract_dir.join("chrome-linux").join("chrome"),
        #[cfg(target_os = "macos")]
        extract_dir.join("chrome-mac").join("Chromium.app").join("Contents").join("MacOS").join("Chromium"),
        #[cfg(target_os = "windows")]
        extract_dir.join("chrome-win").join("chrome.exe"),
    ];
    // Also scan subdirectories for the binary
    if let Ok(entries) = std::fs::read_dir(extract_dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                candidates.push(entry.path().join(binary_name));
            }
        }
    }
    // Walk deeper
    for entry in walkdir::WalkDir::new(extract_dir).max_depth(4).into_iter().filter_map(|e| e.ok()) {
        if entry.file_name() == binary_name {
            candidates.push(entry.path().to_path_buf());
        }
    }
    candidates.into_iter().find(|p| p.exists())
}

async fn fetch_cloak_versions() -> ApiResult<Vec<ChromeVersionInfo>> {
    // Use curl to avoid reqwest TLS issues (same pattern as OAuth token exchange)
    let output = std::process::Command::new("curl")
        .args(["-s", "--connect-timeout", "10", "--max-time", "15",
            "-H", "User-Agent: EzProfile/1.0",
            CLOAKBROWSER_API])
        .output()
        .map_err(|e| format!("curl failed: {}", e))?;
    if !output.status.success() {
        return Err(format!("curl returned error: {}", String::from_utf8_lossy(&output.stderr)));
    }
    let body = String::from_utf8_lossy(&output.stdout);
    let releases: Vec<Value> = serde_json::from_str(&body).map_err(|e| format!("JSON parse error: {}", e))?;
    let platform_key = get_cloak_browser_platform_key();
    let mut results = Vec::new();
    for release in &releases {
        if release["draft"].as_bool().unwrap_or(false) { continue; }
        if release["prerelease"].as_bool().unwrap_or(false) { continue; }
        let assets = release["assets"].as_array().cloned().unwrap_or_default();
        let has_asset = assets.iter().any(|a| a["name"].as_str() == Some(platform_key));
        if !has_asset { continue; }
        let tag = release["tag_name"].as_str().unwrap_or("");
        let version_num = tag.trim_start_matches(|c: char| !c.is_ascii_digit());
        let display = format!("CloakBrowser {}", version_num);
        results.push(ChromeVersionInfo {
            version: display,
            channel: "CloakBrowser".into(),
            revision: version_num.to_string(),
            installed: false,
        });
    }
    Ok(results)
}

#[tauri::command]
async fn browser_get_available(state: State<'_, AppState>) -> ApiResult<Vec<ChromeVersionInfo>> {
    let installed = browser_get_installed(state)?;
    let installed_set: std::collections::HashSet<_> = installed.iter().map(|v| v.version.clone()).collect();

    // Fetch CloakBrowser versions first
    let mut out = match fetch_cloak_versions().await {
        Ok(v) => { eprintln!("[BrowserVersions] CloakBrowser: {} releases", v.len()); v }
        Err(e) => { eprintln!("[BrowserVersions] CloakBrowser fetch failed: {}", e); vec![] }
    };
    for v in &mut out {
        v.installed = installed_set.contains(&v.version);
    }

    // Fetch Chrome versions (use curl to avoid reqwest TLS issues)
    let chrome_url = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
    eprintln!("[BrowserVersions] Fetching Chrome versions...");
    let data = match std::process::Command::new("curl")
        .args(["-s", "--connect-timeout", "10", "--max-time", "15", chrome_url])
        .output()
    {
        Ok(o) if o.status.success() => {
            let body = String::from_utf8_lossy(&o.stdout);
            match serde_json::from_str::<Value>(&body) {
                Ok(v) => v,
                Err(e) => { eprintln!("[BrowserVersions] Chrome JSON parse error: {}", e); return Ok(out); }
            }
        }
        Ok(o) => { eprintln!("[BrowserVersions] curl failed: {}", String::from_utf8_lossy(&o.stderr)); return Ok(out); }
        Err(e) => { eprintln!("[BrowserVersions] curl error: {}", e); return Ok(out); }
    };

    for channel in ["Stable", "Beta", "Dev", "Canary"] {
        if let Some(c) = data["channels"].get(channel) {
            let version = c["version"].as_str().unwrap_or("").to_string();
            if !version.is_empty() {
                out.push(ChromeVersionInfo { installed: installed_set.contains(&version), version, channel: channel.into(), revision: c["revision"].as_str().unwrap_or("").into() });
            }
        }
    }

    // Fetch milestone versions (matching Electron's CHROME_VERSIONS_API)
    let milestones_url = "https://googlechromelabs.github.io/chrome-for-testing/latest-versions-per-milestone-with-downloads.json";
    eprintln!("[BrowserVersions] Fetching milestones...");
    if let Ok(milestone_out) = std::process::Command::new("curl")
        .args(["-s", "--connect-timeout", "10", "--max-time", "15", milestones_url])
        .output()
    {
        if milestone_out.status.success() {
            let body = String::from_utf8_lossy(&milestone_out.stdout);
            if let Ok(milestone_data) = serde_json::from_str::<Value>(&body) {
                let platform = chrome_platform();
                if let Some(milestones) = milestone_data["milestones"].as_object() {
                    let mut milestone_nums: Vec<u32> = milestones.keys()
                        .filter_map(|k| k.parse().ok())
                        .collect();
                    milestone_nums.sort_by(|a, b| b.cmp(a)); // newest first
                    for m in milestone_nums {
                        let key = m.to_string();
                        if let Some(md) = milestones.get(&key) {
                            let ver = md["version"].as_str().unwrap_or("");
                            if ver.is_empty() || out.iter().any(|v| v.version == ver) { continue; }
                            if let Some(dl) = md["downloads"]["chrome"].as_array() {
                                if dl.iter().any(|d| d["platform"].as_str() == Some(&platform)) {
                                    out.push(ChromeVersionInfo {
                                        installed: installed_set.contains(ver),
                                        version: ver.to_string(),
                                        channel: format!("Milestone {}", m),
                                        revision: md["revision"].as_str().unwrap_or("").to_string(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    eprintln!("[BrowserVersions] Total: {} versions (CloakBrowser + Channels + Milestones)", out.len());
    Ok(out)
}
#[tauri::command]
fn browser_get_installed(state: State<AppState>) -> ApiResult<Vec<InstalledBrowserVersion>> {
    let meta = state.browsers_dir.join("versions.json");
    let v: Value = fs::read_to_string(meta).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_else(|| json!({ "versions": [] }));
    Ok(v["versions"].as_array().cloned().unwrap_or_default().into_iter().filter_map(|x| Some(InstalledBrowserVersion { version: x["version"].as_str()?.into(), channel: x["channel"].as_str().unwrap_or("Custom").into(), installed_at: x["installedAt"].as_str().or_else(|| x["installed_at"].as_str()).unwrap_or("").into(), chrome_path: x["chromePath"].as_str().or_else(|| x["chrome_path"].as_str()).unwrap_or("").into() })).collect())
}
#[tauri::command]
async fn browser_download(app: AppHandle, state: State<'_, AppState>, version: String, channel: String) -> ApiResult<Value> {
    use futures_util::StreamExt;

    // CloakBrowser: fetch download URL from GitHub releases
    let is_cloak = channel == "CloakBrowser";
    let (download_url, archive_ext) = if is_cloak {
        let chromium_version = version.trim_start_matches("CloakBrowser ");
        let platform_key = get_cloak_browser_platform_key();
        let gh_output = std::process::Command::new("curl")
            .args(["-s", "--connect-timeout", "10", "--max-time", "15",
                "-H", "User-Agent: EzProfile/1.0",
                CLOAKBROWSER_API])
            .output().map_err(|e| e.to_string())?;
        let releases: Vec<Value> = serde_json::from_str(&String::from_utf8_lossy(&gh_output.stdout))
            .map_err(|e| format!("JSON parse: {}", e))?;
        let mut url = None;
        for release in &releases {
            if release["draft"].as_bool().unwrap_or(false) { continue; }
            if release["prerelease"].as_bool().unwrap_or(false) { continue; }
            let tag = release["tag_name"].as_str().unwrap_or("");
            if tag.contains(chromium_version) {
                let assets = release["assets"].as_array().cloned().unwrap_or_default();
                if let Some(asset) = assets.iter().find(|a| a["name"].as_str() == Some(platform_key)) {
                    url = asset["browser_download_url"].as_str().map(String::from);
                    break;
                }
            }
        }
        let dl = url.ok_or_else(|| format!("No CloakBrowser download for version {}", version))?;
        let ext = if platform_key.ends_with(".tar.gz") { "tar.gz" } else { "zip" };
        (dl, ext)
    } else {
        let platform = chrome_platform();
        // Use curl for Chrome versions JSON (avoid reqwest TLS issues)
        let json_url = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";
        let curl_out = std::process::Command::new("curl")
            .args(["-s", "--connect-timeout", "10", "--max-time", "15", json_url])
            .output().map_err(|e| e.to_string())?;
        let body = String::from_utf8_lossy(&curl_out.stdout);
        let data: Value = serde_json::from_str(&body).map_err(|e| format!("JSON parse: {}", e))?;
        let url = data["channels"][&channel]["downloads"]["chrome"].as_array()
            .and_then(|entries| entries.iter().find(|e| e["platform"].as_str() == Some(platform)))
            .and_then(|e| e["url"].as_str().map(String::from))
            .ok_or_else(|| format!("No download URL for {} on {}", channel, platform))?;
        (url, "zip")
    };

    let version_dir = state.browsers_dir.join(&version);
    let archive_path = version_dir.join(format!("download.{}", archive_ext));

    app.emit("browser:downloadProgress", (&version, 0u32, "Starting download...")).ok();
    let client = reqwest::Client::new();
    let response = client.get(&download_url).send().await.map_err(|e| e.to_string())?;
    let total = response.content_length().unwrap_or(0);
    fs::create_dir_all(&version_dir).map_err(|e| e.to_string())?;
    let mut file = fs::File::create(&archive_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if total > 0 {
            let pct = ((downloaded as f64 / total as f64) * 100.0) as u32;
            app.emit("browser:downloadProgress", (&version, pct,
                format!("{:.1} MB / {:.1} MB", downloaded as f64 / 1_048_576.0, total as f64 / 1_048_576.0))).ok();
        } else {
            app.emit("browser:downloadProgress", (&version, 0u32,
                format!("Downloaded {:.1} MB", downloaded as f64 / 1_048_576.0))).ok();
        }
    }
    drop(file);

    app.emit("browser:downloadProgress", (&version, 90u32, "Extracting...")).ok();

    if archive_ext == "tar.gz" {
        // Extract .tar.gz (CloakBrowser on Linux/macOS)
        let f = fs::File::open(&archive_path).map_err(|e| e.to_string())?;
        let gz = flate2::read::GzDecoder::new(f);
        let mut archive = tar::Archive::new(gz);
        archive.unpack(&version_dir).map_err(|e| format!("Extraction failed: {}", e))?;
    } else {
        // Extract .zip
        let zip_file = fs::File::open(&archive_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(zip_file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let out_path = version_dir.join(entry.name());
            if entry.name().ends_with('/') {
                fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
            } else {
                if let Some(parent) = out_path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
                let mut out = fs::File::create(&out_path).map_err(|e| e.to_string())?;
                std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            }
        }
    }
    let _ = fs::remove_file(&archive_path);

    // Find the binary
    let chrome_path = if is_cloak {
        find_cloak_binary(&version_dir).ok_or_else(|| "CloakBrowser binary not found after extraction".to_string())?
    } else {
        find_chrome_binary(&version_dir, chrome_platform()).ok_or_else(|| "Chrome binary not found after extraction".to_string())?
    };
    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&chrome_path, fs::Permissions::from_mode(0o755)).ok();
    }

    // Register in versions.json
    let meta_path = state.browsers_dir.join("versions.json");
    let mut meta: Value = fs::read_to_string(&meta_path).ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({ "versions": [] }));
    if let Some(versions) = meta["versions"].as_array_mut() {
        versions.push(json!({
            "version": version,
            "channel": channel,
            "installedAt": Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
            "chromePath": chrome_path.to_string_lossy().to_string()
        }));
    }
    fs::write(&meta_path, serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    app.emit("browser:downloadProgress", (&version, 100u32, "Completed!")).ok();
    Ok(json!({ "success": true, "version": version, "chromePath": chrome_path.to_string_lossy().to_string() }))
}
#[tauri::command]
fn browser_delete(state: State<AppState>, version: String) -> ApiResult<Value> {
    eprintln!("[BrowserDelete] Deleting version: {}", version);
    let meta_path = state.browsers_dir.join("versions.json");
    let mut deleted_dir = None;

    // Find and delete the browser directory (may be at legacy Electron path or Tauri path)
    if let Ok(data) = fs::read_to_string(&meta_path) {
        if let Ok(mut meta) = serde_json::from_str::<Value>(&data) {
            if let Some(versions) = meta["versions"].as_array_mut() {
                // Find the entry to get chromePath → directory
                for v in versions.iter() {
                    if v["version"].as_str() == Some(&version) {
                        if let Some(cp) = v["chromePath"].as_str() {
                            let chrome = std::path::Path::new(cp);
                            // Directory is parent of chrome binary
                            let dir = chrome.parent().unwrap_or(chrome);
                            if dir.exists() {
                                eprintln!("[BrowserDelete] Removing: {}", dir.display());
                                fs::remove_dir_all(dir).ok();
                                deleted_dir = Some(dir.to_path_buf());
                            }
                        }
                    }
                }
                // Remove from versions.json
                versions.retain(|v| v["version"].as_str() != Some(&version));
            }
            let _ = fs::write(&meta_path, serde_json::to_string_pretty(&meta).unwrap_or_default());
            eprintln!("[BrowserDelete] Updated versions.json");
        }
    }

    // Fallback: try Tauri browsers dir
    if deleted_dir.is_none() {
        let dir = state.browsers_dir.join(&version);
        if dir.exists() {
            eprintln!("[BrowserDelete] Removing (tauri path): {}", dir.display());
            fs::remove_dir_all(&dir).ok();
        }
    }

    Ok(json!({ "success": true }))
}
#[tauri::command]
async fn browser_add_custom(app: AppHandle, state: State<'_, AppState>) -> ApiResult<Value> {
    let file = app.dialog().file()
        .add_filter("Browser Executable", &["exe", "app", "bin", ""])
        .set_title("Select Custom Browser Executable")
        .blocking_pick_file();

    match file {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            let chrome_path = path.to_string_lossy().to_string();
            let version = path.file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| format!("Custom-{}", Utc::now().timestamp()));
            let meta_path = state.browsers_dir.join("versions.json");
            let mut meta: Value = fs::read_to_string(&meta_path).ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_else(|| json!({ "versions": [] }));
            if let Some(versions) = meta["versions"].as_array_mut() {
                versions.push(json!({
                    "version": version,
                    "channel": "Custom",
                    "installedAt": Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
                    "chromePath": chrome_path
                }));
            }
            fs::write(&meta_path, serde_json::to_string_pretty(&meta).unwrap_or_default())
                .map_err(|e| e.to_string())?;
            Ok(json!({ "success": true, "version": version, "chromePath": chrome_path }))
        }
        None => Ok(json!({ "success": false, "canceled": true })),
    }
}
#[tauri::command]
fn browser_get_default(state: State<AppState>) -> ApiResult<String> { Ok(get_setting(&conn(&state)?, "default_browser_version")?.unwrap_or_else(|| "system".into())) }
#[tauri::command]
fn browser_set_default(state: State<AppState>, version: String) -> ApiResult<Value> { set_setting(&conn(&state)?, "default_browser_version", &version)?; Ok(json!({ "success": true })) }

#[tauri::command]
fn extension_get_all(state: State<AppState>) -> ApiResult<Vec<ExtensionData>> {
    let db = conn(&state)?;
    let mut stmt = db.prepare("SELECT e.*, COUNT(pe.profile_id) AS profile_count FROM extensions e LEFT JOIN profile_extensions pe ON pe.extension_id=e.id GROUP BY e.id ORDER BY e.created_at DESC").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_extension).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(rows)
}
fn row_extension(r: &rusqlite::Row<'_>) -> rusqlite::Result<ExtensionData> {
    Ok(ExtensionData { id: r.get("id")?, name: r.get("name")?, ext_id: r.get("ext_id")?, version: r.get("version")?, description: r.get("description")?, icon_path: r.get("icon_path")?, source_url: r.get("source_url")?, store_version: r.get("store_version")?, ext_dir: r.get("ext_dir")?, profile_count: r.get("profile_count")?, created_at: r.get("created_at")?, updated_at: r.get("updated_at")? })
}
#[tauri::command]
async fn extension_upload(app: AppHandle, state: State<'_, AppState>) -> ApiResult<Value> {
    let files = app.dialog().file()
        .add_filter("Extension Files", &["zip", "crx"])
        .add_filter("All Files", &["*"])
        .set_title("Select extension files")
        .blocking_pick_files();

    match files {
        Some(list) => {
            let paths: Vec<PathBuf> = list.into_iter()
                .filter_map(|f| f.into_path().ok())
                .collect();
            if paths.is_empty() {
                return Ok(json!({ "success": false, "canceled": true }));
            }
            let db = conn(&state)?;
            let mut added = Vec::new();
            for src_path in paths {
                let ext_name = src_path.file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| format!("ext_{}", Utc::now().timestamp()));
                let uuid = Uuid::new_v4().to_string();
                let ext_dir = state.extensions_dir.join(&uuid);
                fs::create_dir_all(&ext_dir).map_err(|e| e.to_string())?;
                // Try extracting (zip or crx)
                let result = if src_path.extension().map(|e| e == "crx").unwrap_or(false) {
                    read_crx_and_extract(&src_path, &ext_dir)
                } else {
                    unzip_dir(&src_path, &ext_dir)
                };
                match result {
                    Ok(()) => {
                        let manifest = read_extension_manifest(&ext_dir);
                        let name = manifest.get("name").and_then(|v| v.as_str()).unwrap_or(&ext_name).to_string();
                        let version = manifest.get("version").and_then(|v| v.as_str()).map(String::from);
                        let description = manifest.get("description").and_then(|v| v.as_str()).map(String::from);
                        let ext_id = manifest.get("id").and_then(|v| v.as_str()).map(String::from);
                        let icon_path = find_best_icon(&manifest, &ext_dir);
                        db.execute(
                            "INSERT INTO extensions (id,name,ext_id,version,description,icon_path,ext_dir,source_url) VALUES (?,?,?,?,?,?,?,?)",
                            params![uuid, name, ext_id, version, description, icon_path, ext_dir.to_string_lossy(), src_path.to_string_lossy()],
                        ).map_err(|e| e.to_string())?;
                        let icon = icon_path.clone();
                        added.push(json!({
                            "id": uuid, "name": name, "ext_id": ext_id, "version": version,
                            "description": description, "icon_path": icon,
                            "ext_dir": ext_dir.to_string_lossy(), "profile_count": 0,
                            "created_at": "", "updated_at": ""
                        }));
                    }
                    Err(e) => {
                        let _ = fs::remove_dir_all(&ext_dir);
                        return Ok(json!({ "success": false, "error": format!("Failed to extract {}: {}", src_path.display(), e) }));
                    }
                }
            }
            if let Some(ext) = added.first() {
                Ok(json!({ "success": true, "extension": ext }))
            } else {
                Ok(json!({ "success": false, "error": "No extensions processed" }))
            }
        }
        None => Ok(json!({ "success": false, "canceled": true })),
    }
}
#[tauri::command]
async fn extension_download_from_store(state: State<'_, AppState>, store_url: String) -> ApiResult<Value> {
    // Extract extension ID from Chrome Web Store URL
    // URL format: https://chromewebstore.google.com/detail/name/extensionid
    let chrome_ext_id = store_url.split('/').last()
        .or_else(|| store_url.split("id=").nth(1))
        .unwrap_or("");
    let chrome_ext_id = chrome_ext_id.split('?').next().unwrap_or(chrome_ext_id);
    if chrome_ext_id.len() < 10 {
        return Ok(json!({ "success": false, "error": "Could not extract extension ID from URL" }));
    }

    // Download CRX via Google update API
    let crx_url = format!(
        "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=131.0.6778.69&acceptformat=crx3&x=id%3D{}%26uc",
        chrome_ext_id
    );
    let resp = reqwest::get(&crx_url).await.map_err(|e| format!("Download failed: {}", e))?;
    if !resp.status().is_success() {
        return Ok(json!({ "success": false, "error": format!("Download returned status {}", resp.status()) }));
    }
    let crx_data = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();

    // Extract extension
    let uuid = Uuid::new_v4().to_string();
    let ext_dir = state.extensions_dir.join(&uuid);
    fs::create_dir_all(&ext_dir).map_err(|e| e.to_string())?;

    let result = read_crx_and_extract_bytes(&crx_data, &ext_dir);
    match result {
        Ok(()) => {
            let manifest = read_extension_manifest(&ext_dir);
            let name = manifest.get("name").and_then(|v| v.as_str()).unwrap_or(chrome_ext_id).to_string();
            let version = manifest.get("version").and_then(|v| v.as_str()).map(String::from);
            let description = manifest.get("description").and_then(|v| v.as_str()).map(String::from);
            let icon_path = find_best_icon(&manifest, &ext_dir);
            let store_ver = version.clone();
            let db = conn(&state)?;
            db.execute(
                "INSERT INTO extensions (id,name,ext_id,version,description,icon_path,ext_dir,source_url,store_version) VALUES (?,?,?,?,?,?,?,?,?)",
                params![uuid, name, chrome_ext_id, version, description, icon_path, ext_dir.to_string_lossy(), store_url, store_ver],
            ).map_err(|e| e.to_string())?;
            let icon = icon_path.clone();
            Ok(json!({ "success": true, "extension": {
                "id": uuid, "name": name, "ext_id": chrome_ext_id, "version": version,
                "description": description, "icon_path": icon,
                "ext_dir": ext_dir.to_string_lossy(), "profile_count": 0,
                "created_at": "", "updated_at": ""
            }}))
        }
        Err(e) => {
            let _ = fs::remove_dir_all(&ext_dir);
            Ok(json!({ "success": false, "error": format!("Failed to extract: {}", e) }))
        }
    }
}

#[tauri::command]
fn extension_update(state: State<AppState>, id: String, data: Value) -> ApiResult<ExtensionData> {
    if let Some(name) = data.get("name").and_then(Value::as_str) {
        conn(&state)?.execute("UPDATE extensions SET name=?, updated_at=datetime('now') WHERE id=?", params![name, id]).map_err(|e| e.to_string())?;
    }
    let db = conn(&state)?;
    db.query_row("SELECT e.*, COUNT(pe.profile_id) AS profile_count FROM extensions e LEFT JOIN profile_extensions pe ON pe.extension_id=e.id WHERE e.id=? GROUP BY e.id", [id], row_extension).map_err(|e| e.to_string())
}

#[tauri::command]
fn extension_delete(state: State<AppState>, id: String) -> ApiResult<()> {
    let db = conn(&state)?;
    if let Ok(dir) = db.query_row::<String, _, _>("SELECT ext_dir FROM extensions WHERE id=?", [&id], |r| r.get(0)) { let _ = fs::remove_dir_all(dir); }
    db.execute("DELETE FROM extensions WHERE id=?", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn extension_check_update(state: State<'_, AppState>, id: String) -> ApiResult<Value> {
    let (ext_id, current_version, _source_url) = {
        let db = conn(&state)?;
        let ext_id: Option<String> = db.query_row("SELECT ext_id FROM extensions WHERE id=?", [&id], |r| r.get(0)).ok().flatten();
        let version: Option<String> = db.query_row("SELECT version FROM extensions WHERE id=?", [&id], |r| r.get(0)).ok().flatten();
        let source: Option<String> = db.query_row("SELECT source_url FROM extensions WHERE id=?", [&id], |r| r.get(0)).ok().flatten();
        (ext_id, version, source)
    };
    let chrome_id = ext_id.ok_or("Extension has no Chrome Web Store ID")?;
    let current_ver = current_version.unwrap_or_else(|| "0".into());

    // Query Chrome Web Store for latest version
    let cws_url = format!(
        "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=91.0&acceptformat=crx3&x=id%3D{}%26uc",
        chrome_id
    );
    let resp = reqwest::get(&cws_url).await.map_err(|e| e.to_string())?;
    // Parse version from redirect URL or response headers
    let latest_version = resp.url().path_segments()
        .and_then(|s| s.last())
        .unwrap_or("")
        .to_string();

    let has_update = !latest_version.is_empty() && latest_version != current_ver;
    Ok(json!({ "success": true, "hasUpdate": has_update, "currentVersion": current_ver, "latestVersion": latest_version }))
}

#[tauri::command]
async fn extension_perform_update(_app: AppHandle, state: State<'_, AppState>, id: String) -> ApiResult<Value> {
    let update_info = extension_check_update(state.clone(), id.clone()).await?;
    let has_update = update_info["hasUpdate"].as_bool().unwrap_or(false);
    if !has_update {
        return Ok(json!({ "success": false, "error": "No update available" }));
    }
    // Re-download from store using the source URL
    let source_url: Option<String> = {
        let db = conn(&state)?;
        db.query_row("SELECT source_url FROM extensions WHERE id=?", [&id], |r| r.get(0)).ok().flatten()
    };
    match source_url {
        Some(url) => {
            let result = extension_download_from_store(state, url).await?;
            if result["success"].as_bool().unwrap_or(false) {
                Ok(json!({ "success": true, "newVersion": result["version"] }))
            } else {
                Ok(json!({ "success": false, "error": "Update download failed" }))
            }
        }
        None => Ok(json!({ "success": false, "error": "No source URL for this extension" })),
    }
}
#[tauri::command]
fn extension_get_profile_extensions(state: State<AppState>, profile_id: String) -> ApiResult<Vec<ExtensionData>> {
    let db = conn(&state)?;
    let mut stmt = db.prepare("SELECT e.*, 0 as profile_count FROM extensions e JOIN profile_extensions pe ON pe.extension_id=e.id WHERE pe.profile_id=? ORDER BY e.name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([profile_id], row_extension).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(rows)
}
#[tauri::command]
fn extension_set_profile_extensions(state: State<AppState>, profile_ids: Vec<String>, extension_ids: Vec<String>) -> ApiResult<()> {
    let db = conn(&state)?;
    for pid in profile_ids {
        db.execute("DELETE FROM profile_extensions WHERE profile_id=?", [&pid]).map_err(|e| e.to_string())?;
        for eid in &extension_ids {
            db.execute("INSERT OR IGNORE INTO profile_extensions (profile_id, extension_id) VALUES (?,?)", params![pid, eid]).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
#[tauri::command]
fn extension_add_to_profiles(state: State<AppState>, extension_id: String, profile_ids: Vec<String>) -> ApiResult<()> {
    let db = conn(&state)?;
    for pid in profile_ids { db.execute("INSERT OR IGNORE INTO profile_extensions (profile_id, extension_id) VALUES (?,?)", params![pid, extension_id]).map_err(|e| e.to_string())?; }
    Ok(())
}
#[tauri::command]
fn extension_get_icon(icon_path: String) -> ApiResult<Option<String>> {
    let bytes = fs::read(icon_path).map_err(|e| e.to_string())?;
    Ok(Some(format!("data:image/png;base64,{}", base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes))))
}

#[tauri::command]
fn sync_get_settings(state: State<AppState>) -> ApiResult<Value> {
    let db = conn(&state)?;
    // Parse S3 config if stored
    let s3_config = get_setting(&db, "s3_config")?
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .map(|mut cfg| {
            cfg["hasSecret"] = json!(cfg.get("secretAccessKey").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false));
            cfg
        });
    Ok(json!({
        "provider": get_setting(&db, "sync_provider")?,
        "autoSyncOnClose": get_setting(&db, "sync_auto_sync_on_close")?.as_deref() == Some("true"),
        "syncMaxBackups": get_setting(&db, "sync_max_backups")?.and_then(|s| s.parse::<i64>().ok()).unwrap_or(5),
        "passphraseHint": get_setting(&db, "sync_passphrase_hint")?.unwrap_or_default(),
        "hasPassphrase": get_setting(&db, "sync_encrypted_key")?.is_some(),
        "gdrive": {
            "connected": get_setting(&db, "gdrive_refresh_token")?.is_some(),
            "clientId": get_setting(&db, "gdrive_client_id")?,
            "hasSecret": get_setting(&db, "gdrive_client_secret")?.is_some(),
            "email": "",
        },
        "s3": s3_config,
    }))
}
#[tauri::command]
fn sync_set_provider(state: State<AppState>, provider: String) -> ApiResult<()> { set_setting(&conn(&state)?, "sync_provider", &provider) }
#[tauri::command]
fn sync_save_google_client_id(state: State<AppState>, client_id: String) -> ApiResult<Value> { set_setting(&conn(&state)?, "gdrive_client_id", &client_id)?; Ok(json!({ "success": true })) }
#[tauri::command]
fn sync_save_google_client_secret(state: State<AppState>, secret: String) -> ApiResult<Value> { set_setting(&conn(&state)?, "gdrive_client_secret", &secret)?; Ok(json!({ "success": true })) }
#[tauri::command]
fn sync_save_s3_config(state: State<AppState>, config: Value) -> ApiResult<Value> { set_setting(&conn(&state)?, "s3_config", &config.to_string())?; Ok(json!({ "success": true })) }
#[tauri::command]
async fn sync_test_s3(state: State<'_, AppState>) -> ApiResult<Value> {
    let db = conn(&state)?;
    let config = crate::s3::load_s3_config(&db)?;
    crate::s3::s3_test_connection(&config).await
}
#[tauri::command]
async fn sync_start_google_auth(app: AppHandle, state: State<'_, AppState>) -> ApiResult<Value> {
    let (client_id, client_secret) = {
        let db = conn(&state)?;
        let cid = get_setting(&db, "gdrive_client_id")?
            .ok_or_else(|| "Google Client ID not set".to_string())?;
        let cs = get_setting(&db, "gdrive_client_secret")?
            .ok_or_else(|| "Google Client Secret not set".to_string())?;
        (cid, cs)
    };
    let (token, result) = crate::gdrive::perform_google_auth(&client_id, &client_secret, &app).await?;
    if let Some(refresh) = token.refresh_token {
        let db = conn(&state)?;
        set_setting(&db, "gdrive_refresh_token", &refresh)?;
    }
    Ok(result)
}
#[tauri::command]
fn sync_get_google_auth_status(state: State<AppState>) -> ApiResult<Value> { let db = conn(&state)?; Ok(json!({ "connected": get_setting(&db, "gdrive_refresh_token")?.is_some(), "clientId": get_setting(&db, "gdrive_client_id")?, "hasSecret": get_setting(&db, "gdrive_client_secret")?.is_some() })) }
#[tauri::command]
fn sync_revoke_google(state: State<AppState>) -> ApiResult<Value> { set_setting(&conn(&state)?, "gdrive_refresh_token", "")?; Ok(json!({ "success": true })) }
#[tauri::command]
fn sync_set_passphrase(state: State<AppState>, passphrase: String, hint: Option<String>) -> ApiResult<Value> { let digest = sha2_digest(&passphrase); let db = conn(&state)?; set_setting(&db, "sync_encrypted_key", &digest)?; if let Some(h) = hint { set_setting(&db, "sync_passphrase_hint", &h)?; } Ok(json!({ "success": true })) }
#[tauri::command]
fn sync_change_passphrase(state: State<AppState>, old_passphrase: String, new_passphrase: String, new_hint: Option<String>) -> ApiResult<Value> { if !sync_has_passphrase(state.clone())? || get_setting(&conn(&state)?, "sync_encrypted_key")? == Some(sha2_digest(&old_passphrase)) { sync_set_passphrase(state, new_passphrase, new_hint) } else { Ok(json!({ "success": false, "error": "Wrong passphrase" })) } }
#[tauri::command]
fn sync_clear_passphrase(state: State<AppState>) -> ApiResult<Value> { set_setting(&conn(&state)?, "sync_encrypted_key", "")?; Ok(json!({ "success": true })) }
#[tauri::command]
fn sync_has_passphrase(state: State<AppState>) -> ApiResult<bool> { Ok(get_setting(&conn(&state)?, "sync_encrypted_key")?.filter(|s| !s.is_empty()).is_some()) }
#[tauri::command]
async fn sync_upload_profile(app: AppHandle, state: State<'_, AppState>, profile_id: String, _is_backup: Option<bool>, target_provider: Option<String>) -> ApiResult<Value> {
    // Extract all DB data before any .await (Connection is !Send)
    let (provider, profile, s3_config, gdrive_creds, s3_prefix) = {
        let db = conn(&state)?;
        let provider = target_provider
        .filter(|p| !p.is_empty())
        .unwrap_or_else(|| get_setting(&db, "sync_provider").ok().flatten().unwrap_or_else(|| "s3".into()));
        let profile = get_profile(&db, &profile_id)?;
        let s3_config = if provider != "googledrive" {
            Some(crate::s3::load_s3_config(&db)?)
        } else { None };
        let gdrive_creds = if provider == "googledrive" {
            let cid = get_setting(&db, "gdrive_client_id")?.unwrap_or_default();
            let cs = get_setting(&db, "gdrive_client_secret")?.unwrap_or_default();
            let rt = get_setting(&db, "gdrive_refresh_token")?.unwrap_or_default();
            Some((cid, cs, rt))
        } else { None };
        let s3_prefix = get_setting(&db, "s3_config").ok().flatten()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|v| v.get("prefix").and_then(|p| p.as_str().map(String::from)))
            .unwrap_or_else(|| "ezprofile/".into());
        (provider, profile, s3_config, gdrive_creds, s3_prefix)
    };

    // Match Electron format:
    //   S3:     {prefix}{profileId}/{safeName}_{sync_or_ts}.ezpsync
    //   GDrive: {profileId}_{safeName}_{sync_or_ts}.ezpsync (flat)
    let safe_name = sanitize(&profile.name);
    let is_sync = _is_backup.unwrap_or(false);
    let ts_suffix = if is_sync {
        "sync".to_string()
    } else {
        Utc::now().format("%Y%m%dT%H%M%S").to_string()
    };
    let key = if provider == "s3" {
        format!("{}{}/{}_{}.ezpsync", s3_prefix, profile_id, safe_name, ts_suffix)
    } else {
        format!("{}_{}_{}.ezpsync", profile_id, safe_name, ts_suffix)
    };
    let tmp_path = state.profiles_dir.join(format!("_sync_{}.zip", profile_id));
    eprintln!("[Sync] Upload: profile={} provider={} key={}", profile_id, provider, key);

    // Zip the profile
    let zip_start = std::time::Instant::now();
    zip_dir(Path::new(&profile.user_data_dir), &tmp_path)?;
    let zip_size = fs::metadata(&tmp_path).map(|m| m.len()).unwrap_or(0);
    eprintln!("[Sync] Zipped in {:?} — {} bytes", zip_start.elapsed(), zip_size);

    // Encrypt zip into .ezpsync format (matching Electron)
    let zip_data = fs::read(&tmp_path).map_err(|e| e.to_string())?;
    let passphrase_hash = {
        let d = conn(&state)?;
        get_setting(&d, "sync_encrypted_key")?.unwrap_or_default()
    };
    let encrypted = if !passphrase_hash.is_empty() {
        eprintln!("[Sync] Encrypting with passphrase ({} zip bytes)...", zip_data.len());
        write_ezpsync(&zip_data, &passphrase_hash, &profile_id, &profile.name)?
    } else {
        eprintln!("[Sync] No passphrase set — uploading raw zip");
        zip_data
    };
    let _ = fs::remove_file(&tmp_path);

    app.emit("sync:progress", json!({ "profileId": profile_id, "status": "uploading" })).ok();

    let upload_start = std::time::Instant::now();
    let result = match provider.as_str() {
        "googledrive" => {
            eprintln!("[Sync] Uploading to Google Drive ({} bytes)...", encrypted.len());
            let (cid, cs, rt) = gdrive_creds.as_ref().ok_or("GDrive credentials not found")?;
            let token = crate::gdrive::refresh_access_token(cid, cs, rt).await?;
            crate::gdrive::drive_upload(&token, &key, encrypted).await
        }
        _ => {
            eprintln!("[Sync] Uploading to S3...");
            let config = s3_config.as_ref().ok_or("S3 config not found")?;
            let s3_tmp = tmp_path.with_extension("ezpsync");
            fs::write(&s3_tmp, &encrypted).map_err(|e| e.to_string())?;
            let result = crate::s3::s3_upload_file(config, &key, &s3_tmp).await;
            let _ = fs::remove_file(&s3_tmp);
            result
        }
    };
    let _ = fs::remove_file(&tmp_path);
    match result {
        Ok(remote_ref) => {
            eprintln!("[Sync] Upload OK in {:?} — ref={}", upload_start.elapsed(), remote_ref);
            let db = conn(&state)?;
            db.execute("INSERT INTO sync_log (id,profile_id,provider,direction,status,remote_file) VALUES (?,?,?,?,?,?)",
                rusqlite::params![Uuid::new_v4().to_string(), profile_id, provider, "upload", "success", remote_ref]).ok();
            Ok(json!({ "success": true, "key": remote_ref }))
        }
        Err(e) => {
            eprintln!("[Sync] Upload FAILED: {}", e);
            let db = conn(&state)?;
            db.execute("INSERT INTO sync_log (id,profile_id,provider,direction,status,remote_file,error_message) VALUES (?,?,?,?,?,?,?)",
                rusqlite::params![Uuid::new_v4().to_string(), profile_id, provider, "upload", "failed", "", e]).ok();
            Err(e)
        }
    }
}

#[tauri::command]
async fn sync_download_profile(app: AppHandle, state: State<'_, AppState>, profile_id: String, remote_file_ref: String, override_passphrase: Option<String>) -> ApiResult<Value> {
    eprintln!("[Sync] Download: profile={} ref={}", profile_id, remote_file_ref);
    // Extract all DB data before any .await
    let (provider, s3_config, gdrive_creds) = {
        let db = conn(&state)?;
        let provider = get_setting(&db, "sync_provider")?.unwrap_or_else(|| "s3".into());
        let s3_config = if provider != "googledrive" {
            Some(crate::s3::load_s3_config(&db)?)
        } else { None };
        let gdrive_creds = if provider == "googledrive" {
            let cid = get_setting(&db, "gdrive_client_id")?.unwrap_or_default();
            let cs = get_setting(&db, "gdrive_client_secret")?.unwrap_or_default();
            let rt = get_setting(&db, "gdrive_refresh_token")?.unwrap_or_default();
            Some((cid, cs, rt))
        } else { None };
        (provider, s3_config, gdrive_creds)
    };
    app.emit("sync:progress", json!({ "profileId": profile_id, "status": "downloading" })).ok();
    let data = match provider.as_str() {
        "googledrive" => {
            let (cid, cs, rt) = gdrive_creds.as_ref().ok_or("GDrive credentials not found")?;
            let token = crate::gdrive::refresh_access_token(cid, cs, rt).await?;
            crate::gdrive::drive_download(&token, &remote_file_ref).await?
        }
        _ => {
            let config = s3_config.as_ref().ok_or("S3 config not found")?;
            crate::s3::s3_download(config, &remote_file_ref).await?
        }
    };

    // Decode .ezpsync format (or plain zip for legacy)
    let passphrase_hash = {
        let d = conn(&state)?;
        let stored = get_setting(&d, "sync_encrypted_key").ok().flatten().unwrap_or_default();
        override_passphrase
            .map(|p| sha2_digest(&p))
            .unwrap_or(stored)
    };

    let (zip_data, meta) = if data.len() >= 4 && &data[0..4] == b"EZPS" {
        eprintln!("[Sync] Detected .ezpsync format, decrypting...");
        read_ezpsync(&data, &passphrase_hash)?
    } else {
        eprintln!("[Sync] Plain zip format (legacy)");
        (data, json!({}))
    };

    // Save zip and extract to the existing profile directory (or create new)
    let (user_data_dir, existing_count) = {
        let db = conn(&state)?;
        let existing = db.query_row("SELECT user_data_dir FROM profiles WHERE id=?", [&profile_id], |r| r.get::<_, String>(0)).ok();
        let dir = existing.map(PathBuf::from).unwrap_or_else(|| state.profiles_dir.join(&profile_id));
        let count: i64 = db.query_row("SELECT COUNT(*) FROM profiles WHERE id=?", [&profile_id], |r| r.get(0)).unwrap_or(0);
        (dir, count)
    };

    eprintln!("[Sync] Restoring to: {}", user_data_dir.display());
    let tmp_zip = state.profiles_dir.join(format!("_restore_{}.zip", profile_id));
    fs::write(&tmp_zip, &zip_data).map_err(|e| e.to_string())?;

    // Remove old profile data, then extract backup
    let _ = fs::remove_dir_all(&user_data_dir);
    fs::create_dir_all(&user_data_dir).map_err(|e| e.to_string())?;
    unzip_dir(&tmp_zip, &user_data_dir)?;
    let _ = fs::remove_file(&tmp_zip);

    // Ensure profile exists in DB (restore from metadata or keep existing)
    {
        let name = meta.get("profileName").and_then(|v| v.as_str()).unwrap_or("Restored");
        let db = conn(&state)?;
        if existing_count == 0 {
            db.execute("INSERT INTO profiles (id,name,user_data_dir,startup_type,browser_version) VALUES (?1,?2,?3,'continue','latest')",
                rusqlite::params![profile_id, name, user_data_dir.to_string_lossy()]).map_err(|e| e.to_string())?;
        } else {
            db.execute("UPDATE profiles SET updated_at=datetime('now') WHERE id=?", [&profile_id]).map_err(|e| e.to_string())?;
        }
        db.execute("INSERT INTO sync_log (id,profile_id,provider,direction,status,remote_file) VALUES (?,?,?,?,?,?)",
            rusqlite::params![Uuid::new_v4().to_string(), profile_id, provider, "download", "success", remote_file_ref]).ok();
    }

    eprintln!("[Sync] Download OK: profile={} provider={}", profile_id, provider);
    app.emit("sync:progress", json!({ "profileId": profile_id, "status": "complete" })).ok();
    Ok(json!({ "success": true, "profileId": profile_id }))
}

#[tauri::command]
async fn sync_list_backups(state: State<'_, AppState>, profile_id: Option<String>, target_provider: Option<String>) -> ApiResult<Vec<Value>> {
    let _target_provider = target_provider;
    eprintln!("[Sync] List: profile_id={:?} target_provider={:?}", profile_id, _target_provider);
    let (provider, s3_config, gdrive_creds) = {
        let db = conn(&state)?;
        let provider = get_setting(&db, "sync_provider")?.unwrap_or_else(|| "s3".into());
        let s3_config = if provider != "googledrive" {
            Some(crate::s3::load_s3_config(&db)?)
        } else { None };
        let gdrive_creds = if provider == "googledrive" {
            let cid = get_setting(&db, "gdrive_client_id")?.unwrap_or_default();
            let cs = get_setting(&db, "gdrive_client_secret")?.unwrap_or_default();
            let rt = get_setting(&db, "gdrive_refresh_token")?.unwrap_or_default();
            Some((cid, cs, rt))
        } else { None };
        (provider, s3_config, gdrive_creds)
    };
    let s3_list_prefix = {
        let db = conn(&state)?;
        get_setting(&db, "s3_config").ok().flatten()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|v| v.get("prefix").and_then(|p| p.as_str().map(String::from)))
            .unwrap_or_else(|| "ezprofile/".into())
    };
    let prefix = match &profile_id {
        Some(pid) => format!("{}{}/", s3_list_prefix, pid),  // S3: {prefix}{profileId}/
        None => s3_list_prefix,  // List all: just the prefix
    };
    // For Google Drive, use .ezpsync to match backup files
    let gdrive_query = match &profile_id {
        Some(pid) => format!("{}_", pid),
        None => ".ezpsync".into(),
    };
    let entries: Vec<Value> = match provider.as_str() {
        "googledrive" => {
            let (cid, cs, rt) = gdrive_creds.as_ref().ok_or("GDrive credentials not found")?;
            let token = crate::gdrive::refresh_access_token(cid, cs, rt).await?;
            let files = crate::gdrive::drive_list(&token, &gdrive_query).await?;
            files.iter().map(|f| {
                let (pid, pname) = parse_ezpsync_name(&f.name);
                json!({
                    "id": f.id, "profileId": pid, "profileName": pname,
                    "createdAt": f.modified_time, "sizeBytes": f.size.unwrap_or(0),
                    "provider": "googledrive"
                })
            }).collect()
        }
        _ => {
            let config = s3_config.as_ref().ok_or("S3 config not found")?;
            let s3_entries = crate::s3::s3_list(config, &prefix).await?;
            s3_entries.iter().map(|e| {
                // S3 key: {prefix}{profileId}/{filename}.ezpsync
                // Extract profileId from path, filename for name
                let key_path = std::path::Path::new(&e.key);
                let filename = key_path.file_name().and_then(|n| n.to_str()).unwrap_or(&e.key);
                let pid_from_path = key_path.parent().and_then(|p| p.file_name()).and_then(|n| n.to_str()).unwrap_or("");
                let (pid, pname) = parse_ezpsync_name(filename);
                let final_pid = if pid.is_empty() { pid_from_path.to_string() } else { pid };
                json!({
                    "id": e.key, "profileId": final_pid, "profileName": pname,
                    "createdAt": e.last_modified, "sizeBytes": e.size,
                    "provider": "s3"
                })
            }).collect()
        }
    };
    eprintln!("[Sync] List result: {} entries", entries.len());
    for e in &entries {
        eprintln!("[Sync]   entry: id={} profileId={} provider={}",
            e.get("id").and_then(|v| v.as_str()).unwrap_or("?"),
            e.get("profileId").and_then(|v| v.as_str()).unwrap_or("?"),
            e.get("provider").and_then(|v| v.as_str()).unwrap_or("?"));
    }
    Ok(entries)
}

#[tauri::command]
async fn sync_upload_all(app: AppHandle, state: State<'_, AppState>) -> ApiResult<Value> {
    let profiles = profile_get_all(state.clone())?;
    eprintln!("[Sync] UploadAll: {} profiles", profiles.len());
    let mut total = 0u32;
    let mut failed = 0u32;
    for p in &profiles {
        match sync_upload_profile(app.clone(), state.clone(), p.id.clone(), Some(true), None).await {
            Ok(_) => total += 1,
            Err(_) => failed += 1,
        }
    }
    app.emit("sync:allComplete", json!({ "total": total, "failed": failed })).ok();
    Ok(json!({ "success": true, "total": total, "failed": failed }))
}

#[tauri::command]
async fn sync_backup_all_list_to_cloud(state: State<'_, AppState>) -> ApiResult<Value> {
    sync_list_backups(state, None, None).await
        .map(|entries| json!({ "success": true, "backups": entries }))
}

#[tauri::command]
async fn sync_restore_all_list_from_cloud(state: State<'_, AppState>, _passphrase: Option<String>) -> ApiResult<Value> {
    let entries = sync_list_backups(state, None, None).await?;
    Ok(json!({ "success": true, "count": entries.len(), "backups": entries }))
}

#[tauri::command]
async fn sync_restore_all(app: AppHandle, state: State<'_, AppState>) -> ApiResult<Value> {
    let _db = conn(&state)?;
    let entries = sync_list_backups(state.clone(), None, None).await?;
    let mut count = 0u32;
    let mut failed = 0u32;
    for entry in entries {
        let key = entry.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let pid = entry.get("profileId").and_then(|v| v.as_str()).unwrap_or("");
        if key.is_empty() || pid.is_empty() { continue; }
        match sync_download_profile(app.clone(), state.clone(), pid.to_string(), key.to_string(), None).await {
            Ok(_) => count += 1,
            Err(_) => failed += 1,
        }
    }
    app.emit("sync:allComplete", json!({ "count": count, "failed": failed })).ok();
    Ok(json!({ "success": true, "count": count, "failed": failed }))
}
#[tauri::command]
fn sync_set_auto_sync_on_close(state: State<AppState>, enabled: bool) -> ApiResult<Value> { set_setting(&conn(&state)?, "sync_auto_sync_on_close", if enabled { "true" } else { "false" })?; Ok(json!({ "success": true })) }
#[tauri::command]
fn sync_set_max_backups(state: State<AppState>, max_limit: i64) -> ApiResult<Value> { set_setting(&conn(&state)?, "sync_max_backups", &max_limit.to_string())?; Ok(json!({ "success": true })) }
#[tauri::command]
fn sync_get_sync_log(state: State<AppState>, profile_id: Option<String>) -> ApiResult<Vec<Value>> {
    let db = conn(&state)?;
    let sql = if profile_id.is_some() { "SELECT * FROM sync_log WHERE profile_id=? ORDER BY created_at DESC LIMIT 100" } else { "SELECT * FROM sync_log ORDER BY created_at DESC LIMIT 100" };
    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
    let rows = if let Some(pid) = profile_id { stmt.query_map([pid], sync_row).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>() } else { stmt.query_map([], sync_row).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>() };
    rows.map_err(|e| e.to_string())
}
fn sync_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Value> { Ok(json!({ "id": r.get::<_, String>("id")?, "profile_id": r.get::<_, String>("profile_id")?, "provider": r.get::<_, String>("provider")?, "direction": r.get::<_, String>("direction")?, "status": r.get::<_, String>("status")?, "error_message": r.get::<_, Option<String>>("error_message")?, "remote_file": r.get::<_, Option<String>>("remote_file")?, "size_bytes": r.get::<_, Option<i64>>("size_bytes")?, "created_at": r.get::<_, String>("created_at")? })) }
#[tauri::command]
async fn sync_delete_backup(state: State<'_, AppState>, remote_file_ref: String, _provider: Option<String>) -> ApiResult<Value> {
    eprintln!("[Sync] Delete: ref={}", remote_file_ref);
    let (provider, s3_config, gdrive_creds) = {
        let db = conn(&state)?;
        let provider = get_setting(&db, "sync_provider")?.unwrap_or_else(|| "s3".into());
        let s3_config = if provider != "googledrive" {
            Some(crate::s3::load_s3_config(&db)?)
        } else { None };
        let gdrive_creds = if provider == "googledrive" {
            let cid = get_setting(&db, "gdrive_client_id")?.unwrap_or_default();
            let cs = get_setting(&db, "gdrive_client_secret")?.unwrap_or_default();
            let rt = get_setting(&db, "gdrive_refresh_token")?.unwrap_or_default();
            Some((cid, cs, rt))
        } else { None };
        (provider, s3_config, gdrive_creds)
    };
    match provider.as_str() {
        "googledrive" => {
            let (cid, cs, rt) = gdrive_creds.as_ref().ok_or("GDrive credentials not found")?;
            let token = crate::gdrive::refresh_access_token(cid, cs, rt).await?;
            crate::gdrive::drive_delete(&token, &remote_file_ref).await?;
        }
        _ => {
            let config = s3_config.as_ref().ok_or("S3 config not found")?;
            crate::s3::s3_delete(config, &remote_file_ref).await?;
        }
    }
    Ok(json!({ "success": true }))
}
#[tauri::command]
async fn settings_export_backup(app: AppHandle, state: State<'_, AppState>, password: Option<String>) -> ApiResult<Value> {
    let file = app.dialog().file()
        .add_filter("EzProfile Backup", &["ezprofile"])
        .set_title("Export Settings Backup")
        .set_file_name("ezprofile-settings.ezprofile")
        .blocking_save_file();

    match file {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            let db = conn(&state)?;
            let mut backup = json!({
                "version": env!("CARGO_PKG_VERSION"),
                "exported_at": Utc::now().to_rfc3339(),
                "settings": {},
                "groups": [],
                "proxies": [],
                "extensions": [],
            });
            // Export settings table
            let mut stmt = db.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
            let settings: Vec<Value> = stmt.query_map([], |r| Ok(json!({ "key": r.get::<_, String>(0)?, "value": r.get::<_, String>(1)? })))
                .map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
            backup["settings"] = json!(settings);
            // Encrypt with password if provided
            let payload = serde_json::to_string(&backup).map_err(|e| e.to_string())?;
            let final_data = if let Some(pwd) = password {
                backend_encrypt(&payload, &sha2_digest(&pwd))?
            } else {
                payload.into_bytes()
            };
            fs::write(&path, final_data).map_err(|e| e.to_string())?;
            Ok(json!({ "success": true, "filePath": path.to_string_lossy() }))
        }
        None => Ok(json!({ "success": false, "canceled": true })),
    }
}

#[tauri::command]
async fn settings_import_backup(app: AppHandle, state: State<'_, AppState>, password: Option<String>) -> ApiResult<Value> {
    let file = app.dialog().file()
        .add_filter("EzProfile Backup", &["ezprofile", "enc", "json"])
        .set_title("Import Settings Backup")
        .blocking_pick_file();

    match file {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            let raw = fs::read(&path).map_err(|e| e.to_string())?;

            // Try to parse as JSON first
            let json_val: Value = serde_json::from_slice(&raw).map_err(|_| "Not a valid JSON backup file".to_string())?;

            // Detect format: Electron (.enc) or Tauri (.ezprofile)
            let settings_array: Vec<Value> = if json_val.get("salt").and_then(|s| s.as_str()).is_some()
                && json_val.get("iv").is_some()
                && json_val.get("tag").is_some()
                && json_val.get("ciphertext").is_some()
            {
                // === Electron format: { salt, iv, tag, ciphertext } ===
                let pwd = password.ok_or("Password is required for Electron-format backups")?;
                let salt = hex::decode(json_val["salt"].as_str().unwrap_or("")).map_err(|e| e.to_string())?;
                let iv = hex::decode(json_val["iv"].as_str().unwrap_or("")).map_err(|e| e.to_string())?;
                let tag = hex::decode(json_val["tag"].as_str().unwrap_or("")).map_err(|e| e.to_string())?;
                let ciphertext = hex::decode(json_val["ciphertext"].as_str().unwrap_or("")).map_err(|e| e.to_string())?;

                // Derive key using PBKDF2-HMAC-SHA256 (matching Electron's encryptionSvc)
                let mut key = [0u8; 32];
                pbkdf2::<Hmac<Sha256>>(pwd.as_bytes(), &salt, 100_000, &mut key)
                    .map_err(|e| format!("Key derivation failed: {:?}", e))?;

                // AES-256-GCM decrypt
                let aes_key = Key::<Aes256Gcm>::from_slice(&key);
                let cipher = Aes256Gcm::new(aes_key);
                let nonce = Nonce::from_slice(&iv);
                let mut combined = ciphertext.clone();
                combined.extend_from_slice(&tag);
                let plaintext = cipher.decrypt(nonce, combined.as_ref())
                    .map_err(|e| format!("Decryption failed: {:?} (wrong password?)", e))?;

                let settings_json: Value = serde_json::from_slice(&plaintext)
                    .map_err(|e| format!("Invalid settings JSON: {}", e))?;

                // Extract settings as key-value array + proxies
                let mut result: Vec<Value> = Vec::new();
                if let Some(obj) = settings_json.as_object() {
                    for (key, val) in obj {
                        if key == "__proxies__" {
                            // Proxies handled separately below
                        } else if val.is_string() {
                            result.push(json!({ "key": key, "value": val.as_str().unwrap_or("") }));
                        }
                    }
                }
                result
            } else {
                // === Tauri format: { version, settings, groups, proxies, extensions } ===
                // Check if encrypted (binary content wrapped in JSON)
                if let Some(settings) = json_val["settings"].as_array() {
                    settings.clone()
                } else if let Some(pwd) = password {
                    // Try decrypting raw bytes with password
                    let decrypted = backend_decrypt(&raw, &sha2_digest(&pwd))?;
                    let backup: Value = serde_json::from_slice(&decrypted)
                        .map_err(|e| format!("Invalid backup: {}", e))?;
                    backup["settings"].as_array().cloned().unwrap_or_default()
                } else {
                    return Err("Password required for encrypted backup".into());
                }
            };

            // Restore settings into DB
            let db = conn(&state)?;
            let mut count = 0u32;
            for s in &settings_array {
                if let (Some(key), Some(value)) = (s["key"].as_str(), s["value"].as_str()) {
                    db.execute(
                        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                        params![key, value],
                    ).ok();
                    count += 1;
                }
            }

            Ok(json!({ "success": true, "filePath": path.to_string_lossy(), "count": count }))
        }
        None => Ok(json!({ "success": false, "canceled": true })),
    }
}

pub fn sha2_digest(value: &str) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(value.as_bytes()))
}

fn browser_binary_path(browsers_dir: &Path, version: &str) -> PathBuf {
    let dir = browsers_dir.join(version);
    #[cfg(target_os = "windows")]
    return dir.join("chrome-win64").join("chrome.exe");
    #[cfg(target_os = "macos")]
    return dir.join("chrome-mac-x64").join("Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
    #[cfg(target_os = "linux")]
    return dir.join("chrome-linux64").join("chrome");
}

/// Write .ezpsync binary format (exactly matches Electron)
/// Format: Magic(4) + Version(1) + Salt(32) + IV(12) + Tag(16) + MetaLen(4) + MetaJSON + EncryptedZIP
fn write_ezpsync(zip_data: &[u8], passphrase_hash: &str, profile_id: &str, profile_name: &str) -> ApiResult<Vec<u8>> {
    let mut out = Vec::new();

    // Header
    out.extend_from_slice(b"EZPS");
    out.push(0x01); // version

    // PBKDF2 salt (32 bytes)
    let mut salt = [0u8; 32];
    rand::thread_rng().fill(&mut salt);
    out.extend_from_slice(&salt);

    // Derive key via PBKDF2-HMAC-SHA256 (matches Electron)
    let mut key = [0u8; 32];
    pbkdf2::<Hmac<Sha256>>(passphrase_hash.as_bytes(), &salt, 100_000, &mut key)
        .map_err(|e| format!("Key derivation failed: {:?}", e))?;

    // AES-256-GCM encrypt
    let mut iv = [0u8; 12];
    rand::thread_rng().fill(&mut iv);
    let aes_key = Key::<Aes256Gcm>::from_slice(&key);
    let cipher = Aes256Gcm::new(aes_key);
    let nonce = Nonce::from_slice(&iv);
    let ciphertext = cipher.encrypt(nonce, zip_data).map_err(|e| format!("Encrypt failed: {:?}", e))?;
    let tag = &ciphertext[ciphertext.len() - 16..];
    let ct = &ciphertext[..ciphertext.len() - 16];

    out.extend_from_slice(&iv);
    out.extend_from_slice(tag);

    // Metadata JSON (plaintext)
    let meta = json!({
        "profileId": profile_id,
        "profileName": profile_name,
        "createdAt": Utc::now().to_rfc3339(),
        "appVersion": env!("CARGO_PKG_VERSION"),
    });
    let meta_bytes = serde_json::to_vec(&meta).map_err(|e| e.to_string())?;
    let meta_len = meta_bytes.len() as u32;
    out.extend_from_slice(&meta_len.to_le_bytes());
    out.extend_from_slice(&meta_bytes);

    // Encrypted ZIP payload
    out.extend_from_slice(ct);

    Ok(out)
}

/// Read .ezpsync binary format, return (zip_data, metadata_json)
fn read_ezpsync(data: &[u8], passphrase_hash: &str) -> ApiResult<(Vec<u8>, Value)> {
    if data.len() < 69 || &data[0..4] != b"EZPS" {
        // Not an ezpsync file — return as plain zip
        let meta = json!({"profileId":"","profileName":"","createdAt":"","appVersion":""});
        return Ok((data.to_vec(), meta));
    }
    let version = data[4];
    if version != 0x01 {
        return Err(format!("Unsupported ezpsync version: {}", version));
    }
    let salt = &data[5..37];
    let iv = &data[37..49];
    let tag = &data[49..65];
    let meta_len = u32::from_le_bytes([data[65], data[66], data[67], data[68]]) as usize;
    let meta_start = 69;
    let meta_end = meta_start + meta_len;
    if data.len() < meta_end { return Err("ezpsync file too short".into()); }
    let meta: Value = serde_json::from_slice(&data[meta_start..meta_end]).map_err(|e| e.to_string())?;
    let ct = &data[meta_end..];

    // Derive key via PBKDF2
    let mut key = [0u8; 32];
    pbkdf2::<Hmac<Sha256>>(passphrase_hash.as_bytes(), salt, 100_000, &mut key)
        .map_err(|e| format!("Key derivation failed: {:?}", e))?;

    // AES-256-GCM decrypt
    let aes_key = Key::<Aes256Gcm>::from_slice(&key);
    let cipher = Aes256Gcm::new(aes_key);
    let nonce = Nonce::from_slice(iv);
    let mut combined = ct.to_vec();
    combined.extend_from_slice(tag);
    let zip_data = cipher.decrypt(nonce, combined.as_ref())
        .map_err(|e| format!("Decrypt failed (wrong passphrase?): {:?}", e))?;

    Ok((zip_data, meta))
}

/// Parse backup filename: "{UUID}_{profileName}_{sync_or_ts}.ezpsync"
/// UUID is 36 chars (with hyphens). Profile name can contain underscores.
fn parse_ezpsync_name(filename: &str) -> (String, String) {
    let name = filename.strip_suffix(".ezpsync").unwrap_or(filename);
    // UUID is exactly 36 characters at the start, followed by underscore
    if name.len() > 37 && &name[36..37] == "_" && name[8..9] == *"-" && name[13..14] == *"-" {
        let pid = name[..36].to_string();
        let rest = &name[37..];
        // Remove trailing _sync or _timestamp
        let pname = if let Some(pos) = rest.rfind("_sync") {
            rest[..pos].to_string()
        } else if let Some(pos) = rest.rfind('_') {
            let suffix = &rest[pos+1..];
            if suffix.chars().all(|c| c.is_ascii_digit()) {
                rest[..pos].to_string()
            } else {
                rest.to_string()
            }
        } else {
            rest.to_string()
        };
        (pid, pname.replace('_', " "))
    } else {
        (String::new(), name.replace('_', " "))
    }
}

/// Read extension manifest.json, resolving __MSG_*__ i18n placeholders (matches Electron)
fn read_extension_manifest(ext_dir: &Path) -> Value {
    let mut manifest: Value = fs::read_to_string(ext_dir.join("manifest.json")).ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(json!({}));

    // Resolve __MSG_name__ internationalization fields
    let locales_dir = ext_dir.join("_locales");
    if locales_dir.exists() {
        // Find best locale: default_locale → en/en_US → first available
        let default_locale = manifest.get("default_locale").and_then(|v| v.as_str());
        let messages = find_locale_messages(&locales_dir, default_locale);
        if let Some(messages) = messages {
            let resolve = |s: &str| -> String {
                let mut result = s.to_string();
                if !result.contains("__MSG_") { return result; }
                // Manual __MSG_key__ replacement (no regex crate needed)
                loop {
                    if let Some(start) = result.find("__MSG_") {
                        let after = &result[start + 6..];
                        if let Some(end) = after.find("__") {
                            let key = &after[..end];
                            let full_placeholder = &result[start..start + 8 + key.len()];
                            let replacement = messages.get(key)
                                .and_then(|v| v.get("message"))
                                .and_then(|v| v.as_str())
                                .or_else(|| {
                                    let lower = key.to_lowercase();
                                    messages.iter().find(|(k,_)| k.to_lowercase() == lower)
                                        .and_then(|(_, v)| v.get("message"))
                                        .and_then(|v| v.as_str())
                                })
                                .unwrap_or(key);
                            result = result.replace(full_placeholder, replacement);
                        } else { break; }
                    } else { break; }
                }
                result
            };
            if let Some(name) = manifest.get("name").and_then(|v| v.as_str()) {
                manifest["name"] = json!(resolve(name));
            }
            if let Some(desc) = manifest.get("description").and_then(|v| v.as_str()) {
                manifest["description"] = json!(resolve(desc));
            }
        }
    }
    manifest
}

/// Find and parse the best locale messages.json
fn find_locale_messages(locales_dir: &Path, default_locale: Option<&str>) -> Option<HashMap<String, Value>> {
    // Try default_locale
    if let Some(loc) = default_locale {
        let p = locales_dir.join(loc).join("messages.json");
        if let Ok(data) = fs::read_to_string(&p) {
            if let Ok(msgs) = serde_json::from_str(&data) { return Some(msgs); }
        }
    }
    // Fallback: en, en_US, en-us, or first available
    if let Ok(entries) = std::fs::read_dir(locales_dir) {
        let locales: Vec<String> = entries.filter_map(|e| e.ok())
            .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .filter_map(|e| e.file_name().to_str().map(String::from))
            .collect();
        let fallback = locales.iter().find(|l| l.to_lowercase() == "en")
            .or_else(|| locales.iter().find(|l| l.to_lowercase() == "en_us"))
            .or_else(|| locales.iter().find(|l| l.to_lowercase() == "en-us"))
            .or_else(|| locales.first());
        if let Some(loc) = fallback {
            let p = locales_dir.join(loc).join("messages.json");
            if let Ok(data) = fs::read_to_string(&p) {
                if let Ok(msgs) = serde_json::from_str(&data) { return Some(msgs); }
            }
        }
    }
    None
}

/// Find the best icon from manifest (prefer largest available)
fn find_best_icon(manifest: &Value, ext_dir: &Path) -> Option<String> {
    let icons = manifest.get("icons")?.as_object()?;
    let mut sizes: Vec<u32> = icons.keys().filter_map(|k| k.parse().ok()).collect();
    sizes.sort_by(|a, b| b.cmp(a)); // largest first
    for size in sizes {
        let icon_file = icons.get(&size.to_string())?.as_str()?;
        let icon_path = ext_dir.join(icon_file);
        if icon_path.exists() {
            return Some(icon_path.to_string_lossy().to_string());
        }
    }
    None
}

/// Parse CRX3 and extract to directory (from file path)
fn read_crx_and_extract(src: &Path, dest: &Path) -> ApiResult<()> {
    let data = fs::read(src).map_err(|e| e.to_string())?;
    let zip_data = parse_crx3(&data)?;
    let tmp_zip = dest.parent().unwrap_or(dest).join(format!("_tmp_{}.zip", Uuid::new_v4()));
    fs::write(&tmp_zip, zip_data).map_err(|e| e.to_string())?;
    let result = unzip_dir(&tmp_zip, dest);
    let _ = fs::remove_file(&tmp_zip);
    result
}

/// Parse CRX3 and extract to directory (from bytes)
fn read_crx_and_extract_bytes(data: &[u8], dest: &Path) -> ApiResult<()> {
    let zip_data = parse_crx3(data)?;
    let tmp_zip = dest.parent().unwrap_or(dest).join(format!("_tmp_{}.zip", Uuid::new_v4()));
    fs::write(&tmp_zip, zip_data).map_err(|e| e.to_string())?;
    let result = unzip_dir(&tmp_zip, dest);
    let _ = fs::remove_file(&tmp_zip);
    result
}

/// Parse CRX3 format: "Cr24"(4) + version(4 LE) + header_len(4 LE) → rest is zip
fn parse_crx3(data: &[u8]) -> ApiResult<Vec<u8>> {
    if data.len() < 16 || &data[0..4] != b"Cr24" {
        return Err("Invalid CRX format".into());
    }
    let header_len = u32::from_le_bytes([data[8], data[9], data[10], data[11]]) as usize;
    let zip_start = 12 + header_len;
    if data.len() <= zip_start {
        return Err("CRX data too short".into());
    }
    Ok(data[zip_start..].to_vec())
}

// ── CloakBrowser Hardware Fingerprint (matching Electron's fingerprint-utils.ts) ──

struct HardwarePreset {
    #[allow(dead_code)] name: &'static str,
    platform: &'static str,
    gpu_vendor: &'static str,
    gpu_renderer: &'static str,
    screen_width: &'static str,
    screen_height: &'static str,
    hardware_concurrency: &'static str,
    device_memory: &'static str,
}

static HARDWARE_PRESETS: &[HardwarePreset] = &[
    // Windows Desktop — NVIDIA
    HardwarePreset { name: "RTX 4090 · 4K", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 4090", screen_width: "3840", screen_height: "2160", hardware_concurrency: "24", device_memory: "8" },
    HardwarePreset { name: "RTX 4090 · 1440p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 4090", screen_width: "2560", screen_height: "1440", hardware_concurrency: "16", device_memory: "8" },
    HardwarePreset { name: "RTX 4080 · 1440p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 4080", screen_width: "2560", screen_height: "1440", hardware_concurrency: "16", device_memory: "8" },
    HardwarePreset { name: "RTX 4070 Ti · 1440p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 4070 Ti", screen_width: "2560", screen_height: "1440", hardware_concurrency: "12", device_memory: "8" },
    HardwarePreset { name: "RTX 4070 · 1440p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 4070", screen_width: "2560", screen_height: "1440", hardware_concurrency: "12", device_memory: "8" },
    HardwarePreset { name: "RTX 4070 · 1080p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 4070", screen_width: "1920", screen_height: "1080", hardware_concurrency: "8", device_memory: "8" },
    HardwarePreset { name: "RTX 4060 Ti · 1080p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 4060 Ti", screen_width: "1920", screen_height: "1080", hardware_concurrency: "8", device_memory: "8" },
    HardwarePreset { name: "RTX 4060 · 1080p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 4060", screen_width: "1920", screen_height: "1080", hardware_concurrency: "8", device_memory: "8" },
    HardwarePreset { name: "RTX 3090 · 1440p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 3090", screen_width: "2560", screen_height: "1440", hardware_concurrency: "16", device_memory: "8" },
    HardwarePreset { name: "RTX 3080 · 1440p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 3080", screen_width: "2560", screen_height: "1440", hardware_concurrency: "12", device_memory: "8" },
    HardwarePreset { name: "GTX 1660 · 1080p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce GTX 1660", screen_width: "1920", screen_height: "1080", hardware_concurrency: "6", device_memory: "4" },
    HardwarePreset { name: "GTX 1650 · 1080p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce GTX 1650", screen_width: "1920", screen_height: "1080", hardware_concurrency: "4", device_memory: "4" },
    // Windows Desktop — AMD
    HardwarePreset { name: "RX 7900 · 1440p", platform: "windows", gpu_vendor: "Google Inc. (AMD)", gpu_renderer: "ANGLE (AMD Radeon RX 7900 XTX)", screen_width: "2560", screen_height: "1440", hardware_concurrency: "16", device_memory: "8" },
    HardwarePreset { name: "RX 7800 · 1440p", platform: "windows", gpu_vendor: "Google Inc. (AMD)", gpu_renderer: "ANGLE (AMD Radeon RX 7800 XT)", screen_width: "2560", screen_height: "1440", hardware_concurrency: "12", device_memory: "8" },
    HardwarePreset { name: "RX 6700 · 1080p", platform: "windows", gpu_vendor: "Google Inc. (AMD)", gpu_renderer: "ANGLE (AMD Radeon RX 6700 XT)", screen_width: "1920", screen_height: "1080", hardware_concurrency: "8", device_memory: "8" },
    // Windows Laptop — NVIDIA
    HardwarePreset { name: "Laptop RTX 4070 · 1440p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 4070 Laptop GPU", screen_width: "2560", screen_height: "1440", hardware_concurrency: "12", device_memory: "8" },
    HardwarePreset { name: "Laptop RTX 4060 · 1080p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 4060 Laptop GPU", screen_width: "1920", screen_height: "1080", hardware_concurrency: "8", device_memory: "8" },
    HardwarePreset { name: "Laptop RTX 3060 · 1080p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 3060 Laptop GPU", screen_width: "1920", screen_height: "1080", hardware_concurrency: "8", device_memory: "4" },
    HardwarePreset { name: "Laptop RTX 3050 · 1080p", platform: "windows", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 3050 Laptop GPU", screen_width: "1920", screen_height: "1080", hardware_concurrency: "6", device_memory: "4" },
    // Windows — Integrated
    HardwarePreset { name: "Intel UHD · 1080p", platform: "windows", gpu_vendor: "Google Inc. (Intel)", gpu_renderer: "ANGLE (Intel(R) UHD Graphics)", screen_width: "1920", screen_height: "1080", hardware_concurrency: "4", device_memory: "2" },
    HardwarePreset { name: "Intel Iris Xe · 1440p", platform: "windows", gpu_vendor: "Google Inc. (Intel)", gpu_renderer: "ANGLE (Intel(R) Iris(R) Xe Graphics)", screen_width: "2560", screen_height: "1440", hardware_concurrency: "8", device_memory: "4" },
    // macOS
    HardwarePreset { name: "Mac M3 · 1440p", platform: "darwin", gpu_vendor: "Apple", gpu_renderer: "Apple M3", screen_width: "2560", screen_height: "1440", hardware_concurrency: "8", device_memory: "4" },
    HardwarePreset { name: "Mac M2 · 1440p", platform: "darwin", gpu_vendor: "Apple", gpu_renderer: "Apple M2", screen_width: "2560", screen_height: "1440", hardware_concurrency: "8", device_memory: "4" },
    HardwarePreset { name: "Mac M1 · 1440p", platform: "darwin", gpu_vendor: "Apple", gpu_renderer: "Apple M1", screen_width: "2560", screen_height: "1440", hardware_concurrency: "8", device_memory: "4" },
    HardwarePreset { name: "Mac Intel · 1440p", platform: "darwin", gpu_vendor: "AMD", gpu_renderer: "AMD Radeon Pro 5500M", screen_width: "2560", screen_height: "1440", hardware_concurrency: "8", device_memory: "4" },
    // Linux
    HardwarePreset { name: "Linux NVIDIA · 1440p", platform: "linux", gpu_vendor: "NVIDIA Corporation", gpu_renderer: "NVIDIA GeForce RTX 3080", screen_width: "2560", screen_height: "1440", hardware_concurrency: "12", device_memory: "8" },
    HardwarePreset { name: "Linux AMD · 1080p", platform: "linux", gpu_vendor: "AMD", gpu_renderer: "AMD Radeon RX 6800 XT", screen_width: "1920", screen_height: "1080", hardware_concurrency: "8", device_memory: "8" },
    HardwarePreset { name: "Linux Intel · 1080p", platform: "linux", gpu_vendor: "Intel", gpu_renderer: "Mesa Intel(R) UHD Graphics", screen_width: "1920", screen_height: "1080", hardware_concurrency: "4", device_memory: "2" },
];

/// djb2 hash — matches Electron's djb2Hash exactly
fn djb2_hash(s: &str) -> u32 {
    let mut hash: u32 = 5381;
    for b in s.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(b as u32);
    }
    hash
}

/// Resolve hardware from seed — matches Electron's resolveHardwareFromSeed
fn resolve_hardware_from_seed(seed: &str, platform_filter: &str) -> Option<&'static HardwarePreset> {
    if HARDWARE_PRESETS.is_empty() { return None; }
    let pool: Vec<&HardwarePreset> = if platform_filter.is_empty() {
        HARDWARE_PRESETS.iter().collect()
    } else {
        HARDWARE_PRESETS.iter().filter(|p| p.platform == platform_filter).collect()
    };
    let effective = if pool.is_empty() { HARDWARE_PRESETS.iter().collect::<Vec<_>>() } else { pool };
    let idx = djb2_hash(seed) as usize % effective.len();
    Some(effective[idx])
}

fn chrome_platform() -> &'static str {
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    { "linux64" }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    { "linux64" } // Chrome for Testing doesn't have linux-arm64; fall back to linux64 binary
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    { "mac-x64" }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    { "mac-arm64" }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    { "win64" }
    #[cfg(all(target_os = "windows", target_arch = "x86"))]
    { "win32" }
    #[cfg(not(any(
        all(target_os = "linux", any(target_arch = "x86_64", target_arch = "aarch64")),
        all(target_os = "macos", any(target_arch = "x86_64", target_arch = "aarch64")),
        all(target_os = "windows", any(target_arch = "x86_64", target_arch = "x86"))
    )))]
    { "unsupported" }
}

fn find_chrome_binary(extract_dir: &Path, _platform: &str) -> Option<PathBuf> {
    let binary_name = if cfg!(target_os = "windows") { "chrome.exe" } else { "chrome" };
    for entry in walkdir::WalkDir::new(extract_dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_name() == binary_name && entry.path().is_file() {
            return Some(entry.path().to_path_buf());
        }
    }
    None
}

/// Migrate Electron settings schema to Tauri format on first launch
fn migrate_settings_schema(db: &Connection, _legacy_dir: &Path) {
    // 1. Combine individual s3_* keys into single s3_config JSON
    //    Note: Electron encrypts access_key_id & secret_access_key with machine key.
    //    These are hex values we cannot decrypt — import as empty so user re-enters.
    let s3_keys = [
        "s3_access_key_id", "s3_secret_access_key", "s3_bucket",
        "s3_region", "s3_endpoint", "s3_prefix",
    ];
    let mut s3_config = json!({});
    let mut has_any_s3 = false;
    for key in &s3_keys {
        if let Ok(Some(val)) = get_setting(db, key) {
            let tauri_key = match *key {
                "s3_access_key_id" => "accessKeyId",
                "s3_secret_access_key" => "secretAccessKey",
                "s3_bucket" => "bucket",
                "s3_region" => "region",
                "s3_endpoint" => "endpoint",
                "s3_prefix" => "prefix",
                _ => continue,
            };
            // Electron encrypts these — don't import encrypted hex, user must re-enter
            if *key == "s3_access_key_id" || *key == "s3_secret_access_key" {
                s3_config[tauri_key] = json!(""); // Clear encrypted value
            } else {
                s3_config[tauri_key] = json!(val);
            }
            has_any_s3 = true;
        }
    }
    if has_any_s3 {
        s3_config["usePathStyle"] = json!(true);
        let _ = set_setting(db, "s3_config", &s3_config.to_string());
        // Delete old individual keys
        for key in &s3_keys {
            let _ = db.execute("DELETE FROM settings WHERE key=?", [key]);
        }
    }

    // 2. Remove gdrive_client_secret_enc (Electron-encrypted, cannot decrypt)
    //    User must re-enter the real Client Secret in Tauri settings
    if get_setting(db, "gdrive_client_secret_enc").ok().flatten().is_some() {
        let _ = db.execute("DELETE FROM settings WHERE key='gdrive_client_secret_enc'", []);
        // Don't migrate — encrypted value is useless, user must re-enter
    }

    // 3. Migrate gdrive_token_json → gdrive_refresh_token if possible
    //    (Electron encrypts token JSON; can't decrypt here, user must re-auth)
    //    Just note the key exists so frontend shows "connected"
    if let Ok(Some(_token)) = get_setting(db, "gdrive_token_json") {
        // Can't decrypt, but mark as having had a token
        // User will need to re-authenticate
        let _ = set_setting(db, "gdrive_had_token", "true");
    }

    // 4. Migrate gdrive_folder_id if present
    if let Ok(Some(folder_id)) = get_setting(db, "gdrive_folder_id") {
        let _ = set_setting(db, "gdrive_folder_id", &folder_id);
    }
}

fn sanitize(s: &str) -> String {
    s.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect()
}

fn copy_dir_filtered(src: &Path, dst: &Path, ignore: &[&str]) -> ApiResult<()> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    if !src.exists() { return Ok(()); }
    for entry in WalkDir::new(src).into_iter().filter_map(Result::ok) {
        let rel = entry.path().strip_prefix(src).map_err(|e| e.to_string())?;
        if rel.as_os_str().is_empty() || ignore.iter().any(|i| rel.to_string_lossy().contains(i)) { continue; }
        let target = dst.join(rel);
        if entry.file_type().is_dir() { fs::create_dir_all(&target).map_err(|e| e.to_string())?; } else { if let Some(p) = target.parent() { fs::create_dir_all(p).map_err(|e| e.to_string())?; } fs::copy(entry.path(), target).map_err(|e| e.to_string())?; }
    }
    Ok(())
}

fn zip_dir(src: &Path, dst: &Path) -> ApiResult<()> {
    let file = fs::File::create(dst).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let opts = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    // EXACT MATCH: Electron's IGNORE_FOLDERS + IGNORE_FILES from backup-manager.ts
    let ignore = [
        "Cache", "Code Cache", "GPUCache", "Service Worker/CacheStorage",
        "Sync Data", "BrowserMetrics", "ShaderCache", "GrShaderCache",
        "GraphiteDawnCache", "SingletonLock", "SingletonSocket",
        "SingletonCookie", "DevToolsActivePort",
    ];
    for entry in WalkDir::new(src).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        let rel = path.strip_prefix(src).map_err(|e| e.to_string())?;
        if rel.as_os_str().is_empty() || ignore.iter().any(|i| rel.to_string_lossy().contains(i)) { continue; }
        let name = rel.to_string_lossy().replace('\\', "/");
        if entry.file_type().is_dir() { zip.add_directory(name, opts).map_err(|e| e.to_string())?; } else { zip.start_file(name, opts).map_err(|e| e.to_string())?; let mut f = fs::File::open(path).map_err(|e| e.to_string())?; let mut buf = Vec::new(); f.read_to_end(&mut buf).map_err(|e| e.to_string())?; zip.write_all(&buf).map_err(|e| e.to_string())?; }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn unzip_dir(src: &Path, dst: &Path) -> ApiResult<()> {
    let file = fs::File::open(src).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let out_path = dst.join(entry.name());
        if entry.name().ends_with('/') {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out = fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn backend_encrypt(data: &str, key_hex: &str) -> ApiResult<Vec<u8>> {
    let key_bytes = hex::decode(key_hex).map_err(|e| e.to_string())?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, data.as_bytes()).map_err(|e| e.to_string())?;
    let mut result = nonce_bytes.to_vec();
    result.extend(ciphertext);
    Ok(result)
}

pub fn backend_decrypt(data: &[u8], key_hex: &str) -> ApiResult<Vec<u8>> {
    let key_bytes = hex::decode(key_hex).map_err(|e| e.to_string())?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    if data.len() < 12 { return Err("Invalid encrypted data".into()); }
    let nonce = Nonce::from_slice(&data[..12]);
    cipher.decrypt(nonce, &data[12..]).map_err(|e| e.to_string())
}

// --- CDP (Chrome DevTools Protocol) helpers ---

fn find_free_port() -> ApiResult<u16> {
    TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())
        .and_then(|l| l.local_addr().map(|a| a.port()).map_err(|e| e.to_string()))
}

fn get_running_debug_port(state: &AppState, profile_id: &str) -> ApiResult<u16> {
    let registry = state.processes.children.lock().unwrap();
    let instance = registry.get(profile_id)
        .ok_or_else(|| "Profile is not running. Launch the profile first.".to_string())?;
    if let Ok(mut child) = instance.child.lock() {
        if child.try_wait().ok().flatten().is_some() {
            return Err("Profile process has exited.".into());
        }
    }
    Ok(instance.debug_port)
}

async fn get_cdp_websocket_url(port: u16) -> ApiResult<String> {
    let url = format!("http://127.0.0.1:{}/json/version", port);
    for _ in 0..30 {
        match reqwest::get(&url).await {
            Ok(resp) => {
                let json: Value = resp.json().await.map_err(|e| e.to_string())?;
                if let Some(ws_url) = json["webSocketDebuggerUrl"].as_str() {
                    return Ok(ws_url.to_string());
                }
                return Err("webSocketDebuggerUrl not found in CDP response".into());
            }
            Err(_) => {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
        }
    }
    Err("CDP endpoint not available after 30 retries".into())
}

async fn cdp_send(
    write: &mut (impl SinkExt<Message> + Unpin),
    read: &mut (impl StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin),
    method: &str,
    params: Value,
) -> ApiResult<Value> {
    use std::sync::atomic::{AtomicU32, Ordering};
    static NEXT_ID: AtomicU32 = AtomicU32::new(1);
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let cmd = json!({ "id": id, "method": method, "params": params });
    write.send(Message::Text(cmd.to_string())).await
        .map_err(|_| "CDP send error".to_string())?;
    while let Some(msg) = read.next().await {
        let msg = msg.map_err(|e| format!("CDP recv error: {}", e))?;
        if let Message::Text(text) = msg {
            let response: Value = serde_json::from_str(&text).map_err(|e| format!("CDP parse error: {}", e))?;
            if response.get("id").and_then(|v| v.as_u64()) == Some(id as u64) {
                return Ok(response["result"].clone());
            }
        }
    }
    Err("CDP WebSocket closed before response".into())
}

