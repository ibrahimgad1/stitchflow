import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";

export const modelsRouter = Router();

const modelSchema = z.object({
  modelCode: z.string().trim().min(1),
  modelName: z.string().trim().min(1),
  mainMaterialId: z.string().trim().min(1).optional().nullable(),
  description: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional()
});

const variantSchema = z.object({
  sizeId: z.string().trim().min(1),
  colorId: z.string().trim().min(1),
  isActive: z.boolean().optional()
});

modelsRouter.use(requireAuth);

modelsRouter.get("/models", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.activeOnly) {
    conditions.push("models.is_active = 1");
  }

  if (params.search) {
    conditions.push(
      "(models.model_code LIKE ? ESCAPE '\\' OR models.model_name LIKE ? ESCAPE '\\')"
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM models WHERE ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT models.id, models.model_code AS modelCode, models.model_name AS modelName,
             models.main_material_id AS mainMaterialId, materials.name AS mainMaterialName,
             models.description, models.is_active AS isActive,
             models.created_at AS createdAt, models.updated_at AS updatedAt,
             (SELECT COUNT(*) FROM model_variants WHERE model_id = models.id) AS variantCount
      FROM models
      LEFT JOIN materials ON materials.id = models.main_material_id
      WHERE ${where}
      ORDER BY models.model_code ASC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

modelsRouter.get("/models/:id", (req, res) => {
  const db = getDatabase();
  const model = db
    .prepare(`
      SELECT models.id, models.model_code AS modelCode, models.model_name AS modelName,
             models.main_material_id AS mainMaterialId, materials.name AS mainMaterialName,
             models.description, models.is_active AS isActive,
             models.created_at AS createdAt, models.updated_at AS updatedAt
      FROM models
      LEFT JOIN materials ON materials.id = models.main_material_id
      WHERE models.id = ?
    `)
    .get(req.params.id);

  if (!model) {
    res.status(404).json({ statusCode: 404, message: "Model not found" });
    return;
  }

  res.json({ data: model });
});

modelsRouter.post("/models", (req, res) => {
  const parsed = modelSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid model data" });
    return;
  }

  const db = getDatabase();

  if (parsed.data.mainMaterialId) {
    const material = db
      .prepare("SELECT id FROM materials WHERE id = ?")
      .get(parsed.data.mainMaterialId);
    if (!material) {
      res.status(400).json({ statusCode: 400, message: "Material not found" });
      return;
    }
  }

  const id = randomUUID();

  try {
    db.prepare(`
      INSERT INTO models (id, model_code, model_name, main_material_id, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      parsed.data.modelCode,
      parsed.data.modelName,
      parsed.data.mainMaterialId ?? null,
      parsed.data.description ?? null,
      parsed.data.isActive === false ? 0 : 1
    );

    res.status(201).json({ id, ...parsed.data, isActive: parsed.data.isActive !== false });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Model code already exists" });
  }
});

modelsRouter.put("/models/:id", (req, res) => {
  const parsed = modelSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid model data" });
    return;
  }

  const db = getDatabase();

  if (parsed.data.mainMaterialId) {
    const material = db
      .prepare("SELECT id FROM materials WHERE id = ?")
      .get(parsed.data.mainMaterialId);
    if (!material) {
      res.status(400).json({ statusCode: 400, message: "Material not found" });
      return;
    }
  }

  try {
    const result = db.prepare(`
      UPDATE models
      SET model_code = ?, model_name = ?, main_material_id = ?,
          description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      parsed.data.modelCode,
      parsed.data.modelName,
      parsed.data.mainMaterialId ?? null,
      parsed.data.description ?? null,
      parsed.data.isActive === false ? 0 : 1,
      req.params.id
    );

    if (result.changes === 0) {
      res.status(404).json({ statusCode: 404, message: "Model not found" });
      return;
    }

    res.json({ id: req.params.id, ...parsed.data });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Model code already exists" });
  }
});

modelsRouter.get("/models/:id/variants", (req, res) => {
  const db = getDatabase();
  const model = db.prepare("SELECT id FROM models WHERE id = ?").get(req.params.id);

  if (!model) {
    res.status(404).json({ statusCode: 404, message: "Model not found" });
    return;
  }

  const variants = db
    .prepare(`
      SELECT mv.id, mv.model_id AS modelId, mv.size_id AS sizeId, sizes.name AS sizeName,
             mv.color_id AS colorId, colors.name AS colorName,
             mv.current_quantity AS currentQuantity,
             mv.current_average_cost_minor AS currentAverageCostMinor,
             mv.safety_threshold AS safetyThreshold,
             mv.barcode,
             mv.is_active AS isActive,
             mv.created_at AS createdAt, mv.updated_at AS updatedAt
      FROM model_variants mv
      JOIN sizes ON sizes.id = mv.size_id
      JOIN colors ON colors.id = mv.color_id
      WHERE mv.model_id = ?
      ORDER BY sizes.sort_order ASC, colors.sort_order ASC
    `)
    .all(req.params.id);

  res.json({ data: variants });
});

modelsRouter.post("/models/:id/variants", (req, res) => {
  const parsed = variantSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid variant data" });
    return;
  }

  const db = getDatabase();
  const model = db.prepare("SELECT id FROM models WHERE id = ?").get(req.params.id);

  if (!model) {
    res.status(404).json({ statusCode: 404, message: "Model not found" });
    return;
  }

  const size = db.prepare("SELECT id FROM sizes WHERE id = ?").get(parsed.data.sizeId);
  const color = db.prepare("SELECT id FROM colors WHERE id = ?").get(parsed.data.colorId);

  if (!size || !color) {
    res.status(400).json({ statusCode: 400, message: "Size or color not found" });
    return;
  }

  const id = randomUUID();
  const modelRow = db.prepare("SELECT model_code FROM models WHERE id = ?").get(req.params.id) as { model_code: string } | undefined;
  const sizeRow = db.prepare("SELECT name FROM sizes WHERE id = ?").get(parsed.data.sizeId) as { name: string } | undefined;
  const colorRow = db.prepare("SELECT name FROM colors WHERE id = ?").get(parsed.data.colorId) as { name: string } | undefined;
  const barcode = `${modelRow?.model_code ?? "GEN"}-${sizeRow?.name ?? parsed.data.sizeId}-${colorRow?.name ?? parsed.data.colorId}-${id.slice(0, 6).toUpperCase()}`;

  try {
    db.prepare(`
      INSERT INTO model_variants (id, model_id, size_id, color_id, barcode, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.params.id,
      parsed.data.sizeId,
      parsed.data.colorId,
      barcode,
      parsed.data.isActive === false ? 0 : 1
    );

    res.status(201).json({
      id,
      modelId: req.params.id,
      ...parsed.data,
      currentQuantity: 0,
      currentAverageCostMinor: 0,
      isActive: parsed.data.isActive !== false
    });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Variant already exists for this model" });
  }
});

modelsRouter.put("/model-variants/:id/threshold", (req, res) => {
  const parsed = z.object({ safetyThreshold: z.number().min(0) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid threshold" });
    return;
  }
  const db = getDatabase();
  const result = db.prepare("UPDATE model_variants SET safety_threshold = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(parsed.data.safetyThreshold, req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ statusCode: 404, message: "Variant not found" });
    return;
  }
  res.json({ id: req.params.id, safetyThreshold: parsed.data.safetyThreshold });
});

modelsRouter.put("/model-variants/:id", (req, res) => {
  const parsed = variantSchema.partial().safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid variant data" });
    return;
  }

  const db = getDatabase();
  const existing = db
    .prepare("SELECT id, model_id, size_id, color_id FROM model_variants WHERE id = ?")
    .get(req.params.id) as
    | { id: string; model_id: string; size_id: string; color_id: string }
    | undefined;

  if (!existing) {
    res.status(404).json({ statusCode: 404, message: "Variant not found" });
    return;
  }

  const sizeId = parsed.data.sizeId ?? existing.size_id;
  const colorId = parsed.data.colorId ?? existing.color_id;

  if (parsed.data.sizeId) {
    const size = db.prepare("SELECT id FROM sizes WHERE id = ?").get(parsed.data.sizeId);
    if (!size) {
      res.status(400).json({ statusCode: 400, message: "Size not found" });
      return;
    }
  }

  if (parsed.data.colorId) {
    const color = db.prepare("SELECT id FROM colors WHERE id = ?").get(parsed.data.colorId);
    if (!color) {
      res.status(400).json({ statusCode: 400, message: "Color not found" });
      return;
    }
  }

  const isActive =
    parsed.data.isActive === undefined
      ? db.prepare("SELECT is_active FROM model_variants WHERE id = ?").get(req.params.id) as
          | { is_active: number }
          | undefined
      : { is_active: parsed.data.isActive ? 1 : 0 };

  if (!isActive) {
    res.status(404).json({ statusCode: 404, message: "Variant not found" });
    return;
  }

  try {
    db.prepare(`
      UPDATE model_variants
      SET size_id = ?, color_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(sizeId, colorId, isActive.is_active, req.params.id);

    res.json({
      id: req.params.id,
      sizeId,
      colorId,
      isActive: isActive.is_active === 1
    });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Variant already exists for this model" });
  }
});
