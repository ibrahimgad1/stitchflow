import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import {
  cancelSalesInvoice,
  confirmSalesInvoice,
  createSalesInvoice,
  updateSalesInvoice,
} from "../services/sales.js";
import { isoDateSchema } from "../utils/date.js";
import {
  likePattern,
  paginatedResponse,
  parsePagination,
} from "../utils/pagination.js";

export const salesInvoicesRouter = Router();

const invoiceItemSchema = z.object({
  modelVariantId: z.string().trim().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  notes: z.string().trim().optional().nullable(),
});

const invoiceSchema = z.object({
  customerId: z.string().trim().min(1),
  invoiceDate: isoDateSchema,
  dueDate: isoDateSchema.optional().nullable(),
  discountAmount: z.number().min(0).optional(),
  notes: z.string().trim().optional().nullable(),
  items: z.array(invoiceItemSchema).min(1),
  confirm: z.boolean().optional(),
});

salesInvoicesRouter.use(requireAuth);

salesInvoicesRouter.get("/sales-invoices", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(sales_invoices.invoice_number LIKE ? ESCAPE '\\' OR customers.company_name LIKE ? ESCAPE '\\')",
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern);
  }

  const customerId =
    typeof req.query.customerId === "string" ? req.query.customerId.trim() : "";
  if (customerId) {
    conditions.push("sales_invoices.customer_id = ?");
    values.push(customerId);
  }

  const status =
    typeof req.query.status === "string" ? req.query.status.trim() : "";
  if (status) {
    conditions.push("sales_invoices.status = ?");
    values.push(status);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM sales_invoices
      JOIN customers ON customers.id = sales_invoices.customer_id
      WHERE ${where}
    `,
    )
    .get(...values) as { count: number };

  const rows = db
    .prepare(
      `
      SELECT sales_invoices.id,
             sales_invoices.invoice_number AS invoiceNumber,
             sales_invoices.customer_id AS customerId,
             customers.company_name AS customerName,
             sales_invoices.invoice_date AS invoiceDate,
             sales_invoices.due_date AS dueDate,
             sales_invoices.status,
             sales_invoices.subtotal_minor AS subtotalMinor,
             sales_invoices.discount_minor AS discountMinor,
             sales_invoices.total_minor AS totalMinor,
             sales_invoices.paid_minor AS paidMinor,
             sales_invoices.remaining_minor AS remainingMinor,
             sales_invoices.cost_of_goods_minor AS costOfGoodsMinor,
             sales_invoices.gross_profit_minor AS grossProfitMinor,
             sales_invoices.notes,
             sales_invoices.created_at AS createdAt
      FROM sales_invoices
      JOIN customers ON customers.id = sales_invoices.customer_id
      WHERE ${where}
      ORDER BY sales_invoices.invoice_date DESC, sales_invoices.created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

salesInvoicesRouter.get("/customers/:id/sales-invoices", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const openOnly = req.query.openOnly !== "false";
  const conditions = ["sales_invoices.customer_id = ?"];
  const values: Array<string | number> = [req.params.id];

  if (openOnly) {
    conditions.push("sales_invoices.status = 'confirmed'");
    conditions.push("sales_invoices.remaining_minor > 0");
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM sales_invoices WHERE ${where}`)
    .get(...values) as { count: number };

  const rows = db
    .prepare(
      `
      SELECT id, invoice_number AS invoiceNumber, customer_id AS customerId,
             invoice_date AS invoiceDate, due_date AS dueDate, status,
             total_minor AS totalMinor, paid_minor AS paidMinor,
             remaining_minor AS remainingMinor
      FROM sales_invoices
      WHERE ${where}
      ORDER BY invoice_date ASC, created_at ASC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

salesInvoicesRouter.get("/sales-invoices/:id", (req, res) => {
  const db = getDatabase();
  const invoice = db
    .prepare(
      `
      SELECT sales_invoices.id,
             sales_invoices.invoice_number AS invoiceNumber,
             sales_invoices.customer_id AS customerId,
             customers.company_name AS customerName,
             sales_invoices.invoice_date AS invoiceDate,
             sales_invoices.due_date AS dueDate,
             sales_invoices.status,
             sales_invoices.subtotal_minor AS subtotalMinor,
             sales_invoices.discount_minor AS discountMinor,
             sales_invoices.total_minor AS totalMinor,
             sales_invoices.paid_minor AS paidMinor,
             sales_invoices.remaining_minor AS remainingMinor,
             sales_invoices.cost_of_goods_minor AS costOfGoodsMinor,
             sales_invoices.gross_profit_minor AS grossProfitMinor,
             sales_invoices.notes,
             sales_invoices.created_at AS createdAt
      FROM sales_invoices
      JOIN customers ON customers.id = sales_invoices.customer_id
      WHERE sales_invoices.id = ?
    `,
    )
    .get(req.params.id);

  if (!invoice) {
    res
      .status(404)
      .json({ statusCode: 404, message: "Sales invoice not found" });
    return;
  }

  const items = db
    .prepare(
      `
      SELECT sales_invoice_items.id,
             sales_invoice_items.model_variant_id AS modelVariantId,
             models.model_code AS modelCode,
             models.model_name AS modelName,
             sizes.name AS sizeName,
             colors.name AS colorName,
             sales_invoice_items.quantity,
             sales_invoice_items.unit_price_minor AS unitPriceMinor,
             sales_invoice_items.total_minor AS totalMinor,
             sales_invoice_items.unit_cost_minor AS unitCostMinor,
             sales_invoice_items.total_cost_minor AS totalCostMinor,
             sales_invoice_items.notes
      FROM sales_invoice_items
      JOIN model_variants ON model_variants.id = sales_invoice_items.model_variant_id
      JOIN models ON models.id = model_variants.model_id
      JOIN sizes ON sizes.id = model_variants.size_id
      JOIN colors ON colors.id = model_variants.color_id
      WHERE sales_invoice_items.sales_invoice_id = ?
    `,
    )
    .all(req.params.id);

  res.json({ data: { ...invoice, items } });
});

salesInvoicesRouter.post(
  "/sales-invoices",
  (req: AuthenticatedRequest, res) => {
    const parsed = invoiceSchema.safeParse(req.body);

    if (!parsed.success) {
      res
        .status(400)
        .json({ statusCode: 400, message: "Invalid sales invoice data" });
      return;
    }

    if (parsed.data.confirm && req.user?.role !== "admin") {
      res
        .status(403)
        .json({
          statusCode: 403,
          message: "Only administrators can confirm sales invoices",
        });
      return;
    }

    const db = getDatabase();

    try {
      const created = createSalesInvoice(db, {
        ...parsed.data,
        createdBy: req.user?.id,
      });
      if (parsed.data.confirm) {
        const confirmed = confirmSalesInvoice(db, {
          salesInvoiceId: created.id,
          confirmedBy: req.user?.id,
        });
        res.status(201).json({ ...created, ...confirmed });
        return;
      }

      res.status(201).json(created);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not create sales invoice";
      const statusCode =
        message.includes("Insufficient") || message.includes("exceed")
          ? 409
          : 400;
      res.status(statusCode).json({ statusCode, message });
    }
  },
);

salesInvoicesRouter.put("/sales-invoices/:id", (req, res) => {
  const parsed = invoiceSchema.omit({ confirm: true }).safeParse(req.body);

  if (!parsed.success) {
    res
      .status(400)
      .json({ statusCode: 400, message: "Invalid sales invoice data" });
    return;
  }

  const db = getDatabase();

  try {
    const result = updateSalesInvoice(db, {
      salesInvoiceId: String(req.params.id),
      ...parsed.data,
    });
    res.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update sales invoice";
    const statusCode = message.includes("not found") ? 404 : 400;
    res.status(statusCode).json({ statusCode, message });
  }
});

salesInvoicesRouter.post(
  "/sales-invoices/:id/confirm",
  requireRole("admin"),
  (req: AuthenticatedRequest, res) => {
    const db = getDatabase();

    try {
      const result = confirmSalesInvoice(db, {
        salesInvoiceId: String(req.params.id),
        confirmedBy: req.user?.id,
      });
      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not confirm sales invoice";
      const statusCode = message.includes("not found")
        ? 404
        : message.includes("Insufficient")
          ? 409
          : 400;
      res.status(statusCode).json({ statusCode, message });
    }
  },
);

salesInvoicesRouter.post(
  "/sales-invoices/:id/cancel",
  requireRole("admin"),
  (req: AuthenticatedRequest, res) => {
    const db = getDatabase();

    try {
      const result = cancelSalesInvoice(db, {
        salesInvoiceId: String(req.params.id),
        cancelledBy: req.user?.id,
      });
      res.json(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not cancel sales invoice";
      const statusCode = message.includes("not found")
        ? 404
        : message.includes("Paid")
          ? 409
          : 400;
      res.status(statusCode).json({ statusCode, message });
    }
  },
);
