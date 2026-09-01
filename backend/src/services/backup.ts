import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { loadEnv } from "../config/env.js";
import { closeDatabase, getDatabase } from "../database/connection.js";

export interface BackupSettings {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  retentionCount: number;
  lastBackupAt: string | null;
}

export interface BackupInfo {
  filename: string;
  size: number;
  type: "auto" | "manual" | "safety";
  createdAt: string;
}

const DEFAULT_SETTINGS: BackupSettings = {
  enabled: false,
  frequency: "daily",
  retentionCount: 5,
  lastBackupAt: null,
};

function formatDate(date: Date): string {
  const pad = (num: number) => String(num).padStart(2, "0");
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${MM}-${dd}_${hh}-${mm}-${ss}`;
}

let backupInProgress = false;
let restoreInProgress = false;

export function isBackupInProgress(): boolean {
  return backupInProgress;
}

export function isRestoreInProgress(): boolean {
  return restoreInProgress;
}

export function resetBackupStateForTests(): void {
  backupInProgress = false;
  restoreInProgress = false;
  autoBackupPromise = null;
}

export function validateDatabaseFile(filePath: string): boolean {
  let tempDb: Database.Database | null = null;
  try {
    tempDb = new Database(filePath, { readonly: true });
    const integrity = tempDb.pragma("integrity_check") as any[];
    const isOk =
      Array.isArray(integrity) &&
      integrity.length > 0 &&
      (integrity[0] === "ok" || integrity[0]?.integrity_check === "ok");
    if (!isOk) return false;

    // Verify expected schema exists (at least core tables)
    const tables = tempDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('customers','suppliers','materials','models','safes')")
      .all() as Array<{ name: string }>;
    if (tables.length < 5) return false;

    return true;
  } catch (err) {
    console.error(`Database validation error for ${filePath}:`, err);
    return false;
  } finally {
    if (tempDb) {
      try {
        tempDb.close();
      } catch {}
    }
  }
}

function ensureBackupPathSafe(backupDir: string, filename: string): string {
  const resolvedDir = path.resolve(backupDir);
  const resolvedFile = path.resolve(path.join(backupDir, filename));
  if (!resolvedFile.startsWith(resolvedDir + path.sep) && resolvedFile !== resolvedDir) {
    throw new Error("Invalid backup path");
  }
  return resolvedFile;
}

export function getBackupSettings(): BackupSettings {
  const db = getDatabase();
  const row = db
    .prepare("SELECT value_json FROM app_settings WHERE key = ?")
    .get("backup_settings") as { value_json: string } | undefined;

  if (!row) {
    db.prepare("INSERT INTO app_settings (key, value_json) VALUES (?, ?)")
      .run("backup_settings", JSON.stringify(DEFAULT_SETTINGS));
    return DEFAULT_SETTINGS;
  }

  try {
    return JSON.parse(row.value_json);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function updateBackupSettings(settings: Partial<BackupSettings>): BackupSettings {
  const current = getBackupSettings();
  const updated = { ...current, ...settings };
  const db = getDatabase();

  db.prepare(
    `
    INSERT INTO app_settings (key, value_json)
    VALUES (?, ?)
    ON CONFLICT(key)
    DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `
  ).run("backup_settings", JSON.stringify(updated));

  return updated;
}

export async function applyBackupRetention(): Promise<void> {
  const env = loadEnv();
  const backupDir = path.join(path.dirname(env.databasePath), "backups");
  if (!fs.existsSync(backupDir)) return;

  const settings = getBackupSettings();
  const files = fs.readdirSync(backupDir);

  const autoFiles = files
    .filter((f) => f.match(/^backup_.*_auto\.db$/))
    .map((f) => ({
      name: f,
      time: fs.statSync(path.join(backupDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);

  if (autoFiles.length > settings.retentionCount) {
    for (let i = settings.retentionCount; i < autoFiles.length; i++) {
      fs.unlinkSync(path.join(backupDir, autoFiles[i].name));
    }
  }
}

async function applySafetyRetention(backupDir: string): Promise<void> {
  try {
    const files = fs.readdirSync(backupDir);
    const safetyFiles = files
      .filter((f) => f.match(/^backup_.*_safety\.db$/))
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(backupDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time);

    if (safetyFiles.length > 3) {
      for (let i = 3; i < safetyFiles.length; i++) {
        fs.unlinkSync(path.join(backupDir, safetyFiles[i].name));
      }
    }
  } catch (err) {
    console.error("Failed to apply safety retention:", err);
  }
}

export async function createBackup(isAuto: boolean): Promise<BackupInfo> {
  if (backupInProgress) {
    throw new Error("Backup already in progress");
  }
  if (restoreInProgress) {
    throw new Error("Cannot create backup while restore is in progress");
  }
  backupInProgress = true;
  try {
    const env = loadEnv();
    const backupDir = path.join(path.dirname(env.databasePath), "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const date = new Date();
    const timestamp = formatDate(date);
    const typeStr = isAuto ? "auto" : "manual";
    const filename = `backup_${timestamp}_${typeStr}.db`;
    const tempPath = path.join(backupDir, `temp_${Date.now()}_${filename}`);
    const finalPath = ensureBackupPathSafe(backupDir, filename);

    const db = getDatabase();
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
    } catch {}
    await db.backup(tempPath);

    if (!validateDatabaseFile(tempPath)) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      throw new Error("Backup database failed integrity check");
    }

    fs.renameSync(tempPath, finalPath);
    const finalFilename = filename;

    if (isAuto) {
      await applyBackupRetention();
    }

    const size = fs.statSync(finalPath).size;
    return {
      filename: finalFilename,
      size,
      type: typeStr as "auto" | "manual",
      createdAt: `${timestamp.split("_")[0]} ${timestamp.split("_")[1].replace(/-/g, ":")}`,
    };
  } finally {
    backupInProgress = false;
  }
}

export function listBackups(): BackupInfo[] {
  const env = loadEnv();
  const backupDir = path.join(path.dirname(env.databasePath), "backups");
  if (!fs.existsSync(backupDir)) {
    return [];
  }

  const files = fs.readdirSync(backupDir);
  const backups: BackupInfo[] = [];

  for (const file of files) {
    const match = file.match(
      /^backup_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})_(auto|manual|safety)\.db$/
    );
    if (!match) continue;

    const fullPath = path.join(backupDir, file);
    // Skip invalid/corrupted backups - only show valid managed backups
    try {
      if (!validateDatabaseFile(fullPath)) continue;
    } catch {
      continue;
    }

    let size = 0;
    try {
      size = fs.statSync(fullPath).size;
    } catch {
      continue;
    }
    const [_, dateStr, hh, mm, ss, type] = match;
    const createdAt = `${dateStr} ${hh}:${mm}:${ss}`;

    backups.push({
      filename: file,
      size,
      type: type as "auto" | "manual" | "safety",
      createdAt,
    });
  }

  return backups.sort((a, b) => b.filename.localeCompare(a.filename));
}

export function deleteBackup(filename: string): void {
  const regex = /^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_(auto|manual|safety)\.db$/;
  if (!regex.test(filename)) {
    throw new Error("Invalid backup filename");
  }

  const env = loadEnv();
  const backupDir = path.join(path.dirname(env.databasePath), "backups");
  const filePath = ensureBackupPathSafe(backupDir, filename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  } else {
    throw new Error("Backup file not found");
  }
}

export async function restoreBackup(filename: string): Promise<void> {
  if (backupInProgress) {
    throw new Error("Cannot restore while backup is in progress");
  }
  if (restoreInProgress) {
    throw new Error("Restore already in progress");
  }
  restoreInProgress = true;
  try {
    const regex = /^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_(auto|manual|safety)\.db$/;
    if (!regex.test(filename)) {
      throw new Error("Invalid backup filename");
    }

    const env = loadEnv();
    const backupDir = path.join(path.dirname(env.databasePath), "backups");
    const backupPath = ensureBackupPathSafe(backupDir, filename);

    if (!fs.existsSync(backupPath)) {
      throw new Error("Backup file not found");
    }

    if (!validateDatabaseFile(backupPath)) {
      throw new Error("Selected backup file is corrupted or invalid");
    }

    const liveDb = getDatabase();
    // Checkpoint WAL before safety backup to ensure consistent state
    try {
      liveDb.pragma("wal_checkpoint(TRUNCATE)");
    } catch {}
    const safetyFilename = `backup_${formatDate(new Date())}_safety.db`;
    const safetyPath = ensureBackupPathSafe(backupDir, safetyFilename);

    try {
      await liveDb.backup(safetyPath);
      if (!validateDatabaseFile(safetyPath)) {
        throw new Error("Safety backup failed validation");
      }
    } catch (err) {
      throw new Error(
        `Failed to create safety backup: ${err instanceof Error ? err.message : err}`
      );
    }

    const walPath = `${env.databasePath}-wal`;
    const shmPath = `${env.databasePath}-shm`;

    try {
      // Ensure WAL is checkpointed before close
      try {
        liveDb.pragma("wal_checkpoint(TRUNCATE)");
      } catch {}
      closeDatabase();

      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

      // Atomic restore via temp file
      const tempRestorePath = `${env.databasePath}.restore_tmp`;
      fs.copyFileSync(backupPath, tempRestorePath);
      // Validate temp file before replacing
      if (!validateDatabaseFile(tempRestorePath)) {
        fs.unlinkSync(tempRestorePath);
        throw new Error("Restored temp database failed validation");
      }
      fs.renameSync(tempRestorePath, env.databasePath);

      const restoredDb = getDatabase();
      const integrity = restoredDb.pragma("integrity_check") as any[];
      const isOk =
        Array.isArray(integrity) &&
        integrity.length > 0 &&
        (integrity[0] === "ok" || integrity[0]?.integrity_check === "ok");

      if (!isOk) {
        throw new Error("Restored database failed integrity check");
      }

      await applySafetyRetention(backupDir);
    } catch (err) {
      console.error("Restore failed, rolling back...", err);
      closeDatabase();
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

      if (fs.existsSync(safetyPath)) {
        const tempRollbackPath = `${env.databasePath}.rollback_tmp`;
        fs.copyFileSync(safetyPath, tempRollbackPath);
        fs.renameSync(tempRollbackPath, env.databasePath);
      }

      try {
        const rolledBackDb = getDatabase();
        const integrity = rolledBackDb.pragma("integrity_check") as any[];
        const isOk =
          Array.isArray(integrity) &&
          integrity.length > 0 &&
          (integrity[0] === "ok" || integrity[0]?.integrity_check === "ok");
        if (!isOk) {
          console.error("Rollback database also failed integrity check");
        }
      } catch {}
      throw new Error(
        `Restore failed. Database was rolled back to its previous state. Error: ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  } finally {
    restoreInProgress = false;
  }
}

