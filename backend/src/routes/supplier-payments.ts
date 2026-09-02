import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { createSupplierPayment } from "../services/purchasing.js";
import { isoDateSchema } from "../utils/date.js";
import {
  likePattern,
  paginatedResponse,
  parsePagination,
} from "../utils/pagination.js";

export const supplierPaymentsRouter = Router();

const allocationSchema = z.object({
  materialReceivingId: z.string().trim().min(1),
  allocatedAmount: z.number().positive(),
});

const paymentSchema = z.object({
  supplierId: z.string().trim().min(1),
  paymentDate: isoDateSchema,
  amount: z.number().positive(),
  paymentMethodId: z.string().trim().min(1).optional().nullable(),
  safeId: z.string().trim().min(1),
  notes: z.string().trim().optional().nullable(),
  allocations: z.array(allocationSchema).optional(),
});

supplierPaymentsRouter.use(requireAuth);

supplierPaymentsRouter.get("/supplier-payments", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(supplier_payments.payment_number LIKE ? ESCAPE '\\' OR suppliers.name LIKE ? ESCAPE '\\')",
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern);
  }

  const supplierId =
    typeof req.query.supplierId === "string" ? req.query.supplierId.trim() : "";
  if (supplierId) {
    conditions.push("supplier_payments.supplier_id = ?");
    values.push(supplierId);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM supplier_payments
      JOIN suppliers ON suppliers.id = supplier_payments.supplier_id
      WHERE ${where}
    `,
    )
    .get(...values) as { count: number };

  const rows = db
    .prepare(
      `
      SELECT supplier_payments.id,
             supplier_payments.payment_number AS paymentNumber,
             supplier_payments.supplier_id AS supplierId,
             suppliers.name AS supplierName,
             supplier_payments.payment_date AS paymentDate,
             supplier_payments.amount_minor AS amountMinor,
             supplier_payments.unallocated_amount_minor AS unallocatedAmountMinor,
             supplier_payments.safe_id AS safeId,
             safes.name AS safeName,
             supplier_payments.payment_method_id AS paymentMethodId,
             payment_methods.name AS paymentMethodName,
             supplier_payments.notes,
             supplier_payments.created_at AS createdAt
      FROM supplier_payments
      JOIN suppliers ON suppliers.id = supplier_payments.supplier_id
      JOIN safes ON safes.id = supplier_payments.safe_id
      LEFT JOIN payment_methods ON payment_methods.id = supplier_payments.payment_method_id
      WHERE ${where}
      ORDER BY supplier_payments.payment_date DESC, supplier_payments.created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

supplierPaymentsRouter.get("/supplier-payments/:id", (req, res) => {
  const db = getDatabase();
  const payment = db
    .prepare(
      `
      SELECT supplier_payments.id,
             supplier_payments.payment_number AS paymentNumber,
             supplier_payments.supplier_id AS supplierId,
             suppliers.name AS supplierName,
             supplier_payments.payment_date AS paymentDate,
             supplier_payments.amount_minor AS amountMinor,
             supplier_payments.unallocated_amount_minor AS unallocatedAmountMinor,
             supplier_payments.safe_id AS safeId,
             safes.name AS safeName,
             supplier_payments.payment_method_id AS paymentMethodId,
             payment_methods.name AS paymentMethodName,
             supplier_payments.notes,
             supplier_payments.created_at AS createdAt
      FROM supplier_payments
      JOIN suppliers ON suppliers.id = supplier_payments.supplier_id
      JOIN safes ON safes.id = supplier_payments.safe_id
      LEFT JOIN payment_methods ON payment_methods.id = supplier_payments.payment_method_id
      WHERE supplier_payments.id = ?
    `,
    )
    .get(req.params.id);

  if (!payment) {
    res.status(404).json({ statusCode: 404, message: "Payment not found" });
    return;
  }

  const allocations = db
    .prepare(
      `
      SELECT supplier_payment_allocations.id,
             supplier_payment_allocations.material_receiving_id AS materialReceivingId,
             material_receivings.receiving_number AS receivingNumber,
             supplier_payment_allocations.allocated_amount_minor AS allocatedAmountMinor
      FROM supplier_payment_allocations
      JOIN material_receivings
        ON material_receivings.id = supplier_payment_allocations.material_receiving_id
      WHERE supplier_payment_allocations.payment_id = ?
    `,
    )
    .all(req.params.id);

  res.json({ data: { ...payment, allocations } });
});

supplierPaymentsRouter.post(
  "/supplier-payments",
  (req: AuthenticatedRequest, res) => {
    const parsed = paymentSchema.safeParse(req.body);

    if (!parsed.success) {
      res
        .status(400)
        .json({ statusCode: 400, message: "Invalid payment data" });
      return;
    }

    const db = getDatabase();

    try {
      const result = createSupplierPayment(db, {
        ...parsed.data,
        createdBy: req.user?.id,
      });

      res.status(201).json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create payment";
      const statusCode =
        message.includes("Insufficient") || message.includes("exceeds")
          ? 409
          : 400;

      res.status(statusCode).json({ statusCode, message });
    }
  },
);
