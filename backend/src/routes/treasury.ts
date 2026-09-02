import { Router } from "express";
import { z } from "zod";
import { getDatabase } from "../database/connection.js";
import {
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import {
  adjustSafeBalance,
  createCapitalTransaction,
  createSafeTransfer,
} from "../services/treasury.js";
import { isoDateSchema } from "../utils/date.js";
import {
  likePattern,
  paginatedResponse,
  parsePagination,
} from "../utils/pagination.js";

export const treasuryRouter = Router();

const transferSchema = z.object({
  transferDate: isoDateSchema,
  fromSafeId: z.string().trim().min(1),
  toSafeId: z.string().trim().min(1),
  amount: z.number().positive(),
  notes: z.string().trim().optional().nullable(),
});

const adjustmentSchema = z.object({
  adjustmentDate: isoDateSchema,
  newBalance: z.number().min(0),
  reason: z.string().trim().min(1),
});

const capitalTransactionSchema = z.object({
  transactionDate: isoDateSchema,
  transactionType: z.enum(["capital_injection", "owner_withdrawal"]),
  ownerId: z.string().trim().min(1).optional().nullable(),
  safeId: z.string().trim().min(1),
  amount: z.number().positive(),
  notes: z.string().trim().optional().nullable(),
});

treasuryRouter.use(requireAuth);

treasuryRouter.get("/treasury/report", (req, res) => {
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  const dateFrom =
    typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
  const dateTo =
    typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";

  if (dateFrom) {
    conditions.push("safe_transactions.transaction_date >= ?");
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push("safe_transactions.transaction_date <= ?");
    values.push(dateTo);
  }

  const where = conditions.join(" AND ");
  const movementTotals = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_minor ELSE 0 END), 0) AS inflowMinor,
        COALESCE(SUM(CASE WHEN direction = 'out' THEN amount_minor ELSE 0 END), 0) AS outflowMinor
      FROM safe_transactions
      WHERE ${where}
    `,
    )
    .get(...values) as { inflowMinor: number; outflowMinor: number };

  const safeTotals = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(current_balance_minor), 0) AS totalSafeBalanceMinor,
        COUNT(*) AS safeCount
      FROM safes
      WHERE is_active = 1
    `,
    )
    .get() as { totalSafeBalanceMinor: number; safeCount: number };

  const bySafe = db
    .prepare(
      `
      SELECT safes.id AS safeId,
             safes.name AS safeName,
             safes.current_balance_minor AS currentBalanceMinor,
             COALESCE(SUM(CASE WHEN safe_transactions.direction = 'in' THEN safe_transactions.amount_minor ELSE 0 END), 0) AS inflowMinor,
             COALESCE(SUM(CASE WHEN safe_transactions.direction = 'out' THEN safe_transactions.amount_minor ELSE 0 END), 0) AS outflowMinor
      FROM safes
      LEFT JOIN safe_transactions
        ON safe_transactions.safe_id = safes.id
       AND ${where}
      WHERE safes.is_active = 1
      GROUP BY safes.id, safes.name, safes.current_balance_minor
      ORDER BY safes.name ASC
    `,
    )
    .all(...values) as Array<{
    safeId: string;
    safeName: string;
    currentBalanceMinor: number;
    inflowMinor: number;
    outflowMinor: number;
  }>;

  res.json({
    data: {
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      totalSafeBalanceMinor: safeTotals.totalSafeBalanceMinor,
      safeCount: safeTotals.safeCount,
      inflowMinor: movementTotals.inflowMinor,
      outflowMinor: movementTotals.outflowMinor,
      netMovementMinor:
        movementTotals.inflowMinor - movementTotals.outflowMinor,
      bySafe: bySafe.map((row) => ({
        ...row,
        netMovementMinor: row.inflowMinor - row.outflowMinor,
      })),
    },
  });
});

