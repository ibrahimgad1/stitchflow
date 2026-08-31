import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  cancelProductionBatch,
  completeProductionBatch,
  createProductionBatch,
  getProductionCostSummary,
  startProductionBatch,
  updateProductionBatch
} from "../services/production.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";

export const productionBatchesRouter = Router();

const consumptionSchema = z.object({
  materialId: z.string().trim().min(1),
  quantity: z.number().positive(),
  notes: z.string().trim().optional().nullable()
});

const outputSchema = z.object({
  modelVariantId: z.string().trim().min(1),
  goodQuantity: z.number().positive()
});

const costComponentSchema = z.object({
  componentName: z.string().trim().min(1),
  amount: z.number().min(0),
  notes: z.string().trim().optional().nullable()
});

const createBatchSchema = z.object({
  modelId: z.string().trim().min(1),
  plannedQuantity: z.number().min(0),
  notes: z.string().trim().optional().nullable(),
  consumptions: z.array(consumptionSchema).optional(),
  outputs: z.array(outputSchema).optional(),
  costComponents: z.array(costComponentSchema).optional()
});

const updateBatchSchema = z.object({
  plannedQuantity: z.number().min(0).optional(),
  notes: z.string().trim().optional().nullable(),
  consumptions: z.array(consumptionSchema).optional(),
  outputs: z.array(outputSchema).optional(),
  costComponents: z.array(costComponentSchema).optional()
});

const completeBatchSchema = z.object({
  completedDate: z.string().trim().optional(),
  goodQuantity: z.number().positive().optional(),
  damagedQuantity: z.number().min(0).optional(),
  wastedQuantity: z.number().min(0).optional(),
  consumptions: z.array(consumptionSchema).optional(),
  outputs: z.array(outputSchema).optional(),
  costComponents: z.array(costComponentSchema).optional()
});

const startBatchSchema = z.object({
  startDate: z.string().trim().optional()
});

productionBatchesRouter.use(requireAuth);

