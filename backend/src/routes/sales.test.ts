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

async function createCustomer(): Promise<string> {
  const response = await request(app)
    .post("/api/customers")
    .set("Authorization", authHeader())
    .send({ companyName: "Retail Client" });

  return response.body.id as string;
}

async function createSafe(openingBalance = 0): Promise<string> {
  const response = await request(app)
    .post("/api/safes")
    .set("Authorization", authHeader())
    .send({ name: `Cash ${Date.now()}`, openingBalance });

  return response.body.id as string;
}

async function createFinishedVariant(quantity = 10): Promise<string> {
  const supplierResponse = await request(app)
    .post("/api/suppliers")
    .set("Authorization", authHeader())
    .send({ name: `Fabric Co ${Date.now()}` });
  const supplierId = supplierResponse.body.id as string;

  const materialResponse = await request(app)
    .post("/api/materials")
    .set("Authorization", authHeader())
    .send({ name: `Cotton ${Date.now()}`, unit: "meter", supplierId });
  const materialId = materialResponse.body.id as string;

  await request(app)
    .post("/api/material-receivings")
    .set("Authorization", authHeader())
    .send({
      supplierId,
      receivingDate: "2026-08-29",
      items: [{ materialId, quantity: 100, unitPrice: 10 }]
    });

  const modelResponse = await request(app)
    .post("/api/models")
    .set("Authorization", authHeader())
    .send({
      modelCode: `SALE-${Date.now()}`,
      modelName: "Sale Shirt",
      mainMaterialId: materialId
    });
  const modelId = modelResponse.body.id as string;

  const variantResponse = await request(app)
    .post(`/api/models/${modelId}/variants`)
    .set("Authorization", authHeader())
    .send({ sizeId: "size-m", colorId: "color-white" });
  const variantId = variantResponse.body.id as string;

  const batchResponse = await request(app)
    .post("/api/production-batches")
    .set("Authorization", authHeader())
    .send({
      modelId,
      plannedQuantity: quantity,
      consumptions: [{ materialId, quantity: quantity * 2 }],
      outputs: [{ modelVariantId: variantId, goodQuantity: quantity }],
      costComponents: [{ componentName: "Labor", amount: quantity * 5 }]
    });
  const batchId = batchResponse.body.id as string;

  await request(app)
    .post(`/api/production-batches/${batchId}/start`)
    .set("Authorization", authHeader())
    .send({ startDate: "2026-08-29" });

  await request(app)
    .post(`/api/production-batches/${batchId}/complete`)
    .set("Authorization", authHeader())
    .send({ completedDate: "2026-08-29" });

  return variantId;
}