treasuryRouter.get("/treasury/reconcile", (_req, res) => {
  const db = getDatabase();
  const safes = db
    .prepare(
      "SELECT id, name, opening_balance_minor AS opening, current_balance_minor AS current FROM safes WHERE is_active=1",
    )
    .all() as Array<{
    id: string;
    name: string;
    opening: number;
    current: number;
  }>;
  const result = safes.map((s) => {
    const agg = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount_minor ELSE -amount_minor END),0) as net FROM safe_transactions WHERE safe_id=?`,
      )
      .get(s.id) as { net: number };
    const expected = s.opening + agg.net;
    return {
      safeId: s.id,
      safeName: s.name,
      openingMinor: s.opening,
      currentMinor: s.current,
      expectedMinor: expected,
      diffMinor: s.current - expected,
      isBalanced: s.current === expected,
    };
  });
  res.json({ data: result });
});

treasuryRouter.get("/safe-transactions", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(safes.name LIKE ? ESCAPE '\\' OR safe_transactions.description LIKE ? ESCAPE '\\' OR safe_transactions.source_type LIKE ? ESCAPE '\\')",
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern);
  }

  const safeId =
    typeof req.query.safeId === "string" ? req.query.safeId.trim() : "";
  if (safeId) {
    conditions.push("safe_transactions.safe_id = ?");
    values.push(safeId);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM safe_transactions
      JOIN safes ON safes.id = safe_transactions.safe_id
      WHERE ${where}
    `,
    )
    .get(...values) as { count: number };

  const rows = db
    .prepare(
      `
      SELECT safe_transactions.id,
             safe_transactions.safe_id AS safeId,
             safes.name AS safeName,
             safe_transactions.transaction_date AS transactionDate,
             safe_transactions.transaction_type AS transactionType,
             safe_transactions.source_type AS sourceType,
             safe_transactions.source_id AS sourceId,
             safe_transactions.direction,
             safe_transactions.amount_minor AS amountMinor,
             safe_transactions.balance_after_minor AS balanceAfterMinor,
             safe_transactions.description,
             safe_transactions.created_at AS createdAt
      FROM safe_transactions
      JOIN safes ON safes.id = safe_transactions.safe_id
      WHERE ${where}
      ORDER BY safe_transactions.transaction_date DESC, safe_transactions.created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

treasuryRouter.get("/safe-transfers", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(safe_transfers.transfer_number LIKE ? ESCAPE '\\' OR from_safe.name LIKE ? ESCAPE '\\' OR to_safe.name LIKE ? ESCAPE '\\')",
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM safe_transfers
      JOIN safes from_safe ON from_safe.id = safe_transfers.from_safe_id
      JOIN safes to_safe ON to_safe.id = safe_transfers.to_safe_id
      WHERE ${where}
    `,
    )
    .get(...values) as { count: number };

  const rows = db
    .prepare(
      `
      SELECT safe_transfers.id,
             safe_transfers.transfer_number AS transferNumber,
             safe_transfers.transfer_date AS transferDate,
             safe_transfers.from_safe_id AS fromSafeId,
             from_safe.name AS fromSafeName,
             safe_transfers.to_safe_id AS toSafeId,
             to_safe.name AS toSafeName,
             safe_transfers.amount_minor AS amountMinor,
             safe_transfers.notes,
             safe_transfers.created_at AS createdAt
      FROM safe_transfers
      JOIN safes from_safe ON from_safe.id = safe_transfers.from_safe_id
      JOIN safes to_safe ON to_safe.id = safe_transfers.to_safe_id
      WHERE ${where}
      ORDER BY safe_transfers.transfer_date DESC, safe_transfers.created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

treasuryRouter.get("/capital-transactions", (req, res) => {
  const params = parsePagination(req);
  const db = getDatabase();
  const conditions = ["1 = 1"];
  const values: Array<string | number> = [];

  if (params.search) {
    conditions.push(
      "(owners.name LIKE ? ESCAPE '\\' OR safes.name LIKE ? ESCAPE '\\' OR capital_transactions.notes LIKE ? ESCAPE '\\')",
    );
    const pattern = likePattern(params.search);
    values.push(pattern, pattern, pattern);
  }

  const transactionType =
    typeof req.query.transactionType === "string"
      ? req.query.transactionType.trim()
      : "";
  if (transactionType) {
    conditions.push("capital_transactions.transaction_type = ?");
    values.push(transactionType);
  }

  const where = conditions.join(" AND ");
  const total = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM capital_transactions
      LEFT JOIN owners ON owners.id = capital_transactions.owner_id
      JOIN safes ON safes.id = capital_transactions.safe_id
      WHERE ${where}
    `,
    )
    .get(...values) as { count: number };

  const rows = db
    .prepare(
      `
      SELECT capital_transactions.id,
             capital_transactions.transaction_date AS transactionDate,
             capital_transactions.transaction_type AS transactionType,
             capital_transactions.owner_id AS ownerId,
             owners.name AS ownerName,
             capital_transactions.safe_id AS safeId,
             safes.name AS safeName,
             capital_transactions.amount_minor AS amountMinor,
             capital_transactions.notes,
             capital_transactions.created_at AS createdAt
      FROM capital_transactions
      LEFT JOIN owners ON owners.id = capital_transactions.owner_id
      JOIN safes ON safes.id = capital_transactions.safe_id
      WHERE ${where}
      ORDER BY capital_transactions.transaction_date DESC, capital_transactions.created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...values, params.pageSize, (params.page - 1) * params.pageSize);

  res.json(paginatedResponse(rows, total.count, params));
});

treasuryRouter.post(
  "/safe-transfers",
  requireRole("admin"),
  (req: AuthenticatedRequest, res) => {
    const parsed = transferSchema.safeParse(req.body);

    if (!parsed.success) {
      res
        .status(400)
        .json({ statusCode: 400, message: "Invalid transfer data" });
      return;
    }

    const db = getDatabase();

    try {
      const result = createSafeTransfer(db, {
        ...parsed.data,
        createdBy: req.user?.id,
      });
      res.status(201).json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create transfer";
      const statusCode = message.includes("Insufficient") ? 409 : 400;
      res.status(statusCode).json({ statusCode, message });
    }
  },
);

treasuryRouter.post(
  "/safes/:id/adjustments",
  requireRole("admin"),
  (req: AuthenticatedRequest, res) => {
    const parsed = adjustmentSchema.safeParse(req.body);

    if (!parsed.success) {
      res
        .status(400)
        .json({ statusCode: 400, message: "Invalid adjustment data" });
      return;
    }

    const db = getDatabase();

    try {
      const result = adjustSafeBalance(db, {
        safeId: String(req.params.id),
        ...parsed.data,
        createdBy: req.user?.id,
      });
      res.status(201).json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not adjust safe";
      const statusCode = message.includes("not found") ? 404 : 400;
      res.status(statusCode).json({ statusCode, message });
    }
  },
);

treasuryRouter.post(
  "/capital-transactions",
  requireRole("admin"),
  (req: AuthenticatedRequest, res) => {
    const parsed = capitalTransactionSchema.safeParse(req.body);

    if (!parsed.success) {
      res
        .status(400)
        .json({ statusCode: 400, message: "Invalid capital transaction data" });
      return;
    }

    const db = getDatabase();

    try {
      const result = createCapitalTransaction(db, {
        ...parsed.data,
        createdBy: req.user?.id,
      });
      res.status(201).json(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not create capital transaction";
      const statusCode = message.includes("Insufficient") ? 409 : 400;
      res.status(statusCode).json({ statusCode, message });
    }
  },
);
