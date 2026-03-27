import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
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
  notes: string | null;
  browser_version: string | null;
  user_data_dir: string;
  startup_url: string | null;
  startup_type: 'new_tab' | 'continue' | 'specific_pages';
  startup_urls: string | null;
  status: 'ready' | 'running';
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProfileInput {
  name: string;
  group_name?: string;
  proxy_type?: string;
  proxy_host?: string;
  proxy_port?: number;
  proxy_user?: string;
  proxy_pass?: string;
  notes?: string;
  startup_url?: string;
  startup_type?: 'new_tab' | 'continue' | 'specific_pages';
  startup_urls?: string;
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

  getAll(): Profile[] {
    return this.db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all() as Profile[];
  }

  getById(id: string): Profile | undefined {
    return this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Profile | undefined;
  }

  getMany(ids: string[]): Profile[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.db.prepare(`SELECT * FROM profiles WHERE id IN (${placeholders}) ORDER BY created_at DESC`).all(...ids) as Profile[];
  }

  create(input: CreateProfileInput): Profile {
    const id = uuidv4();
    const userDataDir = path.join(this.profilesBaseDir, id);

    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    this.db.prepare(`
      INSERT INTO profiles (id, name, group_name, proxy_type, proxy_host, proxy_port, proxy_user, proxy_pass, notes, user_data_dir, startup_url, startup_type, startup_urls)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.group_name || null,
      input.proxy_type || null,
      input.proxy_host || null,
      input.proxy_port || null,
      input.proxy_user || null,
      input.proxy_pass || null,
      input.notes || null,
      userDataDir,
      input.startup_url || null,
      input.startup_type || 'continue',
      input.startup_urls || null,
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
      notes: 'notes',
      startup_url: 'startup_url',
      startup_type: 'startup_type',
      startup_urls: 'startup_urls',
      browser_version: 'browser_version',
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
      INSERT INTO profiles (id, name, group_name, proxy_type, proxy_host, proxy_port, proxy_user, proxy_pass, notes, browser_version, user_data_dir, startup_url, startup_type, startup_urls)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      `${source.name} (Copy)`,
      source.group_name,
      source.proxy_type,
      source.proxy_host,
      source.proxy_port,
      source.proxy_user,
      source.proxy_pass,
      source.notes,
      source.browser_version,
      newUserDataDir,
      source.startup_url,
      source.startup_type || 'continue',
      source.startup_urls,
    );

    return this.getById(newId)!;
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

  close(): void {
    this.db.close();
  }
}
