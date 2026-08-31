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

async function createMaterial(supplierId: string, quantity = 0, unitPrice = 0): Promise<string> {
  const response = await request(app)
    .post("/api/materials")
    .set("Authorization", authHeader())
    .send({ name: `Cotton ${Date.now()}`, unit: "meter", supplierId });

  const materialId = response.body.id as string;

  if (quantity > 0) {
    await request(app)
      .post("/api/material-receivings")
      .set("Authorization", authHeader())
      .send({
        supplierId,
        receivingDate: "2026-08-29",
        items: [{ materialId, quantity, unitPrice }]
      });
  }

  return materialId;
}

async function createModelWithVariant(materialId: string): Promise<{
  modelId: string;
  variantId: string;
}> {
  const modelResponse = await request(app)
    .post("/api/models")
    .set("Authorization", authHeader())
    .send({
      modelCode: `MDL-${Date.now()}`,
      modelName: "Basic Shirt",
      mainMaterialId: materialId
    });

  const modelId = modelResponse.body.id as string;

  const variantResponse = await request(app)
    .post(`/api/models/${modelId}/variants`)
    .set("Authorization", authHeader())
    .send({
      sizeId: "size-m",
      colorId: "color-white"
    });

  return { modelId, variantId: variantResponse.body.id as string };
}

describe("production routes", () => {
  beforeEach(() => {
    migrate();
    seed();
    setupAuthUser();
  });

  afterEach(() => {
    const db = getDatabase();
    db.exec(`
      DELETE FROM production_overhead_allocations;
      DELETE FROM finished_stock_movements;
      DELETE FROM production_cost_components;
      DELETE FROM production_material_consumptions;
      DELETE FROM production_batch_outputs;
      DELETE FROM production_batches;
      DELETE FROM overhead_entries;
      DELETE FROM overhead_periods;
      DELETE FROM material_stock_movements;
      DELETE FROM material_receiving_items;
      DELETE FROM material_receivings;
      DELETE FROM supplier_ledger_entries;
      DELETE FROM model_variants;
      DELETE FROM models;
      DELETE FROM materials;
      DELETE FROM suppliers;
      DELETE FROM users WHERE id = 'test-admin-id';
    `);
  });

  it("creates, starts, completes a batch and updates finished stock", async () => {
    const supplierId = await createSupplier();
    const materialId = await createMaterial(supplierId, 100, 10);
    const { modelId, variantId } = await createModelWithVariant(materialId);

    const createResponse = await request(app)
      .post("/api/production-batches")
      .set("Authorization", authHeader())
      .send({
        modelId,
        plannedQuantity: 50,
        consumptions: [{ materialId, quantity: 20 }],
        outputs: [{ modelVariantId: variantId, goodQuantity: 10 }],
        costComponents: [{ componentName: "Labor", amount: 50 }]
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.batchNumber).toMatch(/^PB-/);

    const batchId = createResponse.body.id as string;

    const startResponse = await request(app)
      .post(`/api/production-batches/${batchId}/start`)
      .set("Authorization", authHeader())
      .send({ startDate: "2026-08-29" });

    expect(startResponse.status).toBe(200);
    expect(startResponse.body.status).toBe("in_progress");

    const completeResponse = await request(app)
      .post(`/api/production-batches/${batchId}/complete`)
      .set("Authorization", authHeader())
      .send({
        completedDate: "2026-08-29",
        damagedQuantity: 1,
        wastedQuantity: 0
      });

    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.status).toBe("completed");
    expect(completeResponse.body.directCostMinor).toBeGreaterThan(0);
    expect(completeResponse.body.costPerGoodPieceMinor).toBeGreaterThan(0);

    const material = await request(app)
      .get(`/api/materials/${materialId}`)
      .set("Authorization", authHeader());

    expect(material.body.data.currentQuantity).toBe(80);

    const inventory = await request(app)
      .get("/api/finished-inventory")
      .set("Authorization", authHeader());

    const row = inventory.body.data.find(
      (item: { id: string }) => item.id === variantId
    );
    expect(row.currentQuantity).toBe(10);
    expect(row.currentAverageCostMinor).toBeGreaterThan(0);

    const costSummary = await request(app)
      .get(`/api/production-batches/${batchId}/cost-summary`)
      .set("Authorization", authHeader());

    expect(costSummary.status).toBe(200);
    expect(costSummary.body.data.consumptions).toHaveLength(1);
    expect(costSummary.body.data.components).toHaveLength(1);
    expect(costSummary.body.data.outputs).toHaveLength(1);
  });

  it("blocks completion when material stock is insufficient", async () => {
    const supplierId = await createSupplier();
    const materialId = await createMaterial(supplierId, 5, 10);
    const { modelId, variantId } = await createModelWithVariant(materialId);

    const createResponse = await request(app)
      .post("/api/production-batches")
      .set("Authorization", authHeader())
      .send({
        modelId,
        plannedQuantity: 10,
        consumptions: [{ materialId, quantity: 20 }],
        outputs: [{ modelVariantId: variantId, goodQuantity: 10 }]
      });

    const batchId = createResponse.body.id as string;

    await request(app)
      .post(`/api/production-batches/${batchId}/start`)
      .set("Authorization", authHeader())
      .send({});

    const completeResponse = await request(app)
      .post(`/api/production-batches/${batchId}/complete`)
      .set("Authorization", authHeader())
      .send({ completedDate: "2026-08-29" });

    expect(completeResponse.status).toBe(409);
    expect(completeResponse.body.message).toContain("Insufficient stock");
  });

  it("adjusts finished stock for a variant", async () => {
    const supplierId = await createSupplier();
    const materialId = await createMaterial(supplierId, 100, 10);
    const { modelId, variantId } = await createModelWithVariant(materialId);

    const createResponse = await request(app)
      .post("/api/production-batches")
      .set("Authorization", authHeader())
      .send({
        modelId,
        plannedQuantity: 10,
        consumptions: [{ materialId, quantity: 5 }],
        outputs: [{ modelVariantId: variantId, goodQuantity: 5 }]
      });

    const batchId = createResponse.body.id as string;

    await request(app)
      .post(`/api/production-batches/${batchId}/start`)
      .set("Authorization", authHeader())
      .send({});

    await request(app)
      .post(`/api/production-batches/${batchId}/complete`)
      .set("Authorization", authHeader())
      .send({ completedDate: "2026-08-29" });

    const adjustResponse = await request(app)
      .post(`/api/model-variants/${variantId}/stock-adjustments`)
      .set("Authorization", authHeader())
      .send({ newQuantity: 4, reason: "Physical count correction" });

    expect(adjustResponse.status).toBe(201);
    expect(adjustResponse.body.previousQuantity).toBe(5);
    expect(adjustResponse.body.newQuantity).toBe(4);
  });
});
