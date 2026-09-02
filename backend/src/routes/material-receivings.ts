import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { createMaterialReceiving } from "../services/purchasing.js";
import { isoDateSchema } from "../utils/date.js";
import {
  likePattern,
  paginatedResponse,
  parsePagination,
} from "../utils/pagination.js";

export const materialReceivingsRouter = Router();

const receivingItemSchema = z.object({
  materialId: z.string().trim().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  notes: z.string().trim().optional().nullable(),
});

const receivingSchema = z.object({
  supplierId: z.string().trim().min(1),
  receivingDate: isoDateSchema,
  dueDate: isoDateSchema.optional().nullable(),
  documentReference: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  items: z.array(receivingItemSchema).min(1),
  paidAmount: z.number().min(0).optional(),
  safeId: z.string().trim().min(1).optional().nullable(),
  paymentMethodId: z.string().trim().min(1).optional().nullable(),
});

materialReceivingsRouter.use(requireAuth);

materialReceivingsRouter.get("/material-receivings", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(material_receivings.receiving_number LIKE ? ESCAPE '\\' OR suppliers.name LIKE ? ESCAPE '\\')",
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern);
  }

  const supplierId =
    typeof req.query.supplierId === "string" ? req.query.supplierId.trim() : "";
  if (supplierId) {
    conditions.push("material_receivings.supplier_id = ?");
    values.push(supplierId);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM material_receivings
      JOIN suppliers ON suppliers.id = material_receivings.supplier_id
      WHERE ${where}
    `,
    )
    .get(...values) as { count: number };

  const rows = db
    .prepare(
      `
      SELECT material_receivings.id,
             material_receivings.receiving_number AS receivingNumber,
             material_receivings.supplier_id AS supplierId,
             suppliers.name AS supplierName,
             material_receivings.receiving_date AS receivingDate,
             material_receivings.due_date AS dueDate,
             material_receivings.document_reference AS documentReference,
             material_receivings.total_minor AS totalMinor,
             material_receivings.paid_minor AS paidMinor,
             material_receivings.remaining_minor AS remainingMinor,
             material_receivings.status,
             material_receivings.notes,
             material_receivings.created_at AS createdAt
      FROM material_receivings
      JOIN suppliers ON suppliers.id = material_receivings.supplier_id
      WHERE ${where}
      ORDER BY material_receivings.receiving_date DESC, material_receivings.created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

materialReceivingsRouter.get("/material-receivings/:id", (req, res) => {
  const db = getDatabase();
  const receiving = db
    .prepare(
      `
      SELECT material_receivings.id,
             material_receivings.receiving_number AS receivingNumber,
             material_receivings.supplier_id AS supplierId,
             suppliers.name AS supplierName,
             material_receivings.receiving_date AS receivingDate,
             material_receivings.due_date AS dueDate,
             material_receivings.document_reference AS documentReference,
             material_receivings.total_minor AS totalMinor,
             material_receivings.paid_minor AS paidMinor,
             material_receivings.remaining_minor AS remainingMinor,
             material_receivings.status,
             material_receivings.notes,
             material_receivings.created_at AS createdAt
      FROM material_receivings
      JOIN suppliers ON suppliers.id = material_receivings.supplier_id
      WHERE material_receivings.id = ?
    `,
    )
    .get(req.params.id);

  if (!receiving) {
    res.status(404).json({ statusCode: 404, message: "Receiving not found" });
    return;
  }

  const items = db
    .prepare(
      `
      SELECT material_receiving_items.id,
             material_receiving_items.material_id AS materialId,
             materials.name AS materialName,
             material_receiving_items.quantity,
             material_receiving_items.unit_price_minor AS unitPriceMinor,
             material_receiving_items.total_minor AS totalMinor,
             material_receiving_items.notes
      FROM material_receiving_items
      JOIN materials ON materials.id = material_receiving_items.material_id
      WHERE material_receiving_items.receiving_id = ?
    `,
    )
    .all(req.params.id);

  res.json({ data: { ...receiving, items } });
});

materialReceivingsRouter.post(
  "/material-receivings",
  (req: AuthenticatedRequest, res) => {
    const parsed = receivingSchema.safeParse(req.body);

    if (!parsed.success) {
      res
        .status(400)
        .json({ statusCode: 400, message: "Invalid receiving data" });
      return;
    }

    const db = getDatabase();

    try {
      const result = createMaterialReceiving(db, {
        ...parsed.data,
        createdBy: req.user?.id,
      });

      res.status(201).json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create receiving";
      const statusCode =
        message.includes("not found") ||
        message.includes("required") ||
        message.includes("cannot exceed")
          ? 400
          : message.includes("Insufficient")
            ? 409
            : 400;

      res.status(statusCode).json({ statusCode, message });
    }
  },
);
