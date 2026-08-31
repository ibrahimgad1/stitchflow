import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { paginatedResponse, parsePagination } from "../utils/pagination.js";

export const overheadRouter = Router();

const createPeriodSchema = z.object({
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
});

overheadRouter.use(requireAuth);

overheadRouter.get("/overhead-periods", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const total = db.prepare("SELECT COUNT(*) as count FROM overhead_periods").get() as { count: number };
  const rows = db
    .prepare(
      `SELECT id, period_year AS periodYear, period_month AS periodMonth, status,
              total_overhead_minor AS totalOverheadMinor, total_good_quantity AS totalGoodQuantity,
              overhead_per_piece_minor AS overheadPerPieceMinor, calculated_at AS calculatedAt, closed_at AS closedAt,
              created_at AS createdAt
       FROM overhead_periods
       ORDER BY period_year DESC, period_month DESC
       LIMIT ? OFFSET ?`
    )
    .all(params.pageSize, (params.page - 1) * params.pageSize);
  res.json(paginatedResponse(rows, total.count, params));
});

overheadRouter.get("/overhead-periods/:id", (req, res) => {
  const db = getDatabase();
  const period = db
    .prepare(
      `SELECT id, period_year AS periodYear, period_month AS periodMonth, status,
              total_overhead_minor AS totalOverheadMinor, total_good_quantity AS totalGoodQuantity,
              overhead_per_piece_minor AS overheadPerPieceMinor, calculated_at AS calculatedAt, closed_at AS closedAt
       FROM overhead_periods WHERE id = ?`
    )
    .get(req.params.id);
  if (!period) {
    res.status(404).json({ statusCode: 404, message: "Overhead period not found" });
    return;
  }
  const entries = db
    .prepare(
      `SELECT oe.id, oe.amount_minor AS amountMinor, oe.entry_date AS entryDate, oe.notes,
              ec.name AS categoryName, s.name AS safeName, oe.expense_id AS expenseId
       FROM overhead_entries oe
       LEFT JOIN expense_categories ec ON ec.id = oe.category_id
       LEFT JOIN safes s ON s.id = oe.paid_from_safe_id
       WHERE oe.overhead_period_id = ?
       ORDER BY oe.entry_date DESC`
    )
    .all(req.params.id);
  const allocations = db
    .prepare(
      `SELECT poa.production_batch_id AS batchId, pb.batch_number AS batchNumber, m.model_code AS modelCode,
              poa.good_quantity AS goodQuantity, poa.overhead_per_piece_minor AS overheadPerPieceMinor,
              poa.allocated_amount_minor AS allocatedAmountMinor
       FROM production_overhead_allocations poa
       JOIN production_batches pb ON pb.id = poa.production_batch_id
       JOIN models m ON m.id = pb.model_id
       WHERE poa.overhead_period_id = ?
       ORDER BY pb.completed_date DESC`
    )
    .all(req.params.id);
  res.json({ data: { ...period, entries, allocations } });
});

overheadRouter.post("/overhead-periods", (req, res) => {
  const parsed = createPeriodSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid period data" });
    return;
  }
  const db = getDatabase();
  const id = randomUUID();
  try {
    db.prepare(
      `INSERT INTO overhead_periods (id, period_year, period_month, status) VALUES (?,?,?, 'open')`
    ).run(id, parsed.data.periodYear, parsed.data.periodMonth);
    const row = db
      .prepare(`SELECT id, period_year AS periodYear, period_month AS periodMonth, status FROM overhead_periods WHERE id=?`)
      .get(id);
    res.status(201).json(row);
  } catch {
    res.status(409).json({ statusCode: 409, message: "Period already exists for this year/month" });
  }
});

overheadRouter.post("/overhead-periods/:id/calculate", (req, res) => {
  const db = getDatabase();
  const period = db
    .prepare(`SELECT id, period_year AS periodYear, period_month AS periodMonth, status FROM overhead_periods WHERE id=?`)
    .get(req.params.id) as { id: string; periodYear: number; periodMonth: number; status: string } | undefined;
  if (!period) {
    res.status(404).json({ statusCode: 404, message: "Overhead period not found" });
    return;
  }
  if (period.status === "closed") {
    res.status(400).json({ statusCode: 400, message: "Closed period cannot be recalculated" });
    return;
  }

  const totalOverhead = db
    .prepare(`SELECT COALESCE(SUM(amount_minor),0) as total FROM overhead_entries WHERE overhead_period_id=?`)
    .get(period.id) as { total: number };

  const yearStr = String(period.periodYear).padStart(4, "0");
  const monthStr = String(period.periodMonth).padStart(2, "0");
  const startDate = `${yearStr}-${monthStr}-01`;
  // last day of month
  const endDate = `${yearStr}-${monthStr}-${String(new Date(period.periodYear, period.periodMonth, 0).getDate()).padStart(2,"0")}`;

  const goodQty = db
    .prepare(
      `SELECT COALESCE(SUM(good_quantity),0) as total FROM production_batches WHERE status='completed' AND completed_date >= ? AND completed_date <= ?`
    )
    .get(startDate, endDate) as { total: number };

  const overheadPerPiece = goodQty.total > 0 ? Math.round(totalOverhead.total / goodQty.total) : 0;

  db.prepare(
    `UPDATE overhead_periods SET total_overhead_minor=?, total_good_quantity=?, overhead_per_piece_minor=?, status='calculated', calculated_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(totalOverhead.total, goodQty.total, overheadPerPiece, period.id);

  // Update existing allocations' overhead_per_piece for future batches? Do not retroactively change completed batches' cost here (cost is historical). Only new completions will use new per-piece.
  // Optionally we could recalc pending, but spec says allocation on complete, so we keep historical.

  const updated = db
    .prepare(`SELECT id, period_year AS periodYear, period_month AS periodMonth, status, total_overhead_minor AS totalOverheadMinor, total_good_quantity AS totalGoodQuantity, overhead_per_piece_minor AS overheadPerPieceMinor FROM overhead_periods WHERE id=?`)
    .get(period.id);
  res.json(updated);
});

overheadRouter.post("/overhead-periods/:id/close", (req, res) => {
  const db = getDatabase();
  const period = db.prepare(`SELECT id, status FROM overhead_periods WHERE id=?`).get(req.params.id) as { id: string; status: string } | undefined;
  if (!period) {
    res.status(404).json({ statusCode: 404, message: "Overhead period not found" });
    return;
  }
  if (period.status !== "calculated") {
    res.status(400).json({ statusCode: 400, message: "Only calculated periods can be closed" });
    return;
  }
  db.prepare(`UPDATE overhead_periods SET status='closed', closed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(period.id);
  res.json({ id: period.id, status: "closed" });
});
