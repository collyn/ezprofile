use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::Duration;

use crate::backend::ApiResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleTokenResponse {
    pub access_token: String,
    pub expires_in: u64,
    pub token_type: String,
    pub scope: Option<String>,
    pub refresh_token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GDriveFileEntry {
    pub id: String,
    pub name: String,
    pub size: Option<i64>,
    #[serde(rename = "modifiedTime")]
    pub modified_time: Option<String>,
}

// ─── OAuth Flow ────────────────────────────────────────────────────────────────

pub async fn oauth_start(
    client_id: &str,
    client_secret: &str,
    app_handle: &tauri::AppHandle,
) -> ApiResult<GoogleTokenResponse> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind listener: {}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
         client_id={}&\
         redirect_uri=http://localhost:{}&\
         response_type=code&\
         scope=https://www.googleapis.com/auth/drive.file&\
         access_type=offline&\
         prompt=consent",
        urlencoding::encode(client_id),
        port
    );

    // Open browser
    tauri_plugin_opener::open_url(auth_url, None::<&str>).map_err(|e| e.to_string())?;
    let _ = app_handle;

    // Run blocking TCP accept on a dedicated thread to not block tokio
    let auth_code = tokio::task::spawn_blocking(move || {
        accept_auth_callback(&listener)
    }).await.map_err(|e| format!("OAuth callback thread panicked: {}", e))??;
    eprintln!("[OAuth] Got auth code, exchanging for tokens...");

    // Exchange code for tokens — use curl to avoid TLS compatibility issues with reqwest+rustls
    let redirect_uri = format!("http://localhost:{}", port);
    eprintln!("[OAuth] Token exchange: code_len={} redirect_uri={}", auth_code.len(), redirect_uri);

    let output = std::process::Command::new("curl")
        .args(["-s", "-X", "POST", "https://oauth2.googleapis.com/token",
            "-d", &format!("grant_type=authorization_code&code={}&client_id={}&client_secret={}&redirect_uri={}",
                urlencoding::encode(&auth_code),
                urlencoding::encode(client_id),
                urlencoding::encode(client_secret),
                urlencoding::encode(&redirect_uri),
            ),
            "--connect-timeout", "15",
            "--max-time", "20",
        ])
        .output()
        .map_err(|e| format!("Failed to run curl: {}", e))?;

    if !output.status.success() {
        return Err(format!("curl failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let body = String::from_utf8_lossy(&output.stdout);
    eprintln!("[OAuth] Token response: {}", &body[..body.len().min(200)]);

    let resp: Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse token response: {} — body: {}", e, &body[..body.len().min(500)]))?;

    if resp.get("error").is_some() {
        return Err(format!("Token exchange error: {}", resp["error_description"].as_str().unwrap_or("unknown")));
    }

    let token = GoogleTokenResponse {
        access_token: resp["access_token"].as_str().unwrap_or("").to_string(),
        expires_in: resp["expires_in"].as_u64().unwrap_or(3600),
        token_type: resp["token_type"].as_str().unwrap_or("Bearer").to_string(),
        scope: resp["scope"].as_str().map(String::from),
        refresh_token: resp["refresh_token"].as_str().map(String::from),
    };

    eprintln!("[OAuth] Got access token (len={}), has refresh: {}", token.access_token.len(), token.refresh_token.is_some());
    Ok(token)
}

pub async fn perform_google_auth(
    client_id: &str,
    client_secret: &str,
    app_handle: &tauri::AppHandle,
) -> ApiResult<(GoogleTokenResponse, Value)> {
    eprintln!("[GDrive] Starting OAuth flow...");
    let token = oauth_start(client_id, client_secret, app_handle).await?;
    eprintln!("[GDrive] OAuth complete, has_refresh={}", token.refresh_token.is_some());
    let result = json!({
        "success": true,
        "accessToken": token.access_token,
        "expiresIn": token.expires_in,
        "hasRefreshToken": token.refresh_token.is_some(),
    });
    Ok((token, result))
}

fn accept_auth_callback(listener: &TcpListener) -> ApiResult<String> {
    eprintln!("[OAuth] Waiting for HTTP connection...");
    let (mut stream, addr) = listener
        .accept()
        .map_err(|e| format!("OAuth callback accept failed: {}", e))?;
    eprintln!("[OAuth] Connection from {}", addr);

    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .ok();

    let mut reader = BufReader::new(&mut stream);
    let mut request_line = String::new();
    reader
        .read_line(&mut request_line)
        .map_err(|e| format!("Failed to read request: {}", e))?;

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let uri = parts.get(1).ok_or("Invalid HTTP request")?;

    // Send success page
    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html><body><p>Authorization successful! You can close this window.</p></body></html>";
    stream.write_all(response.as_bytes()).ok();
    stream.flush().ok();

    let query_start = uri.find('?').ok_or_else(|| "No query string in redirect. Did you deny access?".to_string())?;
    let query = &uri[query_start + 1..];

    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next().unwrap_or("");
        let val = parts.next().unwrap_or("");
        if key == "code" {
            let decoded = urlencoding::decode(val)
                .map_err(|e| format!("Failed to decode auth code: {}", e))?;
            return Ok(decoded.into_owned());
        }
        if key == "error" {
            return Err(format!("Authorization denied: {}", val));
        }
    }

    Err("Authorization code not found in redirect".into())
}

// ─── Token Refresh ─────────────────────────────────────────────────────────────

/// Refresh an access token using stored credentials (no DB access).
pub async fn refresh_access_token(
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> ApiResult<String> {
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "refresh_token"),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("refresh_token", refresh_token),
    ];

    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed ({}): {}", status, body));
    }

    let token: GoogleTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse token error: {}", e))?;

    Ok(token.access_token)
}

