import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { getDatabase } from "../database/connection.js";
import { migrate } from "../database/migrate.js";
import { seed } from "../database/seed.js";

const app = createApp();

function authHeader(): string {
  const env = loadEnv();
  const token = jwt.sign({ sub: "test-admin-id" }, env.jwtSecret);
  return `Bearer ${token}`;
}

function setupAuthUser(): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO users (id, username, display_name, password_hash, role_id)
    VALUES ('test-admin-id', 'testadmin', 'Test Admin', ?, 'role-admin')
    ON CONFLICT(id) DO NOTHING
  `).run(bcrypt.hashSync("Test_Admin_123", 12));
}

describe("endpoint rate limiting", () => {
  beforeEach(() => {
    migrate();
    seed();
    setupAuthUser();
  });

  it("enforces rate limit on login endpoint (max 5 requests/min)", async () => {
    // Send 5 login attempts (will fail with 401, but still count towards limit)
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .set("x-test-rate-limit", "true")
        .send({ username: "admin", password: "wrong-password" });
      expect(res.status).toBe(401);
    }

    // 6th attempt should be blocked with 429
    const limitRes = await request(app)
      .post("/api/auth/login")
      .set("x-test-rate-limit", "true")
      .send({ username: "admin", password: "wrong-password" });

    expect(limitRes.status).toBe(429);
    expect(limitRes.body.message).toContain("Too many login attempts");
  });

  it("enforces rate limit on change password endpoint (max 5 requests/min)", async () => {
    // Send 5 password change attempts (will fail validation with 400/401, but count towards limit)
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", authHeader())
        .set("x-test-rate-limit", "true")
        .send({ currentPassword: "wrong", newPassword: "short" });
      expect(res.status).toBe(400); // 400 due to password length validation
    }

    // 6th attempt should be blocked with 429
    const limitRes = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", authHeader())
      .set("x-test-rate-limit", "true")
      .send({ currentPassword: "wrong", newPassword: "short" });

    expect(limitRes.status).toBe(429);
    expect(limitRes.body.message).toContain("Too many password change attempts");
  });

  it("enforces rate limit on database restore endpoint (max 5 requests/min)", async () => {
    // Send 5 restore attempts (will fail with 400 due to invalid name, but count towards limit)
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/backups/restore")
        .set("Authorization", authHeader())
        .set("x-test-rate-limit", "true")
        .send({ filename: "" });
      expect(res.status).toBe(400);
    }

    // 6th attempt should be blocked with 429
    const limitRes = await request(app)
      .post("/api/backups/restore")
      .set("Authorization", authHeader())
      .set("x-test-rate-limit", "true")
      .send({ filename: "" });

    expect(limitRes.status).toBe(429);
    expect(limitRes.body.message).toContain("Too many restore requests");
  });
});
