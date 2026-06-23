use rusqlite::Connection;
use s3::bucket::Bucket;
use s3::creds::Credentials;
use s3::region::Region;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;

use crate::backend::ApiResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Config {
    pub endpoint: String,
    #[serde(rename = "accessKeyId")]
    pub access_key_id: String,
    #[serde(rename = "secretAccessKey")]
    pub secret_access_key: String,
    pub region: String,
    pub bucket: String,
    #[serde(default)]
    #[serde(rename = "usePathStyle")]
    pub use_path_style: bool,
}

#[derive(Debug, Serialize)]
pub struct BackupEntry {
    pub key: String,
    pub size: i64,
    #[serde(rename = "lastModified")]
    pub last_modified: String,
}

pub fn load_s3_config(db: &Connection) -> ApiResult<S3Config> {
    let json_str = crate::backend::get_setting(db, "s3_config")?
        .ok_or_else(|| "S3 not configured. Please set up S3 in Sync Settings.".to_string())?;
    serde_json::from_str::<S3Config>(&json_str)
        .map_err(|e| format!("Invalid S3 config: {}", e))
}

fn build_s3_bucket(config: &S3Config) -> ApiResult<Box<Bucket>> {
    let credentials = Credentials::new(
        Some(&config.access_key_id),
        Some(&config.secret_access_key),
        None, None, None,
    ).map_err(|e| format!("S3 credentials error: {}", e))?;

    let region = Region::Custom {
        region: config.region.clone(),
        endpoint: config.endpoint.clone(),
    };

    let mut bucket = Bucket::new(&config.bucket, region, credentials)
        .map_err(|e| format!("Failed to create S3 bucket: {}", e))?;

    if config.use_path_style {
        bucket.set_path_style();
    }

    // Use virtual-hosted-style otherwise
    Ok(bucket)
}

pub async fn s3_test_connection(config: &S3Config) -> ApiResult<Value> {
    let bucket = build_s3_bucket(config)?;
    let results = bucket
        .list("/".to_string(), Some("/".to_string()))
        .await
        .map_err(|e| format!("S3 connection failed: {}", e))?;

    let count = results.iter().flat_map(|r| r.contents.iter()).count();
    Ok(json!({ "success": true, "bucket": config.bucket, "objectCount": count }))
}

pub async fn s3_upload(config: &S3Config, key: &str, data: &[u8]) -> ApiResult<String> {
    let bucket = build_s3_bucket(config)?;
    let response = bucket
        .put_object(key, data)
        .await
        .map_err(|e| format!("S3 upload failed: {}", e))?;

    if response.status_code() >= 200 && response.status_code() < 300 {
        Ok(key.to_string())
    } else {
        Err(format!("S3 upload returned status {}", response.status_code()))
    }
}

pub async fn s3_upload_file(config: &S3Config, key: &str, file_path: &Path) -> ApiResult<String> {
    let data = std::fs::read(file_path).map_err(|e| format!("Failed to read file: {}", e))?;
    s3_upload(config, key, &data).await
}

pub async fn s3_download(config: &S3Config, key: &str) -> ApiResult<Vec<u8>> {
    let bucket = build_s3_bucket(config)?;
    let response = bucket
        .get_object(key)
        .await
        .map_err(|e| format!("S3 download failed: {}", e))?;

    if response.status_code() >= 200 && response.status_code() < 300 {
        Ok(response.to_vec())
    } else {
        Err(format!("S3 download returned status {}", response.status_code()))
    }
}

pub async fn s3_list(config: &S3Config, prefix: &str) -> ApiResult<Vec<BackupEntry>> {
    let bucket = build_s3_bucket(config)?;
    // No delimiter — list ALL objects recursively to find .ezpsync files
    let results = bucket
        .list(prefix.to_string(), None::<String>)
        .await
        .map_err(|e| format!("S3 list failed: {}", e))?;

    let entries: Vec<BackupEntry> = results
        .iter()
        .flat_map(|r| r.contents.iter())
        .filter(|c| c.key.ends_with(".ezpsync"))
        .map(|c| BackupEntry {
            key: c.key.clone(),
            size: c.size as i64,
            last_modified: c.last_modified.clone(),
        })
        .collect();

    Ok(entries)
}

pub async fn s3_delete(config: &S3Config, key: &str) -> ApiResult<()> {
    let bucket = build_s3_bucket(config)?;
    let response = bucket
        .delete_object(key)
        .await
        .map_err(|e| format!("S3 delete failed: {}", e))?;

    if response.status_code() >= 200 && response.status_code() < 300 {
        Ok(())
    } else {
        Err(format!("S3 delete returned status {}", response.status_code()))
    }
}
