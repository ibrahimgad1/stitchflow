import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";
import { toMinorUnits } from "../utils/money.js";

export const safesRouter = Router();

const safeSchema = z.object({
  name: z.string().trim().min(1),
  openingBalance: z.number().min(0),
  isActive: z.boolean().optional()
});

const safeUpdateSchema = z.object({
  name: z.string().trim().min(1),
  isActive: z.boolean().optional()
});

safesRouter.use(requireAuth);

safesRouter.get("/safes", (req, res) => {
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
    .prepare(`SELECT COUNT(*) AS count FROM safes WHERE ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT id, name, opening_balance_minor AS openingBalanceMinor,
             current_balance_minor AS currentBalanceMinor,
             is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
      FROM safes
      WHERE ${where}
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

safesRouter.get("/safes/:id", (req, res) => {
  const db = getDatabase();
  const safe = db
    .prepare(`
      SELECT id, name, opening_balance_minor AS openingBalanceMinor,
             current_balance_minor AS currentBalanceMinor,
             is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
      FROM safes
      WHERE id = ?
    `)
    .get(req.params.id);

  if (!safe) {
    res.status(404).json({ statusCode: 404, message: "Safe not found" });
    return;
  }

  res.json({ data: safe });
});

safesRouter.post("/safes", (req, res) => {
  const parsed = safeSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid safe data" });
    return;
  }

  const id = randomUUID();
  const openingBalanceMinor = toMinorUnits(parsed.data.openingBalance);
  const db = getDatabase();

  try {
    const insert = db.transaction(() => {
      db.prepare(
        `
      INSERT INTO safes (id, name, opening_balance_minor, current_balance_minor, is_active)
      VALUES (?, ?, ?, ?, ?)
    `
      ).run(
        id,
        parsed.data.name,
        openingBalanceMinor,
        openingBalanceMinor,
        parsed.data.isActive === false ? 0 : 1
      );
      if (openingBalanceMinor > 0) {
        db.prepare(
          `
        INSERT INTO safe_transactions (
          id, safe_id, transaction_date, transaction_type, source_type, source_id,
          direction, amount_minor, balance_after_minor, description, created_by
        )
        VALUES (?, ?, date('now'), 'opening_balance', 'safe', ?, 'in', ?, ?, 'Opening balance', NULL)
      `
        ).run(randomUUID(), id, id, openingBalanceMinor, openingBalanceMinor);
      }
    });
    insert();

    res.status(201).json({
      id,
      name: parsed.data.name,
      openingBalanceMinor,
      currentBalanceMinor: openingBalanceMinor,
      isActive: parsed.data.isActive !== false
    });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Safe name already exists" });
  }
});

safesRouter.put("/safes/:id", (req, res) => {
  const parsed = safeUpdateSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid safe data" });
    return;
  }

  const db = getDatabase();

  try {
    const result = db.prepare(`
      UPDATE safes
      SET name = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      parsed.data.name,
      parsed.data.isActive === false ? 0 : 1,
      req.params.id
    );

    if (result.changes === 0) {
      res.status(404).json({ statusCode: 404, message: "Safe not found" });
      return;
    }

    res.json({ id: req.params.id, ...parsed.data });
  } catch {
    res.status(409).json({ statusCode: 409, message: "Safe name already exists" });
  }
});