/// Load credentials from DB and refresh (for callers that have a Connection).
#[allow(dead_code)]
pub async fn get_access_token(db: &Connection) -> ApiResult<String> {
    let (client_id, client_secret, refresh_token) = {
        let cid = crate::backend::get_setting(db, "gdrive_client_id")?
            .ok_or_else(|| "Google Client ID not set".to_string())?;
        let cs = crate::backend::get_setting(db, "gdrive_client_secret")?
            .ok_or_else(|| "Google Client Secret not set".to_string())?;
        let rt = crate::backend::get_setting(db, "gdrive_refresh_token")?
            .ok_or_else(|| "Google Drive not connected. Please authenticate first.".to_string())?;
        (cid, cs, rt)
    };
    refresh_access_token(&client_id, &client_secret, &refresh_token).await
}

// ─── Drive API ─────────────────────────────────────────────────────────────────

/// Get or create the "EzProfile Sync" folder, return its ID.
async fn get_or_create_sync_folder(access_token: &str) -> ApiResult<String> {
    // Search for existing folder
    let query = urlencoding::encode("name = 'EzProfile Sync' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    let url = format!(
        "https://www.googleapis.com/drive/v3/files?q={}&fields=files(id,name)",
        query
    );
    let client = reqwest::Client::new();
    let resp = client.get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        let body: Value = resp.json().await.unwrap_or_default();
        if let Some(files) = body["files"].as_array() {
            if let Some(folder) = files.first() {
                if let Some(id) = folder["id"].as_str() {
                    return Ok(id.to_string());
                }
            }
        }
    }
    // Create folder
    let metadata = json!({
        "name": "EzProfile Sync",
        "mimeType": "application/vnd.google-apps.folder"
    });
    let resp = client.post("https://www.googleapis.com/drive/v3/files")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", "application/json")
        .body(metadata.to_string())
        .send().await.map_err(|e| format!("Failed to create folder: {}", e))?;
    let body: Value = resp.json().await.unwrap_or_default();
    body["id"].as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Failed to create EzProfile Sync folder".into())
}

pub async fn drive_upload(access_token: &str, key: &str, data: Vec<u8>) -> ApiResult<String> {
    let folder_id = get_or_create_sync_folder(access_token).await?;
    let boundary = format!("ezprofile_bdr_{}", uuid::Uuid::new_v4());
    let metadata = json!({ "name": key, "parents": [folder_id] });

    let mut body = Vec::new();
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
    body.extend_from_slice(serde_json::to_string(&metadata).unwrap().as_bytes());
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
    body.extend_from_slice(&data);
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    let resp = reqwest::Client::new()
        .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", format!("multipart/related; boundary={}", boundary))
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Drive upload failed: {}", e))?;

    let status = resp.status();
    let response_body: Value = resp.json().await.unwrap_or_default();

    if status.is_success() {
        response_body["id"].as_str().map(|s| s.to_string())
            .ok_or_else(|| "Upload response missing file ID".into())
    } else {
        Err(format!("Drive upload error ({}): {}", status, response_body))
    }
}

pub async fn drive_download(access_token: &str, file_id: &str) -> ApiResult<Vec<u8>> {
    let url = format!("https://www.googleapis.com/drive/v3/files/{}?alt=media", file_id);
    let resp = reqwest::Client::new()
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Drive download failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Drive download error ({}): {}", status, body));
    }

    Ok(resp.bytes().await.map_err(|e| e.to_string())?.to_vec())
}

pub async fn drive_list(access_token: &str, prefix: &str) -> ApiResult<Vec<GDriveFileEntry>> {
    let query_str = format!("name contains '{}' and trashed = false", prefix);
    let query = urlencoding::encode(&query_str);
    let url = format!(
        "https://www.googleapis.com/drive/v3/files?q={}&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime desc",
        query
    );

    let resp = reqwest::Client::new()
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Drive list failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Drive list error ({}): {}", status, body));
    }

    let body: Value = resp.json().await.unwrap_or_default();
    let entries: Vec<GDriveFileEntry> = body["files"]
        .as_array().cloned().unwrap_or_default()
        .iter()
        .map(|f| GDriveFileEntry {
            id: f["id"].as_str().unwrap_or("").into(),
            name: f["name"].as_str().unwrap_or("").into(),
            size: f["size"].as_str().and_then(|s| s.parse().ok()),
            modified_time: f["modifiedTime"].as_str().map(|s| s.to_string()),
        })
        .collect();

    Ok(entries)
}

pub async fn drive_delete(access_token: &str, file_id: &str) -> ApiResult<()> {
    let url = format!("https://www.googleapis.com/drive/v3/files/{}", file_id);
    let resp = reqwest::Client::new()
        .delete(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Drive delete failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Drive delete error ({}): {}", status, body));
    }
    Ok(())
}
