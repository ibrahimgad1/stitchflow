import fs from "node:fs";
import path from "node:path";
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

describe("backup routes", () => {
  let backupDir: string;

  beforeEach(() => {
    migrate();
    seed();
    setupAuthUser();

    const env = loadEnv();
    backupDir = path.join(path.dirname(env.databasePath), "backups");
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir);
      for (const file of files) {
        if (file.endsWith(".db")) {
          fs.unlinkSync(path.join(backupDir, file));
        }
      }
    }
  });

  afterEach(() => {
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir);
      for (const file of files) {
        if (file.endsWith(".db")) {
          fs.unlinkSync(path.join(backupDir, file));
        }
      }
    }
  });

  it("retrieves empty backup list initially and default backup settings", async () => {
    const listRes = await request(app)
      .get("/api/backups")
      .set("Authorization", authHeader());
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toEqual([]);

    const settingsRes = await request(app)
      .get("/api/backups/settings")
      .set("Authorization", authHeader());
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.body.data.enabled).toBe(false);
    expect(settingsRes.body.data.frequency).toBe("daily");
    expect(settingsRes.body.data.retentionCount).toBe(5);
  });

  it("updates backup settings", async () => {
    const res = await request(app)
      .put("/api/backups/settings")
      .set("Authorization", authHeader())
      .send({
        enabled: true,
        frequency: "weekly",
        retentionCount: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.data.frequency).toBe("weekly");
    expect(res.body.data.retentionCount).toBe(10);
  });

  it("creates a manual backup and list it", async () => {
    const createRes = await request(app)
      .post("/api/backups")
      .set("Authorization", authHeader());

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.filename).toMatch(/^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_manual\.db$/);
    expect(createRes.body.data.type).toBe("manual");
    expect(createRes.body.data.size).toBeGreaterThan(0);

    const listRes = await request(app)
      .get("/api/backups")
      .set("Authorization", authHeader());
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.data[0].filename).toBe(createRes.body.data.filename);
  });

  it("blocks non-admin users from backup routes", async () => {
    // Create a staff token
    const db = getDatabase();
    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, role_id)
      VALUES ('test-staff-id', 'teststaff', 'Test Staff', 'hash', 'role-staff')
      ON CONFLICT(id) DO NOTHING
    `).run();

    const env = loadEnv();
    const staffToken = jwt.sign({ sub: "test-staff-id" }, env.jwtSecret);
    const staffHeader = `Bearer ${staffToken}`;

    const res = await request(app)
      .get("/api/backups")
      .set("Authorization", staffHeader);
    expect(res.status).toBe(403);
  });

  it("restores database and recovers previous state", async () => {
    // 1. Create a customer
    const createCustomerRes = await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader())
      .send({ companyName: "Restore Test Customer" });
    expect(createCustomerRes.status).toBe(201);
    const customerId = createCustomerRes.body.id;

    // 2. Create manual backup
    const backupRes = await request(app)
      .post("/api/backups")
      .set("Authorization", authHeader());
    expect(backupRes.status).toBe(201);
    const backupFilename = backupRes.body.data.filename;

    // 3. Modify the customer name
    const modifyCustomerRes = await request(app)
      .put(`/api/customers/${customerId}`)
      .set("Authorization", authHeader())
      .send({ companyName: "Modified Name", isActive: true });
    expect(modifyCustomerRes.status).toBe(200);

    // Verify it is modified
    const checkModified = await request(app)
      .get(`/api/customers?search=Modified`)
      .set("Authorization", authHeader());
    expect(checkModified.body.data.some((c: any) => c.id === customerId)).toBe(true);

    // 4. Restore the database
    const restoreRes = await request(app)
      .post("/api/backups/restore")
      .set("Authorization", authHeader())
      .send({ filename: backupFilename });
    expect(restoreRes.status).toBe(200);

    // 5. Verify customer name is restored back to "Restore Test Customer"
    const checkRestored = await request(app)
      .get(`/api/customers?search=Restore Test Customer`)
      .set("Authorization", authHeader());
    expect(checkRestored.body.data.some((c: any) => c.id === customerId)).toBe(true);
  });

  it("guards against path traversal on delete and restore", async () => {
    const badFilename = "../../../app.db";

    const deleteRes = await request(app)
      .delete(`/api/backups/${encodeURIComponent(badFilename)}`)
      .set("Authorization", authHeader());
    expect(deleteRes.status).toBe(400);

    const restoreRes = await request(app)
      .post("/api/backups/restore")
      .set("Authorization", authHeader())
      .send({ filename: badFilename });
    expect(restoreRes.status).toBe(400);
  });

  it("deletes a backup file", async () => {
    const createRes = await request(app)
      .post("/api/backups")
      .set("Authorization", authHeader());
    const filename = createRes.body.data.filename;

    const deleteRes = await request(app)
      .delete(`/api/backups/${filename}`)
      .set("Authorization", authHeader());
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app)
      .get("/api/backups")
      .set("Authorization", authHeader());
    expect(listRes.body.data).toEqual([]);
  });
});
