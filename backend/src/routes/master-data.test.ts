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

describe("master data routes", () => {
  beforeEach(() => {
    migrate();
    seed();
    setupAuthUser();
  });

  afterEach(() => {
    const db = getDatabase();
    db.exec(`
      DELETE FROM safe_transactions;
      DELETE FROM model_variants;
      DELETE FROM models;
      DELETE FROM materials;
      DELETE FROM suppliers;
      DELETE FROM customers;
      DELETE FROM safes;
      DELETE FROM users WHERE id = 'test-admin-id';
    `);
  });

  it("rejects duplicate model codes", async () => {
    const first = await request(app)
      .post("/api/models")
      .set("Authorization", authHeader())
      .send({ modelCode: "MDL-001", modelName: "Shirt A" });

    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/models")
      .set("Authorization", authHeader())
      .send({ modelCode: "MDL-001", modelName: "Shirt B" });

    expect(second.status).toBe(409);
  });

  it("rejects duplicate model variants", async () => {
    const model = await request(app)
      .post("/api/models")
      .set("Authorization", authHeader())
      .send({ modelCode: "MDL-002", modelName: "Pants A" });

    const sizeId = "size-m";
    const colorId = "color-black";

    const first = await request(app)
      .post(`/api/models/${model.body.id}/variants`)
      .set("Authorization", authHeader())
      .send({ sizeId, colorId });

    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/models/${model.body.id}/variants`)
      .set("Authorization", authHeader())
      .send({ sizeId, colorId });

    expect(second.status).toBe(409);
  });

  it("requires opening balance when creating a safe", async () => {
    const missingBalance = await request(app)
      .post("/api/safes")
      .set("Authorization", authHeader())
      .send({ name: "Main Cash" });

    expect(missingBalance.status).toBe(400);

    const created = await request(app)
      .post("/api/safes")
      .set("Authorization", authHeader())
      .send({ name: "Main Cash", openingBalance: 1500.5 });

    expect(created.status).toBe(201);
    expect(created.body.openingBalanceMinor).toBe(150050);
    expect(created.body.currentBalanceMinor).toBe(150050);
  });

  it("searches and paginates customers", async () => {
    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader())
      .send({ companyName: "Alpha Textiles", contactName: "Ali" });

    await request(app)
      .post("/api/customers")
      .set("Authorization", authHeader())
      .send({ companyName: "Beta Garments", contactName: "Sara" });

    const response = await request(app)
      .get("/api/customers?search=Alpha&page=1&pageSize=10")
      .set("Authorization", authHeader());

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].companyName).toBe("Alpha Textiles");
    expect(response.body.meta.total).toBe(1);
  });

  it("seeds default unspecified size and color", async () => {
    const sizes = await request(app)
      .get("/api/sizes?search=Unspecified")
      .set("Authorization", authHeader());

    const colors = await request(app)
      .get("/api/colors?search=Unspecified")
      .set("Authorization", authHeader());

    expect(sizes.body.data.some((row: { name: string }) => row.name === "Unspecified")).toBe(true);
    expect(colors.body.data.some((row: { name: string }) => row.name === "Unspecified")).toBe(true);
  });
});
