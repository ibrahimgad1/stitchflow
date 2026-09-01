import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { adjustFinishedStock } from "../services/production.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";

export const finishedInventoryRouter = Router();

const adjustmentSchema = z.object({
  newQuantity: z.number().min(0),
  reason: z.string().trim().min(1),
  adjustmentDate: z.string().trim().min(1).optional()
});

finishedInventoryRouter.use(requireAuth);

finishedInventoryRouter.get("/finished-inventory", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["model_variants.is_active = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(models.model_code LIKE ? ESCAPE '\\' OR models.model_name LIKE ? ESCAPE '\\' OR sizes.name LIKE ? ESCAPE '\\' OR colors.name LIKE ? ESCAPE '\\')"
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern, pattern);
  }

  const modelId = typeof req.query.modelId === "string" ? req.query.modelId.trim() : "";
  if (modelId) {
    conditions.push("models.id = ?");
    values.push(modelId);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM model_variants
      JOIN models ON models.id = model_variants.model_id
      JOIN sizes ON sizes.id = model_variants.size_id
      JOIN colors ON colors.id = model_variants.color_id
      WHERE ${where}
    `)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT model_variants.id,
             model_variants.model_id AS modelId,
             models.model_code AS modelCode,
             models.model_name AS modelName,
             model_variants.size_id AS sizeId,
             sizes.name AS sizeName,
             model_variants.color_id AS colorId,
             colors.name AS colorName,
             model_variants.current_quantity AS currentQuantity,
             model_variants.current_average_cost_minor AS currentAverageCostMinor,
             model_variants.safety_threshold AS safetyThreshold,
             model_variants.updated_at AS updatedAt
      FROM model_variants
      JOIN models ON models.id = model_variants.model_id
      JOIN sizes ON sizes.id = model_variants.size_id
      JOIN colors ON colors.id = model_variants.color_id
      WHERE ${where}
      ORDER BY models.model_code ASC, sizes.sort_order ASC, colors.sort_order ASC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

finishedInventoryRouter.get("/finished-inventory/movements", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  const modelVariantId =
    typeof req.query.modelVariantId === "string" ? req.query.modelVariantId.trim() : "";
  if (modelVariantId) {
    conditions.push("finished_stock_movements.model_variant_id = ?");
    values.push(modelVariantId);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM finished_stock_movements WHERE ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT finished_stock_movements.id,
             finished_stock_movements.model_variant_id AS modelVariantId,
             models.model_code AS modelCode,
             sizes.name AS sizeName,
             colors.name AS colorName,
             finished_stock_movements.movement_date AS movementDate,
             finished_stock_movements.movement_type AS movementType,
             finished_stock_movements.quantity_delta AS quantityDelta,
             finished_stock_movements.unit_cost_minor AS unitCostMinor,
             finished_stock_movements.quantity_after AS quantityAfter,
             finished_stock_movements.description,
             finished_stock_movements.created_at AS createdAt
      FROM finished_stock_movements
      JOIN model_variants ON model_variants.id = finished_stock_movements.model_variant_id
      JOIN models ON models.id = model_variants.model_id
      JOIN sizes ON sizes.id = model_variants.size_id
      JOIN colors ON colors.id = model_variants.color_id
      WHERE ${where}
      ORDER BY finished_stock_movements.movement_date DESC, finished_stock_movements.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

finishedInventoryRouter.post(
  "/model-variants/:id/stock-adjustments",
  (req: AuthenticatedRequest, res) => {
    const parsed = adjustmentSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ statusCode: 400, message: "Invalid adjustment data" });
      return;
    }

    const db = getDatabase();

    try {
      const result = adjustFinishedStock(db, {
        modelVariantId: String(req.params.id),
        newQuantity: parsed.data.newQuantity,
        reason: parsed.data.reason,
        adjustmentDate: parsed.data.adjustmentDate ?? new Date().toISOString().slice(0, 10),
        createdBy: req.user?.id
      });
      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not adjust finished stock";
      const statusCode = message.includes("not found") ? 404 : 400;
      res.status(statusCode).json({ statusCode, message });
    }
  }
);

finishedInventoryRouter.get("/model-variants/:id/movements", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();

  const variant = db.prepare("SELECT id FROM model_variants WHERE id = ?").get(req.params.id);
  if (!variant) {
    res.status(404).json({ statusCode: 404, message: "Model variant not found" });
    return;
  }

  const total = db
    .prepare("SELECT COUNT(*) AS count FROM finished_stock_movements WHERE model_variant_id = ?")
    .get(req.params.id) as { count: number };

  const rows = db
    .prepare(`
      SELECT id, model_variant_id AS modelVariantId, movement_date AS movementDate,
             movement_type AS movementType, source_type AS sourceType, source_id AS sourceId,
             quantity_delta AS quantityDelta, unit_cost_minor AS unitCostMinor,
             total_cost_minor AS totalCostMinor, quantity_after AS quantityAfter,
             description, created_at AS createdAt
      FROM finished_stock_movements
      WHERE model_variant_id = ?
      ORDER BY movement_date DESC, created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(req.params.id, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});
