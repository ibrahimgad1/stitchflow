import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { getCustomerBalanceMinor } from "../utils/ledger.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";

export const customersRouter = Router();

const customerSchema = z.object({
  companyName: z.string().trim().min(1),
  contactName: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional()
});

customersRouter.use(requireAuth);

customersRouter.get("/customers", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.activeOnly) {
    conditions.push("is_active = 1");
  }

  if (params.search) {
    conditions.push(
      "(company_name LIKE ? ESCAPE '\\' OR contact_name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')"
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM customers WHERE ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT id, company_name AS companyName, contact_name AS contactName,
             phone, address, notes, is_active AS isActive,
             created_at AS createdAt, updated_at AS updatedAt
      FROM customers
      WHERE ${where}
      ORDER BY company_name ASC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

customersRouter.get("/customers/:id", (req, res) => {
  const db = getDatabase();
  const customer = db
    .prepare(`
      SELECT id, company_name AS companyName, contact_name AS contactName,
             phone, address, notes, is_active AS isActive,
             created_at AS createdAt, updated_at AS updatedAt
      FROM customers
      WHERE id = ?
    `)
    .get(req.params.id);

  if (!customer) {
    res.status(404).json({ statusCode: 404, message: "Customer not found" });
    return;
  }

  res.json({ data: customer });
});

customersRouter.get("/customers/:id/ledger", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();

  const customer = db.prepare("SELECT id FROM customers WHERE id = ?").get(req.params.id);
  if (!customer) {
    res.status(404).json({ statusCode: 404, message: "Customer not found" });
    return;
  }

  const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
  const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";

  const conditions = ["customer_id = ?"];
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
    .prepare(`SELECT COUNT(*) AS count FROM customer_ledger_entries WHERE ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT id, entry_date AS entryDate, source_type AS sourceType,
             source_id AS sourceId, description, debit_minor AS debitMinor,
             credit_minor AS creditMinor, balance_after_minor AS balanceAfterMinor,
             created_at AS createdAt
      FROM customer_ledger_entries
      WHERE ${where}
      ORDER BY entry_date DESC, created_at DESC, rowid DESC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  // Opening balance = balance of last entry before dateFrom
  let openingMinor = 0;
  if (dateFrom) {
    const opening = db
      .prepare(
        `SELECT balance_after_minor AS balance FROM customer_ledger_entries WHERE customer_id = ? AND entry_date < ? ORDER BY entry_date DESC, created_at DESC, rowid DESC LIMIT 1`
      )
      .get(req.params.id, dateFrom) as { balance: number } | undefined;
    openingMinor = opening?.balance ?? 0;
  }

  const totals = db
    .prepare(`SELECT COALESCE(SUM(debit_minor),0) as debit, COALESCE(SUM(credit_minor),0) as credit FROM customer_ledger_entries WHERE ${where}`)
    .get(...values) as { debit: number; credit: number };

  res.json({
    ...paginatedResponse(rows, total.count, params),
    balanceMinor: getCustomerBalanceMinor(db, req.params.id),
    openingMinor,
    totals
  });
});

customersRouter.post("/customers", (req, res) => {
  const parsed = customerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid customer data" });
    return;
  }

  const id = randomUUID();
  const db = getDatabase();

  db.prepare(`
    INSERT INTO customers (id, company_name, contact_name, phone, address, notes, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    parsed.data.companyName,
    parsed.data.contactName ?? null,
    parsed.data.phone ?? null,
    parsed.data.address ?? null,
    parsed.data.notes ?? null,
    parsed.data.isActive === false ? 0 : 1
  );

  res.status(201).json({ id, ...parsed.data, isActive: parsed.data.isActive !== false });
});

customersRouter.put("/customers/:id", (req, res) => {
  const parsed = customerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid customer data" });
    return;
  }

  const db = getDatabase();
  const result = db.prepare(`
    UPDATE customers
    SET company_name = ?, contact_name = ?, phone = ?, address = ?,
        notes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    parsed.data.companyName,
    parsed.data.contactName ?? null,
    parsed.data.phone ?? null,
    parsed.data.address ?? null,
    parsed.data.notes ?? null,
    parsed.data.isActive === false ? 0 : 1,
    req.params.id
  );

  if (result.changes === 0) {
    res.status(404).json({ statusCode: 404, message: "Customer not found" });
    return;
  }

  res.json({ id: req.params.id, ...parsed.data });
});
