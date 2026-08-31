import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";

export const ownersRouter = Router();

const ownerSchema = z.object({
  name: z.string().trim().min(1),
  ownershipPercent: z.number().min(0).max(100).optional().nullable(),
  isActive: z.boolean().optional()
});

ownersRouter.use(requireAuth);

ownersRouter.get("/owners", (req, res) => {
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
    .prepare(`SELECT COUNT(*) AS count FROM owners WHERE ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT id, name, ownership_percent AS ownershipPercent,
             is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
      FROM owners
      WHERE ${where}
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

ownersRouter.post("/owners", (req, res) => {
  const parsed = ownerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid owner data" });
    return;
  }

  const id = randomUUID();
  const db = getDatabase();

  try {
    db.prepare(`
      INSERT INTO owners (id, name, ownership_percent, is_active)
      VALUES (?, ?, ?, ?)
    `).run(
      id,
      parsed.data.name,
      parsed.data.ownershipPercent ?? null,
      parsed.data.isActive === false ? 0 : 1
    );

    res.status(201).json({ id, ...parsed.data, isActive: parsed.data.isActive !== false });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Owner name already exists" });
  }
});

ownersRouter.put("/owners/:id", (req, res) => {
  const parsed = ownerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid owner data" });
    return;
  }

  const db = getDatabase();

  try {
    const result = db.prepare(`
      UPDATE owners
      SET name = ?, ownership_percent = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      parsed.data.name,
      parsed.data.ownershipPercent ?? null,
      parsed.data.isActive === false ? 0 : 1,
      req.params.id
    );

    if (result.changes === 0) {
      res.status(404).json({ statusCode: 404, message: "Owner not found" });
      return;
    }

    res.json({ id: req.params.id, ...parsed.data });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Owner name already exists" });
  }
});