let autoBackupPromise: Promise<void> | null = null;

export async function checkAutoBackup(): Promise<void> {
  if (autoBackupPromise) {
    return autoBackupPromise;
  }
  autoBackupPromise = (async () => {
    try {
      const settings = getBackupSettings();
      if (!settings.enabled) return;

      if (backupInProgress || restoreInProgress) {
        console.log("[Auto Backup] Skipped - backup/restore already in progress");
        return;
      }

      const now = new Date();
      let isDue = false;

      if (!settings.lastBackupAt) {
        isDue = true;
      } else {
        const lastBackup = new Date(settings.lastBackupAt);
        const diffMs = now.getTime() - lastBackup.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (settings.frequency === "daily") {
          isDue = diffDays >= 1;
        } else if (settings.frequency === "weekly") {
          isDue = diffDays >= 7;
        } else if (settings.frequency === "monthly") {
          isDue = diffDays >= 30;
        }
      }

      if (isDue) {
        console.log(`[Auto Backup] Starting automated backup (frequency: ${settings.frequency})...`);
        await createBackup(true);
        updateBackupSettings({ lastBackupAt: now.toISOString() });
        console.log(`[Auto Backup] Automated backup completed successfully.`);
      }
    } catch (err) {
      console.error("[Auto Backup] Error checking/running automatic backup:", err);
    } finally {
      autoBackupPromise = null;
    }
  })();
  return autoBackupPromise;
}
