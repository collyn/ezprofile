import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import * as bcrypt from 'bcryptjs';
import { initDatabase } from '../database/schema';

export interface Profile {
  id: string;
  name: string;
  group_name: string | null;
  proxy_type: string | null;
  proxy_host: string | null;
  proxy_port: number | null;
  proxy_user: string | null;
  proxy_pass: string | null;
  proxy_enabled: number;
  notes: string | null;
  browser_version: string | null;
  user_data_dir: string;
  startup_url: string | null;
  startup_type: 'new_tab' | 'continue' | 'specific_pages';
  startup_urls: string | null;
  fingerprint_flags: string | null;
  password_hash: string | null;
  status: 'ready' | 'running';
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
  has_password: boolean;
}

export interface CreateProfileInput {
  name: string;
  group_name?: string;
  proxy_type?: string;
  proxy_host?: string;
  proxy_port?: number;
  proxy_user?: string;
  proxy_pass?: string;
  proxy_enabled?: number;
  notes?: string;
  startup_url?: string;
  startup_type?: 'new_tab' | 'continue' | 'specific_pages';
  startup_urls?: string;
  fingerprint_flags?: string;
  browser_version?: string;
}

export class ProfileManager {
  private db: Database.Database;
  private profilesBaseDir: string;

  constructor(dbPath: string) {
    this.db = initDatabase(dbPath);
    this.profilesBaseDir = path.join(path.dirname(dbPath), 'profiles');
    if (!fs.existsSync(this.profilesBaseDir)) {
      fs.mkdirSync(this.profilesBaseDir, { recursive: true });
    }
  }

  private addHasPassword(profile: any): Profile {
    return { ...profile, has_password: !!profile.password_hash };
  }

  getAll(): Profile[] {
    const rows = this.db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all() as any[];
    return rows.map(r => this.addHasPassword(r));
  }

  getById(id: string): Profile | undefined {
    const row = this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as any | undefined;
    return row ? this.addHasPassword(row) : undefined;
  }

  getMany(ids: string[]): Profile[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const rows = this.db.prepare(`SELECT * FROM profiles WHERE id IN (${placeholders}) ORDER BY created_at DESC`).all(...ids) as any[];
    return rows.map(r => this.addHasPassword(r));
  }

