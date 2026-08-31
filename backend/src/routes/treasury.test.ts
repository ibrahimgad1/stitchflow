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

async function createSafe(openingBalance: number): Promise<string> {
  const response = await request(app)
    .post("/api/safes")
    .set("Authorization", authHeader())
    .send({ name: `Expense cash ${Date.now()}`, openingBalance });

  return response.body.id as string;
}

async function createOwner(): Promise<string> {
  const response = await request(app)
    .post("/api/owners")
    .set("Authorization", authHeader())
    .send({ name: `Owner ${Date.now()}`, ownershipPercent: 50 });

  return response.body.id as string;
}

describe("treasury routes", () => {
  beforeEach(() => {
    migrate();
    seed();
    setupAuthUser();
  });

  afterEach(() => {
    const db = getDatabase();
    db.exec(`
      DELETE FROM overhead_entries;
      DELETE FROM expenses;
      DELETE FROM safe_transactions;
      DELETE FROM safe_transfers;
      DELETE FROM capital_transactions;
      DELETE FROM audit_logs WHERE user_id = 'test-admin-id';
      DELETE FROM safes;
      DELETE FROM owners;
      DELETE FROM users WHERE id = 'test-admin-id';
    `);
  });

  it("creates a paid expense and decreases the selected safe", async () => {
    const safeId = await createSafe(500);

    const response = await request(app)
      .post("/api/expenses")
      .set("Authorization", authHeader())
      .send({
        expenseDate: "2026-08-30",
        description: "Thread and needles",
        amount: 125,
        paymentStatus: "paid",
        safeId
      });

    expect(response.status).toBe(201);
    expect(response.body.expenseNumber).toMatch(/^EXP-/);

    const safe = await request(app).get(`/api/safes/${safeId}`).set("Authorization", authHeader());
    expect(safe.body.data.currentBalanceMinor).toBe(37500);
  });

  it("creates an unpaid expense without changing safe balance", async () => {
    const safeId = await createSafe(500);

    const response = await request(app)
      .post("/api/expenses")
      .set("Authorization", authHeader())
      .send({
        expenseDate: "2026-08-30",
        description: "Electricity bill",
        amount: 200,
        paymentStatus: "unpaid"
      });

    expect(response.status).toBe(201);
    expect(response.body.paymentStatus).toBe("unpaid");

    const safe = await request(app).get(`/api/safes/${safeId}`).set("Authorization", authHeader());
    expect(safe.body.data.currentBalanceMinor).toBe(50000);
  });

  it("blocks paid expense when safe balance is insufficient", async () => {
    const safeId = await createSafe(50);

    const response = await request(app)
      .post("/api/expenses")
      .set("Authorization", authHeader())
      .send({
        expenseDate: "2026-08-30",
        description: "Machine maintenance",
        amount: 75,
        paymentStatus: "paid",
        safeId
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("Insufficient safe balance");
  });

  it("transfers money between safes atomically", async () => {
    const sourceSafeId = await createSafe(500);
    const destinationSafeId = await createSafe(25);

    const response = await request(app)
      .post("/api/safe-transfers")
      .set("Authorization", authHeader())
      .send({
        transferDate: "2026-08-30",
        fromSafeId: sourceSafeId,
        toSafeId: destinationSafeId,
        amount: 175,
        notes: "Move cash to sales desk"
      });

    expect(response.status).toBe(201);
    expect(response.body.transferNumber).toMatch(/^TR-/);

    const sourceSafe = await request(app)
      .get(`/api/safes/${sourceSafeId}`)
      .set("Authorization", authHeader());
    const destinationSafe = await request(app)
      .get(`/api/safes/${destinationSafeId}`)
      .set("Authorization", authHeader());

    expect(sourceSafe.body.data.currentBalanceMinor).toBe(32500);
    expect(destinationSafe.body.data.currentBalanceMinor).toBe(20000);

    const ledger = await request(app)
      .get("/api/safe-transactions")
      .set("Authorization", authHeader());
    const transferRows = ledger.body.data.filter(
      (row: { sourceType: string; sourceId: string }) =>
        row.sourceType === "safe_transfer" && row.sourceId === response.body.id
    );
    expect(transferRows).toHaveLength(2);
  });

  it("blocks transfer when source safe balance is insufficient", async () => {
    const sourceSafeId = await createSafe(50);
    const destinationSafeId = await createSafe(0);

    const response = await request(app)
      .post("/api/safe-transfers")
      .set("Authorization", authHeader())
      .send({
        transferDate: "2026-08-30",
        fromSafeId: sourceSafeId,
        toSafeId: destinationSafeId,
        amount: 75
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("Insufficient safe balance");
  });

  it("adjusts safe balance only with a reason and writes an audit log", async () => {
    const safeId = await createSafe(100);

    const invalidResponse = await request(app)
      .post(`/api/safes/${safeId}/adjustments`)
      .set("Authorization", authHeader())
      .send({
        adjustmentDate: "2026-08-30",
        newBalance: 120,
        reason: ""
      });
    expect(invalidResponse.status).toBe(400);

    const response = await request(app)
      .post(`/api/safes/${safeId}/adjustments`)
      .set("Authorization", authHeader())
      .send({
        adjustmentDate: "2026-08-30",
        newBalance: 120,
        reason: "Physical cash count"
      });

    expect(response.status).toBe(201);
    expect(response.body.previousBalanceMinor).toBe(10000);
    expect(response.body.newBalanceMinor).toBe(12000);

    const db = getDatabase();
    const audit = db
      .prepare("SELECT id FROM audit_logs WHERE action = 'adjust_safe_balance' AND entity_id = ?")
      .get(safeId);
    expect(audit).toBeTruthy();
  });

  it("records capital injection and increases safe balance", async () => {
    const safeId = await createSafe(100);
    const ownerId = await createOwner();

    const response = await request(app)
      .post("/api/capital-transactions")
      .set("Authorization", authHeader())
      .send({
        transactionDate: "2026-08-30",
        transactionType: "capital_injection",
        ownerId,
        safeId,
        amount: 250,
        notes: "Owner added working capital"
      });

    expect(response.status).toBe(201);
    expect(response.body.transactionType).toBe("capital_injection");

    const safe = await request(app).get(`/api/safes/${safeId}`).set("Authorization", authHeader());
    expect(safe.body.data.currentBalanceMinor).toBe(35000);

    const ledger = await request(app)
      .get("/api/safe-transactions")
      .set("Authorization", authHeader());
    const row = ledger.body.data.find(
      (entry: { sourceType: string; sourceId: string; transactionType: string }) =>
        entry.sourceType === "capital_transaction" &&
        entry.sourceId === response.body.id &&
        entry.transactionType === "capital_injection"
    );
    expect(row).toBeTruthy();
  });

  it("records owner withdrawal and decreases safe balance", async () => {
    const safeId = await createSafe(300);
    const ownerId = await createOwner();

    const response = await request(app)
      .post("/api/capital-transactions")
      .set("Authorization", authHeader())
      .send({
        transactionDate: "2026-08-30",
        transactionType: "owner_withdrawal",
        ownerId,
        safeId,
        amount: 75
      });

    expect(response.status).toBe(201);
    expect(response.body.transactionType).toBe("owner_withdrawal");

    const safe = await request(app).get(`/api/safes/${safeId}`).set("Authorization", authHeader());
    expect(safe.body.data.currentBalanceMinor).toBe(22500);
  });

  it("blocks owner withdrawal when safe balance is insufficient", async () => {
    const safeId = await createSafe(25);
    const ownerId = await createOwner();

    const response = await request(app)
      .post("/api/capital-transactions")
      .set("Authorization", authHeader())
      .send({
        transactionDate: "2026-08-30",
        transactionType: "owner_withdrawal",
        ownerId,
        safeId,
        amount: 75
      });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("Insufficient safe balance");
  });

  it("returns treasury report totals across safe movements", async () => {
    const safeId = await createSafe(100);
    const ownerId = await createOwner();

    await request(app)
      .post("/api/capital-transactions")
      .set("Authorization", authHeader())
      .send({
        transactionDate: "2026-08-30",
        transactionType: "capital_injection",
        ownerId,
        safeId,
        amount: 200
      });

    await request(app)
      .post("/api/expenses")
      .set("Authorization", authHeader())
      .send({
        expenseDate: "2026-08-30",
        description: "Report expense",
        amount: 50,
        paymentStatus: "paid",
        safeId
      });

    const report = await request(app)
      .get("/api/treasury/report?dateFrom=2026-08-30&dateTo=2026-08-30")
      .set("Authorization", authHeader());

    expect(report.status).toBe(200);
    expect(report.body.data.totalSafeBalanceMinor).toBe(25000);
    expect(report.body.data.inflowMinor).toBe(30000);
    expect(report.body.data.outflowMinor).toBe(5000);
    expect(report.body.data.netMovementMinor).toBe(25000);
    expect(report.body.data.bySafe[0].currentBalanceMinor).toBe(25000);
  });
});
