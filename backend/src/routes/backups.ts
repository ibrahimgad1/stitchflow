import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createBackup,
  listBackups,
  deleteBackup,
  restoreBackup,
  getBackupSettings,
  updateBackupSettings,
} from "../services/backup.js";

export const backupsRouter = Router();

const restoreLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "test" && req.headers["x-test-rate-limit"] !== "true",
  message: { statusCode: 429, message: "Too many restore requests, please try again later" }
});

backupsRouter.get("/backups", requireAuth, requireRole("admin"), (_req, res) => {
  try {
    const list = listBackups();
    res.json({ data: list });
  } catch (err) {
    res.status(500).json({
      statusCode: 500,
      message: err instanceof Error ? err.message : "Failed to list backups",
    });
  }
});

backupsRouter.post("/backups", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const backup = await createBackup(false);
    res.status(201).json({ data: backup });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create backup";
    const code = message.includes("in progress") ? 409 : 500;
    res.status(code).json({
      statusCode: code,
      message,
    });
  }
});

backupsRouter.delete("/backups/:filename", requireAuth, requireRole("admin"), (req, res) => {
  try {
    const { filename } = req.params as { filename: string };
    deleteBackup(filename);
    res.json({ message: "Backup deleted successfully" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete backup";
    const code = message.includes("Invalid backup")
      ? 400
      : message.includes("not found")
      ? 404
      : 500;
    res.status(code).json({ statusCode: code, message });
  }
});

backupsRouter.post("/backups/restore", requireAuth, requireRole("admin"), restoreLimiter, async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      res.status(400).json({ statusCode: 400, message: "Filename is required" });
      return;
    }
    await restoreBackup(filename);
    res.json({ message: "Database restored successfully" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to restore backup";
    let code = 500;
    if (message.includes("Invalid backup") || message.includes("Invalid filename")) code = 400;
    else if (message.includes("not found")) code = 404;
    else if (message.includes("corrupted") || message.includes("invalid")) code = 400;
    else if (message.includes("in progress")) code = 409;
    res.status(code).json({
      statusCode: code,
      message,
    });
  }
});

backupsRouter.get("/backups/settings", requireAuth, requireRole("admin"), (_req, res) => {
  try {
    const settings = getBackupSettings();
    res.json({ data: settings });
  } catch (err) {
    res.status(500).json({
      statusCode: 500,
      message: err instanceof Error ? err.message : "Failed to retrieve backup settings",
    });
  }
});

backupsRouter.put("/backups/settings", requireAuth, requireRole("admin"), (req, res) => {
  try {
    const { enabled, frequency, retentionCount } = req.body;
    if (
      typeof enabled !== "boolean" ||
      !["daily", "weekly", "monthly"].includes(frequency) ||
      typeof retentionCount !== "number" ||
      retentionCount <= 0
    ) {
      res.status(400).json({ statusCode: 400, message: "Invalid backup settings data" });
      return;
    }
    const updated = updateBackupSettings({ enabled, frequency, retentionCount });
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({
      statusCode: 500,
      message: err instanceof Error ? err.message : "Failed to update backup settings",
    });
  }
});
