import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { getSupplierBalanceMinor } from "../utils/ledger.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";

export const suppliersRouter = Router();

const supplierSchema = z.object({
  name: z.string().trim().min(1),
  contactName: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional()
});

suppliersRouter.use(requireAuth);

suppliersRouter.get("/suppliers", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.activeOnly) {
    conditions.push("is_active = 1");
  }

  if (params.search) {
    conditions.push(
      "(name LIKE ? ESCAPE '\\' OR contact_name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')"
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM suppliers WHERE ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT id, name, contact_name AS contactName, phone, address, notes,
             is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
      FROM suppliers
      WHERE ${where}
      ORDER BY name ASC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

suppliersRouter.get("/suppliers/:id", (req, res) => {
  const db = getDatabase();
  const supplier = db
    .prepare(`
      SELECT id, name, contact_name AS contactName, phone, address, notes,
             is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
      FROM suppliers
      WHERE id = ?
    `)
    .get(req.params.id);

  if (!supplier) {
    res.status(404).json({ statusCode: 404, message: "Supplier not found" });
    return;
  }

  res.json({ data: supplier });
});

suppliersRouter.post("/suppliers", (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid supplier data" });
    return;
  }

  const id = randomUUID();
  const db = getDatabase();

  db.prepare(`
    INSERT INTO suppliers (id, name, contact_name, phone, address, notes, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    parsed.data.name,
    parsed.data.contactName ?? null,
    parsed.data.phone ?? null,
    parsed.data.address ?? null,
    parsed.data.notes ?? null,
    parsed.data.isActive === false ? 0 : 1
  );

  res.status(201).json({ id, ...parsed.data, isActive: parsed.data.isActive !== false });
});

suppliersRouter.put("/suppliers/:id", (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid supplier data" });
    return;
  }

  const db = getDatabase();
  const result = db.prepare(`
    UPDATE suppliers
    SET name = ?, contact_name = ?, phone = ?, address = ?,
        notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    parsed.data.name,
    parsed.data.contactName ?? null,
    parsed.data.phone ?? null,
    parsed.data.address ?? null,
    parsed.data.notes ?? null,
    parsed.data.isActive === false ? 0 : 1,
    req.params.id
  );

  if (result.changes === 0) {
    res.status(404).json({ statusCode: 404, message: "Supplier not found" });
    return;
  }

  res.json({ id: req.params.id, ...parsed.data });
});

suppliersRouter.get("/suppliers/:id/ledger", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();

  const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(req.params.id);
  if (!supplier) {
    res.status(404).json({ statusCode: 404, message: "Supplier not found" });
    return;
  }

  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";

  const conditions = ["supplier_id = ?"];
  const values: Array<string | number> = [req.params.id];
  if (dateFrom) {
    conditions.push("entry_date >= ?");
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("entry_date <= ?");
    values.push(dateTo);
  }
  const where = conditions.join(" AND ");

  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM supplier_ledger_entries WHERE ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT id, supplier_id AS supplierId, entry_date AS entryDate,
             source_type AS sourceType, source_id AS sourceId, description,
             debit_minor AS debitMinor, credit_minor AS creditMinor,
             balance_after_minor AS balanceAfterMinor, created_at AS createdAt
      FROM supplier_ledger_entries
      WHERE ${where}
      ORDER BY entry_date DESC, created_at DESC, rowid DESC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  let openingMinor = 0;
  if (dateFrom) {
    const opening = db
      .prepare(`SELECT balance_after_minor AS balance FROM supplier_ledger_entries WHERE supplier_id = ? AND entry_date < ? ORDER BY entry_date DESC, created_at DESC, rowid DESC LIMIT 1`)
      .get(req.params.id, dateFrom) as { balance: number } | undefined;
    openingMinor = opening?.balance ?? 0;
  }
  const totals = db
    .prepare(`SELECT COALESCE(SUM(debit_minor),0) as debit, COALESCE(SUM(credit_minor),0) as credit FROM supplier_ledger_entries WHERE ${where}`)
    .get(...values) as { debit: number; credit: number };

  res.json({
    ...paginatedResponse(rows, total.count, params),
    balanceMinor: getSupplierBalanceMinor(db, req.params.id),
    openingMinor,
    totals
  });
});

suppliersRouter.get("/suppliers/:id/receivings", (req, res) => {
  req.query.supplierId = req.params.id;
  const params = parsePagination(req);
  const db = getDatabase();

  const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(req.params.id);
  if (!supplier) {
    res.status(404).json({ statusCode: 404, message: "Supplier not found" });
    return;
  }

  const total = db
    .prepare("SELECT COUNT(*) AS count FROM material_receivings WHERE supplier_id = ?")
    .get(req.params.id) as { count: number };

  const rows = db
    .prepare(`
      SELECT id, receiving_number AS receivingNumber, receiving_date AS receivingDate,
             total_minor AS totalMinor, paid_minor AS paidMinor,
             remaining_minor AS remainingMinor, status
      FROM material_receivings
      WHERE supplier_id = ?
      ORDER BY receiving_date DESC, created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(req.params.id, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});