productionBatchesRouter.get("/production-batches", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(production_batches.batch_number LIKE ? ESCAPE '\\' OR models.model_code LIKE ? ESCAPE '\\' OR models.model_name LIKE ? ESCAPE '\\')"
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern);
  }

  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  if (status) {
    conditions.push("production_batches.status = ?");
    values.push(status);
  }

  const modelId = typeof req.query.modelId === "string" ? req.query.modelId.trim() : "";
  if (modelId) {
    conditions.push("production_batches.model_id = ?");
    values.push(modelId);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM production_batches
      JOIN models ON models.id = production_batches.model_id
      WHERE ${where}
    `)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT production_batches.id,
             production_batches.batch_number AS batchNumber,
             production_batches.model_id AS modelId,
             models.model_code AS modelCode,
             models.model_name AS modelName,
             production_batches.status,
             production_batches.planned_quantity AS plannedQuantity,
             production_batches.good_quantity AS goodQuantity,
             production_batches.damaged_quantity AS damagedQuantity,
             production_batches.wasted_quantity AS wastedQuantity,
             production_batches.start_date AS startDate,
             production_batches.completed_date AS completedDate,
             production_batches.direct_cost_minor AS directCostMinor,
             production_batches.overhead_cost_minor AS overheadCostMinor,
             production_batches.total_cost_minor AS totalCostMinor,
             production_batches.cost_per_good_piece_minor AS costPerGoodPieceMinor,
             production_batches.notes,
             production_batches.created_at AS createdAt,
             production_batches.updated_at AS updatedAt
      FROM production_batches
      JOIN models ON models.id = production_batches.model_id
      WHERE ${where}
      ORDER BY production_batches.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

productionBatchesRouter.get("/production-batches/:id", (req, res) => {
  const db = getDatabase();
  const batch = db
    .prepare(`
      SELECT production_batches.id,
             production_batches.batch_number AS batchNumber,
             production_batches.model_id AS modelId,
             models.model_code AS modelCode,
             models.model_name AS modelName,
             production_batches.status,
             production_batches.planned_quantity AS plannedQuantity,
             production_batches.good_quantity AS goodQuantity,
             production_batches.damaged_quantity AS damagedQuantity,
             production_batches.wasted_quantity AS wastedQuantity,
             production_batches.start_date AS startDate,
             production_batches.completed_date AS completedDate,
             production_batches.direct_cost_minor AS directCostMinor,
             production_batches.overhead_cost_minor AS overheadCostMinor,
             production_batches.total_cost_minor AS totalCostMinor,
             production_batches.cost_per_good_piece_minor AS costPerGoodPieceMinor,
             production_batches.notes,
             production_batches.created_at AS createdAt,
             production_batches.updated_at AS updatedAt
      FROM production_batches
      JOIN models ON models.id = production_batches.model_id
      WHERE production_batches.id = ?
    `)
    .get(req.params.id);

  if (!batch) {
    res.status(404).json({ statusCode: 404, message: "Production batch not found" });
    return;
  }

  const consumptions = db
    .prepare(`
      SELECT pmc.id, pmc.material_id AS materialId, materials.name AS materialName,
             pmc.quantity, pmc.unit_cost_minor AS unitCostMinor,
             pmc.total_cost_minor AS totalCostMinor, pmc.notes
      FROM production_material_consumptions pmc
      JOIN materials ON materials.id = pmc.material_id
      WHERE pmc.batch_id = ?
    `)
    .all(req.params.id);

  const outputs = db
    .prepare(`
      SELECT pbo.id, pbo.model_variant_id AS modelVariantId,
             sizes.name AS sizeName, colors.name AS colorName,
             pbo.good_quantity AS goodQuantity,
             pbo.unit_cost_minor AS unitCostMinor,
             pbo.total_cost_minor AS totalCostMinor
      FROM production_batch_outputs pbo
      JOIN model_variants mv ON mv.id = pbo.model_variant_id
      JOIN sizes ON sizes.id = mv.size_id
      JOIN colors ON colors.id = mv.color_id
      WHERE pbo.batch_id = ?
    `)
    .all(req.params.id);

  const costComponents = db
    .prepare(`
      SELECT id, component_name AS componentName, amount_minor AS amountMinor, notes
      FROM production_cost_components
      WHERE batch_id = ?
    `)
    .all(req.params.id);

  res.json({
    data: {
      ...batch,
      consumptions,
      outputs,
      costComponents
    }
  });
});

productionBatchesRouter.post("/production-batches", (req: AuthenticatedRequest, res) => {
  const parsed = createBatchSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid production batch data" });
    return;
  }

  const db = getDatabase();

  try {
    const result = createProductionBatch(db, {
      ...parsed.data,
      createdBy: req.user?.id
    });
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create production batch";
    const statusCode = message.includes("not found") ? 404 : 400;
    res.status(statusCode).json({ statusCode, message });
  }
});

productionBatchesRouter.put("/production-batches/:id", (req, res) => {
  const parsed = updateBatchSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid production batch data" });
    return;
  }

  const db = getDatabase();

  try {
    updateProductionBatch(db, String(req.params.id), parsed.data);
    res.json({ id: req.params.id, ...parsed.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update production batch";
    const statusCode = message.includes("not found") ? 404 : 400;
    res.status(statusCode).json({ statusCode, message });
  }
});

productionBatchesRouter.post("/production-batches/:id/start", (req, res) => {
  const parsed = startBatchSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid start data" });
    return;
  }

  const db = getDatabase();

  try {
    startProductionBatch(db, String(req.params.id), parsed.data.startDate);
    res.json({ id: req.params.id, status: "in_progress" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start production batch";
    const statusCode = message.includes("not found") ? 404 : 400;
    res.status(statusCode).json({ statusCode, message });
  }
});

productionBatchesRouter.post("/production-batches/:id/complete", (req: AuthenticatedRequest, res) => {
  const parsed = completeBatchSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid completion data" });
    return;
  }

  const db = getDatabase();

  try {
    const result = completeProductionBatch(db, String(req.params.id), {
      ...parsed.data,
      createdBy: req.user?.id
    });
    res.json({ id: req.params.id, status: "completed", ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not complete production batch";
    const statusCode =
      message.includes("not found") ? 404 : message.includes("Insufficient") ? 409 : 400;
    res.status(statusCode).json({ statusCode, message });
  }
});

productionBatchesRouter.post("/production-batches/:id/cancel", (req, res) => {
  const db = getDatabase();

  try {
    cancelProductionBatch(db, String(req.params.id));
    res.json({ id: req.params.id, status: "cancelled" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not cancel production batch";
    const statusCode = message.includes("not found") ? 404 : 400;
    res.status(statusCode).json({ statusCode, message });
  }
});

productionBatchesRouter.get("/production-batches/:id/cost-summary", (req, res) => {
  const db = getDatabase();

  try {
    const summary = getProductionCostSummary(db, String(req.params.id));
    res.json({ data: summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load cost summary";
    res.status(message.includes("not found") ? 404 : 400).json({ statusCode: 404, message });
  }
});