describe("sales routes", () => {
  beforeEach(() => {
    migrate();
    seed();
    setupAuthUser();
  });

  afterEach(() => {
    const db = getDatabase();
    db.exec(`
      DELETE FROM customer_payment_allocations;
      DELETE FROM customer_payments;
      DELETE FROM sales_invoice_items;
      DELETE FROM sales_invoices;
      DELETE FROM customer_ledger_entries;
      DELETE FROM production_overhead_allocations;
      DELETE FROM finished_stock_movements;
      DELETE FROM production_cost_components;
      DELETE FROM production_material_consumptions;
      DELETE FROM production_batch_outputs;
      DELETE FROM production_batches;
      DELETE FROM material_stock_movements;
      DELETE FROM material_receiving_items;
      DELETE FROM material_receivings;
      DELETE FROM supplier_ledger_entries;
      DELETE FROM safe_transactions;
      DELETE FROM safes;
      DELETE FROM model_variants;
      DELETE FROM models;
      DELETE FROM materials;
      DELETE FROM suppliers;
      DELETE FROM customers;
      DELETE FROM users WHERE id = 'test-admin-id';
    `);
  });

  it("confirms a sales invoice, reduces finished stock, and records customer payment", async () => {
    const customerId = await createCustomer();
    const safeId = await createSafe(0);
    const variantId = await createFinishedVariant(10);

    const invoiceResponse = await request(app)
      .post("/api/sales-invoices")
      .set("Authorization", authHeader())
      .send({
        customerId,
        invoiceDate: "2026-08-29",
        confirm: true,
        items: [{ modelVariantId: variantId, quantity: 4, unitPrice: 100 }]
      });

    expect(invoiceResponse.status).toBe(201);
    expect(invoiceResponse.body.invoiceNumber).toMatch(/^SI-/);
    expect(invoiceResponse.body.status).toBe("confirmed");
    expect(invoiceResponse.body.costOfGoodsMinor).toBeGreaterThan(0);

    const inventory = await request(app)
      .get("/api/finished-inventory")
      .set("Authorization", authHeader());
    const stockRow = inventory.body.data.find((row: { id: string }) => row.id === variantId);
    expect(stockRow.currentQuantity).toBe(6);

    const paymentResponse = await request(app)
      .post("/api/customer-payments")
      .set("Authorization", authHeader())
      .send({
        customerId,
        paymentDate: "2026-08-29",
        amount: 250,
        safeId,
        allocations: [{ salesInvoiceId: invoiceResponse.body.id, allocatedAmount: 250 }]
      });

    expect(paymentResponse.status).toBe(201);
    expect(paymentResponse.body.paymentNumber).toMatch(/^CP-/);

    const invoiceDetail = await request(app)
      .get(`/api/sales-invoices/${invoiceResponse.body.id}`)
      .set("Authorization", authHeader());
    expect(invoiceDetail.body.data.paidMinor).toBe(25000);
    expect(invoiceDetail.body.data.remainingMinor).toBe(15000);

    const ledger = await request(app)
      .get(`/api/customers/${customerId}/ledger`)
      .set("Authorization", authHeader());
    expect(ledger.body.balanceMinor).toBe(15000);

    const safe = await request(app)
      .get(`/api/safes/${safeId}`)
      .set("Authorization", authHeader());
    expect(safe.body.data.currentBalanceMinor).toBe(25000);
  });

  it("blocks confirmation when finished stock is insufficient", async () => {
    const customerId = await createCustomer();
    const variantId = await createFinishedVariant(2);

    const createResponse = await request(app)
      .post("/api/sales-invoices")
      .set("Authorization", authHeader())
      .send({
        customerId,
        invoiceDate: "2026-08-29",
        items: [{ modelVariantId: variantId, quantity: 5, unitPrice: 100 }]
      });

    const confirmResponse = await request(app)
      .post(`/api/sales-invoices/${createResponse.body.id}/confirm`)
      .set("Authorization", authHeader())
      .send({});

    expect(confirmResponse.status).toBe(409);
    expect(confirmResponse.body.message).toContain("Insufficient finished stock");
  });

  it("blocks payment allocation above invoice remaining balance", async () => {
    const customerId = await createCustomer();
    const safeId = await createSafe(0);
    const variantId = await createFinishedVariant(5);

    const invoiceResponse = await request(app)
      .post("/api/sales-invoices")
      .set("Authorization", authHeader())
      .send({
        customerId,
        invoiceDate: "2026-08-29",
        confirm: true,
        items: [{ modelVariantId: variantId, quantity: 1, unitPrice: 100 }]
      });

    const paymentResponse = await request(app)
      .post("/api/customer-payments")
      .set("Authorization", authHeader())
      .send({
        customerId,
        paymentDate: "2026-08-29",
        amount: 150,
        safeId,
        allocations: [{ salesInvoiceId: invoiceResponse.body.id, allocatedAmount: 150 }]
      });

    expect(paymentResponse.status).toBe(409);
    expect(paymentResponse.body.message).toContain("Allocation exceeds invoice remaining balance");
  });

  it("updates draft invoice items before confirmation", async () => {
    const customerId = await createCustomer();
    const variantId = await createFinishedVariant(5);

    const invoiceResponse = await request(app)
      .post("/api/sales-invoices")
      .set("Authorization", authHeader())
      .send({
        customerId,
        invoiceDate: "2026-08-29",
        items: [{ modelVariantId: variantId, quantity: 1, unitPrice: 100 }]
      });

    const updateResponse = await request(app)
      .put(`/api/sales-invoices/${invoiceResponse.body.id}`)
      .set("Authorization", authHeader())
      .send({
        customerId,
        invoiceDate: "2026-08-29",
        discountAmount: 10,
        items: [{ modelVariantId: variantId, quantity: 2, unitPrice: 120 }]
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.totalMinor).toBe(23000);

    const detailResponse = await request(app)
      .get(`/api/sales-invoices/${invoiceResponse.body.id}`)
      .set("Authorization", authHeader());

    expect(detailResponse.body.data.items).toHaveLength(1);
    expect(detailResponse.body.data.items[0].quantity).toBe(2);
    expect(detailResponse.body.data.totalMinor).toBe(23000);
  });

  it("cancels an unpaid confirmed invoice and reverses stock and customer ledger", async () => {
    const customerId = await createCustomer();
    const variantId = await createFinishedVariant(5);

    const invoiceResponse = await request(app)
      .post("/api/sales-invoices")
      .set("Authorization", authHeader())
      .send({
        customerId,
        invoiceDate: "2026-08-29",
        confirm: true,
        items: [{ modelVariantId: variantId, quantity: 2, unitPrice: 100 }]
      });

    const cancelResponse = await request(app)
      .post(`/api/sales-invoices/${invoiceResponse.body.id}/cancel`)
      .set("Authorization", authHeader())
      .send({});

    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.status).toBe("cancelled");

    const inventory = await request(app)
      .get("/api/finished-inventory")
      .set("Authorization", authHeader());
    const stockRow = inventory.body.data.find((row: { id: string }) => row.id === variantId);
    expect(stockRow.currentQuantity).toBe(5);

    const ledger = await request(app)
      .get(`/api/customers/${customerId}/ledger`)
      .set("Authorization", authHeader());
    expect(ledger.body.balanceMinor).toBe(0);
  });

  it("blocks cancelling an invoice after a payment allocation", async () => {
    const customerId = await createCustomer();
    const safeId = await createSafe(0);
    const variantId = await createFinishedVariant(5);

    const invoiceResponse = await request(app)
      .post("/api/sales-invoices")
      .set("Authorization", authHeader())
      .send({
        customerId,
        invoiceDate: "2026-08-29",
        confirm: true,
        items: [{ modelVariantId: variantId, quantity: 1, unitPrice: 100 }]
      });

    await request(app)
      .post("/api/customer-payments")
      .set("Authorization", authHeader())
      .send({
        customerId,
        paymentDate: "2026-08-29",
        amount: 50,
        safeId,
        allocations: [{ salesInvoiceId: invoiceResponse.body.id, allocatedAmount: 50 }]
      });

    const cancelResponse = await request(app)
      .post(`/api/sales-invoices/${invoiceResponse.body.id}/cancel`)
      .set("Authorization", authHeader())
      .send({});

    expect(cancelResponse.status).toBe(409);
    expect(cancelResponse.body.message).toContain("Paid invoices cannot be cancelled");
  });

  it("reverses a customer payment and allows the unpaid invoice to be cancelled", async () => {
    const customerId = await createCustomer();
    const safeId = await createSafe(0);
    const variantId = await createFinishedVariant(5);

    const invoiceResponse = await request(app)
      .post("/api/sales-invoices")
      .set("Authorization", authHeader())
      .send({
        customerId,
        invoiceDate: "2026-08-29",
        confirm: true,
        items: [{ modelVariantId: variantId, quantity: 1, unitPrice: 100 }]
      });

    const paymentResponse = await request(app)
      .post("/api/customer-payments")
      .set("Authorization", authHeader())
      .send({
        customerId,
        paymentDate: "2026-08-29",
        amount: 100,
        safeId,
        allocations: [{ salesInvoiceId: invoiceResponse.body.id, allocatedAmount: 100 }]
      });

    const reverseResponse = await request(app)
      .post(`/api/customer-payments/${paymentResponse.body.id}/reverse`)
      .set("Authorization", authHeader())
      .send({ reversalDate: "2026-08-29", notes: "Entry mistake" });

    expect(reverseResponse.status).toBe(200);
    expect(reverseResponse.body.status).toBe("reversed");

    const invoiceDetail = await request(app)
      .get(`/api/sales-invoices/${invoiceResponse.body.id}`)
      .set("Authorization", authHeader());
    expect(invoiceDetail.body.data.paidMinor).toBe(0);
    expect(invoiceDetail.body.data.remainingMinor).toBe(10000);

    const ledger = await request(app)
      .get(`/api/customers/${customerId}/ledger`)
      .set("Authorization", authHeader());
    expect(ledger.body.balanceMinor).toBe(10000);

    const safe = await request(app)
      .get(`/api/safes/${safeId}`)
      .set("Authorization", authHeader());
    expect(safe.body.data.currentBalanceMinor).toBe(0);

    const cancelResponse = await request(app)
      .post(`/api/sales-invoices/${invoiceResponse.body.id}/cancel`)
      .set("Authorization", authHeader())
      .send({});
    expect(cancelResponse.status).toBe(200);
  });
});
