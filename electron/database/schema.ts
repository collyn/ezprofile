import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export function initDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('read_uncommitted = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_name TEXT,
      proxy_type TEXT,
      proxy_host TEXT,
      proxy_port INTEGER,
      proxy_user TEXT,
      proxy_pass TEXT,
      notes TEXT,
      browser_version TEXT DEFAULT 'latest',
      user_data_dir TEXT NOT NULL,
      startup_url TEXT,
      startup_type TEXT DEFAULT 'continue' CHECK(startup_type IN ('new_tab', 'continue', 'specific_pages')),
      startup_urls TEXT,
      status TEXT DEFAULT 'ready' CHECK(status IN ('ready', 'running')),
      last_run_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#4a9eff'
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Migrations
  try {
    const columns = db.prepare("PRAGMA table_info('profiles')").all() as { name: string }[];
    const columnNames = columns.map((c) => c.name);

    if (!columnNames.includes('startup_type')) {
      db.exec(
        "ALTER TABLE profiles ADD COLUMN startup_type TEXT DEFAULT 'continue' CHECK(startup_type IN ('new_tab', 'continue', 'specific_pages'))"
      );
    }
    if (!columnNames.includes('startup_urls')) {
      db.exec('ALTER TABLE profiles ADD COLUMN startup_urls TEXT');
    }
    if (!columnNames.includes('password_hash')) {
      db.exec('ALTER TABLE profiles ADD COLUMN password_hash TEXT');
    }
  } catch (error) {
    console.error('Database migration failed:', error);
  }

  return db;
}
