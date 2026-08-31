import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const usersRouter = Router();

const createUserSchema = z.object({
  username: z.string().trim().min(3),
  displayName: z.string().trim().min(1),
  password: z.string().min(8),
  role: z.enum(["admin", "staff"])
});

usersRouter.get("/users", requireAuth, requireRole("admin"), (_req, res) => {
  const db = getDatabase();
  const users = db
    .prepare(`
      SELECT users.id, users.username, users.display_name AS displayName,
             roles.name AS role, users.is_active AS isActive,
             users.last_login_at AS lastLoginAt, users.created_at AS createdAt
      FROM users
      JOIN roles ON roles.id = users.role_id
      ORDER BY users.created_at DESC
      LIMIT 100
    `)
    .all();

  res.json({ data: users });
});

usersRouter.post("/users", requireAuth, requireRole("admin"), (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid user data" });
    return;
  }

  const db = getDatabase();
  const role = db
    .prepare("SELECT id FROM roles WHERE name = ?")
    .get(parsed.data.role) as { id: string } | undefined;

  if (!role) {
    res.status(400).json({ statusCode: 400, message: "Invalid role" });
    return;
  }

  try {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, role_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      parsed.data.username,
      parsed.data.displayName,
      bcrypt.hashSync(parsed.data.password, 12),
      role.id
    );

    res.status(201).json({
      id,
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      role: parsed.data.role
    });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Username already exists" });
  }
});

