import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";

export const colorsRouter = Router();

const colorSchema = z.object({
  name: z.string().trim().min(1),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional()
});

colorsRouter.use(requireAuth);

colorsRouter.get("/colors", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.activeOnly) {
    conditions.push("is_active = 1");
  }

  if (params.search) {
    conditions.push("name LIKE ? ESCAPE '\\'");
    values.push(likePattern(params.search));
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM colors WHERE ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT id, name, sort_order AS sortOrder, is_active AS isActive
      FROM colors
      WHERE ${where}
      ORDER BY sort_order ASC, name ASC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

colorsRouter.post("/colors", (req, res) => {
  const parsed = colorSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid color data" });
    return;
  }

  const id = randomUUID();
  const db = getDatabase();

  try {
    db.prepare(`
      INSERT INTO colors (id, name, sort_order, is_active)
      VALUES (?, ?, ?, ?)
    `).run(
      id,
      parsed.data.name,
      parsed.data.sortOrder ?? 0,
      parsed.data.isActive === false ? 0 : 1
    );

    res.status(201).json({ id, ...parsed.data, isActive: parsed.data.isActive !== false });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Color name already exists" });
  }
});

colorsRouter.put("/colors/:id", (req, res) => {
  const parsed = colorSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid color data" });
    return;
  }

  const db = getDatabase();

  try {
    const result = db.prepare(`
      UPDATE colors
      SET name = ?, sort_order = ?, is_active = ?
      WHERE id = ?
    `).run(
      parsed.data.name,
      parsed.data.sortOrder ?? 0,
      parsed.data.isActive === false ? 0 : 1,
      req.params.id
    );

    if (result.changes === 0) {
      res.status(404).json({ statusCode: 404, message: "Color not found" });
      return;
    }

    res.json({ id: req.params.id, ...parsed.data });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Color name already exists" });
  }
});
