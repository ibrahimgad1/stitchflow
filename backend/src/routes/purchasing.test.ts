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

async function createSupplier(): Promise<string> {
  const response = await request(app)
    .post("/api/suppliers")
    .set("Authorization", authHeader())
    .send({ name: "Fabric Co" });

  return response.body.id as string;
}

async function createMaterial(supplierId: string): Promise<string> {
  const response = await request(app)
    .post("/api/materials")
    .set("Authorization", authHeader())
    .send({ name: "Cotton Roll", unit: "meter", supplierId });

  return response.body.id as string;
}

async function createSafe(openingBalance: number): Promise<string> {
  const response = await request(app)
    .post("/api/safes")
    .set("Authorization", authHeader())
    .send({ name: `Safe ${Date.now()}`, openingBalance });

  return response.body.id as string;
}

describe("purchasing routes", () => {
  beforeEach(() => {
    migrate();
    seed();
    setupAuthUser();
  });

  afterEach(() => {
    const db = getDatabase();
    db.exec(`
      DELETE FROM supplier_payment_allocations;
      DELETE FROM supplier_payments;
      DELETE FROM safe_transactions;
      DELETE FROM material_stock_movements;
      DELETE FROM material_receiving_items;
      DELETE FROM material_receivings;
      DELETE FROM supplier_ledger_entries;
      DELETE FROM materials;
      DELETE FROM safes;
      DELETE FROM suppliers;
      DELETE FROM users WHERE id = 'test-admin-id';
    `);
  });

  it("creates receiving, updates weighted average, and supplier payable", async () => {
    const supplierId = await createSupplier();
    const materialId = await createMaterial(supplierId);

    const response = await request(app)
      .post("/api/material-receivings")
      .set("Authorization", authHeader())
      .send({
        supplierId,
        receivingDate: "2026-08-29",
        items: [{ materialId, quantity: 100, unitPrice: 10 }]
      });

    expect(response.status).toBe(201);
    expect(response.body.receivingNumber).toMatch(/^MR-/);
    expect(response.body.totalMinor).toBe(100000);
    expect(response.body.remainingMinor).toBe(100000);

    const material = await request(app)
      .get(`/api/materials/${materialId}`)
      .set("Authorization", authHeader());

    expect(material.body.data.currentQuantity).toBe(100);
    expect(material.body.data.weightedAverageCostMinor).toBe(1000);

    const ledger = await request(app)
      .get(`/api/suppliers/${supplierId}/ledger`)
      .set("Authorization", authHeader());

    expect(ledger.body.balanceMinor).toBe(100000);
    expect(ledger.body.data[0].creditMinor).toBe(100000);
  });

  it("recalculates weighted average on second receiving", async () => {
    const supplierId = await createSupplier();
    const materialId = await createMaterial(supplierId);

    await request(app)
      .post("/api/material-receivings")
      .set("Authorization", authHeader())
      .send({
        supplierId,
        receivingDate: "2026-08-29",
        items: [{ materialId, quantity: 100, unitPrice: 10 }]
      });

    await request(app)
      .post("/api/material-receivings")
      .set("Authorization", authHeader())
      .send({
        supplierId,
        receivingDate: "2026-08-30",
        items: [{ materialId, quantity: 50, unitPrice: 16 }]
      });

    const material = await request(app)
      .get(`/api/materials/${materialId}`)
      .set("Authorization", authHeader());

    expect(material.body.data.currentQuantity).toBe(150);
    expect(material.body.data.weightedAverageCostMinor).toBe(1200);
  });

  it("creates supplier payment with allocation and decreases safe balance", async () => {
    const supplierId = await createSupplier();
    const materialId = await createMaterial(supplierId);
    const safeId = await createSafe(5000);

    const receiving = await request(app)
      .post("/api/material-receivings")
      .set("Authorization", authHeader())
      .send({
        supplierId,
        receivingDate: "2026-08-29",
        items: [{ materialId, quantity: 10, unitPrice: 100 }]
      });

    const payment = await request(app)
      .post("/api/supplier-payments")
      .set("Authorization", authHeader())
      .send({
        supplierId,
        paymentDate: "2026-08-30",
        amount: 500,
        safeId,
        allocations: [
          {
            materialReceivingId: receiving.body.id,
            allocatedAmount: 500
          }
        ]
      });

    expect(payment.status).toBe(201);
    expect(payment.body.paymentNumber).toMatch(/^SP-/);

    const safe = await request(app).get(`/api/safes/${safeId}`).set("Authorization", authHeader());
    expect(safe.body.data.currentBalanceMinor).toBe(450000);

    const ledger = await request(app)
      .get(`/api/suppliers/${supplierId}/ledger`)
      .set("Authorization", authHeader());

    expect(ledger.body.balanceMinor).toBe(50000);

    const receivingDetail = await request(app)
      .get(`/api/material-receivings/${receiving.body.id}`)
      .set("Authorization", authHeader());

    expect(receivingDetail.body.data.paidMinor).toBe(50000);
    expect(receivingDetail.body.data.remainingMinor).toBe(50000);
  });

  it("blocks supplier payment when safe balance is insufficient", async () => {
    const supplierId = await createSupplier();
    const materialId = await createMaterial(supplierId);
    const safeId = await createSafe(100);

    const receiving = await request(app)
      .post("/api/material-receivings")
      .set("Authorization", authHeader())
      .send({
        supplierId,
        receivingDate: "2026-08-29",
        items: [{ materialId, quantity: 10, unitPrice: 100 }]
      });

    const payment = await request(app)
      .post("/api/supplier-payments")
      .set("Authorization", authHeader())
      .send({
        supplierId,
        paymentDate: "2026-08-30",
        amount: 500,
        safeId,
        allocations: [
          {
            materialReceivingId: receiving.body.id,
            allocatedAmount: 500
          }
        ]
      });

    expect(payment.status).toBe(409);
    expect(payment.body.message).toBe("Insufficient safe balance");
  });

  it("requires reason for material stock adjustment", async () => {
    const supplierId = await createSupplier();
    const materialId = await createMaterial(supplierId);

    await request(app)
      .post("/api/material-receivings")
      .set("Authorization", authHeader())
      .send({
        supplierId,
        receivingDate: "2026-08-29",
        items: [{ materialId, quantity: 20, unitPrice: 5 }]
      });

    const missingReason = await request(app)
      .post(`/api/materials/${materialId}/adjustments`)
      .set("Authorization", authHeader())
      .send({ newQuantity: 15 });

    expect(missingReason.status).toBe(400);

    const adjusted = await request(app)
      .post(`/api/materials/${materialId}/adjustments`)
      .set("Authorization", authHeader())
      .send({
        newQuantity: 15,
        reason: "Physical count correction"
      });

    expect(adjusted.status).toBe(201);
    expect(adjusted.body.previousQuantity).toBe(20);
    expect(adjusted.body.newQuantity).toBe(15);

    const movements = await request(app)
      .get(`/api/materials/${materialId}/movements`)
      .set("Authorization", authHeader());

    expect(movements.body.data.some((row: { movementType: string }) => row.movementType === "adjustment")).toBe(
      true
    );
  });

  it("blocks negative material stock adjustment", async () => {
    const supplierId = await createSupplier();
    const materialId = await createMaterial(supplierId);

    await request(app)
      .post("/api/material-receivings")
      .set("Authorization", authHeader())
      .send({
        supplierId,
        receivingDate: "2026-08-29",
        items: [{ materialId, quantity: 5, unitPrice: 10 }]
      });

    const response = await request(app)
      .post(`/api/materials/${materialId}/adjustments`)
      .set("Authorization", authHeader())
      .send({
        newQuantity: -1,
        reason: "Invalid adjustment"
      });

    expect(response.status).toBe(400);
  });
});
