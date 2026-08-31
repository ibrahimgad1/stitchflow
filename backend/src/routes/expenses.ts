import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { createExpense } from "../services/treasury.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";

export const expensesRouter = Router();

const expenseSchema = z.object({
  expenseDate: z.string().trim().min(1),
  categoryId: z.string().trim().min(1).optional().nullable(),
  description: z.string().trim().min(1),
  amount: z.number().positive(),
  paymentStatus: z.enum(["paid", "unpaid"]),
  paymentMethodId: z.string().trim().min(1).optional().nullable(),
  safeId: z.string().trim().min(1).optional().nullable(),
  overheadPeriodId: z.string().trim().min(1).optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

expensesRouter.use(requireAuth);

expensesRouter.get("/expenses", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(expenses.expense_number LIKE ? ESCAPE '\\' OR expenses.description LIKE ? ESCAPE '\\' OR expense_categories.name LIKE ? ESCAPE '\\')"
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern);
  }

  const paymentStatus =
    typeof req.query.paymentStatus === "string" ? req.query.paymentStatus.trim() : "";
  if (paymentStatus) {
    conditions.push("expenses.payment_status = ?");
    values.push(paymentStatus);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM expenses
      LEFT JOIN expense_categories ON expense_categories.id = expenses.category_id
      WHERE ${where}
    `)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT expenses.id,
             expenses.expense_number AS expenseNumber,
             expenses.expense_date AS expenseDate,
             expenses.category_id AS categoryId,
             expense_categories.name AS categoryName,
             expenses.description,
             expenses.amount_minor AS amountMinor,
             expenses.payment_status AS paymentStatus,
             expenses.payment_method_id AS paymentMethodId,
             payment_methods.name AS paymentMethodName,
             expenses.safe_id AS safeId,
             safes.name AS safeName,
             expenses.overhead_period_id AS overheadPeriodId,
             expenses.notes,
             expenses.created_at AS createdAt
      FROM expenses
      LEFT JOIN expense_categories ON expense_categories.id = expenses.category_id
      LEFT JOIN payment_methods ON payment_methods.id = expenses.payment_method_id
      LEFT JOIN safes ON safes.id = expenses.safe_id
      WHERE ${where}
      ORDER BY expenses.expense_date DESC, expenses.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

expensesRouter.get("/expenses/:id", (req, res) => {
  const db = getDatabase();
  const expense = db
    .prepare(`
      SELECT expenses.id,
             expenses.expense_number AS expenseNumber,
             expenses.expense_date AS expenseDate,
             expenses.category_id AS categoryId,
             expense_categories.name AS categoryName,
             expenses.description,
             expenses.amount_minor AS amountMinor,
             expenses.payment_status AS paymentStatus,
             expenses.payment_method_id AS paymentMethodId,
             payment_methods.name AS paymentMethodName,
             expenses.safe_id AS safeId,
             safes.name AS safeName,
             expenses.overhead_period_id AS overheadPeriodId,
             expenses.notes,
             expenses.created_at AS createdAt
      FROM expenses
      LEFT JOIN expense_categories ON expense_categories.id = expenses.category_id
      LEFT JOIN payment_methods ON payment_methods.id = expenses.payment_method_id
      LEFT JOIN safes ON safes.id = expenses.safe_id
      WHERE expenses.id = ?
    `)
    .get(req.params.id);

  if (!expense) {
    res.status(404).json({ statusCode: 404, message: "Expense not found" });
    return;
  }

  res.json({ data: expense });
});

expensesRouter.post("/expenses", (req: AuthenticatedRequest, res) => {
  const parsed = expenseSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid expense data" });
    return;
  }

  const db = getDatabase();

  try {
    const result = createExpense(db, {
      ...parsed.data,
      createdBy: req.user?.id
    });
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create expense";
    const statusCode = message.includes("Insufficient") ? 409 : 400;
    res.status(statusCode).json({ statusCode, message });
  }
});
