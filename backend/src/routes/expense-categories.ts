import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";

export const expenseCategoriesRouter = Router();

const expenseCategorySchema = z.object({
  name: z.string().trim().min(1),
  isOverhead: z.boolean().optional(),
  isActive: z.boolean().optional()
});

expenseCategoriesRouter.use(requireAuth);

expenseCategoriesRouter.get("/expense-categories", (req, res) => {
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
    .prepare(`SELECT COUNT(*) AS count FROM expense_categories WHERE ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT id, name, is_overhead AS isOverhead, is_active AS isActive,
             created_at AS createdAt, updated_at AS updatedAt
      FROM expense_categories
      WHERE ${where}
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

expenseCategoriesRouter.post("/expense-categories", (req, res) => {
  const parsed = expenseCategorySchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid expense category data" });
    return;
  }

  const id = randomUUID();
  const db = getDatabase();

  try {
    db.prepare(`
      INSERT INTO expense_categories (id, name, is_overhead, is_active)
      VALUES (?, ?, ?, ?)
    `).run(
      id,
      parsed.data.name,
      parsed.data.isOverhead ? 1 : 0,
      parsed.data.isActive === false ? 0 : 1
    );

    res.status(201).json({
      id,
      ...parsed.data,
      isOverhead: Boolean(parsed.data.isOverhead),
      isActive: parsed.data.isActive !== false
    });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Expense category already exists" });
  }
});

expenseCategoriesRouter.put("/expense-categories/:id", (req, res) => {
  const parsed = expenseCategorySchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid expense category data" });
    return;
  }

  const db = getDatabase();

  try {
    const result = db.prepare(`
      UPDATE expense_categories
      SET name = ?, is_overhead = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      parsed.data.name,
      parsed.data.isOverhead ? 1 : 0,
      parsed.data.isActive === false ? 0 : 1,
      req.params.id
    );

    if (result.changes === 0) {
      res.status(404).json({ statusCode: 404, message: "Expense category not found" });
      return;
    }

    res.json({ id: req.params.id, ...parsed.data });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Expense category already exists" });
  }
});
