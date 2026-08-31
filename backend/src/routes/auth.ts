import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { loadEnv } from "../config/env.js";
import { getDatabase } from "../database/connection.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { statusCode: 429, message: "Too many login attempts, please try again later" }
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

authRouter.post("/auth/login", loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid login data" });
    return;
  }

  const db = getDatabase();
  const user = db
    .prepare(`
      SELECT users.id, users.username, users.display_name AS displayName,
             users.password_hash AS passwordHash, roles.name AS role
      FROM users
      JOIN roles ON roles.id = users.role_id
      WHERE users.username = ? AND users.is_active = 1
    `)
    .get(parsed.data.username) as
    | {
        id: string;
        username: string;
        displayName: string;
        passwordHash: string;
        role: string;
      }
    | undefined;

  if (!user || !bcrypt.compareSync(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ statusCode: 401, message: "Invalid username or password" });
    return;
  }

  db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

  const env = loadEnv();
  const token = jwt.sign({ sub: user.id }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"]
  });

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    }
  });
});

authRouter.get("/auth/me", requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

authRouter.post("/auth/change-password", requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Password must be at least 8 characters" });
    return;
  }
  const db = getDatabase();
  const userId = req.user!.id;
  const row = db.prepare("SELECT password_hash AS passwordHash FROM users WHERE id=?").get(userId) as { passwordHash: string } | undefined;
  if (!row) {
    res.status(404).json({ statusCode: 404, message: "User not found" });
    return;
  }
  if (!bcrypt.compareSync(parsed.data.currentPassword, row.passwordHash)) {
    res.status(401).json({ statusCode: 401, message: "Current password is incorrect" });
    return;
  }
  const newHash = bcrypt.hashSync(parsed.data.newPassword, 12);
  db.prepare("UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(newHash, userId);
  res.json({ message: "Password changed successfully" });
});
