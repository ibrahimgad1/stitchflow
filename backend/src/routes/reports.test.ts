import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it } from "vitest";
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

describe("report routes", () => {
  beforeEach(() => {
    migrate();
    seed();
    setupAuthUser();
  });

  it("returns dashboard summary totals", async () => {
    const response = await request(app)
      .get("/api/dashboard/summary")
      .set("Authorization", authHeader());

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      customerReceivablesMinor: expect.any(Number),
      supplierPayablesMinor: expect.any(Number),
      treasuryBalanceMinor: expect.any(Number),
      rawMaterialStockValueMinor: expect.any(Number),
      finishedStockValueMinor: expect.any(Number),
      salesRevenueMinor: expect.any(Number),
      grossProfitMinor: expect.any(Number),
      estimatedNetMinor: expect.any(Number)
    });
  });

  it("returns stock report summaries", async () => {
    const rawResponse = await request(app)
      .get("/api/reports/raw-material-stock")
      .set("Authorization", authHeader());

    expect(rawResponse.status).toBe(200);
    expect(rawResponse.body.summary).toMatchObject({
      totalQuantity: expect.any(Number),
      totalValueMinor: expect.any(Number)
    });

    const finishedResponse = await request(app)
      .get("/api/reports/finished-stock")
      .set("Authorization", authHeader());

    expect(finishedResponse.status).toBe(200);
    expect(finishedResponse.body.summary).toMatchObject({
      totalQuantity: expect.any(Number),
      totalValueMinor: expect.any(Number)
    });
  });

  it("returns stock movement report summaries", async () => {
    const rawResponse = await request(app)
      .get("/api/reports/raw-material-movements")
      .set("Authorization", authHeader());

    expect(rawResponse.status).toBe(200);
    expect(rawResponse.body.summary).toMatchObject({
      quantityIn: expect.any(Number),
      quantityOut: expect.any(Number),
      netQuantity: expect.any(Number),
      valueInMinor: expect.any(Number),
      valueOutMinor: expect.any(Number),
      netValueMinor: expect.any(Number)
    });

    const finishedResponse = await request(app)
      .get("/api/reports/finished-stock-movements")
      .set("Authorization", authHeader());

    expect(finishedResponse.status).toBe(200);
    expect(finishedResponse.body.summary).toMatchObject({
      quantityIn: expect.any(Number),
      quantityOut: expect.any(Number),
      netQuantity: expect.any(Number),
      valueInMinor: expect.any(Number),
      valueOutMinor: expect.any(Number),
      netValueMinor: expect.any(Number)
    });
  });

  it("returns production cost report summary", async () => {
    const response = await request(app)
      .get("/api/reports/production-costs")
      .set("Authorization", authHeader());

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({
      goodQuantity: expect.any(Number),
      materialCostMinor: expect.any(Number),
      componentCostMinor: expect.any(Number),
      directCostMinor: expect.any(Number),
      overheadCostMinor: expect.any(Number),
      totalCostMinor: expect.any(Number),
      averageCostPerGoodPieceMinor: expect.any(Number)
    });
  });
});
