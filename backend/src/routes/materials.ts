import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { adjustMaterialStock } from "../services/purchasing.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";

export const materialsRouter = Router();

const materialSchema = z.object({
  name: z.string().trim().min(1),
  colorName: z.string().trim().optional().nullable(),
  unit: z.string().trim().min(1).default("meter"),
  supplierId: z.string().trim().min(1).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional()
});

materialsRouter.use(requireAuth);

materialsRouter.get("/materials", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.activeOnly) {
    conditions.push("materials.is_active = 1");
  }

  if (params.search) {
    conditions.push("(materials.name LIKE ? ESCAPE '\\' OR materials.color_name LIKE ? ESCAPE '\\')");
    const pattern = likePattern(params.search);
    values.push(pattern, pattern);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM materials WHERE ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT materials.id, materials.name, materials.color_name AS colorName,
             materials.unit, materials.current_quantity AS currentQuantity,
             materials.weighted_average_cost_minor AS weightedAverageCostMinor,
             materials.safety_threshold AS safetyThreshold,
             materials.supplier_id AS supplierId, suppliers.name AS supplierName,
             materials.notes, materials.is_active AS isActive,
             materials.created_at AS createdAt, materials.updated_at AS updatedAt
      FROM materials
      LEFT JOIN suppliers ON suppliers.id = materials.supplier_id
      WHERE ${where}
      ORDER BY materials.name ASC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

materialsRouter.put("/materials/:id/threshold", (req, res) => {
  const parsed = z.object({ safetyThreshold: z.number().min(0) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid threshold" });
    return;
  }
  const db = getDatabase();
  const result = db.prepare("UPDATE materials SET safety_threshold = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(parsed.data.safetyThreshold, req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ statusCode: 404, message: "Material not found" });
    return;
  }
  res.json({ id: req.params.id, safetyThreshold: parsed.data.safetyThreshold });
});

materialsRouter.get("/materials/:id", (req, res) => {
  const db = getDatabase();
  const material = db
    .prepare(`
      SELECT materials.id, materials.name, materials.color_name AS colorName,
             materials.unit, materials.current_quantity AS currentQuantity,
             materials.weighted_average_cost_minor AS weightedAverageCostMinor,
             materials.safety_threshold AS safetyThreshold,
             materials.supplier_id AS supplierId, suppliers.name AS supplierName,
             materials.notes, materials.is_active AS isActive,
             materials.created_at AS createdAt, materials.updated_at AS updatedAt
      FROM materials
      LEFT JOIN suppliers ON suppliers.id = materials.supplier_id
      WHERE materials.id = ?
    `)
    .get(req.params.id);

  if (!material) {
    res.status(404).json({ statusCode: 404, message: "Material not found" });
    return;
  }

  res.json({ data: material });
});

materialsRouter.post("/materials", (req, res) => {
  const parsed = materialSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid material data" });
    return;
  }

  const db = getDatabase();

  if (parsed.data.supplierId) {
    const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(parsed.data.supplierId);
    if (!supplier) {
      res.status(400).json({ statusCode: 400, message: "Supplier not found" });
      return;
    }
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO materials (id, name, color_name, unit, supplier_id, notes, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    parsed.data.name,
    parsed.data.colorName ?? null,
    parsed.data.unit,
    parsed.data.supplierId ?? null,
    parsed.data.notes ?? null,
    parsed.data.isActive === false ? 0 : 1
  );

  res.status(201).json({
    id,
    ...parsed.data,
    currentQuantity: 0,
    weightedAverageCostMinor: 0,
    isActive: parsed.data.isActive !== false
  });
});

materialsRouter.put("/materials/:id", (req, res) => {
  const parsed = materialSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid material data" });
    return;
  }

  const db = getDatabase();

  if (parsed.data.supplierId) {
    const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(parsed.data.supplierId);
    if (!supplier) {
      res.status(400).json({ statusCode: 400, message: "Supplier not found" });
      return;
    }
  }

  const result = db.prepare(`
    UPDATE materials
    SET name = ?, color_name = ?, unit = ?, supplier_id = ?,
        notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    parsed.data.name,
    parsed.data.colorName ?? null,
    parsed.data.unit,
    parsed.data.supplierId ?? null,
    parsed.data.notes ?? null,
    parsed.data.isActive === false ? 0 : 1,
    req.params.id
  );

  if (result.changes === 0) {
    res.status(404).json({ statusCode: 404, message: "Material not found" });
    return;
  }

  res.json({ id: req.params.id, ...parsed.data });
});

const adjustmentSchema = z.object({
  newQuantity: z.number().min(0),
  reason: z.string().trim().min(1),
  adjustmentDate: z.string().trim().min(1).optional()
});

materialsRouter.get("/materials/:id/movements", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();

  const material = db.prepare("SELECT id FROM materials WHERE id = ?").get(req.params.id);
  if (!material) {
    res.status(404).json({ statusCode: 404, message: "Material not found" });
    return;
  }

  const total = db
    .prepare("SELECT COUNT(*) AS count FROM material_stock_movements WHERE material_id = ?")
    .get(req.params.id) as { count: number };

  const rows = db
    .prepare(`
      SELECT id, material_id AS materialId, movement_date AS movementDate,
             movement_type AS movementType, source_type AS sourceType, source_id AS sourceId,
             quantity_delta AS quantityDelta, unit_cost_minor AS unitCostMinor,
             total_cost_minor AS totalCostMinor, quantity_after AS quantityAfter,
             description, created_at AS createdAt
      FROM material_stock_movements
      WHERE material_id = ?
      ORDER BY movement_date DESC, created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(req.params.id, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

materialsRouter.post("/materials/:id/adjustments", (req: AuthenticatedRequest, res) => {
  const parsed = adjustmentSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid adjustment data" });
    return;
  }

  const db = getDatabase();
  const materialId = String(req.params.id);

  try {
    const result = adjustMaterialStock(db, {
      materialId,
      newQuantity: parsed.data.newQuantity,
      reason: parsed.data.reason,
      adjustmentDate: parsed.data.adjustmentDate ?? new Date().toISOString().slice(0, 10),
      createdBy: req.user?.id
    });

    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not adjust stock";
    const statusCode = message.includes("not found") ? 404 : 400;
    res.status(statusCode).json({ statusCode, message });
  }
});
