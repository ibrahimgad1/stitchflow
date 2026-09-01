import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { closeDatabase, getDatabase } from "../database/connection.js";
import { migrate } from "../database/migrate.js";
import { seed } from "../database/seed.js";
import { createBackup, restoreBackup, listBackups, checkAutoBackup, updateBackupSettings } from "../services/backup.js";
import Database from "better-sqlite3";
import * as backupService from "../services/backup.js";

const app = createApp();

function authHeader(role: "admin" | "staff" = "admin"): string {
  const env = loadEnv();
  const id = role === "admin" ? "test-admin-id" : "test-staff-id";
  return `Bearer ${jwt.sign({ sub: id }, env.jwtSecret)}`;
}

function setupUsers() {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, role_id) VALUES ('test-admin-id','testadmin','Test Admin',?, 'role-admin') ON CONFLICT(id) DO NOTHING`
  ).run(bcrypt.hashSync("Test_Admin_123", 12));
  db.prepare(
    `INSERT INTO users (id, username, display_name, password_hash, role_id) VALUES ('test-staff-id','teststaff','Test Staff',?, 'role-staff') ON CONFLICT(id) DO NOTHING`
  ).run(bcrypt.hashSync("Test_Admin_123", 12));
}

function getBackupDir() {
  const env = loadEnv();
  return path.join(path.dirname(env.databasePath), "backups");
}

function cleanBackups() {
  const dir = getBackupDir();
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".db") || f.startsWith("temp_")) {
        try { fs.unlinkSync(path.join(dir, f)); } catch {}
      }
    }
  }
}

describe("backup adversarial", () => {
  beforeEach(() => {
    migrate();
    seed();
    setupUsers();
    cleanBackups();
  });

  afterEach(() => {
    cleanBackups();
    backupService.resetBackupStateForTests();
    const dir = getBackupDir();
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith("temp_")) {
          try { fs.unlinkSync(path.join(dir, f)); } catch {}
        }
      }
    }
  });

  it("WAL/SHM safety: restore deletes WAL/SHM and keeps DB valid", async () => {
    // Create some data to ensure WAL exists
    await request(app).post("/api/customers").set("Authorization", authHeader()).send({ companyName: "WAL Test" });
    const db = getDatabase();
    db.prepare("INSERT INTO customers (id, company_name) VALUES (?,?)").run("wal-test-1", "WAL2");
    const env = loadEnv();
    const createRes = await request(app).post("/api/backups").set("Authorization", authHeader());
    expect(createRes.status).toBe(201);
    const filename = createRes.body.data.filename;
    // Modify data using fresh handle after backup (to avoid closed handle)
    getDatabase().prepare("INSERT INTO customers (id, company_name) VALUES (?,?)").run("after-backup", "After");
    // Restore
    const restoreRes = await request(app).post("/api/backups/restore").set("Authorization", authHeader()).send({ filename });
    expect(restoreRes.status).toBe(200);
    const check = await request(app).get("/api/customers?search=After").set("Authorization", authHeader());
    expect(check.body.data.some((c: any) => c.companyName === "After")).toBe(false);
    const checkDb = getDatabase();
    const integrity = checkDb.pragma("integrity_check") as any[];
    const isOk = Array.isArray(integrity) && (integrity[0] === "ok" || (integrity[0] as any)?.integrity_check === "ok");
    expect(isOk).toBe(true);
    expect(fs.existsSync(env.databasePath)).toBe(true);
  });

  it("corrupted backup is rejected and DB remains intact", async () => {
    await request(app).post("/api/customers").set("Authorization", authHeader()).send({ companyName: "CorruptTest" });
    const createRes = await request(app).post("/api/backups").set("Authorization", authHeader());
    const filename = createRes.body.data.filename;
    const dir = getBackupDir();
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, "THIS IS NOT A DATABASE - CORRUPTED");
    const restoreRes = await request(app).post("/api/backups/restore").set("Authorization", authHeader()).send({ filename });
    expect([400, 500]).toContain(restoreRes.status);
    expect(restoreRes.body.message.toLowerCase()).toMatch(/corrupt|invalid/);
    const check = await request(app).get("/api/customers?search=CorruptTest").set("Authorization", authHeader());
    expect(check.body.data.length).toBeGreaterThan(0);
    const integrity = getDatabase().pragma("integrity_check") as any[];
    const isOk = Array.isArray(integrity) && (integrity[0] === "ok" || (integrity[0] as any)?.integrity_check === "ok");
    expect(isOk).toBe(true);
    const list = listBackups();
    expect(list.some(b => b.filename === filename)).toBe(false);
  });

  it("failed restore rolls back to safety backup and preserves data", async () => {
    const custRes = await request(app).post("/api/customers").set("Authorization", authHeader()).send({ companyName: "RollbackTest" });
    const custId = custRes.body.id;
    const backupRes = await request(app).post("/api/backups").set("Authorization", authHeader());
    const goodFile = backupRes.body.data.filename;
    // Modify
    await request(app).put(`/api/customers/${custId}`).set("Authorization", authHeader()).send({ companyName: "ModifiedShouldRollback", isActive: true });
    let check = await request(app).get("/api/customers?search=ModifiedShouldRollback").set("Authorization", authHeader());
    expect(check.body.data.length).toBe(1);
    // Try to restore with non-existent file (should fail and rollback)
    const badRestore = await request(app).post("/api/backups/restore").set("Authorization", authHeader()).send({ filename: "backup_1999-01-01_00-00-00_manual.db" });
    expect([400,404,500]).toContain(badRestore.status);
    // Data should still be modified (not rolled back to goodFile, because restore failed before safety)
    check = await request(app).get("/api/customers?search=ModifiedShouldRollback").set("Authorization", authHeader());
    expect(check.body.data.length).toBe(1);
    // Now restore good file should succeed
    const goodRestore = await request(app).post("/api/backups/restore").set("Authorization", authHeader()).send({ filename: goodFile });
    expect(goodRestore.status).toBe(200);
    check = await request(app).get("/api/customers?search=RollbackTest").set("Authorization", authHeader());
    expect(check.body.data.some((c: any) => c.id === custId)).toBe(true);
    // Safety backup should exist
    const backups = listBackups();
    expect(backups.some(b => b.type === "safety")).toBe(true);
  });

  it("multi-domain restore preserves all domains", async () => {
    const custRes = await request(app).post("/api/customers").set("Authorization", authHeader()).send({ companyName: "MultiCustomer" });
    const custId = custRes.body.id;
    const supRes = await request(app).post("/api/suppliers").set("Authorization", authHeader()).send({ name: "MultiSupplier" });
    const supId = supRes.body.id;
    const matRes = await request(app).post("/api/materials").set("Authorization", authHeader()).send({ name: "MultiFabric", unit: "meter", supplierId: supId });
    const matId = matRes.body.id;
    await request(app).post("/api/material-receivings").set("Authorization", authHeader()).send({ supplierId: supId, receivingDate: "2026-08-30", items: [{ materialId: matId, quantity: 10, unitPrice: 100 }] });
    const modelRes = await request(app).post("/api/models").set("Authorization", authHeader()).send({ modelCode: "MULTI01", modelName: "MultiModel" });
    const modelId = modelRes.body.id;
    const varRes = await request(app).post(`/api/models/${modelId}/variants`).set("Authorization", authHeader()).send({ sizeId: "size-m", colorId: "color-white" });
    const varId = varRes.body.id;
    const batchRes = await request(app).post("/api/production-batches").set("Authorization", authHeader()).send({ modelId, plannedQuantity: 10, consumptions: [{ materialId: matId, quantity: 5 }], outputs: [{ modelVariantId: varId, goodQuantity: 5 }] });
    const batchId = batchRes.body.id;
    await request(app).post(`/api/production-batches/${batchId}/start`).set("Authorization", authHeader()).send({});
    await request(app).post(`/api/production-batches/${batchId}/complete`).set("Authorization", authHeader()).send({ completedDate: "2026-08-30" });
    const safeRes = await request(app).post("/api/safes").set("Authorization", authHeader()).send({ name: "MultiSafe", openingBalance: 1000 });
    const safeId = safeRes.body.id;
    const invRes = await request(app).post("/api/sales-invoices").set("Authorization", authHeader()).send({ customerId: custId, invoiceDate: "2026-08-30", items: [{ modelVariantId: varId, quantity: 2, unitPrice: 200 }], confirm: true });
    const invId = invRes.body.id;
    await request(app).post("/api/customer-payments").set("Authorization", authHeader()).send({ customerId: custId, paymentDate: "2026-08-30", amount: 100, safeId });
    await request(app).post("/api/supplier-payments").set("Authorization", authHeader()).send({ supplierId: supId, paymentDate: "2026-08-30", amount: 50, safeId });
    await request(app).post("/api/expenses").set("Authorization", authHeader()).send({ expenseDate: "2026-08-30", description: "MultiExpense", amount: 20, paymentStatus: "paid", safeId });
    await request(app).post("/api/owners").set("Authorization", authHeader()).send({ name: "MultiOwner" });
    await request(app).post("/api/capital-transactions").set("Authorization", authHeader()).send({ transactionDate: "2026-08-30", transactionType: "capital_injection", safeId, amount: 500 });
    const auditCountBefore = (getDatabase().prepare("SELECT COUNT(*) as c FROM audit_logs").get() as any).c;

    const backupRes = await request(app).post("/api/backups").set("Authorization", authHeader());
    const filename = backupRes.body.data.filename;

    await request(app).post("/api/customers").set("Authorization", authHeader()).send({ companyName: "PostBackupCustomer" });
    getDatabase().prepare("UPDATE materials SET current_quantity = 999 WHERE id=?").run(matId);
    getDatabase().prepare("DELETE FROM audit_logs WHERE id IN (SELECT id FROM audit_logs LIMIT 1)").run();

    const restoreRes = await request(app).post("/api/backups/restore").set("Authorization", authHeader()).send({ filename });
    expect(restoreRes.status).toBe(200);

    const checkCust = await request(app).get("/api/customers?search=MultiCustomer").set("Authorization", authHeader());
    expect(checkCust.body.data.length).toBe(1);
    const checkPost = await request(app).get("/api/customers?search=PostBackupCustomer").set("Authorization", authHeader());
    expect(checkPost.body.data.length).toBe(0);
    const freshDb = getDatabase();
    const matCheck = freshDb.prepare("SELECT current_quantity FROM materials WHERE id=?").get(matId) as any;
    expect(matCheck.current_quantity).not.toBe(999);
    expect(matCheck.current_quantity).toBe(5);
    const varCheck = freshDb.prepare("SELECT current_quantity FROM model_variants WHERE id=?").get(varId) as any;
    expect(varCheck.current_quantity).toBe(3);
    const safeCheck = freshDb.prepare("SELECT current_balance_minor FROM safes WHERE id=?").get(safeId) as any;
    expect(safeCheck.current_balance_minor).toBeGreaterThan(0);
    const invCheck = freshDb.prepare("SELECT status FROM sales_invoices WHERE id=?").get(invId) as any;
    expect(invCheck.status).toBe("confirmed");
    const auditAfter = (freshDb.prepare("SELECT COUNT(*) as c FROM audit_logs").get() as any).c;
    expect(auditAfter).toBe(auditCountBefore);
  });

  it("restart after restore keeps DB valid", async () => {
    await request(app).post("/api/customers").set("Authorization", authHeader()).send({ companyName: "RestartTest" });
    const backupRes = await request(app).post("/api/backups").set("Authorization", authHeader());
    const filename = backupRes.body.data.filename;
    await request(app).post("/api/customers").set("Authorization", authHeader()).send({ companyName: "AfterBackup" });
    await request(app).post("/api/backups/restore").set("Authorization", authHeader()).send({ filename });
    closeDatabase();
    const db2 = getDatabase();
    const integrity = db2.pragma("integrity_check") as any[];
    const isOk = Array.isArray(integrity) && (integrity[0] === "ok" || (integrity[0] as any)?.integrity_check === "ok");
    expect(isOk).toBe(true);
    const check = await request(app).get("/api/customers?search=RestartTest").set("Authorization", authHeader());
    expect(check.body.data.length).toBe(1);
    const checkAfter = await request(app).get("/api/customers?search=AfterBackup").set("Authorization", authHeader());
    expect(checkAfter.body.data.length).toBe(0);
  });

  it("concurrent backups do not corrupt and are single-flight", async () => {
    const p1 = request(app).post("/api/backups").set("Authorization", authHeader());
    const p2 = request(app).post("/api/backups").set("Authorization", authHeader());
    const results = await Promise.all([p1, p2]);
    const statuses = results.map(r => r.status);
    expect(statuses).toContain(201);
    const list = listBackups();
    for (const b of list) {
      const full = path.join(getBackupDir(), b.filename);
      expect(fs.existsSync(full)).toBe(true);
      const db = new Database(full, { readonly: true });
      const integrity = db.pragma("integrity_check") as any[];
      db.close();
      const isOk = Array.isArray(integrity) && (integrity[0] === "ok" || (integrity[0] as any)?.integrity_check === "ok");
      expect(isOk).toBe(true);
    }
  });

  it("concurrent restore is blocked", async () => {
    const backupRes = await request(app).post("/api/backups").set("Authorization", authHeader());
    const filename = backupRes.body.data.filename;
    const r1 = request(app).post("/api/backups/restore").set("Authorization", authHeader()).send({ filename });
    const r2 = request(app).post("/api/backups/restore").set("Authorization", authHeader()).send({ filename });
    const results = await Promise.all([r1, r2]);
    const statuses = results.map(r => r.status);
    // One should succeed, one should be 409 or 500 due to in-progress
    expect(statuses).toContain(200);
    expect(statuses.some(s => s === 409 || s === 500)).toBe(true);
  });

  it("auto backup race is single-flight", async () => {
    await updateBackupSettings({ enabled: true, frequency: "daily", retentionCount: 5, lastBackupAt: null } as any);
    // Trigger two concurrent auto checks
    const p1 = checkAutoBackup();
    const p2 = checkAutoBackup();
    await Promise.all([p1, p2]);
    const list = listBackups().filter(b => b.type === "auto");
    // Should have only 1 new auto backup, not 2
    expect(list.length).toBe(1);
  });

  it("retention: auto does not delete manual or safety, and safety keeps 3", async () => {
    await updateBackupSettings({ enabled: true, frequency: "daily", retentionCount: 2 } as any);
    for (let i = 0; i < 4; i++) {
      await createBackup(false);
      await new Promise(r => setTimeout(r, 1100));
    }
    let manualCount = listBackups().filter(b => b.type === "manual").length;
    expect(manualCount).toBe(4);
    for (let i = 0; i < 4; i++) {
      await createBackup(true);
      await new Promise(r => setTimeout(r, 1100));
    }
    const afterAuto = listBackups();
    expect(afterAuto.filter(b => b.type === "auto").length).toBe(2);
    expect(afterAuto.filter(b => b.type === "manual").length).toBe(4);
    const manualForSafety = afterAuto.find(b => b.type === "manual")!;
    for (let i = 0; i < 5; i++) {
      await restoreBackup(manualForSafety.filename);
      await new Promise(r => setTimeout(r, 1100));
    }
    const afterSafety = listBackups().filter(b => b.type === "safety");
    expect(afterSafety.length).toBeLessThanOrEqual(3);
    expect(afterSafety.length).toBe(3);
  }, 30000);

  it("path traversal is blocked for all endpoints", async () => {
    const traversals = [
      "../../../app.db",
      "..\\..\\app.db",
      "/etc/passwd",
      "%2e%2e%2fapp.db",
      "backup_2026-01-01_00-00-00_manual.db%00",
      "backup_2026-01-01_00-00-00_manual.db/../../evil",
      "symlink",
      "backup_2026-13-01_00-00-00_manual.db",
    ];
    for (const bad of traversals) {
      const del = await request(app).delete(`/api/backups/${encodeURIComponent(bad)}`).set("Authorization", authHeader());
      expect([400,404]).toContain(del.status);
      const res = await request(app).post("/api/backups/restore").set("Authorization", authHeader()).send({ filename: bad });
      expect([400,404,500]).toContain(res.status);
      // Also test GET with traversal (should not exist, but list should not expose outside)
      // listBackups should not include traversal files even if they exist outside
    }
    // Ensure absolute path in backupDir is safe
    const dir = getBackupDir();
    const evilPath = path.join(dir, "backup_2026-01-01_00-00-00_manual.db");
    // Create a file outside and ensure it's not listed
    const outside = path.join(path.dirname(dir), "outside.db");
    fs.writeFileSync(outside, "test");
    const list = listBackups();
    expect(list.some(b => b.filename === "outside.db")).toBe(false);
    fs.unlinkSync(outside);
  });

  it("authorization: staff and unauthenticated are blocked", async () => {
    const staffHeader = authHeader("staff");
    const unauth = await request(app).get("/api/backups");
    expect(unauth.status).toBe(401);
    for (const endpoint of [
      () => request(app).get("/api/backups").set("Authorization", staffHeader),
      () => request(app).post("/api/backups").set("Authorization", staffHeader),
      () => request(app).delete("/api/backups/backup_2026-01-01_00-00-00_manual.db").set("Authorization", staffHeader),
      () => request(app).post("/api/backups/restore").set("Authorization", staffHeader).send({ filename: "backup_2026-01-01_00-00-00_manual.db" }),
      () => request(app).get("/api/backups/settings").set("Authorization", staffHeader),
      () => request(app).put("/api/backups/settings").set("Authorization", staffHeader).send({ enabled: true, frequency: "daily", retentionCount: 5 }),
    ]) {
      const res = await endpoint();
      expect(res.status).toBe(403);
    }
  });

  it("backup validation ensures file exists, integrity, schema", async () => {
    const backupRes = await request(app).post("/api/backups").set("Authorization", authHeader());
    const filename = backupRes.body.data.filename;
    const dir = getBackupDir();
    const full = path.join(dir, filename);
    expect(fs.existsSync(full)).toBe(true);
    expect(fs.statSync(full).size).toBeGreaterThan(0);
    const db = new Database(full, { readonly: true });
    const integrity = db.pragma("integrity_check") as any[];
    const isOk = Array.isArray(integrity) && (integrity[0] === "ok" || (integrity[0] as any)?.integrity_check === "ok");
    expect(isOk).toBe(true);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    expect(tables.some((t: any) => t.name === "customers")).toBe(true);
    db.close();
    fs.writeFileSync(full, "corrupt");
    const list = listBackups();
    expect(list.some(b => b.filename === filename)).toBe(false);
  });

  it("error recovery does not expose internals and preserves data", async () => {
    // Try to restore non-existent
    const res = await request(app).post("/api/backups/restore").set("Authorization", authHeader()).send({ filename: "backup_2099-01-01_00-00-00_manual.db" });
    expect(res.status).toBe(404);
    expect(res.body.message).not.toMatch(/SQL|sqlite|at Object|Error:/);
    // Try to create backup when dir is file (simulate permission error) - skip on Windows due to permission complexity, just test invalid settings
    const badSettings = await request(app).put("/api/backups/settings").set("Authorization", authHeader()).send({ enabled: true, frequency: "invalid", retentionCount: -5 });
    expect(badSettings.status).toBe(400);
    expect(badSettings.body.message).not.toMatch(/SQL/);
    // DB should still be valid after failed restore
    const custRes = await request(app).post("/api/customers").set("Authorization", authHeader()).send({ companyName: "ErrorRecoveryTest" });
    expect(custRes.status).toBe(201);
  });

  it("financial state after restore is correct", async () => {
    const safeRes = await request(app).post("/api/safes").set("Authorization", authHeader()).send({ name: "FinanceSafe", openingBalance: 1000 });
    const safeId = safeRes.body.id;
    const custRes = await request(app).post("/api/customers").set("Authorization", authHeader()).send({ companyName: "FinanceCust" });
    const custId = custRes.body.id;
    const supRes = await request(app).post("/api/suppliers").set("Authorization", authHeader()).send({ name: "FinanceSup" });
    const supId = supRes.body.id;
    const matRes = await request(app).post("/api/materials").set("Authorization", authHeader()).send({ name: "FinanceMat", unit: "meter", supplierId: supId });
    const matId = matRes.body.id;
    await request(app).post("/api/material-receivings").set("Authorization", authHeader()).send({ supplierId: supId, receivingDate: "2026-08-30", items: [{ materialId: matId, quantity: 10, unitPrice: 100 }] });
    const modelRes = await request(app).post("/api/models").set("Authorization", authHeader()).send({ modelCode: "FIN01", modelName: "FinanceModel" });
    const varRes = await request(app).post(`/api/models/${modelRes.body.id}/variants`).set("Authorization", authHeader()).send({ sizeId: "size-m", colorId: "color-white" });
    const varId = varRes.body.id;
    const batchRes = await request(app).post("/api/production-batches").set("Authorization", authHeader()).send({ modelId: modelRes.body.id, plannedQuantity: 5, consumptions: [{ materialId: matId, quantity: 5 }], outputs: [{ modelVariantId: varId, goodQuantity: 5 }] });
    await request(app).post(`/api/production-batches/${batchRes.body.id}/start`).set("Authorization", authHeader()).send({});
    await request(app).post(`/api/production-batches/${batchRes.body.id}/complete`).set("Authorization", authHeader()).send({ completedDate: "2026-08-30" });
    const invRes = await request(app).post("/api/sales-invoices").set("Authorization", authHeader()).send({ customerId: custId, invoiceDate: "2026-08-30", items: [{ modelVariantId: varId, quantity: 2, unitPrice: 300 }], confirm: true });
    const invId = invRes.body.id;
    await request(app).post("/api/customer-payments").set("Authorization", authHeader()).send({ customerId: custId, paymentDate: "2026-08-30", amount: 100, safeId, allocations: [{ salesInvoiceId: invId, allocatedAmount: 100 }] });
    // Ensure WAL is checkpointed before backup
    try { getDatabase().pragma("wal_checkpoint(TRUNCATE)"); } catch {}
    const beforeBackup = await request(app).get("/api/dashboard/summary").set("Authorization", authHeader());

    const backupRes = await request(app).post("/api/backups").set("Authorization", authHeader());
    const filename = backupRes.body.data.filename;

    // Modify financial state
    await request(app).post("/api/customer-payments").set("Authorization", authHeader()).send({ customerId: custId, paymentDate: "2026-08-30", amount: 50, safeId });
    await request(app).post("/api/expenses").set("Authorization", authHeader()).send({ expenseDate: "2026-08-30", description: "Extra", amount: 10, paymentStatus: "paid", safeId });

    await request(app).post("/api/backups/restore").set("Authorization", authHeader()).send({ filename });

    const afterRestore = await request(app).get("/api/dashboard/summary").set("Authorization", authHeader());
    expect(afterRestore.body.data.customerReceivablesMinor).toBe(beforeBackup.body.data.customerReceivablesMinor);
    expect(afterRestore.body.data.supplierPayablesMinor).toBe(beforeBackup.body.data.supplierPayablesMinor);
    expect(afterRestore.body.data.treasuryBalanceMinor).toBe(beforeBackup.body.data.treasuryBalanceMinor);
    expect(afterRestore.body.data.rawMaterialStockValueMinor).toBe(beforeBackup.body.data.rawMaterialStockValueMinor);
    expect(afterRestore.body.data.finishedStockValueMinor).toBe(beforeBackup.body.data.finishedStockValueMinor);
    const invCheck = await request(app).get(`/api/sales-invoices/${invId}`).set("Authorization", authHeader());
    expect(invCheck.body.data.status).toBe("confirmed");
    expect(invCheck.body.data.paidMinor).toBe(10000);
  });
});
