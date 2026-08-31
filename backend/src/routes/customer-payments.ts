import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { createCustomerPayment, reverseCustomerPayment } from "../services/sales.js";
import { likePattern, paginatedResponse, parsePagination } from "../utils/pagination.js";

export const customerPaymentsRouter = Router();

const allocationSchema = z.object({
  salesInvoiceId: z.string().trim().min(1),
  allocatedAmount: z.number().positive()
});

const paymentSchema = z.object({
  customerId: z.string().trim().min(1),
  paymentDate: z.string().trim().min(1),
  amount: z.number().positive(),
  paymentMethodId: z.string().trim().min(1).optional().nullable(),
  safeId: z.string().trim().min(1),
  notes: z.string().trim().optional().nullable(),
  allocations: z.array(allocationSchema).optional()
});

const reversalSchema = z.object({
  reversalDate: z.string().trim().min(1).optional(),
  notes: z.string().trim().optional().nullable()
});

customerPaymentsRouter.use(requireAuth);

customerPaymentsRouter.get("/customer-payments", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(customer_payments.payment_number LIKE ? ESCAPE '\\' OR customers.company_name LIKE ? ESCAPE '\\')"
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern);
  }

  const customerId = typeof req.query.customerId === "string" ? req.query.customerId.trim() : "";
  if (customerId) {
    conditions.push("customer_payments.customer_id = ?");
    values.push(customerId);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM customer_payments
      JOIN customers ON customers.id = customer_payments.customer_id
      WHERE ${where}
    `)
    .get(...values) as { count: number };

  const rows = db
    .prepare(`
      SELECT customer_payments.id,
             customer_payments.payment_number AS paymentNumber,
             customer_payments.customer_id AS customerId,
             customers.company_name AS customerName,
             customer_payments.payment_date AS paymentDate,
             customer_payments.amount_minor AS amountMinor,
             customer_payments.unallocated_amount_minor AS unallocatedAmountMinor,
             customer_payments.status,
             customer_payments.reversed_at AS reversedAt,
             customer_payments.safe_id AS safeId,
             safes.name AS safeName,
             customer_payments.payment_method_id AS paymentMethodId,
             payment_methods.name AS paymentMethodName,
             customer_payments.notes,
             customer_payments.created_at AS createdAt
      FROM customer_payments
      JOIN customers ON customers.id = customer_payments.customer_id
      JOIN safes ON safes.id = customer_payments.safe_id
      LEFT JOIN payment_methods ON payment_methods.id = customer_payments.payment_method_id
      WHERE ${where}
      ORDER BY customer_payments.payment_date DESC, customer_payments.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

customerPaymentsRouter.get("/customer-payments/:id", (req, res) => {
  const db = getDatabase();
  const payment = db
    .prepare(`
      SELECT customer_payments.id,
             customer_payments.payment_number AS paymentNumber,
             customer_payments.customer_id AS customerId,
             customers.company_name AS customerName,
             customer_payments.payment_date AS paymentDate,
             customer_payments.amount_minor AS amountMinor,
             customer_payments.unallocated_amount_minor AS unallocatedAmountMinor,
             customer_payments.status,
             customer_payments.reversed_at AS reversedAt,
             customer_payments.reversal_notes AS reversalNotes,
             customer_payments.safe_id AS safeId,
             safes.name AS safeName,
             customer_payments.payment_method_id AS paymentMethodId,
             payment_methods.name AS paymentMethodName,
             customer_payments.notes,
             customer_payments.created_at AS createdAt
      FROM customer_payments
      JOIN customers ON customers.id = customer_payments.customer_id
      JOIN safes ON safes.id = customer_payments.safe_id
      LEFT JOIN payment_methods ON payment_methods.id = customer_payments.payment_method_id
      WHERE customer_payments.id = ?
    `)
    .get(req.params.id);

  if (!payment) {
    res.status(404).json({ statusCode: 404, message: "Payment not found" });
    return;
  }

  const allocations = db
    .prepare(`
      SELECT customer_payment_allocations.id,
             customer_payment_allocations.sales_invoice_id AS salesInvoiceId,
             sales_invoices.invoice_number AS invoiceNumber,
             customer_payment_allocations.allocated_amount_minor AS allocatedAmountMinor
      FROM customer_payment_allocations
      JOIN sales_invoices ON sales_invoices.id = customer_payment_allocations.sales_invoice_id
      WHERE customer_payment_allocations.payment_id = ?
    `)
    .all(req.params.id);

  res.json({ data: { ...payment, allocations } });
});

customerPaymentsRouter.post("/customer-payments", (req: AuthenticatedRequest, res) => {
  const parsed = paymentSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid payment data" });
    return;
  }

  const db = getDatabase();

  try {
    const result = createCustomerPayment(db, {
      ...parsed.data,
      createdBy: req.user?.id
    });
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create payment";
    const statusCode =
      message.includes("Insufficient") || message.includes("exceeds") ? 409 : 400;
    res.status(statusCode).json({ statusCode, message });
  }
});

customerPaymentsRouter.post("/customer-payments/:id/reverse", (req: AuthenticatedRequest, res) => {
  const parsed = reversalSchema.safeParse(req.body ?? {});

  if (!parsed.success) {
    res.status(400).json({ statusCode: 400, message: "Invalid reversal data" });
    return;
  }

  const db = getDatabase();

  try {
    const result = reverseCustomerPayment(db, {
      customerPaymentId: String(req.params.id),
      reversalDate: parsed.data.reversalDate ?? new Date().toISOString().slice(0, 10),
      notes: parsed.data.notes ?? null,
      createdBy: req.user?.id
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reverse payment";
    const statusCode = message.includes("not found")
      ? 404
      : message.includes("Insufficient")
        ? 409
        : 400;
    res.status(statusCode).json({ statusCode, message });
  }
});