  create(input: CreateProfileInput): Profile {
    const id = uuidv4();
    const userDataDir = path.join(this.profilesBaseDir, id);

    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    this.db.prepare(`
      INSERT INTO profiles (id, name, group_name, proxy_type, proxy_host, proxy_port, proxy_user, proxy_pass, proxy_enabled, notes, user_data_dir, startup_url, startup_type, startup_urls, fingerprint_flags, browser_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.group_name || null,
      input.proxy_type || null,
      input.proxy_host || null,
      input.proxy_port || null,
      input.proxy_user || null,
      input.proxy_pass || null,
      input.proxy_enabled ?? 0,
      input.notes || null,
      userDataDir,
      input.startup_url || null,
      input.startup_type || 'continue',
      input.startup_urls || null,
      input.fingerprint_flags || null,
      input.browser_version || null,
    );

    return this.getById(id)!;
  }

  createBatch(count: number, baseName: string): Profile[] {
    const profiles: Profile[] = [];
    const insert = this.db.transaction(() => {
      for (let i = 1; i <= count; i++) {
        const profile = this.create({ name: `${baseName} ${i}` });
        profiles.push(profile);
      }
    });
    insert();
    return profiles;
  }

  createMany(inputs: CreateProfileInput[]): Profile[] {
    const results: Profile[] = [];
    const insertOp = this.db.transaction(() => {
      for (const input of inputs) {
        results.push(this.create(input));
      }
    });
    insertOp();
    return results;
  }

  update(id: string, input: Partial<CreateProfileInput>): Profile {
    const fields: string[] = [];
    const values: any[] = [];

    const fieldMap: Record<string, string> = {
      name: 'name',
      group_name: 'group_name',
      proxy_type: 'proxy_type',
      proxy_host: 'proxy_host',
      proxy_port: 'proxy_port',
      proxy_user: 'proxy_user',
      proxy_pass: 'proxy_pass',
      proxy_enabled: 'proxy_enabled',
      notes: 'notes',
      startup_url: 'startup_url',
      startup_type: 'startup_type',
      startup_urls: 'startup_urls',
      browser_version: 'browser_version',
      fingerprint_flags: 'fingerprint_flags',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (key in input) {
        fields.push(`${dbField} = ?`);
        values.push((input as any)[key] ?? null);
      }
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      this.db.prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    return this.getById(id)!;
  }

  delete(id: string): void {
    const profile = this.getById(id);
    if (profile) {
      // Remove user data directory
      if (fs.existsSync(profile.user_data_dir)) {
        fs.rmSync(profile.user_data_dir, { recursive: true, force: true });
      }
      this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    }
  }

  deleteMany(ids: string[]): void {
    const deleteOp = this.db.transaction(() => {
      for (const id of ids) {
        this.delete(id);
      }
    });
    deleteOp();
  }

  updateMany(ids: string[], input: Partial<CreateProfileInput>): void {
    const updateOp = this.db.transaction(() => {
      for (const id of ids) {
        this.update(id, input);
      }
    });
    updateOp();
  }

  updateStatus(id: string, status: 'ready' | 'running'): void {
    const updates = status === 'running'
      ? "status = ?, last_run_at = datetime('now'), updated_at = datetime('now')"
      : "status = ?, updated_at = datetime('now')";
    this.db.prepare(`UPDATE profiles SET ${updates} WHERE id = ?`).run(status, id);
  }

  clone(id: string): Profile {
    const source = this.getById(id);
    if (!source) throw new Error('Source profile not found');

    const newId = uuidv4();
    const newUserDataDir = path.join(this.profilesBaseDir, newId);

    // Deep-copy the entire user_data_dir (cookies, history, sessions, extensions, etc.)
    if (fs.existsSync(source.user_data_dir)) {
      fs.cpSync(source.user_data_dir, newUserDataDir, { recursive: true });
    } else {
      fs.mkdirSync(newUserDataDir, { recursive: true });
    }

    // Remove any lock files from the cloned profile
    const singletonLock = path.join(newUserDataDir, 'SingletonLock');
    if (fs.existsSync(singletonLock)) {
      try { fs.unlinkSync(singletonLock); } catch {}
    }
    const defaultSingletonLock = path.join(newUserDataDir, 'Default', 'SingletonLock');
    if (fs.existsSync(defaultSingletonLock)) {
      try { fs.unlinkSync(defaultSingletonLock); } catch {}
    }

    this.db.prepare(`
      INSERT INTO profiles (id, name, group_name, proxy_type, proxy_host, proxy_port, proxy_user, proxy_pass, proxy_enabled, notes, browser_version, user_data_dir, startup_url, startup_type, startup_urls, fingerprint_flags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      `${source.name} (Copy)`,
      source.group_name,
      source.proxy_type,
      source.proxy_host,
      source.proxy_port,
      source.proxy_user,
      source.proxy_pass,
      source.proxy_enabled ?? 0,
      source.notes,
      source.browser_version,
      newUserDataDir,
      source.startup_url,
      source.startup_type || 'continue',
      source.startup_urls,
      source.fingerprint_flags,
    );

    return this.getById(newId)!;
  }

  // Password management
  setPassword(id: string, password: string): void {
    const hash = bcrypt.hashSync(password, 10);
    this.db.prepare("UPDATE profiles SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, id);
  }

  removePassword(id: string): void {
    this.db.prepare("UPDATE profiles SET password_hash = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
  }

  verifyPassword(id: string, password: string): boolean {
    const row = this.db.prepare('SELECT password_hash FROM profiles WHERE id = ?').get(id) as { password_hash: string | null } | undefined;
    if (!row || !row.password_hash) return true; // No password set = always pass
    return bcrypt.compareSync(password, row.password_hash);
  }

  // Groups
  getGroups(): { id: string; name: string; color: string }[] {
    return this.db.prepare('SELECT * FROM groups ORDER BY name').all() as any[];
  }

  createGroup(name: string, color: string): void {
    const id = uuidv4();
    this.db.prepare('INSERT INTO groups (id, name, color) VALUES (?, ?, ?)').run(id, name, color);
  }

  deleteGroup(id: string): void {
    this.db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  }

  // Settings
  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }

  // Proxy management
  getProxies(): any[] {
    return this.db.prepare('SELECT * FROM proxies ORDER BY created_at DESC').all();
  }

  createProxy(input: { name: string; type: string; host: string; port: number; username?: string; password?: string }): any {
    const id = uuidv4();
    this.db.prepare(
      `INSERT INTO proxies (id, name, type, host, port, username, password) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.name, input.type, input.host, input.port, input.username || null, input.password || null);
    return this.db.prepare('SELECT * FROM proxies WHERE id = ?').get(id);
  }

  updateProxy(id: string, input: { name?: string; type?: string; host?: string; port?: number; username?: string; password?: string }): any {
    const fields: string[] = [];
    const values: any[] = [];

    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      this.db.prepare(`UPDATE proxies SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return this.db.prepare('SELECT * FROM proxies WHERE id = ?').get(id);
  }

  deleteProxy(id: string): void {
    this.db.prepare('DELETE FROM proxies WHERE id = ?').run(id);
  }

  // Sync log
  writeSyncLog(entry: {
    profileId: string;
    provider: string;
    direction: 'upload' | 'download';
    status: 'success' | 'error';
    remoteFile?: string;
    sizeBytes?: number;
    errorMessage?: string;
  }): void {
    const { v4: uuid } = require('uuid');
    this.db.prepare(
      `INSERT INTO sync_log (id, profile_id, provider, direction, status, error_message, remote_file, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      entry.profileId,
      entry.provider,
      entry.direction,
      entry.status,
      entry.errorMessage ?? null,
      entry.remoteFile ?? null,
      entry.sizeBytes ?? null
    );
  }

  getSyncLog(profileId?: string, limit = 50): any[] {
    if (profileId) {
      return this.db
        .prepare('SELECT * FROM sync_log WHERE profile_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(profileId, limit);
    }
    return this.db.prepare('SELECT * FROM sync_log ORDER BY created_at DESC LIMIT ?').all(limit);
  }

  close(): void {
    this.db.close();
  }
}
